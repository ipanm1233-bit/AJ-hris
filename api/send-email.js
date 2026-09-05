const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');

  try {
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

    const mailOptions = {
      from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
      to,
      cc: cc || undefined,
      subject,
      html: htmlBody
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => {
        const item = { filename: att.filename || "dokumen.pdf" };
        if (att.content) item.content = att.content;
        if (att.path) item.path = att.path;
        if (att.encoding) item.encoding = att.encoding;
        if (att.contentType) item.contentType = att.contentType;
        return item;
      });
    }

    const info = await getTransporter().sendMail(mailOptions);

    res.status(200).json({ success: true, id: info.messageId });

  } catch (error) {
    console.error("CRASH SERVER (send-email):", error);
    res.status(500).json({
      success: false,
      error: "Server Error: " + error.message
    });
  }
};
