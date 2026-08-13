import { db, doc, setDoc, deleteDoc } from "../firebase-config.js";
import { fsGetAll, toast, fmtDateShort, fmtRupiah, genId, escapeHtml, confirmDialog, downloadHtmlAsPdf } from "../utils.js";
import { badge } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

export async function mount(container) {
 container.innerHTML = `
 <div class="space-y-6">
  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200/80">
   <div>
    <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Perintah Lembur Operasional</h1>
    <p class="text-sm text-slate-500 mt-0.5">Input manual, kalkulasi upah lembur otomatis (PP No 35 Th 2021), dan rekapitulasi jam kerja tambahan.</p>
   </div>
  </div>
  <div id="lb-panel-lembur"></div>
 </div>
 `;

 const panelLembur = container.querySelector("#lb-panel-lembur");

 // Load Karyawan Aktif
 const allKaryawan = await fsGetAll("master_karyawan").catch(() => []);
 const activeEmp = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");

 // ==========================================
 // MODUL LEMBUR (KALKULASI OTOMATIS UU KETENAGAKERJAAN)
 // ==========================================
 async function loadLembur() {
  const dataLembur = await fsGetAll("log_lembur").catch(() => []);
  panelLembur.innerHTML = `
  <div class="flex justify-between items-center mb-4">
   <h3 class="font-bold text-slate-700 text-base">Riwayat Perintah Lembur</h3>
   <button id="btn-add-lembur" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
    <span>+ Input Perintah Lembur</span>
   </button>
  </div>
  <div class="bg-white border border-slate-200/80 rounded-2xl overflow-x-auto shadow-xs">
   <table class="w-full text-xs text-left">
    <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
     <tr>
      <th class="p-3">Tanggal</th>
      <th class="p-3">Nama Karyawan</th>
      <th class="p-3">Waktu Jam Kerja</th>
      <th class="p-3">Durasi</th>
      <th class="p-3">Estimasi Upah</th>
      <th class="p-3 text-center">Aksi</th>
     </tr>
    </thead>
    <tbody class="divide-y divide-slate-100">
     ${dataLembur.length ? dataLembur.map(r => `
     <tr class="hover:bg-slate-50 transition">
      <td class="p-3 font-medium">${fmtDateShort(r.tanggal)} ${r.is_libur ? badge("Libur", "red") : ""}</td>
      <td class="p-3 font-semibold text-slate-800">${escapeHtml(r.nama_karyawan)}</td>
      <td class="p-3">${escapeHtml(r.jam_mulai || "-")} - ${escapeHtml(r.jam_selesai || "-")}</td>
      <td class="p-3 font-semibold text-slate-700">${r.durasi_jam || 0} Jam</td>
      <td class="p-3 font-mono text-blue-700 font-bold">${fmtRupiah(r.total_upah)}</td>
      <td class="p-3 text-center space-x-1">
       <button data-print-lembur="${r.id}" class="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition">Cetak SPL</button>
       <button data-del-lembur="${r.id}" class="px-2.5 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition">Hapus</button>
      </td>
     </tr>
     `).join("") : `<tr><td colspan="6" class="p-8 text-center text-slate-400">Belum ada data perintah lembur. Klik "+ Input Perintah Lembur" untuk menambahkan.</td></tr>`}
    </tbody>
   </table>
  </div>
  `;

  panelLembur.querySelectorAll("[data-del-lembur]").forEach(btn => btn.onclick = async () => {
   if (await confirmDialog("Hapus data lembur ini?")) {
    await deleteDoc(doc(db, "log_lembur", btn.dataset.delLembur));
    toast("Data lembur berhasil dihapus", "success");
    loadLembur();
   }
  });

  panelLembur.querySelectorAll("[data-print-lembur]").forEach(btn => btn.onclick = () => {
   const row = dataLembur.find(x => x.id === btn.dataset.printLembur);
   if (row) printLemburPdf(row);
  });

  panelLembur.querySelector("#btn-add-lembur").onclick = () => {
   const modal = document.createElement("div");
   modal.className = "fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4";
   modal.innerHTML = `
   <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
    <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
     <h3 class="font-bold text-slate-800 text-sm">Form Surat Perintah Lembur (SPL)</h3>
     <button id="close-lm" class="text-slate-400 hover:text-red-500 font-bold text-base">&times;</button>
    </div>
    <div class="p-5 space-y-4 text-xs">
     <div class="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-800 leading-relaxed">
      Kalkulasi upah lembur otomatis menggunakan acuan baku PP No 35 Th 2021 (1/173 x Gaji Sebulan).
     </div>
     <div>
      <label class="block font-bold text-slate-700 mb-1">Pilih Karyawan</label>
      <select id="lm-emp" class="w-full border border-slate-200 p-2.5 rounded-xl outline-none focus:border-maroon-400">
       <option value="">Pilih Karyawan...</option>
       ${activeEmp.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)} (${escapeHtml(k.nik_karyawan || "-")})</option>`).join("")}
      </select>
     </div>
     <div class="grid grid-cols-2 gap-3">
      <div>
       <label class="block font-bold text-slate-700 mb-1">Tanggal Lembur</label>
       <input type="date" id="lm-tgl" class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-maroon-400">
      </div>
      <div class="flex items-center pt-5">
       <label class="flex items-center gap-2 font-bold text-rose-600 cursor-pointer">
        <input type="checkbox" id="lm-libur" class="w-4 h-4 rounded text-maroon-700"> Di Hari Libur/Minggu
       </label>
      </div>
     </div>
     <div class="grid grid-cols-2 gap-3">
      <div>
       <label class="block font-bold text-slate-700 mb-1">Jam Mulai</label>
       <input type="time" id="lm-start" class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-maroon-400">
      </div>
      <div>
       <label class="block font-bold text-slate-700 mb-1">Jam Selesai</label>
       <input type="time" id="lm-end" class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-maroon-400">
      </div>
     </div>
     <div>
      <label class="block font-bold text-slate-700 mb-1">Gaji Pokok Karyawan (Dasar Kalkulasi)</label>
      <input type="number" id="lm-gaji" class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-maroon-400" placeholder="Contoh: 4000000">
     </div>
     <div>
      <label class="block font-bold text-slate-700 mb-1">Rincian Pekerjaan / Tugas Lembur</label>
      <input type="text" id="lm-tugas" class="w-full border border-slate-200 p-2 rounded-xl outline-none focus:border-maroon-400" placeholder="Penanganan stok barang gudang...">
     </div>
     <div class="bg-slate-900 p-4 rounded-xl flex justify-between items-center text-white">
      <span class="font-medium">Estimasi Upah Lembur:</span>
      <span id="lm-hasil" class="text-lg font-bold font-mono text-amber-400">Rp 0</span>
     </div>
     <button id="btn-save-lm" class="w-full bg-maroon-700 hover:bg-maroon-800 text-white font-bold py-2.5 rounded-xl transition shadow-xs">Simpan & Cetak SPL</button>
    </div>
   </div>
   `;
   document.body.appendChild(modal);

   const calcLembur = () => {
    const start = modal.querySelector("#lm-start").value;
    const end = modal.querySelector("#lm-end").value;
    const gaji = parseFloat(modal.querySelector("#lm-gaji").value) || 0;
    const isLibur = modal.querySelector("#lm-libur").checked;
    const hasilEl = modal.querySelector("#lm-hasil");

    if (start && end && gaji) {
     let d1 = new Date(`2000-01-01T${start}`);
     let d2 = new Date(`2000-01-01T${end}`);
     if (d2 < d1) d2.setDate(d2.getDate() + 1);
     let hours = (d2 - d1) / 3600000;
     if (hours < 0) hours = 0;

     let upahSejam = gaji / 173;
     let total = 0;

     if (isLibur) {
      if (hours <= 7) total = hours * 2 * upahSejam;
      else if (hours === 8) total = (7 * 2 * upahSejam) + (1 * 3 * upahSejam);
      else total = (7 * 2 * upahSejam) + (1 * 3 * upahSejam) + ((hours - 8) * 4 * upahSejam);
     } else {
      if (hours > 0) {
       total += 1.5 * upahSejam;
       if (hours > 1) total += (hours - 1) * 2 * upahSejam;
      }
     }
     hasilEl.textContent = fmtRupiah(Math.round(total));
     hasilEl.dataset.val = Math.round(total);
     hasilEl.dataset.hours = hours;
    } else { hasilEl.textContent = "Rp 0"; }
   };

   modal.querySelectorAll("input").forEach(inp => inp.addEventListener("input", calcLembur));
   modal.querySelector("#close-lm").onclick = () => modal.remove();

   modal.querySelector("#btn-save-lm").onclick = async () => {
    const emp = modal.querySelector("#lm-emp").value;
    const tgl = modal.querySelector("#lm-tgl").value;
    if (!emp || !tgl) return toast("Lengkapi nama dan tanggal!", "warning");

    const payload = {
     nama_karyawan: emp,
     tanggal: tgl,
     jam_mulai: modal.querySelector("#lm-start").value,
     jam_selesai: modal.querySelector("#lm-end").value,
     is_libur: modal.querySelector("#lm-libur").checked,
     gaji_dasar: parseFloat(modal.querySelector("#lm-gaji").value) || 0,
     pekerjaan: modal.querySelector("#lm-tugas").value,
     durasi_jam: parseFloat(modal.querySelector("#lm-hasil").dataset.hours) || 0,
     total_upah: parseFloat(modal.querySelector("#lm-hasil").dataset.val) || 0,
     createdAt: new Date().toISOString()
    };

    const id = genId("LMBR");
    await setDoc(doc(db, "log_lembur", id), payload);
    toast("Perintah lembur berhasil disimpan!", "success");
    modal.remove();
    loadLembur();
    printLemburPdf({ ...payload, id });
   };
  };
 }

 async function printLemburPdf(data) {
  const html = `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
  <div style="page-break-inside:avoid; margin-bottom:15px;">
  ${isoDocHeaderTable({ judul: "SURAT PERINTAH LEMBUR (SPL)", noDok: "HRD-SPL", terbitRevisi: "1/0", tglTerbit: "1 September 2025", hal: "1 dari 1" })}
  </div>
  <table style="width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #000; font-size:11px;">
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc; width: 35%;">Nama Karyawan</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.nama_karyawan)}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Tanggal Lembur</td><td style="border: 1px solid #000; padding: 6px 10px;">${fmtDateShort(data.tanggal)} ${data.is_libur ? "(Hari Libur/Minggu)" : "(Hari Kerja)"}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Waktu Pelaksanaan</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.jam_mulai)} s/d ${escapeHtml(data.jam_selesai)} (${data.durasi_jam} Jam)</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Rincian Tugas</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.pekerjaan || "-")}</td></tr>
  <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Kalkulasi Upah Lembur</td><td style="border: 1px solid #000; padding: 6px 10px;"><strong style="font-size:13px;">${fmtRupiah(data.total_upah)}</strong></td></tr>
  </table>
  <table style="width:100%; text-align:center; margin-top:35px; page-break-inside:avoid; font-size:11px;">
  <tr><td width="33%">Disetujui Atasan,</td><td width="33%">Diperiksa HRD,</td><td width="33%">Pelaksana Lembur,</td></tr>
  <tr><td height="60"></td><td></td><td></td></tr>
  <tr><td>( ................................. )</td><td>( ................................. )</td><td>( <strong>${escapeHtml(data.nama_karyawan)}</strong> )</td></tr>
  </table>
  </div>`;
  await downloadHtmlAsPdf(html, `SPL_${escapeHtml(data.nama_karyawan).replace(/\s+/g, "_")}.pdf`);
  toast("PDF SPL berhasil diunduh!", "success");
 }

 await loadLembur();
 return { unmount() {} };
}
