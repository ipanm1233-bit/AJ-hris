const DEFAULT_TIME_ZONE = 'Asia/Jakarta';

function cleanIdentifier(value) {
  return String(value ?? '').trim();
}

function getDeviceUserId(log = {}) {
  const fields = [
    'deviceUserId', 'device_user_id', 'userId', 'user_id', 'employeeId',
    'employee_id', 'enrollId', 'enroll_id', 'enrollNumber', 'pin', 'PIN',
    'badgeNumber', 'badge_number', 'cardNo', 'card_no', 'userSn', 'uid'
  ];
  for (const field of fields) {
    const value = cleanIdentifier(log[field]);
    if (value) return value;
  }
  return '';
}

function getTimestampValue(log = {}) {
  const fields = [
    'recordTime', 'record_time', 'timestamp', 'dateTime', 'datetime',
    'checkTime', 'check_time', 'punchTime', 'punch_time', 'time', 'date'
  ];
  for (const field of fields) {
    if (log[field] !== undefined && log[field] !== null && log[field] !== '') return log[field];
  }
  return null;
}

function validDateParts(year, month, day, hour, minute, second = 0) {
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day && value.getUTCHours() === hour && value.getUTCMinutes() === minute;
}

function fromParts(year, month, day, hour, minute, second = 0) {
  const numbers = [year, month, day, hour, minute, second].map(Number);
  if (!validDateParts(...numbers)) return null;
  const [y, m, d, h, min, sec] = numbers;
  return {
    tanggal: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    jam: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    detik: sec,
    minutes: h * 60 + min
  };
}

function formatInstant(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return fromParts(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
}

function parseFingerprintTimestamp(value, timeZone = DEFAULT_TIME_ZONE) {
  if (value && typeof value.toDate === 'function') return formatInstant(value.toDate(), timeZone);
  if (value && typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return formatInstant(new Date(Number(value.seconds) * 1000), timeZone);
  }
  if (value instanceof Date) return formatInstant(value, timeZone);
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value || '').trim())) {
    const rawNumber = Number(value);
    const milliseconds = rawNumber < 10_000_000_000 ? rawNumber * 1000 : rawNumber;
    return formatInstant(new Date(milliseconds), timeZone);
  }

  const raw = String(value || '').trim();
  if (!raw) return null;

  // Mesin fingerprint umumnya mengirim waktu lokal tanpa offset. Komponen
  // tersebut harus dipertahankan, bukan ditafsirkan sebagai UTC oleh Vercel.
  const localYmd = raw.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)[ T](\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (localYmd) return fromParts(localYmd[1], localYmd[2], localYmd[3], localYmd[4], localYmd[5], localYmd[6] || 0);
  const localDmy = raw.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})[ T](\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (localDmy) return fromParts(localDmy[3], localDmy[2], localDmy[1], localDmy[4], localDmy[5], localDmy[6] || 0);

  // ISO timestamp yang memang memiliki Z/offset adalah sebuah instant dan
  // baru dikonversi ke zona waktu kantor.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) return formatInstant(new Date(raw), timeZone);
  return null;
}

function getPunchDirection(log = {}) {
  // Jangan memakai field generik `type`/`status`: pada banyak mesin nilainya
  // adalah metode verifikasi (finger/password), bukan arah masuk/pulang.
  const fields = ['punchState', 'punch_state', 'state', 'checkType', 'check_type', 'attendanceType', 'attendance_type', 'direction', 'eventType', 'event_type', 'punch'];
  let value;
  for (const field of fields) {
    if (log[field] !== undefined && log[field] !== null && log[field] !== '') {
      value = log[field];
      break;
    }
  }
  if (value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['0', 'in', 'checkin', 'masuk', 'entry', 'clockin'].includes(normalized)) return 'IN';
  if (['1', 'out', 'checkout', 'pulang', 'keluar', 'exit', 'clockout'].includes(normalized)) return 'OUT';
  return null;
}

function normalizeFingerprintLog(log, options = {}) {
  if (!log || typeof log !== 'object' || Array.isArray(log)) return null;
  const deviceUserId = getDeviceUserId(log);
  const parsed = parseFingerprintTimestamp(getTimestampValue(log), options.timeZone || DEFAULT_TIME_ZONE);
  if (!deviceUserId || !parsed) return null;
  return {
    deviceUserId,
    tanggal: parsed.tanggal,
    jam: parsed.jam,
    minutes: parsed.minutes,
    direction: getPunchDirection(log)
  };
}

function aggregateFingerprintLogs(logs, options = {}) {
  const groups = new Map();
  let invalid = 0;
  for (const raw of logs || []) {
    const event = normalizeFingerprintLog(raw, options);
    if (!event) {
      invalid += 1;
      continue;
    }
    const key = `${event.deviceUserId}|${event.tanggal}`;
    if (!groups.has(key)) groups.set(key, { deviceUserId: event.deviceUserId, tanggal: event.tanggal, events: [] });
    const group = groups.get(key);
    if (!group.events.some(item => item.jam === event.jam && item.direction === event.direction)) group.events.push(event);
  }
  return { groups: [...groups.values()], invalid };
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function computeAttendance(events, existing = {}, minWorkGapMinutes = 120) {
  const incoming = [...(events || [])].sort((a, b) => a.minutes - b.minutes);
  const ins = incoming.filter(item => item.direction === 'IN');
  const outs = incoming.filter(item => item.direction === 'OUT');
  const unknown = incoming.filter(item => !item.direction);
  const existingIn = timeToMinutes(existing.scan_masuk);
  const existingOut = timeToMinutes(existing.scan_keluar);

  let scanIn = existingIn === null ? null : { jam: existing.scan_masuk, minutes: existingIn };
  let scanOut = existingOut === null ? null : { jam: existing.scan_keluar, minutes: existingOut };
  if (ins.length) scanIn = [scanIn, ...ins].filter(Boolean).sort((a, b) => a.minutes - b.minutes)[0];
  if (outs.length) scanOut = [scanOut, ...outs].filter(Boolean).sort((a, b) => b.minutes - a.minutes)[0];

  if (unknown.length) {
    if (!scanIn) scanIn = unknown[0];
    const latestUnknown = unknown[unknown.length - 1];
    if (scanIn && latestUnknown.minutes - scanIn.minutes >= minWorkGapMinutes &&
      (!scanOut || latestUnknown.minutes > scanOut.minutes)) scanOut = latestUnknown;
  }

  if (scanIn && scanOut && scanOut.minutes <= scanIn.minutes) scanOut = null;
  return { scan_masuk: scanIn?.jam || null, scan_keluar: scanOut?.jam || null };
}

module.exports = {
  DEFAULT_TIME_ZONE,
  getDeviceUserId,
  parseFingerprintTimestamp,
  getPunchDirection,
  normalizeFingerprintLog,
  aggregateFingerprintLogs,
  computeAttendance
};
