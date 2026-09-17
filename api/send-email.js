const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { requireFirebaseAuth, requireCronSecret, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

async function isKnownRecipient(db, email) {
  const collectionsAndFields = [
    ['auth_profiles', 'email'], ['users', 'email'],
    ['master_karyawan', 'email'], ['master_karyawan', 'email_perusahaan']
  ];
  for (const [collectionName, field] of collectionsAndFields) {
    const snap = await db.collection(collectionName).where(field, '==', email).limit(1).get();
    if (!snap.empty) return true;
  }
  const cfg = await db.collection('app_settings').doc('email_branch_cuti').get();
  if (cfg.exists) {
    const data = cfg.data() || {};
    const configured = [data.default_cc];
    Object.values(data.branches || {}).forEach(branch => {
      configured.push(branch.cc);
      if (Array.isArray(branch.emails)) configured.push(...branch.emails);
    });
    if (configured.map(v => String(v || '').trim().toLowerCase()).includes(email)) return true;
  }
  return email === String(process.env.GMAIL_USER || '').trim().toLowerCase();
}

async function handleBroadcastUpload(req, res, context) {
  if (!['HRD', 'SUPERADMIN'].includes(context.user.role)) {
    return res.status(403).json({ success: false, error: 'Hanya HRD yang dapat mengunggah lampiran publikasi.' });
  }
  assertAllowedKeys(req.body || {}, ['action', 'fileName', 'mimeType', 'base64', 'publicationId']);
  const allowedTypes = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]);
  const mimeType = String(req.body?.mimeType || '').toLowerCase();
  const encoded = String(req.body?.base64 || '').replace(/\s/g, '');
  if (!allowedTypes.has(mimeType)) return res.status(400).json({ success: false, error: 'Tipe lampiran tidak didukung.' });
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return res.status(400).json({ success: false, error: 'Data lampiran tidak valid.' });
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.length > 3 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Upload langsung maksimal 3 MB.' });

  const safeName = String(req.body?.fileName || 'lampiran').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const publicationId = String(req.body?.publicationId || 'publikasi').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const objectPath = `broadcast/${publicationId}/${Date.now()}-${safeName}`;
  const downloadToken = crypto.randomUUID();
  const bucket = context.admin.storage().bucket();
  await bucket.file(objectPath).save(content, {
    resumable: false,
    contentType: mimeType,
    metadata: {
      cacheControl: 'private, max-age=3600',
      metadata: { firebaseStorageDownloadTokens: downloadToken }
    }
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
  await writeAuditLog(context.db, req, context.user, { action: 'BROADCAST_ATTACHMENT_UPLOADED', module: 'BROADCAST', recordId: publicationId, metadata: { object_path: objectPath, mime_type: mimeType, size: content.length } });
  return res.status(200).json({ success: true, url, name: safeName, mimeType, size: content.length });
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function scheduledRecipientMatches(record, publication) {
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

function buildScheduledInformationEmail(publication) {
  const category = String(publication.kategori_informasi || 'INFORMASI').replace(/_/g, ' ');
  const attachment = publication.lampiran_url
    ? `<p style="margin:20px 0"><a href="${escapeHtml(publication.lampiran_url)}" style="display:inline-block;background:#7a1f2b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:700">Buka ${escapeHtml(publication.lampiran_nama || 'lampiran')}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><div style="height:7px;background:#7a1f2b"></div><div style="padding:28px"><span style="font-size:11px;font-weight:800;color:#7a1f2b;letter-spacing:.12em">${escapeHtml(category)}</span><h1 style="font-size:24px;line-height:1.3;margin:10px 0 8px">${escapeHtml(publication.judul)}</h1><p style="font-size:13px;color:#64748b;margin:0 0 20px">Dibagikan oleh ${escapeHtml(publication.dibuat_oleh || 'HRD')}</p><div style="font-size:14px;line-height:1.75">${publication.isi || ''}</div>${attachment}<p style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:18px;margin-top:24px">Informasi resmi melalui HRIS Andela Jaya.</p></div></div></body></html>`;
}

async function claimScheduledPublication(db, ref, now) {
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

async function handleScheduledInformationEmail(req, res) {
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
      const publication = await claimScheduledPublication(db, ref, now);
      if (!publication) continue;
      try {
        const recipients = [...new Set(people.filter(person => scheduledRecipientMatches(person, publication)).map(person => normalize(person.email)).filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
        if (!recipients.length) throw new Error('Tidak ada alamat email penerima yang valid.');
        const deliveries = [];
        for (const group of chunk(recipients, 50)) {
          const info = await getTransporter().sendMail({
            from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            bcc: group,
            subject: `[Informasi HRIS] ${publication.judul}`,
            html: buildScheduledInformationEmail(publication)
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
  } catch (error) {
    console.error('CRASH SERVER (scheduled-information-email):', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return handleScheduledInformationEmail(req, res);
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');

  try {
    const context = await requireFirebaseAuth(req, res);
    if (!context) return;
    const privilegedRoles = new Set(['HRD', 'SUPERADMIN', 'GM', 'MANAGER', 'FINANCE']);
    const hourlyLimit = privilegedRoles.has(context.user.role) ? 150 : 30;
    if (!enforceRateLimit(req, res, { namespace: 'send-email', key: context.user.uid, limit: hourlyLimit, windowMs: 60 * 60_000 })) return;
    if (req.body?.action === 'upload_broadcast') return handleBroadcastUpload(req, res, context);
    assertAllowedKeys(req.body || {}, ['to', 'subject', 'htmlBody', 'cc', 'attachments']);
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: "GMAIL_USER atau GMAIL_APP_PASSWORD belum diset di Environment Variables Vercel."
      });
    }

    const { to, subject, htmlBody, cc, attachments } = req.body;

    if (!to || !subject || !htmlBody) {
      return res.status(400).json({
        success: false,
        error: "Field 'to', 'subject', dan 'htmlBody' wajib diisi."
      });
    }

    const parseEmails = value => String(value || '').split(/[;,]/).map(v => v.trim().toLowerCase()).filter(Boolean);
    const allRecipients = [...parseEmails(to), ...parseEmails(cc)];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!allRecipients.length || allRecipients.some(email => !emailPattern.test(email)) || allRecipients.length > 25) {
      return res.status(400).json({ success: false, error: 'Daftar penerima email tidak valid.' });
    }
    if (!privilegedRoles.has(context.user.role)) {
      for (const recipient of allRecipients) {
        if (!await isKnownRecipient(context.db, recipient)) {
          return res.status(403).json({ success: false, error: 'Penerima email tidak terdaftar pada sistem HRIS.' });
        }
      }
    }
    if (/\r|\n/.test(String(subject)) || String(subject).length > 180 || String(htmlBody).length > 500_000) {
      return res.status(413).json({ success: false, error: 'Isi email melebihi batas keamanan.' });
    }

    const mailOptions = {
      from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
      to: parseEmails(to),
      cc: parseEmails(cc).length ? parseEmails(cc) : undefined,
      subject: String(subject),
      html: String(htmlBody),
      disableFileAccess: true,
      disableUrlAccess: true
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      if (attachments.length > 5) return res.status(413).json({ success: false, error: 'Maksimal lima lampiran.' });
      let totalBytes = 0;
      mailOptions.attachments = attachments.map(att => {
        if (!att || !att.content || att.path) throw new Error('Lampiran harus berupa konten terenkode; path/URL tidak diizinkan.');
        const contentType = String(att.contentType || 'application/pdf').toLowerCase();
        const allowedAttachmentTypes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (!allowedAttachmentTypes.includes(contentType)) throw new Error('Tipe lampiran tidak diizinkan.');
        const content = String(att.content);
        totalBytes += Buffer.byteLength(content, 'base64');
        if (totalBytes > 10 * 1024 * 1024) throw new Error('Total lampiran melebihi 10 MB.');
        const safeFilename = String(att.filename || 'dokumen.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
        const item = { filename: safeFilename, content, encoding: 'base64', contentType };
        return item;
      });
    }

    const info = await getTransporter().sendMail(mailOptions);

    await writeAuditLog(context.db, req, context.user, {
      action: 'EMAIL_SENT', module: 'EMAIL', recordId: info.messageId,
      metadata: { recipient_count: allRecipients.length, subject: String(subject).slice(0, 180) }
    });

    res.status(200).json({ success: true, id: info.messageId });

  } catch (error) {
    console.error("CRASH SERVER (send-email):", error);
    res.status(500).json({
      success: false,
      error: "Email gagal dikirim. Silakan coba kembali atau hubungi administrator."
    });
  }
};

module.exports._test = { scheduledRecipientMatches, buildScheduledInformationEmail, chunk };
