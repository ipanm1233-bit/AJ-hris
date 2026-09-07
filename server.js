const express = require('express');
const path = require('path');
const app = express();

// Parsers for POST bodies
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

// Import API Handlers
const cronCheckKontrak = require('./api/cron-check-kontrak.js');
const cronRekapCuti = require('./api/cron-rekap-cuti.js');
const sendPush = require('./api/send-push.js');
const syncAbsen = require('./api/sync-absen.js');
const kanalProxy = require('./api/kanal-proxy.js');
const sendEmail = require('./api/send-email.js');
const proxyImage = require('./api/proxy-image.js');
const geminiProxy = require('./api/gemini.js');
const authLogin = require('./api/auth-login.js');
const authSession = require('./api/auth-session.js');
const adminUser = require('./api/admin-user.js');
const changePassword = require('./api/change-password.js');
const registerDevice = require('./api/register-device.js');

app.all('/api/auth-login', async (req, res, next) => {
  try { await authLogin(req, res); } catch (error) { next(error); }
});

app.all('/api/auth-session', async (req, res, next) => {
  try { await authSession(req, res); } catch (error) { next(error); }
});

app.all('/api/admin-user', async (req, res, next) => {
  try { await adminUser(req, res); } catch (error) { next(error); }
});

app.all('/api/change-password', async (req, res, next) => {
  try { await changePassword(req, res); } catch (error) { next(error); }
});

app.all('/api/register-device', async (req, res, next) => {
  try { await registerDevice(req, res); } catch (error) { next(error); }
});

// Map the API paths to the handlers
app.all('/api/cron-rekap-cuti', async (req, res, next) => {
  try {
    await cronRekapCuti(req, res);
  } catch (error) {
    console.error("Error in cron-rekap-cuti:", error);
    next(error);
  }
});

app.all('/api/gemini', async (req, res, next) => {
  try {
    await geminiProxy(req, res);
  } catch (error) {
    console.error("Error in gemini proxy:", error);
    next(error);
  }
});

app.all('/api/cron-check-kontrak', async (req, res, next) => {
  try {
    await cronCheckKontrak(req, res);
  } catch (error) {
    console.error("Error in cron-check-kontrak:", error);
    next(error);
  }
});

app.all('/api/send-push', async (req, res, next) => {
  try {
    await sendPush(req, res);
  } catch (error) {
    console.error("Error in send-push:", error);
    next(error);
  }
});

app.all('/api/sync-absen', async (req, res, next) => {
  try {
    await syncAbsen(req, res);
  } catch (error) {
    console.error("Error in sync-absen:", error);
    next(error);
  }
});

app.all('/api/kanal-proxy', async (req, res, next) => {
  try {
    await kanalProxy(req, res);
  } catch (error) {
    console.error("Error in kanal-proxy:", error);
    next(error);
  }
});

app.all('/api/send-email', async (req, res, next) => {
  try {
    await sendEmail(req, res);
  } catch (error) {
    console.error("Error in send-email:", error);
    next(error);
  }
});

app.all('/api/proxy-image', async (req, res, next) => {
  try {
    await proxyImage(req, res);
  } catch (error) {
    console.error("Error in proxy-image:", error);
    next(error);
  }
});

// Serve static files from the root directory
app.use(express.static(__dirname));

// For all other routes, serve index.html (SPA Fallback)
app.get('*all', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
});
