const DAY_NAMES = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];

function normalize(value) {
  return String(value || "")
    .replace(/jum['’]?at/gi, "jumat")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dayIndex(value) {
  return DAY_NAMES.indexOf(normalize(value).replace(/\s+/g, ""));
}

export function scheduleAppliesToDate(dayRule, dateValue) {
  const rule = normalize(dayRule);
  if (!rule || rule === "semua" || rule.includes("setiap hari") || rule.includes("semua hari")) return true;

  const date = new Date(`${String(dateValue || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return true;
  const targetIndex = date.getDay();
  const targetName = DAY_NAMES[targetIndex];
  if (rule.split(" ").includes(targetName)) return true;

  const compactRule = String(dayRule || "")
    .toLowerCase()
    .replace(/jum['’]?at/g, "jumat")
    .replace(/s\.?\s*d\.?|sampai|hingga/g, "-");
  const range = compactRule.match(/(minggu|senin|selasa|rabu|kamis|jumat|sabtu)\s*-\s*(minggu|senin|selasa|rabu|kamis|jumat|sabtu)/);
  if (!range) return false;

  const start = dayIndex(range[1]);
  const end = dayIndex(range[2]);
  if (start <= end) return targetIndex >= start && targetIndex <= end;
  return targetIndex >= start || targetIndex <= end;
}

export function resolveWorkSchedule(employee, schedules = [], dateValue = "") {
  const position = normalize(employee?.jabatan || employee?.posisi);
  const candidates = (Array.isArray(schedules) ? schedules : [])
    .filter(schedule => scheduleAppliesToDate(schedule?.hari, dateValue));

  const isDefault = schedule => {
    const value = normalize(schedule?.jabatan);
    return !value || ["all", "semua", "semua jabatan"].includes(value);
  };
  const exact = candidates.find(schedule => position && normalize(schedule?.jabatan) === position);
  const partial = candidates.find(schedule => {
    const configured = normalize(schedule?.jabatan);
    return position && configured && !isDefault(schedule)
      && (position.includes(configured) || configured.includes(position));
  });
  const schedule = exact || partial || candidates.find(isDefault);
  const masuk = String(schedule?.masuk || "").trim();
  const pulang = String(schedule?.pulang || "").trim();
  const configuredLabel = String(schedule?.nama || schedule?.shift || schedule?.jam_kerja || "").trim();
  const jamKerja = configuredLabel || (masuk && pulang ? `${masuk} - ${pulang}` : masuk || pulang);

  return { masuk, pulang, jamKerja };
}
