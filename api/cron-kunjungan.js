/**
 * =====================================================================
 * CRON KUNJUNGAN LAPANGAN — PENGINGAT LAPORAN & STATUS OVERDUE
 * =====================================================================
 * Jadwal Vercel Cron (UTC → WIB):
 *   01:00 UTC = 08:00 WIB  → pengingat pagi H+1 / eskalasi berulang H+2
 *   03:05 UTC = 10:05 WIB  → penanda status OVERDUE setelah deadline
 *   09:00 UTC = 16:00 WIB  → pengingat sore di hari kunjungan selesai
 *
 * Idempoten: setiap pengiriman dicatat di `field_visit_reminder_logs`
 * dengan ID deterministik `(request, reminder_type, tanggal WIB)`.
 * Berjalan Senin–Sabtu sesuai jam operasional CV Andela Jaya.
 * =====================================================================
 */
const nodemailer = require('nodemailer');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { requireCronSecret, enforceRateLimit, writeAuditLog } = require('../lib/security.js');

const REMINDER = {
  EVENING: 'EVENING_1600',
  MORNING: 'MORNING_0800',
  OVERDUE: 'OVERDUE_ESCALATION_0800'
};
const EMAIL_FIELDS = ['email', 'email_karyawan', 'email_perusahaan', 'email_pribadi', 'email_personal', 'email_aktif', 'auth_email'];
const DAY_MS = 86400000;

let transporter = null;
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

function wibDateStr(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

function wibTimeStr(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(11, 16);
}

function toDateOnly(value) {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return wibDateStr(value.toDate());
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : wibDateStr(parsed);
}

function daysBetween(from, to) {
  const a = toDateOnly(from);
  const b = toDateOnly(to);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

function deadlinePassed(request, now) {
  if (!request.report_deadline_at) return false;
  const deadline = new Date(request.report_deadline_at);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < now.getTime();
}

function effectiveStatus(request, now) {
  const status = String(request.report_status || 'NOT_APPLICABLE').toUpperCase();
  if (status === 'SUBMITTED') return 'SUBMITTED';
  if (String(request.approval_status || '').toUpperCase() !== 'APPROVED_FINAL') return 'NOT_APPLICABLE';
  if (status === 'OVERDUE') return 'OVERDUE';
  return deadlinePassed(request, now) ? 'OVERDUE' : 'PENDING_REPORT';
}

function reminderTypeFor(request, now) {
  if (String(request.approval_status || '').toUpperCase() !== 'APPROVED_FINAL') return '';
  const status = effectiveStatus(request, now);
  if (status === 'SUBMITTED') return '';
  const today = wibDateStr(now);
  const diff = daysBetween(request.end_date, today);
  if (diff === null) return '';
  const time = wibTimeStr(now);
  if (diff === 0 && time >= '16:00') return REMINDER.EVENING;
  if (diff === 1 && time >= '08:00') return REMINDER.MORNING;
  if (diff >= 2 && time >= '08:00') return REMINDER.OVERDUE;
  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function pickEmail(...sources) {
  for (const source of sources) {
    if (!source) continue;
    for (const field of EMAIL_FIELDS) {
      const value = String(source[field] || '').trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith('@auth.andelajaya.internal')) return value;
    }
  }
  return '';
}

function formatIndoDate(value) {
  const parts = String(value || '').slice(0, 10).split('-');
  if (parts.length !== 3) return value || '-';
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${Number(parts[2])} ${months[Number(parts[1]) - 1] || parts[1]} ${parts[0]}`;
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildEmailHtml({ request, type, recipientName, appUrl }) {
  const isOverdue = type === REMINDER.OVERDUE;
  const isMorning = type === REMINDER.MORNING;
  const badge = isOverdue ? 'LAPORAN TERLAMBAT • ESKALASI' : isMorning ? 'PENGINGAT PAGI • LAPORAN KUNJUNGAN' : 'PENGINGAT SORE • LAPORAN KUNJUNGAN';
  const title = isOverdue
    ? `Laporan Kunjungan ${request.document_number || ''} Belum Diisi`
    : `Lengkapi Laporan Kunjungan ${request.document_number || ''}`;
  const intro = isOverdue
    ? `Laporan hasil kunjungan <b>${escapeHtml(request.nama_pemohon || '-')}</b> pada ${formatIndoDate(request.start_date)} sudah melewati batas waktu. Mohon segera diisi; tembusan dikirim ke HRD dan Atasan Langsung.`
    : isMorning
      ? `Laporan kunjungan kemarin (<b>${formatIndoDate(request.end_date)}</b>) belum diisi. Batas waktu adalah hari ini pukul <b>10:00 WIB</b>.`
      : `Kunjungan hari ini telah selesai. Mohon isi laporan hasil kunjungan sebelum batas waktu <b>${formatIndoDate(request.report_deadline_at)} pukul 10:00 WIB</b>.`;
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,${isOverdue ? '#9f1239' : '#7a1f2b'} 0%,#4a0e17 100%);padding:24px 28px;color:#fff">
      <div style="display:inline-block;background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:8px">${escapeHtml(badge)}</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(title)}</h1>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 10px;font-size:13.5px;color:#334155;line-height:1.6">Halo <b>${escapeHtml(recipientName || 'Bapak/Ibu')}</b>,</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#334155;line-height:1.6">${intro}</p>
      <div style="margin:18px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12.5px;color:#1e293b">
          <tr><td style="padding:9px 12px;color:#64748b;width:38%">Nomor Pengajuan</td><td style="padding:9px 12px;font-weight:600">${escapeHtml(request.document_number || '-')}</td></tr>
          <tr style="background:#fafbfd"><td style="padding:9px 12px;color:#64748b">Jenis Kunjungan</td><td style="padding:9px 12px;font-weight:600">${escapeHtml(request.visit_type === 'AUDIT_LAPANGAN' ? 'Audit Lapangan' : 'Joint Visit')}</td></tr>
          <tr><td style="padding:9px 12px;color:#64748b">Tanggal Kunjungan</td><td style="padding:9px 12px;font-weight:600">${formatIndoDate(request.start_date)}${request.end_date && request.end_date !== request.start_date ? ` s/d ${formatIndoDate(request.end_date)}` : ''}</td></tr>
          <tr style="background:#fafbfd"><td style="padding:9px 12px;color:#64748b">Pemohon</td><td style="padding:9px 12px;font-weight:600">${escapeHtml(request.nama_pemohon || '-')}</td></tr>
          <tr><td style="padding:9px 12px;color:#64748b">Batas Laporan</td><td style="padding:9px 12px;font-weight:700;color:${isOverdue ? '#9f1239' : '#1e293b'}">${formatIndoDate(request.report_deadline_at)} pukul 10:00 WIB</td></tr>
        </table>
      </div>
      <p style="margin:18px 0 0"><a href="${escapeHtml(appUrl)}/#kunjungan-lapangan?tab=laporan" style="display:inline-block;background:#7a1f2b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:700;font-size:12.5px">Isi Laporan Kunjungan →</a></p>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#64748b">Sistem HRIS &amp; Operasional CV Andela Jaya • Kunjungan Lapangan</p>
    </div>
  </div>`;
}

async function writeInAppNotif(db, person, judul, pesan, link) {
  const aliases = [person.username, person.nama, person.nik].map(v => String(v || '').trim()).filter(Boolean);
  await db.collection('notifications').add({
    username_target: String(person.username || ''),
    nama_target: String(person.nama || ''),
    nik_target: String(person.nik || ''),
    target_aliases: [...new Set(aliases.flatMap(v => [v, v.toLowerCase()]))],
    judul, pesan, link,
    dibaca: false,
    tanggal: new Date().toISOString()
  });
}

async function sendMailOnce(db, logId, mailOptions) {
  const ref = db.collection('cron_locks').doc(logId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 240));
  const maySend = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const existing = snap.exists ? snap.data() : null;
    if (existing?.status === 'SENT') return false;
    const startedAt = existing?.started_at ? new Date(existing.started_at).getTime() : 0;
    if (existing?.status === 'SENDING' && Date.now() - startedAt < 15 * 60_000) return false;
    transaction.set(ref, { status: 'SENDING', started_at: new Date().toISOString() }, { merge: true });
    return true;
  });
  if (!maySend) return { skipped: true };
  try {
    const info = await getTransporter().sendMail(mailOptions);
    await ref.set({ status: 'SENT', sent_at: new Date().toISOString(), message_id: info.messageId }, { merge: true });
    return { skipped: false, info };
  } catch (error) {
    await ref.set({ status: 'FAILED', failed_at: new Date().toISOString(), error: String(error.message || error).slice(0, 400) }, { merge: true });
    return { skipped: false, error: String(error.message || error) };
  }
}

function personFor(identity = {}, employees = [], users = []) {
  const nik = normalize(identity.nik);
  const nama = normalize(identity.nama);
  const username = normalize(identity.username);
  const employee = employees.find(row =>
    (nik && normalize(row.nik_karyawan || row.nik) === nik) ||
    (nama && normalize(row.nama_karyawan || row.nama) === nama)
  ) || {};
  const user = users.find(row =>
    (username && normalize(row.username || row.id) === username) ||
    (nik && normalize(row.nik) === nik) ||
    (nama && normalize(row.nama) === nama)
  ) || {};
  return {
    nik: String(identity.nik || employee.nik_karyawan || employee.nik || user.nik || '').trim(),
    nama: String(identity.nama || employee.nama_karyawan || employee.nama || user.nama || '').trim(),
    username: String(identity.username || user.username || user.id || '').trim(),
    email: pickEmail(user, employee)
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'cron-kunjungan', limit: 6, windowMs: 60_000 })) return;
  if (!requireCronSecret(req, res)) return;

  const { db, error } = getFirebaseAdmin();
  if (!db) return res.status(500).json({ success: false, error: error || 'Firebase Admin environment variables are not configured.' });

  try {
    const now = new Date();
    const today = wibDateStr(now);
    const appUrl = String(process.env.APP_URL || 'https://andela-hris.vercel.app').replace(/\/$/, '');
    const [requestsSnap, employeesSnap, usersSnap] = await Promise.all([
      db.collection('field_visit_requests').get(),
      db.collection('master_karyawan').get().catch(() => ({ docs: [] })),
      db.collection('users').get().catch(() => ({ docs: [] }))
    ]);
    const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const hrd = users
      .filter(user => ['HRD', 'HRGA', 'SUPERADMIN'].includes(String(user.role || '').toUpperCase()))
      .map(user => personFor({ nik: user.nik, nama: user.nama, username: user.username || user.id }, employees, users))
      .filter(person => person.nama || person.email);

    const summary = { scanned: 0, overdue_marked: 0, evening: 0, morning: 0, escalation: 0, skipped: 0, email_failed: 0 };
    const logWrites = [];

    for (const docSnap of requestsSnap.docs) {
      const request = { id: docSnap.id, ...docSnap.data() };
      if (String(request.approval_status || '').toUpperCase() !== 'APPROVED_FINAL') continue;
      summary.scanned += 1;
      const status = effectiveStatus(request, now);

      if (status === 'OVERDUE' && String(request.report_status || '').toUpperCase() !== 'OVERDUE') {
        await docSnap.ref.set({ report_status: 'OVERDUE', overdue_at: now.toISOString(), updated_at: now.toISOString() }, { merge: true });
        summary.overdue_marked += 1;
        request.report_status = 'OVERDUE';
      }

      const type = reminderTypeFor(request, now);
      if (!type) continue;

      const logId = `${docSnap.id}__${type}__${today}`;
      const logRef = db.collection('field_visit_reminder_logs').doc(logId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 240));
      const existing = await logRef.get();
      if (existing.exists && existing.data()?.sent_at) { summary.skipped += 1; continue; }

      const requester = personFor({
        nik: request.nik_pemohon,
        nama: request.nama_pemohon,
        username: request.username_pemohon
      }, employees, users);
      const atasan = personFor({
        nik: request.atasan_nik,
        nama: request.atasan_nama,
        username: request.atasan_username
      }, employees, users);

      const recipients = type === REMINDER.OVERDUE
        ? [requester, ...hrd, atasan]
        : [requester];
      const seen = new Set();
      const cleanRecipients = recipients.filter(person => {
        const key = normalize(person.email || person.username || person.nik || person.nama);
        if (!person || !key || seen.has(key) || (!person.nama && !person.email)) return false;
        seen.add(key);
        return true;
      });
      if (!cleanRecipients.length) { summary.skipped += 1; continue; }

      const isOverdue = type === REMINDER.OVERDUE;
      const judul = isOverdue
        ? `Laporan Kunjungan Terlambat — ${request.document_number || request.nama_pemohon}`
        : `Pengingat Laporan Kunjungan — ${request.document_number || request.nama_pemohon}`;
      const pesan = isOverdue
        ? `Laporan kunjungan ${request.nama_pemohon || ''} (${formatIndoDate(request.end_date)}) belum diisi. Mohon segera dilengkapi.`
        : `Laporan kunjungan ${request.nama_pemohon || ''} (${formatIndoDate(request.end_date)}) belum diisi. Batas waktu ${formatIndoDate(request.report_deadline_at)} pukul 10:00 WIB.`;

      let emailSent = 0;
      let emailFailed = false;
      const cc = type === REMINDER.OVERDUE
        ? [...new Set([...hrd, atasan].map(person => person.email).filter(Boolean))]
        : [];
      for (const recipient of cleanRecipients) {
        try {
          await writeInAppNotif(db, recipient, judul, pesan, '/#/kunjungan-lapangan?tab=laporan');
        } catch (notifError) {
          console.warn('cron-kunjungan in-app gagal:', notifError?.message || notifError);
        }
        if (!recipient.email) continue;
        try {
          const delivery = await sendMailOnce(db, `${logId}_${recipient.email}`, {
            from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
            to: recipient.email,
            cc: cc.filter(email => normalize(email) !== normalize(recipient.email)),
            subject: isOverdue
              ? `[TERLAMBAT] Laporan Kunjungan ${request.document_number || ''} — ${formatIndoDate(request.end_date)}`
              : `[Pengingat] Laporan Kunjungan ${request.document_number || ''} — ${formatIndoDate(request.end_date)}`,
            html: buildEmailHtml({ request, type, recipientName: recipient.nama, appUrl })
          });
          if (delivery.error) emailFailed = true;
          if (!delivery.skipped && !delivery.error) {
            emailSent += 1;
            if (cc.length) summary.escalation += 1;
          }
        } catch (mailError) {
          emailFailed = true;
          console.warn('cron-kunjungan email gagal:', mailError?.message || mailError);
        }
      }

      logWrites.push(logRef.set({
        visit_request_id: docSnap.id,
        document_number: request.document_number || '',
        reminder_type: type,
        scheduled_date: today,
        sent_at: new Date().toISOString(),
        recipient_email: requester.email || '',
        cc_emails: cc.join(','),
        recipients: cleanRecipients.map(person => person.email || person.nama),
        email_sent: emailSent,
        email_failed: emailFailed
      }, { merge: true }));

      if (type === REMINDER.EVENING) summary.evening += 1;
      else if (type === REMINDER.MORNING) summary.morning += 1;
      else summary.escalation += 1;
      if (emailFailed) summary.email_failed += 1;
    }

    await Promise.all(logWrites);
    await writeAuditLog(db, req, null, { action: 'CRON_FIELD_VISIT', module: 'FIELD_VISIT', metadata: { date: today, ...summary } });
    return res.status(200).json({ success: true, date: today, ...summary });
  } catch (err) {
    console.error('Error in cron-kunjungan:', err);
    return res.status(500).json({ success: false, error: 'Cron kunjungan lapangan gagal dijalankan.' });
  }
};

module.exports._test = { reminderTypeFor, effectiveStatus, wibDateStr, wibTimeStr, buildEmailHtml };
