// Rujukan dari (FINAL) PERATURAN PERUSAHAAN CV ANDELA JAYA, periode 2024–2025.
// Katalog ini membantu pencatatan fakta; bukan aturan sanksi otomatis atau bukti
// bahwa dokumen tersebut masih berlaku. HR harus memeriksa versi yang berlaku.
export const COMPANY_POLICY = Object.freeze({
  title: "Peraturan Perusahaan CV Andela Jaya",
  period: "2024–2025",
  status: "Arsip; masa berlaku perlu diverifikasi HR"
});

export const POLICY_ARTICLES = Object.freeze([
  { id: "9", label: "Pasal 9 — Kewajiban karyawan", page: 5 },
  { id: "10", label: "Pasal 10 — Tata tertib bekerja dan keselamatan", page: 5 },
  { id: "11", label: "Pasal 11 — Kerahasiaan", page: 6 },
  { id: "12", label: "Pasal 12 — Penggunaan barang perusahaan", page: 6 },
  { id: "13", label: "Pasal 13 — Pencegahan kebakaran", page: 6 },
  { id: "14", label: "Pasal 14 — Penerimaan hadiah atau komisi", page: 7 },
  { id: "15", label: "Pasal 15 — Pekerjaan atau jabatan lain", page: 7 },
  { id: "32-jam", label: "Pasal 32 (hari dan jam kerja) — Jadwal kerja", page: 15 },
  { id: "34", label: "Pasal 34 — Pemberitahuan sakit", page: 15 },
  { id: "37", label: "Pasal 37 — Ketidakhadiran tanpa izin", page: 16 },
  { id: "41", label: "Pasal 41 — Prosedur cuti", page: 18 },
  { id: "42", label: "Pasal 42 — Sanksi", page: 18 },
  { id: "43", label: "Pasal 43 — Surat peringatan", page: 18 }
]);

export const POLICY_BASIS = Object.freeze(["Tidak terkait pelanggaran", "Peraturan Perusahaan", "SOP", "Peraturan Perusahaan dan SOP"]);
export const POLICY_DECISIONS = Object.freeze(["Belum ditentukan", "Coaching / konseling", "Tinjau untuk SP"]);

export function assessPolicyDecision({ basis, articleId, sopReference, evidence, employeeStatement, decision, rationale, currentRuleConfirmed }) {
  if (decision !== "Tinjau untuk SP") return [];
  const missing = [];
  if (basis === "Tidak terkait pelanggaran" || !POLICY_BASIS.includes(basis)) missing.push("pilih dasar pelanggaran PP atau SOP");
  if (basis?.includes("Peraturan Perusahaan") && !POLICY_ARTICLES.some(a => a.id === articleId)) missing.push("pilih pasal PP");
  if (basis?.includes("SOP") && !String(sopReference || "").trim()) missing.push("isi identitas dan butir SOP");
  if (!String(evidence || "").trim()) missing.push("catat bukti yang dapat diperiksa");
  if (!String(employeeStatement || "").trim()) missing.push("catat klarifikasi karyawan");
  if (!String(rationale || "").trim()) missing.push("jelaskan alasan usulan SP");
  if (!currentRuleConfirmed) missing.push("verifikasi aturan yang masih berlaku");
  return missing;
}
