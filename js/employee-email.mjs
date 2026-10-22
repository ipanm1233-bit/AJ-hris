/**
 * Normalisasi & pemilihan email karyawan.
 *
 * Data Master Karyawan di lapangan dapat berasal dari beberapa sumber
 * (input manual, migrasi Excel, akun Users lama), sehingga alamat email
 * bisa tersimpan pada beberapa nama field. Helper ini memusatkan aturan
 * pemilihan tersebut agar seluruh modul pengiriman email memakai hasil
 * yang sama.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_FIELDS = [
  "email",
  "email_karyawan",
  "email_perusahaan",
  "email_pribadi",
  "email_personal",
  "email_aktif",
  "emailKerja",
  "emailPribadi"
];

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

function collectEmailCandidates(value, output, seen) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectEmailCandidates(item, output, seen));
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  EMAIL_FIELDS.forEach(field => collectEmailCandidates(value[field], output, seen));
}

/**
 * Mengambil email valid pertama dari satu atau beberapa sumber data.
 * Sumber boleh berupa string email, object karyawan/user, atau array.
 */
export function pickEmployeeEmail(...sources) {
  const candidates = [];
  const seen = new Set();
  sources.forEach(source => collectEmailCandidates(source, candidates, seen));
  return candidates.map(normalizeEmail).find(isValidEmail) || "";
}
