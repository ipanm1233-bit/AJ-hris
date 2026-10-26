/**
 * =====================================================================
 * APPROVAL-RECIPIENTS.MJS — aturan penentuan penerima notifikasi persetujuan
 * =====================================================================
 * Modul murni (tanpa Firestore/DOM) supaya bisa diuji lewat `node --test`.
 *
 * Latar belakang: divisi "HRGA" di master karyawan juga memuat Security,
 * Office Boy, General Affair, dan Driver. Versi lama menganggap SEMUA karyawan
 * ber-divisi HRGA sebagai approver HRD, sehingga mereka menerima email dan
 * notifikasi berisi data izin/cuti karyawan lain (kasus izin EVA, 26 Okt 2026).
 *
 * Aturan sekarang:
 *   1. Penerima HRD utama = user dengan role HRD / SUPERADMIN.
 *   2. Fallback = karyawan yang JABATANNYA memang HR (STAFF HRD, HRGA MANAGER,
 *      RECRUITMENT, PERSONALIA, ...) — bukan sekadar ber-divisi HRGA.
 *   3. Posisi pendukung operasional (security/satpam/OB/GA/driver/teknisi)
 *      SELALU dikecualikan, walaupun ber-divisi HRGA atau salah input role.
 */

export const HR_ROLES = ["HRD", "SUPERADMIN"];

/** Jabatan yang menandakan pekerjaan HR/kepegawaian. */
export const HR_JABATAN_PATTERN = /\b(hrd|hrga|sdm|human resource|personalia|recruitment|rekrutmen|talent)\b/i;

/** Posisi pendukung operasional yang tidak berwenang menyetujui pengajuan. */
export const OPERATIONAL_SUPPORT_PATTERN =
  /\b(security|satpam|keamanan|office boy|cleaning( service)?|driver|pengemudi|kurir|messenger|general affair|teknisi|maintenance)\b/i;

const text = (value) => String(value ?? "").trim();
const upper = (value) => text(value).toUpperCase();
const lower = (value) => text(value).toLowerCase();

/**
 * True bila record (user atau karyawan) adalah posisi pendukung operasional.
 * @param {{role?:string, jabatan?:string, posisi?:string, divisi?:string, departemen?:string}} record
 */
export function isOperationalSupport(record = {}) {
  const role = upper(record.role);
  if (role === "SECURITY" || role === "SATPAM") return true;
  const jabatan = text(record.jabatan ?? record.posisi);
  const divisi = text(record.divisi ?? record.departemen);
  return OPERATIONAL_SUPPORT_PATTERN.test(jabatan) || OPERATIONAL_SUPPORT_PATTERN.test(divisi);
}

/**
 * True bila karyawan (master_karyawan) layak menjadi approver HRD berdasarkan
 * jabatannya. Divisi saja TIDAK cukup (divisi HRGA terlalu luas).
 */
export function isHrFallbackEmployee(record = {}) {
  if (isOperationalSupport(record)) return false;
  return HR_JABATAN_PATTERN.test(text(record.jabatan ?? record.posisi));
}

/**
 * Susun daftar penerima untuk role HRD.
 *
 * @param {object} params
 * @param {Array<object>} params.users      dokumen koleksi `users`
 * @param {Array<object>} params.employees  dokumen koleksi `master_karyawan`
 * @param {(user?:object, employee?:object)=>string} [params.emailFor] resolver email
 * @returns {Array<{username:string,nama:string,nik:string,role:string,email:string}>}
 */
export function resolveHrdRecipients({ users = [], employees = [], emailFor } = {}) {
  const recipients = [];
  const seen = new Set();
  const emailOf = (user, employee) => (typeof emailFor === "function" ? text(emailFor(user, employee)) : "");

  const push = (target) => {
    const key = lower(target.email) || lower(target.username) || lower(target.nama);
    if (!key || seen.has(key)) return;
    seen.add(key);
    recipients.push(target);
  };

  // 1) Role-based: HRD / SUPERADMIN (sumber utama).
  for (const user of users) {
    if (!HR_ROLES.includes(upper(user.role))) continue;
    if (isOperationalSupport(user)) continue;
    push({
      username: text(user.username ?? user.id),
      nama: text(user.nama),
      nik: text(user.nik),
      role: upper(user.role),
      email: emailOf(user)
    });
  }

  // 2) Fallback jabatan HR untuk staf HR yang belum diberi role khusus.
  for (const employee of employees) {
    if (!isHrFallbackEmployee(employee)) continue;
    const nama = text(employee.nama_karyawan ?? employee.nama);
    if (!nama) continue;
    const matchedUser = users.find((user) => lower(user.nama) === lower(nama));
    if (matchedUser && isOperationalSupport(matchedUser)) continue;
    push({
      username: text(matchedUser?.username ?? employee.username ?? employee.id ?? employee.nik_karyawan ?? employee.nik),
      nama,
      nik: text(employee.nik_karyawan ?? employee.nik),
      role: upper(matchedUser?.role),
      email: emailOf(matchedUser, employee)
    });
  }

  return recipients;
}

/**
 * Buang penerima yang posisinya tidak berwenang (security/OB/GA/driver) dari
 * daftar approver pada tahap persetujuan.
 */
export function filterApprovalTargets(targets = []) {
  return (targets || []).filter((target) => target && !isOperationalSupport(target));
}
