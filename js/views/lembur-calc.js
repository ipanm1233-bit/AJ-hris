/**
 * =====================================================================
 * LEMBUR-CALC.JS — Mesin Konversi Jam Lembur & Kepatuhan HRIS Andela Jaya
 * Standar Kebijakan Internal Andela Jaya & PP No 35 Tahun 2021
 * 
 * PENTING: HRIS Andela Jaya HANYA menghitung Jam Lembur Final (Satuan Jam Penuh)
 * dan TIDAK menghitung/menampilkan nominal rupiah upah lembur.
 * =====================================================================
 */

export const DAY_TYPES = {
  KERJA: "Hari Kerja",
  ISTIRAHAT: "Hari Istirahat Mingguan",
  LIBUR_RESMI: "Hari Libur Resmi"
};

export const POLICY_VERSION = "ANDELA-POLICY-V1.1-2026";

export const DEFAULT_OVERTIME_CONFIG = {
  policyVersion: POLICY_VERSION,
  minEligibleMinutes: 60, // Di bawah 60 menit = 0 jam
  roundingMethod: "FLOOR_TO_FULL_HOUR", // Pembulatan ke bawah ke jam penuh
  dailyCapHours: 4, // Maksimum 4 jam per hari / transaksi pada rekap internal
  maxWeeklyHoursWarning: 18, // Peringatan kepatuhan mingguan (>18 jam)
  mealMinHoursThreshold: 4, // Wajib makanan & minuman jika >= 4 jam (240 menit)
  defaultApprovalLevel: "1_LEVEL" // 1_LEVEL atau 2_LEVEL
};

/**
 * Menghitung selisih waktu dalam satuan menit
 */
export function calculateDurationMinutes(startTime, endTime, breakMinutes = 0) {
  if (!startTime || !endTime) return 0;
  const d1 = new Date(`2000-01-01T${startTime}:00`);
  let d2 = new Date(`2000-01-01T${endTime}:00`);
  if (d2 < d1) {
    d2.setDate(d2.getDate() + 1); // melewati tengah malam (lintas hari)
  }
  const grossMinutes = Math.round((d2 - d1) / (1000 * 60));
  const netMinutes = Math.max(0, grossMinutes - (Number(breakMinutes) || 0));
  return netMinutes;
}

/**
 * Format menit ke string tampilan jam & menit (misal: "2 jam 30 menit" atau "150 menit")
 */
export function fmtMinutesToDisplay(minutes = 0) {
  const m = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours > 0 && mins > 0) return `${hours} jam ${mins} menit (${m} menit)`;
  if (hours > 0) return `${hours} jam (${m} menit)`;
  return `${mins} menit`;
}

/**
 * Format menit ke string durasi OT standar format (misal: "02:33")
 */
export function formatOtDuration(minutes = 0) {
  const m = Math.max(0, Number(minutes) || 0);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Mendapatkan nama hari bahasa Indonesia dari tanggal ISO (YYYY-MM-DD)
 */
export function getIndonesianDayName(dateString) {
  if (!dateString) return "-";
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    return days[d.getDay()] || "-";
  } catch {
    return "-";
  }
}

/**
 * Mendapatkan nama bulan bahasa Indonesia dari tanggal ISO (YYYY-MM-DD)
 */
export function getIndonesianMonthName(dateString) {
  if (!dateString) return "-";
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    return months[d.getMonth()] || "-";
  } catch {
    return "-";
  }
}

/**
 * Konversi Durasi Aktual (Menit) ke Jam Lembur Andela & Total Jam Tertimbang
 * Sesuai Bagian 20 Aturan Konversi Jam Andela & FR-11:
 * 
 * actual_minutes = scan_pulang - start_ot - istirahat
 * if actual_minutes < 60:
 *     counted_minutes = 0
 * else:
 *     counted_minutes = min(actual_minutes, 240)
 * 
 * JAM = floor(counted_minutes / 60)
 * MENIT = counted_minutes mod 60 (or actual_minutes for display if < 60)
 * JAM_PERTAMA = 1.5 if JAM >= 1 else 0
 * JAM_KEDUA_DST = max(JAM - 1, 0) * 2
 * MINUTE = 0.5 if JAM >= 1 and MENIT >= 30 else 0
 * TOTAL_JAM_LEMBUR = JAM_PERTAMA + JAM_KEDUA_DST + MINUTE
 * UM_LEMBUR = 1 if JAM >= 3 else 0
 */
export function calculateAndelaHours(actualMinutes = 0, config = DEFAULT_OVERTIME_CONFIG) {
  const cfg = { ...DEFAULT_OVERTIME_CONFIG, ...(config || {}) };
  const mins = Math.max(0, Number(actualMinutes) || 0);
  const minEligible = cfg.minEligibleMinutes || 60;
  const capHours = cfg.dailyCapHours || 4;
  const capMinutes = capHours * 60;

  let countedMinutes = 0;
  let jam = 0;
  let menit = 0;

  if (mins < minEligible) {
    countedMinutes = 0;
    jam = 0;
    menit = mins; // Sisa menit aktual
  } else {
    countedMinutes = Math.min(mins, capMinutes);
    jam = Math.floor(countedMinutes / 60);
    menit = countedMinutes % 60;
  }

  // Komponen perhitungan lembur berbobot Andela
  const jamPertama = jam >= 1 ? 1.5 : 0;
  const jamKeduaDst = Math.max(jam - 1, 0) * 2;
  const minute = (jam >= 1 && menit >= 30) ? 0.5 : 0;
  const totalJamLembur = jamPertama + jamKeduaDst + minute;
  const umLembur = jam >= 3 ? 1 : 0; // Uang Makan Lembur jika JAM >= 3

  const isOverCap = mins > capMinutes;
  const isMealMandatory = mins >= ((cfg.mealMinHoursThreshold || 4) * 60);

  return {
    actualMinutes: mins,
    countedMinutes,
    jam,
    menit,
    jamPertama,
    jamKeduaDst,
    minute,
    totalJamLembur,
    umLembur,
    countedFullHours: jam,
    approvedHoursHr: jam, // Jam penuh disetujui HR (maks 4 jam)
    dailyCapHours: capHours,
    minEligibleMinutes: minEligible,
    policyVersion: cfg.policyVersion || POLICY_VERSION,
    roundingMethod: "FLOOR_TO_FULL_HOUR",
    isUnderOneHour: mins < minEligible,
    isOverCap,
    isMealMandatory,
    notes: mins < minEligible
      ? "Durasi di bawah 60 menit (0 jam)"
      : isOverCap
        ? `Durasi aktual ${mins} menit (${Math.floor(mins/60)} jam ${mins%60}m) melebihi batas harian 4 jam. Rekap dicatat ${jam} jam penuh dengan flag pengecualian.`
        : `Dihitung ${jam} jam penuh (Total Jam Lembur: ${totalJamLembur}).`
  };
}

/**
 * Generate Format Nomor Dokumen SPPKL Resmi
 * Contoh: SPPKL/ANDELA/2026/000123
 */
export function generateSppklNumber(existingCount = 0, prefix = "SPPKL/ANDELA") {
  const year = new Date().getFullYear();
  const seq = String(existingCount + 1).padStart(6, "0");
  return `${prefix}/${year}/${seq}`;
}

/**
 * Deteksi Selisih & Flag Kepatuhan Realisasi Lembur
 */
export function detectOvertimeVariances(orderPlan, realization, absensiData, config = DEFAULT_OVERTIME_CONFIG) {
  const flags = [];
  const planMinutes = Number(orderPlan?.planned_minutes || (Number(orderPlan?.durasi_jam || orderPlan?.durasi_rencana || 0) * 60));
  const actualMinutes = Number(realization?.actual_minutes || realization?.durasi_aktual_menit || (Number(realization?.durasi_aktual || 0) * 60));

  if (actualMinutes > planMinutes && planMinutes > 0) {
    const diffMin = actualMinutes - planMinutes;
    flags.push({
      type: "EXCEEDS_PLAN",
      severity: "warning",
      label: `Melebihi Rencana (+${diffMin} menit)`,
      description: "Realisasi jam aktual lebih lama dibanding perintah rencana. Wajib ada klarifikasi atasan."
    });
  } else if (actualMinutes < planMinutes && actualMinutes > 0) {
    const diffMin = planMinutes - actualMinutes;
    flags.push({
      type: "BELOW_PLAN",
      severity: "info",
      label: `Lebih Pendek dari Rencana (-${diffMin} menit)`,
      description: "Pekerjaan selesai lebih awal atau durasi lebih pendek dari perintah."
    });
  }

  if (actualMinutes > 240) {
    flags.push({
      type: "OVER_4_HOURS",
      severity: "alert",
      label: "Aktual Melebihi Batas 4 Jam",
      description: "Durasi aktual melebihi 240 menit (4 jam). Wajib ditinjau khusus oleh HR/Manajemen."
    });
  }

  if (!absensiData || (!absensiData.jam_masuk && !absensiData.jam_pulang)) {
    flags.push({
      type: "NO_ATTENDANCE",
      severity: "alert",
      label: "Tidak Ada Log Absensi",
      description: "Log kehadiran mesin/GPS tidak ditemukan pada tanggal ini. Perlu bukti pekerjaan/lampiran."
    });
  }

  if (actualMinutes >= ((config?.mealMinHoursThreshold || 4) * 60)) {
    flags.push({
      type: "MEAL_MANDATORY",
      severity: "compliance",
      label: "Wajib Makanan/Minuman (≥4 Jam)",
      description: "Sesuai PP 35/2021 Pasal 29 ayat (1) huruf b, perusahaan wajib menyediakan makanan & minuman sekurang-kurangnya 1.400 kkal."
    });
  }

  return flags;
}
