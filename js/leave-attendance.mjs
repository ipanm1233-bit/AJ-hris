function text(value) {
  return String(value || "").trim();
}

function time(value) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

export function isHalfDayLeave(leave) {
  const detail = leave?.detail || {};
  const marker = [
    leave?.type_cuti, leave?.jenis_cuti, leave?.kategori_cuti,
    detail?.jenis_cuti, leave?.tipe_hari, detail?.tipe_hari
  ].filter(Boolean).join(" ").toLowerCase();
  return Boolean(
    leave?.isHalfDay || leave?.is_half_day || detail?.isHalfDay || detail?.is_half_day ||
    Number(leave?.count) === 0.5 || Number(leave?.jumlah_hari) === 0.5 ||
    Number(detail?.count) === 0.5 || Number(detail?.jumlah_hari) === 0.5 ||
    marker.includes("setengah") || marker.includes("1/2")
  );
}

export function getHalfDaySession(leave) {
  if (!isHalfDayLeave(leave)) return null;
  const detail = leave?.detail || {};
  const raw = text(leave?.sesi_cuti || detail?.sesi_cuti || leave?.sesi || detail?.sesi).toLowerCase();
  if (raw.includes("siang") || raw.includes("sore")) return "afternoon";
  if (raw.includes("pagi")) return "morning";

  const leaveStart = time(leave?.jam_keluar || detail?.jam_keluar || leave?.jam_mulai || detail?.jam_mulai);
  return leaveStart && leaveStart >= "11:00" ? "afternoon" : "morning";
}

export function getHalfDayWorkWindow(leave, shift = {}) {
  const session = getHalfDaySession(leave);
  if (!session) return null;
  const detail = leave?.detail || {};
  const leaveStart = time(leave?.jam_keluar || detail?.jam_keluar || leave?.jam_mulai || detail?.jam_mulai || leave?.waktu_keluar || detail?.waktu_keluar);
  const leaveEnd = time(leave?.jam_kembali || detail?.jam_kembali || leave?.jam_masuk || detail?.jam_masuk || leave?.jam_selesai || detail?.jam_selesai || leave?.waktu_masuk || detail?.waktu_masuk);
  const scheduledStart = time(shift?.masuk || shift?.jadwal_masuk);
  const scheduledEnd = time(shift?.pulang || shift?.jadwal_keluar);

  if (session === "morning") {
    return {
      session,
      masuk: leaveEnd || "12:00",
      pulang: scheduledEnd,
      label: "CUTI PAGI — HADIR SIANG"
    };
  }
  return {
    session,
    masuk: scheduledStart,
    pulang: leaveStart || "12:00",
    label: "HADIR PAGI — CUTI SIANG"
  };
}

export function applyHalfDayWorkWindow(row, leave) {
  const window = getHalfDayWorkWindow(leave, {
    masuk: row?.jadwal_masuk,
    pulang: row?.jadwal_keluar
  });
  if (!window) return row;
  return {
    ...row,
    jadwal_masuk: window.masuk || row?.jadwal_masuk || "",
    jadwal_keluar: window.pulang || row?.jadwal_keluar || "",
    jam_kerja: window.masuk && window.pulang ? `${window.masuk} - ${window.pulang}` : (row?.jam_kerja || ""),
    half_day_session: window.session,
    half_day_status: window.label
  };
}
