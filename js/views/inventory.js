import { COL } from "../firebase-config.js";
import { fsGetAll, fsUpdate, fsAdd, toNumber, escapeHtml, fmtDateShort, openModal, closeModal, toast, notifyUser, genId, downloadXlsx } from "../utils.js";
import { renderCrudModule } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

// HELPER URL DIRECT DEEP LINKING FOR QR CODES
export function getAssetQrTargetUrl(assetId) {
 const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
 const pathname = window.location.pathname ? window.location.pathname.replace(/\/$/, '') : "";
 return `${origin}${pathname}#inventory?id=${encodeURIComponent(assetId)}`;
}

export function getAssetQrCodeImageUrl(assetId, size = "180x180") {
 const targetUrl = getAssetQrTargetUrl(assetId);
 return `https://api.qrserver.com/v1/create-qr-code/?size=${size}&data=${encodeURIComponent(targetUrl)}`;
}

export function parseAssetIdFromQuery(rawQuery = "") {
 if (!rawQuery) return "";
 let clean = String(rawQuery).trim();

 // Extract id from URL query parameters (e.g. ?id=AST-001 or #inventory?id=AST-001)
 if (clean.includes("id=")) {
  try {
   const match = clean.match(/id=([a-zA-Z0-9_\-%]+)/);
   if (match && match[1]) return decodeURIComponent(match[1]);
  } catch (e) {}
 }

 // Extract id from JSON if JSON string
 if (clean.startsWith("{") && clean.endsWith("}")) {
  try {
   const parsed = JSON.parse(clean);
   if (parsed.id) return parsed.id;
  } catch (e) {}
 }

 return "";
}

// MODAL DETAIL ASET & UPDATE STOK FISIK / OPNAME
export function openAssetDetailAndUpdateStockModal(found, activeEmpNames = [], session = null, container = null) {
 const assetId = found.id_item || found.id;
 const qrUrl = getAssetQrCodeImageUrl(assetId, "180x180");
 const currentStok = toNumber(found.stok_saat_ini);
 const minStok = toNumber(found.min_stok) || 5;
 const defaultPetugas = session?.nama || (activeEmpNames[0] || "Petugas GA");

 openModal({
  title: `Detail Aset & Audit Stok Fisik — ${escapeHtml(assetId)}`,
  size: "lg",
  bodyHtml: `
   <div class="space-y-4 text-xs text-left">
    <!-- Header Card Info Aset -->
    <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
     <div class="p-2 bg-white border border-slate-200 rounded-xl shadow-xs shrink-0 text-center">
      <img src="${qrUrl}" alt="QR ${escapeHtml(assetId)}" class="w-28 h-28 mx-auto rounded-lg">
      <span class="text-[9px] font-mono text-slate-400 block mt-1">Direct Web URL QR</span>
     </div>
     <div class="min-w-0 flex-1 space-y-1.5 w-full">
      <div class="flex items-center gap-2 flex-wrap">
       <span class="px-2.5 py-1 text-xs font-mono font-bold text-maroon-800 bg-red-50 border border-red-100 rounded-lg">${escapeHtml(assetId)}</span>
       <span class="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-200 rounded-lg">${escapeHtml(found.kategori || "Aset")}</span>
       <span class="px-2.5 py-1 text-xs font-bold ${found.kondisi?.includes("Good") || found.kondisi === "Good" ? "text-emerald-800 bg-emerald-50 border border-emerald-200" : "text-amber-800 bg-amber-50 border border-amber-200"} rounded-lg">${escapeHtml(found.kondisi || "Good")}</span>
      </div>
      <h3 class="text-base font-black text-slate-800 leading-tight">${escapeHtml(found.nama_barang)}</h3>
      <div class="grid grid-cols-2 gap-2 pt-1 text-slate-600 font-medium text-[11px]">
       <p>Lokasi: <b class="text-slate-800">${escapeHtml(found.lokasi || "Kantor Pusat")}</b></p>
       <p>No Seri/Plat: <b class="text-slate-800">${escapeHtml(found.serial_number || "-")}</b></p>
       <p>Penempatan: <b class="text-slate-800">${escapeHtml(found.penempatan || found.lokasi || found.assigned_to || "Gudang Utama")}</b></p>
       <p>Stok Aman Minimal: <b class="text-slate-800">${minStok} ${escapeHtml(found.satuan || 'Unit')}</b></p>
      </div>
     </div>
    </div>

    <!-- Panel Form Update Stok Fisik -->
    <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
     <div class="flex items-center justify-between border-b border-slate-100 pb-2">
      <h4 class="font-black text-slate-800 text-sm flex items-center gap-2">
       <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
       Perbarui Stok Fisik & Stock Opname
      </h4>
      <span class="text-[11px] font-bold text-slate-500">Stok Sistem: <b class="text-blue-700 font-mono text-xs">${currentStok} ${escapeHtml(found.satuan || 'Unit')}</b></span>
     </div>

     <form id="form-update-stock-opname" class="space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
       <div>
        <label class="block font-bold text-slate-700 mb-1">Jumlah Hasil Cek Stok Fisik (${escapeHtml(found.satuan || 'Unit')}) <span class="text-red-500">*</span></label>
        <input type="number" id="stock-real-qty" value="${currentStok}" min="0" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-black text-slate-800 outline-none focus:border-maroon-500 bg-slate-50 focus:bg-white transition">
       </div>
       <div>
        <label class="block font-bold text-slate-700 mb-1">Kondisi Fisik Barang Terkini</label>
        <select id="stock-real-cond" class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
         <option value="Good (Baik)" ${found.kondisi?.includes("Good") ? "selected" : ""}>Good (Baik & Layak Pakai)</option>
         <option value="Maintenance (Perlu Servis)" ${found.kondisi?.includes("Maintenance") ? "selected" : ""}>Maintenance (Perlu Servis / Perbaikan)</option>
         <option value="Damaged (Rusak)" ${found.kondisi?.includes("Damaged") || found.kondisi?.includes("Rusak") ? "selected" : ""}>Damaged (Rusak / Afkir)</option>
        </select>
       </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
       <div>
        <label class="block font-bold text-slate-700 mb-1">Petugas Pemeriksa / Audit</label>
        <select id="stock-real-emp" class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
         ${(activeEmpNames.length ? activeEmpNames : [defaultPetugas]).map(e => `<option value="${escapeHtml(e)}" ${e === defaultPetugas ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}
        </select>
       </div>
       <div>
        <label class="block font-bold text-slate-700 mb-1">Tanggal Cek Fisik</label>
        <input type="date" id="stock-real-date" value="${new Date().toISOString().substring(0,10)}" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 outline-none focus:border-maroon-500">
       </div>
      </div>

      <div>
       <label class="block font-bold text-slate-700 mb-1">Catatan Opname / Kondisi Fisik</label>
       <textarea id="stock-real-notes" rows="2" placeholder="Cth: Cek fisik via QR Code direct scan. Barang lengkap dan stok telah disesuaikan." class="w-full p-2.5 text-xs rounded-xl border border-slate-300 outline-none focus:border-maroon-500"></textarea>
      </div>
     </form>
    </div>
   </div>`,
  footerHtml: `
   <div class="flex items-center justify-between w-full">
    <button id="btn-stock-update-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
    <button id="btn-stock-update-save" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
     <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
     Simpan & Perbarui Stok Fisik
    </button>
   </div>`,
  onMount: m => {
   m.querySelector("#btn-stock-update-close").onclick = closeModal;
   m.querySelector("#btn-stock-update-save").onclick = async () => {
    const qtyInput = m.querySelector("#stock-real-qty");
    const newQty = toNumber(qtyInput.value);
    const newCond = m.querySelector("#stock-real-cond").value;
    const empName = m.querySelector("#stock-real-emp").value;
    const dateVal = m.querySelector("#stock-real-date").value;
    const notesVal = m.querySelector("#stock-real-notes").value.trim();

    if (isNaN(newQty) || newQty < 0) {
     return toast("Jumlah stok fisik harus berupa angka yang valid (>= 0)", "warning");
    }

    try {
     toast("Sedang menyimpan pembaruan stok fisik...", "info");
     
     // 1. Update Master Inventory
     await fsUpdate(COL.MASTER_INVENTORY, found.id, {
      stok_saat_ini: newQty,
      kondisi: newCond,
      terakhir_diaudit: dateVal
     });

     // 2. Add Stock Opname Record
     const diff = newQty - currentStok;
     await fsAdd(COL.STOCK_OPNAME, {
      tanggal: dateVal,
      nama_barang: found.nama_barang,
      id_barang: assetId,
      jumlah_ambil: newQty,
      stok_sebelumnya: currentStok,
      selisih: diff,
      nama_karyawan: empName,
      keperluan: notesVal || `Update stok fisik via QR Code direct scan (Stok diubah dari ${currentStok} menjadi ${newQty} ${found.satuan || 'Unit'}).`
     });

     toast(`Stok fisik ${found.nama_barang} (${assetId}) berhasil diperbarui menjadi ${newQty} ${found.satuan || 'Unit'}!`, "success");
     closeModal();

     if (container) {
      updateKpiSummary(container);
     }
    } catch (err) {
     console.error("Gagal update stok fisik:", err);
     toast("Gagal memperbarui stok fisik: " + err.message, "error");
    }
   };
  }
 });
}

// FUNGSI UPDATE KPI CARDS
async function updateKpiSummary(container) {
 try {
 const items = await fsGetAll(COL.MASTER_INVENTORY);
 const totalCount = items.length;
 
 let maintenanceCount = 0;
 let assignedCount = 0;
 let readyCount = 0;
 let restockCount = 0;

 items.forEach(i => {
 const cond = (i.kondisi || "Good").toUpperCase();
 const assigned = (i.assigned_to || "").trim();
 const stok = toNumber(i.stok_saat_ini);
 const minStok = toNumber(i.min_stok) || 5;

 if (stok <= minStok) {
 restockCount++;
 }

 if (cond.includes("MAINTENANCE") || cond.includes("PERBAIKAN") || cond.includes("RUSAK")) {
 maintenanceCount++;
 }
 
 if (assigned && assigned.toUpperCase() !== "UNASSIGNED" && assigned !== "-") {
 assignedCount++;
 } else {
 readyCount++;
 }
 });

 const elTotal = container.querySelector("#inv-kpi-total");
 const elMaint = container.querySelector("#inv-kpi-maintenance");
 const elAssigned = container.querySelector("#inv-kpi-assigned");
 const elReady = container.querySelector("#inv-kpi-ready");
 const elBadgeRestock = container.querySelector("#inv-badge-restock-count");

 if (elTotal) elTotal.textContent = totalCount.toLocaleString("id-ID");
 if (elMaint) elMaint.textContent = maintenanceCount.toLocaleString("id-ID");
 if (elAssigned) elAssigned.textContent = assignedCount.toLocaleString("id-ID");
 if (elReady) elReady.textContent = readyCount.toLocaleString("id-ID");

 if (elBadgeRestock) {
 elBadgeRestock.textContent = restockCount;
 if (restockCount > 0) {
 elBadgeRestock.classList.remove("hidden");
 } else {
 elBadgeRestock.classList.add("hidden");
 }
 }
 } catch (e) {
 console.warn("Error updating inventory KPI:", e);
 }
}

// FUNGSI TAMPILKAN MODAL CETAK QR CODE BATCH / PER KATEGORI
async function openBatchQrCodeModal() {
 const items = await fsGetAll(COL.MASTER_INVENTORY);
 if (items.length === 0) return toast("Belum ada data barang/aset", "warning");

 const rawCats = [...new Set(items.map(i => i.kategori || "Lainnya"))].sort();
 const categories = ["SEMUA KATEGORI (ALL)", ...rawCats];

 openModal({
 title: "Cetak Label QR Code Aset Massal (Semua Kategori)",
 size: "lg",
 bodyHtml: `
 <div class="space-y-4 text-xs">
 <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed">
 <b>Stiker QR Code Seluruh Barang & Kategori:</b><br/>
 Pilih kategori atau cetak semua stiker QR Code sekaligus. Hasil cetakan dapat langsung ditempel pada unit aset (laptop, kendaraan, kunci, dokumen, dll) untuk keperluan audit & stock opname.
 </div>

 <div class="flex items-center gap-3">
 <div class="flex-1">
 <label class="block font-bold text-slate-700 mb-1">Filter Kategori Barang / Aset</label>
 <select id="qr-batch-cat" class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-bold text-slate-800 bg-white focus:border-maroon-500 outline-none">
 ${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
 </select>
 </div>
 <div class="w-40">
 <label class="block font-bold text-slate-700 mb-1">Total Unit</label>
 <div id="qr-batch-count" class="p-2.5 bg-slate-100 rounded-xl font-bold text-slate-800 text-center">
 ${items.length} Unit
 </div>
 </div>
 </div>

 <div id="qr-batch-preview" class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-80 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
 <!-- Populated by JS -->
 </div>
 </div>`,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-qr-batch-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup</button>
 <button id="btn-qr-batch-print" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-2">
 Cetak Lembar Stiker QR (Print / PDF)
 </button>
 </div>`,
 onMount: m => {
 const selCat = m.querySelector("#qr-batch-cat");
 const previewBox = m.querySelector("#qr-batch-preview");
 const countBox = m.querySelector("#qr-batch-count");

 function updatePreview() {
 const cat = selCat.value;
 const filtered = cat.startsWith("SEMUA") 
 ? items 
 : items.filter(i => (i.kategori || "").toLowerCase() === cat.toLowerCase());

 countBox.textContent = `${filtered.length} Unit`;

 if (!filtered.length) {
 previewBox.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400">Tidak ada aset pada kategori ini.</div>`;
 return;
 }

 previewBox.innerHTML = filtered.map(row => {
 const assetId = row.id_item || row.id || "AST-001";
 const qrUrl = getAssetQrCodeImageUrl(assetId, "150x150");
 return `
 <div class="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-sm hover:border-maroon-300 transition">
 <img src="${qrUrl}" class="w-20 h-20 mx-auto rounded-lg mb-1 border border-slate-100 p-1 bg-slate-50">
 <p class="font-black text-slate-800 font-mono text-[11px] truncate">${escapeHtml(assetId)}</p>
 <p class="font-bold text-slate-700 text-[10px] truncate">${escapeHtml(row.nama_barang)}</p>
 <p class="text-[9px] text-slate-400 truncate">${escapeHtml(row.kategori || "Aset")}</p>
 </div>`;
 }).join("");
 }

 selCat.onchange = updatePreview;
 updatePreview();

 m.querySelector("#btn-qr-batch-close").onclick = closeModal;
 m.querySelector("#btn-qr-batch-print").onclick = () => {
 const cat = selCat.value;
 const filtered = cat.startsWith("SEMUA") 
 ? items 
 : items.filter(i => (i.kategori || "").toLowerCase() === cat.toLowerCase());

 if (!filtered.length) return toast("Tidak ada data untuk dicetak", "warning");

 const win = window.open('', '_blank');
 const gridItems = filtered.map(row => {
 const assetId = row.id_item || row.id || "AST-001";
 const qrUrl = getAssetQrCodeImageUrl(assetId, "180x180");
 return `
 <div class="sticker">
 <img src="${qrUrl}" />
 <div class="code">${escapeHtml(assetId)}</div>
 <div class="title">${escapeHtml(row.nama_barang)}</div>
 <div class="meta">${escapeHtml(row.kategori || "Aset")} • Penempatan: ${escapeHtml(row.penempatan || row.lokasi || row.assigned_to || "Gudang Utama")}</div>
 </div>`;
 }).join("");

 win.document.write(`
 <html>
 <head>
 <title>Cetak Stiker QR Aset - ${escapeHtml(cat)}</title>
 <style>
 @page { size: A4; margin: 8mm; }
 body { font-family: sans-serif; margin: 0; padding: 10px; background: #fff; }
 h2 { text-align: center; font-size: 15px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
 p.sub { text-align: center; font-size: 10px; color: #555; margin-top: 0; margin-bottom: 12px; }
 .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
 .sticker { border: 1.5px dashed #333; padding: 8px; text-align: center; border-radius: 8px; page-break-inside: avoid; }
 .sticker img { width: 100px; height: 100px; }
 .sticker .code { font-family: monospace; font-weight: bold; font-size: 11px; margin-top: 3px; }
 .sticker .title { font-weight: bold; font-size: 10px; margin-top: 2px; height: 22px; overflow: hidden; }
 .sticker .meta { font-size: 8.5px; color: #666; margin-top: 2px; }
 </style>
 </head>
 <body>
 <h2>CV ANDELA JAYA — LABEL QR CODE ASET & INVENTARIS</h2>
 <p class="sub">Kategori: <strong>${escapeHtml(cat)}</strong> | Total: <strong>${filtered.length} Unit Aset</strong></p>
 <div class="grid">${gridItems}</div>
 <script>window.print();</script>
 </body>
 </html>
 `);
 win.document.close();
 };
 }
 });
}

// FUNGSI MODAL PEMINDAI / SCAN QR CODE ASET
async function openQrScannerModal(container, activeEmpNames) {
 const items = await fsGetAll(COL.MASTER_INVENTORY);

 openModal({
 title: "Scan & Audit QR Code Aset / Inventaris",
 size: "md",
 bodyHtml: `
 <div class="space-y-4 text-xs">
 <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed">
 <b>Pemindai QR Code & Audit Aset:</b><br/>
 Pindai stiker QR pada unit fisik menggunakan kamera/pemindai, atau ketik ID Aset / Kata Kunci di bawah ini untuk memeriksa status, penanggung jawab, dan kondisi barang.
 </div>

 <div>
 <label class="block font-bold text-slate-700 mb-1">Cari / Input / Paste Kode QR atau ID Aset</label>
 <div class="flex gap-2">
 <input type="text" id="scan-input" placeholder="Cth: BC-IT-8822, AST-KEY-01, atau paste isi QR..." class="flex-1 p-2.5 border border-slate-300 rounded-xl outline-none focus:border-maroon-500 font-mono text-xs font-bold">
 <button id="btn-scan-exec" class="px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">Cari Aset</button>
 </div>
 </div>

 <div>
 <label class="block font-bold text-slate-500 mb-1">Atau Pilih Langsung Dari Master Aset (${items.length} Item)</label>
 <select id="scan-select-quick" class="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white font-medium outline-none focus:border-maroon-500">
 <option value="">-- Pilih Barang untuk Cek Detail QR --</option>
 ${items.map(i => `<option value="${escapeHtml(i.id_item || i.id)}">${escapeHtml(i.id_item || i.id)} - ${escapeHtml(i.nama_barang)} (${escapeHtml(i.kategori || 'Aset')})</option>`).join("")}
 </select>
 </div>

 <div id="scan-result-card" class="hidden p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
 <!-- Populated dynamically -->
 </div>
 </div>`,
 footerHtml: `
 <div class="flex justify-end w-full">
 <button id="btn-scan-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup Pemindai</button>
 </div>`,
 onMount: m => {
 const inp = m.querySelector("#scan-input");
 const btnExec = m.querySelector("#btn-scan-exec");
 const selQuick = m.querySelector("#scan-select-quick");
 const resCard = m.querySelector("#scan-result-card");

 function findAndDisplay(query) {
 if (!query) return;
 let queryClean = query.trim();

 try {
 if (queryClean.startsWith("{") && queryClean.endsWith("}")) {
 const parsed = JSON.parse(queryClean);
 if (parsed.id) queryClean = parsed.id;
 }
 } catch (e) {}

 const found = items.find(i => 
 (i.id_item || "").toLowerCase() === queryClean.toLowerCase() ||
 (i.id || "").toLowerCase() === queryClean.toLowerCase() ||
 (i.nama_barang || "").toLowerCase().includes(queryClean.toLowerCase())
 );

 if (!found) {
 resCard.classList.remove("hidden");
 resCard.innerHTML = `
 <div class="p-3 bg-red-50 border border-red-200 rounded-xl text-center text-red-700">
 Aset dengan ID / kata kunci "<b>${escapeHtml(queryClean)}</b>" tidak ditemukan dalam database.
 </div>`;
 return;
 }

 const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(JSON.stringify({ id: found.id_item || found.id, name: found.nama_barang, cat: found.kategori }))}`;

 resCard.classList.remove("hidden");
 resCard.innerHTML = `
 <div class="flex items-start gap-4">
 <img src="${qrUrl}" class="w-24 h-24 rounded-xl border border-slate-200 p-1 bg-slate-50 shrink-0">
 <div class="min-w-0 flex-1 space-y-1 text-xs">
 <span class="px-2 py-0.5 text-[10px] font-bold text-maroon-800 bg-red-50 border border-red-100 rounded-md font-mono">${escapeHtml(found.id_item || found.id)}</span>
 <p class="font-black text-slate-800 text-sm mt-1">${escapeHtml(found.nama_barang)}</p>
 <p class="text-slate-500 font-medium">Kategori: <b>${escapeHtml(found.kategori || "Aset")}</b> | No Seri: <b>${escapeHtml(found.serial_number || "-")}</b></p>
 <p class="text-slate-500 font-medium">Lokasi: <b>${escapeHtml(found.lokasi || "Kantor Pusat")}</b></p>
 <div class="p-2 bg-slate-50 rounded-lg border border-slate-200 mt-2 flex items-center justify-between">
 <div>
 <span class="text-[10px] text-slate-400 font-bold block">PENANGGUNG JAWAB SAAT INI</span>
 <span class="font-bold text-slate-800 text-xs">${escapeHtml(found.assigned_to || "Unassigned")}</span>
 </div>
 <span class="px-2 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 rounded-lg">${escapeHtml(found.kondisi || "Good")}</span>
 </div>
 </div>
 </div>
 <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
 <button id="btn-scan-single-print" class="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cetak Stiker</button>
 <button id="btn-scan-reassign" class="px-3 py-1.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-lg transition">Serah Terima Aset</button>
 </div>`;

 resCard.querySelector("#btn-scan-single-print").onclick = () => openQrCodeModal(found);
 resCard.querySelector("#btn-scan-reassign").onclick = () => {
 closeModal();
 openQuickAssignModal(container, activeEmpNames);
 };
 }

 btnExec.onclick = () => findAndDisplay(inp.value);
 inp.onkeyup = e => { if (e.key === "Enter") findAndDisplay(inp.value); };
 selQuick.onchange = () => findAndDisplay(selQuick.value);

 m.querySelector("#btn-scan-close").onclick = closeModal;
 }
 });
}

// FUNGSI TAMPILKAN MODAL CETAK QR CODE BARANG INDIVIDUAL
function openQrCodeModal(row) {
 const assetId = row.id_item || row.id || "AST-001";
 const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify({ id: assetId, name: row.nama_barang, cat: row.kategori }))}`;

 openModal({
 title: "Label QR Code Aset Perusahaan",
 size: "sm",
 bodyHtml: `
 <div class="p-4 bg-white rounded-2xl border border-slate-200 text-center space-y-4">
 <div class="p-3 bg-slate-50 border border-slate-100 rounded-2xl inline-block shadow-inner">
 <img src="${qrUrl}" alt="QR Code ${escapeHtml(assetId)}" class="w-44 h-44 mx-auto rounded-xl">
 </div>
 <div>
 <p class="font-black text-slate-800 text-base font-mono">${escapeHtml(assetId)}</p>
 <p class="font-bold text-slate-700 text-xs mt-0.5">${escapeHtml(row.nama_barang || "-")}</p>
 <p class="text-[11px] text-slate-500 mt-1">${escapeHtml(row.kategori || "Aset Kantor")} • ${escapeHtml(row.serial_number || "No. Seri N/A")}</p>
 <div class="mt-2 text-[10px] text-maroon-700 font-semibold bg-red-50 p-1.5 rounded-lg border border-red-100">
 Penempatan: <b>${escapeHtml(row.penempatan || row.lokasi || row.assigned_to || "Gudang Utama")}</b>
 </div>
 </div>
 </div>`,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-qr-close" class="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup</button>
 <button id="btn-qr-print" class="px-4 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
 Cetak Stiker QR
 </button>
 </div>`,
 onMount: m => {
 m.querySelector("#btn-qr-close").onclick = closeModal;
 m.querySelector("#btn-qr-print").onclick = () => {
 const win = window.open('', '_blank');
 win.document.write(`
 <html>
 <head>
 <title>Cetak QR - ${escapeHtml(assetId)}</title>
 <style>
 body { font-family: sans-serif; text-align: center; padding: 20px; }
 .label { border: 2px dashed #000; padding: 15px; width: 220px; margin: 0 auto; border-radius: 8px; }
 img { width: 150px; height: 150px; }
 h3 { margin: 8px 0 2px 0; font-size: 14px; }
 p { margin: 2px 0; font-size: 11px; }
 </style>
 </head>
 <body>
 <div class="label">
 <img src="${qrUrl}" />
 <h3>${escapeHtml(assetId)}</h3>
 <p><strong>${escapeHtml(row.nama_barang)}</strong></p>
 <p>Penempatan: ${escapeHtml(row.penempatan || row.lokasi || row.assigned_to || "Gudang Utama")}</p>
 </div>
 <script>window.print();</script>
 </body>
 </html>
 `);
 win.document.close();
 };
 }
 });
}

// FUNGSI MODAL PENYERAHAN ASET CEPAT
async function openQuickAssignModal(container, activeEmpNames) {
 const items = await fsGetAll(COL.MASTER_INVENTORY);
 const unassignedItems = items
 .filter(i => !i.assigned_to || i.assigned_to === "Unassigned" || i.assigned_to === "-")
 .sort((a, b) => (a.nama_barang || "").toLowerCase().localeCompare((b.nama_barang || "").toLowerCase(), 'id'));

 openModal({
 title: "Penyerahan & Serah Terima Aset Ke Karyawan",
 size: "md",
 bodyHtml: `
 <form id="form-quick-assign" class="space-y-4 text-left text-xs">
 <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
 <b>Serah Terima Aset & Inventaris Resmi:</b><br/>
 Gunakan formulir ini untuk menyerahkan laptop, kendaraan, kunci kantor, dokumen penting, atau peralatan kerja. Aset akan langsung tercatat sebagai <b>Tanggung Jawab Karyawan</b>, terbit Berita Acara (PDF), dan muncul di Dashboard pribadinya.
 </div>

 <div>
 <label class="block font-bold text-slate-700 mb-1">Pilih Aset / Inventaris (Urut Nama)</label>
 <select id="qa-asset" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
 <option value="">-- Pilih Barang / Aset Tersedia --</option>
 ${unassignedItems.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.nama_barang)} - [${escapeHtml(i.id_item || i.id)}] (${escapeHtml(i.kategori || "Aset")})</option>`).join("")}
 </select>
 </div>

 <div>
 <label class="block font-bold text-slate-700 mb-1">Pilih Karyawan Penerima Tanggung Jawab</label>
 <select id="qa-emp" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
 <option value="">-- Pilih Nama Karyawan --</option>
 ${activeEmpNames.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("")}
 </select>
 </div>

 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block font-bold text-slate-700 mb-1">Tanggal Serah Terima</label>
 <input type="date" id="qa-date" value="${new Date().toISOString().substring(0,10)}" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 outline-none focus:border-maroon-500">
 </div>
 <div>
 <label class="block font-bold text-slate-700 mb-1">Kondisi Saat Penyerahan</label>
 <select id="qa-cond" class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
 <option value="Good">Baik (Good)</option>
 <option value="Maintenance">Perlu Servis / Minor</option>
 </select>
 </div>
 </div>

 <div>
 <label class="block font-bold text-slate-700 mb-1">Catatan Kelengkapan / No. Seri / Kunci</label>
 <textarea id="qa-notes" rows="2" placeholder="Cth: Termasuk charger laptop, kelengkapan kunci 2 pcs, helm, dsb." class="w-full p-2.5 text-xs rounded-xl border border-slate-300 outline-none focus:border-maroon-500"></textarea>
 </div>
 </form>`,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-qa-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
 <button id="btn-qa-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">Simpan & Terbitkan Berita Acara</button>
 </div>`,
 onMount: m => {
 m.querySelector("#btn-qa-close").onclick = closeModal;
 m.querySelector("#btn-qa-save").onclick = async () => {
 const form = m.querySelector("#form-quick-assign");
 if (!form.reportValidity()) return;

 const assetDocId = m.querySelector("#qa-asset").value;
 const empName = m.querySelector("#qa-emp").value;
 const dateStr = m.querySelector("#qa-date").value;
 const cond = m.querySelector("#qa-cond").value;
 const notes = m.querySelector("#qa-notes").value.trim();

 const targetAsset = items.find(i => i.id === assetDocId);
 if (!targetAsset) return toast("Aset tidak ditemukan", "error");

 try {
 // 1. Update Asset in Master
 await fsUpdate(COL.MASTER_INVENTORY, assetDocId, {
 assigned_to: empName,
 kondisi: cond,
 tanggal_serah_terima: dateStr,
 catatan_penyerahan: notes
 });

 // 2. Log in Pengambilan / Penyerahan
 const logData = {
 id_barang: targetAsset.id_item || targetAsset.id,
 nama_barang: targetAsset.nama_barang,
 kategori: targetAsset.kategori || "Aset",
 nama_karyawan: empName,
 tanggal: dateStr,
 jumlah_ambil: 1,
 jenis_aksi: "PENYERAHAN",
 status_pengembalian: "SEDANG_DIPAKAI",
 keperluan: notes || `Penyerahan Tanggung Jawab Aset (${targetAsset.kategori || 'Barang'})`
 };
 await fsAdd(COL.LOG_INVENTORY_PENGAMBILAN, logData);

 // 3. Notify Employee (email di-skip khusus kategori ATK, sama
 // seperti aturan pada input multi-baris ATK/Barang)
 const isAtkAsset = String(targetAsset.kategori || "").toLowerCase().includes("atk");
 await notifyUser(
 empName,
 "Penyerahan Aset Tanggung Jawab",
 `Anda telah diserahkan aset/inventaris: ${targetAsset.nama_barang} (${targetAsset.id_item || ''}). Buka dashboard untuk melihat detailnya.`,
 "#inventory",
 { sendEmail: !isAtkAsset }
 );

 toast(`Berhasil menyerahkan aset ${targetAsset.nama_barang} kepada ${empName}! Terbit Berita Acara Penyerahan.`, "success");
 closeModal();
 updateKpiSummary(container);

 // 4. Automatically generate Berita Acara Penyerahan/Peminjaman PDF
 printTandaTerimaBarang(logData);

 // Trigger reload on active panel
 const barangTab = container.querySelector("[data-itab='barang']");
 if (barangTab) barangTab.click();
 } catch (e) {
 toast("Gagal menyimpan penyerahan: " + e.message, "error");
 }
 };
 }
 });
}

// FUNGSI MODAL INPUT MULTI-BARIS PENYERAHAN ATK / BARANG
async function openMultiAssignModal(container, activeEmpNames) {
 const items = await fsGetAll(COL.MASTER_INVENTORY);
 if (!items.length) return toast("Belum ada master barang / ATK.", "warning");

 const sortedItems = items.slice().sort((a, b) => {
   const nameA = (a.nama_barang || "").toLowerCase();
   const nameB = (b.nama_barang || "").toLowerCase();
   return nameA.localeCompare(nameB, 'id', { sensitivity: 'base' });
 });

 const itemOptionsHtml = sortedItems
 .map(i => {
   const codeStr = i.id_item || i.id ? ` - [${i.id_item || i.id}]` : "";
   const catStr = i.kategori ? ` (${i.kategori})` : " (ATK)";
   const stokStr = typeof i.stok_saat_ini === "number" ? ` | Stok: ${i.stok_saat_ini}` : "";
   const nameAttr = (i.nama_barang || "").toLowerCase();
   return `<option value="${escapeHtml(i.id)}" data-nama="${escapeHtml(nameAttr)}">${escapeHtml(i.nama_barang)}${escapeHtml(codeStr)}${escapeHtml(catStr)}${escapeHtml(stokStr)}</option>`;
 })
 .join("");

 const empOptionsHtml = activeEmpNames
 .map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`)
 .join("");

 openModal({
 title: "Multi-Baris Input Log Penyerahan ATK / Barang",
 size: "xl",
 bodyHtml: `
 <div class="space-y-4 text-xs">
 <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed flex flex-wrap items-center justify-between gap-2">
 <div>
 <b>Input Banyak Baris Penyerahan / Pengambilan ATK dalam 1 Hari:</b><br/>
 Satu kali input dapat mencatat beberapa barang/ATK yang diambil oleh satu atau beberapa karyawan sekaligus.
 </div>
 <button id="btn-add-row-atk" type="button" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-lg shadow transition shrink-0">
 + Tambah Baris ATK
 </button>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
 <div class="flex items-center gap-2">
 <label class="font-bold text-slate-700 shrink-0">Tanggal Penyerahan:</label>
 <input type="date" id="multi-date" value="${new Date().toISOString().substring(0,10)}" class="p-2 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:border-maroon-500 w-full">
 </div>

 <div class="flex items-center gap-2 bg-slate-50 p-2 border border-slate-200 rounded-xl">
 <span class="font-bold text-slate-700 shrink-0">Cari Nama ATK:</span>
 <input type="text" id="filter-atk-name" placeholder="Ketik nama barang untuk menyaring..." 
 class="w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-maroon-500 bg-white">
 <button type="button" id="btn-clear-atk-filter" class="px-2.5 py-1.5 text-xs text-slate-600 font-semibold bg-slate-200 hover:bg-slate-300 rounded-lg shrink-0">Reset</button>
 </div>
 </div>

 <div class="overflow-x-auto border border-slate-200 rounded-xl bg-white">
 <table class="w-full text-left text-xs border-collapse">
 <thead>
 <tr class="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
 <th class="p-2.5 w-8 text-center">#</th>
 <th class="p-2.5 min-w-[240px]">Pilih Barang / ATK (Berdasarkan Nama)</th>
 <th class="p-2.5 min-w-[180px]">Karyawan Penerima</th>
 <th class="p-2.5 w-28">Jenis Transaksi</th>
 <th class="p-2.5 w-20">Qty</th>
 <th class="p-2.5 min-w-[150px]">Catatan / Keperluan</th>
 <th class="p-2.5 w-10 text-center">Aksi</th>
 </tr>
 </thead>
 <tbody id="multi-atk-rows" class="divide-y divide-slate-100">
 <!-- Dynamic rows rendered here -->
 </tbody>
 </table>
 </div>
 </div>`,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-multi-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
 <button id="btn-multi-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
 Simpan Semua Transaksi ATK
 </button>
 </div>`,
 onMount: m => {
 const tbody = m.querySelector("#multi-atk-rows");
 const filterInput = m.querySelector("#filter-atk-name");
 const btnClearFilter = m.querySelector("#btn-clear-atk-filter");

 function applyFilterToSelect(selectEl) {
 if (!filterInput) return;
 const q = filterInput.value.trim().toLowerCase();
 Array.from(selectEl.options).forEach(opt => {
 if (!opt.value) return;
 const nameText = opt.getAttribute("data-nama") || opt.textContent.toLowerCase();
 if (!q || nameText.includes(q)) {
 opt.hidden = false;
 opt.style.display = "";
 } else {
 opt.hidden = true;
 opt.style.display = "none";
 }
 });
 }

 function applyFilterAll() {
 tbody.querySelectorAll(".m-item").forEach(select => applyFilterToSelect(select));
 }

 if (filterInput) {
 filterInput.oninput = applyFilterAll;
 }
 if (btnClearFilter) {
 btnClearFilter.onclick = () => {
 if (filterInput) filterInput.value = "";
 applyFilterAll();
 };
 }

 function addRow() {
 const tr = document.createElement("tr");
 tr.className = "hover:bg-slate-50/70 transition multi-row-item";
 tr.innerHTML = `
 <td class="p-2.5 text-center font-bold text-slate-400 row-num">1</td>
 <td class="p-2">
 <select class="m-item w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-maroon-500 bg-white font-medium" required>
 <option value="">-- Pilih Barang / ATK (Urut Nama) --</option>
 ${itemOptionsHtml}
 </select>
 </td>
 <td class="p-2">
 <select class="m-emp w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-maroon-500 bg-white" required>
 <option value="">-- Pilih Karyawan --</option>
 ${empOptionsHtml}
 </select>
 </td>
 <td class="p-2">
 <select class="m-type w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-maroon-500 bg-white">
 <option value="PENYERAHAN">Penyerahan</option>
 <option value="PENGEMBALIAN">Pengembalian</option>
 </select>
 </td>
 <td class="p-2">
 <input type="number" min="1" value="1" class="m-qty w-full p-2 text-xs border border-slate-300 rounded-lg text-center font-bold outline-none focus:border-maroon-500" required>
 </td>
 <td class="p-2">
 <input type="text" placeholder="Keperluan ATK..." class="m-notes w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-maroon-500">
 </td>
 <td class="p-2 text-center">
 <button type="button" class="btn-del-row p-1 text-slate-400 hover:text-rose-600 transition" title="Hapus Baris">
 &times;
 </button>
 </td>
 `;

 const selectEl = tr.querySelector(".m-item");
 applyFilterToSelect(selectEl);

 tr.querySelector(".btn-del-row").onclick = () => {
 if (tbody.querySelectorAll(".multi-row-item").length <= 1) {
 toast("Minimal harus ada 1 baris transaksi.", "warning");
 return;
 }
 tr.remove();
 reindexRows();
 };

 tbody.appendChild(tr);
 reindexRows();
 }

 function reindexRows() {
 tbody.querySelectorAll(".multi-row-item").forEach((tr, idx) => {
 tr.querySelector(".row-num").textContent = idx + 1;
 });
 }

 // Add 2 initial rows
 addRow();
 addRow();

 m.querySelector("#btn-add-row-atk").onclick = () => addRow();
 m.querySelector("#btn-multi-close").onclick = closeModal;

 m.querySelector("#btn-multi-save").onclick = async () => {
 const dateVal = m.querySelector("#multi-date").value;
 const rowEls = tbody.querySelectorAll(".multi-row-item");
 
 const payloadRows = [];
 for (const tr of rowEls) {
 const itemDocId = tr.querySelector(".m-item").value;
 const empName = tr.querySelector(".m-emp").value;
 const typeVal = tr.querySelector(".m-type").value;
 const qtyVal = parseInt(tr.querySelector(".m-qty").value, 10) || 1;
 const notesVal = tr.querySelector(".m-notes").value.trim();

 if (!itemDocId || !empName) {
 return toast("Harap lengkapi Barang dan Karyawan di seluruh baris!", "warning");
 }

 const targetItem = items.find(i => i.id === itemDocId);
 payloadRows.push({
 item: targetItem,
 itemDocId,
 empName,
 typeVal,
 qtyVal,
 notesVal
 });
 }

 const btnSave = m.querySelector("#btn-multi-save");
 btnSave.disabled = true;
 btnSave.innerHTML = `Menyimpan ${payloadRows.length} Baris...`;

 try {
 for (const row of payloadRows) {
 const { item, itemDocId, empName, typeVal, qtyVal, notesVal } = row;
 const logId = genId("AMB");

 // 1. Add Log Record
 await fsAdd(COL.LOG_INVENTORY_PENGAMBILAN, {
 id_barang: item ? (item.id_item || item.id) : itemDocId,
 nama_barang: item ? item.nama_barang : "ATK / Barang",
 kategori: item ? (item.kategori || "ATK") : "ATK",
 nama_karyawan: empName,
 tanggal: dateVal,
 jumlah_ambil: qtyVal,
 jenis_aksi: typeVal,
 status_pengembalian: typeVal === "PENYERAHAN" ? "SEDANG_DIPAKAI" : "DIKEMBALIKAN",
 keperluan: notesVal || `Penyerahan Batch ATK/Barang (${qtyVal} Unit)`
 }, logId);

 // 2. Update Master Inventory
 if (item) {
 const updates = {};
 if (typeVal === "PENYERAHAN") {
 updates.assigned_to = empName;
 } else {
 updates.assigned_to = "Unassigned";
 }
 if (typeof item.stok_saat_ini === "number") {
 updates.stok_saat_ini = Math.max(0, typeVal === "PENYERAHAN" ? item.stok_saat_ini - qtyVal : item.stok_saat_ini + qtyVal);
 }
 await fsUpdate(COL.MASTER_INVENTORY, itemDocId, updates);
 }

 // 3. Notify Recipient (App lonceng + Push selalu jalan; Email
 // KHUSUS di-skip untuk kategori "ATK & Office Supplies" sesuai
 // permintaan HRD -- ATK dianggap barang habis pakai kecil yang
 // tidak perlu email formal, sedangkan Aset/Inventaris/Seragam
 // tetap dikirimi email seperti biasa).
 const kategoriRow = (item ? (item.kategori || "") : "ATK").toLowerCase();
 const isATK = kategoriRow.includes("atk");
 await notifyUser(
 empName,
 "Penyerahan / Pengambilan ATK",
 `Anda tercatat menerima/mengambil ${qtyVal} unit ${item ? item.nama_barang : 'ATK'} pada tanggal ${fmtDateShort(dateVal)}.`,
 "#inventory",
 { sendEmail: !isATK }
 );
 }

 toast(`Berhasil menyimpan ${payloadRows.length} baris log penyerahan ATK!`, "success");
 closeModal();
 updateKpiSummary(container);

 // Trigger refresh of active panel
 const ambilTab = container.querySelector("[data-itab='ambil']");
 if (ambilTab) ambilTab.click();
 } catch (e) {
 toast("Gagal menyimpan multi-baris ATK: " + e.message, "error");
 } finally {
 btnSave.disabled = false;
 btnSave.innerHTML = `Simpan Semua Transaksi ATK`;
 }
 };
 }
 });
}

// FUNGSI CETAK BLANKO STOCK OPNAME
async function printBlankoOpname() {
 const { downloadHtmlAsPdf, toast, escapeHtml: esc } = await import("../utils.js");
 
 try {
  const items = await fsGetAll(COL.MASTER_INVENTORY) || [];
  items.sort((a,b) => (a.nama_barang || "").localeCompare(b.nama_barang || ""));
  
  let tableRows = "";
  if (!items || items.length === 0) {
   tableRows = Array.from({ length: 12 }).map((_, idx) => `
    <tr>
     <td style="border: 1px solid #000; padding: 6px 5px; text-align:center; font-size:10px; box-sizing:border-box;">${idx + 1}</td>
     <td style="border: 1px solid #000; padding: 6px 5px; font-size:10px; box-sizing:border-box;"></td>
     <td style="border: 1px solid #000; padding: 6px 5px; font-size:10px; box-sizing:border-box;"></td>
     <td style="border: 1px solid #000; padding: 6px 5px; font-size:10px; box-sizing:border-box;"></td>
     <td style="border: 1px solid #000; padding: 6px 5px; text-align:center; font-size:10px; box-sizing:border-box;">-</td>
     <td style="border: 1px solid #000; padding: 6px 5px; font-size:10px; box-sizing:border-box;"></td>
     <td style="border: 1px solid #000; padding: 6px 5px; font-size:10px; box-sizing:border-box;"></td>
    </tr>`).join("");
  } else {
   tableRows = items.map(i => `
    <tr>
     <td style="border: 1px solid #000; padding: 5px 6px; font-family: monospace, sans-serif; font-size: 10px; font-weight: bold; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;">${esc(i.id_item || i.id || "-")}</td>
     <td style="border: 1px solid #000; padding: 5px 6px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;"><strong>${esc(i.nama_barang || "-")}</strong></td>
     <td style="border: 1px solid #000; padding: 5px 6px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;">${esc(i.kategori || "Aset/ATK")}</td>
     <td style="border: 1px solid #000; padding: 5px 6px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;">${esc(i.assigned_to || "Unassigned")}</td>
     <td style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-size: 10px; font-weight: bold; box-sizing: border-box;">${i.stok_saat_ini ?? 1}</td>
     <td style="border: 1px solid #000; padding: 5px 6px; box-sizing: border-box;"></td>
     <td style="border: 1px solid #000; padding: 5px 6px; box-sizing: border-box;"></td>
    </tr>`).join("");
  }

  const html = `
  <style>
   thead { display: table-header-group !important; }
   tr { page-break-inside: avoid !important; break-inside: avoid !important; }
  </style>
  <div style="width:100%; max-width:100%; margin:0; padding:0; font-family:'Times New Roman', Times, serif; font-size:10.5px; line-height:1.35; color:#000; background:#ffffff; box-sizing:border-box;">
   <div style="page-break-inside:avoid; margin-bottom:12px;">
    ${isoDocHeaderTable({ judul: "BLANKO PEMERIKSAAN FISIK ASET & INVENTARIS (STOCK OPNAME)", noDok: "GA-OPNAME", terbitRevisi: "1/1", tglTerbit: "1 September 2025", hal: "1 dari 1" })}
   </div>
   <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1.5px solid #000; table-layout: fixed; box-sizing: border-box;">
    <colgroup>
     <col style="width: 13%;" />
     <col style="width: 31%;" />
     <col style="width: 14%;" />
     <col style="width: 16%;" />
     <col style="width: 8%;" />
     <col style="width: 8%;" />
     <col style="width: 10%;" />
    </colgroup>
    <thead>
     <tr style="background: #f1f5f9; page-break-inside: avoid;">
      <th style="border: 1px solid #000; padding: 6px 4px; text-align: center; font-weight: bold; font-size: 10px; vertical-align: middle;">ID Aset</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 10px; vertical-align: middle;">Nama Barang / Aset</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 10px; vertical-align: middle;">Kategori</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 10px; vertical-align: middle;">Penanggung Jawab</th>
      <th style="border: 1px solid #000; padding: 6px 2px; text-align: center; font-weight: bold; font-size: 9.5px; vertical-align: middle;">Qty Sistem</th>
      <th style="border: 1px solid #000; padding: 6px 2px; text-align: center; font-weight: bold; font-size: 9.5px; vertical-align: middle;">Cek Fisik</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 9.5px; vertical-align: middle;">Catatan Kondisi</th>
     </tr>
    </thead>
    <tbody>${tableRows}</tbody>
   </table>
   <table style="width:100%; text-align:center; margin-top:35px; page-break-inside:avoid; font-size:11px;">
    <tr><td width="50%">Petugas Pemeriksa,</td><td width="50%">Mengetahui HRD / GA,</td></tr>
    <tr><td height="55"></td><td></td></tr>
    <tr><td>( ................................... )</td><td>( ................................... )</td></tr>
   </table>
  </div>`;

  openModal({
   title: "Pratinjau Dokumen - Blanko Stock Opname Aset",
   size: "lg",
   bodyHtml: `
    <div class="space-y-3 text-xs">
     <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed flex items-center justify-between">
      <div>
       <b>Pratinjau Dokumen Blanko Stock Opname</b><br/>
       Periksa tampilan isi dokumen di bawah ini sebelum mengunduh atau mencetak file PDF.
      </div>
     </div>
     <div class="bg-slate-100 p-4 rounded-2xl border border-slate-200 overflow-y-auto max-h-[500px]">
      <div class="bg-white p-6 shadow-sm rounded-lg mx-auto border border-slate-200" style="max-width: 760px;">
       ${html}
      </div>
     </div>
    </div>`,
   footerHtml: `
    <div class="flex items-center justify-between w-full">
     <button id="btn-modal-close-opname" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup</button>
     <button id="btn-modal-download-opname-pdf" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
      Cetak / Unduh PDF Dokumen
     </button>
    </div>`,
   onMount: (m) => {
    m.querySelector("#btn-modal-close-opname").onclick = closeModal;
    m.querySelector("#btn-modal-download-opname-pdf").onclick = async () => {
     toast("Sedang memproses dan mengunduh PDF...", "info");
     await downloadHtmlAsPdf(html, `Blanko_Stock_Opname_Aset.pdf`);
     toast("PDF Blanko Opname berhasil diunduh!", "success");
    };
   }
  });
 } catch (err) {
  console.error("Gagal membuat pratinjau blanko opname:", err);
  toast("Gagal memuat dokumen: " + err.message, "error");
 }
}

async function printTandaTerimaBarang(row) {
 const { downloadHtmlAsPdf, toast, fsGetAll: fsGetAllUtil, escapeHtml: esc, fmtDateShort: fmtDS } = await import("../utils.js");
 
 try {
  let allLogs = [];
  try {
   allLogs = await fsGetAllUtil(COL.LOG_INVENTORY_PENGAMBILAN) || [];
  } catch (e) {
   allLogs = [row];
  }
  const sameBatch = allLogs.filter(r =>
   String(r.nama_karyawan || "").trim().toLowerCase() === String(row.nama_karyawan || "").trim().toLowerCase() &&
   String(r.tanggal || "") === String(row.tanggal || "") &&
   String(r.jenis_aksi || "") === String(row.jenis_aksi || "")
  );
  const items = sameBatch.length > 0 ? sameBatch : [row];

  const itemsTableRows = items.map((it, idx) => `
   <tr>
    <td style="border: 1px solid #000; padding: 5px 4px; text-align:center; font-size:10px; box-sizing:border-box;">${idx + 1}</td>
    <td style="border: 1px solid #000; padding: 5px 6px; font-family: monospace, sans-serif; font-size: 10px; font-weight: bold; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;">${esc(it.id_barang || it.id || "-")}</td>
    <td style="border: 1px solid #000; padding: 5px 6px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;"><strong>${esc(it.nama_barang || "-")}</strong></td>
    <td style="border: 1px solid #000; padding: 5px 6px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;">${esc(it.kategori || "Aset")}</td>
    <td style="border: 1px solid #000; padding: 5px 4px; text-align:center; font-size: 10px; font-weight: bold; box-sizing: border-box;">${esc(String(it.jumlah_ambil ?? 1))}</td>
    <td style="border: 1px solid #000; padding: 5px 6px; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; box-sizing: border-box;">${esc(it.keperluan || it.catatan || "-")}</td>
   </tr>`).join("");

  const html = `
  <div style="width:100%; max-width:100%; margin:0; padding:0; font-family:'Times New Roman', Times, serif; font-size:10.5px; line-height:1.35; color:#000; background:#ffffff; box-sizing:border-box;">
   <div style="page-break-inside:avoid; margin-bottom:12px;">
    ${isoDocHeaderTable({ judul: "BERITA ACARA PENYERAHAN / PEMINJAMAN ASET PERUSAHAAN", noDok: "GA-BA-AST-01", terbitRevisi: "1/1", tglTerbit: "1 September 2025", hal: "1 dari 1" })}
   </div>
   <p style="text-align:justify; margin-bottom:10px; font-size:10.5px; line-height:1.4;">
    Pada hari ini, <b>${fmtDS(row.tanggal)}</b>, telah dilakukan penyerahan / peminjaman hak guna aset dan fasilitas perusahaan dari General Affair (GA) / HRD CV Andela Jaya kepada Karyawan penerima tanggung jawab dengan rincian sebagai berikut:
   </p>
   <table style="width: 100%; border-collapse: collapse; margin-top: 5px; border: 1.5px solid #000; table-layout: fixed; box-sizing: border-box;">
    <colgroup>
     <col style="width: 35%;" />
     <col style="width: 65%;" />
    </colgroup>
    <tr>
     <td style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc; font-size:10.5px; box-sizing:border-box;">Tanggal Serah Terima</td>
     <td style="border: 1px solid #000; padding: 6px 10px; font-size:10.5px; box-sizing:border-box;">${fmtDS(row.tanggal)}</td>
    </tr>
    <tr>
     <td style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc; font-size:10.5px; box-sizing:border-box;">Penanggung Jawab / Penerima</td>
     <td style="border: 1px solid #000; padding: 6px 10px; font-size:10.5px; box-sizing:border-box;"><strong>${esc(row.nama_karyawan || "-")}</strong></td>
    </tr>
   </table>
   <table style="width: 100%; border-collapse: collapse; margin-top: 12px; border: 1.5px solid #000; table-layout: fixed; box-sizing: border-box;">
    <colgroup>
     <col style="width: 6%;" />
     <col style="width: 18%;" />
     <col style="width: 36%;" />
     <col style="width: 14%;" />
     <col style="width: 8%;" />
     <col style="width: 18%;" />
    </colgroup>
    <thead>
     <tr style="background: #f1f5f9; page-break-inside: avoid;">
      <th style="border: 1px solid #000; padding: 6px 4px; text-align:center; font-weight:bold; font-size:10px; vertical-align:middle;">No</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align:left; font-weight:bold; font-size:10px; vertical-align:middle;">Kode / ID</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align:left; font-weight:bold; font-size:10px; vertical-align:middle;">Nama Aset / Inventaris</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align:left; font-weight:bold; font-size:10px; vertical-align:middle;">Kategori</th>
      <th style="border: 1px solid #000; padding: 6px 2px; text-align:center; font-weight:bold; font-size:10px; vertical-align:middle;">Qty</th>
      <th style="border: 1px solid #000; padding: 6px 4px; text-align:left; font-weight:bold; font-size:10px; vertical-align:middle;">Catatan / Kelengkapan</th>
     </tr>
    </thead>
    <tbody>${itemsTableRows}</tbody>
   </table>
   <div style="margin-top: 12px; font-size: 10px; line-height: 1.5; page-break-inside: avoid; border: 1px solid #000; padding: 8px 10px; background: #fafafa;">
    <strong>Ketentuan Tanggung Jawab Aset:</strong><br/>
    1. Penerima berkewajiban menjaga, merawat, dan menggunakan seluruh unit fisik di atas hanya untuk mendukung operasional kerja perusahaan.<br/>
    2. Dalam hal terdapat kerusakan akibat kelalaian atau kehilangan, Penerima berkewajiban melaporkan segera kepada unit GA/HRD.<br/>
    3. Saat pemutusan hubungan kerja (Resign / Offboarding / Rotasi), seluruh barang/aset dalam Berita Acara ini <u>WAJIB dikembalikan</u> secara utuh dalam kondisi baik.
   </div>
   <table style="width:100%; text-align:center; margin-top:28px; page-break-inside:avoid; font-size:11px;">
    <tr><td width="50%">Yang Menyerahkan (GA / HRD),</td><td width="50%">Yang Menerima Tanggung Jawab,</td></tr>
    <tr><td height="55"></td><td></td></tr>
    <tr><td>( ................................... )</td><td>( <strong>${esc(row.nama_karyawan || "")}</strong> )</td></tr>
   </table>
  </div>`;

  openModal({
   title: "Pratinjau Dokumen - Berita Acara Penyerahan Aset",
   size: "lg",
   bodyHtml: `
    <div class="space-y-3 text-xs">
     <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 leading-relaxed flex items-center justify-between">
      <div>
       <b>Pratinjau Dokumen Berita Acara Penyerahan Aset</b><br/>
       Dokumen mencakup <b>${items.length} item</b> penyerahan untuk <b>${esc(row.nama_karyawan || "-")}</b>.
      </div>
     </div>
     <div class="bg-slate-100 p-4 rounded-2xl border border-slate-200 overflow-y-auto max-h-[500px]">
      <div class="bg-white p-6 shadow-sm rounded-lg mx-auto border border-slate-200" style="max-width: 760px;">
       ${html}
      </div>
     </div>
    </div>`,
   footerHtml: `
    <div class="flex items-center justify-between w-full">
     <button id="btn-modal-close-ba" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup</button>
     <button id="btn-modal-download-ba-pdf" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
      Cetak / Unduh PDF Dokumen
     </button>
    </div>`,
   onMount: (m) => {
    m.querySelector("#btn-modal-close-ba").onclick = closeModal;
    m.querySelector("#btn-modal-download-ba-pdf").onclick = async () => {
     toast("Sedang memproses dan mengunduh PDF...", "info");
     await downloadHtmlAsPdf(html, `Berita_Acara_Penyerahan_${esc(row.nama_karyawan || "").replace(/\s+/g, "_")}_${esc(row.tanggal || "")}.pdf`);
     toast(items.length > 1
      ? `Berita Acara berhasil diunduh, mencakup ${items.length} barang dalam 1 dokumen!`
      : "Berita Acara Penyerahan Aset (PDF) berhasil diunduh!", "success");
    };
   }
  });
 } catch (err) {
  console.error("Gagal membuat pratinjau berita acara:", err);
  toast("Gagal memuat dokumen: " + err.message, "error");
 }
}

// =====================================================================
// MODUL RESTOCK & BELANJA ATK (STOK AMAN MINIMAL + EXPORT GAMBAR PNG/JPG)
// =====================================================================
async function loadRestockPanel(panelEl, container) {
  const items = await fsGetAll(COL.MASTER_INVENTORY);
  const restockItems = items.filter(i => {
    const stok = toNumber(i.stok_saat_ini);
    const minStok = toNumber(i.min_stok) || 5;
    return stok <= minStok;
  });

  const totalHabis = restockItems.filter(i => toNumber(i.stok_saat_ini) === 0).length;
  const totalEstimasiUnit = restockItems.reduce((acc, i) => {
    const minStok = toNumber(i.min_stok) || 5;
    const stok = toNumber(i.stok_saat_ini);
    const usulan = Math.max(1, (minStok * 2) - stok);
    return acc + usulan;
  }, 0);

  panelEl.innerHTML = `
    <div class="space-y-5">
      <!-- HEADER SUMMARY & ACTION TOOLBAR -->
      <div class="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-maroon-900 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-extrabold text-[11px] border border-rose-500/30">Restock & Belanja ATK</span>
            <span class="text-xs text-slate-300">CV ANDELA JAYA</span>
          </div>
          <h2 class="text-lg font-black tracking-tight">Daftar Barang Harus Dibeli (Stok Menipis / Kritis)</h2>
          <p class="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
            Menampilkan barang & ATK dengan stok saat ini &le; <b>Stok Aman Minimal</b>. Generate daftar belanja ini menjadi gambar PNG/JPG siap unduh.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <button id="btn-export-restock-excel" class="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Export Excel
          </button>
          <button id="btn-gen-image-png" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Export Gambar PNG / JPG
          </button>
          <button id="btn-refresh-restock" class="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- KPI METRICS RESTOCK -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">TOTAL BARANG PERLU DIBELI</p>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-rose-600">${restockItems.length}</span>
            <span class="text-xs text-slate-500 font-medium">Jenis Barang</span>
          </div>
        </div>
        <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">STOK HABIS TOTAL (0 UNIT)</p>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-rose-700">${totalHabis}</span>
            <span class="text-xs text-rose-600 font-bold">Kritis Segera Restock</span>
          </div>
        </div>
        <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ESTIMASI TOTAL KEBUTUHAN UNIT</p>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="text-2xl font-black text-slate-800">${totalEstimasiUnit.toLocaleString("id-ID")}</span>
            <span class="text-xs text-slate-500 font-medium">Unit Keseluruhan</span>
          </div>
        </div>
      </div>

      <!-- TABEL DAFTAR BELANJA RESTOCK -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 class="font-bold text-slate-800 text-sm">Daftar Barang & Stok Aman Minimal</h3>
            <p class="text-xs text-slate-500">Admin/GA dapat mengupdate stok saat barang habis/di-restock secara langsung.</p>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
            <select id="restock-status-filter" class="p-2 text-xs rounded-xl border border-slate-300 font-semibold outline-none focus:border-maroon-500 bg-white">
              <option value="">Semua Status</option>
              <option value="HABIS">Habis Total (0)</option>
              <option value="MENIPIS">Stok Menipis (>0)</option>
            </select>
            <input type="text" id="restock-search" placeholder="Cari nama barang / kategori..." class="p-2 text-xs rounded-xl border border-slate-300 w-full sm:w-64 outline-none focus:border-maroon-500 bg-white">
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left text-slate-700">
            <thead class="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
              <tr>
                <th class="py-3 px-4">No</th>
                <th class="py-3 px-4">Kode / ID</th>
                <th class="py-3 px-4">Nama Barang / ATK</th>
                <th class="py-3 px-4">Kategori</th>
                <th class="py-3 px-4 text-center">Stok Saat Ini</th>
                <th class="py-3 px-4 text-center">Stok Aman</th>
                <th class="py-3 px-4 text-center">Usulan Beli</th>
                <th class="py-3 px-4 text-center">Status</th>
                <th class="py-3 px-4 text-center">Aksi / Restock</th>
              </tr>
            </thead>
            <tbody id="restock-tbody" class="divide-y divide-slate-100 font-medium">
              ${renderRestockRows(restockItems)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // BIND SEARCH & STATUS FILTER & EVENTS
  const searchInput = panelEl.querySelector("#restock-search");
  const statusSelect = panelEl.querySelector("#restock-status-filter");
  const tbody = panelEl.querySelector("#restock-tbody");
  let currentFilteredItems = restockItems.slice();

  function applyRestockFilters() {
    const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const st = statusSelect ? statusSelect.value : "";

    currentFilteredItems = restockItems.filter(i => {
      const stok = toNumber(i.stok_saat_ini);
      const matchesSearch = !q || 
        (i.nama_barang || "").toLowerCase().includes(q) ||
        (i.id_item || i.id || "").toLowerCase().includes(q) ||
        (i.kategori || "").toLowerCase().includes(q);

      let matchesStatus = true;
      if (st === "HABIS") matchesStatus = (stok === 0);
      else if (st === "MENIPIS") matchesStatus = (stok > 0);

      return matchesSearch && matchesStatus;
    });

    if (tbody) {
      tbody.innerHTML = renderRestockRows(currentFilteredItems);
      bindRowRestockEvents(panelEl, container, currentFilteredItems);
    }
  }

  if (searchInput) searchInput.oninput = applyRestockFilters;
  if (statusSelect) statusSelect.onchange = applyRestockFilters;

  bindRowRestockEvents(panelEl, container, restockItems);

  // EVENT EXPORT EXCEL RESTOCK
  const btnExportExcel = panelEl.querySelector("#btn-export-restock-excel");
  if (btnExportExcel) {
    btnExportExcel.onclick = async () => {
      const itemsToExport = currentFilteredItems && currentFilteredItems.length ? currentFilteredItems : restockItems;
      if (!itemsToExport || itemsToExport.length === 0) {
        return toast("Tidak ada data barang restock untuk diexport", "warning");
      }
      try {
        const headers = [
          "No", "Kode / ID Barang", "Nama Barang / ATK", "Kategori",
          "Stok Saat Ini", "Stok Aman Minimal", "Usulan Beli", "Satuan", "Status Restock"
        ];
        const matrix = itemsToExport.map((item, idx) => {
          const stok = toNumber(item.stok_saat_ini);
          const minStok = toNumber(item.min_stok) || 5;
          const usulan = Math.max(1, (minStok * 2) - stok);
          const status = stok === 0 ? "HABIS TOTAL" : "STOK MENIPIS";
          return [
            idx + 1,
            item.id_item || item.id || "-",
            item.nama_barang || "-",
            item.kategori || "Umum",
            stok,
            minStok,
            usulan,
            item.satuan || "Unit",
            status
          ];
        });
        const dateStr = new Date().toISOString().slice(0, 10);
        const statusSuffix = statusSelect && statusSelect.value ? "_" + statusSelect.value : "";
        await downloadXlsx("Daftar_Belanja_Restock_ATK" + statusSuffix + "_" + dateStr + ".xlsx", headers, matrix, "Restock_ATK");
        toast("File Excel daftar restock ATK berhasil diunduh!", "success");
      } catch (err) {
        console.error("Gagal export excel restock:", err);
        toast("Gagal mengunduh file Excel: " + err.message, "error");
      }
    };
  }

  // EVENT EXPORT GAMBAR
  const btnExport = panelEl.querySelector("#btn-gen-image-png");
  if (btnExport) {
    btnExport.onclick = () => {
      const activeStatus = statusSelect ? statusSelect.value : "";
      openExportRestockImageModal(currentFilteredItems, restockItems, activeStatus);
    };
  }

  const btnRefresh = panelEl.querySelector("#btn-refresh-restock");
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      toast("Sistem menyegarkan daftar restock...", "info");
      loadRestockPanel(panelEl, container);
      updateKpiSummary(container);
    };
  }
}

function renderRestockRows(items) {
  if (!items || items.length === 0) {
    return `
      <tr>
        <td colspan="9" class="py-12 text-center text-slate-400 bg-slate-50/50 font-semibold">
          Seluruh stok barang & ATK saat ini dalam kondisi AMAN di atas batas minimal.
        </td>
      </tr>`;
  }

  return items.map((row, idx) => {
    const stok = toNumber(row.stok_saat_ini);
    const minStok = toNumber(row.min_stok) || 5;
    const usulanBeli = Math.max(1, (minStok * 2) - stok);
    const isZero = stok === 0;

    const statusBadge = isZero 
      ? `<span class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-rose-100 text-rose-800 border border-rose-200 inline-block">HABIS TOTAL</span>`
      : `<span class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-amber-100 text-amber-800 border border-amber-200 inline-block">MENIPIS</span>`;

    const stokBadge = isZero
      ? `<span class="px-2.5 py-1 font-black text-rose-700 bg-rose-50 rounded-lg text-xs border border-rose-200">0 ${escapeHtml(row.satuan || "Unit")}</span>`
      : `<span class="px-2.5 py-1 font-bold text-amber-800 bg-amber-50 rounded-lg text-xs border border-amber-200">${stok} ${escapeHtml(row.satuan || "Unit")}</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-bold text-slate-400">${idx + 1}</td>
        <td class="py-3 px-4 font-mono font-bold text-slate-800">${escapeHtml(row.id_item || row.id || "-")}</td>
        <td class="py-3 px-4">
          <p class="font-bold text-slate-800 text-xs">${escapeHtml(row.nama_barang)}</p>
          <p class="text-[10px] text-slate-400">${escapeHtml(row.lokasi || "Gudang Utama")}</p>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px]">${escapeHtml(row.kategori || "ATK")}</span>
        </td>
        <td class="py-3 px-4 text-center">${stokBadge}</td>
        <td class="py-3 px-4 text-center font-bold text-slate-600">${minStok} ${escapeHtml(row.satuan || "Unit")}</td>
        <td class="py-3 px-4 text-center font-black text-blue-700 bg-blue-50/50">+${usulanBeli} ${escapeHtml(row.satuan || "Unit")}</td>
        <td class="py-3 px-4 text-center">${statusBadge}</td>
        <td class="py-3 px-4 text-center">
          <button data-restock-id="${escapeHtml(row.id)}" class="btn-restock-item px-3 py-1.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center justify-center gap-1 mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Update / Tambah Stok
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function bindRowRestockEvents(panelEl, container, items) {
  panelEl.querySelectorAll(".btn-restock-item").forEach(btn => {
    btn.onclick = () => {
      const itemId = btn.dataset.restockId;
      const targetItem = items.find(i => i.id === itemId || i.id_item === itemId);
      if (!targetItem) return;

      const currentStok = toNumber(targetItem.stok_saat_ini);
      const minStok = toNumber(targetItem.min_stok) || 5;

      openModal({
        title: "Penambahan / Restock Stok Barang",
        size: "md",
        bodyHtml: `
          <form id="form-restock-update" class="space-y-4 text-xs text-left">
            <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed">
              <b>Update Penambahan Stok:</b><br/>
              Masukkan jumlah unit barang baru yang dibeli untuk menambahkan stok barang di database Master Inventory.
            </div>

            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <p><span class="text-slate-400">Nama Barang:</span> <b class="text-slate-800">${escapeHtml(targetItem.nama_barang)}</b></p>
              <p><span class="text-slate-400">ID / Kode:</span> <b class="text-slate-800 font-mono">${escapeHtml(targetItem.id_item || targetItem.id)}</b></p>
              <div class="flex items-center gap-4 mt-2 pt-2 border-t border-slate-200">
                <div>
                  <span class="text-slate-400 block text-[10px]">Stok Saat Ini:</span>
                  <b class="text-sm text-slate-800">${currentStok} ${escapeHtml(targetItem.satuan || "Unit")}</b>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px]">Batas Stok Aman:</span>
                  <b class="text-sm text-emerald-700">${minStok} ${escapeHtml(targetItem.satuan || "Unit")}</b>
                </div>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Jumlah Penambahan Stok (+ Unit)</label>
              <input type="number" id="restock-qty-add" value="${Math.max(1, (minStok * 2) - currentStok)}" min="1" required class="w-full p-2.5 border border-slate-300 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-maroon-500">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Nomor Nota / Supplier / Catatan Pembelian (Opsional)</label>
              <input type="text" id="restock-notes" placeholder="Cth: Pembelian Nota #1092 dari Toko ATK Jaya" class="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-maroon-500">
            </div>
          </form>`,
        footerHtml: `
          <div class="flex items-center justify-between w-full">
            <button id="btn-restock-cancel" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
            <button id="btn-restock-save" class="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition shadow">Simpan & Tambahkan Stok</button>
          </div>`,
        onMount: m => {
          m.querySelector("#btn-restock-cancel").onclick = closeModal;
          m.querySelector("#btn-restock-save").onclick = async () => {
            const qtyAdd = toNumber(m.querySelector("#restock-qty-add").value);
            const notes = m.querySelector("#restock-notes").value.trim();

            if (qtyAdd <= 0) return toast("Jumlah penambahan stok harus lebih dari 0", "warning");

            const newStokTotal = currentStok + qtyAdd;

            try {
              await fsUpdate(COL.MASTER_INVENTORY, targetItem.id, {
                stok_saat_ini: newStokTotal,
                catatan_restock_terakhir: notes ? `${notes} (+${qtyAdd} unit tgl ${new Date().toLocaleDateString('id-ID')})` : undefined
              });

              toast(`Berhasil menambahkan +${qtyAdd} unit! Stok total ${targetItem.nama_barang} kini menjadi ${newStokTotal}.`, "success");
              closeModal();

              // Reload
              loadRestockPanel(panelEl, container);
              updateKpiSummary(container);
            } catch (err) {
              toast("Gagal memperbarui stok: " + err.message, "error");
            }
          };
        }
      });
    };
  });
}

function openExportRestockImageModal(initialItemsToBuy, allRestockItems = [], initialStatus = "") {
  const sourceItems = (allRestockItems && allRestockItems.length) ? allRestockItems : (initialItemsToBuy || []);
  if (!sourceItems || sourceItems.length === 0) {
    return toast("Tidak ada barang dalam daftar belanja untuk diexport", "warning");
  }

  let activeStatus = initialStatus || "";
  let currentItemsToBuy = (initialItemsToBuy && initialItemsToBuy.length) ? initialItemsToBuy : sourceItems;

  function getStatusLabel(st) {
    if (st === "HABIS") return "Hanya Habis Total (Stok 0)";
    if (st === "MENIPIS") return "Hanya Stok Menipis (>0)";
    return "Semua Status (Habis & Menipis)";
  }

  let { dataUrlPng, dataUrlJpg } = generateRestockCanvasData(currentItemsToBuy, getStatusLabel(activeStatus));

  openModal({
    title: "Generate Gambar Daftar Belanja & Restock ATK",
    size: "lg",
    bodyHtml: `
      <div class="space-y-4 text-xs">
        <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <b>Filter & Generate Gambar Daftar Belanja:</b><br/>
            Pilih filter status untuk menyesuaikan daftar barang yang akan ditampilkan pada file gambar PNG / JPG.
          </div>
          <div class="shrink-0 flex items-center gap-2 bg-white p-2 rounded-xl border border-emerald-300 shadow-2xs">
            <label class="font-bold text-slate-700 text-xs shrink-0">Filter Status:</label>
            <select id="export-status-select" class="p-1.5 text-xs rounded-lg border border-slate-300 font-bold outline-none focus:border-maroon-500 bg-slate-50 text-slate-800">
              <option value="" ${activeStatus === "" ? "selected" : ""}>Semua Status (${sourceItems.length})</option>
              <option value="HABIS" ${activeStatus === "HABIS" ? "selected" : ""}>Hanya Habis Total (${sourceItems.filter(i => toNumber(i.stok_saat_ini) === 0).length})</option>
              <option value="MENIPIS" ${activeStatus === "MENIPIS" ? "selected" : ""}>Hanya Stok Menipis (${sourceItems.filter(i => toNumber(i.stok_saat_ini) > 0).length})</option>
            </select>
          </div>
        </div>

        <div class="bg-slate-100 p-2 rounded-2xl border border-slate-200 overflow-x-auto max-h-[420px] text-center relative">
          <img id="restock-preview-img" src="${dataUrlPng}" class="max-w-full h-auto mx-auto rounded-xl shadow border border-slate-300">
        </div>
      </div>`,
    footerHtml: `
      <div class="flex items-center justify-between w-full flex-wrap gap-2">
        <button id="btn-export-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup</button>
        <div class="flex items-center gap-2">
          <button id="btn-download-excel" class="px-4 py-2.5 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl transition flex items-center gap-1.5 shadow-2xs">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Download Data Excel
          </button>
          <button id="btn-download-jpg" class="px-4 py-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition flex items-center gap-1.5 shadow-2xs">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download Gambar JPG
          </button>
          <button id="btn-download-png" class="px-5 py-2.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download Gambar PNG (HD)
          </button>
        </div>
      </div>`,
    onMount: m => {
      m.querySelector("#btn-export-close").onclick = closeModal;

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

      const statusSelectModal = m.querySelector("#export-status-select");
      if (statusSelectModal) {
        statusSelectModal.onchange = () => {
          activeStatus = statusSelectModal.value;
          if (activeStatus === "HABIS") {
            currentItemsToBuy = sourceItems.filter(i => toNumber(i.stok_saat_ini) === 0);
          } else if (activeStatus === "MENIPIS") {
            currentItemsToBuy = sourceItems.filter(i => toNumber(i.stok_saat_ini) > 0);
          } else {
            currentItemsToBuy = sourceItems.slice();
          }

          if (currentItemsToBuy.length === 0) {
            toast("Tidak ada data barang untuk status filter yang dipilih", "warning");
          }

          const generated = generateRestockCanvasData(currentItemsToBuy, getStatusLabel(activeStatus));
          dataUrlPng = generated.dataUrlPng;
          dataUrlJpg = generated.dataUrlJpg;

          const previewImg = m.querySelector("#restock-preview-img");
          if (previewImg) previewImg.src = dataUrlPng;
        };
      }

      m.querySelector("#btn-download-excel").onclick = async () => {
        if (!currentItemsToBuy || currentItemsToBuy.length === 0) return toast("Tidak ada data untuk di-download", "warning");
        try {
          const headers = [
            "No", "Kode / ID Barang", "Nama Barang / ATK", "Kategori",
            "Stok Saat Ini", "Stok Aman Minimal", "Usulan Beli", "Satuan", "Status Restock"
          ];
          const matrix = currentItemsToBuy.map((item, idx) => {
            const stok = toNumber(item.stok_saat_ini);
            const minStok = toNumber(item.min_stok) || 5;
            const usulan = Math.max(1, (minStok * 2) - stok);
            const status = stok === 0 ? "HABIS TOTAL" : "STOK MENIPIS";
            return [
              idx + 1,
              item.id_item || item.id || "-",
              item.nama_barang || "-",
              item.kategori || "Umum",
              stok,
              minStok,
              usulan,
              item.satuan || "Unit",
              status
            ];
          });
          const suffix = activeStatus ? "_" + activeStatus : "";
          await downloadXlsx("Daftar_Belanja_Restock_ATK" + suffix + "_" + dateStr + ".xlsx", headers, matrix, "Restock_ATK");
          toast("File Excel daftar restock ATK berhasil diunduh!", "success");
        } catch (err) {
          console.error("Gagal export excel:", err);
          toast("Gagal mengunduh file Excel: " + err.message, "error");
        }
      };

      m.querySelector("#btn-download-png").onclick = () => {
        if (!currentItemsToBuy || currentItemsToBuy.length === 0) return toast("Tidak ada data untuk di-download", "warning");
        const suffix = activeStatus ? `_${activeStatus}` : "";
        downloadDataUrl(dataUrlPng, `Daftar_Belanja_ATK_Andela${suffix}_${dateStr}.png`);
        toast("Gambar PNG berhasil diunduh!", "success");
      };

      m.querySelector("#btn-download-jpg").onclick = () => {
        if (!currentItemsToBuy || currentItemsToBuy.length === 0) return toast("Tidak ada data untuk di-download", "warning");
        const suffix = activeStatus ? `_${activeStatus}` : "";
        downloadDataUrl(dataUrlJpg, `Daftar_Belanja_ATK_Andela${suffix}_${dateStr}.jpg`);
        toast("Gambar JPG berhasil diunduh!", "success");
      };
    }
  });
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function generateRestockCanvasData(itemsToBuy, statusLabel = "Semua Status (Habis & Menipis)") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const width = 1200;
  const rowHeight = 50;
  const headerHeight = 220;
  const footerHeight = 160;
  const height = headerHeight + (itemsToBuy.length * rowHeight) + footerHeight;

  canvas.width = width;
  canvas.height = height;

  // 1. Fill Background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // 2. Top Red Accent Header
  ctx.fillStyle = "#800000";
  ctx.fillRect(0, 0, width, 18);

  // 3. Company Title & Header Info
  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("CV ANDELA JAYA", 50, 65);

  ctx.fillStyle = "#64748B";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("GENERAL AFFAIRS & INVENTORY MANAGEMENT PORTAL", 50, 88);

  ctx.fillStyle = "#800000";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("DAFTAR BELANJA & RESTOCK ATK / ASET KANTOR", 50, 130);

  const todayStr = new Date().toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = "#475569";
  ctx.font = "12px sans-serif";
  ctx.fillText(`Tanggal Dokumen: ${todayStr}  |  Filter Status: ${statusLabel}  |  Total Kebutuhan: ${itemsToBuy.length} Jenis Barang`, 50, 155);

  // Divider Line
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, 175);
  ctx.lineTo(width - 50, 175);
  ctx.stroke();

  // 4. Table Header
  const startY = 190;
  ctx.fillStyle = "#1E293B";
  ctx.fillRect(50, startY, width - 100, 36);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("NO", 65, startY + 23);
  ctx.fillText("KODE ASET", 110, startY + 23);
  ctx.fillText("NAMA BARANG / DESKRIPSI ATK", 240, startY + 23);
  ctx.fillText("KATEGORI", 620, startY + 23);
  ctx.fillText("STOK SAAT INI", 770, startY + 23);
  ctx.fillText("STOK AMAN", 890, startY + 23);
  ctx.fillText("USULAN BELI", 1000, startY + 23);

  // 5. Table Rows
  let currentY = startY + 36;
  itemsToBuy.forEach((row, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
    ctx.fillRect(50, currentY, width - 100, rowHeight);

    ctx.strokeStyle = "#E2E8F0";
    ctx.beginPath();
    ctx.moveTo(50, currentY + rowHeight);
    ctx.lineTo(width - 50, currentY + rowHeight);
    ctx.stroke();

    const stok = toNumber(row.stok_saat_ini);
    const minStok = toNumber(row.min_stok) || 5;
    const usulan = Math.max(1, (minStok * 2) - stok);

    ctx.fillStyle = "#64748B";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${idx + 1}`, 68, currentY + 30);

    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${row.id_item || row.id || "-"}`, 110, currentY + 30);

    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 12px sans-serif";
    let nameText = row.nama_barang || "ATK Item";
    if (nameText.length > 40) nameText = nameText.substring(0, 37) + "...";
    ctx.fillText(nameText, 240, currentY + 30);

    ctx.fillStyle = "#475569";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${row.kategori || "ATK"}`, 620, currentY + 30);

    if (stok === 0) {
      ctx.fillStyle = "#DC2626";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`0 ${row.satuan || "Unit"} (HABIS)`, 770, currentY + 30);
    } else {
      ctx.fillStyle = "#D97706";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`${stok} ${row.satuan || "Unit"}`, 770, currentY + 30);
    }

    ctx.fillStyle = "#334155";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${minStok} ${row.satuan || "Unit"}`, 890, currentY + 30);

    ctx.fillStyle = "#1D4ED8";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`+${usulan} ${row.satuan || "Unit"}`, 1000, currentY + 30);

    currentY += rowHeight;
  });

  // 6. Footer Signature
  const footY = currentY + 30;
  ctx.fillStyle = "#64748B";
  ctx.font = "11px sans-serif";
  ctx.fillText("Catatan: Batas stok aman dihitung otomatis untuk menjaga ketersediaan barang operasional.", 50, footY);
  ctx.fillText("Di-generate otomatis oleh Portal HRIS & GA CV Andela Jaya", 50, footY + 18);

  const sigY = footY + 10;
  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("Dibuat Oleh (GA / HRD)", 750, sigY);
  ctx.fillText("( .................................................... )", 750, sigY + 65);

  ctx.fillText("Disetujui Oleh (Manajemen / Finance)", 950, sigY);
  ctx.fillText("( .................................................... )", 950, sigY + 65);

  const dataUrlPng = canvas.toDataURL("image/png");
  const dataUrlJpg = canvas.toDataURL("image/jpeg", 0.95);

  return { dataUrlPng, dataUrlJpg };
}

export async function mount(container, options = {}) {
 const params = options?.params;
 const session = options?.session;
 const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
 const activeEmpNames = karyawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF").map(k => k.nama_karyawan).sort();
 const empOptions = ["Unassigned", ...activeEmpNames];

 const panels = {
 barang: container.querySelector("#inv-panel-barang"),
 restock: container.querySelector("#inv-panel-restock"),
 ambil: container.querySelector("#inv-panel-ambil"),
 opname: container.querySelector("#inv-panel-opname"),
 };
 const loaded = {};

 // Quick Action Buttons
 const btnScanQr = container.querySelector("#btn-scan-qr");
 if (btnScanQr) {
 btnScanQr.onclick = () => openQrScannerModal(container, activeEmpNames);
 }

 const btnAssignQuick = container.querySelector("#btn-assign-asset-quick");
 if (btnAssignQuick) {
 btnAssignQuick.onclick = () => openQuickAssignModal(container, activeEmpNames);
 }

 const btnPrintQrAll = container.querySelector("#btn-print-qr-all");
 if (btnPrintQrAll) {
 btnPrintQrAll.onclick = () => openBatchQrCodeModal();
 }

 async function loadBarang() {
 await renderCrudModule(panels.barang, {
 title: "Master Aset & Inventaris",
 collectionName: COL.MASTER_INVENTORY,
 idPrefix: "INV",
 orderByField: "nama_barang", 
 printFn: openQrCodeModal,
 printLabel: "Label QR",
 searchFields: ["nama_barang", "id_item", "kategori", "penempatan", "lokasi", "assigned_to", "serial_number"],
 columns: [
 { key: "id_item", label: "ID ASET" },
 { key: "nama_barang", label: "Nama Barang / Aset" },
 { key: "kategori", label: "Kategori", type: "badge" },
 { key: "stok_saat_ini", label: "Stok Saat Ini", type: "number" },
 { key: "min_stok", label: "Stok Aman Minimal", type: "number" },
 { key: "penempatan", label: "Penempatan", format: (v, r) => r.penempatan || r.lokasi || r.assigned_to || "-" },
 { key: "kondisi", label: "Kondisi", type: "badge" },
 { key: "lokasi", label: "Lokasi" },
 ],
 formFields: Object.assign([
 { name: "id_item", label: "ID / Kode Aset (Cth: BC-IT-8822, AST-KEY-01)", type: "text", required: true },
 { name: "nama_barang", label: "Nama Barang / Deskripsi Aset", type: "text", required: true, full: true },
 { name: "kategori", label: "Kategori Aset", type: "select", required: true, options: [
 "Vehicles (Kendaraan)",
 "Office Eq (Elektronik & IT)",
 "Tools (Alat Kerja)",
 "Kunci & Akses Ruangan",
 "Dokumen Penting / Legal",
 "ATK & Office Supplies",
 "Furniture & Fasilitas",
 "Lainnya"
 ] },
 { name: "penempatan", label: "Penempatan Aset / Ruangan", type: "text", placeholder: "Cth: Ruang IT, Desk HRD, Gudang Utama, Ruang Meeting" },
 { name: "kondisi", label: "Kondisi Aset", type: "select", options: ["Good (Baik)", "Maintenance (Perlu Servis)", "Damaged (Rusak)"], default: "Good (Baik)" },
 { name: "serial_number", label: "No. Seri / No. Plat / No. Dokumen", type: "text" },
 { name: "lokasi", label: "Lokasi Penyimpanan / Cabang", type: "text" },
 { name: "satuan", label: "Satuan", type: "text", default: "Unit" },
 { name: "stok_saat_ini", label: "Jumlah Stok Saat Ini", type: "number", default: 1 },
 { name: "min_stok", label: "Stok Aman Minimal (Batas Alert Restock)", type: "number", default: 5 },
 { name: "catatan", label: "Catatan Kelengkapan", type: "textarea", full: true }
 ], { idFromField: "id_item" }),
 afterSave: async (data) => {
 updateKpiSummary(container);
 }
 });

 updateKpiSummary(container);
 }

 function openReturnAssetModal(row) {
 openModal({
 title: "Proses Pengembalian Aset Perusahaan",
 size: "md",
 bodyHtml: `
 <form id="form-return-asset" class="space-y-4 text-xs text-left">
 <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
 <b>Pengembalian Tanggung Jawab Aset:</b><br/>
 Ubah status transaksi ini menjadi <b>DIKEMBALIKAN</b>. Penanggung jawab di Master Barang akan otomatis kembali menjadi <b>Unassigned</b>.
 </div>

 <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 font-medium">
 <p><span class="text-slate-400">Nama Aset:</span> <b class="text-slate-800">${escapeHtml(row.nama_barang)}</b> (${escapeHtml(row.id_barang || row.id)})</p>
 <p><span class="text-slate-400">Karyawan Pemegang:</span> <b class="text-slate-800">${escapeHtml(row.nama_karyawan)}</b></p>
 <p><span class="text-slate-400">Tanggal Serah Terima:</span> <b class="text-slate-800">${fmtDateShort(row.tanggal)}</b></p>
 </div>

 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block font-bold text-slate-700 mb-1">Tanggal Pengembalian</label>
 <input type="date" id="ret-date" value="${new Date().toISOString().substring(0,10)}" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 outline-none focus:border-maroon-500">
 </div>
 <div>
 <label class="block font-bold text-slate-700 mb-1">Kondisi Saat Dikembalikan</label>
 <select id="ret-cond" class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
 <option value="Good">Baik (Good)</option>
 <option value="Maintenance">Perlu Servis / Perbaikan</option>
 <option value="Damaged">Rusak / Bermasalah</option>
 </select>
 </div>
 </div>

 <div>
 <label class="block font-bold text-slate-700 mb-1">Catatan Pengembalian / Cek Fisik</label>
 <textarea id="ret-notes" rows="2" placeholder="Cth: Dikembalikan dalam keadaan bersih & fisik utuh." class="w-full p-2.5 text-xs rounded-xl border border-slate-300 outline-none focus:border-maroon-500"></textarea>
 </div>
 </form>`,
 footerHtml: `
 <div class="flex items-center justify-between w-full">
 <button id="btn-ret-close" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
 <button id="btn-ret-save" class="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition shadow">Konfirmasi Pengembalian Aset</button>
 </div>`,
 onMount: m => {
 m.querySelector("#btn-ret-close").onclick = closeModal;
 m.querySelector("#btn-ret-save").onclick = async () => {
 const retDate = m.querySelector("#ret-date").value;
 const retCond = m.querySelector("#ret-cond").value;
 const retNotes = m.querySelector("#ret-notes").value.trim();

 try {
 // 1. Update Log Record in Firestore
 await fsUpdate(COL.LOG_INVENTORY_PENGAMBILAN, row.id, {
 status_pengembalian: "DIKEMBALIKAN",
 jenis_aksi: "PENGEMBALIAN",
 tanggal_dikembalikan: retDate,
 kondisi_pengembalian: retCond,
 catatan_pengembalian: retNotes
 });

 // 2. Update Master Inventory Item
 const masterItems = await fsGetAll(COL.MASTER_INVENTORY);
 const targetMaster = masterItems.find(i => 
 (i.id_item && i.id_item === row.id_barang) || 
 i.id === row.id_barang || 
 i.nama_barang === row.nama_barang
 );

 if (targetMaster) {
 const updates = {
 assigned_to: "Unassigned",
 kondisi: retCond === "Good" ? "Good (Baik)" : (retCond === "Maintenance" ? "Maintenance (Perlu Servis)" : "Damaged (Rusak)")
 };
 if (typeof targetMaster.stok_saat_ini === "number") {
 updates.stok_saat_ini = targetMaster.stok_saat_ini + (row.jumlah_ambil || 1);
 }
 await fsUpdate(COL.MASTER_INVENTORY, targetMaster.id, updates);
 }

 // 3. Notify Employee (email di-skip khusus kategori ATK)
 const isAtkReturn = String(row.kategori || "").toLowerCase().includes("atk");
 await notifyUser(
 row.nama_karyawan,
 "Pengembalian Aset Berhasil",
 `Pengembalian aset ${row.nama_barang} tanggal ${fmtDateShort(retDate)} telah diverifikasi dan dicatat oleh HRD/GA.`,
 "#inventory",
 { sendEmail: !isAtkReturn }
 );

 toast(`Status aset ${row.nama_barang} berhasil diubah menjadi DIKEMBALIKAN!`, "success");
 closeModal();
 updateKpiSummary(container);
 await loadAmbil();
 } catch (err) {
 toast("Gagal memproses pengembalian: " + err.message, "error");
 }
 };
 }
 });
 }

 async function loadAmbil() {
 const items = await fsGetAll(COL.MASTER_INVENTORY);
 await renderCrudModule(panels.ambil, {
 title: "Log Penyerahan & Pengembalian Aset",
 collectionName: COL.LOG_INVENTORY_PENGAMBILAN, idPrefix: "AMB", canEdit: false,
 printFn: printTandaTerimaBarang, printLabel: "Cetak Berita Acara PDF",
 extraToolbarHtml: `<button id="btn-multi-assign-atk" class="bg-maroon-700 hover:bg-maroon-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5">Input Multi-Baris Penyerahan ATK/Aset</button>`,
 searchFields: ["nama_barang", "nama_karyawan", "jenis_aksi", "status_pengembalian"],
 columns: [
 { key: "tanggal", label: "Tanggal", type: "date" },
 { key: "nama_barang", label: "Nama Barang / Aset" },
 { key: "nama_karyawan", label: "Penanggung Jawab" },
 { key: "jenis_aksi", label: "Jenis Transaksi", type: "badge" },
 { key: "status_pengembalian", label: "Status Clearance", type: "badge" },
 { key: "jumlah_ambil", label: "Qty", type: "number" },
 ],
 onRowRender: (list, containerEl) => {
 const tbody = containerEl.querySelector("#crud-tbody");
 if (!tbody) return;
 const trs = tbody.querySelectorAll("tr");
 trs.forEach((tr, idx) => {
 const rowData = list[idx];
 if (!rowData) return;

 const actionTd = tr.querySelector("td:last-child");
 if (!actionTd) return;

 const statusUpper = (rowData.status_pengembalian || "").toUpperCase();
 const aksiUpper = (rowData.jenis_aksi || "").toUpperCase();
 const isReturned = statusUpper === "DIKEMBALIKAN" || aksiUpper === "PENGEMBALIAN";

 if (!isReturned) {
 const btnReturn = document.createElement("button");
 btnReturn.className = "px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition ml-1.5 inline-flex items-center gap-1 shadow-2xs";
 btnReturn.innerHTML = `Kembalikan`;
 btnReturn.title = "Ubah status menjadi DIKEMBALIKAN (Return Asset)";
 btnReturn.onclick = () => openReturnAssetModal(rowData);
 actionTd.appendChild(btnReturn);
 } else {
 const badgeDone = document.createElement("span");
 badgeDone.className = "px-2 py-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 rounded-md ml-1.5 inline-block border border-emerald-100";
 badgeDone.textContent = "Dikembalikan";
 actionTd.appendChild(badgeDone);
 }
 });
 },
 formFields: [
 { name: "tanggal", label: "Tanggal", type: "date", required: true },
 { name: "nama_barang_pilihan", label: "Pilih Barang / Aset (Urut Nama)", type: "select", required: true, options: items.slice().sort((a,b) => (a.nama_barang || "").toLowerCase().localeCompare((b.nama_barang || "").toLowerCase(), 'id')).map(i => `${i.nama_barang} - [${i.id_item || i.id}]`) },
 { name: "nama_karyawan", label: "Penanggung Jawab Karyawan", type: "select", options: activeEmpNames, required: true },
 { name: "jenis_aksi", label: "Jenis Aksi", type: "select", options: ["PENYERAHAN", "PENGEMBALIAN"], default: "PENYERAHAN" },
 { name: "jumlah_ambil", label: "Jumlah Unit", type: "number", required: true, default: 1 },
 { name: "keperluan", label: "Catatan Keperluan / Kondisi", type: "textarea", full: true },
 ],
 beforeSave: async (data) => {
 const selectedStr = data.nama_barang_pilihan || "";
 const item = items.find(i => `${i.nama_barang} - [${i.id_item || i.id}]` === selectedStr || `${i.id_item || i.id} - ${i.nama_barang}` === selectedStr || i.nama_barang === selectedStr);
 if (!item) throw new Error("Aset tidak ditemukan.");

 if (data.jenis_aksi === "PENYERAHAN") {
 data.status_pengembalian = "SEDANG_DIPAKAI";
 await fsUpdate(COL.MASTER_INVENTORY, item.id, {
 assigned_to: data.nama_karyawan
 });
 } else if (data.jenis_aksi === "PENGEMBALIAN") {
 data.status_pengembalian = "DIKEMBALIKAN";
 await fsUpdate(COL.MASTER_INVENTORY, item.id, {
 assigned_to: "Unassigned"
 });
 }

 data.id_barang = item.id_item || item.id;
 data.nama_barang = item.nama_barang;
 delete data.nama_barang_pilihan;
 return data;
 },
 afterSave: async (savedData) => {
 updateKpiSummary(container);
 if (savedData && savedData.jenis_aksi === "PENYERAHAN") {
 printTandaTerimaBarang(savedData);
 }
 }
 });

 const btnMulti = panels.ambil.querySelector("#btn-multi-assign-atk");
 if (btnMulti) {
 btnMulti.onclick = () => openMultiAssignModal(container, activeEmpNames);
 }
 }

 async function loadOpname() {
 await renderCrudModule(panels.opname, {
 title: "Stock Opname & Cek Fisik Aset",
 collectionName: COL.STOCK_OPNAME, idPrefix: "OPN",
 searchFields: ["nama_barang", "nama_karyawan"],
 extraToolbarHtml: `<button id="btn-print-blanko" class="bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold shadow hover:bg-slate-900 transition flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg> Cetak Blanko Opname (PDF)</button>`,
 columns: [
 { key: "tanggal", label: "Tanggal", type: "date" }, 
 { key: "nama_barang", label: "Nama Barang / Aset" },
 { key: "jumlah_ambil", label: "Hasil Fisik", type: "number" }, 
 { key: "nama_karyawan", label: "Petugas GA/HRD" },
 ],
 formFields: [
 { name: "tanggal", label: "Tanggal Pemeriksaan", type: "date", required: true },
 { name: "nama_barang", label: "Nama Aset / ID Barang", type: "text", required: true },
 { name: "jumlah_ambil", label: "Jumlah Hasil Cek Fisik", type: "number", required: true },
 { name: "nama_karyawan", label: "Petugas Pemeriksa", type: "select", options: activeEmpNames, required: true },
 { name: "keperluan", label: "Catatan Fisik / Selisih", type: "textarea", full: true },
 ]
 });
 panels.opname.querySelector("#btn-print-blanko").onclick = printBlankoOpname;
 }

 await loadBarang(); loaded.barang = true;

 const rawTargetId = (params && typeof params.get === "function" ? params.get("id") : null) || parseAssetIdFromQuery(window.location.hash);
 if (rawTargetId) {
  try {
   const allItems = await fsGetAll(COL.MASTER_INVENTORY);
   const found = allItems.find(i => (i.id_item || i.id || "").toLowerCase() === rawTargetId.toLowerCase());
   if (found) {
    openAssetDetailAndUpdateStockModal(found, activeEmpNames, session, container);
   } else {
    toast(`Aset dengan ID "${rawTargetId}" tidak ditemukan.`, "warning");
   }
  } catch(err) {
   console.warn("Auto open asset detail error:", err);
  }
 }

 container.querySelectorAll(".inv-tab").forEach(btn => {
 btn.addEventListener("click", async () => {
 const tab = btn.dataset.itab;
 Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
 container.querySelectorAll(".inv-tab").forEach(b => {
 b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
 b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
 });
 if (!loaded[tab]) {
 loaded[tab] = true;
 if (tab === "restock") await loadRestockPanel(panels.restock, container);
 if (tab === "ambil") await loadAmbil();
 if (tab === "opname") await loadOpname();
 } else if (tab === "restock") {
 await loadRestockPanel(panels.restock, container);
 }
 });
 });

 return { unmount() {} };
}
