import { COL } from "../firebase-config.js";
import { fsGetAll, fsUpdate, fsAdd, toNumber, escapeHtml, fmtDateShort, openModal, closeModal, toast, notifyUser } from "../utils.js";
import { renderCrudModule } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

// FUNGSI UPDATE KPI CARDS
async function updateKpiSummary(container) {
  try {
    const items = await fsGetAll(COL.MASTER_INVENTORY);
    const totalCount = items.length;
    
    let maintenanceCount = 0;
    let assignedCount = 0;
    let readyCount = 0;

    items.forEach(i => {
      const cond = (i.kondisi || "Good").toUpperCase();
      const assigned = (i.assigned_to || "").trim();

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

    if (elTotal) elTotal.textContent = totalCount.toLocaleString("id-ID");
    if (elMaint) elMaint.textContent = maintenanceCount.toLocaleString("id-ID");
    if (elAssigned) elAssigned.textContent = assignedCount.toLocaleString("id-ID");
    if (elReady) elReady.textContent = readyCount.toLocaleString("id-ID");
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
    title: "📷 Cetak Label QR Code Aset Massal (Semua Kategori)",
    size: "lg",
    bodyHtml: `
      <div class="space-y-4 text-xs">
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 leading-relaxed">
          <b>📷 Stiker QR Code Seluruh Barang & Kategori:</b><br/>
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
          🖨️ Cetak Lembar Stiker QR (Print / PDF)
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
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(JSON.stringify({ id: assetId, name: row.nama_barang, cat: row.kategori }))}`;
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
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(JSON.stringify({ id: assetId, name: row.nama_barang, cat: row.kategori }))}`;
          return `
            <div class="sticker">
              <img src="${qrUrl}" />
              <div class="code">${escapeHtml(assetId)}</div>
              <div class="title">${escapeHtml(row.nama_barang)}</div>
              <div class="meta">${escapeHtml(row.kategori || "Aset")} • PJ: ${escapeHtml(row.assigned_to || "Unassigned")}</div>
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
          <b>📷 Pemindai QR Code & Audit Aset:</b><br/>
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
              ❌ Aset dengan ID / kata kunci "<b>${escapeHtml(queryClean)}</b>" tidak ditemukan dalam database.
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
            <button id="btn-scan-single-print" class="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">🖨️ Cetak Stiker</button>
            <button id="btn-scan-reassign" class="px-3 py-1.5 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-lg transition">🔄 Serah Terima Aset</button>
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
    title: "📷 Label QR Code Aset Perusahaan",
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
            Penanggung Jawab: <b>${escapeHtml(row.assigned_to || "Unassigned")}</b>
          </div>
        </div>
      </div>`,
    footerHtml: `
      <div class="flex items-center justify-between w-full">
        <button id="btn-qr-close" class="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Tutup</button>
        <button id="btn-qr-print" class="px-4 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow flex items-center gap-1.5">
          🖨️ Cetak Stiker QR
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
                <p>PJ: ${escapeHtml(row.assigned_to || "Unassigned")}</p>
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
  const unassignedItems = items.filter(i => !i.assigned_to || i.assigned_to === "Unassigned" || i.assigned_to === "-");

  openModal({
    title: "📦 Penyerahan & Serah Terima Aset Ke Karyawan",
    size: "md",
    bodyHtml: `
      <form id="form-quick-assign" class="space-y-4 text-left text-xs">
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
          <b>💡 Serah Terima Aset & Inventaris Resmi:</b><br/>
          Gunakan formulir ini untuk menyerahkan laptop, kendaraan, kunci kantor, dokumen penting, atau peralatan kerja. Aset akan langsung tercatat sebagai <b>Tanggung Jawab Karyawan</b> dan muncul di Dashboard pribadinya.
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">Pilih Aset / Inventaris</label>
          <select id="qa-asset" required class="w-full p-2.5 text-xs rounded-xl border border-slate-300 font-medium outline-none focus:border-maroon-500 bg-white">
            <option value="">-- Pilih Barang / Aset Tersedia --</option>
            ${unassignedItems.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.id_item || i.id)} - ${escapeHtml(i.nama_barang)} (${escapeHtml(i.kategori || "Aset")})</option>`).join("")}
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
        <button id="btn-qa-save" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow">Simpan & Terbitkan Penyerahan</button>
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
          await fsAdd(COL.LOG_INVENTORY_PENGAMBILAN, {
            id_barang: targetAsset.id_item || targetAsset.id,
            nama_barang: targetAsset.nama_barang,
            kategori: targetAsset.kategori || "Aset",
            nama_karyawan: empName,
            tanggal: dateStr,
            jumlah_ambil: 1,
            jenis_aksi: "PENYERAHAN",
            status_pengembalian: "SEDANG_DIPAKAI",
            keperluan: notes || `Penyerahan Tanggung Jawab Aset (${targetAsset.kategori || 'Barang'})`
          });

          // 3. Notify Employee
          await notifyUser(
            empName,
            "📦 Penyerahan Aset Tanggung Jawab",
            `Anda telah diserahkan aset/inventaris: ${targetAsset.nama_barang} (${targetAsset.id_item || ''}). Buka dashboard untuk melihat detailnya.`,
            "#inventory"
          );

          toast(`Berhasil menyerahkan aset ${targetAsset.nama_barang} kepada ${empName}!`, "success");
          closeModal();
          updateKpiSummary(container);
          
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

  const itemOptionsHtml = items
    .map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.id_item || i.id)} - ${escapeHtml(i.nama_barang)} (${escapeHtml(i.kategori || 'ATK')})</option>`)
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

        <div class="flex items-center gap-3">
          <label class="font-bold text-slate-700">Tanggal Penyerahan Batch:</label>
          <input type="date" id="multi-date" value="${new Date().toISOString().substring(0,10)}" class="p-2 border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:border-maroon-500">
        </div>

        <div class="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                <th class="p-2.5 w-8 text-center">#</th>
                <th class="p-2.5 min-w-[220px]">Pilih Barang / ATK</th>
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

      function addRow() {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/70 transition multi-row-item";
        tr.innerHTML = `
          <td class="p-2.5 text-center font-bold text-slate-400 row-num">1</td>
          <td class="p-2">
            <select class="m-item w-full p-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-maroon-500 bg-white" required>
              <option value="">-- Pilih Barang / ATK --</option>
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
              ✖
            </button>
          </td>
        `;

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
        btnSave.innerHTML = `⏳ Menyimpan ${payloadRows.length} Baris...`;

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

            // 3. Notify Recipient (App + Push + Email)
            await notifyUser(
              empName,
              "📦 Penyerahan / Pengambilan ATK",
              `Anda tercatat menerima/mengambil ${qtyVal} unit ${item ? item.nama_barang : 'ATK'} pada tanggal ${fmtDateShort(dateVal)}.`,
              "#inventory"
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
          btnSave.innerHTML = `💾 Simpan Semua Transaksi ATK`;
        }
      };
    }
  });
}

// FUNGSI CETAK BLANKO STOCK OPNAME
async function printBlankoOpname() {
  const { downloadHtmlAsPdf, toast } = await import("../utils.js");
  toast("Sedang memproses PDF...", "info");
  const items = await fsGetAll(COL.MASTER_INVENTORY);
  items.sort((a,b) => (a.nama_barang || "").localeCompare(b.nama_barang || ""));
  
  let tableRows = items.map(i => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px;">${escapeHtml(i.id_item || i.id)}</td>
      <td style="border: 1px solid #000; padding: 6px;">${escapeHtml(i.nama_barang)}</td>
      <td style="border: 1px solid #000; padding: 6px;">${escapeHtml(i.kategori)}</td>
      <td style="border: 1px solid #000; padding: 6px;">${escapeHtml(i.assigned_to || "Unassigned")}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align:center;">${i.stok_saat_ini ?? 1}</td>
      <td style="border: 1px solid #000; padding: 6px;"></td>
      <td style="border: 1px solid #000; padding: 6px;"></td>
    </tr>`).join("");

  const html = `
    <div style="width:100%; max-width:760px; margin:0 auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff;">
      <div style="page-break-inside:avoid; margin-bottom:15px;">
        ${isoDocHeaderTable({ judul: "BLANKO PEMERIKSAAN FISIK ASET & INVENTARIS (STOCK OPNAME)", noDok: "GA-OPNAME", terbitRevisi: "1/1", hal: "1 dari 1" })}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #000;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="border: 1px solid #000; padding: 6px; text-align: left;">ID Aset</th>
            <th style="border: 1px solid #000; padding: 6px; text-align: left;">Nama Barang / Aset</th>
            <th style="border: 1px solid #000; padding: 6px; text-align: left;">Kategori</th>
            <th style="border: 1px solid #000; padding: 6px; text-align: left;">Penanggung Jawab</th>
            <th style="border: 1px solid #000; padding: 6px; width: 10%; text-align: center;">Qty Sistem</th>
            <th style="border: 1px solid #000; padding: 6px; width: 15%; text-align: center;">Cek Fisik</th>
            <th style="border: 1px solid #000; padding: 6px; width: 20%; text-align: left;">Catatan Kondisi</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <table style="width:100%; text-align:center; margin-top:35px; page-break-inside:avoid; font-size:11px;">
        <tr><td width="50%">Petugas Pemeriksa,</td><td width="50%">Mengetahui HRD / GA,</td></tr>
        <tr><td height="60"></td><td></td></tr>
        <tr><td>( ................................... )</td><td>( ................................... )</td></tr>
      </table>
    </div>`;
  await downloadHtmlAsPdf(html, `Blanko_Stock_Opname_Aset.pdf`);
  toast("PDF berhasil diunduh!", "success");
}

async function printTandaTerimaBarang(row) {
  const { downloadHtmlAsPdf, toast } = await import("../utils.js");
  toast("Sedang memproses PDF...", "info");
  const html = `
    <div style="width:100%; max-width:760px; margin:0 auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff;">
      <div style="page-break-inside:avoid; margin-bottom:15px;">
        ${isoDocHeaderTable({ judul: "SURAT TANDA TERIMA / PENYERAHAN ASET KANTOR", noDok: "GA-AST-01", terbitRevisi: "1/1", hal: "1 dari 1" })}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #000;">
        <tr><td width="35%" style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc;">Tanggal Penyerahan</td><td style="border: 1px solid #000; padding: 6px 10px;">${fmtDateShort(row.tanggal)}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc;">Nama Aset / Inventaris</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(row.nama_barang || "-")} (${escapeHtml(row.id_barang || "-")})</td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc;">Jumlah Unit</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(String(row.jumlah_ambil ?? 1))}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc;">Penanggung Jawab / Penerima</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(row.nama_karyawan || "-")}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight:bold; background:#f8fafc;">Catatan / Keperluan</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(row.keperluan || "-")}</td></tr>
      </table>
      <div style="margin-top: 12px; font-size: 10px; font-style: italic; line-height: 1.4; page-break-inside: avoid;">
        * Penerima bertanggung jawab penuh atas keutuhan dan perawatan aset perusahaan yang diserahterimakan. Dalam hal pemutusan hubungan kerja (resign/offboarding), aset ini wajib dikembalikan secara utuh.
      </div>
      <table style="width:100%; text-align:center; margin-top:35px; page-break-inside:avoid; font-size:11px;">
        <tr><td width="50%">Yang Menyerahkan (GA/HRD),</td><td width="50%">Yang Menerima,</td></tr>
        <tr><td height="60"></td><td></td></tr>
        <tr><td>( ................................... )</td><td>( <strong>${escapeHtml(row.nama_karyawan || "")}</strong> )</td></tr>
      </table>
    </div>`;
  await downloadHtmlAsPdf(html, `Tanda_Terima_Aset_${escapeHtml(row.nama_barang || "").replace(/\s+/g, "_")}.pdf`);
  toast("PDF berhasil diunduh!", "success");
}

export async function mount(container) {
  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeEmpNames = karyawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF").map(k => k.nama_karyawan).sort();
  const empOptions = ["Unassigned", ...activeEmpNames];

  const panels = {
    barang: container.querySelector("#inv-panel-barang"),
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
      orderByField: "nama_barang", 
      printFn: openQrCodeModal,
      printLabel: "📷 Label QR",
      searchFields: ["nama_barang", "id_item", "kategori", "assigned_to", "serial_number"],
      columns: [
        { key: "id_item", label: "ID ASET" },
        { key: "nama_barang", label: "Nama Barang / Aset" },
        { key: "kategori", label: "Kategori", type: "badge" },
        { key: "assigned_to", label: "Tanggung Jawab (Assigned To)" },
        { key: "kondisi", label: "Kondisi", type: "badge" },
        { key: "stok_saat_ini", label: "Qty / Stok", type: "number" },
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
        { name: "assigned_to", label: "Tanggung Jawab Karyawan", type: "select", options: empOptions, default: "Unassigned" },
        { name: "kondisi", label: "Kondisi Aset", type: "select", options: ["Good (Baik)", "Maintenance (Perlu Servis)", "Damaged (Rusak)"], default: "Good (Baik)" },
        { name: "serial_number", label: "No. Seri / No. Plat / No. Dokumen", type: "text" },
        { name: "lokasi", label: "Lokasi Penyimpanan / Cabang", type: "text" },
        { name: "satuan", label: "Satuan", type: "text", default: "Unit" },
        { name: "stok_saat_ini", label: "Jumlah Stok / Qty", type: "number", default: 1 },
        { name: "catatan", label: "Catatan Kelengkapan", type: "textarea", full: true }
      ], { idFromField: "id_item" }),
      afterSave: async (data) => {
        updateKpiSummary(container);
      }
    });

    updateKpiSummary(container);
  }

  async function loadAmbil() {
    const items = await fsGetAll(COL.MASTER_INVENTORY);
    await renderCrudModule(panels.ambil, {
      title: "Log Penyerahan & Pengembalian Aset",
      collectionName: COL.LOG_INVENTORY_PENGAMBILAN, idPrefix: "AMB", canEdit: false,
      printFn: printTandaTerimaBarang, printLabel: "Cetak Surat Tanda Terima",
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
      formFields: [
        { name: "tanggal", label: "Tanggal", type: "date", required: true },
        { name: "nama_barang_pilihan", label: "Pilih Barang / Aset", type: "select", required: true, options: items.map(i => `${i.id_item || i.id} - ${i.nama_barang}`) },
        { name: "nama_karyawan", label: "Penanggung Jawab Karyawan", type: "select", options: activeEmpNames, required: true },
        { name: "jenis_aksi", label: "Jenis Aksi", type: "select", options: ["PENYERAHAN", "PENGEMBALIAN"], default: "PENYERAHAN" },
        { name: "jumlah_ambil", label: "Jumlah Unit", type: "number", required: true, default: 1 },
        { name: "keperluan", label: "Catatan Keperluan / Kondisi", type: "textarea", full: true },
      ],
      beforeSave: async (data) => {
        const selectedStr = data.nama_barang_pilihan || "";
        const item = items.find(i => `${i.id_item || i.id} - ${i.nama_barang}` === selectedStr || i.nama_barang === selectedStr);
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
      afterSave: async () => {
        updateKpiSummary(container);
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
        if (tab === "ambil") await loadAmbil();
        if (tab === "opname") await loadOpname();
      }
    });
  });

  return { unmount() {} };
}

