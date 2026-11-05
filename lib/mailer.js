const nodemailer = require('nodemailer');

let transporter = null;

function isMailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      socketTimeout: 8000,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

async function sendMail(options) {
  return getTransporter().sendMail(options);
}

module.exports = { isMailConfigured, getTransporter, sendMail };
