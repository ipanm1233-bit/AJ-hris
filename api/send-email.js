const nodemailer = require('nodemailer');
const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');

  try {
    const context = await requireFirebaseAuth(req, res);
    if (!context) return;
    if (!enforceRateLimit(req, res, { namespace: 'send-email', key: context.user.uid, limit: 30, windowMs: 60 * 60_000 })) return;
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
    const privilegedRoles = new Set(['HRD', 'SUPERADMIN', 'GM', 'MANAGER', 'FINANCE']);
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
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)) throw new Error('Tipe lampiran tidak diizinkan.');
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
