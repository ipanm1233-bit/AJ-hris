import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, toast, genId, fmtRupiah, fmtDateShort } from "../utils.js";
import { emptyState, badge } from "../components.js";

export async function mount(container) {
  container.innerHTML = `
    <div class="max-w-6xl mx-auto space-y-6 pb-10">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Siklus & Offboarding Karyawan</h1>
        <p class="text-sm text-slate-500 mt-1">Kalkulator otomatis hak karyawan (Pesangon/Uang Pisah) berdasarkan PP Perusahaan.</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- FORM OFFBOARDING -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
           <h3 class="font-bold text-slate-800 mb-4">Simulasi & Proses Offboarding</h3>
           <form id="form-off" class="space-y-4">
              <div><label class="block text-xs font-medium text-slate-500 mb-1">Nama Karyawan</label><input type="text" id="off-nama" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400"></div>
              <div class="grid grid-cols-2 gap-4">
                 <div><label class="block text-xs font-medium text-slate-500 mb-1">Tanggal Join</label><input type="date" id="off-join" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400"></div>
                 <div><label class="block text-xs font-medium text-slate-500 mb-1">Tanggal Efektif Keluar</label><input type="date" id="off-out" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400"></div>
              </div>
              <div><label class="block text-xs font-medium text-slate-500 mb-1">Gaji Pokok + Tunjangan Tetap (Rp)</label><input type="number" id="off-gaji" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400"></div>
              <div>
                 <label class="block text-xs font-medium text-slate-500 mb-1">Alasan Terminasi (Merujuk PP Andela Jaya)</label>
                 <select id="off-alasan" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white">
                    <option value="Resign">Mengundurkan Diri (Resign)</option>
                    <option value="PHK Efisiensi">PHK - Efisiensi / Perusahaan Tutup</option>
                    <option value="Mangkir">Mangkir > 5 Hari (Dianggap Mengundurkan Diri)</option>
                    <option value="Pelanggaran Berat">PHK - Pelanggaran Peraturan Berat</option>
                    <option value="Pensiun">Mencapai Usia Pensiun</option>
                 </select>
              </div>
              <button type="button" id="btn-kalkulasi" class="w-full bg-slate-800 text-white font-medium py-2.5 rounded-lg hover:bg-slate-900 transition">Hitung Hak & Kewajiban</button>
           </form>
        </div>

        <!-- HASIL KALKULASI & CHECKLIST -->
        <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
           <h3 class="font-bold text-slate-800 mb-4">Hasil Analisa & Checklist Dokumen</h3>
           <div id="off-result-box" class="space-y-4">
              <p class="text-sm text-slate-400 text-center py-10">Isi formulir di samping lalu klik "Hitung" untuk melihat hasil kalkulasi pesangon dan dokumen.</p>
           </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#btn-kalkulasi").addEventListener("click", () => {
     const form = container.querySelector("#form-off");
     if (!form.reportValidity()) return;

     const nama = container.querySelector("#off-nama").value;
     const join = new Date(container.querySelector("#off-join").value);
     const out = new Date(container.querySelector("#off-out").value);
     const gaji = parseFloat(container.querySelector("#off-gaji").value) || 0;
     const alasan = container.querySelector("#off-alasan").value;

     // Hitung Masa Kerja (Tahun)
     let diffTime = out - join;
     if (diffTime < 0) diffTime = 0;
     const years = diffTime / (1000 * 3600 * 24 * 365.25);
     const mathYears = Math.floor(years);

     let pesangon = 0, upmk = 0, uangPisah = 0;
     let checklist = [];

     // Aturan Uang Pisah (Pasal 61 PP CV Andela Jaya)
     const hitungUangPisah = (y, upah) => {
        if (y >= 9) return 4 * upah;
        if (y >= 6) return 3 * upah;
        if (y >= 3) return 2 * upah;
        return 0;
     };

     // Aturan Pesangon (Pasal 58 PP)
     const hitungPesangon = (y, upah) => {
        let bln = y + 1;
        if (bln > 9) bln = 9;
        return bln * upah;
     };

     // Aturan UPMK (Pasal 59 PP)
     const hitungUPMK = (y, upah) => {
        if (y >= 24) return 10 * upah;
        if (y >= 21) return 8 * upah;
        if (y >= 18) return 7 * upah;
        if (y >= 15) return 6 * upah;
        if (y >= 12) return 5 * upah;
        if (y >= 9) return 4 * upah;
        if (y >= 6) return 3 * upah;
        if (y >= 3) return 2 * upah;
        return 0;
     };

     if (alasan === "Resign" || alasan === "Mangkir") {
        uangPisah = hitungUangPisah(mathYears, gaji);
        checklist = ["Surat Pengunduran Diri (Minimal 30 Hari)", "Form Exit Interview", "Form Clearance / Serah Terima Aset", "Pencabutan Akses Email/Sistem", "Surat Keterangan Penonaktifan BPJS"];
     } else if (alasan === "PHK Efisiensi") {
        pesangon = hitungPesangon(mathYears, gaji); // Asumsi 1x ketentuan (UU Ciptaker)
        upmk = hitungUPMK(mathYears, gaji);
        checklist = ["Surat Pemberitahuan PHK", "Perjanjian Bersama (Bipartit)", "Tanda Terima Pengembalian Aset", "Pencabutan Akses Sistem", "Surat Paklaring"];
     } else if (alasan === "Pelanggaran Berat") {
        uangPisah = hitungUangPisah(mathYears, gaji);
        checklist = ["BAP (Berita Acara Pemeriksaan)", "Surat Keputusan PHK Pelanggaran", "Bukti Pelanggaran SOP", "Tanda Terima Pengembalian Aset"];
     } else if (alasan === "Pensiun") {
        pesangon = hitungPesangon(mathYears, gaji) * 1.75; 
        upmk = hitungUPMK(mathYears, gaji);
        checklist = ["Surat Keputusan Pensiun", "Form Pencairan BPJS JHT & JP", "Piagam Penghargaan", "Serah Terima Pekerjaan"];
     }

     const upH = `<div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Penggantian Hak (Cuti dll)</span><span class="font-bold text-slate-800">Dihitung HRD</span></div>`;

     container.querySelector("#off-result-box").innerHTML = `
        <div class="mb-4">
           <p class="text-[11px] text-slate-500 uppercase tracking-wider">Masa Kerja</p>
           <p class="text-lg font-bold text-slate-800">${mathYears} Tahun <span class="text-sm font-normal text-slate-500">(${(years).toFixed(1)} Thn riil)</span></p>
        </div>
        <div class="space-y-2 mb-6">
           <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Pesangon (Psl 58)</span><span class="font-bold text-maroon-700">${fmtRupiah(pesangon)}</span></div>
           <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Penghargaan (Psl 59)</span><span class="font-bold text-maroon-700">${fmtRupiah(upmk)}</span></div>
           <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Pisah (Psl 61/62)</span><span class="font-bold text-maroon-700">${fmtRupiah(uangPisah)}</span></div>
           ${upH}
        </div>
        <div>
           <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Checklist Dokumen Wajib disiapkan</p>
           <ul class="space-y-1">
              ${checklist.map(c => `<li class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 accent-maroon-700"> ${escapeHtml(c)}</li>`).join("")}
           </ul>
        </div>
        <button class="w-full mt-5 bg-maroon-700 text-white font-medium py-2 rounded-lg hover:bg-maroon-800">Simpan Log Offboarding</button>
     `;
  });

  return { unmount() {} };
}
