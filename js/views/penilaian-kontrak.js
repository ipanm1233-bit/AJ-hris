import { db, COL, collection, query, where, getDocs, getDoc, setDoc, doc, limit } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, confirmDialog, toast, genId, fmtDateShort, escapeHtml, sendEmailNotif, buildStandardEmailHtml, createLoginToken, notifyUser, daysBetween, formatStatusKaryawan, downloadXlsx, ensureXlsxLoaded, formatPhoneNumberForWa, openWhatsAppMessage, getEmployeePhoneByName, buildKpiTaskWaMessage } from "../utils.js";
import { renderCrudModule, badge, emptyState, skeletonRows, avatar, openPenilaianFormFromNotif } from "../components.js";
import { FULL_ACCESS_ROLES, ATASAN_VIEW_ROLES, getBawahanNames, hasSubMenuAccess, canEditModuleData } from "../auth.js";
import { COMPANY_NAME, logoImgTag, isoDocHeaderTable } from "../branding.js";
import { uploadFileToDrive } from "../gas-integration.js";

// =====================================================================
// MASTER INDIKATOR PENILAIAN HARIAN & TARGET BULANAN
// =====================================================================
export const SALES_LAMPIRAN1_INDICATORS = [
 { principle: "ICI", aspek: "Sales Volume (SO)", indikator: "Volume Dulux", unit: "Ton / Liter / Kaleng", key: "volume_dulux", defaultTarget: 10 },
 { principle: "ICI", aspek: "Sales Volume (SO)", indikator: "Volume Catylac", unit: "Ton / Liter / Kaleng", key: "volume_catylac", defaultTarget: 15 },
 { principle: "ICI", aspek: "Sales Volume (SO)", indikator: "Volume Maxilite", unit: "Ton / Liter / Kaleng", key: "volume_maxilite", defaultTarget: 10 },
 { principle: "ICI", aspek: "Sales Volume (SO)", indikator: "Volume Aquashield", unit: "Ton / Liter / Kaleng", key: "volume_aquashield", defaultTarget: 5 },
 { principle: "ICI", aspek: "Sales Volume (SO)", indikator: "Total Weighted Target", unit: "% Capaian", key: "total_weighted_target", defaultTarget: 100 },
 { principle: "ALL", aspek: "Value Penjualan Tertagih", indikator: "Value Penjualan Tertagih", unit: "Rp", key: "value_penjualan_tertagih", defaultTarget: 100000000 },
 { principle: "ALL", aspek: "Over due ( sisa piutang Toko )", indikator: "Over due Piutang Toko", unit: "Rp (Max Limit)", key: "overdue_piutang", defaultTarget: 20000000 },
 { principle: "ICI", aspek: "AO - ICI", indikator: "Active Outlet ICI", unit: "Toko", key: "ao_ici", defaultTarget: 25 },
 { principle: "PRIMA", aspek: "Sales Value (SO) - Tertagih", indikator: "Sales Value PRIMA Tertagih", unit: "Rp", key: "sales_value_prima", defaultTarget: 50000000 },
 { principle: "PRIMA", aspek: "AO", indikator: "Active Outlet PRIMA", unit: "Toko", key: "ao_prima", defaultTarget: 15 },
 { principle: "DCOTA", aspek: "Sales Value (SO) - Tertagih", indikator: "Sales Value DCOTA Tertagih", unit: "Rp", key: "sales_value_dcota", defaultTarget: 50000000 },
 { principle: "DCOTA", aspek: "AO", indikator: "Active Outlet DCOTA", unit: "Toko", key: "ao_dcota", defaultTarget: 15 },
];

export const NON_SALES_INDICATORS = [
 { principle: "OPERASIONAL", aspek: "SOP & Ketepatan Kerja", indikator: "Target Kinerja & Tugas Harian", unit: "% Capaian", key: "sop_tugas", defaultTarget: 100 },
 { principle: "PELAYANAN", aspek: "Respon & Pelayanan Divisi", indikator: "Kepuasan User & Bebas Komplain Divisi Lain", unit: "% SLA", key: "respon_divisi", defaultTarget: 100 },
 { principle: "DISIPLIN", aspek: "Kedisiplinan & Kehadiran", indikator: "Kedisiplinan Waktu & Absensi", unit: "% Kehadiran", key: "kedisiplinan", defaultTarget: 100 },
 { principle: "TEAMWORK", aspek: "Inisiatif & Kerjasama Team", indikator: "Kinerja Proaktif & Kerjasama Team", unit: "% Nilai", key: "inisiatif_team", defaultTarget: 100 }
];

export async function getEmployeeCustomIndicators(empKey, defaultCategory = "NON_SALES") {
  const cleanKey = (empKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const storageKey = "HRIS_CUSTOM_KPI_IND_" + cleanKey;
  try {
    const local = localStorage.getItem(storageKey);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  try {
    const docRef = doc(db, COL.APP_SETTINGS, storageKey);
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data()?.indicators) {
      const list = snap.data().indicators;
      if (Array.isArray(list) && list.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(list));
        return list;
      }
    }
  } catch (e) {}

  return defaultCategory === "SALES"
    ? JSON.parse(JSON.stringify(SALES_LAMPIRAN1_INDICATORS))
    : JSON.parse(JSON.stringify(NON_SALES_INDICATORS));
}

export async function saveEmployeeCustomIndicators(empKey, indicators) {
  if (!empKey || !Array.isArray(indicators) || indicators.length === 0) return;
  const cleanKey = (empKey || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const storageKey = "HRIS_CUSTOM_KPI_IND_" + cleanKey;
  try {
    localStorage.setItem(storageKey, JSON.stringify(indicators));
    const docRef = doc(db, COL.APP_SETTINGS, storageKey);
    await setDoc(docRef, { indicators: indicators, updated_at: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.warn("Could not save custom indicators template:", e);
  }
}

// =====================================================================
// PETA KATEGORI & OPSI REKOMENDASI PENILAIAN
// =====================================================================
export const JENIS_PENILAIAN_MAP = {
 MASA_PERCOBAAN: {
 key: "MASA_PERCOBAAN",
 label: "Evaluasi Masa Percobaan (Probation)",
 icon: "clock",
 badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
 options: [
 "Sangat Baik - Lulus Masa Percobaan (Karyawan Tetap)",
 "Baik - Lulus Masa Percobaan",
 "Cukup - Perpanjang Masa Percobaan (1-3 Bulan)",
 "Kurang - Tidak Lulus Masa Percobaan / Evaluasi"
 ]
 },
 KONTRAK: {
 key: "KONTRAK",
 label: "Perpanjangan Kontrak",
 icon: "doc-plus",
 badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
 options: [
 "Perpanjang Kontrak 3 Bulan",
 "Perpanjang Kontrak 6 Bulan",
 "Perpanjang Kontrak 9 Bulan",
 "Perpanjang Kontrak 12 Bulan",
 "Tidak Diperpanjang (Putus Kontrak)",
 "Direkomendasikan Karyawan Tetap (Kartap)"
 ]
 },
 KARTAP: {
 key: "KARTAP",
 label: "Rekomendasi Karyawan Tetap (Kartap)",
 icon: "star",
 badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
 options: [
 "Direkomendasikan Menjadi Karyawan Tetap",
 "Diperpanjang Kontrak Kembali (3 Bulan)",
 "Diperpanjang Kontrak Kembali (6 Bulan)",
 "Diperpanjang Kontrak Kembali (12 Bulan)",
 "Tidak Direkomendasikan (Putus Hubungan Kerja)"
 ]
 },
 PIP: {
 key: "PIP",
 label: "Penilaian PIP (Performance Improvement Plan)",
 icon: "",
 badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
 options: [
 "Lulus PIP (Performa Membaik / Lanjut Kerja)",
 "Perpanjang Masa PIP (1 - 3 Bulan)",
 "Gagal PIP (Demosi / Sanksi / PHK)"
 ]
 },
 MUTASI_DEMOSI: {
 key: "MUTASI_DEMOSI",
 label: "Penilaian Mutasi / Demosi / Promosi",
 icon: "",
 badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
 options: [
 "Direkomendasikan Mutasi Jabatan / Divisi",
 "Direkomendasikan Demosi Jabatan",
 "Direkomendasikan Promosi Jabatan",
 "Tetap Pada Posisi Saat Ini"
 ]
 },
 KPI_360: {
 key: "KPI_360",
 label: "Penilaian KPI 360",
 icon: "",
 badgeClass: "bg-maroon-50 text-maroon-700 border-maroon-200",
 options: [
 "Kinerja Sangat Baik (Apresiasi / Bonus)",
 "Kinerja Memenuhi Ekspektasi (Dipertahankan)",
 "Kinerja Perlu Perbaikan (Evaluasi / Guidance)",
 "Saran Pelatihan & Peningkatan Kompetensi"
 ]
 }
};

// =====================================================================
// DEFAULT RULES STANDAR GRADE PENILAIAN HRD
// =====================================================================
export const DEFAULT_GRADE_RULES = {
 MASA_PERCOBAAN: [
 { min: 91, max: 100, predikat: "Sangat Baik", rekomendasi: "Sangat Baik - Lulus Masa Percobaan (Karyawan Tetap)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
 { min: 81, max: 90, predikat: "Baik", rekomendasi: "Baik - Lulus Masa Percobaan", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
 { min: 0, max: 80, predikat: "Kurang", rekomendasi: "Kurang - Tidak Lulus Masa Percobaan / Evaluasi", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
 ],
 KONTRAK: [
 { min: 91, max: 100, predikat: "Sangat Baik", rekomendasi: "Direkomendasikan Karyawan Tetap (Kartap)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
 { min: 81, max: 90, predikat: "Baik", rekomendasi: "Perpanjang Kontrak 12 Bulan", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
 { min: 70, max: 80, predikat: "Cukup", rekomendasi: "Perpanjang Kontrak 6 Bulan", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
 { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Tidak Diperpanjang (Putus Kontrak)", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
 ],
 KARTAP: [
 { min: 91, max: 100, predikat: "Sangat Baik", rekomendasi: "Direkomendasikan Menjadi Karyawan Tetap", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
 { min: 81, max: 90, predikat: "Baik", rekomendasi: "Diperpanjang Kontrak Kembali (12 Bulan)", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
 { min: 70, max: 80, predikat: "Cukup", rekomendasi: "Diperpanjang Kontrak Kembali (6 Bulan)", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
 { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Tidak Direkomendasikan (Putus Hubungan Kerja)", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
 ],
 PIP: [
 { min: 85, max: 100, predikat: "Sangat Baik", rekomendasi: "Lulus PIP (Performa Membaik / Lanjut Kerja)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
 { min: 70, max: 84, predikat: "Cukup", rekomendasi: "Perpanjang Masa PIP (1 - 3 Bulan)", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
 { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Gagal PIP (Demosi / Sanksi / PHK)", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
 ],
 MUTASI_DEMOSI: [
 { min: 90, max: 100, predikat: "Sangat Baik", rekomendasi: "Direkomendasikan Promosi Jabatan", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
 { min: 75, max: 89, predikat: "Baik", rekomendasi: "Tetap Pada Posisi Saat Ini", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
 { min: 60, max: 74, predikat: "Cukup", rekomendasi: "Direkomendasikan Mutasi Jabatan / Divisi", badgeClass: "bg-purple-100 text-purple-800 border-purple-300" },
 { min: 0, max: 59, predikat: "Kurang", rekomendasi: "Direkomendasikan Demosi Jabatan", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
 ],
 KPI_360: [
 { min: 90, max: 100, predikat: "Sangat Baik", rekomendasi: "Kinerja Sangat Baik (Apresiasi / Bonus)", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
 { min: 80, max: 89, predikat: "Baik", rekomendasi: "Kinerja Memenuhi Ekspektasi (Dipertahankan)", badgeClass: "bg-blue-100 text-blue-800 border-blue-300" },
 { min: 70, max: 79, predikat: "Cukup", rekomendasi: "Kinerja Perlu Perbaikan (Evaluasi / Guidance)", badgeClass: "bg-amber-100 text-amber-800 border-amber-300" },
 { min: 0, max: 69, predikat: "Kurang", rekomendasi: "Saran Pelatihan & Peningkatan Kompetensi", badgeClass: "bg-rose-100 text-rose-800 border-rose-300" }
 ]
};

export function evaluateGradeRule(categoryKey, score, rulesMap = DEFAULT_GRADE_RULES) {
 const catKey = categoryKey || "KPI_360";
 const catRules = rulesMap[catKey] || rulesMap.KPI_360 || DEFAULT_GRADE_RULES.KPI_360;
 
 const numScore = parseFloat(score) || 0;
 for (const r of catRules) {
 if (numScore >= parseFloat(r.min) && numScore <= parseFloat(r.max)) {
 return {
 predikat: r.predikat,
 rekomendasi: r.rekomendasi,
 badgeClass: r.badgeClass || "bg-blue-100 text-blue-800 border-blue-300"
 };
 }
 }
 
 return {
 predikat: numScore >= 80 ? "Baik" : "Kurang",
 rekomendasi: catRules[0]?.rekomendasi || "Evaluasi",
 badgeClass: numScore >= 80 ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-rose-100 text-rose-800 border-rose-300"
 };
}

export function getCatConfig(key) {
 if (!key) return JENIS_PENILAIAN_MAP.KPI_360;
 if (JENIS_PENILAIAN_MAP[key]) return JENIS_PENILAIAN_MAP[key];
 if (key === "PERPANJANGAN_KONTRAK" || key === "KONTRAK_KERJA") return JENIS_PENILAIAN_MAP.KONTRAK;
 return JENIS_PENILAIAN_MAP.KPI_360;
}

let currentGradeRulesMap = DEFAULT_GRADE_RULES;

export function openGradeRulesModal(session, rulesMap, onSaveCallback) {
 let activeCategory = "MASA_PERCOBAAN";
 let workingRules = JSON.parse(JSON.stringify(rulesMap || currentGradeRulesMap || DEFAULT_GRADE_RULES));

 function renderCategoryRules() {
 const rulesList = workingRules[activeCategory] || DEFAULT_GRADE_RULES[activeCategory] || [];
 const catCfg = JENIS_PENILAIAN_MAP[activeCategory] || JENIS_PENILAIAN_MAP.KPI_360;

 const rowsHtml = rulesList.map((r, idx) => `
 <tr class="border-b border-slate-100">
 <td class="p-2">
 <div class="flex items-center gap-1 text-xs">
 <input type="number" data-idx="${idx}" data-field="min" value="${r.min}" min="0" max="100" class="rule-inp w-16 px-2 py-1 border border-slate-200 rounded font-bold text-center">
 <span>-</span>
 <input type="number" data-idx="${idx}" data-field="max" value="${r.max}" min="0" max="100" class="rule-inp w-16 px-2 py-1 border border-slate-200 rounded font-bold text-center">
 </div>
 </td>
 <td class="p-2">
 <input type="text" data-idx="${idx}" data-field="predikat" value="${escapeHtml(r.predikat || '')}" class="rule-inp w-full px-2 py-1 text-xs border border-slate-200 rounded font-bold text-slate-800" placeholder="Contoh: Sangat Baik / Baik / Kurang">
 </td>
 <td class="p-2">
 <input type="text" data-idx="${idx}" data-field="rekomendasi" value="${escapeHtml(r.rekomendasi || '')}" class="rule-inp w-full px-2 py-1 text-xs border border-slate-200 rounded font-medium text-slate-700" placeholder="Contoh: Lulus Masa Percobaan / Tidak Lulus">
 </td>
 <td class="p-2 text-center">
 <button data-del-rule="${idx}" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Hapus Aturan Tier Ini">
 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
 </button>
 </td>
 </tr>
 `).join("");

 return `
 <div class="space-y-4 text-left">
 <div class="p-3 bg-slate-800 text-white rounded-xl flex items-center justify-between">
 <div>
 <h3 class="font-bold text-sm flex items-center gap-2">
 <span>${catCfg.icon}</span>
 <span>${catCfg.label}</span>
 </h3>
 <p class="text-[11px] text-slate-300 mt-0.5">Atur rentang skor (misal >81 Lulus Masa Percobaan, <=80 Tidak Lulus), sebutan predikat, dan standar opsi rekomendasi otomatis.</p>
 </div>
 <button id="btn-add-rule-tier" class="px-3 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg text-xs font-bold transition shrink-0 shadow-2xs">+ Tambah Tier Range</button>
 </div>

 <div class="overflow-x-auto border border-slate-200 rounded-xl">
 <table class="w-full text-xs">
 <thead class="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200">
 <tr>
 <th class="p-2 text-left">Rentang Skor (Min - Max)</th>
 <th class="p-2 text-left">Sebutan Predikat (Grade)</th>
 <th class="p-2 text-left">Default Opsi Rekomendasi / Keputusan Auto-Suggest</th>
 <th class="p-2 text-center w-12">Hapus</th>
 </tr>
 </thead>
 <tbody id="tbl-rules-body" class="divide-y divide-slate-100 bg-white">
 ${rowsHtml.length ? rowsHtml : '<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada tier aturan untuk kategori ini.</td></tr>'}
 </tbody>
 </table>
 </div>
 </div>
 `;
 }

 openModal({
 title: "Pengaturan Standar Grade Penilaian & Keputusan HRD",
 size: "xl",
 bodyHtml: `
 <div class="space-y-4">
 <div class="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
 <span class="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Kategori Evaluasi:</span>
 ${Object.keys(JENIS_PENILAIAN_MAP).map(catKey => `
 <button data-cat-rule="${catKey}" class="btn-rule-cat px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${catKey === activeCategory ? 'bg-maroon-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
 ${JENIS_PENILAIAN_MAP[catKey].icon} ${JENIS_PENILAIAN_MAP[catKey].label}
 </button>
 `).join('')}
 </div>

 <div id="rule-category-content">
 ${renderCategoryRules()}
 </div>
 </div>
 `,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-reset-default-rules" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"> Reset ke Default Perusahaan</button>
 <div class="flex items-center gap-2">
 <button id="btn-cancel-grade-rules" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Batal</button>
 <button id="btn-save-grade-rules" class="px-5 py-2 bg-maroon-700 text-white rounded-lg text-xs font-bold hover:bg-maroon-800 transition shadow-md">Simpan Aturan Grade HRD</button>
 </div>
 </div>
 `,
 onMount: (m) => {
 const contentWrap = m.querySelector("#rule-category-content");

 function updateCategoryView() {
 m.querySelectorAll(".btn-rule-cat").forEach(btn => {
 if (btn.dataset.catRule === activeCategory) {
 btn.className = "btn-rule-cat px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap bg-maroon-700 text-white shadow-2xs";
 } else {
 btn.className = "btn-rule-cat px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap bg-slate-100 text-slate-600 hover:bg-slate-200";
 }
 });
 contentWrap.innerHTML = renderCategoryRules();
 bindRuleEvents();
 }

 function bindRuleEvents() {
 contentWrap.querySelectorAll(".rule-inp").forEach(inp => {
 inp.oninput = () => {
 const idx = parseInt(inp.dataset.idx, 10);
 const field = inp.dataset.field;
 if (workingRules[activeCategory] && workingRules[activeCategory][idx]) {
 workingRules[activeCategory][idx][field] = inp.value;
 }
 };
 });

 contentWrap.querySelectorAll("[data-del-rule]").forEach(btn => {
 btn.onclick = () => {
 const idx = parseInt(btn.dataset.delRule, 10);
 workingRules[activeCategory].splice(idx, 1);
 updateCategoryView();
 };
 });

 const addBtn = contentWrap.querySelector("#btn-add-rule-tier");
 if (addBtn) {
 addBtn.onclick = () => {
 if (!workingRules[activeCategory]) workingRules[activeCategory] = [];
 workingRules[activeCategory].push({
 min: 0,
 max: 100,
 predikat: "Baru",
 rekomendasi: "Rekomendasi Baru",
 badgeClass: "bg-blue-100 text-blue-800 border-blue-300"
 });
 updateCategoryView();
 };
 }
 }

 m.querySelectorAll(".btn-rule-cat").forEach(btn => {
 btn.onclick = () => {
 activeCategory = btn.dataset.catRule;
 updateCategoryView();
 };
 });

 bindRuleEvents();

 m.querySelector("#btn-reset-default-rules").onclick = async () => {
 if (await confirmDialog("Reset seluruh standar grade dan keputusan ke bawaan default perusahaan?")) {
 workingRules = JSON.parse(JSON.stringify(DEFAULT_GRADE_RULES));
 updateCategoryView();
 toast("Aturan di-reset ke default perusahaan.", "info");
 }
 };

 m.querySelector("#btn-cancel-grade-rules").onclick = closeModal;

 m.querySelector("#btn-save-grade-rules").onclick = async () => {
 const btnSave = m.querySelector("#btn-save-grade-rules");
 btnSave.disabled = true; btnSave.textContent = "Menyimpan Aturan...";
 try {
 await setDoc(doc(db, COL.APP_SETTINGS, "aturan_penilaian_grade"), {
 rules: workingRules,
 updated_by: session.nama,
 updated_at: new Date().toISOString()
 }, { merge: true });

 currentGradeRulesMap = workingRules;
 toast("Standar Grade & Keputusan HRD berhasil disimpan!", "success");
 if (typeof onSaveCallback === "function") onSaveCallback(workingRules);
 closeModal();
 } catch(err) {
 toast("Gagal menyimpan aturan: " + err.message, "error");
 btnSave.disabled = false; btnSave.textContent = "Simpan Aturan Grade HRD";
 }
 };
 }
 });
}

export async function mount(container, { session, params }) {
 const role = (session.role || "").toUpperCase();
 const isFullAccess = FULL_ACCESS_ROLES.includes(role);
 const isAtasanView = !isFullAccess && ATASAN_VIEW_ROLES.includes(role);
 const isHrdOrAdmin = isFullAccess || ["HRD", "SUPERADMIN", "ADMIN", "ADMINISTRATOR", "DIREKTUR", "GM", "FINANCE"].includes(role);
 const isAtasan = isAtasanView || ["MANAGER", "SPV", "KOORDINATOR", "BRANCH MANAGER"].includes(role);
 const isRegularEmployee = !isHrdOrAdmin && !isAtasan;
 const canManageKontrak = isFullAccess;
 const canEdit = await canEditModuleData(session);
 // Sub-menu: bisa diberikan HRD ke Atasan/karyawan tertentu tanpa naikkan
 // role mereka jadi HRD/SUPERADMIN penuh.
 const canStandarGrade = isHrdOrAdmin || await hasSubMenuAccess("penilaian-kontrak", "standar_grade", session);
 const canTemplateSoal = isHrdOrAdmin || await hasSubMenuAccess("penilaian-kontrak", "template_soal", session);
 const canDistribusiKpi360 = isHrdOrAdmin || await hasSubMenuAccess("penilaian-kontrak", "distribusi_kpi360", session);
 let bawahanNames = null;

 try {
 const snapRules = await getDoc(doc(db, COL.APP_SETTINGS, "aturan_penilaian_grade"));
 if (snapRules.exists() && snapRules.data()?.rules) {
 currentGradeRulesMap = { ...DEFAULT_GRADE_RULES, ...snapRules.data().rules };
 }
 } catch(e) {}

 const btnGradeCfg = container.querySelector("#btn-open-grade-config");
 if (btnGradeCfg && canStandarGrade) {
 btnGradeCfg.classList.remove("hidden");
 btnGradeCfg.onclick = () => {
 openGradeRulesModal(session, currentGradeRulesMap, (updated) => {
 currentGradeRulesMap = updated;
 });
 };
 }

 if (!canTemplateSoal) {
 const tplTabBtn = container.querySelector('[data-ntab="template"]');
 if (tplTabBtn) tplTabBtn.classList.add("hidden");
 }

 const panels = {
 kontrak: container.querySelector("#pk-panel-kontrak"),
 alur_perpanjangan: container.querySelector("#pk-panel-alur-perpanjangan"),
 kpi360: container.querySelector("#pk-panel-kpi360"),
 hasil: container.querySelector("#pk-panel-hasil"),
 evaluasi: container.querySelector("#pk-panel-evaluasi"),
 daily: container.querySelector("#pk-panel-daily"),
 template: container.querySelector("#pk-panel-template"),
 grafik: container.querySelector("#pk-panel-employee-grafik"),
 };
 const loaded = {};

 async function loadEmployeeGrafik() {
 const wrap = container.querySelector("#pk-panel-employee-grafik");
 if (!wrap) return;
 wrap.classList.remove("hidden");
 wrap.innerHTML = `<div class="p-8">${skeletonRows(6)}</div>`;

 try {
 const [allLogs, allTasks, allReviews] = await Promise.all([
 fsGetAll(COL.LOG_PENILAIAN_KPI),
 fsGetAll(COL.TUGAS_KPI_360),
 fsGetAll(COL.PERFORMANCE_REVIEW)
 ]);

 const userNama = (session.nama || "").toLowerCase();
 const userNik = (session.nik || "").toLowerCase();

 // Filter logs & tasks for current employee
 const myLogs = allLogs.filter(r => 
 (r.nama_dinilai && r.nama_dinilai.toLowerCase() === userNama) ||
 (r.nik_dinilai && r.nik_dinilai.toLowerCase() === userNik)
 ).sort((a, b) => new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0));

 const myTasks = allTasks.filter(t => 
 t.status === "DONE" && 
 ((t.nama_dinilai && t.nama_dinilai.toLowerCase() === userNama) || (t.nik_dinilai && t.nik_dinilai.toLowerCase() === userNik))
 ).sort((a, b) => new Date(b.tanggal_selesai || b.created_at || 0) - new Date(a.tanggal_selesai || a.created_at || 0));

 const myReviews = allReviews.filter(r => 
 (r.nama_karyawan && r.nama_karyawan.toLowerCase() === userNama) ||
 (r.nik && r.nik.toLowerCase() === userNik)
 ).sort((a, b) => new Date(b.created_at || b.tanggal || 0) - new Date(a.created_at || a.tanggal || 0));

 // Check if employee has any evaluation record
 if (myLogs.length === 0 && myTasks.length === 0 && myReviews.length === 0) {
 wrap.innerHTML = `
 <div class="bg-white rounded-2xl p-10 border border-slate-200/80 shadow-xs text-center max-w-2xl mx-auto my-6">
 <div class="w-16 h-16 bg-maroon-50 text-maroon-700 rounded-2xl flex items-center justify-center mx-auto text-3xl mb-4 shadow-xs"></div>
 <h3 class="text-xl font-bold text-slate-800">Belum Ada Hasil Penilaian KPI</h3>
 <p class="text-slate-500 text-sm mt-2 leading-relaxed">
 Halo, <strong class="text-slate-700">${escapeHtml(session.nama || "Karyawan")}</strong>. Grafik dan analisis nilai indikator KPI Anda akan tertampil secara otomatis di halaman ini setelah proses evaluasi diselesaikan oleh Atasan / HRD.
 </p>
 <div class="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 text-left">
 <strong class="text-slate-700 block mb-1"> Informasi Penilaian KPI:</strong>
 • Penilaian mencakup Indikator Kinerja Utama (KPI), Kedisiplinan, Kualitas Kerja, dan Kerja Sama.<br/>
 • Hasil evaluasi akan dikelompokkan per indikator dengan grafik persentase nilai akhir.
 </div>
 </div>`;
 return;
 }

 // Pick the latest log/task or construct indicator list
 const latestLog = myLogs[0] || myTasks[0] || null;
 const latestReview = myReviews[0] || null;

 let totalScore = 0;
 let periodeName = "Periode Terbaru";
 let penilaiName = "Atasan / HRD";
 let detailSoal = [];

 if (latestLog) {
 totalScore = parseFloat(latestLog.total_skor || latestLog.skor_akhir || 0);
 periodeName = latestLog.periode || "Periode Berjalan";
 penilaiName = latestLog.penilai || latestLog.nama_penilai || "Atasan Direct";
 detailSoal = latestLog.detail_json || latestLog.soal_json || [];
 } else if (latestReview) {
 totalScore = parseFloat(latestReview.skor_akhir || 0);
 periodeName = latestReview.periode || "Periode Berjalan";
 penilaiName = latestReview.reviewer || "Atasan Direct";
 detailSoal = [
 { aspek: "Kualitas Kerja", indikator: "Tingkat akurasi dan kerapian hasil kerja", bobot: 20, nilai_diberikan: latestReview.kualitas_kerja || 0 },
 { aspek: "Produktivitas", indikator: "Pencapaian target kuantitas pekerjaan", bobot: 20, nilai_diberikan: latestReview.produktivitas || 0 },
 { aspek: "Kerja Sama", indikator: "Kemampuan kolaborasi tim & komunikasi", bobot: 20, nilai_diberikan: latestReview.kerja_sama || 0 },
 { aspek: "Kedisiplinan", indikator: "Kepatuhan tata tertib & kebersihan kerja", bobot: 20, nilai_diberikan: latestReview.kedisiplinan || 0 },
 { aspek: "Komunikasi", indikator: "Penyampaian informasi & koordinasi", bobot: 20, nilai_diberikan: latestReview.komunikasi || 0 },
 ];
 }

 // Grade determination
 let gradeLabel = "Perlu Perbaikan";
 let gradeBadgeClass = "bg-rose-100 text-rose-800 border-rose-200";
 if (totalScore >= 88) {
 gradeLabel = "Sangat Baik (A)";
 gradeBadgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
 } else if (totalScore >= 75) {
 gradeLabel = "Baik (B)";
 gradeBadgeClass = "bg-blue-100 text-blue-800 border-blue-200";
 } else if (totalScore >= 60) {
 gradeLabel = "Cukup (C)";
 gradeBadgeClass = "bg-amber-100 text-amber-800 border-amber-200";
 }

 if (typeof detailSoal === "string") {
 try { detailSoal = JSON.parse(detailSoal); } catch (e) { detailSoal = []; }
 }
 if (!Array.isArray(detailSoal)) detailSoal = [];

 // Group by Aspek
 const aspekGroups = {};
 detailSoal.forEach(s => {
 const asp = s.aspek || "Umum";
 if (!aspekGroups[asp]) aspekGroups[asp] = { totalNilai: 0, count: 0, items: [] };
 aspekGroups[asp].totalNilai += parseFloat(s.nilai_diberikan || s.nilai || 0);
 aspekGroups[asp].count += 1;
 aspekGroups[asp].items.push(s);
 });

 // Render Aspek Summary Cards
 let aspekCardsHtml = Object.keys(aspekGroups).map(aspKey => {
 const grp = aspekGroups[aspKey];
 const avg = Math.round(grp.totalNilai / (grp.count || 1));
 let barClass = "from-emerald-500 to-teal-600";
 if (avg < 60) barClass = "from-rose-500 to-red-600";
 else if (avg < 75) barClass = "from-amber-500 to-yellow-600";
 else if (avg < 85) barClass = "from-blue-500 to-indigo-600";

 return `
 <div class="bg-white rounded-xl p-4 border border-slate-200/80 shadow-2xs">
 <div class="flex items-center justify-between mb-2">
 <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">${escapeHtml(aspKey)}</span>
 <span class="text-sm font-black text-slate-800">${avg}%</span>
 </div>
 <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
 <div class="h-full bg-gradient-to-r ${barClass} transition-all duration-500 rounded-full" style="width: ${Math.min(100, Math.max(0, avg))}%"></div>
 </div>
 <span class="text-[11px] text-slate-400 mt-1.5 block">${grp.count} Indikator Kinerja</span>
 </div>`;
 }).join("");

 // Render Every Indicator Chart Card
 let indicatorChartsHtml = detailSoal.map((s, idx) => {
 const nilai = parseFloat(s.nilai_diberikan || s.nilai || 0);
 const bobot = parseFloat(s.bobot || 0);
 const weighted = (nilai * (bobot / 100)).toFixed(2);

 let barClass = "from-emerald-500 to-teal-600";
 let statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Sangat Baik</span>`;
 if (nilai < 60) {
 barClass = "from-rose-500 to-red-600";
 statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Perlu Perbaikan</span>`;
 } else if (nilai < 75) {
 barClass = "from-amber-500 to-yellow-600";
 statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Cukup</span>`;
 } else if (nilai < 85) {
 barClass = "from-blue-500 to-indigo-600";
 statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Baik</span>`;
 }

 return `
 <div class="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition space-y-3">
 <div class="flex flex-wrap items-start justify-between gap-2">
 <div>
 <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 mb-1">
 ${escapeHtml(s.aspek || "Umum")}
 </span>
 <h4 class="text-sm font-bold text-slate-800 leading-snug">${escapeHtml(s.indikator || s.aspek)}</h4>
 </div>
 <div class="text-right">
 <span class="text-lg font-black text-slate-800">${nilai} <span class="text-xs font-normal text-slate-400">/ 100</span></span>
 ${bobot > 0 ? `<div class="text-[11px] text-slate-500">Bobot: <strong>${bobot}%</strong> (Skor: ${weighted})</div>` : ''}
 </div>
 </div>

 <!-- Visual Progress Bar Chart -->
 <div class="space-y-1">
 <div class="flex justify-between items-center text-xs text-slate-500 font-medium">
 <span>Capaian Indikator</span>
 <span>${nilai}%</span>
 </div>
 <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
 <div class="h-full bg-gradient-to-r ${barClass} rounded-full transition-all duration-700" style="width: ${Math.min(100, Math.max(0, nilai))}%"></div>
 </div>
 </div>

 <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
 <span>Status Indikator</span>
 ${statusBadge}
 </div>
 </div>`;
 }).join("");

 // Render Historical Evaluation Trend if multiple logs exist
 let historyHtml = "";
 if (myLogs.length > 1) {
 historyHtml = `
 <div class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
 <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
 <span></span> Riwayat Perkembangan KPI Per Periode
 </h3>
 <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
 ${myLogs.slice(0, 6).map(lg => {
 const sc = parseFloat(lg.total_skor || lg.skor_akhir || 0);
 return `
 <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
 <div>
 <div class="text-xs font-bold text-slate-700">${escapeHtml(lg.periode || "Periode")}</div>
 <div class="text-[11px] text-slate-400">${fmtDateShort(lg.tanggal)}</div>
 </div>
 <span class="text-base font-black text-maroon-700">${sc}</span>
 </div>`;
 }).join("")}
 </div>
 </div>`;
 }

 // Render Feedback callout
 let feedbackHtml = "";
 if (latestLog && (latestLog.catatan_baik || latestLog.catatan_perbaikan || latestLog.catatan_penilai)) {
 feedbackHtml = `
 <div class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
 <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
 <span></span> Catatan & Ulasan Evaluasi Dari Penilai
 </h3>
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 ${latestLog.catatan_baik ? `
 <div class="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200/70 text-xs">
 <span class="font-bold text-emerald-800 block mb-1">[v] Kelebihan & Hal yang Sudah Baik:</span>
 <p class="text-slate-700 leading-relaxed">${escapeHtml(latestLog.catatan_baik)}</p>
 </div>` : ''}
 ${latestLog.catatan_perbaikan ? `
 <div class="p-4 bg-rose-50/60 rounded-xl border border-rose-200/70 text-xs">
 <span class="font-bold text-rose-800 block mb-1"> Area Peningkatan:</span>
 <p class="text-slate-700 leading-relaxed">${escapeHtml(latestLog.catatan_perbaikan)}</p>
 </div>` : ''}
 </div>
 </div>`;
 }

 wrap.innerHTML = `
 <div class="space-y-6">
 <!-- Main Overall Score Card -->
 <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-maroon-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
 <div class="relative z-10 flex flex-wrap items-center justify-between gap-6">
 <div class="space-y-1">
 <span class="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-amber-300 backdrop-blur-xs">
 ${escapeHtml(periodeName)}
 </span>
 <h2 class="text-2xl font-black text-white">${escapeHtml(session.nama || "Karyawan")}</h2>
 <p class="text-xs text-slate-300">Penilai: <strong class="text-white">${escapeHtml(penilaiName)}</strong></p>
 </div>

 <div class="flex items-center gap-4 bg-white/10 p-4 rounded-xl border border-white/10 backdrop-blur-xs">
 <div class="text-center">
 <div class="text-[11px] uppercase tracking-wider text-slate-300 font-bold">Skor KPI Akhir</div>
 <div class="text-3xl font-black text-amber-400 mt-0.5">${totalScore} <span class="text-xs font-normal text-slate-300">/ 100</span></div>
 </div>
 <div class="h-10 w-px bg-white/20"></div>
 <div>
 <div class="text-[11px] uppercase tracking-wider text-slate-300 font-bold mb-1">Predikat</div>
 <span class="px-3 py-1 rounded-lg text-xs font-bold border ${gradeBadgeClass}">
 ${gradeLabel}
 </span>
 </div>
 </div>
 </div>
 </div>

 <!-- Ringkasan Nilai Per Aspek -->
 <div>
 <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
 <span></span> Ringkasan Nilai Per Aspek Kinerja
 </h3>
 <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
 ${aspekCardsHtml}
 </div>
 </div>

 <!-- Grafik Penilaian Pada Setiap Indikator -->
 <div>
 <div class="flex items-center justify-between mb-3">
 <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
 <span></span> Grafik Penilaian Indikator KPI (${detailSoal.length} Indikator)
 </h3>
 </div>
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 ${indicatorChartsHtml}
 </div>
 </div>

 ${historyHtml}
 ${feedbackHtml}
 </div>`;
 } catch (e) {
 console.error(e);
 wrap.innerHTML = emptyState("Gagal memuat grafik penilaian KPI: " + e.message);
 }
 }

 if (isRegularEmployee) {
 const titleEl = container.querySelector("#pk-title");
 const subtitleEl = container.querySelector("#pk-subtitle");
 const tabHeader = container.querySelector("#pk-tab-header");

 if (titleEl) titleEl.textContent = "Penilaian & Kontrak Saya";
 if (subtitleEl) subtitleEl.textContent = "Grafik pencapaian penilaian KPI dan rincian dokumen ikatan dinas / kontrak kerja Anda.";
 if (tabHeader) {
 tabHeader.innerHTML = `
 <button data-ntab="grafik" class="pk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">Hasil & Grafik KPI Saya</button>
 <button data-ntab="kontrak" class="pk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap">Kontrak Kerja Saya</button>
 `;
 }
 }

 async function loadKontrak() {
 if (isAtasanView && bawahanNames === null) {
 bawahanNames = await getBawahanNames(session.nama);
 }
 const bset = new Set(bawahanNames || []);

 const wrap = panels.kontrak;
 wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

 let allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
 let allKontrak = await fsGetAll(COL.MASTER_KONTRAK);

 if (isAtasanView) {
 allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
 allKontrak = allKontrak.filter(k => bset.has(k.nama_karyawan));
 } else if (isRegularEmployee) {
 const myName = String(session.nama || "").toLowerCase().trim();
 const myNik = String(session.nik || "").toLowerCase().trim();
 allKaryawan = allKaryawan.filter(k => {
 const kname = String(k.nama_karyawan || "").toLowerCase().trim();
 const knik = String(k.nik_karyawan || k.nik || "").toLowerCase().trim();
 return (myName && kname === myName) || (myNik && knik === myNik);
 });
 allKontrak = allKontrak.filter(c => {
 const cname = String(c.nama_karyawan || "").toLowerCase().trim();
 return (myName && cname === myName);
 });
 }

 function renderCardView() {
 const kontrakMap = {};
 allKontrak.forEach(c => {
 if (!c.nama_karyawan) return;
 if (!kontrakMap[c.nama_karyawan]) kontrakMap[c.nama_karyawan] = [];
 kontrakMap[c.nama_karyawan].push(c);
 });

 // Sort contracts for each employee by tanggal_mulai / created_at descending
 Object.keys(kontrakMap).forEach(nama => {
 kontrakMap[nama].sort((a, b) => new Date(b.tanggal_mulai || b.created_at || 0) - new Date(a.tanggal_mulai || a.created_at || 0));
 });

 // Combine employees list with contract data
 const empList = allKaryawan.map(k => {
 const contracts = kontrakMap[k.nama_karyawan] || [];
 const latestContract = contracts[0] || null;
 
 let contractStatus = "TANPA KONTRAK";
 let daysLeft = null;

 if (latestContract && latestContract.tanggal_akhir) {
 const today = new Date().toISOString().split("T")[0];
 daysLeft = daysBetween(today, latestContract.tanggal_akhir);
 if (daysLeft !== null && !isNaN(daysLeft)) {
 if (daysLeft < 0) {
 contractStatus = "HABIS";
 } else if (daysLeft <= 30) {
 contractStatus = "SEGERA HABIS";
 } else {
 contractStatus = "AKTIF";
 }
 }
 }

 return {
 ...k,
 contracts,
 latestContract,
 contractStatus,
 daysLeft
 };
 });

 // Add employees from contracts that are not in master karyawan list
 const existingNames = new Set(allKaryawan.map(k => k.nama_karyawan));
 Object.keys(kontrakMap).forEach(nama => {
 if (!existingNames.has(nama)) {
 const contracts = kontrakMap[nama];
 const latestContract = contracts[0] || null;
 let contractStatus = "TANPA KONTRAK";
 let daysLeft = null;
 if (latestContract && latestContract.tanggal_akhir) {
 const today = new Date().toISOString().split("T")[0];
 daysLeft = daysBetween(today, latestContract.tanggal_akhir);
 if (daysLeft !== null && !isNaN(daysLeft)) {
 if (daysLeft < 0) contractStatus = "HABIS";
 else if (daysLeft <= 30) contractStatus = "SEGERA HABIS";
 else contractStatus = "AKTIF";
 }
 }
 empList.push({
 id: null,
 nama_karyawan: nama,
 jabatan: latestContract?.jabatan || "-",
 cabang: latestContract?.cabang || "-",
 divisi: latestContract?.divisi || "-",
 status_karyawan: "KONTRAK",
 aktif_tdk_aktif: "AKTIF",
 contracts,
 latestContract,
 contractStatus,
 daysLeft
 });
 }
 });

 wrap.innerHTML = `
 <div class="space-y-5">
 <!-- Toolbar & Header -->
 <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div>
 <h2 class="text-xl font-bold text-slate-800">Kartu Kontrak Karyawan</h2>
 <p class="text-xs text-slate-500 mt-1">Kelola ikatan dinas, riwayat kontrak per karyawan, dan status keaktifan kerja.</p>
 </div>
 ${canManageKontrak ? `
 <button id="btn-add-global-kontrak" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-2 self-start md:self-auto">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
 Tambah Kontrak Baru
 </button>` : ''}
 </div>

 <!-- Filter & Search Bar -->
 <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
 <div class="relative w-full sm:w-72">
 <input type="text" id="ktr-search-input" placeholder=" Cari nama, jabatan, cabang..." class="w-full px-3 py-2 pl-9 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
 </div>
 <div class="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
 <select id="ktr-filter-status-karyawan" class="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-maroon-500 font-medium">
 <option value="ALL">Semua Status Karyawan</option>
 <option value="AKTIF">Status: AKTIF</option>
 <option value="TIDAK AKTIF">Status: TIDAK AKTIF</option>
 </select>
 <select id="ktr-filter-status-kontrak" class="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-maroon-500 font-medium">
 <option value="ALL">Semua Masa Kontrak</option>
 <option value="AKTIF">Kontrak: AKTIF (>30 Hari)</option>
 <option value="SEGERA HABIS">Kontrak: SEGERA HABIS (≤30 Hari)</option>
 <option value="HABIS">Kontrak: HABIS</option>
 <option value="TANPA KONTRAK">Tanpa Kontrak</option>
 </select>
 </div>
 </div>

 <!-- Cards Grid -->
 <div id="ktr-cards-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 </div>
 </div>
 `;

 const cardsContainer = wrap.querySelector("#ktr-cards-container");
 const searchInput = wrap.querySelector("#ktr-search-input");
 const filterStatusKaryawan = wrap.querySelector("#ktr-filter-status-karyawan");
 const filterStatusKontrak = wrap.querySelector("#ktr-filter-status-kontrak");

 function drawCards() {
 const q = (searchInput.value || "").toLowerCase().trim();
 const fStatKaryawan = filterStatusKaryawan.value;
 const fStatKontrak = filterStatusKontrak.value;

 const filtered = empList.filter(e => {
 const nameMatch = (e.nama_karyawan || "").toLowerCase().includes(q) ||
 (e.jabatan || "").toLowerCase().includes(q) ||
 (e.cabang || "").toLowerCase().includes(q);
 if (!nameMatch) return false;

 const isAktifStr = (e.aktif_tdk_aktif || "AKTIF").toUpperCase();
 if (fStatKaryawan !== "ALL" && isAktifStr !== fStatKaryawan) return false;

 if (fStatKontrak !== "ALL" && e.contractStatus !== fStatKontrak) return false;

 return true;
 });

 if (!filtered.length) {
 cardsContainer.innerHTML = `<div class="col-span-full">${emptyState("Tidak ada data karyawan yang cocok", "Coba ubah kata kunci pencarian atau filter di atas.")}</div>`;
 return;
 }

 cardsContainer.innerHTML = filtered.map(item => {
 const isAktif = (item.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF";
 const contractCount = item.contracts.length;
 const lc = item.latestContract;

 let badgeContractColor = "slate";
 let daysLabel = "Tanpa ikatan kontrak aktif";

 if (item.contractStatus === "AKTIF") {
 badgeContractColor = "emerald";
 daysLabel = `Sisa ${item.daysLeft} Hari`;
 } else if (item.contractStatus === "SEGERA HABIS") {
 badgeContractColor = "amber";
 daysLabel = `Perlu Perpanjangan (${item.daysLeft} Hari Lagi)`;
 } else if (item.contractStatus === "HABIS") {
 badgeContractColor = "red";
 daysLabel = `Sudah Kadaluarsa (${Math.abs(item.daysLeft)} Hari Lalu)`;
 }

 return `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between group cursor-pointer card-emp-kontrak" data-emp-name="${escapeHtml(item.nama_karyawan)}">
 <div>
 <!-- Top Header -->
 <div class="flex items-start justify-between gap-3 mb-3">
 <div class="flex items-center gap-3">
 ${avatar(item.nama_karyawan || "?", "w-11 h-11 border-2 border-slate-100")}
 <div>
 <h3 class="font-bold text-slate-800 text-sm group-hover:text-maroon-700 transition leading-snug">${escapeHtml(item.nama_karyawan)}</h3>
 <p class="text-xs text-slate-500 font-medium">${escapeHtml(item.jabatan || "-")}</p>
 </div>
 </div>
 ${badge(isAktif ? "AKTIF" : "TIDAK AKTIF", isAktif ? "emerald" : "slate")}
 </div>

 <!-- Info Chips -->
 <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
 <span class="font-semibold text-slate-700">${escapeHtml(item.cabang || "Pusat")}</span>
 ${item.divisi ? `<span>• Divisi: ${escapeHtml(item.divisi)}</span>` : ''}
 <span>• Status: <strong class="text-slate-800">${escapeHtml(formatStatusKaryawan(item.status_karyawan))}</strong></span>
 </div>

 <!-- Latest Contract Info -->
 <div class="border-t border-slate-100 pt-3 space-y-1.5">
 <div class="flex items-center justify-between text-xs">
 <span class="text-slate-400 font-medium">Kontrak Terbaru:</span>
 <span class="font-bold text-slate-700">${lc ? `Kontrak Ke-${lc.kontrak_ke || 1}` : "Belum Ada"}</span>
 </div>
 ${lc ? `
 <div class="flex items-center justify-between text-xs">
 <span class="text-slate-400 font-medium">Periode:</span>
 <span class="font-medium text-slate-700">${fmtDateShort(lc.tanggal_mulai)} - ${fmtDateShort(lc.tanggal_akhir)}</span>
 </div>
 <div class="mt-2 flex items-center justify-between">
 ${badge(item.contractStatus, badgeContractColor)}
 <span class="text-[11px] font-semibold text-slate-500">${daysLabel}</span>
 </div>` : `
 <div class="py-2 text-center text-xs text-slate-400 italic">Belum ada riwayat kontrak di sistem</div>`}
 </div>
 </div>

 <!-- Footer Action -->
 <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
 <span class="text-xs font-semibold text-slate-500">${contractCount} Riwayat Kontrak</span>
 <button type="button" class="text-xs font-bold text-maroon-700 hover:text-maroon-800 hover:bg-maroon-50 px-3 py-1.5 rounded-xl transition flex items-center gap-1">
 Detail & Kelola
 </button>
 </div>
 </div>
 `;
 }).join("");

 cardsContainer.querySelectorAll(".card-emp-kontrak").forEach(card => {
 card.onclick = () => {
 const empName = card.dataset.empName;
 const empData = empList.find(e => e.nama_karyawan === empName);
 if (empData) openEmployeeContractModal(empData, reloadData);
 };
 });
 }

 searchInput.oninput = drawCards;
 filterStatusKaryawan.onchange = drawCards;
 filterStatusKontrak.onchange = drawCards;
 drawCards();

 if (canManageKontrak && wrap.querySelector("#btn-add-global-kontrak")) {
 wrap.querySelector("#btn-add-global-kontrak").onclick = () => {
 openAddNewContractGlobalModal(allKaryawan, reloadData);
 };
 }
 }

 async function reloadData() {
 allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
 allKontrak = await fsGetAll(COL.MASTER_KONTRAK);
 if (isAtasanView) {
 allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
 allKontrak = allKontrak.filter(k => bset.has(k.nama_karyawan));
 }
 renderCardView();
 }

 renderCardView();
 }

 function openEmployeeContractModal(empData, reloadData) {
 const isAktif = (empData.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF";
 const contracts = empData.contracts || [];
 const latestKe = contracts.length ? Math.max(...contracts.map(c => Number(c.kontrak_ke || 1))) : 0;

 openModal({
 title: `Riwayat & Kelola Kontrak: ${escapeHtml(empData.nama_karyawan)}`,
 size: "lg",
 bodyHtml: `
 <div class="space-y-6">
 <!-- Profile Header & Employee Status Update -->
 <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
 <div class="flex items-center gap-3">
 ${avatar(empData.nama_karyawan || "?", "w-12 h-12 border-2 border-white shadow-xs")}
 <div>
 <h3 class="font-bold text-slate-800 text-base">${escapeHtml(empData.nama_karyawan)}</h3>
 <p class="text-xs text-slate-500">${escapeHtml(empData.jabatan || "-")} • ${escapeHtml(empData.cabang || "Pusat")}</p>
 </div>
 </div>
 <div class="flex items-center gap-2 w-full md:w-auto flex-wrap bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
 <div class="flex flex-col">
 <label class="text-[10px] font-bold text-slate-400 uppercase">Status Keaktifan</label>
 <select id="modal-emp-aktif" ${!canManageKontrak ? 'disabled' : ''} class="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-maroon-500 ${!canManageKontrak ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''}">
 <option value="AKTIF" ${isAktif ? 'selected' : ''}>AKTIF</option>
 <option value="TIDAK AKTIF" ${!isAktif ? 'selected' : ''}>TIDAK AKTIF</option>
 </select>
 </div>
 <div class="flex flex-col">
 <label class="text-[10px] font-bold text-slate-400 uppercase">Status Karyawan</label>
 <select id="modal-emp-type" ${!canManageKontrak ? 'disabled' : ''} class="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 outline-none focus:border-maroon-500 ${!canManageKontrak ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : ''}">
 <option value="PKWTT" ${String(empData.status_karyawan || "").toUpperCase().includes("PKWTT") || empData.status_karyawan === "TETAP" ? 'selected' : ''}>PKWTT (Karyawan Tetap)</option>
 <option value="PKWT" ${String(empData.status_karyawan || "").toUpperCase().includes("PKWT") || empData.status_karyawan === "KONTRAK" || !empData.status_karyawan ? 'selected' : ''}>PKWT (Karyawan Kontrak)</option>
 <option value="PROBATION" ${String(empData.status_karyawan || "").toUpperCase().includes("PROBATION") ? 'selected' : ''}>Probation (Masa Percobaan)</option>
 <option value="MAGANG" ${String(empData.status_karyawan || "").toUpperCase().includes("MAGANG") ? 'selected' : ''}>Magang</option>
 <option value="BURUH HARIAN" ${String(empData.status_karyawan || "").toUpperCase().includes("BURUH") ? 'selected' : ''}>Buruh Harian</option>
 <option value="OUTSOURCING" ${String(empData.status_karyawan || "").toUpperCase().includes("OUTSOURCING") ? 'selected' : ''}>Outsourcing</option>
 <option value="LAINNYA" ${String(empData.status_karyawan || "").toUpperCase().includes("LAINNYA") || empData.status_karyawan === "RESIGN" ? 'selected' : ''}>Lainnya</option>
 </select>
 </div>
 ${(canManageKontrak && empData.id) ? `
 <button id="btn-save-emp-status" class="mt-auto bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs">
 Simpan
 </button>` : ''}
 </div>
 </div>

 <!-- Section 1: Riwayat Kontrak -->
 <div>
 <div class="flex items-center justify-between mb-3">
 <h4 class="font-bold text-slate-800 text-sm flex items-center gap-2">
 <span> Riwayat Kontrak Kerja</span>
 <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">${contracts.length} Dokumen</span>
 </h4>
 ${canManageKontrak ? `
 <button id="btn-toggle-add-kontrak" class="text-xs font-bold text-maroon-700 bg-maroon-50 hover:bg-maroon-100 px-3 py-1.5 rounded-xl border border-maroon-200 transition flex items-center gap-1">
 Perpanjang / Kontrak Baru
 </button>` : ''}
 </div>

 <!-- Add Contract Form -->
 <div id="add-kontrak-form-wrap" class="hidden mb-4 bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
 <h5 class="text-xs font-bold text-amber-900 uppercase tracking-wide">Form Tambah / Perpanjang Kontrak</h5>
 <form id="form-new-kontrak" class="space-y-3">
 <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Kontrak Ke-</label>
 <input type="number" name="kontrak_ke" value="${latestKe + 1}" required class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
 </div>
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal Mulai</label>
 <input type="date" name="tanggal_mulai" required class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
 </div>
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tanggal Akhir</label>
 <input type="date" name="tanggal_akhir" required class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
 </div>
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Jabatan</label>
 <input type="text" name="jabatan" value="${escapeHtml(empData.jabatan || "")}" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
 </div>
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Cabang</label>
 <input type="text" name="cabang" value="${escapeHtml(empData.cabang || "")}" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
 </div>
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Divisi</label>
 <input type="text" name="divisi" value="${escapeHtml(empData.divisi || "")}" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white">
 </div>
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Status Kontrak</label>
 <select name="status_kolom_kontrak" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none bg-white font-medium">
 <option value="AKTIF" selected>AKTIF</option>
 <option value="SEGERA HABIS">SEGERA HABIS</option>
 <option value="DIPERPANJANG">DIPERPANJANG</option>
 <option value="DONE">DONE / SELESAI</option>
 </select>
 </div>
 <div>
 <label class="block text-[11px] font-semibold text-slate-600 mb-1">Dokumen Lampiran Kontrak (Google Drive)</label>
 <input type="file" name="file_dokumen" accept="image/*,.pdf,.doc,.docx" class="w-full px-3 py-1 text-xs rounded-xl border border-slate-200 bg-white">
 </div>
 </div>

 <div class="flex items-center justify-between pt-2">
 <button type="button" id="btn-cancel-add-kontrak" class="text-xs font-semibold text-slate-500 hover:text-slate-700">Batal</button>
 <button type="submit" id="btn-submit-kontrak" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs">
 Simpan Kontrak Baru
 </button>
 </div>
 </form>
 </div>

 <!-- History Timeline Cards -->
 ${contracts.length === 0 ? `
 <div class="bg-slate-50 rounded-xl p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200">
 Belum ada data riwayat kontrak tercatat untuk karyawan ini. Klik tombol "Perpanjang / Kontrak Baru" di atas untuk menambahkan.
 </div>` : `
 <div class="space-y-3 max-h-80 overflow-y-auto pr-1">
 ${contracts.map((c, idx) => `
 <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <div class="space-y-1">
 <div class="flex items-center gap-2">
 <span class="font-bold text-slate-800 text-xs bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">Kontrak Ke-${c.kontrak_ke || (contracts.length - idx)}</span>
 ${badge(c.status_kolom_kontrak || "AKTIF", c.status_kolom_kontrak === "AKTIF" ? "emerald" : "amber")}
 </div>
 <p class="text-xs text-slate-600 font-medium">
 Periode: <strong>${fmtDateShort(c.tanggal_mulai)}</strong> s/d <strong>${fmtDateShort(c.tanggal_akhir)}</strong>
 </p>
 <p class="text-[11px] text-slate-400">
 Jabatan: ${escapeHtml(c.jabatan || "-")} ${c.cabang ? `• Cabang: ${escapeHtml(c.cabang)}` : ''}
 </p>
 ${c.link_dokumen ? `
 <a href="${escapeHtml(c.link_dokumen)}" target="_blank" class="inline-block text-xs font-semibold text-maroon-700 hover:underline mt-1">
 Lihat File Dokumen Kontrak
 </a>` : ''}
 </div>
 ${canManageKontrak ? `
 <button type="button" class="btn-del-kontrak-item text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition shrink-0" data-kontrak-id="${c.id}">
 Hapus
 </button>` : ''}
 </div>
 `).join("")}
 </div>`}
 </div>
 </div>
 `,
 footerHtml: `
 <button id="modal-close-btn" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition">Tutup</button>
 `,
 onMount: (m) => {
 m.querySelector("#modal-close-btn").onclick = closeModal;

 // Update Employee status button logic
 const btnSaveEmpStatus = m.querySelector("#btn-save-emp-status");
 if (btnSaveEmpStatus && empData.id) {
 btnSaveEmpStatus.onclick = async () => {
 const aktif_tdk_aktif = m.querySelector("#modal-emp-aktif").value;
 const status_karyawan = m.querySelector("#modal-emp-type").value;

 try {
 btnSaveEmpStatus.disabled = true;
 btnSaveEmpStatus.textContent = "Menyimpan...";
 await fsUpdate(COL.MASTER_KARYAWAN, empData.id, {
 aktif_tdk_aktif,
 status_karyawan
 });
 toast("Status karyawan berhasil diperbarui!", "success");
 closeModal();
 reloadData();
 } catch (e) {
 toast("Gagal memperbarui status: " + e.message, "error");
 btnSaveEmpStatus.disabled = false;
 btnSaveEmpStatus.textContent = "Simpan";
 }
 };
 }

 // Toggle Add Contract Form
 const formWrap = m.querySelector("#add-kontrak-form-wrap");
 const btnToggleAdd = m.querySelector("#btn-toggle-add-kontrak");
 const btnCancelAdd = m.querySelector("#btn-cancel-add-kontrak");

 if (btnToggleAdd) btnToggleAdd.onclick = () => formWrap.classList.toggle("hidden");
 if (btnCancelAdd) btnCancelAdd.onclick = () => formWrap.classList.add("hidden");

 // Handle Delete Contract Item
 m.querySelectorAll(".btn-del-kontrak-item").forEach(btn => {
 btn.onclick = async () => {
 const kId = btn.dataset.kontrakId;
 if (!kId) return;
 if (!await confirmDialog("Apakah Anda yakin ingin menghapus catatan kontrak ini?")) return;

 try {
 await fsDelete(COL.MASTER_KONTRAK, kId);
 toast("Catatan kontrak berhasil dihapus", "success");
 closeModal();
 reloadData();
 } catch (e) {
 toast("Gagal menghapus kontrak: " + e.message, "error");
 }
 };
 });

 // Submit New Contract Form
 const formNew = m.querySelector("#form-new-kontrak");
 if (formNew) {
 formNew.onsubmit = async (e) => {
 e.preventDefault();
 const fd = new FormData(formNew);
 const btnSubmit = m.querySelector("#btn-submit-kontrak");

 try {
 btnSubmit.disabled = true;
 btnSubmit.textContent = "Menyimpan...";

 const kId = genId("KTR");
 let link_dokumen = "";

 const fileInput = formNew.querySelector('input[name="file_dokumen"]');
 const file = fileInput.files && fileInput.files[0];
 if (file) {
 btnSubmit.textContent = "Mengupload File...";
 link_dokumen = await uploadFileToDrive(file, `Kontrak/${empData.nama_karyawan}/${kId}`);
 }

 const payload = {
 nama_karyawan: empData.nama_karyawan,
 kontrak_ke: Number(fd.get("kontrak_ke") || 1),
 tanggal_mulai: fd.get("tanggal_mulai"),
 tanggal_akhir: fd.get("tanggal_akhir"),
 jabatan: fd.get("jabatan") || empData.jabatan || "",
 cabang: fd.get("cabang") || empData.cabang || "",
 divisi: fd.get("divisi") || empData.divisi || "",
 status_kolom_kontrak: fd.get("status_kolom_kontrak") || "AKTIF",
 link_dokumen: link_dokumen
 };

 await fsAdd(COL.MASTER_KONTRAK, payload, kId);

 // Update Master Karyawan contract dates & status if employee exists
 if (empData.id) {
 await fsUpdate(COL.MASTER_KARYAWAN, empData.id, {
 status_karyawan: "KONTRAK",
 tgl_mulai_kontrak: payload.tanggal_mulai,
 tgl_akhir_kontrak: payload.tanggal_akhir,
 aktif_tdk_aktif: "AKTIF"
 });
 }

 toast("Kontrak baru berhasil ditambahkan!", "success");
 closeModal();
 reloadData();
 } catch (err) {
 toast("Gagal menambahkan kontrak: " + err.message, "error");
 btnSubmit.disabled = false;
 btnSubmit.textContent = "Simpan Kontrak Baru";
 }
 };
 }
 }
 });
 }

 function openAddNewContractGlobalModal(allKaryawan, reloadData) {
 const sortedKaryawan = [...allKaryawan].sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));
 openModal({
 title: "Tambah Kontrak Kerja Baru",
 size: "md",
 bodyHtml: `
 <form id="form-global-kontrak" class="space-y-4">
 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Pilih Karyawan *</label>
 <select name="nama_karyawan" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none bg-white font-medium">
 <option value="">-- Pilih Karyawan --</option>
 ${sortedKaryawan.map(k => `<option value="${escapeHtml(k.nama_karyawan)}" data-jabatan="${escapeHtml(k.jabatan || '')}" data-cabang="${escapeHtml(k.cabang || '')}">${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || '')}</option>`).join("")}
 </select>
 </div>

 <div class="grid grid-cols-3 gap-3">
 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Kontrak Ke- *</label>
 <input type="number" name="kontrak_ke" value="1" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
 </div>
 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai *</label>
 <input type="date" name="tanggal_mulai" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
 </div>
 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Akhir *</label>
 <input type="date" name="tanggal_akhir" required class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
 </div>
 </div>

 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Jabatan</label>
 <input type="text" name="jabatan" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
 </div>
 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Cabang</label>
 <input type="text" name="cabang" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none">
 </div>
 </div>

 <div>
 <label class="block text-xs font-semibold text-slate-700 mb-1">Dokumen Lampiran (Google Drive)</label>
 <input type="file" name="file_dokumen" accept="image/*,.pdf,.doc,.docx" class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white">
 </div>
 </form>
 `,
 footerHtml: `
 <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="modal-submit-btn" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 transition">Simpan Kontrak</button>
 `,
 onMount: (m) => {
 m.querySelector("#modal-cancel-btn").onclick = closeModal;

 const selEmp = m.querySelector('select[name="nama_karyawan"]');
 selEmp.onchange = () => {
 const opt = selEmp.options[selEmp.selectedIndex];
 if (opt) {
 m.querySelector('input[name="jabatan"]').value = opt.dataset.jabatan || "";
 m.querySelector('input[name="cabang"]').value = opt.dataset.cabang || "";
 }
 };

 m.querySelector("#modal-submit-btn").onclick = async () => {
 const form = m.querySelector("#form-global-kontrak");
 if (!form.reportValidity()) return;

 const fd = new FormData(form);
 const btnSubmit = m.querySelector("#modal-submit-btn");

 try {
 btnSubmit.disabled = true;
 btnSubmit.textContent = "Menyimpan...";

 const kId = genId("KTR");
 let link_dokumen = "";

 const fileInput = form.querySelector('input[name="file_dokumen"]');
 const file = fileInput.files && fileInput.files[0];
 const namaKaryawan = fd.get("nama_karyawan");

 if (file) {
 btnSubmit.textContent = "Mengupload File...";
 link_dokumen = await uploadFileToDrive(file, `Kontrak/${namaKaryawan}/${kId}`);
 }

 const payload = {
 nama_karyawan: namaKaryawan,
 kontrak_ke: Number(fd.get("kontrak_ke") || 1),
 tanggal_mulai: fd.get("tanggal_mulai"),
 tanggal_akhir: fd.get("tanggal_akhir"),
 jabatan: fd.get("jabatan") || "",
 cabang: fd.get("cabang") || "",
 status_kolom_kontrak: "AKTIF",
 link_dokumen: link_dokumen
 };

 await fsAdd(COL.MASTER_KONTRAK, payload, kId);

 // Find employee in allKaryawan to update master karyawan
 const matched = allKaryawan.find(k => k.nama_karyawan === namaKaryawan);
 if (matched && matched.id) {
 await fsUpdate(COL.MASTER_KARYAWAN, matched.id, {
 status_karyawan: "KONTRAK",
 tgl_mulai_kontrak: payload.tanggal_mulai,
 tgl_akhir_kontrak: payload.tanggal_akhir,
 aktif_tdk_aktif: "AKTIF"
 });
 }

 toast("Kontrak kerja berhasil disimpan!", "success");
 closeModal();
 reloadData();
 } catch (e) {
 toast("Gagal menyimpan kontrak: " + e.message, "error");
 btnSubmit.disabled = false;
 btnSubmit.textContent = "Simpan Kontrak";
 }
 };
 }
 });
 }

 async function loadTemplateKpi(lastEditedTplId = null, preserveScrollY = null) {
 const wrap = panels.template;
 const currentScrollY = preserveScrollY !== null ? preserveScrollY : (window.scrollY || document.documentElement.scrollTop || 0);

 const isAlreadyRendered = !!wrap.querySelector("#tpl-cards-container");
 const previousSearchVal = wrap.querySelector("#tpl-search-input")?.value || "";

 if (!isAlreadyRendered) {
 wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;
 }

 const [rawTemplates, allKaryawan] = await Promise.all([
 fsGetAll(COL.MASTER_SOAL_KPI),
 fsGetAll(COL.MASTER_KARYAWAN)
 ]);

 // Hapus duplikat template berdasarkan nama jabatan jika ada di Firestore
 const templateMap = new Map();
 const duplicatesToDelete = [];

 rawTemplates.forEach(t => {
 const normName = (t.nama_template || "").trim().toLowerCase();
 if (!normName) return;
 if (templateMap.has(normName)) {
 const existing = templateMap.get(normName);
 const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
 const currentTime = new Date(t.updated_at || t.created_at || 0).getTime();

 if (currentTime > existingTime) {
 duplicatesToDelete.push(existing.id);
 templateMap.set(normName, t);
 } else {
 duplicatesToDelete.push(t.id);
 }
 } else {
 templateMap.set(normName, t);
 }
 });

 if (duplicatesToDelete.length > 0) {
 duplicatesToDelete.forEach(id => {
 fsDelete(COL.MASTER_SOAL_KPI, id).catch(e => console.warn("Pembersihan duplikat template:", e));
 });
 }

 const templates = Array.from(templateMap.values());

 const activeKaryawan = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF" && k.nama_karyawan);
 activeKaryawan.sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));

 function renderView() {
 let html = `
 <div class="space-y-5">
 <!-- Header Toolbar -->
 <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div>
 <h2 class="text-xl font-bold text-slate-800">Master Template Soal KPI & Evaluasi</h2>
 <p class="text-xs text-slate-500 mt-1">Kelola set indikator penilaian (KPI 360, Perpanjangan Kontrak, Kartap, PIP, Mutasi/Demosi) dan tetapkan daftar karyawan untuk tiap template.</p>
 </div>
 <div class="flex items-center gap-2 self-start md:self-auto flex-wrap">
 <input type="file" id="kpi-excel-upload" accept=".xlsx, .xls" class="hidden">
 <button id="btn-download-sample-kpi" class="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5" title="Download Contoh Format Excel KPI">
 Format Excel Sample
 </button>
 <button id="btn-import-template" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
 Import Excel
 </button>
 <button id="btn-add-template" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-sm flex items-center gap-1.5">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
 Buat Template Baru
 </button>
 </div>
 </div>

 <!-- Search & Filter Bar -->
 <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
 <div class="flex items-center gap-2 w-full sm:w-auto flex-1">
 <div class="relative w-full sm:w-80">
 <input type="text" id="tpl-search-input" placeholder=" Cari nama template, indikator, atau karyawan..." class="w-full px-3.5 py-2 pl-9 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
 </div>
 <select id="tpl-filter-kategori" class="px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 font-medium">
 <option value="">Semua Kategori Penilaian</option>
 ${Object.values(JENIS_PENILAIAN_MAP).map(cat => `
 <option value="${cat.key}">${cat.icon} ${cat.label}</option>
 `).join('')}
 </select>
 </div>
 <div class="text-xs text-slate-500 font-medium self-end sm:self-auto">
 Total <strong class="text-slate-800">${templates.length}</strong> Template Tersedia
 </div>
 </div>

 <!-- Cards Grid -->
 <div id="tpl-cards-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 </div>
 </div>
 `;

 wrap.innerHTML = html;

 const userRole = (session?.role || "").toUpperCase();
 const isHrdRole = ["HRD", "SUPERADMIN", "ADMIN"].includes(userRole);
 const btnSample = wrap.querySelector("#btn-download-sample-kpi");
 const btnImport = wrap.querySelector("#btn-import-template");
 const inputExcel = wrap.querySelector("#kpi-excel-upload");

 if (btnSample) {
 if (!isHrdRole) btnSample.style.display = "none";
 else btnSample.onclick = downloadSampleExcelTemplateKpi;
 }

 if (btnImport) {
 if (!isHrdRole) {
 btnImport.style.display = "none";
 } else if (inputExcel) {
 btnImport.onclick = () => {
 inputExcel.value = "";
 inputExcel.click();
 };
 inputExcel.onchange = (e) => {
 if (e.target.files && e.target.files[0]) {
 handleExcelImport(e.target.files[0]);
 }
 };
 }
 }

 const btnAdd = wrap.querySelector("#btn-add-template");
 if (btnAdd) btnAdd.onclick = () => openTemplateModal(null, activeKaryawan);
 }

 if (!isAlreadyRendered) {
 renderView();
 } else {
 const totalCountStrong = wrap.querySelector("#tpl-cards-container")?.parentElement?.querySelector("strong");
 if (totalCountStrong) {
 totalCountStrong.textContent = templates.length;
 }
 }

 const searchInput = wrap.querySelector("#tpl-search-input");
 const filterKategori = wrap.querySelector("#tpl-filter-kategori");
 if (searchInput && previousSearchVal) {
 searchInput.value = previousSearchVal;
 }

 const cardsContainer = wrap.querySelector("#tpl-cards-container");

 function drawCards() {
 const q = (searchInput ? searchInput.value : "").toLowerCase().trim();
 const katVal = filterKategori ? filterKategori.value : "";

 const filtered = templates.filter(t => {
 const nama = (t.nama_template || "").toLowerCase();
 const assigned = (t.karyawan_assigned || []).join(" ").toLowerCase();
 const indikatorText = (t.soal_json || []).map(s => `${s.aspek} ${s.indikator}`).join(" ").toLowerCase();
 const tKat = t.kategori_penilaian || "KPI_360";

 const matchQ = !q || nama.includes(q) || assigned.includes(q) || indikatorText.includes(q);
 const matchKat = !katVal || tKat === katVal;

 return matchQ && matchKat;
 });

 if (!filtered.length) {
 cardsContainer.innerHTML = `<div class="col-span-full">${emptyState("Belum ada Template Soal KPI yang cocok", "Klik tombol Buat Template Baru di atas untuk menambah template.")}</div>`;
 return;
 }

 cardsContainer.innerHTML = filtered.map(t => {
 const nama = t.nama_template || "Template Tanpa Nama";
 const tKatKey = t.kategori_penilaian || "KPI_360";
 const catConfig = getCatConfig(tKatKey);
 const tSkala = t.skala_penilaian || "0-100";

 const soalList = t.soal_json || [];
 const totalBobot = soalList.reduce((acc, curr) => acc + (parseFloat(curr.bobot) || 0), 0);
 const assignedList = Array.isArray(t.karyawan_assigned) ? t.karyawan_assigned : [];

 const isBobot100 = Math.round(totalBobot) === 100;

 // Preview indicators (up to 3)
 const previewSoal = soalList.slice(0, 3);
 const extraSoalCount = soalList.length - 3;

 // Preview assigned employees (up to 4)
 const previewEmployees = assignedList.slice(0, 4);
 const extraEmpCount = assignedList.length - 4;

 return `
 <div class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between group cursor-pointer tpl-card-item" data-tpl-id="${t.id}">
 <div>
 <!-- Top Header -->
 <div class="flex items-start justify-between gap-2 mb-2.5">
 <div class="flex items-center gap-2.5">
 <div class="w-10 h-10 rounded-xl bg-maroon-50 text-maroon-700 font-bold flex items-center justify-center text-lg shadow-2xs group-hover:bg-maroon-700 group-hover:text-white transition">
 ${catConfig.icon}
 </div>
 <div>
 <h3 class="font-bold text-slate-800 text-sm group-hover:text-maroon-700 transition leading-snug">${escapeHtml(nama)}</h3>
 <p class="text-[11px] text-slate-400 font-medium">${soalList.length} Indikator Kinerja</p>
 </div>
 </div>
 ${isBobot100 ? `
 <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">Total 100%</span>
 ` : `
 <span class="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">Bobot ${totalBobot}%</span>
 `}
 </div>

 <!-- Category Tag Badge & Skala Badge -->
 <div class="mb-3 flex flex-wrap gap-1.5 items-center">
 <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${catConfig.badgeClass}">
 ${catConfig.icon} ${catConfig.label}
 </span>
 <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-slate-50 text-slate-700 border-slate-200">
 Skala ${tSkala}
 </span>
 </div>

 <!-- Section Preview Indikator KPI -->
 <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3 space-y-1.5">
 <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
 <span>Detail Soal & Indikator</span>
 <span class="text-slate-400 font-normal lowercase">${soalList.length} soal</span>
 </div>
 ${soalList.length > 0 ? `
 <div class="space-y-1 mt-1">
 ${previewSoal.map(s => `
 <div class="flex items-center justify-between text-xs bg-white p-1.5 rounded-lg border border-slate-100">
 <span class="truncate text-slate-700 font-medium pr-2" title="${escapeHtml(s.indikator)}">${escapeHtml(s.indikator || s.aspek)}</span>
 <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${s.bobot}%</span>
 </div>
 `).join("")}
 ${extraSoalCount > 0 ? `
 <div class="text-[10px] text-slate-400 italic text-center pt-0.5">+ ${extraSoalCount} indikator lainnya</div>
 ` : ''}
 </div>
 ` : `
 <p class="text-xs text-slate-400 italic py-1">Belum ada indikator ditambahkan</p>
 `}
 </div>

 <!-- Section Karyawan Terdaftar -->
 <div class="border-t border-slate-100 pt-3">
 <div class="flex items-center justify-between text-xs mb-2">
 <span class="text-slate-500 font-semibold flex items-center gap-1">Karyawan Masuk Template:</span>
 <span class="font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-full text-[11px]">${assignedList.length} Orang</span>
 </div>
 ${assignedList.length > 0 ? `
 <div class="flex flex-wrap gap-1">
 ${previewEmployees.map(emp => `
 <span class="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg font-medium border border-slate-200">
 <span></span> ${escapeHtml(emp)}
 </span>
 `).join("")}
 ${extraEmpCount > 0 ? `
 <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">+${extraEmpCount} lagi</span>
 ` : ''}
 </div>
 ` : `
 <p class="text-xs text-slate-400 italic bg-amber-50/50 border border-amber-100 p-2 rounded-xl text-center">Belum ada karyawan yang dimasukkan ke template ini.</p>
 `}
 </div>
 </div>

 <!-- Footer Action Buttons -->
 <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
 <button type="button" data-del-tpl="${t.id}" class="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition">
 Hapus
 </button>
 <div class="flex items-center gap-1.5">
 <button type="button" data-dist-tpl="${t.id}" class="text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-2xs">
 Distribusi KPI
 </button>
 <button type="button" data-edit-tpl="${t.id}" class="text-xs font-bold text-maroon-700 bg-maroon-50 hover:bg-maroon-100 px-3 py-1.5 rounded-xl transition flex items-center gap-1">
 Edit
 </button>
 </div>
 </div>
 </div>
 `;
 }).join("");

 // Attach Card Action Events
 cardsContainer.querySelectorAll("[data-dist-tpl]").forEach(btn => {
 btn.onclick = (e) => {
 e.stopPropagation();
 openDistribusiModal(btn.dataset.distTpl);
 };
 });

 cardsContainer.querySelectorAll("[data-edit-tpl]").forEach(btn => {
 btn.onclick = (e) => {
 e.stopPropagation();
 const tplId = btn.dataset.editTpl;
 openTemplateModal(templates.find(x => x.id === tplId), activeKaryawan);
 };
 });

 cardsContainer.querySelectorAll(".tpl-card-item").forEach(card => {
 card.onclick = () => {
 const tplId = card.dataset.tplId;
 openTemplateModal(templates.find(x => x.id === tplId), activeKaryawan);
 };
 });

 cardsContainer.querySelectorAll("[data-del-tpl]").forEach(btn => {
 btn.onclick = async (e) => {
 e.stopPropagation();
 const tplId = btn.dataset.delTpl;
 if (await confirmDialog("Apakah Anda yakin ingin menghapus template KPI ini?")) {
 const currentY = window.scrollY || document.documentElement.scrollTop || 0;
 await fsDelete(COL.MASTER_SOAL_KPI, tplId);
 toast("Template berhasil dihapus", "success");
 loadTemplateKpi(null, currentY);
 }
 };
 });
 }

 drawCards();
 if (searchInput) searchInput.oninput = drawCards;

 setTimeout(() => {
 if (lastEditedTplId) {
 const targetCard = wrap.querySelector(`[data-tpl-id="${lastEditedTplId}"]`);
 if (targetCard) {
 targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
 targetCard.classList.add("ring-2", "ring-maroon-600", "transition-all", "duration-500");
 setTimeout(() => {
 targetCard.classList.remove("ring-2", "ring-maroon-600");
 }, 2500);
 return;
 }
 }
 if (currentScrollY > 0) {
 window.scrollTo({ top: currentScrollY, behavior: "instant" });
 }
 }, 50);
 }

 async function downloadSampleExcelTemplateKpi() {
 const headers = ["JABATAN", "NO", "ASPEK", "INDIKATOR", "BOBOT", "PENCAPAIAN (INFO)"];
 const sampleRows = [
 ["Sales Representative", 1, "Hasil Kerja", "Pencapaian Target Omzet Penjualan Bulanan", "40%", "Minimal 100% dari target bulanan"],
 ["Sales Representative", 2, "Sikap Kerja", "Kepatuhan Jam Kerja & Laporan Kunjungan Sales Track", "30%", "Laporan wajib diisi setiap hari"],
 ["Sales Representative", 3, "Kompetensi", "Pengetahuan Produk & Keterampilan Negosiasi", "30%", "Ujian produk berkala min. score 80"],
 ["HR Staff", 1, "Hasil Kerja", "Ketepatan waktu dan akurasi pengolahan payroll & absensi", "50%", "Tidak ada keterlambatan payroll"],
 ["HR Staff", 2, "Sikap Kerja", "Kedisiplinan, kerapian administrasi & ketaatan SOP", "30%", "Nol kesalahan audit dokumen"],
 ["HR Staff", 3, "Kompetensi", "Pelayanan karyawan & kecepatan respon kendala HR", "20%", "Respon maksimal 1x24 jam"]
 ];

 try {
 await downloadXlsx("Format_Sample_Import_Template_KPI", headers, sampleRows, "Template KPI");
 toast("Format Excel Sample berhasil diunduh!", "success");
 } catch (e) {
 toast("Gagal mengunduh format sample: " + e.message, "error");
 }
 }

 async function handleExcelImport(file) {
 if (!file) return;
 const importY = window.scrollY || document.documentElement.scrollTop || 0;
 const btn = panels.template ? panels.template.querySelector("#btn-import-template") : null;
 const originalText = btn ? btn.innerHTML : "Import Excel";
 if (btn) { btn.innerHTML = `Membaca File...`; btn.disabled = true; }

 try {
 await ensureXlsxLoaded();
 if (typeof window.XLSX === "undefined") {
 throw new Error("Library SheetJS (XLSX) tidak dapat dimuat.");
 }

 const data = await file.arrayBuffer();
 const workbook = window.XLSX.read(data, { type: 'array' });
 if (!workbook.SheetNames || !workbook.SheetNames.length) {
 throw new Error("File Excel kosong atau tidak valid.");
 }

 const worksheet = workbook.Sheets[workbook.SheetNames[0]];
 const matrix = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });

 if (!matrix || matrix.length === 0) {
 throw new Error("Sheet Excel tidak berisi data.");
 }

 // Step 1: Detect Header Row & Column Indexes
 let headerRowIdx = -1;
 let colJabatan = -1;
 let colNo = -1;
 let colAspek = -1;
 let colIndikator = -1;
 let colBobot = -1;
 let colPencapaian = -1;

 for (let r = 0; r < Math.min(matrix.length, 15); r++) {
 const row = matrix[r];
 if (!Array.isArray(row)) continue;

 row.forEach((cell, cIdx) => {
 const str = String(cell || "").toUpperCase().trim();
 if (str.includes("JABATAN") || str.includes("POSISI") || str.includes("TEMPLATE")) colJabatan = cIdx;
 if (str.includes("NO") || str.includes("NOMOR")) colNo = cIdx;
 if (str.includes("ASPEK") || str.includes("KATEGORI") || str.includes("DIMENSI")) colAspek = cIdx;
 if (str.includes("INDIKATOR") || str.includes("PERTANYAAN") || str.includes("SOAL") || str.includes("KRITERIA")) colIndikator = cIdx;
 if (str.includes("BOBOT") || str.includes("WEIGHT") || str.includes("PERSEN")) colBobot = cIdx;
 if (str.includes("PENCAPAIAN") || str.includes("INFO") || str.includes("TARGET") || str.includes("KETERANGAN")) colPencapaian = cIdx;
 });

 if (colIndikator !== -1 || colJabatan !== -1) {
 headerRowIdx = r;
 break;
 }
 }

 if (headerRowIdx === -1) headerRowIdx = 0;

 // Fallbacks if columns missing
 if (colIndikator === -1) colIndikator = 3;
 if (colJabatan === -1) colJabatan = 0;
 if (colAspek === -1) colAspek = 2;
 if (colBobot === -1) colBobot = 4;
 if (colPencapaian === -1) colPencapaian = 5;

 const groupedTemplates = {};
 let currentJabatan = "";

 for (let r = headerRowIdx + 1; r < matrix.length; r++) {
 const row = matrix[r];
 if (!row || !row.length) continue;

 const rawJabatan = colJabatan !== -1 && row[colJabatan] !== undefined ? String(row[colJabatan]).trim() : "";
 const rawAspek = colAspek !== -1 && row[colAspek] !== undefined ? String(row[colAspek]).trim() : "";
 const rawIndikator = colIndikator !== -1 && row[colIndikator] !== undefined ? String(row[colIndikator]).trim() : "";
 const rawBobot = colBobot !== -1 && row[colBobot] !== undefined ? String(row[colBobot]).trim() : "";
 const rawPencapaian = colPencapaian !== -1 && row[colPencapaian] !== undefined ? String(row[colPencapaian]).trim() : "";

 // Inherit Jabatan from previous row if blank (for grouped rows in Excel)
 if (rawJabatan) {
 currentJabatan = rawJabatan;
 }

 if (!currentJabatan) continue;
 if (!rawIndikator && !rawAspek) continue;
 if (!rawIndikator) continue;

 // Clean & Parse Bobot
 let bobotVal = 0;
 if (rawBobot) {
 let cleanStr = rawBobot.replace(/%/g, "").replace(/,/g, ".").trim();
 let num = parseFloat(cleanStr);
 if (!isNaN(num)) {
 if (num > 0 && num <= 1) {
 bobotVal = Math.round(num * 100);
 } else {
 bobotVal = Math.round(num);
 }
 }
 }

 if (!groupedTemplates[currentJabatan]) {
 groupedTemplates[currentJabatan] = {
 nama_template: currentJabatan,
 soal_json: []
 };
 }

 groupedTemplates[currentJabatan].soal_json.push({
 aspek: rawAspek || "Umum",
 indikator: rawIndikator,
 bobot: bobotVal,
 pencapaian_info: rawPencapaian,
 nilai_diberikan: 0
 });
 }

 const templateKeys = Object.keys(groupedTemplates);
 if (templateKeys.length === 0) {
 throw new Error("Tidak ada indikator KPI yang valid ditemukan. Mohon periksa header JABATAN, ASPEK, INDIKATOR, dan BOBOT.");
 }

 // Step 2: Replace or Add existing templates in Firestore
 const existingTemplates = await fsGetAll(COL.MASTER_SOAL_KPI);
 let addedCount = 0;
 let updatedCount = 0;

 for (const name of templateKeys) {
 const tplData = groupedTemplates[name];
 const normName = name.trim().toLowerCase();
 const matchingExisting = existingTemplates.filter(t => (t.nama_template || "").trim().toLowerCase() === normName);

 if (matchingExisting.length > 0) {
 // Kumpulkan karyawan assigned dari template lama agar tidak hilang
 const allAssigned = new Set();
 matchingExisting.forEach(t => {
 if (Array.isArray(t.karyawan_assigned)) {
 t.karyawan_assigned.forEach(k => allAssigned.add(k));
 }
 });

 // Hapus SEMUA template lama dengan nama jabatan yang sama
 for (const oldTpl of matchingExisting) {
 await fsDelete(COL.MASTER_SOAL_KPI, oldTpl.id);
 }

 // Buat template baru menggantikan yang terhapus
 await fsAdd(COL.MASTER_SOAL_KPI, {
 nama_template: name,
 soal_json: tplData.soal_json,
 karyawan_assigned: Array.from(allAssigned),
 updated_at: new Date().toISOString()
 }, genId("TPL-KPI"));
 updatedCount++;
 } else {
 // Add new template
 await fsAdd(COL.MASTER_SOAL_KPI, {
 nama_template: name,
 soal_json: tplData.soal_json,
 karyawan_assigned: [],
 created_at: new Date().toISOString()
 }, genId("TPL-KPI"));
 addedCount++;
 }
 }

 let resMsg = "Berhasil meng-import template KPI! ";
 if (updatedCount > 0) resMsg += `${updatedCount} template diperbarui. `;
 if (addedCount > 0) resMsg += `${addedCount} template baru ditambahkan.`;

 toast(resMsg, "success");
 loadTemplateKpi(null, importY);

 } catch (err) {
 console.error("Gagal Import Excel:", err);
 toast("Gagal Import Excel: " + err.message, "error");
 } finally {
 if (btn) {
 btn.innerHTML = originalText;
 btn.disabled = false;
 }
 }
 }

 function openTemplateModal(existingData = null, activeKaryawan = []) {
 // Sort activeKaryawan A-Z
 activeKaryawan.sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || "", "id", { sensitivity: "base" }));

 const assignedSet = new Set(existingData?.karyawan_assigned || []);

 openModal({
 title: existingData ? `Detail & Edit Template: ${escapeHtml(existingData.nama_template || "Template KPI")}` : "Buat Template Soal KPI & Evaluasi Baru",
 size: "lg",
 bodyHtml: `
 <div class="space-y-4">
 <!-- Nama Template, Jenis Penilaian & Skala Penilaian -->
 <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div>
 <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Nama Template / Jabatan <span class="text-red-500">*</span></label>
 <input type="text" id="tpl-nama" value="${existingData ? escapeHtml(existingData.nama_template || '') : ''}" placeholder="Cth: Template KPI Sales / Kontrak" required class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 outline-none font-medium bg-white">
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Jenis / Kategori Penilaian <span class="text-red-500">*</span></label>
 <select id="tpl-kategori" class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 outline-none font-medium bg-white">
 ${Object.values(JENIS_PENILAIAN_MAP).map(cat => `
 <option value="${cat.key}" ${ (existingData?.kategori_penilaian || 'KPI_360') === cat.key ? 'selected' : '' }>${cat.icon} ${cat.label}</option>
 `).join('')}
 </select>
 </div>
 <div>
 <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Skala Penilaian <span class="text-red-500">*</span></label>
 <select id="tpl-skala" class="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-maroon-500 outline-none font-medium bg-white">
 <option value="0-100" ${ (existingData?.skala_penilaian || '0-100') === '0-100' ? 'selected' : '' }>Skala 0 - 100 (Persentase)</option>
 <option value="1-5" ${ (existingData?.skala_penilaian) === '1-5' ? 'selected' : '' }>Skala 1 - 5 (Likert / Rating)</option>
 </select>
 </div>
 </div>

 <!-- Dynamic Preview Box for Recommendation Options -->
 <div id="tpl-rekomendasi-preview-box" class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
 </div>

 <!-- TAB / SECTION SELECTOR -->
 <div class="flex items-center gap-2 border-b border-slate-200 pb-2">
 <button type="button" id="tab-btn-soal" class="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-maroon-700 text-white transition shadow-2xs">
 Detail Soal & Indikator KPI
 </button>
 <button type="button" id="tab-btn-karyawan" class="px-3.5 py-1.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5">
 Karyawan yang Masuk Template
 <span id="tpl-karyawan-counter" class="bg-maroon-100 text-maroon-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">${assignedSet.size}</span>
 </button>
 </div>

 <!-- PANEL 1: SOAL & INDIKATOR KPI -->
 <div id="panel-tpl-soal" class="space-y-3">
 <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
 <div class="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
 <label class="text-xs font-bold text-slate-700 uppercase tracking-wide">Indikator & Bobot Penilaian (Wajib Total 100%)</label>
 <span id="tpl-bobot-total" class="text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg">Total Bobot: 0%</span>
 </div>
 <div id="tpl-soal-list" class="space-y-2.5 mb-3"></div>
 <button type="button" id="btn-tpl-add" class="text-xs text-maroon-700 font-bold hover:underline flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-maroon-200 shadow-2xs">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg> Tambah Indikator Baru
 </button>
 </div>
 </div>

 <!-- PANEL 2: DAFTAR KARYAWAN -->
 <div id="panel-tpl-karyawan" class="hidden space-y-3">
 <div class="bg-amber-50/60 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
 <span> <strong>Informasi:</strong> Karyawan yang dicentang di bawah ini akan otomatis menggunakan template KPI ini saat HRD melakukan Distribusi Penilaian 360.</span>
 </div>

 <div class="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
 <!-- Search & Quick Selection -->
 <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
 <input type="text" id="tpl-search-karyawan" placeholder=" Cari nama karyawan, jabatan, divisi..." class="w-full sm:w-72 px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-white">
 <div class="flex items-center gap-2 self-end sm:self-auto">
 <button type="button" id="btn-check-all-karyawan" class="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">Centang Semua</button>
 <button type="button" id="btn-uncheck-all-karyawan" class="text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">Hapus Semua</button>
 </div>
 </div>

 <!-- List Checkbox -->
 <div id="tpl-karyawan-checkbox-list" class="max-h-60 overflow-y-auto divide-y divide-slate-100 p-1 bg-white">
 </div>
 </div>
 </div>
 </div>
 `,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-tpl-batal" class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="btn-tpl-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5">Simpan Template & Karyawan</button>
 </div>
 `,
 onMount: (m) => {
 const selKategori = m.querySelector("#tpl-kategori");
 const boxPreview = m.querySelector("#tpl-rekomendasi-preview-box");

 function updateRekomendasiPreview() {
 const catKey = selKategori ? selKategori.value : "KPI_360";
 const catObj = getCatConfig(catKey);
 boxPreview.innerHTML = `
 <div class="flex items-center justify-between font-bold text-slate-700">
 <span> Pilihan Keputusan & Rekomendasi di Template ini (${catObj.icon} ${catObj.label}):</span>
 </div>
 <div class="flex flex-wrap gap-1.5 mt-1">
 ${catObj.options.map(opt => `
 <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-semibold border ${catObj.badgeClass}">
 [v] ${escapeHtml(opt)}
 </span>
 `).join('')}
 </div>
 `;
 }
 if (selKategori) selKategori.onchange = updateRekomendasiPreview;
 updateRekomendasiPreview();

 const tabBtnSoal = m.querySelector("#tab-btn-soal");
 const tabBtnKaryawan = m.querySelector("#tab-btn-karyawan");
 const panelSoal = m.querySelector("#panel-tpl-soal");
 const panelKaryawan = m.querySelector("#panel-tpl-karyawan");

 const soalList = m.querySelector("#tpl-soal-list");
 const badgeBobot = m.querySelector("#tpl-bobot-total");
 const counterKaryawan = m.querySelector("#tpl-karyawan-counter");
 const karyawanListContainer = m.querySelector("#tpl-karyawan-checkbox-list");
 const searchKaryawanInput = m.querySelector("#tpl-search-karyawan");

 // Tab Switch logic
 tabBtnSoal.onclick = () => {
 panelSoal.classList.remove("hidden");
 panelKaryawan.classList.add("hidden");
 tabBtnSoal.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl bg-maroon-700 text-white transition shadow-2xs";
 tabBtnKaryawan.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5";
 };

 tabBtnKaryawan.onclick = () => {
 panelKaryawan.classList.remove("hidden");
 panelSoal.classList.add("hidden");
 tabBtnKaryawan.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl bg-maroon-700 text-white transition shadow-2xs flex items-center gap-1.5";
 tabBtnSoal.className = "px-3.5 py-1.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition";
 };

 // Render Karyawan Checkbox List
 function updateCounter() {
 counterKaryawan.textContent = assignedSet.size;
 }

 function drawKaryawanCheckboxes(filterText = "") {
 const term = filterText.toLowerCase().trim();

 karyawanListContainer.innerHTML = activeKaryawan.map(k => {
 const nama = k.nama_karyawan || "";
 const jabatan = k.jabatan || "-";
 const cabang = k.cabang || "Pusat";
 const divisi = k.divisi || "";

 const match = !term || nama.toLowerCase().includes(term) || jabatan.toLowerCase().includes(term) || divisi.toLowerCase().includes(term);
 if (!match || !nama) return "";

 const isChecked = assignedSet.has(nama);

 return `
 <label class="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 rounded-xl cursor-pointer transition select-none group">
 <div class="flex items-center gap-3">
 <input type="checkbox" name="tpl-karyawan-cb" value="${escapeHtml(nama)}" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-maroon-600 border-slate-300 rounded focus:ring-maroon-500 cursor-pointer">
 <div>
 <p class="text-xs font-bold text-slate-800 group-hover:text-maroon-700 transition">${escapeHtml(nama)}</p>
 <p class="text-[11px] text-slate-400 font-medium">${escapeHtml(jabatan)} ${divisi ? `• Divisi ${escapeHtml(divisi)}` : ''} • Cabang ${escapeHtml(cabang)}</p>
 </div>
 </div>
 </label>
 `;
 }).join("");

 m.querySelectorAll('input[name="tpl-karyawan-cb"]').forEach(cb => {
 cb.onchange = () => {
 if (cb.checked) {
 assignedSet.add(cb.value);
 } else {
 assignedSet.delete(cb.value);
 }
 updateCounter();
 };
 });
 updateCounter();
 }

 drawKaryawanCheckboxes();
 if (searchKaryawanInput) {
 searchKaryawanInput.oninput = (e) => drawKaryawanCheckboxes(e.target.value);
 }

 m.querySelector("#btn-check-all-karyawan").onclick = () => {
 const term = (searchKaryawanInput ? searchKaryawanInput.value : "").toLowerCase().trim();
 activeKaryawan.forEach(k => {
 const nama = k.nama_karyawan || "";
 if (!nama) return;
 const match = !term || nama.toLowerCase().includes(term) || (k.jabatan || "").toLowerCase().includes(term) || (k.divisi || "").toLowerCase().includes(term);
 if (match) assignedSet.add(nama);
 });
 drawKaryawanCheckboxes(searchKaryawanInput ? searchKaryawanInput.value : "");
 };

 m.querySelector("#btn-uncheck-all-karyawan").onclick = () => {
 const term = (searchKaryawanInput ? searchKaryawanInput.value : "").toLowerCase().trim();
 if (!term) {
 assignedSet.clear();
 } else {
 activeKaryawan.forEach(k => {
 const nama = k.nama_karyawan || "";
 if (!nama) return;
 const match = nama.toLowerCase().includes(term) || (k.jabatan || "").toLowerCase().includes(term) || (k.divisi || "").toLowerCase().includes(term);
 if (match) assignedSet.delete(nama);
 });
 }
 drawKaryawanCheckboxes(searchKaryawanInput ? searchKaryawanInput.value : "");
 };

 // Indicator & Bobot Logic
 function calcTotalBobot() {
 let total = 0;
 m.querySelectorAll(".soal-bobot").forEach(input => total += parseFloat(input.value) || 0);
 badgeBobot.textContent = `Total Bobot: ${total}%`;
 if (total === 100) {
 badgeBobot.className = "text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-300";
 } else {
 badgeBobot.className = "text-xs font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-lg border border-red-300";
 }
 return total;
 }

 function addSoalUI(data = { aspek: "", indikator: "", bobot: "" }) {
 const div = document.createElement("div");
 div.className = "flex gap-2 items-start bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs";
 div.innerHTML = `
 <div class="flex-1 space-y-2">
 <input type="text" placeholder="Aspek Penilaian (Cth: Kedisiplinan / Target)" value="${escapeHtml(data.aspek || '')}" class="soal-aspek w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-maroon-400 font-medium" required>
 <input type="text" placeholder="Indikator Kinerja / Detail Pertanyaan" value="${escapeHtml(data.indikator || '')}" class="soal-indikator w-full px-2.5 py-1.5 text-xs border rounded-lg outline-none focus:border-maroon-400" required>
 </div>
 <div class="w-24 text-center">
 <label class="block text-[10px] text-slate-400 font-semibold mb-1">Bobot %</label>
 <input type="number" placeholder="10" value="${data.bobot || ''}" class="soal-bobot w-full px-2.5 py-1.5 text-xs border rounded-lg text-center font-bold text-slate-800 outline-none focus:border-maroon-400" required min="1" max="100">
 </div>
 <button type="button" class="text-slate-300 hover:text-red-500 mt-5 p-1 rounded hover:bg-red-50 transition" title="Hapus Indikator">&times;</button>
 `;
 div.querySelector(".soal-bobot").addEventListener("input", calcTotalBobot);
 div.querySelector("button").addEventListener("click", () => { div.remove(); calcTotalBobot(); });
 soalList.appendChild(div);
 calcTotalBobot();
 }

 if (existingData && existingData.soal_json && existingData.soal_json.length > 0) {
 existingData.soal_json.forEach(s => addSoalUI(s));
 } else {
 addSoalUI();
 }

 m.querySelector("#btn-tpl-add").onclick = () => addSoalUI();
 m.querySelector("#btn-tpl-batal").onclick = closeModal;

 m.querySelector("#btn-tpl-simpan").onclick = async () => {
 const nama = m.querySelector("#tpl-nama").value.trim();
 const kategoriPenilaian = selKategori ? selKategori.value : "KPI_360";
 const skalaPenilaian = m.querySelector("#tpl-skala") ? m.querySelector("#tpl-skala").value : "0-100";

 if (!nama) return toast("Nama Template wajib diisi!", "warning");
 if (calcTotalBobot() !== 100) return toast("Total bobot indikator wajib tepat 100%!", "warning");

 const soalArray = [];
 soalList.querySelectorAll(".flex.gap-2").forEach(row => {
 const asp = row.querySelector(".soal-aspek").value.trim();
 const ind = row.querySelector(".soal-indikator").value.trim();
 const bbt = parseFloat(row.querySelector(".soal-bobot").value) || 0;
 if (asp || ind) {
 soalArray.push({
 aspek: asp || "Umum",
 indikator: ind || asp,
 bobot: bbt,
 nilai_diberikan: 0
 });
 }
 });

 if (!soalArray.length) return toast("Tambahkan minimal 1 indikator soal KPI!", "warning");

 // Extract checked employees from assignedSet (preserves selections across searches)
 const checkedEmployees = Array.from(assignedSet);

 const payload = {
 nama_template: nama,
 kategori_penilaian: kategoriPenilaian,
 skala_penilaian: skalaPenilaian,
 soal_json: soalArray,
 karyawan_assigned: checkedEmployees
 };

 const btnSave = m.querySelector("#btn-tpl-simpan");
 btnSave.disabled = true;
 btnSave.textContent = "Menyimpan...";

 try {
 // Hapus duplikat lain jika ada template lain dengan nama jabatan yang sama
 const allExisting = await fsGetAll(COL.MASTER_SOAL_KPI);
 const duplicates = allExisting.filter(t => 
 (t.nama_template || "").trim().toLowerCase() === nama.trim().toLowerCase() && 
 (!existingData || t.id !== existingData.id)
 );
 for (const dup of duplicates) {
 await fsDelete(COL.MASTER_SOAL_KPI, dup.id);
 }

 let savedTplId = existingData && existingData.id ? existingData.id : null;
 if (existingData && existingData.id) {
 await fsUpdate(COL.MASTER_SOAL_KPI, existingData.id, payload);
 } else {
 const newTplId = genId("TPL-KPI");
 await fsAdd(COL.MASTER_SOAL_KPI, payload, newTplId);
 savedTplId = newTplId;
 }
 toast("Template Soal KPI & daftar karyawan berhasil disimpan!", "success");
 closeModal();
 loadTemplateKpi(savedTplId);
 } catch (err) {
 toast("Gagal menyimpan: " + err.message, "error");
 btnSave.disabled = false;
 btnSave.textContent = "Simpan Template & Karyawan";
 }
 };
 }
 });
 }

  async function loadKpi360() {
    const wrap = panels.kpi360;
    wrap.innerHTML = `<div class="space-y-4">${skeletonRows(4)}</div>`;
    
    const [tasks, allEmps] = await Promise.all([
      fsGetAll(COL.TUGAS_KPI_360),
      fsGetAll(COL.MASTER_KARYAWAN)
    ]);

    const isHrd = canDistribusiKpi360;
    const userNamaLower = (session.nama || "").toLowerCase().trim();
    const userNikLower = (session.nik || "").toLowerCase().trim();
    
    // My Assigned Tasks (where current user is Penilai)
    const myTasks = tasks.filter(t => 
      (t.nama_penilai || "").toLowerCase().trim() === userNamaLower ||
      (t.nik_penilai && t.nik_penilai.toLowerCase().trim() === userNikLower)
    ).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Stats for HRD
    const totalTasks = tasks.length;
    const pendingTasks = tasks.filter(t => (t.status || "PENDING").toUpperCase() !== "DONE");
    const doneTasks = tasks.filter(t => (t.status || "PENDING").toUpperCase() === "DONE");
    const completionRate = totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 0;

    wrap.innerHTML = `
      <div class="space-y-6">
        <!-- Top Bar: Header & Action Button -->
        <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-maroon-50 text-maroon-700 font-bold flex items-center justify-center text-sm shadow-2xs">
                🔄
              </div>
              <div>
                <h3 class="font-bold text-slate-800 text-base">Tugas Penilaian Kinerja & KPI 360°</h3>
                <p class="text-xs text-slate-500 mt-0.5">Evaluasi berkala kompetensi kerja rekan, atasan, bawahan, dan perpanjangan ikatan kerja.</p>
              </div>
            </div>
          </div>
          ${isHrd ? `
            <div class="flex items-center gap-2 flex-wrap">
              <button id="btn-distribusi-kpi-global" class="px-4 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                + Distribusi Tugas Penilaian
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Section 1: Tugas Penilaian Saya -->
        <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>📝 Tugas Penilaian yang Harus Saya Isi</span>
                <span class="text-xs px-2 py-0.5 rounded-full ${myTasks.filter(t => t.status !== 'DONE').length > 0 ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-slate-100 text-slate-600'}">${myTasks.filter(t => t.status !== 'DONE').length} Pending</span>
              </h4>
              <p class="text-xs text-slate-400 mt-0.5">Daftar evaluasi karyawan yang ditugaskan kepada Anda sebagai Penilai.</p>
            </div>
          </div>

          ${myTasks.length === 0 ? `
            <div class="p-8 text-center text-slate-400 italic text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Tidak ada tugas penilaian KPI yang ditugaskan kepada Anda saat ini.
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              ${myTasks.map(t => {
                const isDone = (t.status || "").toUpperCase() === "DONE";
                const catCfg = getCatConfig(t.kategori_penilaian);
                return `
                  <div class="p-4 rounded-xl border ${isDone ? 'border-slate-200 bg-slate-50/50' : 'border-amber-200 bg-amber-50/20 shadow-2xs'} flex flex-col justify-between space-y-3">
                    <div class="space-y-2">
                      <div class="flex items-start justify-between gap-2">
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${catCfg.badgeClass}">
                          ${catCfg.icon} ${catCfg.label}
                        </span>
                        ${badge(isDone ? "Selesai" : "Pending", isDone ? "emerald" : "amber")}
                      </div>
                      <div>
                        <span class="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">${escapeHtml(t.periode || "Periode")}</span>
                        <h4 class="font-bold text-slate-800 text-sm mt-0.5">${escapeHtml(t.nama_dinilai)}</h4>
                        <p class="text-xs text-slate-500">${escapeHtml(t.jabatan_dinilai || "-")}</p>
                      </div>
                      ${t.nama_template ? `
                        <div class="text-[11px] text-slate-600 bg-white/80 p-2 rounded-lg border border-slate-100">
                          <span class="text-slate-400">Template:</span> <strong>${escapeHtml(t.nama_template)}</strong>
                        </div>
                      ` : ''}
                      ${t.catatan_hrd ? `
                        <div class="text-[11px] text-blue-700 bg-blue-50/70 p-2 rounded-lg border border-blue-100">
                          <span class="font-bold">Instruksi HRD:</span> ${escapeHtml(t.catatan_hrd)}
                        </div>
                      ` : ''}
                    </div>
                    <div class="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      <span class="text-slate-400 text-[11px]">Batas: <strong>${t.deadline ? fmtDateShort(t.deadline) : '-'}</strong></span>
                      ${!isDone ? `
                        <button data-task-id="${t.id}" class="btn-fill-kpi-item px-3.5 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-lg text-xs transition shadow-2xs">
                          Isi Penilaian
                        </button>
                      ` : `
                        <span class="font-black text-emerald-700 text-xs bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">Skor: ${t.skor_akhir || 0}</span>
                      `}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `}
        </div>

        <!-- Section 2 (Khusus HRD/Admin): Monitoring Distribusi Seluruh Tugas KPI -->
        ${isHrd ? `
          <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 class="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span>📊 Monitoring Distribusi Seluruh Tugas Penilaian (HRD)</span>
                </h4>
                <p class="text-xs text-slate-400 mt-0.5">Pantau status pengisian penilaian oleh setiap penilai, kirim pengingat email, dan kelola penugasan.</p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button id="btn-broadcast-reminder-kpi" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5" title="Kirim email pengingat ke seluruh penilai yang belum selesai">
                  <span>📧</span> Kirim Email Pengingat Masal
                </button>
              </div>
            </div>

            <!-- Summary KPI Metric Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total Distribusi</p>
                <p class="text-xl font-black text-slate-800 mt-1">${totalTasks}</p>
              </div>
              <div class="bg-amber-50 p-3.5 rounded-xl border border-amber-200/70">
                <p class="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Menunggu / Pending</p>
                <p class="text-xl font-black text-amber-800 mt-1">${pendingTasks.length}</p>
              </div>
              <div class="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200/70">
                <p class="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Telah Selesai</p>
                <p class="text-xl font-black text-emerald-800 mt-1">${doneTasks.length}</p>
              </div>
              <div class="bg-blue-50 p-3.5 rounded-xl border border-blue-200/70">
                <p class="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Progres Pengisian</p>
                <p class="text-xl font-black text-blue-800 mt-1">${completionRate}%</p>
              </div>
            </div>

            <!-- Filters -->
            <div class="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2">
              <div class="flex items-center gap-2 w-full sm:w-auto flex-1">
                <div class="relative flex-1 sm:max-w-xs">
                  <input type="text" id="kpi-monitor-search" placeholder="🔍 Cari penilai atau yang dinilai..." class="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
                </div>
                <select id="kpi-monitor-status" class="px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 font-medium">
                  <option value="">Semua Status</option>
                  <option value="PENDING">Pending (Belum Diisi)</option>
                  <option value="DONE">Selesai (Sudah Dinilai)</option>
                </select>
                <select id="kpi-monitor-kategori" class="px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 bg-slate-50 font-medium">
                  <option value="">Semua Kategori</option>
                  ${Object.values(JENIS_PENILAIAN_MAP).map(c => `<option value="${c.key}">${c.label}</option>`).join("")}
                </select>
              </div>
              <div class="text-xs text-slate-400 font-medium self-end sm:self-auto" id="kpi-monitor-count-text">
                Menampilkan ${totalTasks} tugas
              </div>
            </div>

            <!-- Table Monitoring -->
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse" id="tbl-kpi-monitor">
                <thead>
                  <tr class="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    <th class="py-2.5 px-3">Penilai (Evaluator)</th>
                    <th class="py-2.5 px-3">Karyawan Dinilai</th>
                    <th class="py-2.5 px-3">Kategori & Template</th>
                    <th class="py-2.5 px-3">Periode & Batas</th>
                    <th class="py-2.5 px-3 text-center">Status</th>
                    <th class="py-2.5 px-3 text-center">Skor</th>
                    <th class="py-2.5 px-3 text-center">Aksi (HRD)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50 text-xs" id="tbody-kpi-monitor">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Bind Fill KPI button
    wrap.querySelectorAll(".btn-fill-kpi-item").forEach(btn => {
      btn.onclick = () => {
        const tid = btn.dataset.taskId;
        const taskObj = myTasks.find(t => t.id === tid);
        if (taskObj) {
          openPenilaianFormFromNotif(taskObj, myTasks, session);
        }
      };
    });

    if (isHrd) {
      const btnDist = wrap.querySelector("#btn-distribusi-kpi-global");
      if (btnDist) {
        btnDist.onclick = () => openDistribusiModal(null);
      }

      // Monitoring Table Dynamic Filter & Render
      const searchInp = wrap.querySelector("#kpi-monitor-search");
      const statusSel = wrap.querySelector("#kpi-monitor-status");
      const katSel = wrap.querySelector("#kpi-monitor-kategori");
      const tbody = wrap.querySelector("#tbody-kpi-monitor");
      const countText = wrap.querySelector("#kpi-monitor-count-text");

      function renderMonitorRows() {
        if (!tbody) return;
        const q = (searchInp ? searchInp.value : "").toLowerCase().trim();
        const stat = (statusSel ? statusSel.value : "").toUpperCase();
        const kat = katSel ? katSel.value : "";

        const filtered = tasks.filter(t => {
          const pName = (t.nama_penilai || "").toLowerCase();
          const dName = (t.nama_dinilai || "").toLowerCase();
          const tName = (t.nama_template || "").toLowerCase();
          const tStat = (t.status || "PENDING").toUpperCase();
          const tKat = t.kategori_penilaian || "KPI_360";

          const matchQ = !q || pName.includes(q) || dName.includes(q) || tName.includes(q);
          const matchStat = !stat || (stat === "PENDING" ? tStat !== "DONE" : tStat === "DONE");
          const matchKat = !kat || tKat === kat;

          return matchQ && matchStat && matchKat;
        }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        if (countText) {
          countText.textContent = `Menampilkan ${filtered.length} dari ${tasks.length} tugas`;
        }

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 italic">Tidak ada data penugasan penilaian yang sesuai filter.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(t => {
          const isDone = (t.status || "").toUpperCase() === "DONE";
          const catCfg = getCatConfig(t.kategori_penilaian);
          return `
            <tr class="hover:bg-slate-50/80 transition">
              <td class="py-2.5 px-3">
                <div class="font-bold text-slate-800">${escapeHtml(t.nama_penilai || "-")}</div>
                <div class="text-[10.5px] text-slate-400">${escapeHtml(t.email_penilai || t.jabatan_penilai || "-")}</div>
              </td>
              <td class="py-2.5 px-3">
                <div class="font-bold text-slate-800">${escapeHtml(t.nama_dinilai || "-")}</div>
                <div class="text-[10.5px] text-slate-400">${escapeHtml(t.jabatan_dinilai || "-")}</div>
              </td>
              <td class="py-2.5 px-3">
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${catCfg.badgeClass} mb-0.5">
                  ${catCfg.icon} ${catCfg.label}
                </span>
                <div class="text-[11px] text-slate-600 font-medium">${escapeHtml(t.nama_template || "Template KPI")}</div>
              </td>
              <td class="py-2.5 px-3">
                <div class="font-semibold text-slate-700">${escapeHtml(t.periode || "-")}</div>
                <div class="text-[10.5px] text-slate-400">Deadline: ${t.deadline ? fmtDateShort(t.deadline) : '-'}</div>
              </td>
              <td class="py-2.5 px-3 text-center">
                ${badge(isDone ? "Selesai" : "Pending", isDone ? "emerald" : "amber")}
              </td>
              <td class="py-2.5 px-3 text-center">
                ${isDone ? `<span class="font-black text-emerald-700 text-sm">${t.skor_akhir || 0}</span>` : '<span class="text-slate-300">-</span>'}
              </td>
              <td class="py-2.5 px-3 text-center">
                <div class="flex items-center justify-center gap-1">
                  ${!isDone ? `
                    <button data-action="resend-task" data-task-id="${t.id}" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-lg text-[11px] transition" title="Kirim Notifikasi Email & WhatsApp Ulang">
                      📧 Pengingat
                    </button>
                  ` : ''}
                  <button data-action="delete-task" data-task-id="${t.id}" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold rounded-lg text-[11px] transition" title="Hapus Tugas Ini">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join("");

        // Attach Resend action
        tbody.querySelectorAll('[data-action="resend-task"]').forEach(btn => {
          btn.onclick = async () => {
            const tid = btn.dataset.taskId;
            const taskObj = tasks.find(x => x.id === tid);
            if (!taskObj) return;

            btn.disabled = true;
            btn.textContent = "Mengirim...";

            const res = await sendKpiAssignmentNotification(taskObj, [taskObj]);
            if (res.emailSent) {
              toast(`Notifikasi email berhasil dikirimkan ke ${taskObj.email_penilai || taskObj.nama_penilai}!`, "success");
            } else {
              toast(`Notifikasi aplikasi terkirim. Email tidak terkirim: ${res.emailReason || 'Email belum diisi'}`, "info");
            }
            btn.disabled = false;
            btn.textContent = "📧 Pengingat";
          };
        });

        // Attach Delete action
        tbody.querySelectorAll('[data-action="delete-task"]').forEach(btn => {
          btn.onclick = async () => {
            const tid = btn.dataset.taskId;
            const taskObj = tasks.find(x => x.id === tid);
            if (!taskObj) return;

            confirmDialog(
              `Apakah Anda yakin ingin membatalkan & menghapus tugas penilaian untuk <b>${escapeHtml(taskObj.nama_penilai)}</b> menilai <b>${escapeHtml(taskObj.nama_dinilai)}</b>?`,
              async () => {
                try {
                  await fsDelete(COL.TUGAS_KPI_360, tid);
                  toast("Tugas penilaian berhasil dihapus", "success");
                  loadKpi360();
                } catch (e) {
                  toast("Gagal menghapus tugas: " + e.message, "error");
                }
              }
            );
          };
        });
      }

      if (searchInp) searchInp.oninput = renderMonitorRows;
      if (statusSel) statusSel.onchange = renderMonitorRows;
      if (katSel) katSel.onchange = renderMonitorRows;
      renderMonitorRows();

      // Bulk broadcast reminder
      const btnBroadcast = wrap.querySelector("#btn-broadcast-reminder-kpi");
      if (btnBroadcast) {
        btnBroadcast.onclick = async () => {
          if (pendingTasks.length === 0) {
            return toast("Seluruh tugas penilaian telah selesai! Tidak ada yang pending.", "info");
          }

          confirmDialog(
            `Kirimkan email pengingat kepada <b>${pendingTasks.length} penugasan pending</b> yang belum mengisi evaluasi?`,
            async () => {
              btnBroadcast.disabled = true;
              btnBroadcast.textContent = "Mengirim Email Pengingat...";
              
              // Group pending tasks by penilai
              const penilaiGroups = {};
              pendingTasks.forEach(t => {
                const key = t.nama_penilai || "Unknown";
                if (!penilaiGroups[key]) penilaiGroups[key] = [];
                penilaiGroups[key].push(t);
              });

              let sentCount = 0;
              for (const [pName, tList] of Object.entries(penilaiGroups)) {
                try {
                  const sampleTask = tList[0];
                  const res = await sendKpiAssignmentNotification(sampleTask, tList);
                  if (res.emailSent) sentCount++;
                } catch (e) {
                  console.warn("Gagal kirim pengingat ke:", pName, e);
                }
              }

              toast(`Berhasil mengirimkan pengingat email ke ${sentCount} evaluator!`, "success");
              btnBroadcast.disabled = false;
              btnBroadcast.textContent = "📧 Kirim Email Pengingat Masal";
            }
          );
        };
      }
    }
  }

  /**
   * Helper to send HTML Email & In-App Notification for KPI 360 Task Assignments
   */
  async function sendKpiAssignmentNotification(representativeTask, allTasksForEvaluator) {
    const penilaiName = representativeTask.nama_penilai;
    const targetEmail = representativeTask.email_penilai;
    const periode = representativeTask.periode || "-";
    const deadlineStr = representativeTask.deadline ? fmtDateShort(representativeTask.deadline) : "Segera";
    const catConfig = getCatConfig(representativeTask.kategori_penilaian);
    const appUrl = `${window.location.origin + window.location.pathname}#penilaian-kontrak?tab=kpi360`;

    // 1. Send In-App Notification (Bell) with sendEmail: false to avoid duplicate generic emails
    try {
      const notifTitle = `Tugas Penilaian ${catConfig.label}`;
      const notifMsg = `Anda menerima penugasan penilaian ${catConfig.label} untuk ${allTasksForEvaluator.length} karyawan (${allTasksForEvaluator.map(x => x.nama_dinilai).slice(0, 3).join(", ")}${allTasksForEvaluator.length > 3 ? '...' : ''}). Batas waktu: ${deadlineStr}.`;
      await notifyUser(penilaiName, notifTitle, notifMsg, "#penilaian-kontrak?tab=kpi360", { sendEmail: false });
    } catch (e) {
      console.warn("notifyUser error:", e);
    }

    // 2. Send Email if email address exists
    if (!targetEmail || !targetEmail.includes("@")) {
      return { emailSent: false, emailReason: "Email penilai tidak ditemukan" };
    }

    const emailSubject = `[HRIS Penilaian Kinerja] Penugasan ${catConfig.label} - Periode ${periode}`;
    
    const evaluateesListHtml = allTasksForEvaluator.map((t, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 12px; font-weight: bold; color: #1e293b; font-size: 13px;">
          ${idx + 1}. ${escapeHtml(t.nama_dinilai)}
        </td>
        <td style="padding: 10px 12px; color: #64748b; font-size: 12px;">
          ${escapeHtml(t.jabatan_dinilai || "-")}
        </td>
        <td style="padding: 10px 12px; color: #334155; font-size: 12px; font-weight: 600;">
          ${escapeHtml(t.nama_template || "Template KPI")}
        </td>
      </tr>
    `).join("");

    const emailHtml = buildStandardEmailHtml({
      badgeText: "Penugasan KPI",
      badgeVariant: "maroon",
      title: `Penugasan ${catConfig.label}`,
      recipientName: penilaiName,
      introText: `Anda telah ditugaskan oleh <strong>Tim HRD ${escapeHtml(COMPANY_NAME)}</strong> untuk melakukan evaluasi kinerja (<strong>${escapeHtml(catConfig.label)}</strong>) pada periode <strong>${escapeHtml(periode)}</strong>.`,
      infoList: [
        { label: "Kategori Penilaian", value: catConfig.label },
        { label: "Periode", value: periode },
        { label: "Batas Waktu (Deadline)", value: deadlineStr },
        ...(representativeTask.catatan_hrd ? [{ label: "Catatan HRD", value: representativeTask.catatan_hrd }] : [])
      ],
      bodyHtml: `
        <h4 style="margin: 20px 0 10px 0; color: #1e293b; font-size: 14px; font-weight: 700;">
          Daftar Karyawan yang Harus Anda Evaluasi (${allTasksForEvaluator.length} Orang):
        </h4>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">
              <th style="padding: 10px 12px;">Nama Karyawan</th>
              <th style="padding: 10px 12px;">Jabatan</th>
              <th style="padding: 10px 12px;">Template Soal</th>
            </tr>
          </thead>
          <tbody>
            ${evaluateesListHtml}
          </tbody>
        </table>
      `,
      actionUrl: appUrl,
      actionText: "Buka & Isi Penilaian di Portal HRIS →",
      secondaryNote: "Evaluasi ini bersifat rahasia dan wajib diselesaikan sebelum batas waktu yang telah ditentukan."
    });

    try {
      const emailResult = await sendEmailNotif(targetEmail, emailSubject, emailHtml);
      return { emailSent: true, emailResult };
    } catch (err) {
      console.warn("Gagal mengirim email notifikasi KPI:", err);
      return { emailSent: false, emailReason: err.message };
    }
  }

  /**
   * Modal Distribusi Tugas KPI 360° dengan Multi Penilai & Multi Dinilai (Checkbox + Search Box)
   */
  async function openDistribusiModal(preselectedTplId = null) {
    const [templates, employees, userAccounts] = await Promise.all([
      fsGetAll(COL.MASTER_SOAL_KPI),
      fsGetAll(COL.MASTER_KARYAWAN),
      fsGetAll(COL.PENGGUNA).catch(() => [])
    ]);

    // Active employees sorted alphabetically
    const activeEmps = employees
      .filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF")
      .sort((a, b) => (a.nama_karyawan || "").localeCompare(b.nama_karyawan || ""));

    // Build email map for fast lookup
    const emailMap = new Map();
    activeEmps.forEach(e => {
      const email = e.email || e.email_perusahaan || e.email_pribadi || "";
      if (email && email.includes("@")) {
        emailMap.set((e.nama_karyawan || "").toLowerCase().trim(), email.trim());
        if (e.nik_karyawan || e.nik) {
          emailMap.set((e.nik_karyawan || e.nik).toLowerCase().trim(), email.trim());
        }
      }
    });

    userAccounts.forEach(u => {
      const email = u.email || "";
      if (email && email.includes("@")) {
        if (u.nama) emailMap.set((u.nama || "").toLowerCase().trim(), email.trim());
        if (u.username && u.username.includes("@")) emailMap.set((u.username || "").toLowerCase().trim(), u.username.trim());
      }
    });

    // Helper to find email
    function getEmpEmail(emp) {
      const byDirect = emp.email || emp.email_perusahaan || emp.email_pribadi || "";
      if (byDirect && byDirect.includes("@")) return byDirect.trim();
      const byName = emailMap.get((emp.nama_karyawan || "").toLowerCase().trim());
      if (byName) return byName;
      const byNik = emailMap.get((emp.nik_karyawan || emp.nik || "").toLowerCase().trim());
      return byNik || "";
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const defaultPeriode = currentMonth <= 6 ? `Semester 1 ${currentYear}` : `Semester 2 ${currentYear}`;

    // Selected template object
    let selectedTpl = preselectedTplId ? templates.find(t => t.id === preselectedTplId) : (templates[0] || null);
    let initialCategory = selectedTpl?.kategori_penilaian || "KPI_360";

    openModal({
      title: "Distribusi Penugasan Penilaian Kinerja & KPI 360°",
      size: "xl",
      bodyHtml: `
        <form id="form-distribusi-kpi" class="space-y-4 text-left">
          
          <!-- Top Section: Kategori Penilaian & Template Soal -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">
                Kategori Penilaian <span class="text-rose-500">*</span>
              </label>
              <select id="dist-kategori-sel" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-800 bg-white" required>
                ${Object.values(JENIS_PENILAIAN_MAP).map(cat => `
                  <option value="${cat.key}" ${initialCategory === cat.key ? 'selected' : ''}>
                    ${cat.icon} ${cat.label}
                  </option>
                `).join('')}
              </select>
              <p class="text-[11px] text-slate-400 mt-1">Menentukan standar rekomendasi grade & keputusan akhir HRD.</p>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">
                Pilih Template Soal KPI <span class="text-rose-500">*</span>
              </label>
              <select id="dist-tpl-id" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-semibold text-slate-800 bg-white" required>
                <option value="">-- Pilih Template Soal --</option>
                ${templates.map(t => {
                  const soalCount = (t.soal_json || []).length;
                  const tKat = t.kategori_penilaian || "KPI_360";
                  return `
                    <option value="${t.id}" data-kat="${tKat}" ${selectedTpl?.id === t.id ? 'selected' : ''}>
                      ${escapeHtml(t.nama_template)} (${soalCount} Indikator) [${tKat}]
                    </option>
                  `;
                }).join("")}
              </select>
              <div id="dist-tpl-preview-text" class="text-[11px] text-maroon-700 font-medium mt-1">
                ${selectedTpl ? `✓ ${escapeHtml(selectedTpl.nama_template)}: ${(selectedTpl.soal_json || []).length} Indikator Soal.` : ''}
              </div>
            </div>
          </div>

          <!-- Middle Section: Periode, Deadline, Tipe Penugasan -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Periode Penilaian <span class="text-rose-500">*</span></label>
              <input type="text" id="dist-periode" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" placeholder="Misal: Semester 1 ${currentYear}" value="${defaultPeriode}" required>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Batas Waktu (Deadline) <span class="text-rose-500">*</span></label>
              <input type="date" id="dist-deadline" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Tipe Penilai / Relasi 360°</label>
              <select id="dist-tipe-relasi" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
                <option value="360 Multi-Rater">360° Multi-Rater (Komprehensif)</option>
                <option value="Atasan Langsung">Evaluasi Atasan Langsung</option>
                <option value="Rekan Sejawat (Peer)">Rekan Sejawat / Peer Review</option>
                <option value="Bawahan">Bawahan ke Atasan (Upward)</option>
                <option value="Penilaian Mandiri">Penilaian Mandiri (Self Review)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Catatan / Instruksi HRD untuk Evaluator (Opsional)</label>
            <textarea id="dist-catatan-hrd" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" placeholder="Tuliskan petunjuk atau instruksi khusus dari HRD..."></textarea>
          </div>

          <!-- Live Preview Soal & Bobot Penilaian Template (Untuk Melihat Kesesuaian Bobot dan Pertanyaan) -->
          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div class="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 cursor-pointer select-none" id="dist-soal-header-toggle" title="Klik untuk membuka/menutup rincian pertanyaan dan bobot">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📋 Rincian Soal & Bobot:</span>
                  <span id="dist-soal-tpl-name" class="text-maroon-700 font-extrabold">${selectedTpl ? escapeHtml(selectedTpl.nama_template) : '-'}</span>
                </span>
                <span id="dist-soal-count-badge" class="text-[10.5px] font-bold bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded-md border border-maroon-200">
                  ${selectedTpl ? (selectedTpl.soal_json || []).length : 0} Indikator
                </span>
                <span id="dist-bobot-sum-badge" class="text-[10.5px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
                  Total Bobot: 100%
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-slate-400 font-medium hidden sm:inline" id="dist-soal-toggle-text">Klik untuk sembunyikan/tampilkan</span>
                <span id="dist-soal-toggle-icon" class="text-slate-400 text-xs transition-transform transform">▼</span>
              </div>
            </div>

            <div id="dist-soal-body-box" class="p-3 bg-white space-y-2">
              <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Periksa kesesuaian aspek penilaian, butir pertanyaan, dan persentase bobot sebelum mendistribusikan:</span>
                <span class="text-[10.5px] text-slate-400 italic">Skala: <strong>${selectedTpl?.skala_penilaian || '0 - 100'}</strong></span>
              </div>
              <div class="overflow-x-auto max-h-52 overflow-y-auto rounded-lg border border-slate-100">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="bg-slate-50 text-[10.5px] font-bold text-slate-500 uppercase sticky top-0 border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th class="py-2 px-2.5 w-10 text-center">No</th>
                      <th class="py-2 px-3 w-40">Aspek Penilaian</th>
                      <th class="py-2 px-3">Indikator Kinerja / Detail Pertanyaan</th>
                      <th class="py-2 px-3 w-24 text-center">Bobot</th>
                    </tr>
                  </thead>
                  <tbody id="dist-soal-tbody" class="divide-y divide-slate-100 text-slate-700">
                    <!-- Rendered dynamically -->
                  </tbody>
                  <tfoot class="bg-slate-50/90 font-bold border-t border-slate-200 text-xs">
                    <tr>
                      <td colspan="3" class="py-2 px-3 text-right text-slate-700">Total Akumulasi Bobot:</td>
                      <td class="py-2 px-3 text-center font-black" id="dist-soal-tfoot-bobot">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <!-- Section Checklist & Search: Penilai & Yang Dinilai -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            
            <!-- Box 1: PILIH PENILAI (EVALUATOR) -->
            <div class="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 shadow-2xs">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-md bg-maroon-50 text-maroon-700 flex items-center justify-center font-bold text-xs">1</span>
                  <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Pilih Penilai (Evaluator)</h4>
                </div>
                <span id="badge-count-penilai" class="text-[11px] font-bold bg-maroon-50 text-maroon-700 px-2 py-0.5 rounded-full border border-maroon-200">
                  0 Terpilih
                </span>
              </div>

              <!-- Search & Quick Action for Penilai -->
              <div class="space-y-1.5">
                <div class="relative">
                  <input type="text" id="search-penilai-input" placeholder="🔍 Cari nama penilai, jabatan, cabang..." class="w-full px-2.5 py-1.5 pl-8 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <div class="flex items-center gap-2">
                    <button type="button" id="btn-select-all-penilai" class="text-maroon-700 hover:underline font-bold">Pilih Semua</button>
                    <span class="text-slate-300">|</span>
                    <button type="button" id="btn-deselect-all-penilai" class="text-slate-500 hover:underline">Batal Semua</button>
                  </div>
                  <span class="text-slate-400" id="info-penilai-count">${activeEmps.length} Karyawan</span>
                </div>
              </div>

              <!-- Scrollable Checkbox List Penilai -->
              <div id="list-penilai-container" class="max-h-52 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
                ${activeEmps.map(emp => {
                  const empEmail = getEmpEmail(emp);
                  const hasEmail = Boolean(empEmail && empEmail.includes("@"));
                  return `
                    <label class="penilai-item flex items-center justify-between gap-2 p-2 rounded-lg bg-white hover:bg-maroon-50/50 border border-slate-100 transition cursor-pointer" data-nama="${escapeHtml(emp.nama_karyawan)}" data-jabatan="${escapeHtml(emp.jabatan || '')}" data-cabang="${escapeHtml(emp.cabang || '')}">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <input type="checkbox" name="chk-penilai" value="${escapeHtml(emp.nama_karyawan)}" class="w-4 h-4 rounded text-maroon-700 border-slate-300 focus:ring-maroon-500 shrink-0">
                        <div class="truncate">
                          <div class="font-bold text-slate-800 text-xs truncate">${escapeHtml(emp.nama_karyawan)}</div>
                          <div class="text-[10px] text-slate-500 truncate">${escapeHtml(emp.jabatan || "-")} (${escapeHtml(emp.cabang || "Pusat")})</div>
                        </div>
                      </div>
                      <div class="shrink-0 text-right">
                        ${hasEmail ? `
                          <span class="text-[9.5px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title="${escapeHtml(empEmail)}">✉️ Ada Email</span>
                        ` : `
                          <span class="text-[9.5px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Email belum tercatat di data karyawan">⚠️ Tanpa Email</span>
                        `}
                      </div>
                    </label>
                  `;
                }).join("")}
              </div>
            </div>

            <!-- Box 2: PILIH KARYAWAN YANG DINILAI (EVALUATEE) -->
            <div class="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 shadow-2xs">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">2</span>
                  <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wide">Pilih Karyawan yang Dinilai</h4>
                </div>
                <span id="badge-count-dinilai" class="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  0 Terpilih
                </span>
              </div>

              <!-- Search & Quick Action for Dinilai -->
              <div class="space-y-1.5">
                <div class="relative">
                  <input type="text" id="search-dinilai-input" placeholder="🔍 Cari nama karyawan yang dinilai, jabatan..." class="w-full px-2.5 py-1.5 pl-8 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <div class="flex items-center gap-2">
                    <button type="button" id="btn-select-all-dinilai" class="text-blue-700 hover:underline font-bold">Pilih Semua</button>
                    <span class="text-slate-300">|</span>
                    <button type="button" id="btn-deselect-all-dinilai" class="text-slate-500 hover:underline">Batal Semua</button>
                    <span class="text-slate-300">|</span>
                    <button type="button" id="btn-use-template-assigned" class="text-emerald-700 hover:underline font-bold" title="Pilih otomatis karyawan yang terdaftar di Template ini">Pakai List Template</button>
                  </div>
                  <span class="text-slate-400" id="info-dinilai-count">${activeEmps.length} Karyawan</span>
                </div>
              </div>

              <!-- Scrollable Checkbox List Dinilai -->
              <div id="list-dinilai-container" class="max-h-52 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded-lg p-1 bg-slate-50/50">
                ${activeEmps.map(emp => `
                  <label class="dinilai-item flex items-center justify-between gap-2 p-2 rounded-lg bg-white hover:bg-blue-50/50 border border-slate-100 transition cursor-pointer" data-nama="${escapeHtml(emp.nama_karyawan)}" data-jabatan="${escapeHtml(emp.jabatan || '')}" data-cabang="${escapeHtml(emp.cabang || '')}">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <input type="checkbox" name="chk-dinilai" value="${escapeHtml(emp.nama_karyawan)}" class="w-4 h-4 rounded text-blue-700 border-slate-300 focus:ring-blue-500 shrink-0">
                      <div class="truncate">
                        <div class="font-bold text-slate-800 text-xs truncate">${escapeHtml(emp.nama_karyawan)}</div>
                        <div class="text-[10px] text-slate-500 truncate">${escapeHtml(emp.jabatan || "-")} (${escapeHtml(emp.cabang || "Pusat")})</div>
                      </div>
                    </div>
                    <div class="shrink-0 text-right text-[10px] text-slate-400">
                      ${escapeHtml(formatStatusKaryawan(emp.status_karyawan || ""))}
                    </div>
                  </label>
                `).join("")}
              </div>
            </div>
          </div>

          <!-- Distribution Calculator Summary & Notification Toggles -->
          <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="text-xs text-amber-900 font-medium">
                📊 Kalkulasi Distribusi: <strong id="calc-penilai-num" class="text-maroon-700 font-bold">0</strong> Penilai × <strong id="calc-dinilai-num" class="text-blue-700 font-bold">0</strong> Karyawan Dinilai = <strong id="calc-total-tasks" class="text-slate-900 font-black text-sm">0</strong> Total Tugas Evaluasi.
              </div>
              <label class="flex items-center gap-1.5 text-xs text-slate-700 font-bold cursor-pointer">
                <input type="checkbox" id="dist-include-self" class="rounded text-maroon-700">
                <span>Sertakan Penilaian Diri Sendiri (Self-Appraisal)</span>
              </label>
            </div>

            <div class="flex items-center gap-4 text-xs text-slate-600 pt-1 border-t border-amber-200/60 flex-wrap">
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" id="dist-send-email" class="rounded text-maroon-700" checked>
                <span class="font-semibold text-slate-800">📧 Kirim Notifikasi Email ke Evaluator</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" id="dist-send-inapp" class="rounded text-maroon-700" checked>
                <span class="font-semibold text-slate-800">🔔 Notifikasi Lonceng & Popup di Aplikasi</span>
              </label>
            </div>
          </div>

        </form>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full">
          <div class="text-[11.5px] text-slate-400 hidden sm:block">
            Pastikan seluruh penilai dan karyawan yang dinilai telah dicentang dengan benar.
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-dist-batal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition">Batal</button>
            <button id="btn-dist-simpan" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-lg transition shadow-md flex items-center gap-2">
              <span>🚀 Distribusikan & Kirim Email</span>
            </button>
          </div>
        </div>
      `,
      onMount: (m) => {
        // Set default deadline (14 days from now)
        const defaultDeadline = new Date();
        defaultDeadline.setDate(defaultDeadline.getDate() + 14);
        m.querySelector("#dist-deadline").value = defaultDeadline.toISOString().slice(0, 10);

        const selKategori = m.querySelector("#dist-kategori-sel");
        const selTpl = m.querySelector("#dist-tpl-id");
        const tplPreviewText = m.querySelector("#dist-tpl-preview-text");

        // Helper to render question & weight preview table
        function renderDistSoalPreview(tpl) {
          const tplNameEl = m.querySelector("#dist-soal-tpl-name");
          const countBadge = m.querySelector("#dist-soal-count-badge");
          const sumBadge = m.querySelector("#dist-bobot-sum-badge");
          const tbody = m.querySelector("#dist-soal-tbody");
          const tfootBobot = m.querySelector("#dist-soal-tfoot-bobot");

          if (!tpl || !Array.isArray(tpl.soal_json) || tpl.soal_json.length === 0) {
            if (tplNameEl) tplNameEl.textContent = tpl ? (tpl.nama_template || "-") : "Belum Dipilih";
            if (countBadge) countBadge.textContent = "0 Indikator";
            if (sumBadge) {
              sumBadge.className = "text-[10.5px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200";
              sumBadge.textContent = "Total Bobot: 0%";
            }
            if (tbody) {
              tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-400 italic">Pilih template penilaian terlebih dahulu untuk melihat kesesuaian soal dan bobot.</td></tr>`;
            }
            if (tfootBobot) tfootBobot.textContent = "0%";
            return;
          }

          const soalList = tpl.soal_json;
          let totalBobot = 0;
          soalList.forEach(s => {
            totalBobot += parseFloat(s.bobot) || 0;
          });
          totalBobot = Math.round(totalBobot * 10) / 10;

          if (tplNameEl) tplNameEl.textContent = tpl.nama_template || "Template KPI";
          if (countBadge) countBadge.textContent = `${soalList.length} Indikator`;

          const isExact100 = Math.abs(totalBobot - 100) < 0.01;
          if (sumBadge) {
            if (isExact100) {
              sumBadge.className = "text-[10.5px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200";
              sumBadge.innerHTML = "✓ Total Bobot: 100%";
            } else {
              sumBadge.className = "text-[10.5px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200";
              sumBadge.innerHTML = `⚠️ Total Bobot: ${totalBobot}% (Tidak 100%)`;
            }
          }

          if (tfootBobot) {
            tfootBobot.className = `py-2 px-3 text-center font-black ${isExact100 ? 'text-emerald-700' : 'text-rose-600'}`;
            tfootBobot.textContent = `${totalBobot}%`;
          }

          if (tbody) {
            tbody.innerHTML = soalList.map((s, idx) => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="py-2 px-2.5 text-center font-bold text-slate-400">${idx + 1}</td>
                <td class="py-2 px-3 font-bold text-slate-800">
                  <span class="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] border border-slate-200/80">
                    ${escapeHtml(s.aspek || "Kompetensi")}
                  </span>
                </td>
                <td class="py-2 px-3 font-medium text-slate-700 leading-snug">
                  ${escapeHtml(s.indikator || "-")}
                </td>
                <td class="py-2 px-3 text-center">
                  <span class="inline-block font-extrabold text-maroon-800 bg-maroon-50 px-2.5 py-0.5 rounded-md border border-maroon-200 text-xs">
                    ${s.bobot || 0}%
                  </span>
                </td>
              </tr>
            `).join("");
          }
        }

        // Toggle Preview Box
        const soalHeaderToggle = m.querySelector("#dist-soal-header-toggle");
        const soalBodyBox = m.querySelector("#dist-soal-body-box");
        const soalToggleIcon = m.querySelector("#dist-soal-toggle-icon");
        if (soalHeaderToggle && soalBodyBox) {
          soalHeaderToggle.onclick = () => {
            const isHidden = soalBodyBox.style.display === "none";
            soalBodyBox.style.display = isHidden ? "block" : "none";
            if (soalToggleIcon) {
              soalToggleIcon.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
            }
          };
        }

        // Initial preview render
        renderDistSoalPreview(selectedTpl);

        // Filter templates when category changes
        selKategori.addEventListener("change", () => {
          const selectedKat = selKategori.value;
          const options = Array.from(selTpl.options);
          
          let matchingTpl = null;
          options.forEach(opt => {
            if (!opt.value) return;
            const optKat = opt.dataset.kat;
            if (optKat === selectedKat) {
              opt.style.display = "";
              if (!matchingTpl) matchingTpl = opt;
            } else {
              opt.style.display = "";
            }
          });

          if (matchingTpl) {
            selTpl.value = matchingTpl.value;
            selTpl.dispatchEvent(new Event("change"));
          }
        });

        selTpl.addEventListener("change", () => {
          const tplId = selTpl.value;
          selectedTpl = templates.find(t => t.id === tplId);
          if (selectedTpl) {
            tplPreviewText.innerHTML = `✓ <strong>${escapeHtml(selectedTpl.nama_template)}</strong>: ${(selectedTpl.soal_json || []).length} Indikator Kinerja (${selectedTpl.kategori_penilaian || 'KPI_360'}).`;
          } else {
            tplPreviewText.innerHTML = "";
          }
          renderDistSoalPreview(selectedTpl);
        });

        // Search logic for Penilai
        const searchPenilaiInp = m.querySelector("#search-penilai-input");
        const penilaiItems = m.querySelectorAll(".penilai-item");
        const infoPenilaiCount = m.querySelector("#info-penilai-count");

        searchPenilaiInp.addEventListener("input", () => {
          const q = searchPenilaiInp.value.toLowerCase().trim();
          let visibleCount = 0;
          penilaiItems.forEach(item => {
            const nama = (item.dataset.nama || "").toLowerCase();
            const jabatan = (item.dataset.jabatan || "").toLowerCase();
            const cabang = (item.dataset.cabang || "").toLowerCase();
            if (!q || nama.includes(q) || jabatan.includes(q) || cabang.includes(q)) {
              item.style.display = "";
              visibleCount++;
            } else {
              item.style.display = "none";
            }
          });
          infoPenilaiCount.textContent = `${visibleCount} Karyawan`;
        });

        // Search logic for Dinilai
        const searchDinilaiInp = m.querySelector("#search-dinilai-input");
        const dinilaiItems = m.querySelectorAll(".dinilai-item");
        const infoDinilaiCount = m.querySelector("#info-dinilai-count");

        searchDinilaiInp.addEventListener("input", () => {
          const q = searchDinilaiInp.value.toLowerCase().trim();
          let visibleCount = 0;
          dinilaiItems.forEach(item => {
            const nama = (item.dataset.nama || "").toLowerCase();
            const jabatan = (item.dataset.jabatan || "").toLowerCase();
            const cabang = (item.dataset.cabang || "").toLowerCase();
            if (!q || nama.includes(q) || jabatan.includes(q) || cabang.includes(q)) {
              item.style.display = "";
              visibleCount++;
            } else {
              item.style.display = "none";
            }
          });
          infoDinilaiCount.textContent = `${visibleCount} Karyawan`;
        });

        // Calculation & Badges update
        const badgeCountPenilai = m.querySelector("#badge-count-penilai");
        const badgeCountDinilai = m.querySelector("#badge-count-dinilai");
        const calcPenilaiNum = m.querySelector("#calc-penilai-num");
        const calcDinilaiNum = m.querySelector("#calc-dinilai-num");
        const calcTotalTasks = m.querySelector("#calc-total-tasks");
        const chkIncludeSelf = m.querySelector("#dist-include-self");

        function updateCounts() {
          const checkedPenilai = Array.from(m.querySelectorAll('input[name="chk-penilai"]:checked')).map(c => c.value);
          const checkedDinilai = Array.from(m.querySelectorAll('input[name="chk-dinilai"]:checked')).map(c => c.value);
          const includeSelf = chkIncludeSelf.checked;

          badgeCountPenilai.textContent = `${checkedPenilai.length} Terpilih`;
          badgeCountDinilai.textContent = `${checkedDinilai.length} Terpilih`;

          calcPenilaiNum.textContent = checkedPenilai.length;
          calcDinilaiNum.textContent = checkedDinilai.length;

          // Calculate total pairs
          let taskCount = 0;
          checkedPenilai.forEach(p => {
            checkedDinilai.forEach(d => {
              if (p !== d || includeSelf) {
                taskCount++;
              }
            });
          });

          calcTotalTasks.textContent = taskCount;
        }

        m.querySelectorAll('input[name="chk-penilai"]').forEach(c => c.addEventListener("change", updateCounts));
        m.querySelectorAll('input[name="chk-dinilai"]').forEach(c => c.addEventListener("change", updateCounts));
        chkIncludeSelf.addEventListener("change", updateCounts);

        // Penilai Action Buttons
        m.querySelector("#btn-select-all-penilai").onclick = () => {
          penilaiItems.forEach(item => {
            if (item.style.display !== "none") {
              const chk = item.querySelector('input[name="chk-penilai"]');
              if (chk) chk.checked = true;
            }
          });
          updateCounts();
        };

        m.querySelector("#btn-deselect-all-penilai").onclick = () => {
          m.querySelectorAll('input[name="chk-penilai"]').forEach(c => c.checked = false);
          updateCounts();
        };

        // Dinilai Action Buttons
        m.querySelector("#btn-select-all-dinilai").onclick = () => {
          dinilaiItems.forEach(item => {
            if (item.style.display !== "none") {
              const chk = item.querySelector('input[name="chk-dinilai"]');
              if (chk) chk.checked = true;
            }
          });
          updateCounts();
        };

        m.querySelector("#btn-deselect-all-dinilai").onclick = () => {
          m.querySelectorAll('input[name="chk-dinilai"]').forEach(c => c.checked = false);
          updateCounts();
        };

        // Auto select assigned employees from template
        m.querySelector("#btn-use-template-assigned").onclick = () => {
          if (!selectedTpl || !Array.isArray(selectedTpl.karyawan_assigned) || selectedTpl.karyawan_assigned.length === 0) {
            return toast("Template yang dipilih belum memiliki daftar karyawan terdaftar.", "info");
          }
          const assignedSet = new Set(selectedTpl.karyawan_assigned.map(n => (n || "").toLowerCase().trim()));
          
          let matchedCount = 0;
          m.querySelectorAll('input[name="chk-dinilai"]').forEach(chk => {
            if (assignedSet.has(chk.value.toLowerCase().trim())) {
              chk.checked = true;
              matchedCount++;
            } else {
              chk.checked = false;
            }
          });
          updateCounts();
          toast(`Berhasil mencentang ${matchedCount} karyawan dari template '${selectedTpl.nama_template}'`, "success");
        };

        // Pre-check template assigned if opening for specific template
        if (selectedTpl && Array.isArray(selectedTpl.karyawan_assigned) && selectedTpl.karyawan_assigned.length > 0) {
          const assignedSet = new Set(selectedTpl.karyawan_assigned.map(n => (n || "").toLowerCase().trim()));
          m.querySelectorAll('input[name="chk-dinilai"]').forEach(chk => {
            if (assignedSet.has(chk.value.toLowerCase().trim())) {
              chk.checked = true;
            }
          });
          updateCounts();
        }

        m.querySelector("#btn-dist-batal").onclick = closeModal;

        // Submit Handler
        m.querySelector("#btn-dist-simpan").onclick = async () => {
          const form = m.querySelector("#form-distribusi-kpi");
          if (!form.reportValidity()) return;

          const kategori = m.querySelector("#dist-kategori-sel").value;
          const tplId = m.querySelector("#dist-tpl-id").value;
          const periode = m.querySelector("#dist-periode").value.trim();
          const deadline = m.querySelector("#dist-deadline").value;
          const tipeRelasi = m.querySelector("#dist-tipe-relasi").value;
          const catatanHrd = m.querySelector("#dist-catatan-hrd").value.trim();
          const includeSelf = chkIncludeSelf.checked;
          const shouldSendEmail = m.querySelector("#dist-send-email").checked;
          const shouldSendInApp = m.querySelector("#dist-send-inapp").checked;

          const selectedPenilai = Array.from(m.querySelectorAll('input[name="chk-penilai"]:checked')).map(c => c.value);
          const selectedDinilai = Array.from(m.querySelectorAll('input[name="chk-dinilai"]:checked')).map(c => c.value);

          if (!tplId) return toast("Harap pilih Template Soal KPI terlebih dahulu!", "warning");
          if (selectedPenilai.length === 0) return toast("Pilih minimal 1 Penilai (Evaluator)!", "warning");
          if (selectedDinilai.length === 0) return toast("Pilih minimal 1 Karyawan yang Dinilai!", "warning");

          const tplObj = templates.find(t => t.id === tplId);
          if (!tplObj) return toast("Template KPI tidak ditemukan!", "error");

          const btnSave = m.querySelector("#btn-dist-simpan");
          btnSave.disabled = true;
          btnSave.innerHTML = `<span class="inline-block animate-spin">⏳</span> Mendistribusikan & Mengirim Email...`;

          try {
            const createdTasks = [];
            const tasksByPenilai = {};

            // Generate task records for each evaluator -> evaluatee pair
            for (const pName of selectedPenilai) {
              const empPenilai = activeEmps.find(e => e.nama_karyawan === pName) || { nama_karyawan: pName };
              const emailPenilai = getEmpEmail(empPenilai);

              for (const dName of selectedDinilai) {
                if (pName === dName && !includeSelf) {
                  continue; // Skip self review unless enabled
                }

                const empDinilai = activeEmps.find(e => e.nama_karyawan === dName) || { nama_karyawan: dName };
                const emailDinilai = getEmpEmail(empDinilai);

                const taskId = genId("TGS-360");
                const taskPayload = {
                  id_template: tplObj.id || "",
                  nama_template: tplObj.nama_template || "Template KPI",
                  kategori_penilaian: kategori || "KPI_360",
                  nama_dinilai: dName,
                  jabatan_dinilai: empDinilai.jabatan || "",
                  nik_dinilai: empDinilai.nik_karyawan || empDinilai.nik || "",
                  cabang_dinilai: empDinilai.cabang || "",
                  divisi_dinilai: empDinilai.divisi || "",
                  email_dinilai: emailDinilai,
                  nama_penilai: pName,
                  jabatan_penilai: empPenilai.jabatan || "",
                  nik_penilai: empPenilai.nik_karyawan || empPenilai.nik || "",
                  cabang_penilai: empPenilai.cabang || "",
                  divisi_penilai: empPenilai.divisi || "",
                  email_penilai: emailPenilai,
                  tipe_relasi: tipeRelasi || "360 Multi-Rater",
                  periode: periode,
                  deadline: deadline,
                  soal_json: tplObj.soal_json || [],
                  catatan_hrd: catatanHrd,
                  status: "PENDING",
                  created_at: new Date().toISOString(),
                  created_by: session.nama || "HRD"
                };

                await fsAdd(COL.TUGAS_KPI_360, taskPayload, taskId);
                taskPayload.id = taskId;
                createdTasks.push(taskPayload);

                if (!tasksByPenilai[pName]) tasksByPenilai[pName] = [];
                tasksByPenilai[pName].push(taskPayload);
              }
            }

            if (createdTasks.length === 0) {
              btnSave.disabled = false;
              btnSave.textContent = "🚀 Distribusikan & Kirim Email";
              return toast("Tidak ada pasangan penilai dan karyawan dinilai yang valid.", "warning");
            }

            // Send Email and In-App Notifications for each Evaluator
            let emailSuccessCount = 0;
            let emailFailCount = 0;

            if (shouldSendEmail || shouldSendInApp) {
              for (const [pName, pTaskList] of Object.entries(tasksByPenilai)) {
                try {
                  const sampleTask = pTaskList[0];
                  if (shouldSendInApp) {
                    const deadlineStr = sampleTask.deadline ? fmtDateShort(sampleTask.deadline) : "Segera";
                    const catConfig = getCatConfig(sampleTask.kategori_penilaian);
                    const notifTitle = `Tugas Penilaian ${catConfig.label}`;
                    const notifMsg = `Anda menerima penugasan penilaian ${catConfig.label} untuk ${pTaskList.length} karyawan (${pTaskList.map(x => x.nama_dinilai).slice(0, 3).join(", ")}${pTaskList.length > 3 ? '...' : ''}). Batas waktu: ${deadlineStr}.`;
                    await notifyUser(pName, notifTitle, notifMsg, "#penilaian-kontrak?tab=kpi360", { sendEmail: false });
                  }

                  if (shouldSendEmail) {
                    const emailRes = await sendKpiAssignmentNotification(sampleTask, pTaskList);
                    if (emailRes.emailSent) {
                      emailSuccessCount++;
                    } else {
                      emailFailCount++;
                    }
                  }
                } catch (errNotif) {
                  console.warn("Gagal kirim notifikasi ke evaluator:", pName, errNotif);
                }
              }
            }

            let summaryMsg = `Sukses mendistribusikan ${createdTasks.length} tugas evaluasi ke ${Object.keys(tasksByPenilai).length} penilai!`;
            if (shouldSendEmail) {
              if (emailSuccessCount > 0) {
                summaryMsg += ` Notifikasi email berhasil terkirim ke ${emailSuccessCount} evaluator.`;
              }
              if (emailFailCount > 0) {
                summaryMsg += ` (${emailFailCount} evaluator tidak memiliki email terdaftar).`;
              }
            }

            toast(summaryMsg, "success");
            closeModal();
            loadKpi360();
          } catch (e) {
            console.error("Error distributing KPI tasks:", e);
            toast("Gagal mendistribusikan: " + e.message, "error");
            btnSave.disabled = false;
            btnSave.textContent = "🚀 Distribusikan & Kirim Email";
          }
        };
      }
    });
  }

  async function loadHasilPenilaian() {
  const wrap = panels.hasil;
  if (!wrap) return;
  wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

  const logs = await fsGetAll(COL.LOG_PENILAIAN_KPI);
  let filteredLogs = logs;

  if (isAtasanView && bawahanNames) {
    const bset = new Set(bawahanNames);
    filteredLogs = logs.filter(l => bset.has(l.nama_dinilai));
  } else if (isRegularEmployee) {
    filteredLogs = logs.filter(l => (l.nama_dinilai || "").toLowerCase() === (session.nama || "").toLowerCase());
  }

  filteredLogs.sort((a, b) => new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0));

  const canManageLog = isHrdOrAdmin || canEdit;

  wrap.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 class="font-bold text-slate-800 text-base">Hasil & Log Penilaian KPI</h3>
          <p class="text-xs text-slate-400 mt-0.5">Daftar rekapan evaluasi KPI yang telah diselesaikan oleh Penilai / Atasan.</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
              <th class="py-3 px-4">Karyawan Dinilai</th>
              <th class="py-3 px-4">Penilai</th>
              <th class="py-3 px-4">Periode</th>
              <th class="py-3 px-4 text-center">Skor Akhir</th>
              <th class="py-3 px-4 text-center">Predikat</th>
              <th class="py-3 px-4">Tanggal Evaluasi</th>
              ${canManageLog ? `<th class="py-3 px-4 text-center">Aksi (HRD)</th>` : ''}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50 text-sm">
            ${filteredLogs.length === 0 ? `
              <tr><td colspan="${canManageLog ? 7 : 6}" class="py-12 text-center text-slate-400 italic">Belum ada data log penilaian KPI.</td></tr>
            ` : filteredLogs.map(l => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(l.nama_dinilai)}</td>
                <td class="py-3 px-4 text-xs text-slate-600">${escapeHtml(l.penilai || "-")}</td>
                <td class="py-3 px-4 text-xs font-semibold text-slate-700">${escapeHtml(l.periode || "-")}</td>
                <td class="py-3 px-4 text-center font-black text-maroon-700 text-base">${l.total_skor || 0}</td>
                <td class="py-3 px-4 text-center">${badge(l.keputusan || "Selesai", (l.total_skor || 0) >= 80 ? "emerald" : (l.total_skor || 0) >= 60 ? "blue" : "amber")}</td>
                <td class="py-3 px-4 text-xs text-slate-400">${fmtDateShort(l.tanggal)}</td>
                ${canManageLog ? `
                  <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                      <button data-action="edit-log" data-log-id="${l.id}" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition shadow-xs">
                        ✏️ Edit
                      </button>
                      <button data-action="delete-log" data-log-id="${l.id}" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg text-xs transition shadow-xs">
                        🗑️ Hapus
                      </button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (canManageLog) {
    wrap.querySelectorAll('[data-action="edit-log"]').forEach(btn => {
      btn.onclick = () => {
        const lid = btn.dataset.logId;
        const logObj = filteredLogs.find(x => x.id === lid);
        if (logObj) openEditLogKpiModal(logObj);
      };
    });

    wrap.querySelectorAll('[data-action="delete-log"]').forEach(btn => {
      btn.onclick = () => {
        const lid = btn.dataset.logId;
        const logObj = filteredLogs.find(x => x.id === lid);
        if (!logObj) return;

        confirmDialog(
          `Apakah Anda yakin ingin menghapus log penilaian KPI untuk <b>${escapeHtml(logObj.nama_dinilai)}</b> (Periode: ${escapeHtml(logObj.periode || "-")})?<br/><br/><span class="text-xs text-rose-500 font-semibold">Data yang dihapus tidak dapat dikembalikan.</span>`,
          async () => {
            try {
              await fsDelete(COL.LOG_PENILAIAN_KPI, logObj.id);
              toast("Log hasil penilaian KPI berhasil dihapus!", "success");
              loadHasilPenilaian();
            } catch (err) {
              toast("Gagal menghapus log: " + err.message, "error");
            }
          }
        );
      };
    });
  }
  }

  function openEditLogKpiModal(logObj) {
  openModal({
    title: "Edit Hasil & Log Penilaian KPI",
    size: "lg",
    bodyHtml: `
      <form id="form-edit-log-kpi" class="space-y-4 text-left">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Nama Karyawan Dinilai <span class="text-rose-500">*</span></label>
            <input type="text" id="edit-log-dinilai" value="${escapeHtml(logObj.nama_dinilai || '')}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Nama Penilai / Evaluator <span class="text-rose-500">*</span></label>
            <input type="text" id="edit-log-penilai" value="${escapeHtml(logObj.penilai || '')}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Periode Penilaian <span class="text-rose-500">*</span></label>
            <input type="text" id="edit-log-periode" value="${escapeHtml(logObj.periode || '')}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Skor Akhir (0 - 100) <span class="text-rose-500">*</span></label>
            <input type="number" step="0.01" min="0" max="100" id="edit-log-skor" value="${logObj.total_skor || 0}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-maroon-700" required>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Keputusan / Predikat <span class="text-rose-500">*</span></label>
            <input type="text" id="edit-log-keputusan" value="${escapeHtml(logObj.keputusan || 'Selesai')}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" placeholder="Misal: SANGAT BAIK, BAIK, CUKUP" required>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Evaluasi</label>
            <input type="date" id="edit-log-tanggal" value="${logObj.tanggal ? logObj.tanggal.slice(0, 10) : new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Catatan Kelebihan / Prestasi (Opsional)</label>
          <textarea id="edit-log-catatan-baik" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">${escapeHtml(logObj.catatan_baik || '')}</textarea>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Catatan Area Perbaikan (Opsional)</label>
          <textarea id="edit-log-catatan-perbaikan" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">${escapeHtml(logObj.catatan_perbaikan || '')}</textarea>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Catatan Penilai (Opsional)</label>
          <textarea id="edit-log-catatan-penilai" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">${escapeHtml(logObj.catatan_penilai || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <div class="flex items-center justify-between w-full">
        <button id="btn-edit-log-delete" class="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-lg transition border border-rose-200">Hapus Log Ini</button>
        <div class="flex items-center gap-2">
          <button id="btn-edit-log-batal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition">Batal</button>
          <button id="btn-edit-log-simpan" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-lg transition shadow-md">Simpan Perubahan</button>
        </div>
      </div>
    `,
    onMount: (m) => {
      m.querySelector("#btn-edit-log-batal").onclick = closeModal;
      m.querySelector("#btn-edit-log-delete").onclick = () => {
        closeModal();
        confirmDialog(
          `Apakah Anda yakin ingin menghapus log penilaian KPI untuk <b>${escapeHtml(logObj.nama_dinilai)}</b>?`,
          async () => {
            try {
              await fsDelete(COL.LOG_PENILAIAN_KPI, logObj.id);
              toast("Log penilaian KPI berhasil dihapus!", "success");
              loadHasilPenilaian();
            } catch (err) {
              toast("Gagal menghapus: " + err.message, "error");
            }
          }
        );
      };

      m.querySelector("#btn-edit-log-simpan").onclick = async () => {
        const form = m.querySelector("#form-edit-log-kpi");
        if (!form.reportValidity()) return;

        const namaDinilai = m.querySelector("#edit-log-dinilai").value.trim();
        const penilai = m.querySelector("#edit-log-penilai").value.trim();
        const periode = m.querySelector("#edit-log-periode").value.trim();
        const totalSkor = parseFloat(m.querySelector("#edit-log-skor").value) || 0;
        const keputusan = m.querySelector("#edit-log-keputusan").value.trim();
        const tglStr = m.querySelector("#edit-log-tanggal").value;
        const catatanBaik = m.querySelector("#edit-log-catatan-baik").value.trim();
        const catatanPerbaikan = m.querySelector("#edit-log-catatan-perbaikan").value.trim();
        const catatanPenilai = m.querySelector("#edit-log-catatan-penilai").value.trim();

        const btnSave = m.querySelector("#btn-edit-log-simpan");
        btnSave.disabled = true;
        btnSave.textContent = "Menyimpan...";

        try {
          await fsUpdate(COL.LOG_PENILAIAN_KPI, logObj.id, {
            nama_dinilai: namaDinilai,
            penilai: penilai,
            periode: periode,
            total_skor: totalSkor,
            keputusan: keputusan,
            tanggal: tglStr ? new Date(tglStr).toISOString() : (logObj.tanggal || new Date().toISOString()),
            catatan_baik: catatanBaik,
            catatan_perbaikan: catatanPerbaikan,
            catatan_penilai: catatanPenilai,
            updated_at: new Date().toISOString()
          });

          toast("Log hasil penilaian KPI berhasil diperbarui!", "success");
          closeModal();
          loadHasilPenilaian();
        } catch (err) {
          toast("Gagal memperbarui log: " + err.message, "error");
          btnSave.disabled = false;
          btnSave.textContent = "Simpan Perubahan";
        }
      };
    }
  });
  }

  // -------------------------------------------------------------
  // ALUR KOORDINASI PERPANJANGAN KONTRAK (GM & DIREKTUR WORKFLOW)
  // -------------------------------------------------------------
  async function loadAlurPerpanjangan() {
    const wrap = panels.alur_perpanjangan;
    if (!wrap) return;
    wrap.innerHTML = `<div class="p-6">${skeletonRows(5)}</div>`;

    let allKaryawan = [];
    let allKontrak = [];
    let allEvaluasi = [];
    let allUsers = [];

    try {
      [allKaryawan, allKontrak, allEvaluasi, allUsers] = await Promise.all([
        fsGetAll(COL.MASTER_KARYAWAN),
        fsGetAll(COL.MASTER_KONTRAK),
        fsGetAll(COL.EVALUASI_KONTRAK).catch(() => []),
        fsGetAll(COL.USERS).catch(() => [])
      ]);
    } catch (e) {
      console.error("Gagal memuat data alur perpanjangan:", e);
      wrap.innerHTML = `<div class="p-6 text-center text-rose-500 font-bold">Gagal memuat data: ${escapeHtml(e.message)}</div>`;
      return;
    }

    if (isAtasanView && bawahanNames === null) {
      bawahanNames = await getBawahanNames(session.nama);
    }
    const bset = bawahanNames ? new Set(bawahanNames) : null;
    if (isAtasanView && bset) {
      allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
      allKontrak = allKontrak.filter(k => bset.has(k.nama_karyawan));
    }

    const activeEmp = allKaryawan.filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    const evalMap = {};
    allEvaluasi.forEach(ev => {
      if (ev.nama_karyawan) evalMap[ev.nama_karyawan] = ev;
      if (ev.nik_karyawan) evalMap[ev.nik_karyawan] = ev;
    });

    const pipelineData = activeEmp.map(emp => {
      const empContracts = allKontrak.filter(k => (k.nama_karyawan || "").trim().toLowerCase() === (emp.nama_karyawan || "").trim().toLowerCase());
      empContracts.sort((a, b) => new Date(b.tanggal_akhir || 0) - new Date(a.tanggal_akhir || 0));
      const latestContract = empContracts[0] || null;

      const tglAkhir = (latestContract && latestContract.tanggal_akhir) || emp.tgl_akhir_kontrak || null;
      const tglMulai = (latestContract && latestContract.tanggal_mulai) || emp.tgl_mulai_kontrak || null;
      const kontrakKe = (latestContract && latestContract.kontrak_ke) || emp.kontrak_ke || 1;

      let daysLeft = null;
      let urgency = "AMAN";
      if (tglAkhir) {
        const d = Math.ceil((new Date(tglAkhir) - new Date()) / (1000 * 3600 * 24));
        daysLeft = isNaN(d) ? null : d;
        if (daysLeft !== null) {
          if (daysLeft < 0) urgency = "KADALUARSA";
          else if (daysLeft <= 14) urgency = "KRITIS";
          else if (daysLeft <= 30) urgency = "WASPADA";
          else if (daysLeft <= 45) urgency = "PERSIAPAN";
          else urgency = "AMAN";
        }
      }

      const ev = evalMap[emp.nama_karyawan] || evalMap[emp.nik_karyawan] || null;
      let stage = "REVIEW_HRD";
      if (ev && ev.tahap) {
        stage = ev.tahap;
      } else if (ev && ev.status_final === "SELESAI") {
        stage = "SELESAI";
      }

      return {
        ...emp,
        contracts: empContracts,
        latestContract,
        tglMulai,
        tglAkhir,
        kontrakKe,
        daysLeft,
        urgency,
        stage,
        evalRecord: ev
      };
    });

    // We filter for employees that are contract based or expiring or have active evaluation
    let filteredList = pipelineData.filter(item => {
      const isPkwt = !String(item.status_karyawan || "").toUpperCase().includes("PKWTT") && String(item.status_karyawan || "").toUpperCase() !== "TETAP";
      const hasExpiringContract = item.daysLeft !== null && item.daysLeft <= 60;
      const hasOngoingEval = item.evalRecord && item.evalRecord.status_final !== "SELESAI";
      return isPkwt || hasExpiringContract || hasOngoingEval;
    });

    let currentUrgencyFilter = "ALL";
    let currentStageFilter = "ALL";
    let currentSearch = "";
    let currentViewMode = "kanban";

    const STAGES = [
      { id: "REVIEW_HRD", label: "1. Review HRD", color: "blue", icon: "📋", desc: "Evaluasi performa, absensi, & usulan awal HRD" },
      { id: "KOORDINASI_GM", label: "2. Koordinasi GM", color: "amber", icon: "👔", desc: "Masukan & rekomendasi General Manager / Atasan" },
      { id: "APPROVAL_DIREKTUR", label: "3. Approval Direktur", color: "rose", icon: "🏛️", desc: "Persetujuan final & durasi dari Direksi" },
      { id: "DRAFT_KONTRAK", label: "4. Draf Kontrak", color: "indigo", icon: "✍️", desc: "Penyusunan SK & tanda tangan kontrak baru" },
      { id: "SELESAI", label: "5. Selesai", color: "emerald", icon: "✅", desc: "Kontrak baru resmi terbit & aktif di sistem" }
    ];

    function renderPipeline() {
      const countKritis = filteredList.filter(x => x.urgency === "KRITIS" || x.urgency === "KADALUARSA").length;
      const countWaspada = filteredList.filter(x => x.urgency === "WASPADA").length;
      const countPersiapan = filteredList.filter(x => x.urgency === "PERSIAPAN").length;
      const countSelesai = filteredList.filter(x => (x.evalRecord && x.evalRecord.status_final === "SELESAI") || x.stage === "SELESAI").length;

      let displayList = filteredList;
      if (currentUrgencyFilter !== "ALL") {
        if (currentUrgencyFilter === "KRITIS") displayList = displayList.filter(x => x.urgency === "KRITIS" || x.urgency === "KADALUARSA");
        else displayList = displayList.filter(x => x.urgency === currentUrgencyFilter);
      }
      if (currentStageFilter !== "ALL") {
        displayList = displayList.filter(x => x.stage === currentStageFilter);
      }
      if (currentSearch.trim()) {
        const q = currentSearch.toLowerCase();
        displayList = displayList.filter(x => 
          (x.nama_karyawan || "").toLowerCase().includes(q) ||
          (x.jabatan || "").toLowerCase().includes(q) ||
          (x.cabang || "").toLowerCase().includes(q) ||
          (x.divisi || "").toLowerCase().includes(q)
        );
      }

      wrap.innerHTML = `
        <div class="space-y-6">
          <!-- Header Banner -->
          <div class="bg-gradient-to-r from-slate-900 via-maroon-900 to-slate-900 p-5 rounded-2xl text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">Disiplin Waktu & Koordinasi</span>
                <span class="text-xs text-slate-300 font-medium">SLA: Evaluasi dimulai H-45 sebelum jatuh tempo</span>
              </div>
              <h2 class="text-lg font-bold">Alur & Pipeline Koordinasi Perpanjangan Kontrak</h2>
              <p class="text-xs text-slate-300">Pantau proses perpanjangan berjenjang dari Review HRD, Koordinasi GM, hingga Persetujuan Direktur agar tidak terjadi keterlambatan.</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button id="btn-toggle-kanban" class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${currentViewMode === 'kanban' ? 'bg-white text-slate-900 shadow' : 'bg-white/10 text-white hover:bg-white/20'}">
                📌 Papan Kanban
              </button>
              <button id="btn-toggle-table" class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${currentViewMode === 'table' ? 'bg-white text-slate-900 shadow' : 'bg-white/10 text-white hover:bg-white/20'}">
                📊 Tabel Alur
              </button>
            </div>
          </div>

          <!-- Quick Metrics Bar -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-between cursor-pointer hover:bg-rose-100/70 transition" id="stat-kritis">
              <div>
                <p class="text-[11px] font-bold text-rose-700 uppercase tracking-wide">Kritis (≤14 Hari)</p>
                <h3 class="text-2xl font-black text-rose-900 mt-0.5">${countKritis} <span class="text-xs font-normal text-rose-600">Staf</span></h3>
                <p class="text-[10px] text-rose-600 mt-1 font-semibold">Harus diputuskan segera</p>
              </div>
              <span class="text-2xl">🚨</span>
            </div>
            <div class="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition" id="stat-waspada">
              <div>
                <p class="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Waspada (15-30 Hari)</p>
                <h3 class="text-2xl font-black text-amber-900 mt-0.5">${countWaspada} <span class="text-xs font-normal text-amber-600">Staf</span></h3>
                <p class="text-[10px] text-amber-600 mt-1 font-semibold">Butuh Koordinasi GM/Direktur</p>
              </div>
              <span class="text-2xl">⏳</span>
            </div>
            <div class="p-4 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-between cursor-pointer hover:bg-blue-100/70 transition" id="stat-persiapan">
              <div>
                <p class="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Persiapan (31-45 Hari)</p>
                <h3 class="text-2xl font-black text-blue-900 mt-0.5">${countPersiapan} <span class="text-xs font-normal text-blue-600">Staf</span></h3>
                <p class="text-[10px] text-blue-600 mt-1 font-semibold">Mulai Review Kinerja HRD</p>
              </div>
              <span class="text-2xl">🔍</span>
            </div>
            <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between cursor-pointer hover:bg-emerald-100/70 transition" id="stat-selesai">
              <div>
                <p class="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Selesai / Terbit</p>
                <h3 class="text-2xl font-black text-emerald-900 mt-0.5">${countSelesai} <span class="text-xs font-normal text-emerald-600">Kontrak</span></h3>
                <p class="text-[10px] text-emerald-600 mt-1 font-semibold">Telah diperpanjang</p>
              </div>
              <span class="text-2xl">✅</span>
            </div>
          </div>

          <!-- Controls / Filter -->
          <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div class="flex items-center gap-2 w-full md:w-auto flex-wrap">
              <input type="text" id="pk-pipeline-search" placeholder="Cari nama, jabatan, cabang..." value="${escapeHtml(currentSearch)}" class="px-3.5 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-maroon-500 w-full md:w-64 bg-slate-50">
              <select id="pk-pipeline-urgency" class="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 outline-none bg-slate-50">
                <option value="ALL" ${currentUrgencyFilter === 'ALL' ? 'selected' : ''}>Semua Urgensi</option>
                <option value="KRITIS" ${currentUrgencyFilter === 'KRITIS' ? 'selected' : ''}>🔴 Kritis (≤14 Hari)</option>
                <option value="WASPADA" ${currentUrgencyFilter === 'WASPADA' ? 'selected' : ''}>🟠 Waspada (15-30 Hari)</option>
                <option value="PERSIAPAN" ${currentUrgencyFilter === 'PERSIAPAN' ? 'selected' : ''}>🔵 Persiapan (31-45 Hari)</option>
                <option value="AMAN" ${currentUrgencyFilter === 'AMAN' ? 'selected' : ''}>🟢 Aman (>45 Hari)</option>
              </select>
              <select id="pk-pipeline-stage" class="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 outline-none bg-slate-50">
                <option value="ALL" ${currentStageFilter === 'ALL' ? 'selected' : ''}>Semua Tahapan</option>
                <option value="REVIEW_HRD" ${currentStageFilter === 'REVIEW_HRD' ? 'selected' : ''}>1. Review HRD</option>
                <option value="KOORDINASI_GM" ${currentStageFilter === 'KOORDINASI_GM' ? 'selected' : ''}>2. Koordinasi GM</option>
                <option value="APPROVAL_DIREKTUR" ${currentStageFilter === 'APPROVAL_DIREKTUR' ? 'selected' : ''}>3. Approval Direktur</option>
                <option value="DRAFT_KONTRAK" ${currentStageFilter === 'DRAFT_KONTRAK' ? 'selected' : ''}>4. Draf Kontrak</option>
                <option value="SELESAI" ${currentStageFilter === 'SELESAI' ? 'selected' : ''}>5. Selesai</option>
              </select>
            </div>
            <div class="text-xs text-slate-500 font-medium">
              Menampilkan <strong>${displayList.length}</strong> data staf
            </div>
          </div>

          <!-- Main View Body -->
          <div id="pipeline-content-area">
            ${currentViewMode === 'kanban' ? renderKanbanView(displayList, STAGES) : renderTableView(displayList)}
          </div>
        </div>
      `;

      // Event bindings
      wrap.querySelector("#btn-toggle-kanban").onclick = () => { currentViewMode = "kanban"; renderPipeline(); };
      wrap.querySelector("#btn-toggle-table").onclick = () => { currentViewMode = "table"; renderPipeline(); };
      wrap.querySelector("#pk-pipeline-search").oninput = (e) => { currentSearch = e.target.value; renderPipeline(); };
      wrap.querySelector("#pk-pipeline-urgency").onchange = (e) => { currentUrgencyFilter = e.target.value; renderPipeline(); };
      wrap.querySelector("#pk-pipeline-stage").onchange = (e) => { currentStageFilter = e.target.value; renderPipeline(); };

      const statKritis = wrap.querySelector("#stat-kritis");
      if (statKritis) statKritis.onclick = () => { currentUrgencyFilter = "KRITIS"; renderPipeline(); };
      const statWaspada = wrap.querySelector("#stat-waspada");
      if (statWaspada) statWaspada.onclick = () => { currentUrgencyFilter = "WASPADA"; renderPipeline(); };
      const statPersiapan = wrap.querySelector("#stat-persiapan");
      if (statPersiapan) statPersiapan.onclick = () => { currentUrgencyFilter = "PERSIAPAN"; renderPipeline(); };
      const statSelesai = wrap.querySelector("#stat-selesai");
      if (statSelesai) statSelesai.onclick = () => { currentStageFilter = "SELESAI"; renderPipeline(); };

      // Bind open modal on all action buttons
      wrap.querySelectorAll('[data-action="open-koordinasi"]').forEach(btn => {
        btn.onclick = () => {
          const empName = btn.dataset.empName;
          const targetItem = pipelineData.find(x => x.nama_karyawan === empName);
          if (targetItem) {
            openModalKoordinasiPerpanjangan(targetItem, targetItem.evalRecord, () => {
              loadAlurPerpanjangan();
            });
          }
        };
      });
    }

    function renderKanbanView(list, stages) {
      return `
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          ${stages.map(st => {
            const stageItems = list.filter(item => item.stage === st.id);
            return `
              <div class="bg-slate-50/90 rounded-2xl border border-slate-200/80 p-3.5 flex flex-col gap-3 min-h-[420px]">
                <!-- Stage Header -->
                <div class="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div class="flex items-center gap-1.5">
                    <span class="text-base">${st.icon}</span>
                    <h4 class="text-xs font-bold text-slate-800">${st.label}</h4>
                  </div>
                  <span class="text-[11px] font-black px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200">
                    ${stageItems.length}
                  </span>
                </div>
                <p class="text-[10px] text-slate-400 leading-tight">${st.desc}</p>

                <!-- Cards list -->
                <div class="space-y-3">
                  ${stageItems.length === 0 ? `
                    <div class="py-10 text-center text-slate-400 text-xs italic bg-white/50 rounded-xl border border-dashed border-slate-200">
                      Tidak ada karyawan
                    </div>
                  ` : stageItems.map(item => renderKanbanCard(item)).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderKanbanCard(item) {
      let urgencyBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Aman</span>`;
      if (item.urgency === "KRITIS" || item.urgency === "KADALUARSA") {
        urgencyBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500 text-white animate-pulse">🚨 ${item.daysLeft !== null && item.daysLeft < 0 ? 'Kadaluarsa' : `${item.daysLeft} Hari Lagi`}</span>`;
      } else if (item.urgency === "WASPADA") {
        urgencyBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">⏳ ${item.daysLeft} Hari Lagi</span>`;
      } else if (item.urgency === "PERSIAPAN") {
        urgencyBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">🔵 ${item.daysLeft} Hari Lagi</span>`;
      }

      const ev = item.evalRecord;
      let notesSnippet = "";
      if (ev) {
        if (ev.catatan_direktur) notesSnippet = `<p class="text-[10px] text-purple-700 line-clamp-2 italic bg-purple-50 p-1.5 rounded-lg border border-purple-200"><strong>Direktur:</strong> ${escapeHtml(ev.catatan_direktur)}</p>`;
        else if (ev.catatan_gm) notesSnippet = `<p class="text-[10px] text-amber-700 line-clamp-2 italic bg-amber-50 p-1.5 rounded-lg border border-amber-200"><strong>GM:</strong> ${escapeHtml(ev.catatan_gm)}</p>`;
        else if (ev.catatan_hrd) notesSnippet = `<p class="text-[10px] text-blue-700 line-clamp-2 italic bg-blue-50 p-1.5 rounded-lg border border-blue-200"><strong>HRD:</strong> ${escapeHtml(ev.catatan_hrd)}</p>`;
      }

      return `
        <div class="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-2xs hover:shadow-md transition space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h5 class="text-xs font-black text-slate-800 leading-snug">${escapeHtml(item.nama_karyawan)}</h5>
              <p class="text-[11px] text-slate-500 font-medium">${escapeHtml(item.jabatan || "-")} • ${escapeHtml(item.cabang || "Pusat")}</p>
            </div>
            ${urgencyBadge}
          </div>

          <div class="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg space-y-0.5 border border-slate-100">
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Kontrak Saat Ini:</span>
              <strong class="text-slate-700">Ke-${item.kontrakKe}</strong>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-400">Jatuh Tempo:</span>
              <strong class="text-slate-700">${item.tglAkhir ? fmtDateShort(item.tglAkhir) : '-'}</strong>
            </div>
          </div>

          ${notesSnippet}

          <div class="pt-1 flex items-center justify-between gap-1.5">
            <button type="button" data-action="open-koordinasi" data-emp-name="${escapeHtml(item.nama_karyawan)}" class="w-full py-1.5 px-2 bg-maroon-50 hover:bg-maroon-100 text-maroon-700 text-[11px] font-bold rounded-lg border border-maroon-200 transition flex items-center justify-center gap-1 shadow-2xs">
              ⚡ Lembar Koordinasi
            </button>
          </div>
        </div>
      `;
    }

    function renderTableView(list) {
      return `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <th class="py-3.5 px-4">Nama & Posisi</th>
                  <th class="py-3.5 px-4">Status & Cabang</th>
                  <th class="py-3.5 px-4">Jatuh Tempo</th>
                  <th class="py-3.5 px-4">Sisa Hari</th>
                  <th class="py-3.5 px-4">Tahapan Koordinasi</th>
                  <th class="py-3.5 px-4">Keputusan / Rekomendasi</th>
                  <th class="py-3.5 px-4 text-center">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${list.length === 0 ? `
                  <tr><td colspan="7" class="py-12 text-center text-slate-400 italic">Tidak ada data kontrak yang cocok dengan filter.</td></tr>
                ` : list.map(item => {
                  let urgencyBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Aman</span>`;
                  if (item.urgency === "KRITIS" || item.urgency === "KADALUARSA") {
                    urgencyBadge = `<span class="px-2.5 py-1 rounded text-[10px] font-black bg-rose-500 text-white">🚨 ${item.daysLeft !== null && item.daysLeft < 0 ? 'Kadaluarsa' : `${item.daysLeft} Hari Lagi`}</span>`;
                  } else if (item.urgency === "WASPADA") {
                    urgencyBadge = `<span class="px-2.5 py-1 rounded text-[10px] font-bold bg-amber-500 text-white">⏳ ${item.daysLeft} Hari Lagi</span>`;
                  } else if (item.urgency === "PERSIAPAN") {
                    urgencyBadge = `<span class="px-2.5 py-1 rounded text-[10px] font-bold bg-blue-100 text-blue-800">🔵 ${item.daysLeft} Hari Lagi</span>`;
                  }

                  const ev = item.evalRecord;
                  let stageBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">1. Review HRD</span>`;
                  if (item.stage === "KOORDINASI_GM") stageBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">2. Koordinasi GM</span>`;
                  else if (item.stage === "APPROVAL_DIREKTUR") stageBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">3. Approval Direktur</span>`;
                  else if (item.stage === "DRAFT_KONTRAK") stageBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">4. Draf Kontrak</span>`;
                  else if (item.stage === "SELESAI") stageBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">5. Selesai</span>`;

                  let summaryDecision = `<span class="text-slate-400 italic">Belum ada keputusan</span>`;
                  if (ev && ev.keputusan_direktur) {
                    summaryDecision = `<span class="font-bold text-slate-800">${escapeHtml(ev.keputusan_direktur)} (${escapeHtml(ev.durasi_perpanjangan_disetujui || "-")})</span>`;
                  } else if (ev && ev.rekomendasi_gm) {
                    summaryDecision = `<span class="text-amber-800 font-medium">Masukan GM: ${escapeHtml(ev.rekomendasi_gm)}</span>`;
                  } else if (ev && ev.rekomendasi_hrd) {
                    summaryDecision = `<span class="text-blue-800 font-medium">Usulan HRD: ${escapeHtml(ev.rekomendasi_hrd)}</span>`;
                  }

                  return `
                    <tr class="hover:bg-slate-50/80 transition">
                      <td class="py-3 px-4">
                        <div class="font-bold text-slate-800">${escapeHtml(item.nama_karyawan)}</div>
                        <div class="text-[11px] text-slate-500">${escapeHtml(item.jabatan || "-")}</div>
                      </td>
                      <td class="py-3 px-4 text-slate-600">
                        <div>${escapeHtml(item.cabang || "Pusat")}</div>
                        <div class="text-[10px] text-slate-400">${escapeHtml(formatStatusKaryawan(item.status_karyawan))}</div>
                      </td>
                      <td class="py-3 px-4 font-semibold text-slate-700">${item.tglAkhir ? fmtDateShort(item.tglAkhir) : '-'}</td>
                      <td class="py-3 px-4">${urgencyBadge}</td>
                      <td class="py-3 px-4">${stageBadge}</td>
                      <td class="py-3 px-4 text-[11px]">${summaryDecision}</td>
                      <td class="py-3 px-4 text-center">
                        <button type="button" data-action="open-koordinasi" data-emp-name="${escapeHtml(item.nama_karyawan)}" class="px-3 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs transition shadow-2xs">
                          ⚡ Lembar Koordinasi
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    renderPipeline();
  }

  // -------------------------------------------------------------
  // MODAL LEMBAR KOORDINASI PERPANJANGAN KONTRAK (5 TAHAPAN LENGKAP)
  // -------------------------------------------------------------
  async function openModalKoordinasiPerpanjangan(empData, existingEval, onDoneCallback) {
    // Fetch users for GM & Direktur dropdowns, and KPI logs for performance review
    let allUsers = [];
    let kpiLogs = [];
    let dailyLogs = [];

    try {
      [allUsers, kpiLogs, dailyLogs] = await Promise.all([
        fsGetAll(COL.USERS).catch(() => []),
        fsGetAll(COL.LOG_PENILAIAN_KPI).catch(() => []),
        fsGetAll(COL.LOG_PENILAIAN_HARIAN).catch(() => [])
      ]);
    } catch (e) {
      console.warn("Error fetching modal metadata:", e);
    }

    // Filter relevant users
    const gmUsers = allUsers.filter(u => {
      const r = (u.role || "").toUpperCase();
      const j = (u.jabatan || "").toUpperCase();
      return r === "GM" || r === "SUPERADMIN" || r === "HRD" || j.includes("GM") || j.includes("GENERAL MANAGER") || j.includes("MANAGER");
    });
    const dirUsers = allUsers.filter(u => {
      const r = (u.role || "").toUpperCase();
      const j = (u.jabatan || "").toUpperCase();
      return r === "DIREKTUR" || r === "SUPERADMIN" || j.includes("DIREKTUR") || j.includes("DIR");
    });

    // Employee specific performance logs
    const empKpi = kpiLogs.filter(k => (k.nama_karyawan || "").toLowerCase() === (empData.nama_karyawan || "").toLowerCase());
    empKpi.sort((a, b) => new Date(b.created_at || b.tanggal || 0) - new Date(a.created_at || a.tanggal || 0));
    const latestKpi = empKpi[0] || null;

    const empDaily = dailyLogs.filter(d => (d.nama_karyawan || "").toLowerCase() === (empData.nama_karyawan || "").toLowerCase());
    empDaily.sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

    // Existing evaluation data
    const ev = existingEval || {};
    const recordId = ev.id || `KEVL-${(empData.nama_karyawan || "EMP").replace(/[^a-zA-Z0-9]/g, "")}-${Date.now().toString().slice(-4)}`;

    // Default dates for new contract draft
    const currentEnd = empData.tglAkhir || empData.tgl_akhir_kontrak || "";
    let defaultNewStart = "";
    let defaultNewEnd = "";
    if (currentEnd) {
      const dt = new Date(currentEnd);
      dt.setDate(dt.getDate() + 1);
      defaultNewStart = dt.toISOString().split("T")[0];
      const endDt = new Date(dt);
      endDt.setFullYear(endDt.getFullYear() + 1);
      endDt.setDate(endDt.getDate() - 1);
      defaultNewEnd = endDt.toISOString().split("T")[0];
    }

    const initialTahap = ev.tahap || "REVIEW_HRD";

    openModal({
      title: `⚡ Alur & Lembar Koordinasi Perpanjangan Kontrak: ${escapeHtml(empData.nama_karyawan)}`,
      size: "xl",
      bodyHtml: `
        <div class="space-y-6 text-left">
          <!-- Top Info Card -->
          <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              ${avatar(empData.nama_karyawan || "?", "w-12 h-12 border-2 border-white shadow-xs")}
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-slate-800 text-base leading-snug">${escapeHtml(empData.nama_karyawan)}</h3>
                  <span class="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-700">${escapeHtml(empData.nik_karyawan || empData.nik || "-")}</span>
                </div>
                <p class="text-xs text-slate-500 font-medium mt-0.5">${escapeHtml(empData.jabatan || "-")} • ${escapeHtml(empData.cabang || "Pusat")} ${empData.divisi ? `(${escapeHtml(empData.divisi)})` : ''}</p>
              </div>
            </div>
            <div class="flex items-center gap-3 flex-wrap bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs text-xs">
              <div>
                <span class="text-slate-400 block text-[10px] font-bold uppercase">Kontrak Saat Ini</span>
                <strong class="text-slate-800">Ke-${empData.kontrakKe || 1}</strong>
              </div>
              <div class="border-l border-slate-200 pl-3">
                <span class="text-slate-400 block text-[10px] font-bold uppercase">Masa Berlaku</span>
                <strong class="text-slate-800">${empData.tglAkhir ? fmtDateShort(empData.tglAkhir) : "-"}</strong>
              </div>
              <div class="border-l border-slate-200 pl-3">
                <span class="text-slate-400 block text-[10px] font-bold uppercase">Sisa Waktu</span>
                <span class="font-black ${empData.daysLeft !== null && empData.daysLeft <= 14 ? 'text-rose-600' : empData.daysLeft <= 30 ? 'text-amber-600' : 'text-blue-600'}">
                  ${empData.daysLeft !== null ? `${empData.daysLeft} Hari Lagi` : "-"}
                </span>
              </div>
            </div>
          </div>

          <!-- Stepper Progress Tracker -->
          <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
            <div class="flex items-center justify-between min-w-[580px] gap-2 text-xs font-bold">
              <div class="flex items-center gap-2 cursor-pointer step-indicator ${initialTahap === 'REVIEW_HRD' ? 'text-blue-600' : 'text-slate-600'}" data-step="1">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${ev.tgl_review_hrd ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}">1</span>
                <span>Review HRD</span>
              </div>
              <div class="h-0.5 flex-1 bg-slate-200"></div>
              <div class="flex items-center gap-2 cursor-pointer step-indicator ${initialTahap === 'KOORDINASI_GM' ? 'text-amber-600' : 'text-slate-600'}" data-step="2">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${ev.tgl_koordinasi_gm ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}">2</span>
                <span>Koordinasi GM</span>
              </div>
              <div class="h-0.5 flex-1 bg-slate-200"></div>
              <div class="flex items-center gap-2 cursor-pointer step-indicator ${initialTahap === 'APPROVAL_DIREKTUR' ? 'text-rose-600' : 'text-slate-600'}" data-step="3">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${ev.tgl_approval_direktur ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}">3</span>
                <span>Approval Direktur</span>
              </div>
              <div class="h-0.5 flex-1 bg-slate-200"></div>
              <div class="flex items-center gap-2 cursor-pointer step-indicator ${initialTahap === 'DRAFT_KONTRAK' ? 'text-indigo-600' : 'text-slate-600'}" data-step="4">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${ev.no_sk_kontrak_baru ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}">4</span>
                <span>Draf Dokumen</span>
              </div>
              <div class="h-0.5 flex-1 bg-slate-200"></div>
              <div class="flex items-center gap-2 cursor-pointer step-indicator ${initialTahap === 'SELESAI' ? 'text-emerald-600' : 'text-slate-600'}" data-step="5">
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${ev.status_final === 'SELESAI' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}">5</span>
                <span>Selesai</span>
              </div>
            </div>
          </div>

          <!-- Section Tabs -->
          <div class="flex items-center gap-2 border-b border-slate-200">
            <button id="modal-tab-workflow" class="px-4 py-2 text-xs font-bold border-b-2 border-maroon-700 text-maroon-700 transition">
              📋 5 Tahapan Koordinasi & Eksekusi
            </button>
            <button id="modal-tab-performance" class="px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition">
              📊 Riwayat Nilai KPI & Log Kinerja
            </button>
          </div>

          <!-- Panel 1: Workflow Forms -->
          <div id="modal-panel-workflow" class="space-y-6">
            <!-- TAHAP 1: REVIEW HRD -->
            <div class="bg-blue-50/50 p-4 rounded-2xl border border-blue-200/80 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">1</span>
                  <h4 class="text-xs font-black text-blue-950 uppercase tracking-wide">Tahap 1: Evaluasi & Rekomendasi Awal HRD</h4>
                </div>
                <span class="text-[11px] text-blue-700 font-semibold">${ev.tgl_review_hrd ? `Selesai: ${fmtDateShort(ev.tgl_review_hrd)}` : 'Belum Review'}</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Usulan / Rekomendasi HRD</label>
                  <select id="input-rekomendasi-hrd" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                    <option value="Perpanjang Kontrak 12 Bulan (1 Tahun)" ${ev.rekomendasi_hrd === "Perpanjang Kontrak 12 Bulan (1 Tahun)" || !ev.rekomendasi_hrd ? 'selected' : ''}>Perpanjang Kontrak 12 Bulan (1 Tahun)</option>
                    <option value="Perpanjang Kontrak 6 Bulan" ${ev.rekomendasi_hrd === "Perpanjang Kontrak 6 Bulan" ? 'selected' : ''}>Perpanjang Kontrak 6 Bulan</option>
                    <option value="Perpanjang Kontrak 3 Bulan" ${ev.rekomendasi_hrd === "Perpanjang Kontrak 3 Bulan" ? 'selected' : ''}>Perpanjang Kontrak 3 Bulan</option>
                    <option value="Diangkat Karyawan Tetap (PKWTT / Kartap)" ${ev.rekomendasi_hrd === "Diangkat Karyawan Tetap (PKWTT / Kartap)" ? 'selected' : ''}>Diangkat Karyawan Tetap (PKWTT / Kartap)</option>
                    <option value="Tidak Diperpanjang (Putus Kontrak / Selesai)" ${ev.rekomendasi_hrd === "Tidak Diperpanjang (Putus Kontrak / Selesai)" ? 'selected' : ''}>Tidak Diperpanjang (Putus Kontrak / Selesai)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Reviewer HRD & Tanggal</label>
                  <div class="grid grid-cols-2 gap-2">
                    <input type="text" id="input-nama-hrd" value="${escapeHtml(ev.nama_reviewer_hrd || session.nama || "HRD Admin")}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                    <input type="date" id="input-tgl-hrd" value="${ev.tgl_review_hrd || new Date().toISOString().split("T")[0]}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-xs text-slate-600 font-semibold mb-1">Catatan & Justifikasi HRD (Kinerja, Absensi, Kedisiplinan)</label>
                <textarea id="input-catatan-hrd" rows="2" placeholder="Tuliskan ringkasan evaluasi kehadiran, pencapaian target, integritas, dan alasan rekomendasi..." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none bg-white font-normal">${escapeHtml(ev.catatan_hrd || "")}</textarea>
              </div>
            </div>

            <!-- TAHAP 2: KOORDINASI GM -->
            <div class="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/80 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black">2</span>
                  <h4 class="text-xs font-black text-amber-950 uppercase tracking-wide">Tahap 2: Koordinasi dengan General Manager / Atasan</h4>
                </div>
                <span class="text-[11px] text-amber-700 font-semibold">${ev.tgl_koordinasi_gm ? `Koordinasi: ${fmtDateShort(ev.tgl_koordinasi_gm)}` : 'Menunggu Koordinasi'}</span>
              </div>

              <!-- One click WA Generator -->
              <div class="bg-white p-3 rounded-xl border border-amber-200 space-y-2">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span class="text-xs font-bold text-slate-800">📱 Format Pesan WhatsApp / Email ke GM:</span>
                  <div class="flex items-center gap-1.5">
                    <button type="button" id="btn-copy-wa-gm" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1">
                      📋 Salin Teks
                    </button>
                    <button type="button" id="btn-open-wa-gm" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-2xs">
                      💬 Buka WhatsApp GM
                    </button>
                  </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label class="block text-[10px] text-slate-500 font-semibold mb-0.5">Pilih GM / Atasan:</label>
                    <select id="select-target-gm" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-medium">
                      ${gmUsers.length ? gmUsers.map(u => `
                        <option value="${escapeHtml(u.nama)}" data-phone="${escapeHtml(u.no_hp || u.telepon || "")}">${escapeHtml(u.nama)} (${escapeHtml(u.jabatan || u.role)})</option>
                      `).join("") : `<option value="General Manager">General Manager</option>`}
                    </select>
                  </div>
                  <div>
                    <label class="block text-[10px] text-slate-500 font-semibold mb-0.5">Nomor WhatsApp GM:</label>
                    <input type="text" id="input-phone-gm" placeholder="6812..." value="${escapeHtml((gmUsers[0] && (gmUsers[0].no_hp || gmUsers[0].telepon)) || "")}" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-medium">
                  </div>
                </div>
              </div>

              <!-- Input Feedback GM -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Rekomendasi / Masukan GM</label>
                  <select id="input-rekomendasi-gm" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                    <option value="Setuju Rekomendasi HRD" ${ev.rekomendasi_gm === "Setuju Rekomendasi HRD" || !ev.rekomendasi_gm ? 'selected' : ''}>Setuju Rekomendasi HRD</option>
                    <option value="Perpanjang Kontrak 12 Bulan (1 Tahun)" ${ev.rekomendasi_gm === "Perpanjang Kontrak 12 Bulan (1 Tahun)" ? 'selected' : ''}>Perpanjang Kontrak 12 Bulan (1 Tahun)</option>
                    <option value="Perpanjang Kontrak 6 Bulan" ${ev.rekomendasi_gm === "Perpanjang Kontrak 6 Bulan" ? 'selected' : ''}>Perpanjang Kontrak 6 Bulan</option>
                    <option value="Diangkat Karyawan Tetap (Kartap)" ${ev.rekomendasi_gm === "Diangkat Karyawan Tetap (Kartap)" ? 'selected' : ''}>Diangkat Karyawan Tetap (Kartap)</option>
                    <option value="Tidak Diperpanjang" ${ev.rekomendasi_gm === "Tidak Diperpanjang" ? 'selected' : ''}>Tidak Diperpanjang</option>
                    <option value="Perlu Pembahasan Tambahan" ${ev.rekomendasi_gm === "Perlu Pembahasan Tambahan" ? 'selected' : ''}>Perlu Pembahasan Tambahan</option>
                  </select>
                </div>
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Nama GM & Tanggal Koordinasi</label>
                  <div class="grid grid-cols-2 gap-2">
                    <input type="text" id="input-nama-gm" value="${escapeHtml(ev.nama_gm || (gmUsers[0] && gmUsers[0].nama) || "General Manager")}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                    <input type="date" id="input-tgl-gm" value="${ev.tgl_koordinasi_gm || ""}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-xs text-slate-600 font-semibold mb-1">Catatan / Notulen Feedback GM</label>
                <textarea id="input-catatan-gm" rows="2" placeholder="Catatan dari GM mengenai kinerja sales / operasional, target pasar, atau sikap kerja..." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none bg-white font-normal">${escapeHtml(ev.catatan_gm || "")}</textarea>
              </div>
            </div>

            <!-- TAHAP 3: APPROVAL DIREKTUR -->
            <div class="bg-rose-50/50 p-4 rounded-2xl border border-rose-200/80 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-black">3</span>
                  <h4 class="text-xs font-black text-rose-950 uppercase tracking-wide">Tahap 3: Pengajuan & Persetujuan Direktur</h4>
                </div>
                <span class="text-[11px] text-rose-700 font-semibold">${ev.tgl_approval_direktur ? `ACC Direktur: ${fmtDateShort(ev.tgl_approval_direktur)}` : 'Menunggu Approval'}</span>
              </div>

              <!-- One click WA to Direktur -->
              <div class="bg-white p-3 rounded-xl border border-rose-200 space-y-2">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span class="text-xs font-bold text-slate-800">🏛️ Format Pengajuan Ringkasan Eksekutif ke Direktur:</span>
                  <div class="flex items-center gap-1.5">
                    <button type="button" id="btn-copy-wa-dir" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1">
                      📋 Salin Ringkasan
                    </button>
                    <button type="button" id="btn-open-wa-dir" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-2xs">
                      💬 Buka WhatsApp Direktur
                    </button>
                  </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label class="block text-[10px] text-slate-500 font-semibold mb-0.5">Pilih Direktur:</label>
                    <select id="select-target-dir" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-medium">
                      ${dirUsers.length ? dirUsers.map(u => `
                        <option value="${escapeHtml(u.nama)}" data-phone="${escapeHtml(u.no_hp || u.telepon || "")}">${escapeHtml(u.nama)} (${escapeHtml(u.jabatan || u.role)})</option>
                      `).join("") : `<option value="Direktur Utama">Direktur Utama</option>`}
                    </select>
                  </div>
                  <div>
                    <label class="block text-[10px] text-slate-500 font-semibold mb-0.5">Nomor WhatsApp Direktur:</label>
                    <input type="text" id="input-phone-dir" placeholder="6812..." value="${escapeHtml((dirUsers[0] && (dirUsers[0].no_hp || dirUsers[0].telepon)) || "")}" class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-medium">
                  </div>
                </div>
              </div>

              <!-- Input Keputusan Direktur -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Keputusan Final Direktur</label>
                  <select id="input-keputusan-dir" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-bold text-slate-800">
                    <option value="DISETUJUI_PERPANJANG" ${ev.keputusan_direktur === "DISETUJUI_PERPANJANG" || !ev.keputusan_direktur ? 'selected' : ''}>✅ DISETUJUI - Perpanjang Kontrak</option>
                    <option value="DISETUJUI_KARTAP" ${ev.keputusan_direktur === "DISETUJUI_KARTAP" ? 'selected' : ''}>🌟 DISETUJUI - Pengangkatan Karyawan Tetap (Kartap)</option>
                    <option value="TIDAK_DIPERPANJANG" ${ev.keputusan_direktur === "TIDAK_DIPERPANJANG" ? 'selected' : ''}>❌ DITOLAK - Tidak Diperpanjang</option>
                    <option value="PENDING" ${ev.keputusan_direktur === "PENDING" ? 'selected' : ''}>⏳ PENDING - Perlu Pembahasan Lanjutan</option>
                  </select>
                </div>
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Durasi yang Disetujui</label>
                  <select id="input-durasi-dir" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-semibold">
                    <option value="12 Bulan" ${ev.durasi_perpanjangan_disetujui === "12 Bulan" || !ev.durasi_perpanjangan_disetujui ? 'selected' : ''}>12 Bulan (1 Tahun)</option>
                    <option value="6 Bulan" ${ev.durasi_perpanjangan_disetujui === "6 Bulan" ? 'selected' : ''}>6 Bulan</option>
                    <option value="3 Bulan" ${ev.durasi_perpanjangan_disetujui === "3 Bulan" ? 'selected' : ''}>3 Bulan</option>
                    <option value="Karyawan Tetap" ${ev.durasi_perpanjangan_disetujui === "Karyawan Tetap" ? 'selected' : ''}>Karyawan Tetap (PKWTT)</option>
                    <option value="Tidak Ada" ${ev.durasi_perpanjangan_disetujui === "Tidak Ada" ? 'selected' : ''}>Tidak Ada (Selesai)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Nama Direktur & Tanggal ACC</label>
                  <div class="grid grid-cols-2 gap-2">
                    <input type="text" id="input-nama-dir" value="${escapeHtml(ev.nama_direktur || (dirUsers[0] && dirUsers[0].nama) || "Direktur")}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                    <input type="date" id="input-tgl-dir" value="${ev.tgl_approval_direktur || ""}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-xs text-slate-600 font-semibold mb-1">Catatan & Arahan Khusus Direktur</label>
                <textarea id="input-catatan-dir" rows="2" placeholder="Arahan Direksi mengenai target omzet, disiplin kerja, kompensasi atau penyesuaian gaji..." class="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none bg-white font-normal">${escapeHtml(ev.catatan_direktur || "")}</textarea>
              </div>
            </div>

            <!-- TAHAP 4: DRAF KONTRAK BARU -->
            <div class="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-200/80 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">4</span>
                  <h4 class="text-xs font-black text-indigo-950 uppercase tracking-wide">Tahap 4: Draf Dokumen & Penandatanganan Kontrak Baru</h4>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Nomor SK / Kontrak Baru</label>
                  <input type="text" id="input-no-sk" placeholder="Contoh: 042/PKWT-AJ/VIII/2026" value="${escapeHtml(ev.no_sk_kontrak_baru || "")}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                </div>
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Rencana Tanggal Mulai</label>
                  <input type="date" id="input-tgl-mulai-baru" value="${ev.tgl_mulai_baru || defaultNewStart}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                </div>
                <div>
                  <label class="block text-slate-600 font-semibold mb-1">Rencana Tanggal Akhir</label>
                  <input type="date" id="input-tgl-akhir-baru" value="${ev.tgl_akhir_baru || defaultNewEnd}" class="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none bg-white font-medium">
                </div>
              </div>
            </div>

            <!-- TAHAP 5: EKSEKUSI & PENYELESAIAN -->
            <div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">5</span>
                  <h4 class="text-xs font-black text-emerald-950 uppercase tracking-wide">Tahap 5: Terbitkan Kontrak Baru di Sistem</h4>
                </div>
              </div>
              <p class="text-xs text-emerald-800 leading-relaxed">
                Setelah mendapat persetujuan Direktur dan draf kontrak disiapkan, klik tombol di bawah untuk <strong>menerbitkan kontrak baru (Kontrak Ke-${(empData.kontrakKe || 1) + 1})</strong> secara otomatis ke dalam data riwayat kontrak dan memperbarui masa berlaku kerja karyawan di sistem.
              </p>
              <div class="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button type="button" id="btn-save-progress-eval" class="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition shadow-2xs">
                  💾 Simpan Progres Lembar Kerja
                </button>
                <button type="button" id="btn-execute-renewal" class="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition shadow-md flex items-center justify-center gap-2">
                  🚀 Terbitkan Kontrak Baru & Selesaikan Alur
                </button>
              </div>
            </div>
          </div>

          <!-- Panel 2: Performance Review Logs -->
          <div id="modal-panel-performance" class="hidden space-y-4">
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide">Nilai Penilaian KPI Terakhir</h4>
              ${latestKpi ? `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white p-3 rounded-xl border border-slate-200">
                  <div><span class="text-slate-400 block">Periode:</span> <strong>${escapeHtml(latestKpi.periode || latestKpi.bulan || "-")}</strong></div>
                  <div><span class="text-slate-400 block">Skor Akhir:</span> <strong class="text-maroon-700 text-sm font-black">${latestKpi.nilai_akhir || latestKpi.skor_akhir || 0}</strong></div>
                  <div><span class="text-slate-400 block">Predikat:</span> <span class="px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700">${escapeHtml(latestKpi.grade || latestKpi.predikat || "Baik")}</span></div>
                  <div><span class="text-slate-400 block">Penilai:</span> <strong>${escapeHtml(latestKpi.nama_penilai || latestKpi.evaluator || "-")}</strong></div>
                </div>
              ` : `
                <div class="py-4 text-center text-xs text-slate-400 italic">Belum ada riwayat penilaian KPI tercatat.</div>
              `}
            </div>

            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide">Log Capaian & Target Harian Terkini</h4>
              ${empDaily.length ? `
                <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                  ${empDaily.slice(0, 5).map(dl => `
                    <div class="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-800">${fmtDateShort(dl.tanggal)}</span>
                        <span class="font-semibold text-blue-700">Skor: ${dl.skor_harian || dl.total_capaian || 100}%</span>
                      </div>
                      <p class="text-slate-600 text-[11px]">${escapeHtml(dl.catatan_harian || dl.keterangan || "Aktivitas tercatat normal.")}</p>
                    </div>
                  `).join("")}
                </div>
              ` : `
                <div class="py-4 text-center text-xs text-slate-400 italic">Belum ada log capaian harian.</div>
              `}
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full">
          <span class="text-[11px] text-slate-400">ID Koordinasi: ${recordId}</span>
          <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Tutup</button>
        </div>
      `
    });

    const modalTabWorkflow = document.getElementById("modal-tab-workflow");
    const modalTabPerf = document.getElementById("modal-tab-performance");
    const modalPanelWorkflow = document.getElementById("modal-panel-workflow");
    const modalPanelPerf = document.getElementById("modal-panel-performance");

    if (modalTabWorkflow && modalTabPerf) {
      modalTabWorkflow.onclick = () => {
        modalTabWorkflow.className = "px-4 py-2 text-xs font-bold border-b-2 border-maroon-700 text-maroon-700 transition";
        modalTabPerf.className = "px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition";
        modalPanelWorkflow.classList.remove("hidden");
        modalPanelPerf.classList.add("hidden");
      };
      modalTabPerf.onclick = () => {
        modalTabPerf.className = "px-4 py-2 text-xs font-bold border-b-2 border-maroon-700 text-maroon-700 transition";
        modalTabWorkflow.className = "px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition";
        modalPanelPerf.classList.remove("hidden");
        modalPanelWorkflow.classList.add("hidden");
      };
    }

    // Select change updates phone numbers
    const selGm = document.getElementById("select-target-gm");
    const inPhoneGm = document.getElementById("input-phone-gm");
    const inNamaGm = document.getElementById("input-nama-gm");
    if (selGm && inPhoneGm) {
      selGm.onchange = () => {
        const opt = selGm.selectedOptions[0];
        if (opt) {
          inPhoneGm.value = opt.dataset.phone || "";
          if (inNamaGm) inNamaGm.value = opt.value;
        }
      };
    }

    const selDir = document.getElementById("select-target-dir");
    const inPhoneDir = document.getElementById("input-phone-dir");
    const inNamaDir = document.getElementById("input-nama-dir");
    if (selDir && inPhoneDir) {
      selDir.onchange = () => {
        const opt = selDir.selectedOptions[0];
        if (opt) {
          inPhoneDir.value = opt.dataset.phone || "";
          if (inNamaDir) inNamaDir.value = opt.value;
        }
      };
    }

    // WA Helper function for GM
    function buildGmWaText() {
      const recHrd = document.getElementById("input-rekomendasi-hrd")?.value || "Perpanjang Kontrak 12 Bulan";
      const catHrd = document.getElementById("input-catatan-hrd")?.value || "Kinerja dan kedisiplinan baik.";
      const gmName = inNamaGm?.value || "Bapak/Ibu GM";
      return `Yth. ${gmName},\n\nMohon koordinasi dan masukan terkait evaluasi perpanjangan kontrak karyawan:\n- Nama: *${empData.nama_karyawan}*\n- NIK: ${empData.nik_karyawan || empData.nik || "-"}\n- Jabatan: ${empData.jabatan || "-"} (${empData.cabang || "Pusat"})\n- Kontrak Berakhir: *${empData.tglAkhir ? fmtDateShort(empData.tglAkhir) : "-"}* (Sisa ${empData.daysLeft !== null ? empData.daysLeft : '-'} Hari)\n\n*Hasil Review HRD:*\n- Rekomendasi: ${recHrd}\n- Catatan: "${catHrd}"\n\nMohon feedback dan rekomendasi Bapak/Ibu untuk kelanjutan kontrak yang bersangkutan. Terima kasih.`;
    }

    // WA Helper function for Director
    function buildDirWaText() {
      const recHrd = document.getElementById("input-rekomendasi-hrd")?.value || "Perpanjang Kontrak 12 Bulan";
      const recGm = document.getElementById("input-rekomendasi-gm")?.value || "Setuju Rekomendasi HRD";
      const catGm = document.getElementById("input-catatan-gm")?.value || "-";
      const dirName = inNamaDir?.value || "Bapak/Ibu Direktur";
      return `Yth. ${dirName},\n\nBerikut kami ajukan persetujuan (ACC) perpanjangan kontrak karyawan:\n- Nama: *${empData.nama_karyawan}*\n- Jabatan: ${empData.jabatan || "-"} (${empData.cabang || "Pusat"})\n- Masa Kontrak: Berakhir *${empData.tglAkhir ? fmtDateShort(empData.tglAkhir) : "-"}* (Sisa ${empData.daysLeft !== null ? empData.daysLeft : '-'} Hari)\n\n*Ringkasan Usulan:*\n- Usulan HRD: ${recHrd}\n- Masukan & Rekomendasi GM: *${recGm}*\n- Catatan GM: "${catGm}"\n\nMohon arahan dan persetujuan (ACC) dari Bapak/Ibu Direktur. Terima kasih.`;
    }

    // Bind WhatsApp buttons
    const btnCopyWaGm = document.getElementById("btn-copy-wa-gm");
    if (btnCopyWaGm) {
      btnCopyWaGm.onclick = async () => {
        const text = buildGmWaText();
        await navigator.clipboard.writeText(text).catch(() => {});
        toast("Format pesan WhatsApp untuk GM berhasil disalin!", "success");
      };
    }
    const btnOpenWaGm = document.getElementById("btn-open-wa-gm");
    if (btnOpenWaGm) {
      btnOpenWaGm.onclick = () => {
        const text = buildGmWaText();
        const phone = inPhoneGm?.value || "";
        openWhatsAppMessage(phone, text);
      };
    }

    const btnCopyWaDir = document.getElementById("btn-copy-wa-dir");
    if (btnCopyWaDir) {
      btnCopyWaDir.onclick = async () => {
        const text = buildDirWaText();
        await navigator.clipboard.writeText(text).catch(() => {});
        toast("Format ringkasan eksekutif untuk Direktur berhasil disalin!", "success");
      };
    }
    const btnOpenWaDir = document.getElementById("btn-open-wa-dir");
    if (btnOpenWaDir) {
      btnOpenWaDir.onclick = () => {
        const text = buildDirWaText();
        const phone = inPhoneDir?.value || "";
        openWhatsAppMessage(phone, text);
      };
    }

    // Auto-calculate new contract dates when duration changes
    const selDurasi = document.getElementById("input-durasi-dir");
    const inMulaiBaru = document.getElementById("input-tgl-mulai-baru");
    const inAkhirBaru = document.getElementById("input-tgl-akhir-baru");

    if (selDurasi && inMulaiBaru && inAkhirBaru) {
      selDurasi.onchange = () => {
        const dur = selDurasi.value;
        const startStr = inMulaiBaru.value || defaultNewStart;
        if (startStr && dur) {
          const sDate = new Date(startStr);
          const eDate = new Date(sDate);
          if (dur === "3 Bulan") eDate.setMonth(eDate.getMonth() + 3);
          else if (dur === "6 Bulan") eDate.setMonth(eDate.getMonth() + 6);
          else if (dur === "12 Bulan") eDate.setFullYear(eDate.getFullYear() + 1);
          eDate.setDate(eDate.getDate() - 1);
          inAkhirBaru.value = eDate.toISOString().split("T")[0];
        }
      };
    }

    // Calculate current Stage from inputs
    function getCurrentStage() {
      const hasDirApproval = document.getElementById("input-tgl-dir")?.value || ev.tgl_approval_direktur;
      const hasSk = document.getElementById("input-no-sk")?.value || ev.no_sk_kontrak_baru;
      const hasGm = document.getElementById("input-tgl-gm")?.value || ev.tgl_koordinasi_gm;
      const hasHrd = document.getElementById("input-tgl-hrd")?.value || ev.tgl_review_hrd;

      if (ev.status_final === "SELESAI") return "SELESAI";
      if (hasSk && hasDirApproval) return "DRAFT_KONTRAK";
      if (hasDirApproval) return "APPROVAL_DIREKTUR";
      if (hasGm) return "APPROVAL_DIREKTUR";
      if (hasHrd) return "KOORDINASI_GM";
      return "REVIEW_HRD";
    }

    // Save Progress Handler
    const btnSaveProgress = document.getElementById("btn-save-progress-eval");
    if (btnSaveProgress) {
      btnSaveProgress.onclick = async () => {
        btnSaveProgress.disabled = true;
        btnSaveProgress.textContent = "Menyimpan...";

        const calculatedStage = getCurrentStage();

        const payload = {
          id: recordId,
          nama_karyawan: empData.nama_karyawan,
          nik_karyawan: empData.nik_karyawan || empData.nik || "",
          jabatan: empData.jabatan || "",
          cabang: empData.cabang || "Pusat",
          divisi: empData.divisi || "",
          kontrak_ke: empData.kontrakKe || 1,
          tgl_mulai_kontrak: empData.tglMulai || "",
          tgl_akhir_kontrak: empData.tglAkhir || "",
          tahap: calculatedStage,
          rekomendasi_hrd: document.getElementById("input-rekomendasi-hrd")?.value || "",
          catatan_hrd: document.getElementById("input-catatan-hrd")?.value || "",
          nama_reviewer_hrd: document.getElementById("input-nama-hrd")?.value || "",
          tgl_review_hrd: document.getElementById("input-tgl-hrd")?.value || "",
          nama_gm: inNamaGm?.value || "",
          rekomendasi_gm: document.getElementById("input-rekomendasi-gm")?.value || "",
          catatan_gm: document.getElementById("input-catatan-gm")?.value || "",
          tgl_koordinasi_gm: document.getElementById("input-tgl-gm")?.value || "",
          nama_direktur: inNamaDir?.value || "",
          keputusan_direktur: document.getElementById("input-keputusan-dir")?.value || "",
          durasi_perpanjangan_disetujui: selDurasi?.value || "",
          catatan_direktur: document.getElementById("input-catatan-dir")?.value || "",
          tgl_approval_direktur: document.getElementById("input-tgl-dir")?.value || "",
          no_sk_kontrak_baru: document.getElementById("input-no-sk")?.value || "",
          tgl_mulai_baru: inMulaiBaru?.value || "",
          tgl_akhir_baru: inAkhirBaru?.value || "",
          status_final: ev.status_final || "PROSES",
          updated_at: new Date().toISOString()
        };

        try {
          await fsUpdate(COL.EVALUASI_KONTRAK, recordId, payload);
          toast("Progres lembar koordinasi perpanjangan berhasil disimpan!", "success");
          closeModal();
          if (onDoneCallback) onDoneCallback();
        } catch (e) {
          toast("Gagal menyimpan: " + e.message, "error");
          btnSaveProgress.disabled = false;
          btnSaveProgress.textContent = "💾 Simpan Progres Lembar Kerja";
        }
      };
    }

    // Execute Renewal (1-Click Creation)
    const btnExecute = document.getElementById("btn-execute-renewal");
    if (btnExecute) {
      btnExecute.onclick = () => {
        const keputusan = document.getElementById("input-keputusan-dir")?.value || "DISETUJUI_PERPANJANG";
        const durasi = selDurasi?.value || "12 Bulan";
        const tglMulai = inMulaiBaru?.value;
        const tglAkhir = inAkhirBaru?.value;
        const noSk = document.getElementById("input-no-sk")?.value || `SK-KTR-${Date.now().toString().slice(-4)}`;

        if (keputusan === "TIDAK_DIPERPANJANG") {
          confirmDialog(
            `Apakah Anda yakin ingin memproses status <b>TIDAK DIPERPANJANG</b> untuk karyawan <b>${escapeHtml(empData.nama_karyawan)}</b>?`,
            async () => {
              try {
                await fsUpdate(COL.EVALUASI_KONTRAK, recordId, {
                  tahap: "SELESAI",
                  status_final: "SELESAI",
                  keputusan_direktur: "TIDAK_DIPERPANJANG",
                  updated_at: new Date().toISOString()
                });
                toast("Status tidak diperpanjang telah disimpan.", "info");
                closeModal();
                if (onDoneCallback) onDoneCallback();
              } catch (e) {
                toast("Gagal memproses: " + e.message, "error");
              }
            }
          );
          return;
        }

        if (!tglMulai || !tglAkhir) {
          toast("Mohon lengkapi Tanggal Mulai dan Tanggal Akhir Kontrak Baru!", "warning");
          return;
        }

        confirmDialog(
          `Terbitkan Kontrak Baru untuk <b>${escapeHtml(empData.nama_karyawan)}</b>?<br><br>
           • Keputusan: <b>${keputusan === 'DISETUJUI_KARTAP' ? 'Pengangkatan Karyawan Tetap' : 'Perpanjang Kontrak'} (${durasi})</b><br>
           • Periode Baru: <b>${fmtDateShort(tglMulai)} s/d ${fmtDateShort(tglAkhir)}</b><br>
           • Kontrak Baru: <b>Kontrak Ke-${(empData.kontrakKe || 1) + 1}</b>`,
          async () => {
            btnExecute.disabled = true;
            btnExecute.textContent = "Menerbitkan Kontrak...";

            try {
              const newKontrakKe = (empData.kontrakKe || 1) + 1;
              const newContractId = `KTR-${(empData.nama_karyawan || "EMP").replace(/[^a-zA-Z0-9]/g, "")}-${Date.now().toString().slice(-4)}`;

              // 1. Add new contract record
              await fsAdd(COL.MASTER_KONTRAK, {
                id: newContractId,
                nama_karyawan: empData.nama_karyawan,
                nik_karyawan: empData.nik_karyawan || empData.nik || "",
                jabatan: empData.jabatan || "",
                cabang: empData.cabang || "Pusat",
                divisi: empData.divisi || "",
                kontrak_ke: newKontrakKe,
                no_kontrak: noSk,
                tanggal_mulai: tglMulai,
                tanggal_akhir: tglAkhir,
                status_kolom_kontrak: "AKTIF",
                keterangan: `Perpanjangan hasil koordinasi Direksi (${durasi}).`,
                created_at: new Date().toISOString(),
                created_by: session.nama || "HRD Admin"
              });

              // 2. Update employee master record
              if (empData.id) {
                const empPatch = {
                  kontrak_ke: newKontrakKe,
                  tgl_mulai_kontrak: tglMulai,
                  tgl_akhir_kontrak: tglAkhir,
                  status_karyawan: keputusan === "DISETUJUI_KARTAP" ? "PKWTT" : "PKWT",
                  aktif_tdk_aktif: "AKTIF"
                };
                await fsUpdate(COL.MASTER_KARYAWAN, empData.id, empPatch);
              }

              // 3. Mark evaluation stage as SELESAI
              await fsUpdate(COL.EVALUASI_KONTRAK, recordId, {
                tahap: "SELESAI",
                status_final: "SELESAI",
                no_sk_kontrak_baru: noSk,
                tgl_mulai_baru: tglMulai,
                tgl_akhir_baru: tglAkhir,
                keputusan_direktur: keputusan,
                durasi_perpanjangan_disetujui: durasi,
                updated_at: new Date().toISOString()
              });

              toast(`Kontrak baru untuk ${empData.nama_karyawan} berhasil diterbitkan dan aktif di sistem!`, "success");
              closeModal();
              if (onDoneCallback) onDoneCallback();
            } catch (e) {
              toast("Gagal menerbitkan kontrak baru: " + e.message, "error");
              btnExecute.disabled = false;
              btnExecute.textContent = "🚀 Terbitkan Kontrak Baru & Selesaikan Alur";
            }
          }
        );
      };
    }
  }

  // -------------------------------------------------------------
  // EVALUASI KONTRAK (ENHANCED TABLE WITH COORDINATION & SLA)
  // -------------------------------------------------------------
  async function loadEvaluasiKontrak() {
    const wrap = panels.evaluasi;
    if (!wrap) return;
    wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

    let allKaryawan = [];
    let allKontrak = [];
    let allEvaluasi = [];

    try {
      [allKaryawan, allKontrak, allEvaluasi] = await Promise.all([
        fsGetAll(COL.MASTER_KARYAWAN),
        fsGetAll(COL.MASTER_KONTRAK),
        fsGetAll(COL.EVALUASI_KONTRAK).catch(() => [])
      ]);
    } catch (e) {
      console.warn("Gagal memuat evaluasi kontrak:", e);
    }

    if (isAtasanView && bawahanNames === null) {
      bawahanNames = await getBawahanNames(session.nama);
    }
    const bset = bawahanNames ? new Set(bawahanNames) : null;
    if (isAtasanView && bset) {
      allKaryawan = allKaryawan.filter(k => bset.has(k.nama_karyawan));
      allKontrak = allKontrak.filter(k => bset.has(k.nama_karyawan));
    }

    const activeEmp = allKaryawan.filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    const evalMap = {};
    allEvaluasi.forEach(ev => {
      if (ev.nama_karyawan) evalMap[ev.nama_karyawan] = ev;
      if (ev.nik_karyawan) evalMap[ev.nik_karyawan] = ev;
    });

    const evaluatedList = activeEmp.map(e => {
      const empContracts = allKontrak.filter(k => (k.nama_karyawan || "").trim().toLowerCase() === (e.nama_karyawan || "").trim().toLowerCase());
      empContracts.sort((a, b) => new Date(b.tanggal_akhir || 0) - new Date(a.tanggal_akhir || 0));
      const latestContract = empContracts[0] || null;

      const tglAkhir = (latestContract && latestContract.tanggal_akhir) || e.tgl_akhir_kontrak || "-";
      let daysLeft = "-";
      let dVal = null;
      let colorClass = "text-slate-600";
      let urgency = "AMAN";

      if (tglAkhir !== "-") {
        const d = Math.ceil((new Date(tglAkhir) - new Date()) / (1000 * 3600 * 24));
        dVal = isNaN(d) ? null : d;
        daysLeft = isNaN(d) ? "-" : `${d} hari`;
        if (d <= 14) {
          colorClass = "text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200";
          urgency = "KRITIS";
        } else if (d <= 30) {
          colorClass = "text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200";
          urgency = "WASPADA";
        } else if (d <= 60) {
          colorClass = "text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200";
          urgency = "PERSIAPAN";
        }
      }

      const ev = evalMap[e.nama_karyawan] || evalMap[e.nik_karyawan] || null;
      return {
        ...e,
        latestContract,
        tglAkhir,
        daysLeft,
        dVal,
        colorClass,
        urgency,
        evalRecord: ev
      };
    });

    wrap.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 class="font-bold text-slate-800 text-base">Evaluasi & Monitoring Kontrak Kerja Karyawan</h3>
            <p class="text-xs text-slate-400 mt-0.5">Monitoring perpanjangan, sisa masa berlaku, dan status tahapan koordinasi GM & Direktur.</p>
          </div>
          <button id="btn-goto-pipeline" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs">
            ⚡ Buka Papan Alur Koordinasi
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wide">
                <th class="py-3 px-4">Nama Karyawan</th>
                <th class="py-3 px-4">Jabatan & Cabang</th>
                <th class="py-3 px-4">Status Karyawan</th>
                <th class="py-3 px-4">Akhir Kontrak</th>
                <th class="py-3 px-4 text-center">Sisa Hari</th>
                <th class="py-3 px-4">Tahap Koordinasi</th>
                <th class="py-3 px-4">Hasil Keputusan</th>
                <th class="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${evaluatedList.length === 0 ? `
                <tr><td colspan="8" class="py-12 text-center text-slate-400 italic">Tidak ada karyawan aktif.</td></tr>
              ` : evaluatedList.map(e => {
                const ev = e.evalRecord;
                let stageText = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Belum Ada Progres</span>`;
                if (ev) {
                  if (ev.status_final === "SELESAI" || ev.tahap === "SELESAI") stageText = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">✅ Selesai</span>`;
                  else if (ev.tahap === "DRAFT_KONTRAK") stageText = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">4. Draf Kontrak</span>`;
                  else if (ev.tahap === "APPROVAL_DIREKTUR") stageText = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">3. Approval Direktur</span>`;
                  else if (ev.tahap === "KOORDINASI_GM") stageText = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">2. Koordinasi GM</span>`;
                  else stageText = `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">1. Review HRD</span>`;
                }

                let decisionText = `<span class="text-slate-400 italic">-</span>`;
                if (ev && ev.keputusan_direktur) {
                  decisionText = `<span class="font-bold text-slate-800">${escapeHtml(ev.keputusan_direktur)} (${escapeHtml(ev.durasi_perpanjangan_disetujui || "-")})</span>`;
                } else if (ev && ev.rekomendasi_gm) {
                  decisionText = `<span class="text-amber-700 font-medium">GM: ${escapeHtml(ev.rekomendasi_gm)}</span>`;
                }

                return `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(e.nama_karyawan)}</td>
                    <td class="py-3 px-4 text-slate-500">${escapeHtml(e.jabatan || "-")} (${escapeHtml(e.cabang || "Pusat")})</td>
                    <td class="py-3 px-4 font-medium">${escapeHtml(formatStatusKaryawan(e.status_karyawan))}</td>
                    <td class="py-3 px-4 font-semibold text-slate-700">${fmtDateShort(e.tglAkhir)}</td>
                    <td class="py-3 px-4 text-center"><span class="${e.colorClass}">${e.daysLeft}</span></td>
                    <td class="py-3 px-4">${stageText}</td>
                    <td class="py-3 px-4 text-[11px]">${decisionText}</td>
                    <td class="py-3 px-4 text-center">
                      <button type="button" data-action="open-eval-coord" data-emp-name="${escapeHtml(e.nama_karyawan)}" class="px-2.5 py-1 bg-maroon-50 hover:bg-maroon-100 text-maroon-700 font-bold rounded-lg transition border border-maroon-200 text-[11px]">
                        ⚡ Koordinasikan
                      </button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const btnGoPipeline = wrap.querySelector("#btn-goto-pipeline");
    if (btnGoPipeline) {
      btnGoPipeline.onclick = () => {
        switchTab("alur_perpanjangan");
      };
    }

    wrap.querySelectorAll('[data-action="open-eval-coord"]').forEach(btn => {
      btn.onclick = () => {
        const empName = btn.dataset.empName;
        const target = evaluatedList.find(x => x.nama_karyawan === empName);
        if (target) {
          openModalKoordinasiPerpanjangan(target, target.evalRecord, () => {
            loadEvaluasiKontrak();
          });
        }
      };
    });
  }

  async function loadDailyTarget() {
    const wrap = panels.daily;
    if (!wrap) return;
    wrap.innerHTML = `<div class="p-6">${skeletonRows(5)}</div>`;

    if (isAtasanView && bawahanNames === null) {
      bawahanNames = await getBawahanNames(session.nama);
    }

    let allKaryawan = [];
    let allLogs = [];
    let allTargets = [];

    try {
      const [kRes, lRes, tRes] = await Promise.all([
        fsGetAll(COL.MASTER_KARYAWAN),
        fsGetAll(COL.LOG_PENILAIAN_HARIAN),
        fsGetAll(COL.TARGET_BULANAN_KPI)
      ]);
      allKaryawan = kRes || [];
      allLogs = lRes || [];
      allTargets = tRes || [];
    } catch (err) {
      console.error("Gagal memuat data harian/target:", err);
      wrap.innerHTML = `<div class="p-6 text-center text-rose-500 font-semibold">Gagal memuat data: ${escapeHtml(err.message)}</div>`;
      return;
    }

    // Role-based filtering of employees
    const activeEmp = allKaryawan.filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
    let visibleEmployees = activeEmp;
    if (isAtasanView && bawahanNames) {
      const bset = new Set(bawahanNames.map(x => x.toLowerCase().trim()));
      visibleEmployees = activeEmp.filter(e => bset.has((e.nama_karyawan || "").toLowerCase().trim()));
    } else if (isRegularEmployee) {
      const myName = (session.nama || "").toLowerCase().trim();
      const myNik = (session.nik || "").toLowerCase().trim();
      visibleEmployees = activeEmp.filter(e => 
        (e.nama_karyawan && e.nama_karyawan.toLowerCase().trim() === myName) ||
        (e.nik_karyawan && e.nik_karyawan.toLowerCase().trim() === myNik)
      );
    }

    const currentYearMonth = new Date().toISOString().slice(0, 7);
    let activeDailySubtab = "harian"; // "harian" | "target" | "rekap"
    let filterMonth = currentYearMonth;
    let filterKategori = "";
    let searchQuery = "";

    function renderDailyView() {
      wrap.innerHTML = `
        <div class="space-y-5">
          <!-- Header Card -->
          <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="p-2 rounded-xl bg-maroon-50 text-maroon-700 font-bold text-base">📊</span>
                <div>
                  <h3 class="font-bold text-slate-800 text-base">Penilaian Harian & Target Sales / Operasional</h3>
                  <p class="text-xs text-slate-400 mt-0.5">Pencatatan evaluasi kinerja harian, penetapan target bulanan, dan monitoring pencapaian berkala staf.</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              ${(isHrdOrAdmin || isAtasan || canEdit) ? `
                <button id="btn-input-penilaian-harian" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs">
                  <span>+</span> Input Penilaian Harian
                </button>
                <button id="btn-set-target-bulanan" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs">
                  <span>🎯</span> Set Target Bulanan KPI
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Sub-Tab Navigation -->
          <div class="flex items-center gap-2 border-b border-slate-200">
            <button id="subtab-btn-harian" class="daily-subtab-btn px-4 py-2.5 text-xs font-bold border-b-2 ${activeDailySubtab === 'harian' ? 'border-maroon-700 text-maroon-700' : 'border-transparent text-slate-500 hover:text-slate-700'} transition flex items-center gap-1.5">
              <span>📝</span> Log Penilaian Harian
            </button>
            <button id="subtab-btn-target" class="daily-subtab-btn px-4 py-2.5 text-xs font-bold border-b-2 ${activeDailySubtab === 'target' ? 'border-maroon-700 text-maroon-700' : 'border-transparent text-slate-500 hover:text-slate-700'} transition flex items-center gap-1.5">
              <span>🎯</span> Target Bulanan KPI
            </button>
            <button id="subtab-btn-rekap" class="daily-subtab-btn px-4 py-2.5 text-xs font-bold border-b-2 ${activeDailySubtab === 'rekap' ? 'border-maroon-700 text-maroon-700' : 'border-transparent text-slate-500 hover:text-slate-700'} transition flex items-center gap-1.5">
              <span>📈</span> Rekapitulasi Capaian
            </button>
          </div>

          <!-- Sub-Tab Content Containers -->
          <div id="daily-subtab-content"></div>
        </div>
      `;

      // Wire Sub-Tab switching
      wrap.querySelector("#subtab-btn-harian").onclick = () => {
        activeDailySubtab = "harian";
        renderDailyView();
      };
      wrap.querySelector("#subtab-btn-target").onclick = () => {
        activeDailySubtab = "target";
        renderDailyView();
      };
      wrap.querySelector("#subtab-btn-rekap").onclick = () => {
        activeDailySubtab = "rekap";
        renderDailyView();
      };

      const btnAddHarian = wrap.querySelector("#btn-input-penilaian-harian");
      if (btnAddHarian) {
        btnAddHarian.onclick = () => openFormPenilaianHarianModal();
      }

      const btnAddTarget = wrap.querySelector("#btn-set-target-bulanan");
      if (btnAddTarget) {
        btnAddTarget.onclick = () => openFormTargetBulananModal();
      }

      const subContent = wrap.querySelector("#daily-subtab-content");
      if (activeDailySubtab === "harian") {
        renderSubtabHarian(subContent);
      } else if (activeDailySubtab === "target") {
        renderSubtabTarget(subContent);
      } else if (activeDailySubtab === "rekap") {
        renderSubtabRekap(subContent);
      }
    }

    // -------------------------------------------------------------
    // SUBTAB 1: LOG PENILAIAN HARIAN
    // -------------------------------------------------------------
    function renderSubtabHarian(targetEl) {
      // Filter logs by role visibility
      let filteredLogs = allLogs.filter(l => {
        if (isAtasanView && bawahanNames) {
          const bset = new Set(bawahanNames.map(x => x.toLowerCase().trim()));
          const empName = (l.nama_karyawan || "").toLowerCase().trim();
          return bset.has(empName);
        } else if (isRegularEmployee) {
          const myName = (session.nama || "").toLowerCase().trim();
          const myNik = (session.nik || "").toLowerCase().trim();
          return (l.nama_karyawan && l.nama_karyawan.toLowerCase().trim() === myName) ||
                 (l.nik_karyawan && l.nik_karyawan.toLowerCase().trim() === myNik);
        }
        return true;
      });

      // Filter by Month
      if (filterMonth) {
        filteredLogs = filteredLogs.filter(l => (l.tanggal || "").startsWith(filterMonth));
      }

      // Filter by Kategori
      if (filterKategori) {
        filteredLogs = filteredLogs.filter(l => (l.kategori || "").toUpperCase() === filterKategori);
      }

      // Filter by Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredLogs = filteredLogs.filter(l => 
          (l.nama_karyawan || "").toLowerCase().includes(q) ||
          (l.nik_karyawan || "").toLowerCase().includes(q) ||
          (l.jabatan || "").toLowerCase().includes(q) ||
          (l.penilai || "").toLowerCase().includes(q) ||
          (l.catatan_harian || "").toLowerCase().includes(q) ||
          (l.catatan_baik || "").toLowerCase().includes(q)
        );
      }

      filteredLogs.sort((a, b) => new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0));

      // Calculate Stats
      const totalLogs = filteredLogs.length;
      let sumScore = 0;
      let countHigh = 0;
      let countLow = 0;
      const uniqueEmp = new Set();

      filteredLogs.forEach(l => {
        const sc = parseFloat(l.total_skor) || 0;
        sumScore += sc;
        if (sc >= 85) countHigh++;
        else if (sc < 70) countLow++;
        if (l.nama_karyawan) uniqueEmp.add(l.nama_karyawan);
      });

      const avgScore = totalLogs > 0 ? (sumScore / totalLogs).toFixed(1) : "0.0";

      targetEl.innerHTML = `
        <div class="space-y-4">
          <!-- Stat Cards -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Log Tercatat</span>
              <div class="flex items-center justify-between mt-1">
                <span class="text-xl font-black text-slate-800">${totalLogs}</span>
                <span class="text-xs text-slate-400 font-semibold">${uniqueEmp.size} Karyawan</span>
              </div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Rata-Rata Skor</span>
              <div class="flex items-center justify-between mt-1">
                <span class="text-xl font-black text-maroon-700">${avgScore}</span>
                <span class="text-[10.5px] font-bold px-2 py-0.5 rounded-md ${parseFloat(avgScore) >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">/ 100</span>
              </div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Performa Unggul (≥85)</span>
              <div class="flex items-center justify-between mt-1">
                <span class="text-xl font-black text-emerald-600">${countHigh}</span>
                <span class="text-xs text-emerald-600 font-bold">🌟 Sangat Baik</span>
              </div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Perlu Perhatian (&lt;70)</span>
              <div class="flex items-center justify-between mt-1">
                <span class="text-xl font-black text-rose-600">${countLow}</span>
                <span class="text-xs text-rose-600 font-bold">⚠️ Evaluasi</span>
              </div>
            </div>
          </div>

          <!-- Controls Bar -->
          <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-center gap-2 flex-wrap flex-1">
              <div class="relative w-full sm:w-64">
                <input type="text" id="daily-search-input" value="${escapeHtml(searchQuery)}" placeholder="Cari nama, NIK, penilai..." class="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
                <span class="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-400 font-medium">Bulan:</span>
                <input type="month" id="daily-filter-month" value="${filterMonth}" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-700">
                ${filterMonth ? `<button id="btn-clear-month" class="text-xs text-rose-500 hover:text-rose-700 font-bold px-1" title="Semua Bulan">✕</button>` : ''}
              </div>
              <div>
                <select id="daily-filter-kat" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
                  <option value="" ${!filterKategori ? 'selected' : ''}>Semua Divisi</option>
                  <option value="SALES" ${filterKategori === 'SALES' ? 'selected' : ''}>Divisi Sales</option>
                  <option value="NON_SALES" ${filterKategori === 'NON_SALES' ? 'selected' : ''}>Divisi Non-Sales</option>
                </select>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-export-daily-xlsx" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 transition flex items-center gap-1.5">
                <span>📥</span> Unduh Excel (XLSX)
              </button>
            </div>
          </div>

          <!-- Table Container -->
          <div class="bg-white rounded-xl border border-slate-100 shadow-2xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-bold bg-slate-50/50">
                    <th class="py-3 px-3.5">Tanggal</th>
                    <th class="py-3 px-3.5">Karyawan</th>
                    <th class="py-3 px-3.5">Divisi</th>
                    <th class="py-3 px-3.5">Aspek / Indikator</th>
                    <th class="py-3 px-3.5 text-center">Skor Harian</th>
                    <th class="py-3 px-3.5">Catatan / Ulasan</th>
                    <th class="py-3 px-3.5">Penilai</th>
                    <th class="py-3 px-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  ${filteredLogs.length === 0 ? `
                    <tr>
                      <td colspan="8" class="py-12 text-center text-slate-400 italic">
                        Belum ada catatan log penilaian harian yang sesuai filter.
                      </td>
                    </tr>
                  ` : filteredLogs.map(l => {
                    const score = parseFloat(l.total_skor) || 0;
                    let predBadge = "bg-rose-50 text-rose-700 border-rose-200";
                    let predText = "Kurang";
                    if (score >= 85) {
                      predBadge = "bg-emerald-50 text-emerald-800 border-emerald-200";
                      predText = "Sangat Baik";
                    } else if (score >= 70) {
                      predBadge = "bg-blue-50 text-blue-800 border-blue-200";
                      predText = "Baik";
                    } else if (score >= 55) {
                      predBadge = "bg-amber-50 text-amber-800 border-amber-200";
                      predText = "Cukup";
                    }

                    const isSales = (l.kategori || "").toUpperCase() === "SALES";
                    const isAuthorOrAdmin = isHrdOrAdmin || canEdit || (l.penilai && l.penilai.toLowerCase() === (session.nama || "").toLowerCase());

                    return `
                      <tr class="hover:bg-slate-50/80 transition">
                        <td class="py-3 px-3.5 font-bold text-slate-700 whitespace-nowrap">
                          ${fmtDateShort(l.tanggal)}
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="font-bold text-slate-800">${escapeHtml(l.nama_karyawan || "-")}</div>
                          <div class="text-[10px] text-slate-400">${escapeHtml(l.nik_karyawan || "")} • ${escapeHtml(l.jabatan || "-")}</div>
                        </td>
                        <td class="py-3 px-3.5">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${isSales ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'}">
                            ${isSales ? 'SALES' : 'NON-SALES'}
                          </span>
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="text-[11px] text-slate-600 font-medium max-w-xs truncate">
                            ${escapeHtml(l.ringkasan_indikator || (isSales ? 'Indikator Sales Lampiran 1' : 'SOP & Disiplin Harian'))}
                          </div>
                        </td>
                        <td class="py-3 px-3.5 text-center whitespace-nowrap">
                          <div class="font-black text-sm text-slate-800">${score.toFixed(1)}</div>
                          <span class="inline-block mt-0.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${predBadge}">
                            ${predText}
                          </span>
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="text-[11px] text-slate-600 max-w-xs line-clamp-2" title="${escapeHtml(l.catatan_harian || l.catatan_baik || '-')}">
                            ${escapeHtml(l.catatan_harian || l.catatan_baik || '-')}
                          </div>
                        </td>
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="font-semibold text-slate-700">${escapeHtml(l.penilai || "-")}</div>
                        </td>
                        <td class="py-3 px-3.5 text-center whitespace-nowrap">
                          <div class="flex items-center justify-center gap-1">
                            <button data-action="detail-daily" data-id="${l.id}" class="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition border border-slate-200" title="Lihat Rincian">
                              👁️
                            </button>
                            ${isAuthorOrAdmin ? `
                              <button data-action="edit-daily" data-id="${l.id}" class="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition border border-blue-200" title="Edit Log">
                                ✏️
                              </button>
                              <button data-action="delete-daily" data-id="${l.id}" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition border border-rose-200" title="Hapus Log">
                                🗑️
                              </button>
                            ` : ''}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      // Event Listeners for Filters
      const searchInp = targetEl.querySelector("#daily-search-input");
      if (searchInp) {
        searchInp.oninput = (e) => {
          searchQuery = e.target.value;
          renderSubtabHarian(targetEl);
        };
      }

      const monthInp = targetEl.querySelector("#daily-filter-month");
      if (monthInp) {
        monthInp.onchange = (e) => {
          filterMonth = e.target.value;
          renderSubtabHarian(targetEl);
        };
      }

      const btnClearMonth = targetEl.querySelector("#btn-clear-month");
      if (btnClearMonth) {
        btnClearMonth.onclick = () => {
          filterMonth = "";
          renderSubtabHarian(targetEl);
        };
      }

      const katSel = targetEl.querySelector("#daily-filter-kat");
      if (katSel) {
        katSel.onchange = (e) => {
          filterKategori = e.target.value;
          renderSubtabHarian(targetEl);
        };
      }

      // Export XLSX
      const btnExport = targetEl.querySelector("#btn-export-daily-xlsx");
      if (btnExport) {
        btnExport.onclick = async () => {
          if (filteredLogs.length === 0) {
            toast("Tidak ada data log untuk diexport", "error");
            return;
          }
          await ensureXlsxLoaded();
          const headers = ["Tanggal", "Nama Karyawan", "NIK", "Jabatan", "Divisi", "Kategori", "Skor Akhir", "Predikat", "Ringkasan Indikator", "Catatan Kelebihan", "Catatan Perbaikan", "Catatan Umum", "Penilai"];
          const matrix = filteredLogs.map(l => {
            const sc = parseFloat(l.total_skor) || 0;
            let pred = sc >= 85 ? "Sangat Baik" : sc >= 70 ? "Baik" : sc >= 55 ? "Cukup" : "Kurang";
            return [
              l.tanggal ? l.tanggal.slice(0, 10) : "-",
              l.nama_karyawan || "-",
              l.nik_karyawan || "-",
              l.jabatan || "-",
              l.divisi || "-",
              l.kategori || "NON_SALES",
              sc,
              pred,
              l.ringkasan_indikator || "-",
              l.catatan_baik || "-",
              l.catatan_perbaikan || "-",
              l.catatan_harian || "-",
              l.penilai || "-"
            ];
          });
          await downloadXlsx(`Rekap_Penilaian_Harian_${filterMonth || 'Semua'}.xlsx`, headers, matrix, "Log_Harian");
          toast("File Excel berhasil diunduh!", "success");
        };
      }

      // Actions: Detail, Edit, Delete
      targetEl.querySelectorAll('[data-action="detail-daily"]').forEach(btn => {
        btn.onclick = () => {
          const lObj = allLogs.find(x => x.id === btn.dataset.id);
          if (lObj) openDetailDailyLogModal(lObj);
        };
      });

      targetEl.querySelectorAll('[data-action="edit-daily"]').forEach(btn => {
        btn.onclick = () => {
          const lObj = allLogs.find(x => x.id === btn.dataset.id);
          if (lObj) openFormPenilaianHarianModal(lObj);
        };
      });

      targetEl.querySelectorAll('[data-action="delete-daily"]').forEach(btn => {
        btn.onclick = () => {
          const lObj = allLogs.find(x => x.id === btn.dataset.id);
          if (!lObj) return;
          confirmDialog(
            `Apakah Anda yakin ingin menghapus log penilaian harian untuk <b>${escapeHtml(lObj.nama_karyawan)}</b> (Tanggal: ${fmtDateShort(lObj.tanggal)})?`,
            async () => {
              try {
                await fsDelete(COL.LOG_PENILAIAN_HARIAN, lObj.id);
                toast("Log penilaian harian berhasil dihapus!", "success");
                allLogs = allLogs.filter(x => x.id !== lObj.id);
                renderSubtabHarian(targetEl);
              } catch (e) {
                toast("Gagal menghapus log: " + e.message, "error");
              }
            }
          );
        };
      });
    }

    // -------------------------------------------------------------
    // SUBTAB 2: TARGET BULANAN KPI
    // -------------------------------------------------------------
    function renderSubtabTarget(targetEl) {
      let filteredTargets = allTargets.filter(t => {
        if (isAtasanView && bawahanNames) {
          const bset = new Set(bawahanNames.map(x => x.toLowerCase().trim()));
          const empName = (t.nama_karyawan || "").toLowerCase().trim();
          return bset.has(empName);
        } else if (isRegularEmployee) {
          const myName = (session.nama || "").toLowerCase().trim();
          const myNik = (session.nik || "").toLowerCase().trim();
          return (t.nama_karyawan && t.nama_karyawan.toLowerCase().trim() === myName) ||
                 (t.nik_karyawan && t.nik_karyawan.toLowerCase().trim() === myNik);
        }
        return true;
      });

      if (filterMonth) {
        filteredTargets = filteredTargets.filter(t => (t.periode || "").startsWith(filterMonth));
      }

      if (filterKategori) {
        filteredTargets = filteredTargets.filter(t => (t.kategori || "").toUpperCase() === filterKategori);
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredTargets = filteredTargets.filter(t => 
          (t.nama_karyawan || "").toLowerCase().includes(q) ||
          (t.nik_karyawan || "").toLowerCase().includes(q) ||
          (t.jabatan || "").toLowerCase().includes(q) ||
          (t.ditetapkan_oleh || "").toLowerCase().includes(q) ||
          (t.catatan_target || "").toLowerCase().includes(q)
        );
      }

      filteredTargets.sort((a, b) => (b.periode || "").localeCompare(a.periode || ""));

      targetEl.innerHTML = `
        <div class="space-y-4">
          <!-- Controls Bar -->
          <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-center gap-2 flex-wrap flex-1">
              <div class="relative w-full sm:w-64">
                <input type="text" id="target-search-input" value="${escapeHtml(searchQuery)}" placeholder="Cari karyawan, target..." class="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
                <span class="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-400 font-medium">Periode:</span>
                <input type="month" id="target-filter-month" value="${filterMonth}" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-700">
                ${filterMonth ? `<button id="btn-clear-target-month" class="text-xs text-rose-500 hover:text-rose-700 font-bold px-1" title="Semua Periode">✕</button>` : ''}
              </div>
              <div>
                <select id="target-filter-kat" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
                  <option value="" ${!filterKategori ? 'selected' : ''}>Semua Kategori</option>
                  <option value="SALES" ${filterKategori === 'SALES' ? 'selected' : ''}>Sales (Lampiran 1)</option>
                  <option value="NON_SALES" ${filterKategori === 'NON_SALES' ? 'selected' : ''}>Non-Sales / Operasional</option>
                </select>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-export-target-xlsx" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 transition flex items-center gap-1.5">
                <span>📥</span> Unduh Excel (XLSX)
              </button>
            </div>
          </div>

          <!-- Table Target -->
          <div class="bg-white rounded-xl border border-slate-100 shadow-2xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-bold bg-slate-50/50">
                    <th class="py-3 px-3.5">Periode</th>
                    <th class="py-3 px-3.5">Karyawan</th>
                    <th class="py-3 px-3.5">Kategori</th>
                    <th class="py-3 px-3.5">Rincian Target Utama</th>
                    <th class="py-3 px-3.5">Catatan Sasaran</th>
                    <th class="py-3 px-3.5">Ditetapkan Oleh</th>
                    <th class="py-3 px-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  ${filteredTargets.length === 0 ? `
                    <tr>
                      <td colspan="7" class="py-12 text-center text-slate-400 italic">
                        Belum ada target bulanan KPI yang ditetapkan untuk filter ini.
                      </td>
                    </tr>
                  ` : filteredTargets.map(t => {
                    const isSales = (t.kategori || "").toUpperCase() === "SALES";
                    const isAuthorOrAdmin = isHrdOrAdmin || canEdit || (t.ditetapkan_oleh && t.ditetapkan_oleh.toLowerCase() === (session.nama || "").toLowerCase());

                    let targetSummary = "-";
                    if (isSales) {
                      const vDulux = t.target_volume_dulux ? `${t.target_volume_dulux} Ton Dulux` : "";
                      const valSales = t.target_value_penjualan ? `Rp ${(parseFloat(t.target_value_penjualan) || 0).toLocaleString('id-ID')}` : "";
                      const ao = t.target_ao_ici ? `${t.target_ao_ici} AO Toko` : "";
                      targetSummary = [vDulux, valSales, ao].filter(Boolean).join(" • ") || "Target Sales Lampiran 1";
                    } else {
                      targetSummary = t.target_summary || "SOP, SLA Respon, Kehadiran, & Inisiatif";
                    }

                    return `
                      <tr class="hover:bg-slate-50/80 transition">
                        <td class="py-3 px-3.5 font-bold text-slate-700 whitespace-nowrap">
                          <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-black">
                            ${escapeHtml(t.periode || "-")}
                          </span>
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="font-bold text-slate-800">${escapeHtml(t.nama_karyawan || "-")}</div>
                          <div class="text-[10px] text-slate-400">${escapeHtml(t.nik_karyawan || "")} • ${escapeHtml(t.jabatan || "-")}</div>
                        </td>
                        <td class="py-3 px-3.5">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${isSales ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'}">
                            ${isSales ? 'SALES' : 'NON-SALES'}
                          </span>
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="text-[11px] font-semibold text-slate-700 max-w-sm leading-snug">
                            ${escapeHtml(targetSummary)}
                          </div>
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="text-[11px] text-slate-500 max-w-xs truncate">
                            ${escapeHtml(t.catatan_target || "-")}
                          </div>
                        </td>
                        <td class="py-3 px-3.5 whitespace-nowrap">
                          <div class="font-semibold text-slate-700">${escapeHtml(t.ditetapkan_oleh || "-")}</div>
                          <div class="text-[10px] text-slate-400">${t.created_at ? fmtDateShort(t.created_at) : ''}</div>
                        </td>
                        <td class="py-3 px-3.5 text-center whitespace-nowrap">
                          <div class="flex items-center justify-center gap-1">
                            <button data-action="detail-target" data-id="${t.id}" class="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition border border-slate-200" title="Lihat Rincian Target">
                              👁️
                            </button>
                            ${isAuthorOrAdmin ? `
                              <button data-action="edit-target" data-id="${t.id}" class="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition border border-blue-200" title="Edit Target">
                                ✏️
                              </button>
                              <button data-action="delete-target" data-id="${t.id}" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition border border-rose-200" title="Hapus Target">
                                🗑️
                              </button>
                            ` : ''}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      // Event Listeners
      const searchInp = targetEl.querySelector("#target-search-input");
      if (searchInp) {
        searchInp.oninput = (e) => {
          searchQuery = e.target.value;
          renderSubtabTarget(targetEl);
        };
      }

      const monthInp = targetEl.querySelector("#target-filter-month");
      if (monthInp) {
        monthInp.onchange = (e) => {
          filterMonth = e.target.value;
          renderSubtabTarget(targetEl);
        };
      }

      const btnClearMonth = targetEl.querySelector("#btn-clear-target-month");
      if (btnClearMonth) {
        btnClearMonth.onclick = () => {
          filterMonth = "";
          renderSubtabTarget(targetEl);
        };
      }

      const katSel = targetEl.querySelector("#target-filter-kat");
      if (katSel) {
        katSel.onchange = (e) => {
          filterKategori = e.target.value;
          renderSubtabTarget(targetEl);
        };
      }

      // Export Target XLSX
      const btnExport = targetEl.querySelector("#btn-export-target-xlsx");
      if (btnExport) {
        btnExport.onclick = async () => {
          if (filteredTargets.length === 0) {
            toast("Tidak ada data target untuk diexport", "error");
            return;
          }
          await ensureXlsxLoaded();
          const headers = ["Periode", "Nama Karyawan", "NIK", "Jabatan", "Kategori", "Target Vol Dulux", "Target Vol Catylac", "Target Vol Maxilite", "Target Vol Aquashield", "Target Value Penjualan", "Target Overdue Limit", "Target AO", "Target SOP %", "Target SLA Respon %", "Catatan Target", "Ditetapkan Oleh"];
          const matrix = filteredTargets.map(t => [
            t.periode || "-",
            t.nama_karyawan || "-",
            t.nik_karyawan || "-",
            t.jabatan || "-",
            t.kategori || "-",
            t.target_volume_dulux || 0,
            t.target_volume_catylac || 0,
            t.target_volume_maxilite || 0,
            t.target_volume_aquashield || 0,
            t.target_value_penjualan || 0,
            t.target_overdue_piutang || 0,
            t.target_ao_ici || 0,
            t.target_sop_tugas || 0,
            t.target_respon_divisi || 0,
            t.catatan_target || "-",
            t.ditetapkan_oleh || "-"
          ]);
          await downloadXlsx(`Target_Bulanan_KPI_${filterMonth || 'Semua'}.xlsx`, headers, matrix, "Target_KPI");
          toast("File target Excel berhasil diunduh!", "success");
        };
      }

      // Actions
      targetEl.querySelectorAll('[data-action="detail-target"]').forEach(btn => {
        btn.onclick = () => {
          const tObj = allTargets.find(x => x.id === btn.dataset.id);
          if (tObj) openDetailTargetBulananModal(tObj);
        };
      });

      targetEl.querySelectorAll('[data-action="edit-target"]').forEach(btn => {
        btn.onclick = () => {
          const tObj = allTargets.find(x => x.id === btn.dataset.id);
          if (tObj) openFormTargetBulananModal(tObj);
        };
      });

      targetEl.querySelectorAll('[data-action="delete-target"]').forEach(btn => {
        btn.onclick = () => {
          const tObj = allTargets.find(x => x.id === btn.dataset.id);
          if (!tObj) return;
          confirmDialog(
            `Apakah Anda yakin ingin menghapus target bulanan untuk <b>${escapeHtml(tObj.nama_karyawan)}</b> (Periode: ${escapeHtml(tObj.periode)})?`,
            async () => {
              try {
                await fsDelete(COL.TARGET_BULANAN_KPI, tObj.id);
                toast("Target bulanan KPI berhasil dihapus!", "success");
                allTargets = allTargets.filter(x => x.id !== tObj.id);
                renderSubtabTarget(targetEl);
              } catch (e) {
                toast("Gagal menghapus target: " + e.message, "error");
              }
            }
          );
        };
      });
    }

    // -------------------------------------------------------------
    // SUBTAB 3: REKAPITULASI CAPAIAN BULANAN
    // -------------------------------------------------------------
    function renderSubtabRekap(targetEl) {
      const selectedMonth = filterMonth || currentYearMonth;
      const monthLogs = allLogs.filter(l => (l.tanggal || "").startsWith(selectedMonth));
      const monthTargets = allTargets.filter(t => (t.periode || "").startsWith(selectedMonth));

      // Group logs by employee
      const employeeMap = {};
      visibleEmployees.forEach(e => {
        const empName = e.nama_karyawan;
        employeeMap[empName] = {
          karyawan: e,
          logs: [],
          target: null
        };
      });

      monthLogs.forEach(l => {
        const eName = l.nama_karyawan;
        if (employeeMap[eName]) {
          employeeMap[eName].logs.push(l);
        } else {
          employeeMap[eName] = {
            karyawan: { nama_karyawan: eName, nik_karyawan: l.nik_karyawan, jabatan: l.jabatan, cabang: l.cabang },
            logs: [l],
            target: null
          };
        }
      });

      monthTargets.forEach(t => {
        const eName = t.nama_karyawan;
        if (employeeMap[eName]) {
          employeeMap[eName].target = t;
        }
      });

      let empSummaryList = Object.values(employeeMap);

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        empSummaryList = empSummaryList.filter(item => 
          (item.karyawan.nama_karyawan || "").toLowerCase().includes(q) ||
          (item.karyawan.nik_karyawan || "").toLowerCase().includes(q) ||
          (item.karyawan.jabatan || "").toLowerCase().includes(q)
        );
      }

      empSummaryList.sort((a, b) => (a.karyawan.nama_karyawan || "").localeCompare(b.karyawan.nama_karyawan || ""));

      targetEl.innerHTML = `
        <div class="space-y-4">
          <!-- Controls Bar -->
          <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-center gap-2 flex-wrap flex-1">
              <div class="relative w-full sm:w-64">
                <input type="text" id="rekap-search-input" value="${escapeHtml(searchQuery)}" placeholder="Cari nama karyawan..." class="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
                <span class="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-slate-400 font-medium">Periode Rekap:</span>
                <input type="month" id="rekap-filter-month" value="${selectedMonth}" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-700">
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-export-rekap-xlsx" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 transition flex items-center gap-1.5">
                <span>📥</span> Unduh Rekap (XLSX)
              </button>
            </div>
          </div>

          <!-- Rekap Table -->
          <div class="bg-white rounded-xl border border-slate-100 shadow-2xs overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-bold bg-slate-50/50">
                    <th class="py-3 px-3.5">Nama Karyawan</th>
                    <th class="py-3 px-3.5">Jabatan & Cabang</th>
                    <th class="py-3 px-3.5 text-center">Hari Dinilai</th>
                    <th class="py-3 px-3.5 text-center">Rata-Rata Skor</th>
                    <th class="py-3 px-3.5 text-center">Predikat Kinerja</th>
                    <th class="py-3 px-3.5">Target Bulanan</th>
                    <th class="py-3 px-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  ${empSummaryList.length === 0 ? `
                    <tr>
                      <td colspan="7" class="py-12 text-center text-slate-400 italic">
                        Tidak ada data rekapitulasi untuk periode ini.
                      </td>
                    </tr>
                  ` : empSummaryList.map(item => {
                    const emp = item.karyawan;
                    const logCount = item.logs.length;
                    let totalSc = 0;
                    item.logs.forEach(l => { totalSc += (parseFloat(l.total_skor) || 0); });
                    const avg = logCount > 0 ? (totalSc / logCount) : 0;
                    const avgStr = avg.toFixed(1);

                    let predBadge = "bg-slate-100 text-slate-600 border-slate-200";
                    let predText = "Belum Ada Data";
                    if (logCount > 0) {
                      if (avg >= 85) {
                        predBadge = "bg-emerald-50 text-emerald-800 border-emerald-300";
                        predText = "Sangat Baik (A)";
                      } else if (avg >= 70) {
                        predBadge = "bg-blue-50 text-blue-800 border-blue-300";
                        predText = "Baik (B)";
                      } else if (avg >= 55) {
                        predBadge = "bg-amber-50 text-amber-800 border-amber-300";
                        predText = "Cukup (C)";
                      } else {
                        predBadge = "bg-rose-50 text-rose-800 border-rose-300";
                        predText = "Kurang (D)";
                      }
                    }

                    const hasTarget = !!item.target;

                    return `
                      <tr class="hover:bg-slate-50/80 transition">
                        <td class="py-3 px-3.5">
                          <div class="font-bold text-slate-800">${escapeHtml(emp.nama_karyawan || "-")}</div>
                          <div class="text-[10px] text-slate-400">${escapeHtml(emp.nik_karyawan || "")}</div>
                        </td>
                        <td class="py-3 px-3.5">
                          <div class="font-semibold text-slate-700">${escapeHtml(emp.jabatan || "-")}</div>
                          <div class="text-[10px] text-slate-400">${escapeHtml(emp.cabang || "Pusat")}</div>
                        </td>
                        <td class="py-3 px-3.5 text-center">
                          <span class="px-2 py-0.5 rounded-full text-xs font-black ${logCount > 0 ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-400'}">
                            ${logCount} Hari
                          </span>
                        </td>
                        <td class="py-3 px-3.5 text-center">
                          <span class="font-black text-sm ${logCount > 0 ? 'text-maroon-700' : 'text-slate-300'}">
                            ${logCount > 0 ? avgStr : '-'}
                          </span>
                        </td>
                        <td class="py-3 px-3.5 text-center">
                          <span class="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${predBadge}">
                            ${predText}
                          </span>
                        </td>
                        <td class="py-3 px-3.5">
                          ${hasTarget ? `
                            <span class="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                              <span>✓</span> Sudah Diset
                            </span>
                          ` : `
                            <span class="text-slate-400 text-[11px] italic">
                              Belum Diset
                            </span>
                          `}
                        </td>
                        <td class="py-3 px-3.5 text-center">
                          <button data-action="view-emp-history" data-emp="${escapeHtml(emp.nama_karyawan)}" class="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold border border-slate-200 transition">
                            Lihat Log Harian (${logCount})
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      // Event Listeners
      const searchInp = targetEl.querySelector("#rekap-search-input");
      if (searchInp) {
        searchInp.oninput = (e) => {
          searchQuery = e.target.value;
          renderSubtabRekap(targetEl);
        };
      }

      const monthInp = targetEl.querySelector("#rekap-filter-month");
      if (monthInp) {
        monthInp.onchange = (e) => {
          filterMonth = e.target.value;
          renderSubtabRekap(targetEl);
        };
      }

      // Export Rekap XLSX
      const btnExport = targetEl.querySelector("#btn-export-rekap-xlsx");
      if (btnExport) {
        btnExport.onclick = async () => {
          if (empSummaryList.length === 0) {
            toast("Tidak ada data rekap untuk diexport", "error");
            return;
          }
          await ensureXlsxLoaded();
          const headers = ["Periode", "Nama Karyawan", "NIK", "Jabatan", "Cabang", "Hari Dinilai", "Rata-Rata Skor", "Predikat Kinerja", "Target Bulanan"];
          const matrix = empSummaryList.map(item => {
            const emp = item.karyawan;
            const logCount = item.logs.length;
            let totalSc = 0;
            item.logs.forEach(l => { totalSc += (parseFloat(l.total_skor) || 0); });
            const avg = logCount > 0 ? (totalSc / logCount).toFixed(2) : "0.00";
            let pred = logCount > 0 ? (avg >= 85 ? "Sangat Baik" : avg >= 70 ? "Baik" : avg >= 55 ? "Cukup" : "Kurang") : "Belum Ada Data";
            return [
              selectedMonth,
              emp.nama_karyawan || "-",
              emp.nik_karyawan || "-",
              emp.jabatan || "-",
              emp.cabang || "-",
              logCount,
              logCount > 0 ? avg : 0,
              pred,
              item.target ? "Sudah Diset" : "Belum Diset"
            ];
          });
          await downloadXlsx(`Rekap_Kinerja_Bulanan_${selectedMonth}.xlsx`, headers, matrix, "Rekap_Bulanan");
          toast("File rekap Excel berhasil diunduh!", "success");
        };
      }

      targetEl.querySelectorAll('[data-action="view-emp-history"]').forEach(btn => {
        btn.onclick = () => {
          const empName = btn.dataset.emp;
          searchQuery = empName;
          activeDailySubtab = "harian";
          renderDailyView();
        };
      });
    }

    // -------------------------------------------------------------
    // MODAL: INPUT / EDIT PENILAIAN HARIAN
    // -------------------------------------------------------------
    async function openFormPenilaianHarianModal(existing = null) {
      const isEdit = !!existing;
      let selectedEmp = isEdit 
        ? (visibleEmployees.find(e => e.nama_karyawan === existing.nama_karyawan) || { nama_karyawan: existing.nama_karyawan, nik_karyawan: existing.nik_karyawan, jabatan: existing.jabatan, cabang: existing.cabang, divisi: existing.divisi })
        : (visibleEmployees[0] || null);

      let currentKat = existing 
        ? (existing.kategori || "NON_SALES").toUpperCase() 
        : (selectedEmp && (selectedEmp.divisi || selectedEmp.jabatan || "").toLowerCase().includes("sales") ? "SALES" : "NON_SALES");

      const existingScores = existing?.indikator_skor || {};

      // Load initial indicators list for the employee
      let activeIndicators = [];
      if (isEdit && Array.isArray(existing?.indikator_list) && existing.indikator_list.length > 0) {
        activeIndicators = JSON.parse(JSON.stringify(existing.indikator_list));
      } else {
        const empKey = selectedEmp ? (selectedEmp.nama_karyawan || selectedEmp.nik_karyawan) : "";
        activeIndicators = await getEmployeeCustomIndicators(empKey, currentKat);
      }

      openModal({
        title: isEdit ? "Edit Catatan Penilaian Harian" : "Input Penilaian Kinerja Harian Karyawan",
        size: "xl",
        bodyHtml: `
          <form id="form-penilaian-harian" class="space-y-4 text-left">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Karyawan <span class="text-rose-500">*</span></label>
                <select id="ph-karyawan-select" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-800 bg-white" required ${isEdit ? 'disabled' : ''}>
                  ${visibleEmployees.map(e => `
                    <option value="${escapeHtml(e.nama_karyawan)}" data-nik="${escapeHtml(e.nik_karyawan || '')}" data-jabatan="${escapeHtml(e.jabatan || '')}" data-cabang="${escapeHtml(e.cabang || '')}" data-divisi="${escapeHtml(e.divisi || '')}" ${selectedEmp && selectedEmp.nama_karyawan === e.nama_karyawan ? 'selected' : ''}>
                      ${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || "-")})
                    </option>
                  `).join("")}
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Penilaian <span class="text-rose-500">*</span></label>
                <input type="date" id="ph-tanggal" value="${existing?.tanggal ? existing.tanggal.slice(0, 10) : new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-800 bg-white" required>
              </div>
            </div>

            <!-- Kategori / Template Selector -->
            <div class="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
              <button type="button" id="ph-tab-sales" class="flex-1 py-1.5 text-xs font-bold rounded-lg transition ${currentKat === 'SALES' ? 'bg-white text-maroon-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}">
                💼 Divisi Sales (Indikator Lampiran 1)
              </button>
              <button type="button" id="ph-tab-non-sales" class="flex-1 py-1.5 text-xs font-bold rounded-lg transition ${currentKat === 'NON_SALES' ? 'bg-white text-maroon-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}">
                🏢 Divisi Non-Sales (Operasional & Staff)
              </button>
            </div>

            <!-- Custom Indicator Control Bar & Container -->
            <div class="space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div class="flex items-center gap-2 flex-wrap">
                  <span id="ph-count-badge" class="px-2.5 py-1 bg-maroon-50 text-maroon-700 border border-maroon-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                    <span>📋</span> ${activeIndicators.length} Poin Indikator
                  </span>
                  <span class="text-[11px] text-slate-500 font-medium">HRD dapat menambah, merubah nama, atau menghapus indikator di bawah.</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" id="btn-add-custom-ind" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-2xs">
                    <span>+</span> Tambah Indikator Baru
                  </button>
                  <button type="button" id="btn-reset-ind-default" class="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-800 text-xs font-bold rounded-lg border border-slate-200 transition flex items-center gap-1" title="Kembalikan susunan indikator standar">
                    <span>🔄</span> Reset Bawaan
                  </button>
                </div>
              </div>

              <!-- Indicators Form Cards List -->
              <div id="ph-indicators-container" class="space-y-2.5"></div>

              <!-- Option to Save Custom Indicators as Default for this employee -->
              <div class="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80">
                <label class="flex items-start sm:items-center gap-2 cursor-pointer text-xs font-bold text-amber-900 select-none">
                  <input type="checkbox" id="ph-save-as-default" class="mt-0.5 sm:mt-0 w-4 h-4 text-maroon-700 rounded border-amber-300 focus:ring-maroon-500" checked>
                  <span>💾 Simpan penyesuaian poin indikator ini sebagai standar bawaan (default template) khusus untuk <strong id="ph-lbl-emp-name">${escapeHtml(selectedEmp?.nama_karyawan || "Karyawan Ini")}</strong></span>
                </label>
              </div>
            </div>

            <!-- Realtime Score Banner -->
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span class="text-xs font-bold text-slate-500 block">Akumulasi Skor Harian:</span>
                <div class="flex items-center gap-2 mt-0.5">
                  <span id="ph-live-score" class="text-2xl font-black text-maroon-700">0.00</span>
                  <span class="text-xs text-slate-400 font-bold">/ 100</span>
                </div>
              </div>
              <div class="text-right">
                <span class="text-[10.5px] font-bold text-slate-400 block uppercase tracking-wider">Predikat:</span>
                <span id="ph-live-predikat" class="inline-block mt-0.5 text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-600 border border-slate-300">Belum Diisi</span>
              </div>
            </div>

            <!-- Qualitative Remarks -->
            <div class="p-3.5 bg-slate-50/60 rounded-xl border border-slate-200 space-y-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">Catatan & Ulasan Evaluator</h4>
              <div>
                <label class="block text-[11px] font-bold text-emerald-800 mb-1">🌟 Hal-Hal yang Sudah Baik (Kelebihan / Prestasi Hari Ini):</label>
                <textarea id="ph-catatan-baik" rows="2" class="w-full px-3 py-2 text-xs border border-emerald-200 bg-white rounded-lg outline-none focus:border-emerald-500 font-medium focus:ring-1 focus:ring-emerald-200" placeholder="Pencapaian target, ketepatan waktu, inisiatif yang baik...">${escapeHtml(existing?.catatan_baik || '')}</textarea>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-rose-800 mb-1">🎯 Hal yang Perlu Diperbaiki (Kendala / Area Peningkatan):</label>
                <textarea id="ph-catatan-perbaikan" rows="2" class="w-full px-3 py-2 text-xs border border-rose-200 bg-white rounded-lg outline-none focus:border-rose-500 font-medium focus:ring-1 focus:ring-rose-200" placeholder="Kendala operasional, area yang perlu diperbaiki...">${escapeHtml(existing?.catatan_perbaikan || '')}</textarea>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">📝 Catatan Tambahan Penilai:</label>
                <textarea id="ph-catatan-harian" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-lg outline-none focus:border-maroon-400 font-medium focus:ring-1 focus:ring-maroon-200" placeholder="Catatan harian lainnya...">${escapeHtml(existing?.catatan_harian || '')}</textarea>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Nama Penilai / Evaluator</label>
                <input type="text" id="ph-penilai" value="${escapeHtml(existing?.penilai || session.nama || '')}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold bg-slate-50" readonly>
              </div>
            </div>
          </form>
        `,
        footerHtml: `
          <div class="flex items-center justify-end gap-2 w-full">
            <button type="button" id="btn-ph-batal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Batal</button>
            <button type="button" id="btn-ph-simpan" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5">
              <span>✓</span> ${isEdit ? 'Simpan Perubahan' : 'Simpan Penilaian Harian'}
            </button>
          </div>
        `,
        onMount: (m) => {
          const containerIndicators = m.querySelector("#ph-indicators-container");
          const tabNonSales = m.querySelector("#ph-tab-non-sales");
          const tabSales = m.querySelector("#ph-tab-sales");
          const liveScore = m.querySelector("#ph-live-score");
          const livePredikat = m.querySelector("#ph-live-predikat");
          const countBadge = m.querySelector("#ph-count-badge");
          const lblEmpName = m.querySelector("#ph-lbl-emp-name");
          const btnAddCustom = m.querySelector("#btn-add-custom-ind");
          const btnResetDefault = m.querySelector("#btn-reset-ind-default");
          const empSelect = m.querySelector("#ph-karyawan-select");

          // Keep current entered scores preserved during UI re-renders
          const currentScores = { ...existingScores };

          function readFormScores() {
            containerIndicators.querySelectorAll(".ph-score-input").forEach(inp => {
              const k = inp.dataset.indKey;
              if (k) {
                const valStr = inp.value.trim();
                if (valStr !== "") {
                  currentScores[k] = Math.min(100, Math.max(0, parseFloat(valStr) || 0));
                }
              }
            });
          }

          function renderIndicators() {
            readFormScores();

            if (countBadge) {
              countBadge.innerHTML = `<span>📋</span> ${activeIndicators.length} Poin Indikator`;
            }

            if (activeIndicators.length === 0) {
              containerIndicators.innerHTML = `
                <div class="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2">
                  <p class="text-xs font-bold text-slate-500">Belum ada poin indikator untuk penilaian ini.</p>
                  <button type="button" id="btn-empty-add-ind" class="px-3 py-1.5 bg-maroon-700 text-white text-xs font-bold rounded-lg transition hover:bg-maroon-800">
                    + Tambah Indikator Sekarang
                  </button>
                </div>
              `;
              const btnEmptyAdd = containerIndicators.querySelector("#btn-empty-add-ind");
              if (btnEmptyAdd) {
                btnEmptyAdd.onclick = () => {
                  addNewIndicator();
                };
              }
              updateScoreLive();
              return;
            }

            containerIndicators.innerHTML = `
              <div class="space-y-2.5">
                ${activeIndicators.map((ind, idx) => {
                  const savedVal = currentScores[ind.key] !== undefined ? currentScores[ind.key] : "";
                  const isEditingThis = !!ind._isEditing;

                  if (isEditingThis) {
                    return `
                      <div class="p-3.5 bg-amber-50/90 rounded-xl border border-amber-300 shadow-xs space-y-3 text-left transition">
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-black text-amber-900 flex items-center gap-1.5">
                            <span class="w-5 h-5 rounded-md bg-amber-600 text-white text-[11px] flex items-center justify-center">${idx + 1}</span>
                            ✏️ Edit Pengaturan Indikator #${idx + 1}
                          </span>
                          <button type="button" data-done-edit="${ind.key}" class="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs">
                            ✓ Selesai Ubah
                          </button>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label class="block text-[11px] font-bold text-slate-700 mb-1">Aspek / Kategori</label>
                            <input type="text" data-edit-field="aspek" data-key="${ind.key}" value="${escapeHtml(ind.aspek || '')}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-amber-300 rounded-lg outline-none focus:border-amber-600 bg-white" placeholder="Contoh: SOP & Ketepatan Kerja">
                          </div>
                          <div>
                            <label class="block text-[11px] font-bold text-slate-700 mb-1">Nama Indikator Penilaian</label>
                            <input type="text" data-edit-field="indikator" data-key="${ind.key}" value="${escapeHtml(ind.indikator || '')}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-amber-300 rounded-lg outline-none focus:border-amber-600 bg-white" placeholder="Contoh: Target Kinerja Harian">
                          </div>
                          <div>
                            <label class="block text-[11px] font-bold text-slate-700 mb-1">Satuan / Parameter (Opsional)</label>
                            <input type="text" data-edit-field="unit" data-key="${ind.key}" value="${escapeHtml(ind.unit || '')}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-amber-300 rounded-lg outline-none focus:border-amber-600 bg-white" placeholder="Contoh: % Capaian / Ton / Rp / Toko">
                          </div>
                        </div>
                      </div>
                    `;
                  }

                  return `
                    <div class="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 space-y-2 text-left transition">
                      <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="w-5 h-5 rounded-md bg-maroon-700 text-white font-black text-[11px] flex items-center justify-center shrink-0">${idx + 1}</span>
                          <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10.5px] font-bold uppercase">
                            ${escapeHtml(ind.principle ? ind.principle + ' • ' : '')}${escapeHtml(ind.aspek || 'Kinerja')}
                          </span>
                          ${ind.unit ? `<span class="text-[10.5px] font-semibold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">${escapeHtml(ind.unit)}</span>` : ''}
                        </div>
                        <div class="flex items-center gap-1">
                          <button type="button" data-toggle-edit="${ind.key}" class="px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition flex items-center gap-1" title="Ubah nama indikator atau aspek">
                            <span>✏️</span> Edit
                          </button>
                          <button type="button" data-delete-ind="${ind.key}" class="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition" title="Hapus indikator ini untuk penilaian karyawan ini">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </div>

                      <p class="text-xs font-bold text-slate-800">${escapeHtml(ind.indikator || '-')}</p>

                      <div class="pt-1.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="flex items-center gap-1 flex-wrap">
                          <span class="text-[10px] text-slate-400 font-medium mr-1">Skor Cepat:</span>
                          <button type="button" class="btn-ph-quick px-2 py-0.5 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded border border-slate-200 text-[11px] font-bold" data-key="${ind.key}" data-val="100">100</button>
                          <button type="button" class="btn-ph-quick px-2 py-0.5 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded border border-slate-200 text-[11px] font-bold" data-key="${ind.key}" data-val="90">90</button>
                          <button type="button" class="btn-ph-quick px-2 py-0.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded border border-slate-200 text-[11px] font-bold" data-key="${ind.key}" data-val="80">80</button>
                          <button type="button" class="btn-ph-quick px-2 py-0.5 bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-700 rounded border border-slate-200 text-[11px] font-bold" data-key="${ind.key}" data-val="70">70</button>
                          <button type="button" class="btn-ph-quick px-2 py-0.5 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded border border-slate-200 text-[11px] font-bold" data-key="${ind.key}" data-val="60">60</button>
                        </div>
                        <div class="relative w-28">
                          <input type="number" data-ind-key="${ind.key}" value="${savedVal}" min="0" max="100" class="ph-score-input w-full pl-2.5 pr-8 py-1 text-xs font-bold text-slate-800 border border-slate-200 rounded-lg outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white text-right" placeholder="0" required>
                          <span class="absolute right-2 top-1 text-slate-400 text-[10px]">/ 100</span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `;

            // Bind quick buttons
            containerIndicators.querySelectorAll(".btn-ph-quick").forEach(btn => {
              btn.onclick = () => {
                const k = btn.dataset.key;
                const v = btn.dataset.val;
                currentScores[k] = parseFloat(v);
                const inp = containerIndicators.querySelector(`.ph-score-input[data-ind-key="${k}"]`);
                if (inp) inp.value = v;
                updateScoreLive();
              };
            });

            // Bind inline editing toggle
            containerIndicators.querySelectorAll("[data-toggle-edit]").forEach(btn => {
              btn.onclick = () => {
                const k = btn.dataset.toggleEdit;
                const targetInd = activeIndicators.find(x => x.key === k);
                if (targetInd) {
                  targetInd._isEditing = true;
                  renderIndicators();
                }
              };
            });

            // Bind finish inline edit
            containerIndicators.querySelectorAll("[data-done-edit]").forEach(btn => {
              btn.onclick = () => {
                const k = btn.dataset.doneEdit;
                const targetInd = activeIndicators.find(x => x.key === k);
                if (targetInd) {
                  const inpAspek = containerIndicators.querySelector(`input[data-edit-field="aspek"][data-key="${k}"]`);
                  const inpInd = containerIndicators.querySelector(`input[data-edit-field="indikator"][data-key="${k}"]`);
                  const inpUnit = containerIndicators.querySelector(`input[data-edit-field="unit"][data-key="${k}"]`);

                  if (inpAspek && inpAspek.value.trim()) targetInd.aspek = inpAspek.value.trim();
                  if (inpInd && inpInd.value.trim()) targetInd.indikator = inpInd.value.trim();
                  if (inpUnit) targetInd.unit = inpUnit.value.trim();

                  targetInd._isEditing = false;
                  renderIndicators();
                }
              };
            });

            // Bind delete indicator
            containerIndicators.querySelectorAll("[data-delete-ind]").forEach(btn => {
              btn.onclick = () => {
                const k = btn.dataset.deleteInd;
                activeIndicators = activeIndicators.filter(x => x.key !== k);
                delete currentScores[k];
                renderIndicators();
              };
            });

            containerIndicators.querySelectorAll(".ph-score-input").forEach(inp => {
              inp.oninput = () => {
                const k = inp.dataset.indKey;
                const valStr = inp.value.trim();
                if (valStr !== "") currentScores[k] = Math.min(100, Math.max(0, parseFloat(valStr) || 0));
                else delete currentScores[k];
                updateScoreLive();
              };
            });

            updateScoreLive();
          }

          function addNewIndicator() {
            readFormScores();
            const newKey = "cust_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            activeIndicators.push({
              key: newKey,
              principle: currentKat === "SALES" ? "SALES" : "OPERASIONAL",
              aspek: currentKat === "SALES" ? "Sales Volume & Penjualan" : "SOP & Target Kerja",
              indikator: "Indikator Penilaian Baru #" + (activeIndicators.length + 1),
              unit: "% Capaian",
              defaultTarget: 100,
              _isEditing: true
            });
            renderIndicators();
            toast("Indikator baru berhasil ditambahkan! Silakan ubah nama dan aspeknya.", "info");
          }

          function updateScoreLive() {
            let total = 0;
            let count = 0;
            containerIndicators.querySelectorAll(".ph-score-input").forEach(inp => {
              const valStr = inp.value.trim();
              if (valStr !== "") {
                const val = Math.min(100, Math.max(0, parseFloat(valStr) || 0));
                total += val;
                count++;
              }
            });

            const avg = count > 0 ? (total / count) : 0;
            const avgRounded = Math.round(avg * 100) / 100;
            liveScore.textContent = avgRounded.toFixed(2);

            if (count === 0) {
              livePredikat.className = "inline-block mt-0.5 text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-600 border border-slate-300";
              livePredikat.textContent = "Belum Diisi";
            } else if (avgRounded >= 85) {
              livePredikat.className = "inline-block mt-0.5 text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300";
              livePredikat.textContent = "Sangat Baik (A)";
            } else if (avgRounded >= 70) {
              livePredikat.className = "inline-block mt-0.5 text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300";
              livePredikat.textContent = "Baik (B)";
            } else if (avgRounded >= 55) {
              livePredikat.className = "inline-block mt-0.5 text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300";
              livePredikat.textContent = "Cukup (C)";
            } else {
              livePredikat.className = "inline-block mt-0.5 text-xs font-bold px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300";
              livePredikat.textContent = "Kurang (D)";
            }
          }

          if (btnAddCustom) {
            btnAddCustom.onclick = addNewIndicator;
          }

          if (btnResetDefault) {
            btnResetDefault.onclick = () => {
              activeIndicators = currentKat === "SALES" 
                ? JSON.parse(JSON.stringify(SALES_LAMPIRAN1_INDICATORS))
                : JSON.parse(JSON.stringify(NON_SALES_INDICATORS));
              renderIndicators();
              toast(`Indikator berhasil direset ke format standar ${currentKat === 'SALES' ? 'Sales Lampiran 1' : 'Non-Sales'}!`, "info");
            };
          }

          tabNonSales.onclick = async () => {
            currentKat = "NON_SALES";
            tabNonSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition bg-white text-maroon-700 shadow-xs";
            tabSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-800";
            const selOpt = empSelect ? empSelect.options[empSelect.selectedIndex] : null;
            const empKey = selOpt ? selOpt.value : "";
            activeIndicators = await getEmployeeCustomIndicators(empKey, "NON_SALES");
            renderIndicators();
          };

          tabSales.onclick = async () => {
            currentKat = "SALES";
            tabSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition bg-white text-maroon-700 shadow-xs";
            tabNonSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-800";
            const selOpt = empSelect ? empSelect.options[empSelect.selectedIndex] : null;
            const empKey = selOpt ? selOpt.value : "";
            activeIndicators = await getEmployeeCustomIndicators(empKey, "SALES");
            renderIndicators();
          };

          if (empSelect) {
            empSelect.onchange = async () => {
              const selOpt = empSelect.options[empSelect.selectedIndex];
              const empName = selOpt ? selOpt.value : "";
              if (lblEmpName) lblEmpName.textContent = empName || "Karyawan Ini";

              const eDiv = (selOpt.dataset.divisi || selOpt.dataset.jabatan || "").toLowerCase();
              if (eDiv.includes("sales")) {
                currentKat = "SALES";
                tabSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition bg-white text-maroon-700 shadow-xs";
                tabNonSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-800";
              } else {
                currentKat = "NON_SALES";
                tabNonSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition bg-white text-maroon-700 shadow-xs";
                tabSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-800";
              }

              activeIndicators = await getEmployeeCustomIndicators(empName || selOpt?.dataset?.nik, currentKat);
              renderIndicators();
            };
          }

          renderIndicators();

          m.querySelector("#btn-ph-batal").onclick = closeModal;

          m.querySelector("#btn-ph-simpan").onclick = async () => {
            const form = m.querySelector("#form-penilaian-harian");
            if (!form.reportValidity()) return;

            readFormScores();

            // Save any active inline editing indicator
            activeIndicators.forEach(ind => {
              if (ind._isEditing) {
                const inpAspek = containerIndicators.querySelector(`input[data-edit-field="aspek"][data-key="${ind.key}"]`);
                const inpInd = containerIndicators.querySelector(`input[data-edit-field="indikator"][data-key="${ind.key}"]`);
                const inpUnit = containerIndicators.querySelector(`input[data-edit-field="unit"][data-key="${ind.key}"]`);
                if (inpAspek && inpAspek.value.trim()) ind.aspek = inpAspek.value.trim();
                if (inpInd && inpInd.value.trim()) ind.indikator = inpInd.value.trim();
                if (inpUnit) ind.unit = inpUnit.value.trim();
                delete ind._isEditing;
              }
            });

            if (activeIndicators.length === 0) {
              toast("Minimal harus ada 1 poin indikator penilaian!", "error");
              return;
            }

            const selOpt = empSelect ? empSelect.options[empSelect.selectedIndex] : null;
            const namaKaryawan = isEdit ? existing.nama_karyawan : (selOpt ? selOpt.value : "");
            const nikKaryawan = isEdit ? (existing.nik_karyawan || "") : (selOpt?.dataset?.nik || "");
            const jabatan = isEdit ? (existing.jabatan || "") : (selOpt?.dataset?.jabatan || "");
            const cabang = isEdit ? (existing.cabang || "") : (selOpt?.dataset?.cabang || "");
            const divisi = isEdit ? (existing.divisi || "") : (selOpt?.dataset?.divisi || "");

            const tglVal = m.querySelector("#ph-tanggal").value;
            const catatanBaik = m.querySelector("#ph-catatan-baik")?.value.trim() || "";
            const catatanPerbaikan = m.querySelector("#ph-catatan-perbaikan")?.value.trim() || "";
            const catatanHarian = m.querySelector("#ph-catatan-harian")?.value.trim() || "";
            const penilai = m.querySelector("#ph-penilai")?.value.trim() || session.nama || "HRD";
            const saveAsDefault = m.querySelector("#ph-save-as-default")?.checked || false;

            const indikatorSkorMap = {};
            let totalSc = 0;
            let countSc = 0;

            activeIndicators.forEach(ind => {
              const sc = currentScores[ind.key] !== undefined ? currentScores[ind.key] : 0;
              indikatorSkorMap[ind.key] = sc;
              totalSc += sc;
              countSc++;
            });

            const finalAvg = countSc > 0 ? Math.round((totalSc / countSc) * 100) / 100 : 0;
            const predikat = finalAvg >= 85 ? "Sangat Baik" : finalAvg >= 70 ? "Baik" : finalAvg >= 55 ? "Cukup" : "Kurang";

            const cleanedIndicatorsList = activeIndicators.map(i => ({
              key: i.key,
              principle: i.principle || (currentKat === "SALES" ? "SALES" : "OPERASIONAL"),
              aspek: i.aspek || "Kinerja",
              indikator: i.indikator || "Indikator Penilaian",
              unit: i.unit || "",
              defaultTarget: i.defaultTarget || 100
            }));

            const ringkasanIndikator = currentKat === "SALES" 
              ? `Sales Lampiran 1 (${countSc} Poin Indikator)`
              : `Operasional & SOP (${countSc} Poin Indikator)`;

            const payload = {
              nama_karyawan: namaKaryawan,
              nik_karyawan: nikKaryawan,
              jabatan: jabatan,
              cabang: cabang,
              divisi: divisi,
              tanggal: tglVal,
              kategori: currentKat,
              indikator_list: cleanedIndicatorsList,
              indikator_skor: indikatorSkorMap,
              total_skor: finalAvg,
              predikat: predikat,
              ringkasan_indikator: ringkasanIndikator,
              catatan_baik: catatanBaik,
              catatan_perbaikan: catatanPerbaikan,
              catatan_harian: catatanHarian,
              penilai: penilai,
              updated_at: new Date().toISOString()
            };

            const btnSave = m.querySelector("#btn-ph-simpan");
            btnSave.disabled = true;
            btnSave.textContent = "Menyimpan...";

            try {
              if (saveAsDefault) {
                await saveEmployeeCustomIndicators(namaKaryawan || nikKaryawan, cleanedIndicatorsList);
              }

              if (isEdit) {
                await fsUpdate(COL.LOG_PENILAIAN_HARIAN, existing.id, payload);
                const idx = allLogs.findIndex(x => x.id === existing.id);
                if (idx >= 0) allLogs[idx] = { ...existing, ...payload };
                toast("Catatan penilaian harian berhasil diperbarui!", "success");
              } else {
                payload.created_at = new Date().toISOString();
                const newId = genId("LOG-HRN");
                await fsAdd(COL.LOG_PENILAIAN_HARIAN, payload, newId);
                allLogs.unshift({ id: newId, ...payload });
                toast("Penilaian harian berhasil disimpan!", "success");
              }
              closeModal();
              renderDailyView();
            } catch (err) {
              toast("Gagal menyimpan: " + err.message, "error");
              btnSave.disabled = false;
              btnSave.textContent = "Simpan Penilaian Harian";
            }
          };
        }
      });
    }

    // -------------------------------------------------------------
    // MODAL: SET / EDIT TARGET BULANAN KPI
    // -------------------------------------------------------------
    function openFormTargetBulananModal(existing = null) {
      const isEdit = !!existing;
      let selectedEmp = isEdit ? visibleEmployees.find(e => e.nama_karyawan === existing.nama_karyawan) || { nama_karyawan: existing.nama_karyawan, nik_karyawan: existing.nik_karyawan, jabatan: existing.jabatan, cabang: existing.cabang, divisi: existing.divisi } : (visibleEmployees[0] || null);

      let currentKat = existing ? (existing.kategori || "SALES").toUpperCase() : (selectedEmp && (selectedEmp.divisi || selectedEmp.jabatan || "").toLowerCase().includes("sales") ? "SALES" : "NON_SALES");

      openModal({
        title: isEdit ? "Edit Target Bulanan KPI Karyawan" : "Tetapkan Target Bulanan KPI Karyawan",
        size: "lg",
        bodyHtml: `
          <form id="form-target-bulanan" class="space-y-4 text-left">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div class="md:col-span-2">
                <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Karyawan <span class="text-rose-500">*</span></label>
                <select id="tb-karyawan-select" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-800 bg-white" required ${isEdit ? 'disabled' : ''}>
                  ${visibleEmployees.map(e => `
                    <option value="${escapeHtml(e.nama_karyawan)}" data-nik="${escapeHtml(e.nik_karyawan || '')}" data-jabatan="${escapeHtml(e.jabatan || '')}" data-cabang="${escapeHtml(e.cabang || '')}" data-divisi="${escapeHtml(e.divisi || '')}" ${selectedEmp && selectedEmp.nama_karyawan === e.nama_karyawan ? 'selected' : ''}>
                      ${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || "-")})
                    </option>
                  `).join("")}
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Periode Target <span class="text-rose-500">*</span></label>
                <input type="month" id="tb-periode" value="${existing?.periode || currentYearMonth}" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-bold text-slate-800 bg-white" required>
              </div>
            </div>

            <!-- Kategori Selector -->
            <div class="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
              <button type="button" id="tb-tab-sales" class="flex-1 py-1.5 text-xs font-bold rounded-lg transition ${currentKat === 'SALES' ? 'bg-white text-maroon-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}">
                💼 Target Sales (Lampiran 1)
              </button>
              <button type="button" id="tb-tab-non-sales" class="flex-1 py-1.5 text-xs font-bold rounded-lg transition ${currentKat === 'NON_SALES' ? 'bg-white text-maroon-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}">
                🏢 Target Non-Sales / Operasional
              </button>
            </div>

            <!-- Dynamic Form Target -->
            <div id="tb-target-container" class="space-y-3"></div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Catatan & Sasaran Strategis Bulanan (Opsional)</label>
              <textarea id="tb-catatan-target" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-lg outline-none focus:border-maroon-400 font-medium focus:ring-1 focus:ring-maroon-200" placeholder="Prioritas target, fokus cabang/toko, atau arahan khusus...">${escapeHtml(existing?.catatan_target || '')}</textarea>
            </div>
          </form>
        `,
        footerHtml: `
          <div class="flex items-center justify-end gap-2 w-full">
            <button type="button" id="btn-tb-batal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Batal</button>
            <button type="button" id="btn-tb-simpan" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5">
              <span>✓</span> ${isEdit ? 'Simpan Perubahan' : 'Tetapkan Target Bulanan'}
            </button>
          </div>
        `,
        onMount: (m) => {
          const container = m.querySelector("#tb-target-container");
          const tabSales = m.querySelector("#tb-tab-sales");
          const tabNonSales = m.querySelector("#tb-tab-non-sales");

          function renderTargetForm() {
            if (currentKat === "SALES") {
              container.innerHTML = `
                <div class="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">Target Volume Penjualan ICI (Ton / Liter / Kaleng)</h4>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Dulux</label>
                      <input type="number" step="any" id="tgt-vol-dulux" value="${existing?.target_volume_dulux || 10}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Catylac</label>
                      <input type="number" step="any" id="tgt-vol-catylac" value="${existing?.target_volume_catylac || 15}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Maxilite</label>
                      <input type="number" step="any" id="tgt-vol-maxilite" value="${existing?.target_volume_maxilite || 10}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Aquashield</label>
                      <input type="number" step="any" id="tgt-vol-aquashield" value="${existing?.target_volume_aquashield || 5}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                  </div>

                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2 pt-2">Target Value Penjualan & Piutang</h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Value Penjualan Tertagih (Rp)</label>
                      <input type="number" step="1000" id="tgt-val-penjualan" value="${existing?.target_value_penjualan || 100000000}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Batas Maksimal Overdue Piutang (Rp)</label>
                      <input type="number" step="1000" id="tgt-overdue" value="${existing?.target_overdue_piutang || 20000000}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                  </div>

                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2 pt-2">Target Active Outlet (AO Toko Aktif)</h4>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">AO ICI (Toko)</label>
                      <input type="number" id="tgt-ao-ici" value="${existing?.target_ao_ici || 25}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">AO PRIMA (Toko)</label>
                      <input type="number" id="tgt-ao-prima" value="${existing?.target_ao_prima || 15}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">AO DCOTA (Toko)</label>
                      <input type="number" id="tgt-ao-dcota" value="${existing?.target_ao_dcota || 15}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                  </div>
                </div>
              `;
            } else {
              container.innerHTML = `
                <div class="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">Target Capaian Operasional / Support (%)</h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Target Penyelesaian SOP & Tugas (%)</label>
                      <input type="number" min="0" max="100" id="tgt-sop" value="${existing?.target_sop_tugas || 100}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Target SLA Respon & Pelayanan (%)</label>
                      <input type="number" min="0" max="100" id="tgt-respon" value="${existing?.target_respon_divisi || 100}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Target Kedisiplinan & Absensi (%)</label>
                      <input type="number" min="0" max="100" id="tgt-disiplin" value="${existing?.target_kedisiplinan || 100}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                    <div>
                      <label class="block text-[11px] font-bold text-slate-600 mb-1">Target Inisiatif & Teamwork (%)</label>
                      <input type="number" min="0" max="100" id="tgt-inisiatif" value="${existing?.target_inisiatif_team || 100}" class="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:border-maroon-500">
                    </div>
                  </div>
                </div>
              `;
            }
          }

          tabSales.onclick = () => {
            currentKat = "SALES";
            tabSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition bg-white text-maroon-700 shadow-xs";
            tabNonSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-800";
            renderTargetForm();
          };

          tabNonSales.onclick = () => {
            currentKat = "NON_SALES";
            tabNonSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition bg-white text-maroon-700 shadow-xs";
            tabSales.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition text-slate-500 hover:text-slate-800";
            renderTargetForm();
          };

          renderTargetForm();

          m.querySelector("#btn-tb-batal").onclick = closeModal;

          m.querySelector("#btn-tb-simpan").onclick = async () => {
            const form = m.querySelector("#form-target-bulanan");
            if (!form.reportValidity()) return;

            const empSelect = m.querySelector("#tb-karyawan-select");
            const selOpt = empSelect ? empSelect.options[empSelect.selectedIndex] : null;
            const namaKaryawan = isEdit ? existing.nama_karyawan : (selOpt ? selOpt.value : "");
            const nikKaryawan = isEdit ? (existing.nik_karyawan || "") : (selOpt?.dataset?.nik || "");
            const jabatan = isEdit ? (existing.jabatan || "") : (selOpt?.dataset?.jabatan || "");
            const cabang = isEdit ? (existing.cabang || "") : (selOpt?.dataset?.cabang || "");
            const divisi = isEdit ? (existing.divisi || "") : (selOpt?.dataset?.divisi || "");

            const periode = m.querySelector("#tb-periode").value;
            const catatanTarget = m.querySelector("#tb-catatan-target")?.value.trim() || "";

            const payload = {
              nama_karyawan: namaKaryawan,
              nik_karyawan: nikKaryawan,
              jabatan: jabatan,
              cabang: cabang,
              divisi: divisi,
              periode: periode,
              kategori: currentKat,
              catatan_target: catatanTarget,
              ditetapkan_oleh: session.nama || "HRD",
              updated_at: new Date().toISOString()
            };

            if (currentKat === "SALES") {
              payload.target_volume_dulux = parseFloat(m.querySelector("#tgt-vol-dulux")?.value) || 0;
              payload.target_volume_catylac = parseFloat(m.querySelector("#tgt-vol-catylac")?.value) || 0;
              payload.target_volume_maxilite = parseFloat(m.querySelector("#tgt-vol-maxilite")?.value) || 0;
              payload.target_volume_aquashield = parseFloat(m.querySelector("#tgt-vol-aquashield")?.value) || 0;
              payload.target_value_penjualan = parseFloat(m.querySelector("#tgt-val-penjualan")?.value) || 0;
              payload.target_overdue_piutang = parseFloat(m.querySelector("#tgt-overdue")?.value) || 0;
              payload.target_ao_ici = parseFloat(m.querySelector("#tgt-ao-ici")?.value) || 0;
              payload.target_ao_prima = parseFloat(m.querySelector("#tgt-ao-prima")?.value) || 0;
              payload.target_ao_dcota = parseFloat(m.querySelector("#tgt-ao-dcota")?.value) || 0;
            } else {
              payload.target_sop_tugas = parseFloat(m.querySelector("#tgt-sop")?.value) || 100;
              payload.target_respon_divisi = parseFloat(m.querySelector("#tgt-respon")?.value) || 100;
              payload.target_kedisiplinan = parseFloat(m.querySelector("#tgt-disiplin")?.value) || 100;
              payload.target_inisiatif_team = parseFloat(m.querySelector("#tgt-inisiatif")?.value) || 100;
            }

            const btnSave = m.querySelector("#btn-tb-simpan");
            btnSave.disabled = true;
            btnSave.textContent = "Menyimpan...";

            try {
              if (isEdit) {
                await fsUpdate(COL.TARGET_BULANAN_KPI, existing.id, payload);
                const idx = allTargets.findIndex(x => x.id === existing.id);
                if (idx >= 0) allTargets[idx] = { ...existing, ...payload };
                toast("Target bulanan KPI berhasil diperbarui!", "success");
              } else {
                payload.created_at = new Date().toISOString();
                const newId = genId("TGT-KPI");
                await fsAdd(COL.TARGET_BULANAN_KPI, payload, newId);
                allTargets.unshift({ id: newId, ...payload });
                toast("Target bulanan KPI berhasil ditetapkan!", "success");
              }
              closeModal();
              renderDailyView();
            } catch (err) {
              toast("Gagal menyimpan target: " + err.message, "error");
              btnSave.disabled = false;
              btnSave.textContent = "Tetapkan Target Bulanan";
            }
          };
        }
      });
    }

    // -------------------------------------------------------------
    // MODAL: DETAIL LOG HARIAN
    // -------------------------------------------------------------
    function openDetailDailyLogModal(log) {
      const isSales = (log.kategori || "").toUpperCase() === "SALES";
      const scores = log.indikator_skor || {};

      // Dynamic indicator list from log or fallback to default
      const indList = Array.isArray(log.indikator_list) && log.indikator_list.length > 0
        ? log.indikator_list
        : (isSales ? SALES_LAMPIRAN1_INDICATORS : NON_SALES_INDICATORS);

      const detailListHtml = indList.map(ind => {
        const val = scores[ind.key] !== undefined ? scores[ind.key] : "-";
        return `
          <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <div class="space-y-0.5">
              <div class="text-[10px] font-bold text-maroon-700 uppercase">
                ${escapeHtml(ind.principle ? ind.principle + " • " : "")}${escapeHtml(ind.aspek || "Kinerja")}
              </div>
              <div class="text-xs font-semibold text-slate-800">${escapeHtml(ind.indikator || "-")}</div>
              ${ind.unit ? `<div class="text-[10px] text-slate-400 font-medium">Parameter: ${escapeHtml(ind.unit)}</div>` : ''}
            </div>
            <div class="text-right">
              <span class="text-sm font-black text-slate-800">${val}</span>
              <span class="text-[10px] text-slate-400">/ 100</span>
            </div>
          </div>
        `;
      }).join("");

      openModal({
        title: "Rincian Log Penilaian Kinerja Harian",
        size: "md",
        bodyHtml: `
          <div class="space-y-4 text-left">
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-sm font-black text-slate-800">${escapeHtml(log.nama_karyawan)}</h4>
                  <p class="text-xs text-slate-500 font-medium">${escapeHtml(log.jabatan || "-")} (${escapeHtml(log.cabang || "Pusat")})</p>
                </div>
                <span class="px-2 py-0.5 rounded text-xs font-bold border ${isSales ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'}">
                  ${isSales ? 'SALES' : 'NON-SALES'}
                </span>
              </div>
              <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
                <div><span>Tanggal:</span> <strong>${fmtDateShort(log.tanggal)}</strong></div>
                <div><span>Penilai:</span> <strong>${escapeHtml(log.penilai || "-")}</strong></div>
              </div>
            </div>

            <!-- Skor Banner -->
            <div class="p-3 bg-maroon-50/50 rounded-xl border border-maroon-100 flex items-center justify-between">
              <div>
                <span class="text-xs text-maroon-900 font-bold block">Skor Akhir Harian</span>
                <span class="text-2xl font-black text-maroon-700">${parseFloat(log.total_skor || 0).toFixed(1)}</span>
              </div>
              <span class="px-3 py-1 rounded-lg text-xs font-bold bg-white text-maroon-800 border border-maroon-200 shadow-2xs">
                ${escapeHtml(log.predikat || "Selesai")}
              </span>
            </div>

            <!-- Indikator Breakdown -->
            <div class="space-y-2">
              <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500">Rincian Nilai Indikator</h5>
              <div class="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                ${detailListHtml}
              </div>
            </div>

            <!-- Catatan -->
            ${log.catatan_baik ? `
              <div class="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
                <span class="font-bold text-emerald-900 block">🌟 Kelebihan / Prestasi Hari Ini:</span>
                <p class="text-emerald-800 font-medium">${escapeHtml(log.catatan_baik)}</p>
              </div>
            ` : ''}

            ${log.catatan_perbaikan ? `
              <div class="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-xs space-y-1">
                <span class="font-bold text-rose-900 block">🎯 Area Perlu Peningkatan:</span>
                <p class="text-rose-800 font-medium">${escapeHtml(log.catatan_perbaikan)}</p>
              </div>
            ` : ''}

            ${log.catatan_harian ? `
              <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span class="font-bold text-slate-800 block">📝 Catatan Penilai:</span>
                <p class="text-slate-600 font-medium">${escapeHtml(log.catatan_harian)}</p>
              </div>
            ` : ''}
          </div>
        `,
        footerHtml: `
          <div class="flex justify-end w-full">
            <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Tutup</button>
          </div>
        `
      });
    }

    // -------------------------------------------------------------
    // MODAL: DETAIL TARGET BULANAN
    // -------------------------------------------------------------
    function openDetailTargetBulananModal(target) {
      const isSales = (target.kategori || "").toUpperCase() === "SALES";

      openModal({
        title: "Rincian Target Bulanan KPI",
        size: "md",
        bodyHtml: `
          <div class="space-y-4 text-left">
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-sm font-black text-slate-800">${escapeHtml(target.nama_karyawan)}</h4>
                  <p class="text-xs text-slate-500 font-medium">${escapeHtml(target.jabatan || "-")} (${escapeHtml(target.cabang || "Pusat")})</p>
                </div>
                <span class="px-2.5 py-1 rounded-md text-xs font-black bg-maroon-50 text-maroon-800 border border-maroon-200">
                  ${escapeHtml(target.periode)}
                </span>
              </div>
              <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
                <div><span>Kategori:</span> <strong>${isSales ? 'Sales (Lampiran 1)' : 'Non-Sales / Operasional'}</strong></div>
                <div><span>Ditetapkan:</span> <strong>${escapeHtml(target.ditetapkan_oleh || "-")}</strong></div>
              </div>
            </div>

            ${isSales ? `
              <div class="space-y-3">
                <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <h5 class="text-xs font-bold text-slate-700 uppercase">Target Volume Penjualan ICI</h5>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div>Dulux: <strong>${target.target_volume_dulux || 0} Ton</strong></div>
                    <div>Catylac: <strong>${target.target_volume_catylac || 0} Ton</strong></div>
                    <div>Maxilite: <strong>${target.target_volume_maxilite || 0} Ton</strong></div>
                    <div>Aquashield: <strong>${target.target_volume_aquashield || 0} Ton</strong></div>
                  </div>
                </div>

                <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <h5 class="text-xs font-bold text-slate-700 uppercase">Target Value & Piutang</h5>
                  <div class="space-y-1 text-xs">
                    <div>Value Penjualan Tertagih: <strong>Rp ${(parseFloat(target.target_value_penjualan) || 0).toLocaleString('id-ID')}</strong></div>
                    <div>Batas Max Overdue Piutang: <strong>Rp ${(parseFloat(target.target_overdue_piutang) || 0).toLocaleString('id-ID')}</strong></div>
                  </div>
                </div>

                <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <h5 class="text-xs font-bold text-slate-700 uppercase">Target Active Outlet (AO)</h5>
                  <div class="grid grid-cols-3 gap-2 text-xs">
                    <div>AO ICI: <strong>${target.target_ao_ici || 0} Toko</strong></div>
                    <div>AO PRIMA: <strong>${target.target_ao_prima || 0} Toko</strong></div>
                    <div>AO DCOTA: <strong>${target.target_ao_dcota || 0} Toko</strong></div>
                  </div>
                </div>
              </div>
            ` : `
              <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-3">
                <h5 class="text-xs font-bold text-slate-700 uppercase">Target Capaian Operasional</h5>
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div>Target SOP: <strong>${target.target_sop_tugas || 100}%</strong></div>
                  <div>Target Respon: <strong>${target.target_respon_divisi || 100}%</strong></div>
                  <div>Target Disiplin: <strong>${target.target_kedisiplinan || 100}%</strong></div>
                  <div>Target Inisiatif: <strong>${target.target_inisiatif_team || 100}%</strong></div>
                </div>
              </div>
            `}

            ${target.catatan_target ? `
              <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1">
                <span class="font-bold text-blue-900 block">📌 Arahan & Sasaran Strategis:</span>
                <p class="text-blue-800 font-medium">${escapeHtml(target.catatan_target)}</p>
              </div>
            ` : ''}
          </div>
        `,
        footerHtml: `
          <div class="flex justify-end w-full">
            <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">Tutup</button>
          </div>
        `
      });
    }

    renderDailyView();
  }

  function switchTab(tabKey) {
  Object.keys(panels).forEach(k => {
    if (panels[k]) {
      if (k === tabKey) panels[k].classList.remove("hidden");
      else panels[k].classList.add("hidden");
    }
  });

  container.querySelectorAll(".pk-tab").forEach(btn => {
    const ntab = btn.dataset.ntab;
    if (ntab === tabKey) {
      btn.className = "pk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap";
    } else {
      btn.className = "pk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap";
    }
  });

  if (tabKey === "kontrak" && !loaded.kontrak) { loaded.kontrak = true; loadKontrak(); }
  if (tabKey === "alur_perpanjangan" && !loaded.alur_perpanjangan) { loaded.alur_perpanjangan = true; loadAlurPerpanjangan(); }
  if (tabKey === "kpi360" && !loaded.kpi360) { loaded.kpi360 = true; loadKpi360(); }
  if (tabKey === "template" && !loaded.template) { loaded.template = true; loadTemplateKpi(); }
  if (tabKey === "grafik" && !loaded.grafik) { loaded.grafik = true; loadEmployeeGrafik(); }
  if (tabKey === "hasil" && !loaded.hasil) { loaded.hasil = true; loadHasilPenilaian(); }
  if (tabKey === "evaluasi" && !loaded.evaluasi) { loaded.evaluasi = true; loadEvaluasiKontrak(); }
  if (tabKey === "daily" && !loaded.daily) { loaded.daily = true; loadDailyTarget(); }
  }

  container.querySelectorAll(".pk-tab").forEach(btn => {
  btn.onclick = () => {
    const tab = btn.dataset.ntab;
    if (tab) switchTab(tab);
  };
  });

  if (isRegularEmployee) {
  switchTab("grafik");
  } else {
  switchTab("kontrak");
  }
}
