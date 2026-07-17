/**
 * =====================================================================
 * UTILS.JS — Pustaka utilitas inti Portal HRIS CV Andela Jaya
 * Dipakai bersama oleh app.js, semua js/views/*.js, dan super-migrasi.html
 * =====================================================================
 */
import {
  db, COL, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  Timestamp, storage, ref, uploadBytes, getDownloadURL
} from "./firebase-config.js";
/* ---------------------------------------------------------------------
 * 1. SMART DATE PARSER
 * Menangani 3 kemungkinan bentuk tanggal yang lazim ditemui saat migrasi
 * dari Excel/Google Sheets ke Firestore:
 *   a) Excel Serial Date (angka, mis. 45825)      -> dihitung dari epoch Excel 1899-12-30
 *   b) String format Indonesia "DD/MM/YYYY" atau "DD-MM-YYYY"
 *   c) String ISO "YYYY-MM-DDTHH:mm:ss.sssZ" (dari Date_Pengajuan, dsb)
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
      const d = new Date(yyyy, mm - 1, dd);
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
 * ------------------------------------------------------------------- */
export function fmtDate(value, opts = {}) {
  const d = smartParseDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", ...opts });
}
export function fmtDateShort(value) {
  const d = smartParseDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDateTime(value) {
  const d = smartParseDate(value);
  if (!d) return "-";
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
export function openModal({ title, bodyHtml, footerHtml = "", size = "md", onMount = null }) {
  closeModal();
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
      <div class="px-6 py-5 overflow-y-auto flex-1">${bodyHtml}</div>
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
export async function fsGet(colName, id) {
  const snap = await getDoc(doc(db, colName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function fsAdd(colName, data, customId = null) {
  if (customId) {
    await setDoc(doc(db, colName, String(customId)), { ...data, created_at: serverTimestamp() });
    return customId;
  }
  const ref = await addDoc(collection(db, colName), { ...data, created_at: serverTimestamp() });
  return ref.id;
}
export async function fsUpdate(colName, id, data) {
  await updateDoc(doc(db, colName, id), { ...data, updated_at: serverTimestamp() });
}
export async function fsDelete(colName, id) {
  await deleteDoc(doc(db, colName, id));
}

/* ---------------------------------------------------------------------
 * 6. CSV EXPORT
 * ------------------------------------------------------------------- */
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
  const raw = location.hash.replace(/^#/, "");
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  return { path: path || "dashboard", params };
}
export function navigate(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = `#${path}${qs ? "?" + qs : ""}`;
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Tambahkan di js/utils.js

export async function sendEmailNotif(to, subject, htmlBody, cc = "") {
  const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbwdm_3Eapo0VUjt1QmQvGHaxXCU95_ycaapJy1wNmFcUINe2ZHSFghoIQY9jN4dqld16w/exec";
  
  try {
    await fetch(APPSCRIPT_URL, {
      method: "POST",
      mode: "no-cors", 
      headers: {
        "Content-Type": "text/plain;charset=utf-8", 
      },
      body: JSON.stringify({
        to: to,
        subject: subject,
        htmlBody: htmlBody, // Untuk Google Script yang membaca properti htmlBody
        body: htmlBody,     // Untuk Google Script yang membaca properti body biasa
        html: htmlBody,     // Sebagai cadangan kompatibilitas
        cc: cc,
        name: "HRIS System - Andela"
      })
    });
    console.log("Permintaan email telah dikirimkan ke Apps Script.");
    return true;
  } catch (error) {
    console.error("Gagal menghubungi server Apps Script:", error);
    return false;
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
    // 1. Jika targetnya adalah PEMOHON itu sendiri
    if (role === "PEMOHON" && namaKaryawan) {
      const q = query(collection(db, COL.USERS), where("nama", "==", namaKaryawan), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return [{ username: snap.docs[0].id, email: snap.docs[0].data().email }];
      }
      return [];
    }

    // 2. Jika targetnya adalah ATASAN (Melacak dinamis dari Master Karyawan)
    if (role === "ATASAN" && namaKaryawan) {
      // Langkah A: Cari data si pemohon di Master Karyawan
      const qKaryawan = query(collection(db, COL.MASTER_KARYAWAN), where("nama_karyawan", "==", namaKaryawan), limit(1));
      const snapKaryawan = await getDocs(qKaryawan);
      
      if (!snapKaryawan.empty) {
        const namaAtasan = snapKaryawan.docs[0].data().atasan; // Ambil nama atasannya

        if (namaAtasan) {
          // Langkah B: Cari email atasan di daftar Akun Users
          const qAtasan = query(collection(db, COL.USERS), where("nama", "==", namaAtasan), limit(1));
          const snapAtasan = await getDocs(qAtasan);
          
          if (!snapAtasan.empty && snapAtasan.docs[0].data().email) {
             return [{ username: snapAtasan.docs[0].id, email: snapAtasan.docs[0].data().email }];
          }
          
          // Langkah C: Fallback (Cadangan), cari email atasan di Master Karyawan jika ia belum punya akun User
          const qAtasanMaster = query(collection(db, COL.MASTER_KARYAWAN), where("nama_karyawan", "==", namaAtasan), limit(1));
          const snapAtasanMaster = await getDocs(qAtasanMaster);
          
          if(!snapAtasanMaster.empty && snapAtasanMaster.docs[0].data().email) {
             return [{ username: snapAtasanMaster.docs[0].id, email: snapAtasanMaster.docs[0].data().email }];
          }
        }
      }
      // Jika atasan tidak ditemukan, kembalikan array kosong (mencegah terkirim ke email dummy)
      console.warn(`Atasan untuk ${namaKaryawan} tidak ditemukan atau tidak memiliki email.`);
      return []; 
    }

    // 3. Jika targetnya adalah Role Departemen Spesifik (HRD, FINANCE, MANAGER, dll)
    const qRole = query(collection(db, COL.USERS), where("role", "==", role));
    const snapRole = await getDocs(qRole);
    
    return snapRole.docs
        .map(d => ({ username: d.id, email: d.data().email }))
        .filter(x => x.email); // Hanya kembalikan yang email-nya terisi

  } catch (error) {
    console.error("Error getTargetsForRole:", error);
    return [];
  }
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
  const base = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition";
  const req = f.required ? "required" : "";
  if (f.formula) return `<input type="text" name="${f.name}" data-formula="${escapeHtml(f.formula)}" readonly class="${base} bg-slate-50 text-slate-500 cursor-not-allowed" value="0">`;

  switch (f.type) {
    case "textarea": return `<textarea name="${f.name}" rows="3" class="${base}" ${req}></textarea>`;
    case "select": return `<select name="${f.name}" class="${base}" ${req}>
        <option value="">Pilih ${escapeHtml(f.label || "")}</option>
        ${(f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
      </select>`;
    case "date": return `<input type="date" name="${f.name}" class="${base}" ${req}>`;
    case "number": return `<input type="number" step="any" name="${f.name}" class="${base}" ${req}>`;
    case "file": return `<input type="file" name="${f.name}" accept="image/*,.pdf" class="${base} bg-white" ${req}>
        <p class="text-[11px] text-slate-400 mt-1">Upload foto/dokumen (JPG, PNG, atau PDF, maks 5MB).</p>`;
    default: return `<input type="text" name="${f.name}" class="${base}" ${req}>`;
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
 * Kumpulkan nilai form (termasuk upload file ke Firebase Storage) menjadi
 * satu object `detail`. File diupload ke path `pathPrefix/fieldName_filename`
 * dan hasilnya berupa URL string.
 * @param {HTMLFormElement} form
 * @param {Array} fields  definisi field (name, type, required, label)
 * @param {string} pathPrefix  mis. "pengajuan_lampiran/TRX-123" atau "lpj_lampiran/TRX-123"
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
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storageRef = ref(storage, `${pathPrefix}/${f.name}_${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file);
        detail[f.name] = await getDownloadURL(storageRef);
      } else {
        detail[f.name] = "";
      }
    } else {
      detail[f.name] = fd.get(f.name) ?? "";
    }
  }
  return detail;
}
