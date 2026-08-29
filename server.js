const express = require('express');
const path = require('path');
const app = express();

// Parsers for POST bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import API Handlers
const cronCheckKontrak = require('./api/cron-check-kontrak.js');
const cronRekapCuti = require('./api/cron-rekap-cuti.js');
const sendPush = require('./api/send-push.js');
const syncAbsen = require('./api/sync-absen.js');
const kanalProxy = require('./api/kanal-proxy.js');
const sendEmail = require('./api/send-email.js');
const proxyImage = require('./api/proxy-image.js');
const geminiProxy = require('./api/gemini.js');

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
  res.status(500).json({ success: false, error: err.message });
});

// Background Automated Scheduler (07:45 WIB Morning Leave Digest & 17:00 WIB Evening Leave Applications Digest)
let lastMorningTriggerDate = null;
let lastEveningTriggerDate = null;

function checkDailyLeaveSchedule() {
  try {
    const now = new Date();
    // Gunakan formatter zona waktu Asia/Jakarta (WIB)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const dateObj = {};
    parts.forEach(p => { dateObj[p.type] = p.value; });

    const todayWib = `${dateObj.year}-${dateObj.month}-${dateObj.day}`;
    const currentHour = parseInt(dateObj.hour, 10);
    const currentMinute = parseInt(dateObj.minute, 10);

    // 1. Pagi Hari 07:45 WIB - List Karyawan Cuti di Hari Tersebut
    if (currentHour === 7 && currentMinute >= 45 && currentMinute <= 55 && lastMorningTriggerDate !== todayWib) {
      lastMorningTriggerDate = todayWib;
      console.log(`[CRON 07:45 WIB] Menjalankan Pengiriman Rekap Karyawan Cuti Pagi (${todayWib})...`);
      const mockReq = { query: { type: 'morning' }, body: {} };
      const mockRes = {
        status: () => mockRes,
        json: (data) => console.log('[CRON 07:45 WIB Result]:', JSON.stringify(data)),
        send: (data) => console.log('[CRON 07:45 WIB Send]:', data)
      };
      cronRekapCuti(mockReq, mockRes).catch(e => console.error('[CRON 07:45 WIB Error]:', e));
    }

    // 2. Sore Hari 17:00 WIB - List Karyawan yang Mengajukan Cuti Hari Ini
    if (currentHour === 17 && currentMinute >= 0 && currentMinute <= 10 && lastEveningTriggerDate !== todayWib) {
      lastEveningTriggerDate = todayWib;
      console.log(`[CRON 17:00 WIB] Menjalankan Pengiriman Rekap Pengajuan Cuti Sore (${todayWib})...`);
      const mockReq = { query: { type: 'evening' }, body: {} };
      const mockRes = {
        status: () => mockRes,
        json: (data) => console.log('[CRON 17:00 WIB Result]:', JSON.stringify(data)),
        send: (data) => console.log('[CRON 17:00 WIB Send]:', data)
      };
      cronRekapCuti(mockReq, mockRes).catch(e => console.error('[CRON 17:00 WIB Error]:', e));
    }
  } catch (err) {
    console.error('Error in checkDailyLeaveSchedule scheduler:', err);
  }
}

// Cek jadwal setiap 30 detik
setInterval(checkDailyLeaveSchedule, 30000);

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
  // Cek jadwal saat startup
  setTimeout(checkDailyLeaveSchedule, 5000);
});
