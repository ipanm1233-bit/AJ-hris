'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadLocalEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Konfigurasi ${name} belum diisi pada fingerprint-bridge/.env`);
  return value;
}

function positiveNumber(name, fallback, minimum = 1) {
  const number = Number(process.env[name] || fallback);
  if (!Number.isFinite(number) || number < minimum) throw new Error(`Konfigurasi ${name} tidak valid`);
  return number;
}

function localDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = number => String(number).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value || '').trim();
}

function attendanceRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function normalizeDeviceLog(log) {
  const deviceUserId = String(log?.deviceUserId ?? log?.userId ?? log?.userSn ?? log?.uid ?? '').trim();
  const recordTime = localDateTime(log?.recordTime ?? log?.timestamp ?? log?.checkTime);
  if (!deviceUserId || !recordTime) return null;
  return {
    deviceUserId,
    recordTime,
    punchState: log?.punchState ?? log?.state ?? log?.checkType ?? null
  };
}

function logTimestamp(log) {
  const value = String(log.recordTime || '').replace(' ', 'T');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function endpointUrl() {
  const url = new URL(`${required('HRIS_BASE_URL').replace(/\/+$/, '')}/api/sync-absen`);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('HRIS_BASE_URL wajib memakai HTTPS');
  }
  return url.toString();
}

function signedHeaders(body) {
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', required('FINGERPRINT_BRIDGE_SECRET'))
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-bridge-timestamp': timestamp,
    'x-bridge-signature': signature
  };
}

async function sendChunk(logs) {
  const body = JSON.stringify({ logs });
  const timeout = positiveNumber('FINGERPRINT_REQUEST_TIMEOUT_MS', 30000, 5000);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpointUrl(), {
        method: 'POST',
        headers: signedHeaders(body),
        body,
        signal: AbortSignal.timeout(timeout)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function connectDevice() {
  const ZKLib = require('node-zklib');
  const ip = required('FINGERPRINT_DEVICE_IP');
  const port = positiveNumber('FINGERPRINT_DEVICE_PORT', 4370);
  const device = new ZKLib(ip, port, 10000, 4000);
  try {
    await device.createSocket();
    return { device, protocol: device.connectionType || 'tcp/udp' };
  } catch (error) {
    try { await device.disconnect(); } catch (_) { /* koneksi memang belum terbentuk */ }
    throw new Error(`Tidak dapat terhubung ke ${ip}:${port} (${error?.message || 'koneksi gagal'})`);
  }
}

async function deviceIdentity(device) {
  return { info: await device.getInfo().catch(() => null) };
}

async function readDevice() {
  const { device, protocol } = await connectDevice();
  try {
    const identity = await deviceIdentity(device);
    const attendance = await device.getAttendances();
    return { ...identity, protocol, logs: attendanceRows(attendance).map(normalizeDeviceLog).filter(Boolean) };
  } finally {
    try { await device.disconnect(); } catch (_) { /* koneksi sudah tertutup */ }
  }
}

async function synchronize({ checkOnly = false } = {}) {
  const startedAt = new Date();
  const result = await readDevice();
  console.log(`[${startedAt.toISOString()}] Solution X150 terhubung via ${result.protocol.toUpperCase()}; log terbaca ${result.logs.length}.`);
  if (checkOnly) {
    console.log('Info mesin:', result.info || '(tidak tersedia)');
    return;
  }

  const lookbackDays = positiveNumber('FINGERPRINT_LOOKBACK_DAYS', 7);
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const recentLogs = result.logs.filter(log => {
    const timestamp = logTimestamp(log);
    return timestamp !== null && timestamp >= cutoff;
  });
  if (!recentLogs.length) {
    console.log(`Tidak ada log dalam ${lookbackDays} hari terakhir.`);
    return;
  }

  let processed = 0;
  const unmatched = new Set();
  for (let index = 0; index < recentLogs.length; index += 1000) {
    const response = await sendChunk(recentLogs.slice(index, index + 1000));
    processed += Number(response.processedRecords || 0);
    for (const id of response.unmatchedFingerprintIds || []) unmatched.add(String(id));
  }
  console.log(`Sinkronisasi selesai: ${recentLogs.length} scan dikirim, ${processed} hari-karyawan diproses.`);
  if (unmatched.size) console.warn(`ID mesin belum terpetakan: ${[...unmatched].join(', ')}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--check')) return synchronize({ checkOnly: true });
  if (args.has('--once')) return synchronize();

  const intervalMinutes = positiveNumber('FINGERPRINT_SYNC_INTERVAL_MINUTES', 5);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await synchronize();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Sinkronisasi gagal: ${error.message}`);
    } finally {
      running = false;
    }
  };
  await run();
  setInterval(run, intervalMinutes * 60_000);
  console.log(`Bridge aktif; sinkronisasi berikutnya setiap ${intervalMinutes} menit. Tekan Ctrl+C untuk berhenti.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Fingerprint bridge berhenti: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { normalizeDeviceLog, attendanceRows, localDateTime, signedHeaders };
