const nodemailer = require('nodemailer');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { requireCronSecret, enforceRateLimit, writeAuditLog } = require('../lib/security.js');

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function recipientMatches(record, publication) {
  if (!publication.target_type || publication.target_type === 'ALL') return true;
  const targets = (publication.target_list || []).map(normalize).filter(Boolean);
  const identities = [record.nama_karyawan, record.nama, record.username, record.nik_karyawan, record.nik].map(normalize).filter(Boolean);
  return targets.some(target => identities.some(identity => target === identity || (identity.length > 3 && (target.includes(identity) || identity.includes(target)))));
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function buildEmail(publication) {
  const category = String(publication.kategori_informasi || 'INFORMASI').replace(/_/g, ' ');
  const attachment = publication.lampiran_url
    ? `<p style="margin:20px 0"><a href="${escapeHtml(publication.lampiran_url)}" style="display:inline-block;background:#7a1f2b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:700">Buka ${escapeHtml(publication.lampiran_nama || 'lampiran')}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><div style="height:7px;background:#7a1f2b"></div><div style="padding:28px"><span style="font-size:11px;font-weight:800;color:#7a1f2b;letter-spacing:.12em">${escapeHtml(category)}</span><h1 style="font-size:24px;line-height:1.3;margin:10px 0 8px">${escapeHtml(publication.judul)}</h1><p style="font-size:13px;color:#64748b;margin:0 0 20px">Dibagikan oleh ${escapeHtml(publication.dibuat_oleh || 'HRD')}</p><div style="font-size:14px;line-height:1.75">${publication.isi || ''}</div>${attachment}<p style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:18px;margin-top:24px">Informasi resmi melalui HRIS Andela Jaya.</p></div></div></body></html>`;
}

async function claimPublication(db, ref, now) {
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data.kirim_email_terjadwal || data.email_sent_at) return null;
    const dueAt = new Date(data.jadwal_email || 0);
    if (Number.isNaN(dueAt.getTime()) || dueAt > now) return null;
    const previousClaim = data.email_sending_at ? new Date(data.email_sending_at).getTime() : 0;
    if (previousClaim && now.getTime() - previousClaim < 15 * 60_000) return null;
    transaction.set(ref, { email_status: 'DIPROSES', email_sending_at: now.toISOString() }, { merge: true });
    return { id: snap.id, ...data };
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'cron-informasi', limit: 5, windowMs: 60_000 })) return;
  if (!requireCronSecret(req, res)) return;

  const { db, error } = getFirebaseAdmin();
  if (!db) return res.status(503).json({ success: false, error: error || 'Firebase Admin belum tersedia.' });
  const results = [];
  try {
    const [publicationSnap, employeeSnap, userSnap] = await Promise.all([
      db.collection('broadcast').where('kirim_email_terjadwal', '==', true).get(),
      db.collection('master_karyawan').get(),
      db.collection('users').get()
    ]);
    const people = [...employeeSnap.docs, ...userSnap.docs].map(doc => ({ id: doc.id, ...doc.data() }));
    const now = new Date();

    for (const candidate of publicationSnap.docs) {
      const ref = db.collection('broadcast').doc(candidate.id);
      const publication = await claimPublication(db, ref, now);
      if (!publication) continue;
      try {
        const recipients = [...new Set(people.filter(person => recipientMatches(person, publication)).map(person => normalize(person.email)).filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
        if (!recipients.length) throw new Error('Tidak ada alamat email penerima yang valid.');
        const deliveries = [];
        for (const group of chunk(recipients, 50)) {
          const info = await getTransporter().sendMail({
            from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            bcc: group,
            subject: `[Informasi HRIS] ${publication.judul}`,
            html: buildEmail(publication)
          });
          deliveries.push(info.messageId);
        }
        await ref.set({ kirim_email_terjadwal: false, email_status: 'TERKIRIM', email_sent_at: new Date().toISOString(), email_recipient_count: recipients.length, email_message_ids: deliveries, email_error: '' }, { merge: true });
        results.push({ id: publication.id, status: 'TERKIRIM', recipients: recipients.length });
      } catch (sendError) {
        await ref.set({ email_status: 'GAGAL', email_sending_at: '', email_error: String(sendError.message || sendError).slice(0, 500) }, { merge: true });
        results.push({ id: publication.id, status: 'GAGAL', error: sendError.message });
      }
    }
    await writeAuditLog(db, req, null, { action: 'CRON_INFORMATION_EMAIL', module: 'BROADCAST', metadata: { processed: results.length, sent: results.filter(item => item.status === 'TERKIRIM').length } });
    return res.status(200).json({ success: true, processed: results.length, results });
  } catch (handlerError) {
    console.error('CRASH SERVER (cron-informasi):', handlerError);
    return res.status(500).json({ success: false, error: handlerError.message });
  }
};

module.exports._test = { recipientMatches, buildEmail, chunk };
