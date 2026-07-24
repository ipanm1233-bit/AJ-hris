const express = require('express');
const path = require('path');
const app = express();

// Parsers for POST bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory
app.use(express.static(__dirname));

// Import API Handlers
const cronCheckKontrak = require('./api/cron-check-kontrak.js');
const sendPush = require('./api/send-push.js');

// Map the API paths to the handlers
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

// For all other routes, serve index.html (SPA Fallback)
app.get('*all', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
});
