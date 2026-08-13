import { db, COL, collection, query, where, getDocs, getDoc, setDoc, doc, limit } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, fsDelete, openModal, closeModal, confirmDialog, toast, genId, fmtDateShort, escapeHtml, sendEmailNotif, createLoginToken, notifyUser, daysBetween, formatStatusKaryawan, downloadXlsx, ensureXlsxLoaded, formatPhoneNumberForWa, openWhatsAppMessage, getEmployeePhoneByName, buildKpiTaskWaMessage } from "../utils.js";
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
 { aspek: "SOP & Ketepatan Kerja", indikator: "Target Kinerja & Tugas Harian", target_default: 100, key: "sop_tugas" },
 { aspek: "Respon & Pelayanan Divisi", indikator: "Kepuasan User & Bebas Komplain Divisi Lain", target_default: 100, key: "respon_divisi" },
 { aspek: "Kedisiplinan & Kehadiran", indikator: "Kedisiplinan Waktu & Absensi", target_default: 100, key: "kedisiplinan" },
 { aspek: "Inisiatif & Kerjasama Team", indikator: "Kinerja Proaktif & Kerjasama Team", target_default: 100, key: "inisiatif_team" }
];

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
  wrap.innerHTML = `<div class="space-y-2">${skeletonRows(4)}</div>`;
  const tasks = await fsGetAll(COL.TUGAS_KPI_360);
  const isHrd = canDistribusiKpi360;

  const userNamaLower = (session.nama || "").toLowerCase().trim();
  const myTasks = tasks.filter(t => (t.nama_penilai || "").toLowerCase().trim() === userNamaLower);

  wrap.innerHTML = `
    <div class="space-y-6">
      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 class="font-bold text-slate-800 text-base">Tugas Penilaian 360° Saya</h3>
            <p class="text-xs text-slate-400 mt-0.5">Daftar evaluasi KPI karyawan lain yang ditugaskan kepada Anda.</p>
          </div>
          ${isHrd ? `
            <button id="btn-distribusi-kpi-global" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-semibold rounded-xl transition shadow-sm flex items-center gap-1.5">
              + Distribusi Tugas KPI 360°
            </button>
          ` : ''}
        </div>

        ${myTasks.length === 0 ? `
          <div class="p-8 text-center text-slate-400 italic text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Tidak ada tugas penilaian 360° yang ditugaskan kepada Anda saat ini.
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${myTasks.map(t => {
              const isDone = t.status === "DONE";
              return `
                <div class="p-4 rounded-xl border ${isDone ? 'border-slate-200 bg-slate-50/50' : 'border-amber-200 bg-amber-50/30'} flex flex-col justify-between space-y-3">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">${escapeHtml(t.periode || "Periode")}</span>
                      <h4 class="font-bold text-slate-800 text-sm mt-0.5">${escapeHtml(t.nama_dinilai)}</h4>
                      <p class="text-xs text-slate-500">${escapeHtml(t.jabatan_dinilai || "-")}</p>
                    </div>
                    ${badge(isDone ? "Selesai" : "Pending", isDone ? "emerald" : "amber")}
                  </div>
                  <div class="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span class="text-slate-400">Batas Waktu: ${t.deadline ? fmtDateShort(t.deadline) : '-'}</span>
                    ${!isDone ? `
                      <button data-task-id="${t.id}" class="btn-fill-kpi-item px-3 py-1.5 bg-maroon-700 hover:bg-maroon-800 text-white font-semibold rounded-lg text-xs transition">
                        Isi Penilaian
                      </button>
                    ` : `
                      <span class="font-bold text-emerald-700">Skor: ${t.skor_akhir || 0}</span>
                    `}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    </div>
  `;

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
  }
  }

  async function openDistribusiModal(preselectedTplId = null) {
  const [templates, employees] = await Promise.all([
    fsGetAll(COL.MASTER_SOAL_KPI),
    fsGetAll(COL.MASTER_KARYAWAN)
  ]);

  const activeEmps = employees.filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");

  openModal({
    title: "Distribusi Tugas Penilaian KPI 360°",
    size: "lg",
    bodyHtml: `
      <form id="form-distribusi-kpi" class="space-y-4 text-left">
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Template Soal KPI <span class="text-rose-500">*</span></label>
          <select id="dist-tpl-id" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
            <option value="">-- Pilih Template KPI --</option>
            ${templates.map(t => `<option value="${t.id}" ${preselectedTplId === t.id ? 'selected' : ''}>${escapeHtml(t.nama_template)} (${(t.soal_json || []).length} Indikator)</option>`).join("")}
          </select>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Karyawan yang Dinilai <span class="text-rose-500">*</span></label>
            <select id="dist-emp-dinilai" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
              <option value="">-- Pilih Karyawan --</option>
              ${activeEmps.map(e => `<option value="${escapeHtml(e.nama_karyawan)}">${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || "-")})</option>`).join("")}
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Penilai / Evaluator <span class="text-rose-500">*</span></label>
            <select id="dist-emp-penilai" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" required>
              <option value="">-- Pilih Penilai --</option>
              ${activeEmps.map(e => `<option value="${escapeHtml(e.nama_karyawan)}">${escapeHtml(e.nama_karyawan)} (${escapeHtml(e.jabatan || "-")})</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Periode Penilaian <span class="text-rose-500">*</span></label>
            <input type="text" id="dist-periode" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" placeholder="Misal: Semester 1 2026" value="Semester 1 ${new Date().getFullYear()}" required>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Batas Waktu Pengumpulan (Deadline)</label>
            <input type="date" id="dist-deadline" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1">Catatan HRD untuk Evaluator (Opsional)</label>
          <textarea id="dist-catatan-hrd" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-500 font-medium" placeholder="Instruksi atau catatan khusus untuk penilai..."></textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <div class="flex items-center justify-end gap-2 w-full">
        <button id="btn-dist-batal" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition">Batal</button>
        <button id="btn-dist-simpan" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-bold rounded-lg transition shadow-md">Distribusikan Tugas</button>
      </div>
    `,
    onMount: (m) => {
      m.querySelector("#btn-dist-batal").onclick = closeModal;
      m.querySelector("#btn-dist-simpan").onclick = async () => {
        const form = m.querySelector("#form-distribusi-kpi");
        if (!form.reportValidity()) return;

        const tplId = m.querySelector("#dist-tpl-id").value;
        const namaDinilai = m.querySelector("#dist-emp-dinilai").value;
        const namaPenilai = m.querySelector("#dist-emp-penilai").value;
        const periode = m.querySelector("#dist-periode").value.trim();
        const deadline = m.querySelector("#dist-deadline").value;
        const catatanHrd = m.querySelector("#dist-catatan-hrd").value.trim();

        const selectedTpl = templates.find(t => t.id === tplId);
        if (!selectedTpl) return toast("Template KPI tidak ditemukan!", "warning");

        const empDinilaiObj = activeEmps.find(e => e.nama_karyawan === namaDinilai) || {};
        const empPenilaiObj = activeEmps.find(e => e.nama_karyawan === namaPenilai) || {};

        const btnSave = m.querySelector("#btn-dist-simpan");
        btnSave.disabled = true;
        btnSave.textContent = "Mengirim...";

        try {
          const taskId = genId("TGS-360");
          await fsAdd(COL.TUGAS_KPI_360, {
            nama_template: selectedTpl.nama_template || "Template KPI",
            nama_dinilai: namaDinilai,
            jabatan_dinilai: empDinilaiObj.jabatan || "",
            nik_dinilai: empDinilaiObj.nik_karyawan || empDinilaiObj.nik || "",
            nama_penilai: namaPenilai,
            nik_penilai: empPenilaiObj.nik_karyawan || empPenilaiObj.nik || "",
            periode: periode,
            deadline: deadline,
            soal_json: selectedTpl.soal_json || [],
            catatan_hrd: catatanHrd,
            status: "PENDING",
            created_at: new Date().toISOString()
          }, taskId);

          toast("Tugas Penilaian KPI 360° berhasil didistribusikan!", "success");
          closeModal();
          loadKpi360();
        } catch (e) {
          toast("Gagal mendistribusikan: " + e.message, "error");
          btnSave.disabled = false;
          btnSave.textContent = "Distribusikan Tugas";
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

  async function loadEvaluasiKontrak() {
  const wrap = panels.evaluasi;
  if (!wrap) return;
  wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

  const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeEmp = allKaryawan.filter(e => (e.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");

  wrap.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div>
        <h3 class="font-bold text-slate-800 text-base">Evaluasi Kontrak Kerja Karyawan</h3>
        <p class="text-xs text-slate-400 mt-0.5">Monitoring perpanjangan dan sisa masa berlaku kontrak kerja staff.</p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
              <th class="py-3 px-4">Nama Karyawan</th>
              <th class="py-3 px-4">Jabatan & Cabang</th>
              <th class="py-3 px-4">Status Karyawan</th>
              <th class="py-3 px-4">Akhir Kontrak</th>
              <th class="py-3 px-4 text-center">Sisa Hari</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50 text-sm">
            ${activeEmp.length === 0 ? `
              <tr><td colspan="5" class="py-12 text-center text-slate-400 italic">Tidak ada karyawan aktif.</td></tr>
            ` : activeEmp.map(e => {
              const tglAkhir = e.tgl_akhir_kontrak || "-";
              let daysLeft = "-";
              let colorClass = "text-slate-600";
              if (tglAkhir !== "-") {
                const d = Math.ceil((new Date(tglAkhir) - new Date()) / (1000 * 3600 * 24));
                daysLeft = isNaN(d) ? "-" : `${d} hari`;
                if (d <= 30) colorClass = "text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md";
                else if (d <= 60) colorClass = "text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md";
              }
              return `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(e.nama_karyawan)}</td>
                  <td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(e.jabatan || "-")} (${escapeHtml(e.cabang || "Pusat")})</td>
                  <td class="py-3 px-4 text-xs font-medium">${escapeHtml(formatStatusKaryawan(e.status_karyawan))}</td>
                  <td class="py-3 px-4 text-xs font-semibold text-slate-700">${fmtDateShort(tglAkhir)}</td>
                  <td class="py-3 px-4 text-center text-xs"><span class="${colorClass}">${daysLeft}</span></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  }

  async function loadDailyTarget() {
  const wrap = panels.daily;
  if (!wrap) return;
  wrap.innerHTML = `<div class="p-6">${skeletonRows(4)}</div>`;

  wrap.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div>
        <h3 class="font-bold text-slate-800 text-base">Penilaian Harian & Target Sales / Operasional</h3>
        <p class="text-xs text-slate-400 mt-0.5">Monitoring target pencapaian harian berdasarkan indikator KPI Sales & Operasional.</p>
      </div>

      <div class="p-8 text-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
        Penilaian harian dan pencapaian target terintegrasi langsung dengan modul Sales & Operasional.
      </div>
    </div>
  `;
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
