/**
 * Helper data karyawan untuk login Google dan verifikasi data diri.
 *
 * Modul ini sengaja tidak menyentuh Firestore agar aturan normalisasi dan
 * validasi dapat diuji tanpa emulator. Semua fungsi menerima objek biasa.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_FIELDS = [
  'email',
  'email_karyawan',
  'email_perusahaan',
  'email_pribadi',
  'email_personal',
  'email_aktif',
  'email_google'
];

const EDITABLE_PROFILE_FIELDS = [
  'nik_ktp', 'no_ktp',
  'no_kk', 'no_kartu_keluarga',
  'npwp', 'no_npwp',
  'bpjs_tk', 'no_bpjs_tk', 'bpjs_ketenagakerjaan',
  'bpjs_kes', 'no_bpjs_kes', 'bpjs_kesehatan',
  'tempat_lahir',
  'tanggal_lahir',
  'jenis_kelamin',
  'agama',
  'pendidikan',
  'status_pernikahan',
  'tanggungan',
  'no_hp_aktif',
  'kontak_darurat_nama',
  'kontak_darurat_hubungan',
  'kontak_darurat_hp',
  'kontak_darurat',
  'alamat',
  'alamat_domisili',
  'alamat_ktp',
  'nama_bank',
  'no_rekening',
  'ukuran_baju'
];

const EDITABLE_PROFILE_FIELD_SET = new Set(EDITABLE_PROFILE_FIELDS);
const ALLOWED_GENDERS = new Set(['LAKI-LAKI', 'PEREMPUAN']);
const ALLOWED_SHIRT_SIZES = new Set(['S', 'M', 'L', 'XL', 'XXL', '3XL']);

function cleanText(value, maxLength = 200) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

function normalizeRole(value) {
  return String(value || 'STAFF').trim().toUpperCase();
}

function firstValue(source, keys) {
  const object = source && typeof source === 'object' ? source : {};
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function digitsOnly(value, maxLength = 40) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

function normalizePhone(value) {
  return String(value ?? '').replace(/[^\d+]/g, '').slice(0, 20);
}

function isValidPhone(value) {
  return /^\+?\d{8,20}$/.test(normalizePhone(value));
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function employeeEmailCandidates(employee) {
  const object = employee && typeof employee === 'object' ? employee : {};
  return [...new Set(EMAIL_FIELDS
    .map(field => normalizeEmail(object[field]))
    .filter(Boolean))];
}

function employeeMatchesEmail(employee, email) {
  const target = normalizeEmail(email);
  if (!target) return false;
  return employeeEmailCandidates(employee).includes(target);
}

function inferRoleFromEmployee(employee = {}) {
  const explicit = normalizeRole(employee.role || '');
  if (explicit && explicit !== 'STAFF') return explicit;

  const text = [
    employee.jabatan,
    employee.posisi,
    employee.divisi,
    employee.department,
    employee.unit
  ].filter(Boolean).join(' ').toUpperCase();

  if (/\bSUPER\s*ADMIN\b|\bSUPERADMIN\b/.test(text)) return 'SUPERADMIN';
  if (/\bDIREKTUR\b|\bDIRECTOR\b/.test(text)) return 'DIREKTUR';
  if (/\bGENERAL\s*MANAGER\b|\bGM\b/.test(text)) return 'GM';
  if (/\bMANAGER\s*HRD\b|\bHRD\s*MANAGER\b|\bHEAD\s*OF\s*HR\b|\bKEPALA\s*HRD\b/.test(text)) return 'HRD';
  if (/\bBRANCH\s*MANAGER\b|\bKEPALA\s*CABANG\b|\bKACAB\b/.test(text)) return 'BRANCH MANAGER';
  if (/\bMANAGER\b/.test(text)) return 'MANAGER';
  if (/\bSUPERVISOR\b|\bSPV\b/.test(text)) return 'SPV';
  if (/\bKOORDINATOR\b|\bKORLAP\b/.test(text)) return 'KOORDINATOR';
  if (/\bFINANCE\b|\bAKUNTANSI\b|\bACCOUNTING\b/.test(text)) return 'FINANCE';
  if (/\bHRD\b|\bHUMAN\s*RESOURCE\b|\bHR\b/.test(text)) return 'HRD';
  return explicit || 'STAFF';
}

function isEmployeeActive(employee = {}) {
  const status = [
    employee.aktif_tdk_aktif,
    employee.status_akun,
    employee.status_keaktifan,
    employee.status_karyawan
  ].filter(Boolean).join(' ').toUpperCase();
  return !/(TIDAK\s*AKTIF|NON\s*AKTIF|NONAKTIF|INACTIVE|RESIGN|KELUAR|TERMINATED|OFFBOARD)/.test(status);
}

function dateOnly(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object' && value._seconds !== undefined) {
    const date = new Date(Number(value._seconds) * 1000);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    return `${match[3]}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function isValidDateOnly(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
}

function calculateAge(dateString) {
  if (!isValidDateOnly(dateString)) return null;
  const birth = new Date(`${dateString}T00:00:00.000Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

function profileFromEmployee(employee = {}, extra = {}) {
  const source = { ...(employee || {}), ...(extra || {}) };
  const nikKtp = digitsOnly(firstValue(source, ['nik_ktp', 'no_ktp']), 16);
  const noKk = digitsOnly(firstValue(source, ['no_kk', 'no_kartu_keluarga']), 16);
  const bpjsTk = digitsOnly(firstValue(source, ['bpjs_tk', 'no_bpjs_tk', 'bpjs_ketenagakerjaan']), 30);
  const bpjsKes = digitsOnly(firstValue(source, ['bpjs_kes', 'no_bpjs_kes', 'bpjs_kesehatan']), 30);

  return {
    id: String(source.id || ''),
    nik_karyawan: cleanText(firstValue(source, ['nik_karyawan', 'nik']), 30),
    nama_karyawan: cleanText(firstValue(source, ['nama_karyawan', 'nama']), 120),
    jabatan: cleanText(firstValue(source, ['jabatan', 'posisi']), 120),
    cabang: cleanText(source.cabang, 120),
    divisi: cleanText(source.divisi, 120),
    status_karyawan: cleanText(firstValue(source, ['status_karyawan', 'status']), 120),
    tanggal_join: dateOnly(source.tanggal_join),
    email: normalizeEmail(firstValue(source, ['email', 'email_perusahaan', 'email_pribadi', 'email_google'])),
    email_google: normalizeEmail(source.email_google),
    nik_ktp: nikKtp,
    no_kk: noKk,
    npwp: cleanText(firstValue(source, ['npwp', 'no_npwp']), 40),
    bpjs_tk: bpjsTk,
    bpjs_kes: bpjsKes,
    tempat_lahir: cleanText(source.tempat_lahir, 120),
    tanggal_lahir: dateOnly(source.tanggal_lahir),
    jenis_kelamin: cleanText(source.jenis_kelamin, 30).toUpperCase(),
    agama: cleanText(source.agama, 40),
    pendidikan: cleanText(source.pendidikan, 60),
    status_pernikahan: cleanText(source.status_pernikahan, 40),
    tanggungan: Math.max(0, Math.trunc(numberValue(source.tanggungan ?? source.anak, 0))),
    no_hp_aktif: normalizePhone(firstValue(source, ['no_hp_aktif', 'no_hp', 'telepon'])),
    kontak_darurat_nama: cleanText(firstValue(source, ['kontak_darurat_nama', 'nama_kontak_darurat']), 120),
    kontak_darurat_hubungan: cleanText(source.kontak_darurat_hubungan, 80),
    kontak_darurat_hp: normalizePhone(firstValue(source, ['kontak_darurat_hp', 'kontak_darurat'])),
    alamat: cleanText(firstValue(source, ['alamat', 'alamat_domisili']), 500),
    alamat_domisili: cleanText(firstValue(source, ['alamat', 'alamat_domisili']), 500),
    alamat_ktp: cleanText(source.alamat_ktp, 500),
    nama_bank: cleanText(source.nama_bank, 80),
    no_rekening: digitsOnly(source.no_rekening, 30),
    ukuran_baju: cleanText(source.ukuran_baju, 10).toUpperCase(),
    last_location: source.last_location && typeof source.last_location === 'object' ? source.last_location : null
  };
}

function buildProfileUpdate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Data profil tidak valid.');
  }
  const unknown = Object.keys(input).filter(key => !EDITABLE_PROFILE_FIELD_SET.has(key));
  if (unknown.length) throw new Error(`Field profil tidak diizinkan: ${unknown.join(', ')}`);

  const has = keys => keys.some(key => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined);
  const value = keys => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) return input[key];
    }
    return '';
  };
  const update = {};

  if (has(['nik_ktp', 'no_ktp'])) {
    const nikKtp = digitsOnly(value(['nik_ktp', 'no_ktp']), 16);
    if (nikKtp && !/^\d{16}$/.test(nikKtp)) throw new Error('NIK KTP harus terdiri dari 16 digit angka.');
    update.nik_ktp = nikKtp;
    update.no_ktp = nikKtp;
  }

  if (has(['no_kk', 'no_kartu_keluarga'])) {
    const noKk = digitsOnly(value(['no_kk', 'no_kartu_keluarga']), 16);
    if (noKk && !/^\d{16}$/.test(noKk)) throw new Error('Nomor Kartu Keluarga harus terdiri dari 16 digit angka.');
    update.no_kk = noKk;
    update.no_kartu_keluarga = noKk;
  }

  if (has(['npwp', 'no_npwp'])) {
    const npwp = digitsOnly(value(['npwp', 'no_npwp']), 20);
    update.npwp = npwp;
    update.no_npwp = npwp;
  }

  if (has(['bpjs_tk', 'no_bpjs_tk', 'bpjs_ketenagakerjaan'])) {
    const bpjsTk = digitsOnly(value(['bpjs_tk', 'no_bpjs_tk', 'bpjs_ketenagakerjaan']), 30);
    update.bpjs_tk = bpjsTk;
    update.no_bpjs_tk = bpjsTk;
    update.bpjs_ketenagakerjaan = bpjsTk;
  }

  if (has(['bpjs_kes', 'no_bpjs_kes', 'bpjs_kesehatan'])) {
    const bpjsKes = digitsOnly(value(['bpjs_kes', 'no_bpjs_kes', 'bpjs_kesehatan']), 30);
    update.bpjs_kes = bpjsKes;
    update.no_bpjs_kes = bpjsKes;
    update.bpjs_kesehatan = bpjsKes;
  }

  if (has(['tempat_lahir'])) {
    update.tempat_lahir = cleanText(value(['tempat_lahir']), 120);
  }

  if (has(['tanggal_lahir'])) {
    const tanggalLahir = dateOnly(value(['tanggal_lahir']));
    if (tanggalLahir && !isValidDateOnly(tanggalLahir)) throw new Error('Tanggal lahir tidak valid.');
    if (tanggalLahir && new Date(`${tanggalLahir}T00:00:00.000Z`).getTime() > Date.now()) {
      throw new Error('Tanggal lahir tidak boleh berada di masa depan.');
    }
    update.tanggal_lahir = tanggalLahir;
    const age = calculateAge(tanggalLahir);
    if (age !== null) update.usia = age;
  }

  if (has(['jenis_kelamin'])) {
    const gender = cleanText(value(['jenis_kelamin']), 30).toUpperCase();
    if (gender && !ALLOWED_GENDERS.has(gender)) throw new Error('Jenis kelamin tidak valid.');
    update.jenis_kelamin = gender;
  }

  if (has(['agama'])) update.agama = cleanText(value(['agama']), 40).toUpperCase();
  if (has(['pendidikan'])) update.pendidikan = cleanText(value(['pendidikan']), 60).toUpperCase();
  if (has(['status_pernikahan'])) update.status_pernikahan = cleanText(value(['status_pernikahan']), 40);

  if (has(['tanggungan'])) {
    const tanggungan = Math.trunc(numberValue(value(['tanggungan']), -1));
    if (tanggungan < 0 || tanggungan > 30) throw new Error('Jumlah tanggungan tidak valid.');
    update.tanggungan = tanggungan;
    update.anak = tanggungan;
  }

  if (has(['no_hp_aktif'])) {
    const phone = normalizePhone(value(['no_hp_aktif']));
    if (!phone) throw new Error('Nomor HP aktif wajib diisi.');
    if (!isValidPhone(phone)) throw new Error('Nomor HP aktif tidak valid.');
    update.no_hp_aktif = phone;
  }

  if (has(['kontak_darurat_nama', 'nama_kontak_darurat'])) {
    update.kontak_darurat_nama = cleanText(value(['kontak_darurat_nama', 'nama_kontak_darurat']), 120);
    update.nama_kontak_darurat = update.kontak_darurat_nama;
  }

  if (has(['kontak_darurat_hubungan'])) {
    update.kontak_darurat_hubungan = cleanText(value(['kontak_darurat_hubungan']), 80);
  }

  if (has(['kontak_darurat_hp', 'kontak_darurat'])) {
    const emergencyPhone = normalizePhone(value(['kontak_darurat_hp', 'kontak_darurat']));
    if (emergencyPhone && !isValidPhone(emergencyPhone)) throw new Error('Nomor HP kontak darurat tidak valid.');
    update.kontak_darurat_hp = emergencyPhone;
    update.kontak_darurat = emergencyPhone;
  }

  if (has(['alamat', 'alamat_domisili'])) {
    const address = cleanText(value(['alamat', 'alamat_domisili']), 500);
    if (!address) throw new Error('Alamat domisili wajib diisi.');
    update.alamat = address;
    update.alamat_domisili = address;
  }

  if (has(['alamat_ktp'])) {
    update.alamat_ktp = cleanText(value(['alamat_ktp']), 500);
  }

  if (has(['nama_bank'])) update.nama_bank = cleanText(value(['nama_bank']), 80);
  if (has(['no_rekening'])) update.no_rekening = digitsOnly(value(['no_rekening']), 30);

  if (has(['ukuran_baju'])) {
    const size = cleanText(value(['ukuran_baju']), 10).toUpperCase();
    if (size && !ALLOWED_SHIRT_SIZES.has(size)) throw new Error('Ukuran seragam tidak valid.');
    update.ukuran_baju = size;
  }

  return update;
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new Error('Titik lokasi perangkat wajib dikirim.');
  }
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Latitude lokasi tidak valid.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Longitude lokasi tidak valid.');

  const accuracy = Number(location.accuracy);
  const altitude = Number(location.altitude);
  const heading = Number(location.heading);
  const speed = Number(location.speed);
  const capturedAt = new Date(location.captured_at || Date.now());
  const now = Date.now();
  const safeCapturedAt = Number.isNaN(capturedAt.getTime())
    ? new Date(now).toISOString()
    : new Date(Math.min(now + 60_000, Math.max(now - 86_400_000, capturedAt.getTime()))).toISOString();

  return {
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
    altitude: Number.isFinite(altitude) ? Math.round(altitude * 10) / 10 : null,
    altitude_accuracy: Number.isFinite(Number(location.altitude_accuracy))
      ? Math.round(Number(location.altitude_accuracy) * 10) / 10
      : null,
    heading: Number.isFinite(heading) ? Math.round(heading * 10) / 10 : null,
    speed: Number.isFinite(speed) ? Math.round(speed * 100) / 100 : null,
    captured_at: safeCapturedAt,
    received_at: new Date(now).toISOString(),
    source: 'browser_geolocation'
  };
}

function safeDocId(value, fallback = 'UNLINKED') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[\/#?\[\]*]/g, '_')
    .replace(/^\.+$/, '_')
    .slice(0, 180);
  return cleaned || fallback;
}

module.exports = {
  EMAIL_FIELDS,
  EDITABLE_PROFILE_FIELDS,
  cleanText,
  normalizeEmail,
  isValidEmail,
  normalizeRole,
  digitsOnly,
  normalizePhone,
  isValidPhone,
  employeeEmailCandidates,
  employeeMatchesEmail,
  inferRoleFromEmployee,
  isEmployeeActive,
  dateOnly,
  isValidDateOnly,
  calculateAge,
  profileFromEmployee,
  buildProfileUpdate,
  normalizeLocation,
  safeDocId
};
