/**
 * =====================================================================
 * EMPLOYEE-DATES.MJS
 * =====================================================================
 * Normalisasi tanggal "date-only" (tanggal lahir, tanggal join, kontrak)
 * tanpa menggeser hari karena konversi zona waktu.
 *
 * Data lama hasil migrasi menyimpan dua alias:
 * - tgl_lahir / tgl_join   (nilai sumber, biasanya sudah benar)
 * - tanggal_lahir / tanggal_join (hasil konversi Date, bisa mundur 1 hari)
 *
 * Helper di sini memilih alias sumber lebih dulu, lalu menormalkan nilai
 * menjadi YYYY-MM-DD.
 * =====================================================================
 */

function pad2(value) {
  return String(value).padStart(2, "0");
}

function keyFromLocalDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function keyFromUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dateKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  // Date-only yang diparse sebagai UTC midnight harus tetap memakai tanggal UTC.
  const isUtcMidnight = date.getUTCHours() === 0
    && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0
    && date.getUTCMilliseconds() === 0;
  return isUtcMidnight ? keyFromUtcDate(date) : keyFromLocalDate(date);
}

/**
 * Ubah berbagai format tanggal menjadi YYYY-MM-DD untuk field date-only.
 * String YYYY-MM-DD dan DD/MM/YYYY dibaca langsung tanpa konversi timezone.
 */
export function normalizeDateOnly(value) {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date) return dateKeyFromDate(value);

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        return dateKeyFromDate(value.toDate());
      } catch {
        return "";
      }
    }
    if (Number.isFinite(Number(value.seconds))) {
      return dateKeyFromDate(new Date(Number(value.seconds) * 1000));
    }
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Serial tanggal Excel.
    if (value > 20000 && value < 80000) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      return keyFromUtcDate(new Date(excelEpoch + Math.round(value * 86400000)));
    }
    return dateKeyFromDate(new Date(value));
  }

  const text = String(value).trim();
  if (!text) return "";

  // YYYY-MM-DD / YYYY/MM/DD tanpa waktu: pertahankan hari yang tertulis.
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
  }

  // DD/MM/YYYY atau DD-MM-YYYY tanpa waktu.
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    return `${match[3]}-${pad2(match[2])}-${pad2(match[1])}`;
  }

  // Angka serial dalam bentuk string.
  if (/^\d+(\.\d+)?$/.test(text)) {
    return normalizeDateOnly(Number(text));
  }

  // String dengan waktu/ISO: parse, lalu pilih tanggal UTC untuk UTC midnight
  // atau tanggal lokal untuk timestamp dengan jam.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : dateKeyFromDate(parsed);
}

/** Tanggal lahir yang benar: alias sumber tgl_lahir diprioritaskan. */
export function employeeBirthDate(employee = {}) {
  return normalizeDateOnly(
    employee.tgl_lahir
    || employee.tanggal_lahir
    || employee.tgl_lahir_karyawan
    || employee.dob
    || employee.date_of_birth
  );
}

/** Tanggal join yang benar: alias sumber tgl_join diprioritaskan. */
export function employeeJoinDate(employee = {}) {
  return normalizeDateOnly(
    employee.tgl_join
    || employee.tanggal_join
    || employee.tgl_masuk
    || employee.tanggal_masuk
    || employee.tgl_bergabung
    || employee.join_date
  );
}

export function employeeContractEndDate(employee = {}) {
  return normalizeDateOnly(
    employee.kontrak_habis
    || employee.tanggal_kontrak_berakhir
    || employee.tgl_kontrak_habis
  );
}

/**
 * Salin record karyawan dengan field tanggal yang sudah dinormalkan.
 * Record asli tidak diubah.
 */
export function normalizeEmployeeDateFields(employee = {}) {
  if (!employee || typeof employee !== "object") return employee;

  const next = { ...employee };
  const birth = employeeBirthDate(employee);
  if (birth) {
    next.tanggal_lahir = birth;
    next.tgl_lahir = birth;
  }

  const join = employeeJoinDate(employee);
  if (join) {
    next.tanggal_join = join;
    next.tgl_join = join;
  }

  const contract = employeeContractEndDate(employee);
  if (contract) next.kontrak_habis = contract;

  return next;
}
