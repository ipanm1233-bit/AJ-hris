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

function userRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function normalizeDeviceUser(user) {
  const deviceUserId = String(user?.userId ?? user?.deviceUserId ?? user?.uid ?? user?.userSn ?? '').trim();
  const name = String(user?.name ?? user?.username ?? user?.userName ?? '').trim();
  if (!deviceUserId || !name) return null;
  return { deviceUserId, name };
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
  const headers = {
    'content-type': 'application/json',
    'x-bridge-timestamp': timestamp,
    'x-bridge-signature': signature
  };
  const vercelBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  if (vercelBypass) headers['x-vercel-protection-bypass'] = vercelBypass;
  return headers;
}

function readableError(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    if (typeof value.message === 'string') return value.message;
    try { return JSON.stringify(value); } catch (_) { /* gunakan fallback */ }
  }
  return fallback;
}

async function sendChunk(logs, users = [], branch = '') {
  return sendPayload({ logs, users, branch });
}

async function sendPayload(payload) {
  const body = JSON.stringify(payload);
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
        throw new Error(readableError(payload.error, `HTTP ${response.status}`));
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function getSyncState(branch) {
  return sendPayload({ action: 'status', branch });
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
    // X150 hanya aman menerima satu command pada satu waktu. Menjalankan
    // getUsers dan getAttendances bersamaan dapat membuat daftar log kosong.
    const users = await device.getUsers().catch(() => ({ data: [] }));
    const attendance = await device.getAttendances();
    return {
      ...identity,
      protocol,
      logs: attendanceRows(attendance).map(normalizeDeviceLog).filter(Boolean),
      users: userRows(users).map(normalizeDeviceUser).filter(Boolean)
    };
  } finally {
    try { await device.disconnect(); } catch (_) { /* koneksi sudah tertutup */ }
  }
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function addDays(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return localDateTime(date).slice(0, 10);
}

function dateFromLog(log) {
  const match = String(log?.recordTime || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

async function synchronize({ checkOnly = false, fromDate = '', toDate = '' } = {}) {
  const startedAt = new Date();
  const result = await readDevice();
  console.log(`[${startedAt.toISOString()}] Solution X150 terhubung via ${result.protocol.toUpperCase()}; log terbaca ${result.logs.length}.`);
  if (checkOnly) {
    console.log('Info mesin:', result.info || '(tidak tersedia)');
    return;
  }

  const today = localDateTime(new Date()).slice(0, 10);
  const branch = String(process.env.FINGERPRINT_BRANCH || 'CIREBON').trim().toUpperCase();
  let startDate = fromDate;
  let endDate = toDate || today;

  if (startDate && !validDate(startDate)) throw new Error('Format --from wajib YYYY-MM-DD');
  if (!validDate(endDate)) throw new Error('Format --to wajib YYYY-MM-DD');
  if (!startDate) {
    const state = await getSyncState(branch);
    const latestDate = validDate(state.latestDate) ? state.latestDate : '';
    if (latestDate) startDate = latestDate === today ? today : addDays(latestDate, 1);
  }

  let recentLogs;
  if (startDate) {
    if (startDate > endDate) {
      console.log(`Data HRIS sudah mutakhir sampai ${endDate}; tidak ada periode baru untuk ditarik.`);
      return;
    }
    recentLogs = result.logs.filter(log => {
      const date = dateFromLog(log);
      return date && date >= startDate && date <= endDate;
    });
    console.log(`Periode sinkronisasi: ${startDate} s.d. ${endDate}.`);
  } else {
    const lookbackDays = positiveNumber('FINGERPRINT_LOOKBACK_DAYS', 7);
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    recentLogs = result.logs.filter(log => {
      const timestamp = logTimestamp(log);
      return timestamp !== null && timestamp >= cutoff;
    });
    console.log(`Belum ada tanggal terakhir di HRIS; memakai periode awal ${lookbackDays} hari.`);
  }
  if (!recentLogs.length) {
    console.log('Tidak ada log mesin pada periode tersebut.');
    return;
  }

  let processed = 0;
  const unmatched = new Set();
  const unmatchedNames = new Map();
  for (let index = 0; index < recentLogs.length; index += 1000) {
    const response = await sendChunk(recentLogs.slice(index, index + 1000), result.users, branch);
    processed += Number(response.processedRecords || 0);
    for (const id of response.unmatchedFingerprintIds || []) unmatched.add(String(id));
    for (const user of response.unmatchedFingerprintUsers || []) {
      if (user?.id) unmatchedNames.set(String(user.id), String(user.fingerName || '').trim());
    }
  }
  console.log(`Sinkronisasi selesai: ${recentLogs.length} scan dikirim, ${processed} hari-karyawan diproses.`);
  if (unmatched.size) {
    const labels = [...unmatched].map(id => unmatchedNames.get(id) ? `${id} (${unmatchedNames.get(id)})` : id);
    console.warn(`Finger Name mesin belum terpetakan: ${labels.join(', ')}`);
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const fromDate = rawArgs.find(value => value.startsWith('--from='))?.slice(7) || '';
  const toDate = rawArgs.find(value => value.startsWith('--to='))?.slice(5) || '';
  if (args.has('--check')) return synchronize({ checkOnly: true });
  if (args.has('--once')) return synchronize({ fromDate, toDate });

  const intervalMinutes = positiveNumber('FINGERPRINT_SYNC_INTERVAL_MINUTES', 5);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await synchronize({ fromDate, toDate });
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

module.exports = { normalizeDeviceLog, normalizeDeviceUser, attendanceRows, userRows, localDateTime, signedHeaders, addDays, dateFromLog };
