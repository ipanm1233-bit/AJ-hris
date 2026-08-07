/**
 * =====================================================================
 * UTILS.JS — Pustaka utilitas inti Portal HRIS CV Andela Jaya
 * Dipakai bersama oleh app.js, semua js/views/*.js, dan super-migrasi.html
 * =====================================================================
 */
import {
 db, COL, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
 deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
 Timestamp
} from "./firebase-config.js";
// PERUBAHAN: lampiran file kini disimpan di Google Drive (lewat Apps Script
// Web App), bukan lagi Firebase Storage. Lihat js/gas-integration.js.
import { uploadFileToDrive } from "./gas-integration.js";
import { letterheadHtml, isoDocHeaderTable, COMPANY_NAME, logoImgTag } from "./branding.js";
/* ---------------------------------------------------------------------
 * 1. SMART DATE PARSER
 * Menangani 3 kemungkinan bentuk tanggal yang lazim ditemui saat migrasi
 * dari Excel/Google Sheets ke Firestore:
 * a) Excel Serial Date (angka, mis. 45825) -> dihitung dari epoch Excel 1899-12-30
 * b) String format Indonesia "DD/MM/YYYY" atau "DD-MM-YYYY"
 * c) String ISO "YYYY-MM-DDTHH:mm:ss.sssZ" (dari Date_Pengajuan, dsb)
 * Prinsip: SELALU baca hari terlebih dahulu (DD) bukan bulan (MM) agar
 * tidak terjadi "US Date Confusion" (01/11/2023 => 1 November, BUKAN 11 Januari).
 * ------------------------------------------------------------------- */
export function smartParseDate(value) {
 if (value === null || value === undefined || value === "" || value === "#N/A") return null;

 // Sudah berupa objek Date valid
 if (value instanceof Date && !isNaN(value.getTime())) return value;

 // Firestore Timestamp
 if (value && typeof value.toDate === "function") return value.toDate();

 // Excel Serial Date (angka). Excel epoch = 1899-12-30 (mengkompensasi bug leap-year 1900 Lotus)
 if (typeof value === "number" && isFinite(value)) {
 if (value > 20000 && value < 80000) { // rentang wajar tahun ~1954-2119
 const excelEpoch = new Date(Date.UTC(1899, 11, 30));
 const ms = value * 24 * 60 * 60 * 1000;
 return new Date(excelEpoch.getTime() + ms);
 }
 return null;
 }

 if (typeof value === "string") {
 const s = value.trim();
 if (!s || s === "#N/A" || s === "-") return null;

 // Angka serial dalam bentuk string
 if (/^\d+(\.\d+)?$/.test(s)) {
 return smartParseDate(parseFloat(s));
 }

 // ISO 8601: 2026-06-26T04:45:32.971Z atau 2026-06-26
 const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/);
 if (isoMatch) {
 const d = new Date(s);
 if (!isNaN(d.getTime())) return d;
 }

 // Format Indonesia: DD/MM/YYYY atau DD-MM-YYYY (WAJIB baca hari dulu!)
 const idMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
 if (idMatch) {
 let [, dd, mm, yyyy] = idMatch;
 dd = parseInt(dd, 10); mm = parseInt(mm, 10); yyyy = parseInt(yyyy, 10);
 if (yyyy < 100) yyyy += 2000;
 if (mm > 12) { const t = mm; mm = dd; dd = t; } // fallback jika salah satu > 12 berarti itu pasti hari
 const d = new Date(Date.UTC(yyyy, mm - 1, dd));
 if (!isNaN(d.getTime())) return d;
 }

 // Terakhir, coba native parser (hati-hati bias US, hanya fallback)
 const fallback = new Date(s);
 if (!isNaN(fallback.getTime())) return fallback;
 }

 return null;
}

/* ---------------------------------------------------------------------
 * 2. FORMATTER TAMPILAN (locale Indonesia)
 * PERBAIKAN PENTING: seluruh formatter di bawah sekarang memaksa
 * `timeZone: "Asia/Jakarta"` secara eksplisit. Sebelumnya tidak
 * di-set, jadi hasilnya ikut zona waktu SISTEM PERANGKAT yang membuka
 * aplikasi ini. Kalau timezone perangkat itu bukan WIB (banyak laptop
 * kantor dibiarkan default UTC/zona lain oleh IT), tanggal yang tampil
 * bisa maju/mundur 1 hari dari yang seharusnya -- ini penyebab bug
 * "ulang tahun karyawan tampil H-1" & "cuti besok muncul di Cuti Hari
 * Ini". Dengan timeZone eksplisit, hasilnya SELALU benar sesuai WIB,
 * apa pun timezone perangkat yang dipakai membuka aplikasinya.
 * ------------------------------------------------------------------- */
export function fmtDate(value, opts = {}) {
 const d = smartParseDate(value);
 if (!d) return "-";
 return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta", ...opts });
}
export function fmtDateShort(value) {
 const d = smartParseDate(value);
 if (!d) return "-";
 return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jakarta" });
}
export function fmtDateTime(value) {
 const d = smartParseDate(value);
 if (!d) return "-";
 return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
export function fmtRupiah(value) {
 const n = toNumber(value);
 return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
export function toNumber(value) {
 if (value === null || value === undefined || value === "" || value === "#N/A") return 0;
 if (typeof value === "number") return value;
 const cleaned = String(value).replace(/[^\d\-,.]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
 const n = parseFloat(cleaned);
 return isNaN(n) ? 0 : n;
}
export function daysBetween(a, b) {
 const da = smartParseDate(a), db_ = smartParseDate(b);
 if (!da || !db_) return null;
 return Math.round((db_.setHours(0,0,0,0) - da.setHours(0,0,0,0)) / 86400000);
}
export function calculateAge(value) {
 if (!value) return null;
 const d = smartParseDate(value);
 if (!d || isNaN(d.getTime())) return null;
 const today = new Date();
 let age = today.getFullYear() - d.getFullYear();
 const m = today.getMonth() - d.getMonth();
 if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
 age--;
 }
 return age >= 0 ? age : null;
}
export function calculateTenure(value) {
 if (!value) return "-";
 const d = smartParseDate(value);
 if (!d || isNaN(d.getTime())) return String(value);
 const today = new Date();
 let years = today.getFullYear() - d.getFullYear();
 let months = today.getMonth() - d.getMonth();
 if (months < 0 || (months === 0 && today.getDate() < d.getDate())) {
 years--;
 months += 12;
 }
 if (today.getDate() < d.getDate()) {
 months--;
 if (months < 0) {
 years--;
 months += 12;
 }
 }
 if (years <= 0 && months <= 0) return "< 1 Bulan";
 let parts = [];
 if (years > 0) parts.push(`${years} Tahun`);
 if (months > 0) parts.push(`${months} Bulan`);
 return parts.join(" ") || "< 1 Bulan";
}
export function toSnakeCase(str) {
 return String(str)
 .trim()
 .replace(/[^\w\s/]/g, "")
 .replace(/\s+/g, "_")
 .replace(/__+/g, "_")
 .toLowerCase();
}
export function genId(prefix = "ID") {
 return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
export function initials(name = "") {
 return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
export async function sha256(text) {
 const enc = new TextEncoder().encode(text);
 const buf = await crypto.subtle.digest("SHA-256", enc);
 return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------------------
 * 3. TOAST NOTIFICATION
 * ------------------------------------------------------------------- */
export function toast(message, type = "info") {
 const host = document.getElementById("toast-host");
 if (!host) { console.log(`[toast:${type}]`, message); return; }
 const colors = {
 success: "bg-emerald-600",
 error: "bg-red-700",
 info: "bg-slate-800",
 warning: "bg-amber-600"
 };
 const el = document.createElement("div");
 el.className = `${colors[type] || colors.info} text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 opacity-0 translate-x-4 transition-all duration-300`;
 el.innerHTML = `<span>${message}</span>`;
 host.appendChild(el);
 requestAnimationFrame(() => {
 el.classList.remove("opacity-0", "translate-x-4");
 });
 setTimeout(() => {
 el.classList.add("opacity-0", "translate-x-4");
 setTimeout(() => el.remove(), 300);
 }, 3500);
}

/* ---------------------------------------------------------------------
 * 4. MODAL SYSTEM — generik, dipakai semua modul
 * ------------------------------------------------------------------- */
export function openModal({ title, bodyHtml, content, contentHtml, body, footerHtml = "", size = "md", onMount = null }) {
 closeModal();
 const modalBody = bodyHtml || contentHtml || content || body || "";
 const sizes = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" };
 const backdrop = document.createElement("div");
 backdrop.id = "app-modal-backdrop";
 backdrop.className = "fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 opacity-0 transition-opacity duration-200";
 backdrop.innerHTML = `
 <div class="bg-white w-full ${sizes[size] || sizes.md} rounded-2xl shadow-2xl max-h-[90vh] flex flex-col scale-95 transition-transform duration-200" id="app-modal-panel">
 <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
 <h3 class="text-lg font-semibold text-slate-800">${title}</h3>
 <button id="app-modal-close" class="text-slate-400 hover:text-maroon-700 hover:bg-slate-100 rounded-lg w-8 h-8 flex items-center justify-center transition">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
 </button>
 </div>
 <div class="px-6 py-5 overflow-y-auto flex-1">${modalBody}</div>
 ${footerHtml ? `<div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">${footerHtml}</div>` : ""}
 </div>`;
 document.body.appendChild(backdrop);
 document.body.classList.add("overflow-hidden");
 requestAnimationFrame(() => {
 backdrop.classList.remove("opacity-0");
 backdrop.querySelector("#app-modal-panel").classList.remove("scale-95");
 });
 backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
 backdrop.querySelector("#app-modal-close").addEventListener("click", closeModal);
 if (onMount) onMount(backdrop);
 return backdrop;
}
export function closeModal() {
 const el = document.getElementById("app-modal-backdrop");
 if (!el) return;
 el.classList.add("opacity-0");
 document.body.classList.remove("overflow-hidden");
 setTimeout(() => el.remove(), 200);
}
if (typeof window !== "undefined") {
 window.openModal = openModal;
 window.closeModal = closeModal;
}

export function formatStatusKaryawan(val) {
 if (!val) return "-";
 const str = String(val).toUpperCase().trim();
 if (str === "PKWTT" || str === "TETAP" || str.includes("TETAP")) return "PKWTT (Karyawan Tetap)";
 if (str === "PKWT" || str === "KONTRAK" || str.includes("KONTRAK")) return "PKWT (Karyawan Kontrak)";
 if (str === "PROBATION" || str.includes("PROBATION") || str.includes("PERCOBAAN")) return "Probation (Masa Percobaan)";
 if (str === "MAGANG" || str.includes("MAGANG")) return "Magang";
 if (str === "BURUH HARIAN" || str.includes("BURUH") || str.includes("HARIAN")) return "Buruh Harian";
 if (str === "OUTSOURCING" || str.includes("OUTSOURCING")) return "Outsourcing";
 if (str === "LAINNYA" || str.includes("LAIN")) return "Lainnya";
 return val;
}
export function confirmDialog(message, { title = "Konfirmasi", danger = true } = {}) {
 return new Promise((resolve) => {
 openModal({
 title,
 bodyHtml: `<p class="text-slate-600 text-sm leading-relaxed">${message}</p>`,
 footerHtml: `
 <button id="cf-no" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="cf-yes" class="px-4 py-2 rounded-lg text-sm font-medium text-white ${danger ? "bg-red-700 hover:bg-red-800" : "bg-maroon-700 hover:bg-maroon-800"} transition">Ya, Lanjutkan</button>`,
 onMount: (m) => {
 m.querySelector("#cf-no").onclick = () => { closeModal(); resolve(false); };
 m.querySelector("#cf-yes").onclick = () => { closeModal(); resolve(true); };
 }
 });
 });
}

/* ---------------------------------------------------------------------
 * 5. FIRESTORE CRUD WRAPPER — dipakai renderCrudModule & views custom
 * ------------------------------------------------------------------- */
export async function fsGetAll(colName, { orderByField = null, direction = "asc" } = {}) {
 const ref = collection(db, colName);
 const q = orderByField ? query(ref, orderBy(orderByField, direction)) : ref;
 const snap = await getDocs(q);
 return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export function fsListen(colName, callback, { orderByField = null, direction = "asc" } = {}) {
 const ref = collection(db, colName);
 const q = orderByField ? query(ref, orderBy(orderByField, direction)) : ref;
 return onSnapshot(q, (snap) => {
 callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
 }, (err) => console.error(`onSnapshot(${colName})`, err));
}
export function cleanFirestorePayload(obj, seen = new WeakSet()) {
 if (obj === null || obj === undefined) return null;
 if (typeof obj !== "object") return obj;
 if (obj instanceof Date) return obj;
 if (obj._methodName || (obj.constructor && obj.constructor.name === "FieldValue")) return obj;

 if (
 (typeof Node !== 'undefined' && obj instanceof Node) ||
 (typeof Event !== 'undefined' && obj instanceof Event) ||
 typeof obj === "function" ||
 (obj.constructor && (
 obj.constructor.name === "Y" ||
 obj.constructor.name === "Ka" ||
 obj.constructor.name === "DocumentReference" ||
 obj.constructor.name === "Query" ||
 obj.constructor.name === "Firestore" ||
 obj.constructor.name.startsWith("HTML")
 ))
 ) {
 return null;
 }

 if (seen.has(obj)) {
 return null;
 }
 seen.add(obj);

 if (Array.isArray(obj)) {
 return obj.map(item => cleanFirestorePayload(item, seen)).filter(item => item !== undefined);
 }

 const result = {};
 for (const key of Object.keys(obj)) {
 if (key.startsWith("_") && key !== "_methodName") continue;
 const val = obj[key];
 if (val === undefined || typeof val === "function") continue;
 const cleaned = cleanFirestorePayload(val, seen);
 if (cleaned !== undefined) {
 result[key] = cleaned;
 }
 }
 return result;
}

export async function fsGet(colName, id) {
 const snap = await getDoc(doc(db, colName, id));
 return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function fsAdd(colName, data, customId = null) {
 const payload = cleanFirestorePayload(data) || {};
 if (customId) {
 await setDoc(doc(db, colName, String(customId)), { ...payload, created_at: serverTimestamp() });
 return customId;
 }
 const ref = await addDoc(collection(db, colName), { ...payload, created_at: serverTimestamp() });
 return ref.id;
}
export async function fsUpdate(colName, id, data) {
 const payload = cleanFirestorePayload(data) || {};
 await updateDoc(doc(db, colName, id), { ...payload, updated_at: serverTimestamp() });
}
export async function fsDelete(colName, id) {
 if (!id) return;
 await deleteDoc(doc(db, colName, String(id)));
}

export async function deleteBroadcastMemoAndNotifs(memoId) {
 if (!memoId) return;
 const strId = String(memoId);
 await fsDelete(COL.BROADCAST, strId);
 try {
 const allNotifs = await fsGetAll(COL.NOTIFICATIONS);
 const related = allNotifs.filter(n => 
 String(n.memo_id || "") === strId || 
 (n.link && String(n.link).includes(strId))
 );
 await Promise.all(related.map(n => fsDelete(COL.NOTIFICATIONS, n.id)));
 } catch (err) {
 console.warn("Gagal membersihkan notifikasi terkait memo:", err);
 }
}

/* ---------------------------------------------------------------------
 * 6. CSV EXPORT
 * ------------------------------------------------------------------- */
/**
 * Penulis CSV tingkat-rendah: headers & data SUDAH disiapkan (array of arrays),
 * tidak menebak-nebak struktur dari Object.keys() seperti exportToCsv() lama.
 * Dipakai oleh export kolom-terpilih di renderCrudModule (lihat components.js).
 */
export function downloadCsv(filename, headers, matrix) {
 if (!matrix || !matrix.length) { toast("Tidak ada data untuk diekspor", "warning"); return; }
 const escape = (v) => {
 const s = String(v ?? "");
 return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
 };
 const csv = [headers.map(escape).join(","), ...matrix.map(row => row.map(escape).join(","))].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
 document.body.appendChild(a); a.click(); a.remove();
 URL.revokeObjectURL(url);
}

let _xlsxLoadingPromise = null;
export function ensureXlsxLoaded() {
 if (window.XLSX) return Promise.resolve();
 if (_xlsxLoadingPromise) return _xlsxLoadingPromise;
 _xlsxLoadingPromise = new Promise((resolve, reject) => {
 const script = document.createElement("script");
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
 script.onload = () => resolve();
 script.onerror = () => reject(new Error("Gagal memuat library Excel (SheetJS)."));
 document.head.appendChild(script);
 });
 return _xlsxLoadingPromise;
}

export async function downloadXlsx(arg1, arg2, arg3, arg4 = "Data") {
 await ensureXlsxLoaded();
 let filename = "export.xlsx";
 let ws = null;
 let sName = "Data";

 if (Array.isArray(arg1) && typeof arg2 === "string") {
 filename = arg2;
 sName = arg3 || "Data";
 if (!arg1 || !arg1.length) {
 toast("Tidak ada data untuk diekspor", "warning");
 return;
 }
 if (typeof arg1[0] === "object" && !Array.isArray(arg1[0])) {
 ws = window.XLSX.utils.json_to_sheet(arg1);
 } else if (Array.isArray(arg1[0])) {
 ws = window.XLSX.utils.aoa_to_sheet(arg1);
 }
 } else if (typeof arg1 === "string" && Array.isArray(arg2) && Array.isArray(arg3)) {
 filename = arg1;
 sName = typeof arg4 === "string" ? arg4 : "Data";
 if (!arg3 || !arg3.length) {
 toast("Tidak ada data untuk diekspor", "warning");
 return;
 }
 ws = window.XLSX.utils.aoa_to_sheet([arg2, ...arg3]);
 } else if (typeof arg1 === "string" && Array.isArray(arg2)) {
 filename = arg1;
 sName = typeof arg3 === "string" ? arg3 : "Data";
 if (typeof arg2[0] === "object" && !Array.isArray(arg2[0])) {
 ws = window.XLSX.utils.json_to_sheet(arg2);
 } else if (Array.isArray(arg2[0])) {
 ws = window.XLSX.utils.aoa_to_sheet(arg2);
 }
 }

 if (!ws) {
 toast("Tidak ada data valid untuk diekspor", "warning");
 return;
 }

 const wb = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(wb, ws, sName);
 window.XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}

/**
 * Format tanggal ke format bahasa Indonesia lengkap (e.g. "Senin, 05 Januari 2026")
 */
export function fmtDateIndoLong(dateStr) {
 if (!dateStr) return "-";
 const cleanStr = String(dateStr).substring(0, 10);
 const parts = cleanStr.split("-");
 if (parts.length !== 3) return dateStr;
 const year = parseInt(parts[0], 10);
 const monthIdx = parseInt(parts[1], 10) - 1;
 const day = parseInt(parts[2], 10);

 if (isNaN(year) || isNaN(monthIdx) || isNaN(day)) return dateStr;
 const d = new Date(year, monthIdx, day);
 if (isNaN(d.getTime())) return dateStr;

 const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
 const months = [
 "Januari", "Februari", "Maret", "April", "Mei", "Juni",
 "Juli", "Agustus", "September", "Oktober", "November", "Desember"
 ];

 const dayName = days[d.getDay()];
 const monthName = months[monthIdx] || "";
 const formattedDay = day < 10 ? "0" + day : String(day);

 return `${dayName}, ${formattedDay} ${monthName} ${year}`;
}

/**
 * Memformat array trip Uang Makan Ekspedisi menjadi baris-baris terurai
 * sesuai template Excel standar ("UANG JALAN 2026"):
 * Tanggal | Nama Karyawan | Jabatan | Area Kirim | Start | End | Jumlah Toko | Jumlah Terkirim | Nominal | STATUS | Validasi | bulan
 */
export function formatUangJalanEkspedisiRows(trips) {
 if (!Array.isArray(trips)) return [];
 const result = [];

 const sorted = [...trips].sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));

 sorted.forEach(trip => {
 const dateStr = trip.tanggal ? String(trip.tanggal).substring(0, 10) : "";
 const formattedDate = fmtDateIndoLong(dateStr);
 const monthNum = dateStr && dateStr.includes("-") ? parseInt(dateStr.split("-")[1], 10) : 1;
 const start = trip.jam_berangkat ? String(trip.jam_berangkat).replace(":", ".") : "-";
 const end = trip.jam_tiba ? String(trip.jam_tiba).replace(":", ".") : "-";
 const jmlToko = trip.jml_toko !== undefined && trip.jml_toko !== null ? Number(trip.jml_toko) : 0;
 const jmlTerkirim = trip.realisasi_toko !== undefined && trip.realisasi_toko !== null ? Number(trip.realisasi_toko) : jmlToko;
 const statusNote = trip.keterangan_selisih && String(trip.keterangan_selisih).trim() ? String(trip.keterangan_selisih).trim().toUpperCase() : "0";

 // Row Driver
 if (trip.driver) {
 result.push({
 "Tanggal": formattedDate,
 "Nama Karyawan": String(trip.driver).toUpperCase(),
 "Jabatan": "Driver",
 "Area Kirim": String(trip.tujuan || "-").toUpperCase(),
 "Start": start,
 "End": end,
 "Jumlah Toko": jmlToko,
 "Jumlah Terkirim": jmlTerkirim,
 "Nominal": Number(trip.um_driver || 35000),
 "STATUS": statusNote,
 "Validasi": true,
 "bulan": monthNum
 });
 }

 // Row Helper
 if (trip.helper && String(trip.helper).trim()) {
 result.push({
 "Tanggal": formattedDate,
 "Nama Karyawan": String(trip.helper).toUpperCase(),
 "Jabatan": "Helper",
 "Area Kirim": String(trip.tujuan || "-").toUpperCase(),
 "Start": start,
 "End": end,
 "Jumlah Toko": jmlToko,
 "Jumlah Terkirim": jmlTerkirim,
 "Nominal": Number(trip.um_helper || 25000),
 "STATUS": statusNote,
 "Validasi": true,
 "bulan": monthNum
 });
 }
 });

 return result;
}

export function exportToCsv(filename, rows) {
 if (!rows || !rows.length) { toast("Tidak ada data untuk diekspor", "warning"); return; }
 const headers = Object.keys(rows[0]);
 const escape = (v) => {
 if (v === null || v === undefined) return "";
 if (typeof v === "object" && v.toDate) v = fmtDateShort(v);
 const s = String(v).replace(/"/g, '""');
 return /[",\n]/.test(s) ? `"${s}"` : s;
 };
 const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
 document.body.appendChild(a); a.click(); a.remove();
 URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------
 * 7. SIMPLE FORMULA ENGINE — untuk Form Builder (rumus kalkulasi otomatis)
 * Mendukung sintaks: ([field_a] - [field_b]) * (10000/25)
 * Field ditulis dalam kurung siku dan namanya harus cocok dengan `name`
 * field lain pada form yang sama.
 * ------------------------------------------------------------------- */
export function evalFormula(formulaStr, valuesObj) {
 try {
 let expr = formulaStr.replace(/\[([a-zA-Z0-9_]+)\]/g, (_, key) => {
 const v = toNumber(valuesObj[key]);
 return isFinite(v) ? v : 0;
 });
 if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null; // whitelist karakter matematika saja
 // eslint-disable-next-line no-new-func
 const result = Function(`"use strict"; return (${expr});`)();
 return isFinite(result) ? result : null;
 } catch (e) {
 return null;
 }
}

/* ---------------------------------------------------------------------
 * 8. QUERY STRING & HASH ROUTE HELPERS
 * ------------------------------------------------------------------- */
export function parseHash() {
 const raw = (location.hash || "").replace(/^#+/, "").replace(/^\/+/, "");
 const [pathRaw, qs] = raw.split("?");
 const path = (pathRaw || "").replace(/^\/+|\/+$/g, "").trim() || "dashboard";
 const params = new URLSearchParams(qs || "");
 return { path, params };
}
export function navigate(path, params = {}) {
 const cleanPath = String(path || "").replace(/^#+/, "").replace(/^\/+/, "").replace(/\/+$/, "").trim();
 const qs = new URLSearchParams(params).toString();
 location.hash = `#${cleanPath}${qs ? "?" + qs : ""}`;
}

export function escapeHtml(str = "") {
 if (str === null || str === undefined) return "";
 return String(str)
 .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
if (typeof window !== "undefined") {
 window.escapeHtml = escapeHtml;
}

/* ---------------------------------------------------------------------
 * GOOGLE DRIVE & ATTACHMENT VIEWER HELPERS
 * ------------------------------------------------------------------- */
export function normalizeDriveUrl(url) {
 if (!url || typeof url !== "string") return "#";
 const s = url.trim();
 if (s.startsWith("data:")) return s;

 // Normalisasi URL Google Drive file
 const driveFileIdMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
 s.match(/id=([a-zA-Z0-9_-]+)/) ||
 s.match(/\/d\/([a-zA-Z0-9_-]+)/);
 if (driveFileIdMatch && driveFileIdMatch[1]) {
 const fileId = driveFileIdMatch[1];
 return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
 }
 
 if (/^[a-zA-Z0-9_-]{25,100}$/.test(s)) {
 return `https://drive.google.com/file/d/${s}/view?usp=sharing`;
 }

 if (/^https?:\/\//i.test(s)) return s;
 return `https://${s}`;
}

export function openAttachment(url) {
 if (!url) {
 toast("Lampiran tidak ditemukan atau kosong", "warning");
 return;
 }
 
 const trimmed = String(url).trim();
 
 // Jika berupa data base64
 if (trimmed.startsWith("data:")) {
 try {
 const parts = trimmed.split(",");
 const mimeMatch = parts[0].match(/:(.*?);/);
 const mime = mimeMatch ? mimeMatch[1] : "image/png";
 const bstr = atob(parts[1]);
 let n = bstr.length;
 const u8arr = new Uint8Array(n);
 while (n--) {
 u8arr[n] = bstr.charCodeAt(n);
 }
 const blob = new Blob([u8arr], { type: mime });
 const blobUrl = URL.createObjectURL(blob);
 
 const win = window.open(blobUrl, "_blank");
 if (!win) {
 if (mime.startsWith("image/")) {
 openModal({
 title: "Pratinjau Lampiran Gambar",
 bodyHtml: `<div class="text-center p-2"><img src="${trimmed}" class="max-w-full max-h-[70vh] mx-auto rounded-lg shadow-sm" /></div>`,
 footerHtml: `<a href="${blobUrl}" download="lampiran" class="px-4 py-2 bg-maroon-700 text-white rounded-lg text-xs font-bold">Unduh File</a> <button id="close-img-preview" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Tutup</button>`,
 onMount: (m) => m.querySelector("#close-img-preview").onclick = closeModal
 });
 } else {
 toast("Izin popup diblokir browser. Izinkan popup untuk melihat lampiran.", "warning");
 }
 }
 } catch (e) {
 toast("Gagal membuka lampiran base64: " + e.message, "error");
 }
 return;
 }
 
 const targetUrl = normalizeDriveUrl(trimmed);
 const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
 if (!win) {
 openModal({
 title: "Buka Lampiran",
 bodyHtml: `
 <div class="text-center p-4">
 <p class="text-sm text-slate-600 mb-4">Klik tombol di bawah untuk membuka lampiran file di tab baru:</p>
 <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-5 py-2.5 bg-maroon-700 text-white rounded-xl font-bold text-xs shadow hover:bg-maroon-800 transition">
 Buka Dokumen / Lampiran Google Drive
 </a>
 </div>`,
 footerHtml: `<button id="btn-close-att-modal" class="px-4 py-2 bg-slate-100 rounded text-xs font-semibold">Tutup</button>`,
 onMount: m => m.querySelector("#btn-close-att-modal").onclick = closeModal
 });
 }
}
if (typeof window !== "undefined") {
 window.openAttachment = openAttachment;
 window.normalizeDriveUrl = normalizeDriveUrl;
}

export function terbilang(n) {
 const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
 let num = Math.floor(Math.abs(Number(n) || 0));
 if (num === 0) return "Nol Rupiah";
 function bilang(x) {
 if (x < 12) return angka[x];
 if (x < 20) return bilang(x - 10) + " Belas";
 if (x < 100) return bilang(Math.floor(x / 10)) + " Puluh " + bilang(x % 10);
 if (x < 200) return "Seratus " + bilang(x - 100);
 if (x < 1000) return bilang(Math.floor(x / 100)) + " Ratus " + bilang(x % 100);
 if (x < 2000) return "Seribu " + bilang(x - 1000);
 if (x < 1000000) return bilang(Math.floor(x / 1000)) + " Ribu " + bilang(x % 1000);
 if (x < 1000000000) return bilang(Math.floor(x / 1000000)) + " Juta " + bilang(x % 1000000);
 return String(x);
 }
 return bilang(num).trim().replace(/\s+/g, " ") + " Rupiah";
}

export function printSalesKlaimForm(item) {
 if (!item) return;
 const detail = item.detail || {};
 const detailList = detail.rincian_tabel || detail.rincian || detail.items || [];
 const total = Number(detail.total_klaim || detail.grand_total || detail.total || 0);
 const cabangArea = item.cabang || detail.cabang || "Cirebon";
 const HARGA_BENSIN = 10000;
 const RASIO_KM = 25;

 let totalJarak = 0, totalPetrol = 0, totalParkir = 0, totalDenda = 0;

 const tripRowsHtml = detailList.length > 0 ? detailList.map((r, i) => {
 const kmAwal = Number(r.km_awal || 0);
 const kmAkhir = Number(r.km_akhir || 0);
 const parkirRp = Number(r.parkir || 0);
 const dendaRp = Number(r.denda || 0);
 const trip = Math.max(0, kmAkhir - kmAwal);
 const petrolRp = Math.round(trip * (HARGA_BENSIN / RASIO_KM));
 const rowTotal = Number(r.total_baris || (petrolRp + parkirRp - dendaRp));

 totalJarak += trip;
 totalPetrol += petrolRp;
 totalParkir += parkirRp;
 totalDenda += dendaRp;

 return `
 <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
 <td style="padding: 8px; text-align: center; font-weight: bold;">${i + 1}</td>
 <td style="padding: 8px;">${escapeHtml(r.tanggal || "-")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">${kmAwal.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">${kmAkhir.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace;">${trip} KM</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">Rp ${petrolRp.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">Rp ${parkirRp.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace; color: #b91c1c;">Rp ${dendaRp.toLocaleString("id-ID")}</td>
 <td style="padding: 8px;">${escapeHtml(r.tujuan || r.kunjungan || "-")}</td>
 <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace; background-color: #f8fafc;">Rp ${rowTotal.toLocaleString("id-ID")}</td>
 </tr>
 `;
 }).join("") : `
 <tr><td colspan="10" style="padding: 16px; text-align: center; color: #64748b;">Tidak ada rincian baris perjalanan</td></tr>
 `;

 const terbilangStr = terbilang(total);

 const printWin = window.open("", "_blank", "width=900,height=750");
 if (!printWin) {
 toast("Izin popup diblokir browser. Izinkan popup untuk mencetak/mengunduh form.", "error");
 return;
 }

 printWin.document.write(`
 <!DOCTYPE html>
 <html lang="id">
 <head>
 <meta charset="UTF-8">
 <title>Form Klaim Bensin Sales — ${escapeHtml(item.nama_pemohon)}</title>
 <style>
 @page { size: A4 landscape; margin: 12mm; }
 body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #0f172a; background: #fff; line-height: 1.4; }
 .header { border-bottom: 3px double #7a1f2b; padding-bottom: 12px; margin-bottom: 16px; text-align: center; }
 .header h2 { margin: 0; font-size: 20px; text-transform: uppercase; font-weight: 800; color: #7a1f2b; letter-spacing: 1px; }
 .header h3 { margin: 4px 0 0; font-size: 13px; color: #334155; font-weight: 700; text-transform: uppercase; }
 .header p { margin: 2px 0 0; font-size: 11px; color: #64748b; }
 
 .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 11px; }
 .meta-item label { color: #64748b; font-size: 10px; display: block; text-transform: uppercase; font-weight: bold; }
 .meta-item span { font-weight: bold; color: #0f172a; font-size: 12px; }

 table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
 th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; font-size: 10px; text-align: left; text-transform: uppercase; color: #334155; font-weight: 800; }
 td { border: 1px solid #cbd5e1; font-size: 11px; }

 .summary-box { display: flex; justify-content: space-between; align-items: center; background: #faf8ff; border: 1.5px solid #7a1f2b; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; }
 .terbilang { font-size: 11px; color: #475569; font-style: italic; }
 .terbilang strong { color: #7a1f2b; font-style: normal; }
 .total-nominal { font-size: 16px; font-weight: 900; color: #7a1f2b; font-family: monospace; }

 .signatures { margin-top: 30px; page-break-inside: avoid; }
 .sig-date { text-align: right; font-size: 11px; font-weight: bold; margin-bottom: 16px; color: #475569; }
 .sig-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; text-align: center; }
 .sig-box { font-size: 10px; background: #fff; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; }
 .sig-box p { margin: 0 0 6px; font-weight: bold; color: #334155; text-transform: uppercase; }
 .sig-space { height: 50px; }
 .sig-name { font-weight: bold; border-top: 1px solid #94a3b8; padding-top: 4px; color: #0f172a; }

 .no-print-bar { background: #1e293b; color: white; padding: 10px 16px; margin: -20px -20px 20px -20px; display: flex; justify-content: space-between; align-items: center; }
 .btn-print { background: #7a1f2b; color: white; border: none; padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 12px; }
 .btn-print:hover { background: #991b1b; }

 @media print {
 * {
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .no-print-bar { display: none !important; }
 body { padding: 0; }
 }
 </style>
 </head>
 <body>
 <div class="no-print-bar">
 <span><b>Form Klaim Bensin Sales CV Andela Jaya</b></span>
 <button class="btn-print" onclick="window.print()">Cetak / Simpan PDF</button>
 </div>

 ${letterheadHtml()}

 <div style="text-align:center;margin-bottom:16px;">
 <h3 style="margin:0;font-size:15px;color:#7a1f2b;font-weight:bold;text-transform:uppercase;">FORM KLAIM BENSIN & OPERASIONAL SALES</h3>
 <p style="margin:4px 0 0;font-size:11px;color:#64748b;">Cabang / Area Operasional: <strong>${escapeHtml(cabangArea).toUpperCase()}</strong> • No. Transaksi: <strong>${escapeHtml(item.id)}</strong></p>
 </div>

 <div class="meta-grid">
 <div class="meta-item">
 <label>Nama Pemohon / Sales</label>
 <span>${escapeHtml(item.nama_pemohon)}</span>
 </div>
 <div class="meta-item">
 <label>NIK / Cabang</label>
 <span>${escapeHtml(item.nik || "-")} / ${escapeHtml(cabangArea)}</span>
 </div>
 <div class="meta-item">
 <label>Tanggal Ajuan</label>
 <span>${fmtDateTime(item.tgl)}</span>
 </div>
 <div class="meta-item">
 <label>Jenis BBM / Status</label>
 <span>Pertalite (1L / 25 KM) • <strong style="color: #047857;">${escapeHtml(item.status_final || "MENUNGGU")}</strong></span>
 </div>
 </div>

 <table>
 <thead>
 <tr>
 <th style="text-align: center; width: 30px;">NO</th>
 <th>TGL PERJALANAN</th>
 <th style="text-align: right;">KM AWAL</th>
 <th style="text-align: right;">KM AKHIR</th>
 <th style="text-align: right;">JARAK (KM)</th>
 <th style="text-align: right;">PETROL (Rp)</th>
 <th style="text-align: right;">PARKIR (Rp)</th>
 <th style="text-align: right;">DENDA (Rp)</th>
 <th>TUJUAN / DAFTAR KUNJUNGAN TOKO</th>
 <th style="text-align: right;">TOTAL BARIS</th>
 </tr>
 </thead>
 <tbody>
 ${tripRowsHtml}
 </tbody>
 </table>

 <div class="summary-box">
 <div class="terbilang">
 Terbilang: <strong>${escapeHtml(terbilangStr)}</strong>
 </div>
 <div class="total-nominal">
 TOTAL KLAIM SALES: Rp ${total.toLocaleString("id-ID")}
 </div>
 </div>

 <div class="signatures">
 <div class="sig-date">${escapeHtml(cabangArea)}, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
 <div class="sig-grid">
 <div class="sig-box">
 <p>Yang Mengajukan,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( ${escapeHtml(item.nama_pemohon)} )<br/><span style="font-weight:normal; font-size:9px;">Sales / Operasional</span></div>
 </div>
 <div class="sig-box">
 <p>Mengetahui Direct Spv,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( SPV Sales / Manager )<br/><span style="font-weight:normal; font-size:9px;">Atasan Langsung</span></div>
 </div>
 <div class="sig-box">
 <p>Diverifikasi HRD,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( Staff HRD )<br/><span style="font-weight:normal; font-size:9px;">HRGA & Operasional</span></div>
 </div>
 <div class="sig-box">
 <p>Disetujui Finance,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( Finance / Kasir )<br/><span style="font-weight:normal; font-size:9px;">Pencairan Dana</span></div>
 </div>
 </div>
 </div>
 </body>
 </html>
 `);
 printWin.document.close();
}

export function generateStandardFormCutiHtml(opts = {}) {
 const {
 namaKaryawan = "Karyawan",
 divisi = "-",
 jabatan = "-",
 cabang = "-",
 jenisCuti = "Cuti",
 isHalfDay = false,
 tglMulai = new Date().toISOString(),
 tglSelesai = tglMulai,
 jamKeluar = "-",
 jamKembali = "-",
 kontak = "-",
 alasan = "-",
 sisaTahunan = 0,
 sisaKhusus = 0,
 sisaAkumulasi = 0,
 tglPengajuan = new Date().toISOString(),
 pejabatPengganti = "-",
 catatanAtasan = ""
 } = opts;

 const fmtMulai = fmtDate(tglMulai);
 const fmtSelesai = fmtDate(tglSelesai);
 const fmtTglPengajuan = fmtDate(tglPengajuan);

 const locationDateStr = `CIREBON, ${fmtTglPengajuan !== "-" ? fmtTglPengajuan : fmtDate(new Date())}`;

 let divisiDisplay = divisi;
 if (!divisiDisplay || divisiDisplay === "-") {
 divisiDisplay = jabatan !== "-" ? jabatan : (cabang !== "-" ? cabang : "Staff");
 } else if (jabatan && jabatan !== "-" && jabatan !== divisiDisplay) {
 divisiDisplay = `${jabatan} / ${divisiDisplay}`;
 }

 const headerTitle = isHalfDay 
 ? "FORMULIR PENGAJUAN CUTI SETENGAH HARI" 
 : "FORMULIR PENGAJUAN CUTI KARYAWAN";

 return `<!DOCTYPE html>
<html lang="id">
<head>
 <meta charset="UTF-8">
 <title>Form Cuti — ${escapeHtml(namaKaryawan)}</title>
 <style>
 @page { size: A4 portrait; margin: 10mm 12mm; }
 * {
 box-sizing: border-box;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 body {
 font-family: 'Times New Roman', Times, serif;
 font-size: 14px;
 line-height: 1.5;
 color: #000;
 background: #fff;
 margin: 0;
 padding: 10px 0 0 0;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .no-print-bar {
 position: fixed;
 top: 12px;
 right: 16px;
 z-index: 9999;
 }
 .btn-cetak {
 background: #7a1f2b;
 color: white;
 border: none;
 padding: 8px 16px;
 border-radius: 6px;
 font-weight: bold;
 font-size: 13px;
 cursor: pointer;
 box-shadow: 0 2px 8px rgba(0,0,0,0.2);
 display: inline-flex;
 align-items: center;
 gap: 6px;
 font-family: Arial, sans-serif;
 }
 .btn-cetak:hover {
 background: #5c1720;
 }
 
 .cuti-box {
 width: 100%;
 max-width: 760px;
 margin: 0 auto;
 border: 2px solid #000;
 background: #fff;
 }

 .hdr-table {
 width: 100%;
 border-collapse: collapse;
 border-bottom: 2px solid #000;
 }
 .hdr-table td {
 border: 1px solid #000;
 vertical-align: middle;
 }
 .hdr-logo {
 width: 110px;
 text-align: center;
 padding: 8px;
 }
 .hdr-title-1 {
 font-size: 16px;
 font-weight: bold;
 text-align: center;
 text-transform: uppercase;
 padding: 8px;
 background-color: #dbeafe !important;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .hdr-title-2 {
 font-size: 16px;
 font-weight: bold;
 text-align: center;
 background-color: #dbeafe !important;
 padding: 6px;
 text-transform: uppercase;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .hdr-meta {
 width: 100%;
 border-collapse: collapse;
 }
 .hdr-meta td {
 border-right: 1px solid #000;
 font-size: 12px;
 padding: 5px 8px;
 text-align: left;
 }
 .hdr-meta td:last-child {
 border-right: none;
 }

 .body-section {
 padding: 15px 22px 18px 22px;
 }

 .sec-head {
 font-weight: bold;
 font-size: 14px;
 text-transform: uppercase;
 margin-top: 6px;
 margin-bottom: 8px;
 }

 .data-table {
 width: 100%;
 border-collapse: collapse;
 margin-bottom: 8px;
 }
 .data-table td {
 padding: 4px 0;
 vertical-align: top;
 font-size: 14px;
 }
 .lbl-col {
 width: 230px;
 }

 .sig-section {
 margin-top: 22px;
 width: 100%;
 }
 .sig-location {
 font-size: 14px;
 margin-bottom: 12px;
 }
 .sig-table {
 width: 100%;
 border-collapse: collapse;
 text-align: center;
 page-break-inside: avoid;
 }
 .sig-table td {
 width: 33.33%;
 padding: 0 5px;
 font-size: 14px;
 }

 .notes-section {
 border-top: 2px solid #000;
 border-bottom: 2px solid #000;
 padding: 10px 22px;
 min-height: 55px;
 }
 .notes-title {
 font-size: 14px;
 font-weight: normal;
 }

 .notice-section {
 padding: 10px 22px 12px 22px;
 font-size: 13px;
 line-height: 1.45;
 }
 .notice-title {
 margin-bottom: 4px;
 font-weight: normal;
 }
 .notice-list {
 margin: 0;
 padding-left: 18px;
 }
 .notice-list li {
 margin-bottom: 3px;
 }

 @media print {
 * {
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .no-print-bar { display: none !important; }
 body { padding: 0; margin: 0; }
 .cuti-box { border: 2px solid #000 !important; width: 100% !important; max-width: none !important; }
 .hdr-title-1, .hdr-title-2 {
 background-color: #dbeafe !important;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 }
 </style>
</head>
<body>
 <div class="no-print-bar">
 <button onclick="window.print()" class="btn-cetak">Cetak Dokumen</button>
 </div>

 <div class="cuti-box">
 <table class="hdr-table">
 <tr>
 <td rowspan="3" class="hdr-logo">${logoImgTag(70)}</td>
 <td class="hdr-title-1" style="background-color:#dbeafe !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;">${headerTitle}</td>
 </tr>
 <tr>
 <td class="hdr-title-2" style="background-color:#dbeafe !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;">${COMPANY_NAME}</td>
 </tr>
 <tr>
 <td style="padding:0;">
 <table class="hdr-meta">
 <tr>
 <td>Hal : 1 dari 1</td>
 <td>No Dok : HR4</td>
 <td>Terbit/ Revisi : 1/1</td>
 <td>Tgl terbit : 1 September 2025</td>
 </tr>
 </table>
 </td>
 </tr>
 </table>

 <div class="body-section">
 <div class="sec-head">DATA KARYAWAN</div>
 <table class="data-table">
 <tr>
 <td class="lbl-col">Nama Lengkap</td>
 <td style="width: 15px;">:</td>
 <td><strong>${escapeHtml(namaKaryawan)}</strong></td>
 </tr>
 <tr>
 <td class="lbl-col">Divisi / Bagian / Unit Kerja</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(divisiDisplay)}</td>
 </tr>
 </table>

 <div class="sec-head" style="margin-top: 12px;">KETERANGAN CUTI</div>
 <table class="data-table">
 ${isHalfDay ? `
 <tr>
 <td class="lbl-col">Tanggal Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${fmtMulai}</td>
 </tr>
 <tr>
 <td class="lbl-col">Waktu Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(jamKeluar)} s/d ${escapeHtml(jamKembali)}</td>
 </tr>
 ` : `
 <tr>
 <td class="lbl-col">Tanggal Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${fmtMulai}</td>
 </tr>
 <tr>
 <td class="lbl-col">Tanggal Selesai Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${fmtSelesai}</td>
 </tr>
 `}
 <tr><td colspan="3" style="height: 6px;"></td></tr>
 <tr>
 <td class="lbl-col">Alamat & No HP Selama Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(kontak)}</td>
 </tr>
 <tr>
 <td class="lbl-col">Keterangan/Alasan</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(alasan)}</td>
 </tr>
 <tr><td colspan="3" style="height: 6px;"></td></tr>
 <tr>
 <td class="lbl-col"><strong>Sisa cuti tahunan</strong></td>
 <td style="width: 15px;">:</td>
 <td>${sisaTahunan}</td>
 </tr>
 <tr>
 <td class="lbl-col"><strong>Sisa cuti khusus</strong></td>
 <td style="width: 15px;">:</td>
 <td>${sisaKhusus}</td>
 </tr>
 <tr>
 <td class="lbl-col"><strong>Sisa cuti akumulasi</strong></td>
 <td style="width: 15px;">:</td>
 <td>${sisaAkumulasi}</td>
 </tr>
 </table>

 <div class="sig-section">
 <div class="sig-location">${locationDateStr}</div>
 <table class="sig-table">
 <tr>
 <td style="text-align: center; vertical-align: top;">
 Pemohon Cuti,
 </td>
 <td style="text-align: center; vertical-align: top;">
 Menyetujui,<br/>Atasan
 </td>
 <td style="text-align: center; vertical-align: top;">
 Mengetahui,<br/>HRD
 </td>
 </tr>
 <tr>
 <td style="height: 60px;"></td>
 <td style="height: 60px;"></td>
 <td style="height: 60px;"></td>
 </tr>
 <tr>
 <td style="text-align: center; vertical-align: bottom;">
 ( ......................... )
 </td>
 <td style="text-align: center; vertical-align: bottom;">
 ( ......................... )
 </td>
 <td style="text-align: center; vertical-align: bottom;">
 ( ......................... )
 </td>
 </tr>
 </table>
 </div>
 </div>

 <div class="notes-section">
 <div class="notes-title">Catatan dari Atasan${catatanAtasan ? `: <i>${escapeHtml(catatanAtasan)}</i>` : ""}</div>
 </div>

 <div class="notice-section">
 <div class="notice-title">Perhatikan :</div>
 <ol class="notice-list">
 <li>Surat permohonan cuti ini harus diajukan minimal 1 minggu sebelum cuti dijalankan.</li>
 <li>Sebelum ada persetujuan dari atasan, tidak diperkenankan untuk meninggalkan/mendahului cuti, kecuali sakit dengan dibuktikan dengan surat keterangan dokter atau karena keperluan yang mendesak.</li>
 </ol>
 </div>
 </div>
</body>
</html>`;
}

export async function printFormCutiFisik(item) {
 if (!item) return;
 if (typeof item === 'string') {
 try { item = JSON.parse(item); } catch (e) {}
 }

 // Open window immediately to prevent browser popup block
 const printWin = window.open("", "_blank", "width=850,height=900");
 if (!printWin) {
 if (typeof toast === "function") toast("Izin popup diblokir browser. Izinkan popup untuk membuka form cuti.", "error");
 return;
 }
 printWin.document.write("<html><body style='font-family:sans-serif;padding:40px;text-align:center;'><h3>Memuat Form Cuti Fisik...</h3><p style='color:#64748b;font-size:13px;'>Mengambil data saldo cuti dari database...</p></body></html>");

 try {
 const detail = item.detail || {};
 const namaKaryawan = item.nama_pemohon || item.nama_karyawan || item.pemohon || detail.nama_karyawan || "Karyawan";
 const nik = item.nik || item.nik_pemohon || detail.nik || "-";
 const cabang = item.cabang || detail.cabang || "-";
 const jabatan = detail.jabatan || item.jabatan || detail.divisi || "-";
 const divisi = detail.divisi || item.divisi || detail.jabatan || item.jabatan || "-";
 const jenisCuti = item.kategori_cuti || item.jenis_cuti || detail.jenis_cuti || item.type_cuti || "Cuti";
 const isHalfDay = (jenisCuti || "").toLowerCase().includes("setengah hari") || (jenisCuti || "").includes("1/2");
 
 const tglMulai = item.tanggal_mulai || detail.tanggal_mulai || item.tanggal || item.tgl || new Date().toISOString();
 const tglSelesai = item.tanggal_selesai || detail.tanggal_akhir || detail.tanggal_selesai || tglMulai;
 const alasan = item.alasan || detail.alasan || detail.keterangan || item.keterangan_cuti || "Pengajuan Cuti";
 const kontak = item.no_telepon || detail.no_telepon || detail.kontak || item.alamat_dan_hp || detail.alamat_dan_hp || "-";
 const jamKeluar = detail.jam_keluar || "-";
 const jamKembali = detail.jam_kembali || "-";
 const pejabatPengganti = item.pejabat_pengganti || detail.pejabat_pengganti || "-";
 const tglPengajuan = item.tgl || item.createdAt || new Date().toISOString();

 // Dynamically calculate accurate sisa cuti from database if not explicitly attached
 let sisaTahunan = item.sisa_tahunan ?? detail.sisa_tahunan ?? item.sisa_tahunan_display ?? null;
 let sisaKhusus = item.sisa_khusus ?? detail.sisa_khusus ?? item.sisa_khusus_display ?? null;
 let sisaAkumulasi = item.sisa_akumulasi ?? detail.sisa_akumulasi ?? item.sisa_akumulasi_display ?? null;

 if (sisaTahunan === null || sisaTahunan === undefined) {
 try {
 const allEmp = await fsGetAll(COL.MASTER_KARYAWAN);
 const kData = allEmp.find(k => 
 (k.nama_karyawan || "").trim().toLowerCase() === (namaKaryawan || "").trim().toLowerCase() ||
 (nik !== "-" && String(k.nik || k.nik_karyawan) === String(nik))
 );

 const calc = getCalculatedJatahCuti(kData);
 let jatahTahunan = calc.jatahTahunan;
 let jatahAkumulasi = calc.jatahAkumulasi;
 let jatahKhusus = calc.jatahKhusus;

 let terpakaiTahunan = 0, terpakaiAkumulasi = 0, terpakaiKhusus = 0;
 const currentYear = new Date().getFullYear();
 const allMasterCuti = await fsGetAll(COL.MASTER_CUTI);

 allMasterCuti.forEach(d => {
 if ((d.nama_karyawan || "").trim().toLowerCase() !== (namaKaryawan || "").trim().toLowerCase()) return;
 const rowYear = parseInt(d.tahun) || (d.tanggal ? new Date(d.tanggal).getFullYear() : currentYear);
 if (rowYear !== currentYear) return;
 const p = d.potong_jatah || "Tahunan";
 const cnt = parseFloat(d.count) || 1;
 if (p === "Tahunan") terpakaiTahunan += cnt;
 else if (p === "Akumulasi") terpakaiAkumulasi += cnt;
 else if (p === "Khusus") terpakaiKhusus += cnt;
 });

 sisaTahunan = Math.max(0, jatahTahunan - terpakaiTahunan);
 sisaKhusus = Math.max(0, jatahKhusus - terpakaiKhusus);
 sisaAkumulasi = Math.max(0, jatahAkumulasi - terpakaiAkumulasi);
 } catch (errCalc) {
 console.warn("Could not calculate dynamic sisa cuti:", errCalc);
 sisaTahunan = 0;
 sisaKhusus = 0;
 sisaAkumulasi = 0;
 }
 }

 const html = generateStandardFormCutiHtml({
 namaKaryawan,
 divisi,
 jabatan,
 cabang,
 jenisCuti,
 isHalfDay,
 tglMulai,
 tglSelesai,
 jamKeluar,
 jamKembali,
 kontak,
 alasan,
 sisaTahunan: sisaTahunan ?? 0,
 sisaKhusus: sisaKhusus ?? 0,
 sisaAkumulasi: sisaAkumulasi ?? 0,
 tglPengajuan,
 pejabatPengganti,
 catatanAtasan: item.catatan_atasan || detail.catatan_atasan || ""
 });

 printWin.document.open();
 printWin.document.write(html);
 printWin.document.close();
 } catch (errWin) {
 console.error("Error writing cuti form window:", errWin);
 printWin.document.write(`<html><body style='font-family:sans-serif;padding:40px;color:red;'><h3>Gagal Memuat Form Cuti</h3><p>${escapeHtml(errWin.message)}</p></body></html>`);
 }
}

export async function generateAndSaveCutiDocument(row) {
 if (!row) return null;
 const detail = row.detail || {};
 const namaKaryawan = row.nama_pemohon || row.nama_karyawan || detail.nama_karyawan || "Karyawan";
 const nik = row.nik_pemohon || row.nik || detail.nik || "-";
 const cabang = row.cabang || detail.cabang || "-";
 const jabatan = detail.jabatan || row.jabatan || "-";
 const jenisCuti = row.kategori_cuti || row.jenis_cuti || detail.jenis_cuti || row.type_cuti || "Cuti";
 const isHalfDay = (jenisCuti || "").toLowerCase().includes("setengah hari") || (jenisCuti || "").includes("1/2");
 
 const tglMulai = row.tanggal_mulai || detail.tanggal_mulai || row.tanggal || row.tgl || new Date().toISOString();
 const tglSelesai = row.tanggal_selesai || detail.tanggal_akhir || detail.tanggal_selesai || tglMulai;
 const jumlahHari = parseFloat(row.jumlah_hari || detail.jumlah_hari || row.count || (isHalfDay ? 0.5 : 1));
 const alasan = row.alasan || detail.alasan || detail.keterangan || row.keterangan_cuti || "Pengajuan Cuti Disetujui";
 const kontak = row.no_telepon || detail.no_telepon || detail.kontak || "-";
 const jamKeluar = detail.jam_keluar || "-";
 const jamKembali = detail.jam_kembali || "-";

 let pdfUrl = null;

 try {
 const { generateCutiDocViaGAS } = await import("./gas-integration.js");
 const gasRes = await generateCutiDocViaGAS({
 nama_karyawan: namaKaryawan,
 jabatan: jabatan,
 cabang: cabang,
 tanggal: tglMulai,
 tanggal_display: fmtDateShort(tglMulai),
 tgl_akhir: tglSelesai,
 tgl_akhir_display: fmtDateShort(tglSelesai),
 isHalfDay,
 count: jumlahHari,
 keterangan_cuti: alasan,
 kontak,
 jam_keluar: jamKeluar,
 jam_kembali: jamKembali,
 sisa_tahunan: 12,
 sisa_khusus: 0,
 tanggal_pengajuan: fmtDateShort(row.tgl || new Date())
 });
 if (gasRes && gasRes.pdfUrl) {
 pdfUrl = gasRes.pdfUrl;
 }
 } catch (err) {
 console.warn("GAS document creation failed or not configured, falling back to local physical document generator:", err.message);
 }

 const updateData = {
 dokumen_url: pdfUrl || "#",
 pdf_url: pdfUrl || "#",
 form_fisik_generated: true,
 form_fisik_generated_at: new Date().toISOString()
 };

 // Update DATA_PENGAJUAN
 if (row.id) {
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, updateData).catch(() => {});
 }

 // Update MASTER_CUTI if matching
 try {
 const allMaster = await fsGetAll(COL.MASTER_CUTI).catch(() => []);
 const match = allMaster.find(m => 
 (m.no_referensi && m.no_referensi === row.id) ||
 (m.nama_karyawan === namaKaryawan && m.tanggal === tglMulai)
 );
 if (match) {
 await fsUpdate(COL.MASTER_CUTI, match.id, updateData).catch(() => {});
 }
 } catch (e) {
 console.warn("Could not update MASTER_CUTI with doc URL:", e);
 }

 // Add to SIGN_DOCUMENTS so it appears in Employee Profile / Sign Documents list
 try {
 const docId = genId("DOC_CUTI");
 await fsAdd("sign_documents", {
 id: docId,
 no_referensi: row.id || docId,
 judul: `Formulir Cuti Fisik - ${namaKaryawan} (${fmtDateShort(tglMulai)})`,
 nik_penerima: nik,
 nama_penerima: namaKaryawan,
 tanggal_buat: fmtDateShort(row.tgl || new Date()),
 status: "APPROVED_FINAL",
 file_url: pdfUrl || "#",
 dokumen_url: pdfUrl || "#",
 tipe_dokumen: "FORM_CUTI_FISIK"
 }, docId).catch(() => {});
 } catch (e) {
 console.warn("Could not write sign_documents entry:", e);
 }

 return { pdfUrl };
}

if (typeof window !== "undefined") {
 window.printSalesKlaimForm = printSalesKlaimForm;
 window.printFormCutiFisik = printFormCutiFisik;
}

export function renderPengajuanDetailHtml(row, session, options = {}) {
 if (!row) return "<p class='text-slate-400'>Data tidak ditemukan</p>";
 const detail = row.detail || {};
 const isKlaimBensin = row.form_id === "F-KLAIM-BENSIN" || (row.nama_form || "").toLowerCase().includes("bensin");
 
 if (isKlaimBensin) {
 const detailList = detail.rincian_tabel || detail.rincian || detail.items || [];
 const totalKlaim = Number(detail.total_klaim || detail.grand_total || detail.total || 0);
 const HARGA_BENSIN = 10000;
 const RASIO_KM = 25;

 let totalKm = 0, totalPetrol = 0, totalParkir = 0, totalDenda = 0;

 const rowsHtml = detailList.length > 0 ? detailList.map((r, i) => {
 const kmAwal = Number(r.km_awal || 0);
 const kmAkhir = Number(r.km_akhir || 0);
 const parkir = Number(r.parkir || 0);
 const denda = Number(r.denda || 0);
 const trip = Math.max(0, kmAkhir - kmAwal);
 const petrol = Math.round(trip * (HARGA_BENSIN / RASIO_KM));
 const rowTotal = Number(r.total_baris || (petrol + parkir - denda));

 totalKm += trip;
 totalPetrol += petrol;
 totalParkir += parkir;
 totalDenda += denda;

 const catHrd = r.catatan_hrd ? `<span class="block text-[10px] text-amber-700 bg-amber-50 p-1 rounded mt-1 border border-amber-200">Rev HRD: ${escapeHtml(r.catatan_hrd)}</span>` : "";

 return `
 <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
 <td class="p-2.5 text-center font-bold text-slate-500">${i + 1}</td>
 <td class="p-2.5 font-medium text-slate-700">${escapeHtml(r.tanggal || "-")}</td>
 <td class="p-2.5 text-right font-mono">${kmAwal.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono">${kmAkhir.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono font-bold text-slate-800">${trip} KM</td>
 <td class="p-2.5 text-right font-mono text-slate-700">Rp ${petrol.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono text-slate-700">Rp ${parkir.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono text-red-600">Rp ${denda.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-slate-700">${escapeHtml(r.tujuan || r.kunjungan || "-")} ${catHrd}</td>
 <td class="p-2.5 text-right font-mono font-bold text-maroon-700 bg-slate-50">Rp ${rowTotal.toLocaleString("id-ID")}</td>
 </tr>
 `;
 }).join("") : `
 <tr><td colspan="10" class="p-6 text-center text-slate-400">Tidak ada rincian baris perjalanan.</td></tr>
 `;

 const rowJson = escapeHtml(JSON.stringify(row)).replace(/"/g, '&quot;');

 return `
 <div class="space-y-4 text-left">
 <!-- HEADER KLAIM BENSIN -->
 <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-maroon-950 text-white p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
 <div>
 <div class="flex items-center gap-2">
 <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wide">KLAIM BENSIN SALES</span>
 <span class="text-xs text-slate-300">ID: ${escapeHtml(row.id)}</span>
 </div>
 <h3 class="text-lg font-black mt-1 text-white">${escapeHtml(row.nama_pemohon)}</h3>
 <p class="text-xs text-slate-300">Area / Cabang: <span class="font-bold text-amber-300">${escapeHtml(row.cabang || detail.cabang || "Cirebon")}</span> • NIK: ${escapeHtml(row.nik || "-")}</p>
 </div>
 <div class="text-right bg-white/10 px-4 py-2.5 rounded-xl border border-white/10 w-full sm:w-auto">
 <span class="text-[10px] text-slate-300 block uppercase font-bold tracking-wider">Total Klaim</span>
 <span class="text-xl font-black text-amber-300 font-mono">Rp ${totalKlaim.toLocaleString("id-ID")}</span>
 </div>
 </div>

 <!-- TABEL RINCIAN PERJALANAN -->
 <div class="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
 <table class="w-full text-left border-collapse min-w-[750px]">
 <thead>
 <tr class="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
 <th class="p-2.5 text-center w-8">No</th>
 <th class="p-2.5">Tanggal</th>
 <th class="p-2.5 text-right">KM Awal</th>
 <th class="p-2.5 text-right">KM Akhir</th>
 <th class="p-2.5 text-right">Jarak</th>
 <th class="p-2.5 text-right">Petrol (Rp)</th>
 <th class="p-2.5 text-right">Parkir (Rp)</th>
 <th class="p-2.5 text-right">Denda (Rp)</th>
 <th class="p-2.5">Tujuan / Lokasi Kunjungan</th>
 <th class="p-2.5 text-right bg-slate-200/60 font-bold">Total Baris</th>
 </tr>
 </thead>
 <tbody>
 ${rowsHtml}
 </tbody>
 <tfoot class="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200 text-xs">
 <tr>
 <td colspan="4" class="p-3 text-right uppercase tracking-wide">TOTAL REKAP:</td>
 <td class="p-3 text-right font-mono text-slate-900">${totalKm} KM</td>
 <td class="p-3 text-right font-mono">Rp ${totalPetrol.toLocaleString("id-ID")}</td>
 <td class="p-3 text-right font-mono">Rp ${totalParkir.toLocaleString("id-ID")}</td>
 <td class="p-3 text-right font-mono text-red-600">Rp ${totalDenda.toLocaleString("id-ID")}</td>
 <td></td>
 <td class="p-3 text-right font-mono text-sm text-maroon-700 bg-amber-50">Rp ${totalKlaim.toLocaleString("id-ID")}</td>
 </tr>
 </tfoot>
 </table>
 </div>

 <!-- ACTION PRINT FORM KLAIM -->
 <div class="flex items-center justify-between p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
 <div class="text-xs text-amber-900">
 <p class="font-bold">Formulir Klaim Bensin Resmi CV Andela Jaya</p>
 <p class="text-[11px] text-amber-700">Cetak/unduh form fisik ini untuk diserahkan ke HRD & Kasir Cabang.</p>
 </div>
 <button type="button" onclick="window.printSalesKlaimForm(${rowJson})" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0">
 <span>Cetak / Download Form Klaim</span>
 </button>
 </div>
 </div>
 `;
 }

 const isCutiForm = row.form_id === "F-ISO-CUTI" || (row.nama_form || "").toLowerCase().includes("cuti") || !!row.kategori_cuti;
 if (isCutiForm && (row.status_final || "").includes("APPROVED")) {
 const rowJson = escapeHtml(JSON.stringify(row));
 const sesi = row.sesi_cuti || detail.sesi_cuti || "";
 const jamOut = row.waktu_keluar || detail.jam_keluar || "";
 const jamIn = row.waktu_masuk || detail.jam_masuk || detail.jam_kembali || "";
 return `
 <div class="space-y-4">
 <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
 <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Pemohon:</span><span class="font-bold text-slate-800">${escapeHtml(row.nama_pemohon)}</span></div>
 <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Jenis Cuti:</span><span class="font-bold text-slate-800">${escapeHtml(row.kategori_cuti || row.jenis_cuti || detail.jenis_cuti || "Cuti")}${sesi ? ` (${escapeHtml(sesi)})` : ''}</span></div>
 <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Tanggal:</span><span class="font-bold text-slate-800">${fmtDateShort(row.tanggal_mulai || detail.tanggal_mulai || row.tgl)} s/d ${fmtDateShort(row.tanggal_selesai || detail.tanggal_akhir || row.tgl)} (${row.jumlah_hari || detail.jumlah_hari || 1} Hari)</span></div>
 ${jamOut ? `<div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Jam Cuti:</span><span class="font-bold text-slate-800">${escapeHtml(jamOut)} s/d ${escapeHtml(jamIn)}</span></div>` : ''}
 <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Alasan:</span><span class="font-semibold text-slate-700">${escapeHtml(row.alasan || detail.alasan || "-")}</span></div>
 </div>

 <div class="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
 <div class="text-xs text-emerald-900">
 <p class="font-bold">Formulir Cuti Fisik Resmi (Form HR4)</p>
 <p class="text-[11px] text-emerald-700">Pengajuan ini telah Full Approved. Cetak / unduh dokumen fisik resmi untuk arsip HRD.</p>
 </div>
 <button type="button" onclick="window.printFormCutiFisik(${rowJson})" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0">
 <span>Cetak / Download Form Cuti Fisik</span>
 </button>
 </div>
 </div>
 `;
 }

 // Generic detail formatter
 const itemsHtml = Object.entries(detail).map(([k, v]) => {
 const formattedKey = escapeHtml(k.replace(/_/g, " ").toUpperCase());

 const isAttachmentKey = /lampiran|file|foto|bukti|pdf|url|doc/i.test(k);
 const isUrl = typeof v === "string" && (/^https?:\/\//i.test(v) || v.startsWith("data:"));

 if (isAttachmentKey || isUrl) {
 if (v) {
 return `
 <div class="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs">
 <span class="font-semibold text-slate-500">${formattedKey}</span>
 <button type="button" onclick="openAttachment('${escapeHtml(String(v))}')" class="px-3 py-1.5 bg-maroon-50 text-maroon-700 hover:bg-maroon-100 border border-maroon-200 rounded-lg font-bold text-xs transition flex items-center gap-1">
 <span>Lihat Lampiran</span>
 </button>
 </div>`;
 }
 return `
 <div class="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
 <span class="font-semibold text-slate-500">${formattedKey}</span>
 <span class="text-slate-400 italic">Tidak ada lampiran</span>
 </div>`;
 }

 if (Array.isArray(v)) {
 if (v.length > 0 && typeof v[0] === 'object') {
 const headers = Object.keys(v[0]);
 let tableHtml = `<div class="overflow-x-auto mt-2 border border-slate-200 rounded-xl bg-white shadow-sm"><table class="w-full text-xs text-left border-collapse"><thead class="bg-slate-50 border-b border-slate-200"><tr>`;
 headers.forEach(h => tableHtml += `<th class="p-2 font-bold text-slate-600 uppercase text-[10px]">${escapeHtml(h.replace(/_/g, " "))}</th>`);
 tableHtml += `</tr></thead><tbody class="divide-y divide-slate-100">`;
 v.forEach(itemObj => {
 tableHtml += `<tr>`;
 headers.forEach(h => {
 let val = itemObj[h];
 if (typeof val === 'number' && /total|biaya|harga|nominal|parkir|denda/i.test(h)) val = "Rp " + val.toLocaleString("id-ID");
 tableHtml += `<td class="p-2 text-slate-700 font-medium">${escapeHtml(String(val || '-'))}</td>`;
 });
 tableHtml += `</tr>`;
 });
 tableHtml += `</tbody></table></div>`;
 return `<div class="py-2 border-b border-slate-100"><span class="font-semibold text-slate-500 text-xs">${formattedKey}</span>${tableHtml}</div>`;
 }
 return `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-semibold text-slate-500">${formattedKey}</span><span class="font-bold text-slate-800">${escapeHtml(v.join(", "))}</span></div>`;
 }

 if (typeof v === "number" && /total|biaya|harga|nominal|kasbon|pinjaman/i.test(k)) {
 return `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-semibold text-slate-500">${formattedKey}</span><span class="font-bold text-slate-800 font-mono text-sm">Rp ${v.toLocaleString("id-ID")}</span></div>`;
 }

 return `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-semibold text-slate-500">${formattedKey}</span><span class="font-bold text-slate-800">${escapeHtml(String(v ?? "-"))}</span></div>`;
 }).join("");

 return `<div class="space-y-1 text-left">${itemsHtml}</div>`;
}

// Tambahkan di js/utils.js

export async function sendEmailNotif(to, subject, htmlBody, cc = "") {
 if (!to) {
 console.warn("sendEmailNotif: Alamat email tujuan tidak ditentukan.");
 return false;
 }
 const targetTo = Array.isArray(to) ? to.join(",") : String(to);
 if (!targetTo.trim()) return false;

 // Catat ke Firestore 'mail' collection (opsional, hanya berguna jika
 // extension Firebase "Trigger Email" terpasang di project ini)
 try {
 const toArray = Array.isArray(to) ? to : targetTo.split(",").map(s => s.trim()).filter(Boolean);
 fsAdd("mail", {
 to: toArray,
 message: { subject: subject, html: htmlBody },
 created_at: new Date().toISOString()
 }).catch(err => console.warn("Note: Write to Firebase mail collection queued:", err?.message));
 } catch (e) {}

 // Kirim lewat endpoint server sendiri (/api/send-email, pakai Resend) —
 // BUKAN lagi lewat Google Apps Script, karena jalur GAS sebelumnya tidak
 // pernah benar-benar mengecek apakah pengiriman berhasil atau gagal.
 try {
 const res = await fetch("/api/send-email", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ to: targetTo, subject, htmlBody, cc })
 });

 let json;
 try {
 json = await res.json();
 } catch {
 console.error("sendEmailNotif: respons /api/send-email bukan JSON valid.");
 return false;
 }

 if (!res.ok || json?.success !== true) {
 console.error("sendEmailNotif GAGAL:", json?.error || `HTTP ${res.status}`);
 return false;
 }

 console.log("Email berhasil dikirim via Resend. ID:", json.id);
 return true;

 } catch (error) {
 console.error("sendEmailNotif: gagal menghubungi /api/send-email.", error?.message || error);
 return false;
 }
}

let _html2PdfLoadingPromise = null;
export function ensureHtml2PdfLoaded() {
 if (window.html2pdf) return Promise.resolve();
 if (_html2PdfLoadingPromise) return _html2PdfLoadingPromise;
 _html2PdfLoadingPromise = new Promise((resolve, reject) => {
 const script = document.createElement("script");
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
 script.onload = () => resolve();
 script.onerror = () => reject(new Error("Gagal memuat library PDF (html2pdf)."));
 document.head.appendChild(script);
 });
 return _html2PdfLoadingPromise;
}

export async function downloadHtmlAsPdf(htmlContent, filename = "document.pdf", orientation = "portrait") {
 await ensureHtml2PdfLoaded();
 const isLandscape = orientation === "landscape";
 
 // Standard A4 dimensions in px at 96 DPI:
 // Portrait: 210mm = 794px
 // Landscape: 297mm = 1122px
 const widthPx = isLandscape ? 1122 : 794;

 const prevScrollX = window.scrollX;
 const prevScrollY = window.scrollY;

 // Clean container positioned behind active view so html2canvas renders exact coordinates without blank pages
 const element = document.createElement("div");
 element.style.position = "fixed";
 element.style.left = "0px";
 element.style.top = "0px";
 element.style.zIndex = "999999";
 element.style.opacity = "1";
 element.style.pointerEvents = "none";
 element.style.width = widthPx + "px";
 element.style.padding = "10px 15px";
 element.style.margin = "0px";
 element.style.background = "#ffffff";
 element.style.color = "#000000";
 element.style.fontFamily = "'Times New Roman', Times, serif";
 element.style.boxSizing = "border-box";
 element.innerHTML = htmlContent;
 
 document.body.appendChild(element);

 // Give browser time to process font/layout rendering
 await new Promise((resolve) => setTimeout(resolve, 350));

 const opt = {
 margin: isLandscape ? [6, 6, 6, 6] : [6, 6, 6, 6], // top, left, bottom, right in mm
 filename: filename,
 image: { type: 'jpeg', quality: 0.98 },
 html2canvas: { 
 scale: 2, 
 useCORS: true, 
 logging: false,
 backgroundColor: "#ffffff",
 windowWidth: widthPx,
 scrollX: 0,
 scrollY: 0,
 x: 0,
 y: 0
 },
 jsPDF: { unit: 'mm', format: 'a4', orientation: orientation },
 pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
 };

 try {
 await window.html2pdf().from(element).set(opt).save();
 } catch (err) {
 console.error("Gagal men-generate PDF:", err);
 throw err;
 } finally {
 if (element.parentNode) {
 element.parentNode.removeChild(element);
 }
 window.scrollTo(prevScrollX, prevScrollY);
 }
}

export async function sendFCMNotif(tokens, title, body, link = "") {
 const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
 if (!list.length) return false;
 
 // Ambil nama domain otomatis (contoh: https://hris.andelajaya.com)
 const baseUrl = window.location.origin;
 const targetLink = link ? (baseUrl + link) : baseUrl;

 try {
 const res = await fetch("/api/send-push", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 // Kirim targetLink ke Vercel
 body: JSON.stringify({ tokens: list, title, body, link: targetLink }) 
 });
 
 return res.ok;
 } catch (e) {
 console.error("Gagal mengirim notif: ", e.message);
 return false;
 }
}

/* ---------------------------------------------------------------------
 * NOTIFICATION DEDUPARATION ENGINE & PUSH/EMAIL NOTIFIERS
 * Prevent double/duplicate notifications across all modules
 * ------------------------------------------------------------------- */
const recentNotifsMap = new Map();

function isDuplicateNotification(targetKey, judul, pesan, link = "") {
 const now = Date.now();
 for (const [k, time] of recentNotifsMap.entries()) {
 if (now - time > 15000) recentNotifsMap.delete(k);
 }
 const cleanTarget = String(targetKey || "").trim().toLowerCase();
 const cleanJudul = String(judul || "").trim().toLowerCase();
 const cleanPesan = String(pesan || "").trim().toLowerCase();
 const cleanLink = String(link || "").trim().toLowerCase();
 const hashKey = `${cleanTarget}::${cleanJudul}::${cleanPesan}::${cleanLink}`;
 if (recentNotifsMap.has(hashKey)) {
 return true;
 }
 recentNotifsMap.set(hashKey, now);
 return false;
}

/**
 * Helper terpadu utk 1 target user: menulis notif lonceng (in-app) +
 * mengirim push ke HP-nya sekaligus, berdasar fcm_token yg tersimpan
 * di dokumen Users. Dipakai di seluruh modul yg butuh notif per-orang.
 */
export async function notifyUser(username, judul, pesan, link = "") {
 if (!username) return;
 let targetEmail = (typeof username === "object" && username.email) ? username.email : null;
 let targetName = (typeof username === "object" && username.nama) ? username.nama : null;
 let targetNik = (typeof username === "object" && username.nik) ? username.nik : null;
 const rawTarget = typeof username === "object" ? (username.username || username.nama || username.id) : username;
 if (!rawTarget) return;

 const targetStr = String(rawTarget).trim();
 const targetLower = targetStr.toLowerCase();
 if (!targetEmail && targetStr.includes("@")) {
 targetEmail = targetStr;
 }
 if (!targetName) targetName = targetStr;

 const dedupKey = targetEmail || targetStr || targetName;
 if (isDuplicateNotification(dedupKey, judul, pesan, link)) {
 console.warn("[notifyUser] Notifikasi terdeteksi duplikat, dilewati:", dedupKey, judul);
 return;
 }

 try {
 const tokens = new Set();
 let resolvedUsername = targetStr;
 let resolvedNik = targetNik || targetStr;

 // Search USERS doc directly by ID
 let snap = await getDoc(doc(db, COL.USERS, String(rawTarget))).catch(() => null);
 if (snap && snap.exists()) {
 const uData = snap.data();
 targetName = uData.nama || targetName;
 resolvedUsername = uData.username || snap.id || resolvedUsername;
 resolvedNik = uData.nik || resolvedNik;
 if (Array.isArray(uData.fcm_tokens)) uData.fcm_tokens.forEach(t => t && tokens.add(t));
 if (uData.fcm_token) tokens.add(uData.fcm_token); // kompatibilitas data lama
 if (uData.email && !targetEmail) targetEmail = uData.email;
 }

 // Query USERS by username, nama, or nik
 try {
 const qUsers = query(collection(db, COL.USERS));
 const snapUsers = await getDocs(qUsers);
 snapUsers.docs.forEach(d => {
 const uData = d.data();
 const dId = d.id;
 const uName = (uData.username || dId || "").trim();
 const uNama = (uData.nama || "").trim();
 const uNik = (uData.nik || "").trim();

 const matches = dId.toLowerCase() === targetLower ||
 uName.toLowerCase() === targetLower ||
 (uNama && uNama.toLowerCase() === targetLower) ||
 (uNik && uNik.toLowerCase() === targetLower);
 if (matches) {
 if (uName) resolvedUsername = uName;
 if (uNama && !targetName) targetName = uNama;
 if (uNik) resolvedNik = uNik;
 if (Array.isArray(uData.fcm_tokens)) uData.fcm_tokens.forEach(t => t && tokens.add(t));
 if (uData.fcm_token) tokens.add(uData.fcm_token); // kompatibilitas data lama
 if (uData.email && !targetEmail) targetEmail = uData.email;
 }
 });
 } catch (e) {}

 // Query MASTER_KARYAWAN by nama_karyawan, nik, or id
 try {
 const qK = query(collection(db, COL.MASTER_KARYAWAN));
 const snapK = await getDocs(qK);
 snapK.docs.forEach(d => {
 const kData = d.data();
 const kNama = (kData.nama_karyawan || kData.nama || "").trim();
 const kNik = (kData.nik_karyawan || kData.nik || "").trim();

 const matches = d.id.toLowerCase() === targetLower ||
 (kNik && kNik.toLowerCase() === targetLower) ||
 (kNama && kNama.toLowerCase() === targetLower) ||
 (targetName && kNama && kNama.toLowerCase() === targetName.toLowerCase());
 if (matches) {
 if (kNama && !targetName) targetName = kNama;
 if (kNik) resolvedNik = kNik;
 if (Array.isArray(kData.fcm_tokens)) kData.fcm_tokens.forEach(t => t && tokens.add(t));
 if (kData.fcm_token) tokens.add(kData.fcm_token); // kompatibilitas data lama
 if (kData.email && !targetEmail) targetEmail = kData.email;
 }
 });
 } catch (e) {}

 // 1. In-App Notification (lonceng)
 // Paksa jadi string dulu -- field 'nik'/'username'/'nama' di Firestore kadang
 // tersimpan sebagai Number (mis. hasil migrasi Excel), yang akan bikin
 // .toLowerCase() crash kalau dipanggil langsung di atas tipe Number.
 const safeUsername = String(resolvedUsername ?? "").trim();
 const safeName = String(targetName ?? "").trim();
 const safeNik = String(resolvedNik ?? "").trim();

 const notifPayload = {
 username_target: safeUsername,
 nama_target: safeName,
 nik_target: safeNik,
 target_aliases: Array.from(new Set([targetStr, targetLower, safeUsername, safeUsername.toLowerCase(), safeName, safeName.toLowerCase(), safeNik, safeNik.toLowerCase()])).filter(Boolean),
 judul,
 pesan,
 link: link || "",
 dibaca: false,
 tanggal: new Date().toISOString()
 };
 await fsAdd(COL.NOTIFICATIONS, notifPayload, genId("NTF"));

 // 2. Send Push Notification via FCM
 const tokenList = Array.from(tokens).filter(Boolean);
 if (tokenList.length > 0) {
 await sendFCMNotif(tokenList, judul, pesan, link).catch(e => console.warn("FCM push error:", e));
 }

 // 3. Send Email
 if (targetEmail) {
 const appUrl = window.location.origin;
 let magicToken = "";
 if (resolvedUsername) {
 try { magicToken = await createLoginToken(resolvedUsername); } catch (e) {}
 }
 
 let routePath = link || "";
 if (routePath.startsWith('/')) routePath = routePath.substring(1);
 if (!routePath.startsWith('#')) routePath = '#' + routePath;

 const targetLink = magicToken 
 ? `${appUrl}/${routePath}${routePath.includes('?') ? '&' : '?'}token=${magicToken}`
 : `${appUrl}/${routePath}`;

 const htmlBody = `
 <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding:24px; color:#1e293b; max-width:600px; border:1px solid #e2e8f0; border-radius:16px; background-color:#ffffff; margin:0 auto;">
 <div style="border-bottom:2px solid #7a1f2b; padding-bottom:12px; margin-bottom:20px;">
 <h2 style="color:#7a1f2b; margin:0; font-size:18px; font-weight:bold;">HRIS & Operasional CV Andela Jaya</h2>
 </div>
 <h3 style="color:#0f172a; margin-top:0; font-size:16px;">${escapeHtml(judul)}</h3>
 <p style="font-size:14px; line-height:1.6; color:#334155;">Halo <strong>${escapeHtml(targetName)}</strong>,</p>
 <p style="font-size:14px; line-height:1.6; color:#334155; background-color:#f8fafc; padding:14px; border-radius:10px; border:1px solid #f1f5f9;">${escapeHtml(pesan)}</p>
 <div style="margin-top:24px; text-align:center;">
 <a href="${targetLink}" style="background-color:#7a1f2b; color:#ffffff; padding:12px 24px; border-radius:10px; text-decoration:none; font-weight:bold; font-size:13px; display:inline-block; box-shadow:0 2px 4px rgba(0,0,0,0.1);">Buka HRIS & Lihat Rincian</a>
 </div>
 <hr style="margin-top:30px; border:0; border-top:1px solid #e2e8f0;" />
 <p style="font-size:11px; color:#94a3b8; text-align:center;">Pesan ini dikirimkan secara otomatis oleh sistem Portal HRIS CV Andela Jaya.</p>
 </div>
 `;
 await sendEmailNotif(targetEmail, `[HRIS Update] ${judul}`, htmlBody);
 }
 } catch (e) {
 console.warn("Gagal mengirim notifikasi ke " + rawTarget, e);
 }
}

export async function createLoginToken(username) {
 const token = genId("TKN") + "-" + Math.random().toString(36).slice(2, 10);
 await fsAdd("login_tokens", {
 username: username, used: false, createdAt: Date.now()
 }, token);
 return token;
}

export async function getTargetsForRole(role, namaKaryawan = "") {
 try {
 const roleUpper = (role || "").toUpperCase().trim();
 const cleanNama = (namaKaryawan || "").trim().toLowerCase();

 const allUsers = await fsGetAll(COL.USERS).catch(() => []);
 const allEmployees = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);

 const enrichTarget = (u) => {
 if (!u) return null;
 const uId = u.username || u.id || u.nik;
 const uNama = u.nama || u.nama_karyawan || u.username || uId;
 let email = u.email || "";
 let nik = u.nik || u.nik_karyawan || "";

 const empMatch = allEmployees.find(k => 
 (k.nik_karyawan || k.nik || "").toString().toLowerCase() === String(nik).toLowerCase() ||
 (k.nama_karyawan || k.nama || "").trim().toLowerCase() === String(uNama).trim().toLowerCase() ||
 (k.id || "").toString().toLowerCase() === String(uId).toLowerCase() ||
 (k.username || "").toString().toLowerCase() === String(uId).toLowerCase()
 );
 if (empMatch) {
 if (!email && empMatch.email) email = empMatch.email;
 if (!nik && (empMatch.nik_karyawan || empMatch.nik)) nik = empMatch.nik_karyawan || empMatch.nik;
 }

 return {
 username: u.username || uId,
 email: email || "",
 nama: uNama,
 nik: nik
 };
 };

 // 1. PEMOHON
 if (roleUpper === "PEMOHON" && cleanNama) {
 const uMatch = allUsers.find(u => 
 (u.nama || "").trim().toLowerCase() === cleanNama ||
 (u.username || "").trim().toLowerCase() === cleanNama
 );
 if (uMatch) {
 const enriched = enrichTarget(uMatch);
 if (enriched) return [enriched];
 }
 const kMatch = allEmployees.find(k => (k.nama_karyawan || k.nama || "").trim().toLowerCase() === cleanNama);
 if (kMatch) {
 return [{ username: kMatch.username || kMatch.id || kMatch.nik, email: kMatch.email || "", nama: kMatch.nama_karyawan || kMatch.nama, nik: kMatch.nik_karyawan || kMatch.nik }];
 }
 return [];
 }

 // 2. ATASAN
 if (roleUpper === "ATASAN" && cleanNama) {
 const kData = allEmployees.find(k => (k.nama_karyawan || k.nama || "").trim().toLowerCase() === cleanNama);
 let namaAtasan = kData ? (kData.atasan || kData.atasan_langsung || kData.atasan_1 || kData.nama_atasan || kData.head || "") : "";
 
 if (namaAtasan) {
 const cleanAtasan = namaAtasan.trim().toLowerCase();
 const uAtasan = allUsers.find(u => 
 (u.nama || "").trim().toLowerCase() === cleanAtasan ||
 (u.username || "").trim().toLowerCase() === cleanAtasan
 );
 if (uAtasan) return [enrichTarget(uAtasan)];

 const kAtasan = allEmployees.find(k => (k.nama_karyawan || k.nama || "").trim().toLowerCase() === cleanAtasan);
 if (kAtasan) {
 const matchedUser = allUsers.find(u => (u.nama || "").trim().toLowerCase() === cleanAtasan || (u.username || "").toLowerCase() === (kAtasan.username || kAtasan.id || "").toLowerCase());
 return [{
 username: matchedUser?.username || kAtasan.username || kAtasan.id || kAtasan.nik,
 email: matchedUser?.email || kAtasan.email || "",
 nama: kAtasan.nama_karyawan || kAtasan.nama,
 nik: kAtasan.nik_karyawan || kAtasan.nik
 }];
 }
 }

 // Kalau atasan spesifik tidak ditemukan, JANGAN broadcast ke siapa saja
 // yang kebetulan jabatannya mengandung kata manajerial (bisa kena banyak
 // orang tak terkait & bocorkan pengajuan pribadi). Fallback aman: HRD saja.
 const fallbackApprovers = allUsers.filter(u => {
 const r = (u.role || "").toUpperCase();
 return r === "HRD" || r.includes("HRD");
 });

 if (fallbackApprovers.length > 0) {
 return fallbackApprovers.map(enrichTarget).filter(Boolean);
 }
 }

 // 3. SPECIFIC ROLE (GM, HRD, FINANCE, MANAGER, SPV, etc.)
 const searchAliases = [roleUpper];
 if (roleUpper === "GM" || roleUpper === "GENERAL MANAGER") {
 searchAliases.push("GM", "GENERAL MANAGER");
 } else if (roleUpper === "HRD" || roleUpper === "HR") {
 searchAliases.push("HRD", "HR", "HUMAN RESOURCE", "ADMIN");
 } else if (roleUpper === "FINANCE" || roleUpper === "ACCOUNTING") {
 searchAliases.push("FINANCE", "ACCOUNTING", "KEUANGAN");
 } else if (roleUpper === "SPV" || roleUpper === "SUPERVISOR") {
 searchAliases.push("SPV", "SUPERVISOR");
 } else if (roleUpper === "MANAGER" || roleUpper === "MANAJER") {
 searchAliases.push("MANAGER", "MANAJER");
 }

 const matchedUsers = allUsers.filter(u => {
 const r = (u.role || "").toUpperCase();
 const p = (u.posisi || u.jabatan || "").toUpperCase();
 const un = (u.username || u.id || "").toUpperCase();
 const nm = (u.nama || "").toUpperCase();
 return searchAliases.some(alias => r === alias || r.includes(alias) || p.includes(alias) || un.includes(alias) || nm.includes(alias));
 });

 const matchedEmps = allEmployees.filter(k => {
 const j = (k.jabatan || k.role || k.posisi || "").toUpperCase();
 const nm = (k.nama_karyawan || k.nama || "").toUpperCase();
 return searchAliases.some(alias => j.includes(alias) || nm.includes(alias));
 });

 const targets = [];
 matchedUsers.forEach(u => {
 const t = enrichTarget(u);
 if (t) targets.push(t);
 });

 matchedEmps.forEach(k => {
 const kNama = (k.nama_karyawan || k.nama || "").trim().toLowerCase();
 const exists = targets.some(t => t.nama.toLowerCase() === kNama || (k.email && t.email.toLowerCase() === k.email.toLowerCase()));
 if (!exists) {
 const u = allUsers.find(user => (user.nama || "").trim().toLowerCase() === kNama || (user.username || "").toLowerCase() === (k.username || k.id || "").toLowerCase());
 targets.push({
 username: u?.username || k.username || k.id || k.nik_karyawan,
 email: u?.email || k.email || "",
 nama: k.nama_karyawan || k.nama,
 nik: k.nik_karyawan || k.nik
 });
 }
 });

 if (targets.length > 0) {
 return targets.filter((v, i, a) => a.findIndex(v2 => (v2.username && v2.username === v.username) || (v2.email && v2.email === v.email)) === i);
 }

 // Sama seperti fallback ATASAN di atas: kalau role spesifik (GM/Finance/
 // Manager/dst) tidak ketemu siapa pun, jangan sasar banyak role sekaligus.
 // Fallback aman: HRD saja.
 let fallbackUsers = allUsers.filter(u => (u.role || "").toUpperCase().includes("HRD"));

 return fallbackUsers.map(enrichTarget).filter(Boolean);

 } catch (error) {
 console.error("Error getTargetsForRole:", error);
 return [];
 }
}

/* ---------------------------------------------------------------------
 * PERHITUNGAN JATAH CUTI SESUAI SK No.018/HRGA-AJ/XII/2024
 * ------------------------------------------------------------------- */
export function getCalculatedJatahCuti(emp) {
 if (!emp) return { jatahTahunan: 12, jatahKhusus: 4, jatahAkumulasi: 0 };

 const explicitTahunan = emp.jatah_cuti_tahunan ?? emp.jatah_tahunan;
 const explicitKhusus = emp.jatah_cuti_khusus ?? emp.jatah_khusus;
 const explicitAkumulasi = emp.jatah_cuti_akumulasi ?? emp.jatah_akumulasi;

 let jatahTahunan = (explicitTahunan !== undefined && explicitTahunan !== null && explicitTahunan !== "") 
 ? toNumber(explicitTahunan) 
 : null;
 let jatahKhusus = (explicitKhusus !== undefined && explicitKhusus !== null && explicitKhusus !== "") 
 ? toNumber(explicitKhusus) 
 : 4;
 let jatahAkumulasi = (explicitAkumulasi !== undefined && explicitAkumulasi !== null && explicitAkumulasi !== "") 
 ? toNumber(explicitAkumulasi) 
 : 0;

 if (jatahTahunan === null && emp.tanggal_join) {
 const join = smartParseDate(emp.tanggal_join);
 if (join) {
 const now = new Date();
 const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
 const tenureYears = diffMonths / 12;

 if (diffMonths >= 12) {
 jatahTahunan = 12;
 if (tenureYears >= 11) jatahTahunan += 4; // > 10 thn (>= 11 thn): +4 (total 16)
 else if (tenureYears >= 10) jatahTahunan += 3; // 10 thn: +3 (total 15)
 else if (tenureYears >= 8) jatahTahunan += 2; // 8 thn: +2 (total 14)
 else if (tenureYears >= 6) jatahTahunan += 1; // 6 thn: +1 (total 13)
 } else if (diffMonths >= 3) {
 // Masa kerja < 1 tahun (3-11 bulan): Cuti tahunan proporsional (1 hari/bulan)
 jatahTahunan = diffMonths;
 } else {
 // Masa kerja < 3 bulan: belum berhak cuti tahunan
 jatahTahunan = 0;
 }
 }
 }

 if (jatahTahunan === null || jatahTahunan === undefined) {
 jatahTahunan = 12;
 }

 return { jatahTahunan, jatahKhusus, jatahAkumulasi };
}

/* ---------------------------------------------------------------------
 * 9. WORKFLOW ENGINE — helper dinamis untuk field formulir (termasuk
 * tipe "file"/foto) dan Laporan Pertanggungjawaban (LPJ).
 * Dipakai bersama oleh pengajuan.js (form pengajuan) dan riwayat.js
 * (form isi LPJ) supaya render input & upload file konsisten di semua
 * modul yang memakai Form Builder — termasuk modul baru di masa depan.
 * ------------------------------------------------------------------- */

/** Render satu <input>/<select>/<textarea> untuk definisi field dinamis `f`. */
export function dynFieldInputHtml(f) {
 const base = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition bg-white";
 const req = f.required ? "required" : "";
 if (f.formula) return `<input type="text" name="${f.name}" data-formula="${escapeHtml(f.formula)}" readonly class="${base} bg-slate-50 text-slate-500 cursor-not-allowed font-semibold" value="0">`;

 switch (f.type) {
 case "textarea": return `<textarea name="${f.name}" rows="3" class="${base}" placeholder="Tulis rincian..." ${req}></textarea>`;
 case "select": return `<select name="${f.name}" class="${base}" ${req}>
 <option value="">Pilih ${escapeHtml(f.label || "")}</option>
 ${(f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
 </select>`;
 case "date": return `<input type="date" name="${f.name}" class="${base}" ${req}>`;
 case "time": return `<input type="time" name="${f.name}" class="${base}" ${req}>`;
 case "datetime-local": return `<input type="datetime-local" name="${f.name}" class="${base}" ${req}>`;
 case "scale": {
 const min = parseInt(f.min_scale) || 1;
 const max = parseInt(f.max_scale) || 5;
 const minLbl = f.min_label || "Sangat Kurang";
 const maxLbl = f.max_label || "Sangat Baik";
 const items = [];
 for (let val = min; val <= max; val++) {
 items.push(`
 <label class="flex-1 min-w-[36px] sm:min-w-[42px] text-center cursor-pointer">
 <input type="radio" name="${f.name}" value="${val}" ${req} class="peer sr-only">
 <div class="py-2 px-1 sm:px-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs peer-checked:bg-maroon-700 peer-checked:text-white peer-checked:border-maroon-700 hover:border-maroon-300 transition shadow-sm text-center">
 ${val}
 </div>
 </label>
 `);
 }
 return `
 <div class="space-y-2 p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
 <div class="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
 ${items.join("")}
 </div>
 <div class="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-1">
 <span class="text-slate-600">① ${escapeHtml(minLbl)}</span>
 <span class="text-slate-600">⑤ ${escapeHtml(maxLbl)}</span>
 </div>
 </div>
 `;
 }
 case "radio": {
 const opts = f.options && f.options.length ? f.options : ["Ya", "Tidak"];
 return `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
 ${opts.map(o => `
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition">
 <input type="radio" name="${f.name}" value="${escapeHtml(o)}" ${req} class="text-maroon-700 focus:ring-maroon-500">
 <span class="text-xs font-semibold text-slate-700">${escapeHtml(o)}</span>
 </label>
 `).join("")}
 </div>
 `;
 }
 case "checkbox": {
 const opts = f.options || [];
 if (opts.length > 0) {
 return `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
 ${opts.map(o => `
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition">
 <input type="checkbox" name="${f.name}" value="${escapeHtml(o)}" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-500">
 <span class="text-xs font-semibold text-slate-700">${escapeHtml(o)}</span>
 </label>
 `).join("")}
 </div>
 `;
 }
 return `
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition">
 <input type="checkbox" name="${f.name}" value="Ya" ${req} class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-500">
 <span class="text-xs font-semibold text-slate-700">${escapeHtml(f.label || "Ya / Setuju")}</span>
 </label>
 `;
 }
 case "number": return `<input type="number" step="any" name="${f.name}" class="${base}" placeholder="0" ${req}>`;
 case "file": return `<input type="file" name="${f.name}" accept="image/*,.pdf" class="${base} bg-white" ${req}>
 <p class="text-[11px] text-slate-400 mt-1">Upload foto/dokumen (JPG, PNG, atau PDF, maks 5MB).</p>`;
 default: return `<input type="text" name="${f.name}" class="${base}" placeholder="Isi ${escapeHtml(f.label || "")}" ${req}>`;
 }
}

/** Wrapper lengkap (label + input + hint show_if) untuk satu field dinamis. */
export function dynFieldWrapperHtml(f) {
 const req = f.required ? ' <span class="text-red-500">*</span>' : "";
 return `
 <div data-field-wrap="${f.name}" class="${f.show_if ? "hidden" : ""}">
 <label class="block text-xs font-medium text-slate-500 mb-1.5">${escapeHtml(f.label || f.name)}${req}</label>
 ${dynFieldInputHtml(f)}
 ${f.formula ? `<p class="text-[11px] text-slate-400 mt-1">Dihitung otomatis: ${escapeHtml(f.formula)}</p>` : ""}
 </div>`;
}

/** Pasang listener show_if (tampil-kondisional) + formula (kalkulasi otomatis) pada sebuah <form>. */
export function wireDynFormLogic(form, fields) {
 const recompute = () => {
 const fd = new FormData(form);
 const values = {};
 fields.forEach(f => values[f.name] = fd.get(f.name));

 fields.forEach(f => {
 if (!f.show_if) return;
 const wrap = form.querySelector(`[data-field-wrap="${f.name}"]`);
 if (!wrap) return;
 const show = String(values[f.show_if.field] || "") === String(f.show_if.value);
 wrap.classList.toggle("hidden", !show);
 // Field yang sedang disembunyikan tidak boleh memblokir submit via `required`
 const input = wrap.querySelector(`[name="${f.name}"]`);
 if (input) input.dataset.origRequired = input.dataset.origRequired ?? (input.required ? "1" : "0");
 if (input) input.required = show && input.dataset.origRequired === "1";
 });

 fields.forEach(f => {
 if (!f.formula) return;
 const input = form.querySelector(`[name="${f.name}"]`);
 const result = evalFormula(f.formula, values);
 if (input) input.value = result === null ? "0" : result.toLocaleString("id-ID", { maximumFractionDigits: 2 });
 });
 };
 form.addEventListener("input", recompute);
 recompute();
}

/**
 * Kumpulkan nilai form (termasuk upload file ke Google Drive) menjadi
 * satu object `detail`. File diupload ke subfolder Drive `pathPrefix`
 * (mis. "Pengajuan/TRX-123" atau "LPJ/TRX-123") lewat Apps Script Web
 * App (lihat js/gas-integration.js), dan hasilnya berupa URL Drive.
 * PERUBAHAN: sebelumnya file diupload ke Firebase Storage.
 * @param {HTMLFormElement} form
 * @param {Array} fields definisi field (name, type, required, label)
 * @param {string} pathPrefix mis. "Pengajuan/TRX-123" atau "LPJ/TRX-123"
 */
export async function collectDynFormDetail(form, fields, pathPrefix) {
 const fd = new FormData(form);
 const detail = {};
 for (const f of fields) {
 if (f.type === "file") {
 const fileInput = form.querySelector(`[name="${f.name}"]`);
 const file = fileInput && fileInput.files && fileInput.files[0];
 if (file) {
 if (file.size > 5 * 1024 * 1024) throw new Error(`File untuk "${f.label || f.name}" melebihi 5MB.`);
 detail[f.name] = await uploadFileToDrive(file, pathPrefix);
 } else {
 detail[f.name] = "";
 }
 } else if (f.type === "checkbox") {
 const vals = fd.getAll(f.name).filter(Boolean);
 detail[f.name] = vals.length > 1 ? vals.join(", ") : (vals[0] ?? "");
 } else {
 detail[f.name] = fd.get(f.name) ?? "";
 }
 }
 return detail;
}

/**
 * Format sebuah tanggal (Date, Firestore Timestamp, atau string) ke
 * "YYYY-MM-DD" SELALU dalam zona waktu Asia/Jakarta (WIB) -- BUKAN zona
 * waktu sistem perangkat yang menjalankan kode ini. Kalau dipanggil
 * tanpa argumen, defaultnya "hari ini" (WIB).
 *
 * PENTING (bug yang diperbaiki): sebelumnya beberapa tempat memakai
 * `new Date().toISOString().substring(0,10)` (zona UTC) atau
 * `.getDate()/.getMonth()` (zona waktu SISTEM PERANGKAT). Keduanya bisa
 * meleset dari WIB tergantung jam & timezone perangkat yang dipakai
 * membuka aplikasi. Dipakai untuk SEMUA perbandingan "hari ini" (Cuti
 * Hari Ini, personalisasi ulang tahun/anniversary/cuti di dashboard).
 */
export function localDateStr(value) {
 const v = value === undefined ? new Date() : value;
 if (v === null || v === "") return null;
 const d = v && typeof v.toDate === "function" ? v.toDate() : new Date(v);
 if (isNaN(d)) return null;
 return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Format nomor telepon ke format internasional WhatsApp (628xxx)
 */
export function formatPhoneNumberForWa(phone) {
 if (!phone) return "";
 let clean = String(phone).replace(/[^0-9]/g, "");
 if (!clean) return "";
 if (clean.startsWith("0")) {
 clean = "62" + clean.substring(1);
 } else if (clean.startsWith("8")) {
 clean = "62" + clean;
 } else if (!clean.startsWith("62")) {
 clean = "62" + clean;
 }
 return clean;
}

/**
 * Membuka link WhatsApp (wa.me atau api.whatsapp.com) dengan pesan yang di-encode
 */
export function openWhatsAppMessage(phone, message) {
 const cleanPhone = formatPhoneNumberForWa(phone);
 const encodedMsg = encodeURIComponent(message);
 let url = "";
 if (cleanPhone) {
 url = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
 } else {
 url = `https://api.whatsapp.com/send?text=${encodedMsg}`;
 }
 window.open(url, "_blank");
}

/**
 * Mencari nomor HP/WA karyawan dari MASTER_KARYAWAN berdasarkan nama karyawan
 * dan mengembalikan dalam format kode negara Indonesia (62xxx).
 */
export async function getEmployeePhoneByName(namaKaryawan) {
 if (!namaKaryawan) return "";
 try {
 const list = await fsGetAll(COL.MASTER_KARYAWAN);
 const targetName = String(namaKaryawan).toLowerCase().trim();
 const found = list.find(k => {
 const n = String(k.nama_karyawan || k.nama || k.nama_lengkap || "").toLowerCase().trim();
 return n === targetName || (n && targetName && (n.includes(targetName) || targetName.includes(n)));
 });
 const rawPhone = found ? (found.no_hp_aktif || found.no_telepon || found.no_hp || found.hp || found.whatsapp || "") : "";
 return formatPhoneNumberForWa(rawPhone);
 } catch (err) {
 console.warn("Gagal mengambil no_hp karyawan:", err);
 return "";
 }
}

/**
 * Menyusun template pesan WhatsApp untuk Tugas / Hasil Penilaian KPI 360
 */
export function buildKpiTaskWaMessage(task, type = "ASSIGNMENT", extra = {}) {
 const baseUrl = window.location.origin + window.location.pathname;
 const deadlineStr = task.deadline ? fmtDateShort(task.deadline) : "-";
 const catLabel = task.kategori_penilaian ? task.kategori_penilaian.replace(/_/g, " ") : "KPI 360";

 if (type === "ASSIGNMENT") {
 const magicLink = extra.magicLink || `${baseUrl}#penilaian-kontrak?tab=kpi360`;
 let msg = `*TUGAS PENILAIAN KPI 360 - CV ANDELA JAYA*\n\n`;
 msg += `Halo *${task.nama_penilai || "Bapak/Ibu"}*,\n`;
 msg += `Anda telah ditugaskan untuk melakukan Penilaian KPI 360 pada periode *${task.periode || "-"}* terhadap karyawan berikut:\n`;
 msg += `👤 *${task.nama_dinilai || "-"}*\n\n`;
 msg += `📋 *Detail Penugasan:*\n`;
 msg += `• Periode: ${task.periode || "-"}\n`;
 msg += `• Kategori: ${catLabel}\n`;
 msg += `• Batas Waktu: ${deadlineStr}\n\n`;
 msg += `Silakan klik link berikut untuk login & mengisi penilaian:\n`;
 msg += `${magicLink}\n\n`;
 if (extra.penilaiUsername) {
 msg += `_Kredensial Akses_:\n`;
 msg += `• Username: \`${extra.penilaiUsername}\`\n\n`;
 }
 msg += `Terima kasih,\n*Tim HRD CV Andela Jaya*`;
 return msg;
 } else if (type === "RESULT") {
 const portalLink = `${baseUrl}#penilaian-kontrak?tab=grafik`;
 let msg = `*HASIL PENILAIAN KPI - CV ANDELA JAYA*\n\n`;
 msg += `Halo *${task.nama_dinilai || "Karyawan"}*,\n`;
 msg += `Hasil Penilaian Kinerja (KPI 360) Anda untuk periode *${task.periode || "-"}* telah selesai dievaluasi.\n\n`;
 msg += `📊 *Ringkasan Hasil Penilaian:*\n`;
 msg += `• Kategori: ${catLabel}\n`;
 msg += `• Skor Akhir: *${task.skor_akhir ?? task.total_skor ?? 0}*\n`;
 if (task.rekomendasi || task.keputusan) {
 msg += `• Rekomendasi/Keputusan: *${task.rekomendasi || task.keputusan}*\n`;
 }
 msg += `• Penilai: ${task.nama_penilai || "-"}\n\n`;
 if (task.catatan_baik) {
 msg += `✅ *Hal yang Sudah Baik:*\n${task.catatan_baik}\n\n`;
 }
 if (task.catatan_perbaikan) {
 msg += `🎯 *Area Peningkatan:*\n${task.catatan_perbaikan}\n\n`;
 }
 msg += `Rincian lengkap & grafik evaluasi dapat Anda akses di Portal HRIS:\n`;
 msg += `${portalLink}\n\n`;
 msg += `Terima kasih dan tetap tingkatkan kinerja terbaik Anda! 🙏\n`;
 msg += `*Tim HRD CV Andela Jaya*`;
 return msg;
 }
 return "";
}


/**
 * Menyusun template pesan undangan login untuk Karyawan
 */
export function buildEmployeeInviteMessage(empData, username, password, portalUrl) {
  const nama = empData?.nama_karyawan || empData?.nama || "Karyawan";
  const url = portalUrl || (window.location.origin + window.location.pathname);
  
  let msg = `*UNDANGAN AKSES SISTEM HRIS - ${COMPANY_NAME}*

`;
  msg += `Halo *${nama}*,

`;
  msg += `Anda diundang untuk mengakses Portal Sistem Informasi SDM & HRIS *${COMPANY_NAME}*.

`;
  msg += `Berikut kredensial login akun Anda:
`;
  msg += `🌐 *Link Portal*: ${url}
`;
  msg += `👤 *Username*: \`${username}\`
`;
  msg += `🔑 *Password Default*: \`${password}\`

`;
  msg += `*Petunjuk Login*:
`;
  msg += `1. Buka link portal di atas.
`;
  msg += `2. Masukkan Username dan Password Default di atas.
`;
  msg += `3. Setelah berhasil masuk, Anda dapat mengubah password demi keamanan melalui menu Pengaturan Akun.

`;
  msg += `Apabila membutuhkan bantuan atau kendala login, silakan hubungi Tim HRD.

`;
  msg += `Terima kasih,
`;
  msg += `_*Tim HRD ${COMPANY_NAME}*_`;
  return msg;
}

/**
 * Membuka Modal "Undang Karyawan" untuk mengirim kredensial login (Username & Default Password)
 * via WhatsApp dan/atau Email.
 */
export async function openInviteEmployeeModal(defaultEmpNikOrName = "") {
  try {
    toast("Memuat data karyawan & akun pengguna...", "info");
    const [allKaryawan, allUsers] = await Promise.all([
      fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
      fsGetAll(COL.USERS).catch(() => [])
    ]);

    const activeEmp = allKaryawan.filter(k => {
      const st = String(k.aktif_tdk_aktif || k.status || "AKTIF").toUpperCase();
      return st === "AKTIF";
    }).sort((a, b) => (a.nama_karyawan || a.nama || "").localeCompare(b.nama_karyawan || b.nama || ""));

    if (!activeEmp.length) {
      toast("Tidak ada karyawan aktif ditemukan di Master Karyawan.", "warning");
      return;
    }

    const defaultPasswordVal = "andela123";
    const baseUrl = window.location.origin + window.location.pathname;

    openModal({
      title: " Undangan Akses Sistem HRIS Karyawan",
      size: "lg",
      bodyHtml: `
        <div class="space-y-4 text-left">
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5">
            <span class="text-2xl">✉️</span>
            <div>
              <h4 class="text-xs font-bold text-emerald-900">Kirim Kredensial Login Karyawan</h4>
              <p class="text-[11px] text-emerald-700">Undang karyawan baru atau reset kredensial untuk memberikan akses ke portal HRIS. Undangan dilengkapi Username, Password Default, dan link portal (otomatis diawali kode negara 62 untuk WhatsApp).</p>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Karyawan Ybs *</label>
            <select id="inv-emp-select" class="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl outline-none focus:border-emerald-500 bg-white">
              <option value="">-- Pilih Karyawan Aktif --</option>
              ${activeEmp.map((k, idx) => {
                const nik = k.nik_karyawan || k.nik || "-";
                const nama = k.nama_karyawan || k.nama || "Karyawan";
                const dept = k.departemen || k.jabatan || k.cabang || "-";
                return `<option value="${idx}" data-nik="${escapeHtml(nik)}" data-nama="${escapeHtml(nama)}">${escapeHtml(nama)} (${escapeHtml(nik)}) - ${escapeHtml(dept)}</option>`;
              }).join("")}
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Nama Lengkap *</label>
              <input type="text" id="inv-nama" class="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="Pilih karyawan atau ketik nama...">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Username Login *</label>
              <input type="text" id="inv-username" class="w-full px-3 py-1.5 text-xs font-mono font-bold uppercase bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="Contoh: AHMAD123">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Password Default *</label>
              <input type="text" id="inv-password" value="${defaultPasswordVal}" class="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Role / Hak Akses *</label>
              <select id="inv-role" class="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500">
                <option value="STAFF">STAFF</option>
                <option value="SPV">SPV / ATASAN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="DRIVER">DRIVER</option>
                <option value="HELPER">HELPER</option>
                <option value="SALES">SALES</option>
                <option value="WAREHOUSE">WAREHOUSE</option>
                <option value="FINANCE">FINANCE</option>
                <option value="HRD">HRD</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Nomor WhatsApp (62...)</label>
              <input type="text" id="inv-phone" class="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="08123456789">
              <p class="text-[10px] text-slate-400 mt-0.5">*Otomatis diawali kode negara +62 Indonesia</p>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Alamat Email Karyawan</label>
              <input type="email" id="inv-email" class="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="nama@email.com">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Pratinjau Pesan Undangan (WhatsApp & Email)</label>
            <textarea id="inv-preview-msg" rows="7" class="w-full px-3 py-2 text-xs font-mono bg-slate-900 text-emerald-300 rounded-xl outline-none border border-slate-700 focus:border-emerald-500 leading-relaxed"></textarea>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full flex-wrap gap-2">
          <button id="btn-inv-close" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Tutup</button>
          <div class="flex items-center gap-2">
            <button id="btn-inv-email" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
              📧 Kirim Email
            </button>
            <button id="btn-inv-wa" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              Kirim WhatsApp
            </button>
            <button id="btn-inv-both" class="px-5 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
              🚀 Kirim WA & Email
            </button>
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        const selectEmp = modalEl.querySelector("#inv-emp-select");
        const inputNama = modalEl.querySelector("#inv-nama");
        const inputUser = modalEl.querySelector("#inv-username");
        const inputPass = modalEl.querySelector("#inv-password");
        const inputRole = modalEl.querySelector("#inv-role");
        const inputPhone = modalEl.querySelector("#inv-phone");
        const inputEmail = modalEl.querySelector("#inv-email");
        const previewMsg = modalEl.querySelector("#inv-preview-msg");

        function updatePreview() {
          const empName = inputNama.value.trim() || "Karyawan";
          const uName = inputUser.value.trim().toUpperCase() || "[USERNAME]";
          const pWord = inputPass.value || "[PASSWORD]";
          
          previewMsg.value = buildEmployeeInviteMessage({ nama_karyawan: empName }, uName, pWord, baseUrl);
        }

        selectEmp.onchange = () => {
          const idxVal = selectEmp.value;
          if (idxVal === "" || idxVal === undefined) {
            inputNama.value = "";
            inputUser.value = "";
            inputPhone.value = "";
            inputEmail.value = "";
            updatePreview();
            return;
          }

          const k = activeEmp[Number(idxVal)];
          const selectedOpt = selectEmp.options[selectEmp.selectedIndex];
          const namaOpt = selectedOpt?.dataset?.nama || (selectedOpt?.textContent || "").split("(")[0].trim();
          const nikOpt = selectedOpt?.dataset?.nik || k?.nik_karyawan || k?.nik || "";

          const matchedUser = allUsers.find(u => 
            (u.nik && String(u.nik) !== "-" && nikOpt && String(u.nik) === String(nikOpt)) ||
            (u.nama && String(u.nama).toLowerCase().trim() === String(namaOpt).toLowerCase().trim()) ||
            (u.username && k?.username && String(u.username).toLowerCase() === String(k.username).toLowerCase())
          );

          inputNama.value = k?.nama_karyawan || k?.nama || matchedUser?.nama || namaOpt || "";
          
          let calculatedUsername = matchedUser?.username || k?.username || (nikOpt && nikOpt !== "-" ? nikOpt : "");
          if (!calculatedUsername) {
            const firstName = String(inputNama.value || "USER").trim().split(" ")[0].replace(/[^a-zA-Z0-9]/g, "");
            calculatedUsername = firstName.toUpperCase() || "USER";
          }
          inputUser.value = String(calculatedUsername).toUpperCase();

          if (matchedUser?.role) {
            inputRole.value = matchedUser.role.toUpperCase();
          } else if (k?.jabatan || k?.posisi) {
            const jUpper = (k.jabatan || k.posisi || "").toUpperCase();
            if (jUpper.includes("MANAGER")) inputRole.value = "MANAGER";
            else if (jUpper.includes("SUPERVISOR") || jUpper.includes("SPV")) inputRole.value = "SPV";
            else if (jUpper.includes("DRIVER")) inputRole.value = "DRIVER";
            else if (jUpper.includes("SALES")) inputRole.value = "SALES";
            else if (jUpper.includes("WAREHOUSE") || jUpper.includes("GUDANG")) inputRole.value = "WAREHOUSE";
            else inputRole.value = "STAFF";
          }

          const rawPhone = k?.no_hp_aktif || k?.no_telepon || k?.no_hp || k?.hp || k?.whatsapp || matchedUser?.no_hp || matchedUser?.no_telepon || "";
          inputPhone.value = formatPhoneNumberForWa(rawPhone);

          inputEmail.value = k?.email || k?.email_perusahaan || matchedUser?.email || "";

          updatePreview();
        };

        inputNama.oninput = updatePreview;
        inputUser.oninput = updatePreview;
        inputPass.oninput = updatePreview;

        if (defaultEmpNikOrName) {
          const matchOpt = Array.from(selectEmp.options).find(opt => 
            opt.dataset.nik === defaultEmpNikOrName || 
            opt.dataset.nama?.toLowerCase().includes(defaultEmpNikOrName.toLowerCase()) ||
            opt.textContent.toLowerCase().includes(defaultEmpNikOrName.toLowerCase())
          );
          if (matchOpt) {
            selectEmp.value = matchOpt.value;
            selectEmp.dispatchEvent(new Event("change"));
          }
        }

        async function ensureUserAccount() {
          const uname = inputUser.value.trim().toUpperCase();
          const pword = inputPass.value;
          const nama = inputNama.value.trim();
          const role = inputRole.value;
          const email = inputEmail.value.trim();
          const phone = inputPhone.value.trim();
          const selectedOpt = selectEmp.options[selectEmp.selectedIndex];
          const nik = selectedOpt?.dataset?.nik || "-";

          if (!uname || !pword || !nama) {
            toast("Nama, Username, dan Password wajib diisi!", "warning");
            return false;
          }

          try {
            const pHash = await sha256(pword);
            await setDoc(doc(db, COL.USERS, uname), {
              username: uname,
              nama: nama,
              nik: nik || "-",
              role: role,
              email: email || "",
              no_hp: phone || "",
              password_hash: pHash,
              password: pword,
              updated_at: new Date().toISOString()
            }, { merge: true });
            
            toast(`Akun pengguna ${uname} berhasil diperbarui di database!`, "success");
            return true;
          } catch (err) {
            console.error("Gagal update akun USERS:", err);
            toast("Gagal menyimpan akun: " + err.message, "error");
            return false;
          }
        }

        modalEl.querySelector("#btn-inv-close").onclick = closeModal;

        modalEl.querySelector("#btn-inv-wa").onclick = async () => {
          const phone = formatPhoneNumberForWa(inputPhone.value.trim());
          if (!phone) {
            toast("Mohon isi nomor WhatsApp karyawan tujuan!", "warning");
            return;
          }
          const saved = await ensureUserAccount();
          if (!saved) return;

          openWhatsAppMessage(phone, previewMsg.value);
          closeModal();
        };

        modalEl.querySelector("#btn-inv-email").onclick = async () => {
          const email = inputEmail.value.trim();
          if (!email) {
            toast("Mohon isi alamat email karyawan tujuan!", "warning");
            return;
          }
          const saved = await ensureUserAccount();
          if (!saved) return;

          toast(`Mengirim email undangan ke ${email}...`, "info");
          
          const htmlEmail = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
              <div style="background-color: #800000; padding: 20px; text-align: center; color: #ffffff;">
                <h2 style="margin: 0; font-size: 20px;">${COMPANY_NAME}</h2>
                <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Undangan Akses Portal HRIS & Kepegawaian</p>
              </div>
              <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
                <p>Halo <strong>${escapeHtml(inputNama.value)}</strong>,</p>
                <p>Anda telah diundang untuk mengakses Portal Sistem Informasi SDM (HRIS) <strong>${COMPANY_NAME}</strong>. Berikut adalah informasi akun login Anda:</p>
                
                <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <table style="width: 100%; text-align: left; font-size: 13px; border-collapse: collapse;">
                    <tr><td style="padding: 4px 0; font-weight: bold; width: 140px;">URL Portal HRIS:</td><td><a href="${baseUrl}" style="color: #800000; text-decoration: underline; font-weight: bold;">${baseUrl}</a></td></tr>
                    <tr><td style="padding: 4px 0; font-weight: bold;">Username:</td><td style="font-family: monospace; font-weight: bold; color: #0f172a;">${escapeHtml(inputUser.value.toUpperCase())}</td></tr>
                    <tr><td style="padding: 4px 0; font-weight: bold;">Password Default:</td><td style="font-family: monospace; font-weight: bold; color: #0f172a;">${escapeHtml(inputPass.value)}</td></tr>
                    <tr><td style="padding: 4px 0; font-weight: bold;">Role Akses:</td><td><span style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${escapeHtml(inputRole.value)}</span></td></tr>
                  </table>
                </div>

                <p><strong>Langkah Login:</strong></p>
                <ol style="padding-left: 20px; margin: 10px 0;">
                  <li>Buka link portal HRIS di atas.</li>
                  <li>Masukkan Username dan Password Default yang tertera.</li>
                  <li>Disarankan untuk segera memperbarui password akun Anda setelah login pertama kali.</li>
                </ol>

                <p style="margin-top: 24px;">Jika Anda memiliki pertanyaan atau kendala, silakan hubungi tim HRD.</p>
                <p style="margin-bottom: 0;">Terima kasih,<br><strong>Tim HRD - ${COMPANY_NAME}</strong></p>
              </div>
            </div>
          `;

          const sent = await sendEmailNotif(email, `[Undangan HRIS] Kredensial Login - ${COMPANY_NAME}`, htmlEmail);
          if (sent) {
            toast(`Email undangan berhasil dikirim ke ${email}!`, "success");
            closeModal();
          } else {
            toast("Gagal mengirim email undangan. Silakan periksa jaringan / gunakan WhatsApp.", "error");
          }
        };

        modalEl.querySelector("#btn-inv-both").onclick = async () => {
          const phone = formatPhoneNumberForWa(inputPhone.value.trim());
          const email = inputEmail.value.trim();

          if (!phone && !email) {
            toast("Mohon isi nomor WA atau email karyawan tujuan!", "warning");
            return;
          }

          const saved = await ensureUserAccount();
          if (!saved) return;

          if (email) {
            toast(`Mengirim email undangan ke ${email}...`, "info");
            const htmlEmail = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
                <div style="background-color: #800000; padding: 20px; text-align: center; color: #ffffff;">
                  <h2 style="margin: 0; font-size: 20px;">${COMPANY_NAME}</h2>
                  <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Undangan Akses Portal HRIS & Kepegawaian</p>
                </div>
                <div style="padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;">
                  <p>Halo <strong>${escapeHtml(inputNama.value)}</strong>,</p>
                  <p>Anda telah diundang untuk mengakses Portal Sistem Informasi SDM (HRIS) <strong>${COMPANY_NAME}</strong>. Berikut adalah informasi akun login Anda:</p>
                  
                  <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <table style="width: 100%; text-align: left; font-size: 13px; border-collapse: collapse;">
                      <tr><td style="padding: 4px 0; font-weight: bold; width: 140px;">URL Portal HRIS:</td><td><a href="${baseUrl}" style="color: #800000; text-decoration: underline; font-weight: bold;">${baseUrl}</a></td></tr>
                      <tr><td style="padding: 4px 0; font-weight: bold;">Username:</td><td style="font-family: monospace; font-weight: bold; color: #0f172a;">${escapeHtml(inputUser.value.toUpperCase())}</td></tr>
                      <tr><td style="padding: 4px 0; font-weight: bold;">Password Default:</td><td style="font-family: monospace; font-weight: bold; color: #0f172a;">${escapeHtml(inputPass.value)}</td></tr>
                    </table>
                  </div>

                  <p>Terima kasih,<br><strong>Tim HRD - ${COMPANY_NAME}</strong></p>
                </div>
              </div>
            `;
            await sendEmailNotif(email, `[Undangan HRIS] Kredensial Login - ${COMPANY_NAME}`, htmlEmail);
          }

          if (phone) {
            openWhatsAppMessage(phone, previewMsg.value);
          } else {
            toast("Email berhasil dikirim!", "success");
          }

          closeModal();
        };
      }
    });

  } catch (err) {
    console.error("Gagal membuka modal undang karyawan:", err);
    toast("Terjadi kesalahan: " + err.message, "error");
  }
}
