function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function isDoctorCertifiedSickLeave(config = {}) {
  const id = normalized(config.id || config.kode || config.code).toUpperCase();
  const label = normalized(config.name || config.nama || config.label || config.type_cuti || config.jenis_cuti);
  const combined = `${normalized(id)} ${label}`;

  if (/tanpa\s+(surat|keterangan)\s+dokter/.test(combined)) return false;
  if (id === "S") return true;
  return /(sakit).*(dengan|dgn).*(surat|keterangan)\s+dokter/.test(combined)
    || /(surat|keterangan)\s+dokter/.test(combined);
}

export function isSickLeave(config = {}) {
  const id = normalized(config.id || config.kode || config.code).toUpperCase();
  const label = normalized(config.name || config.nama || config.label || config.type_cuti || config.jenis_cuti);
  return id === "S" || id === "S-" || /\bsakit\b/.test(label);
}

export function resolveEffectiveLeaveDeduction(config = {}) {
  if (isDoctorCertifiedSickLeave(config)) return "Tidak Dipotong";
  return config.potong || config.potong_jatah || "Tahunan";
}

export function isAlphaLeave(config = {}) {
  const id = normalized(config.id || config.kode || config.code || config.jenis_cuti).toUpperCase();
  const label = normalized(config.name || config.nama || config.label || config.type_cuti || config.jenis_cuti || config.kategori_cuti);
  return id === "A" || /^a\s*-/.test(label) || /\balfa\b|\bmangkir\b/.test(label);
}

export function isSalaryDeductionLeave(config = {}) {
  const id = normalized(config.id || config.kode || config.code || config.jenis_cuti).toUpperCase();
  const label = normalized(config.name || config.nama || config.label || config.type_cuti || config.jenis_cuti || config.kategori_cuti);
  return id === "C-" || id === "C-1/2" || /potong\s+gaji|unpaid/.test(label);
}
