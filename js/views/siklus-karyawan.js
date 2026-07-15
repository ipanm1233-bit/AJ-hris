import { COL, db, updateDoc, doc } from "../firebase-config.js";
import { fsGetAll, fsAdd, toast, genId, fmtRupiah, fmtDateShort, smartParseDate } from "../utils.js";
import { renderCrudModule } from "../components.js";

// Fungsi pelindung teks bawaan (Bulletproof)
function escapeHtml(unsafe) {
    return (unsafe || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export async function mount(container) {
  container.innerHTML = `
    <div class="max-w-6xl mx-auto space-y-6 pb-10">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Siklus & Pergerakan Karyawan</h1>
        <p class="text-sm text-slate-500 mt-1">Manajemen Onboarding, Mutasi, Promosi, Demosi, dan Kalkulator Offboarding.</p>
      </div>
      
      <div class="flex items-center gap-2 border-b border-slate-100 overflow-x-auto mb-4">
        <button data-stab="input" class="sk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">Formulir Pergerakan</button>
        <button data-stab="riwayat" class="sk-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap">Riwayat Siklus</button>
      </div>

      <div id="sk-panel-input">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
             <h3 class="font-bold text-slate-800 mb-4">Input Data Pergerakan</h3>
             <form id="form-siklus" class="space-y-4">
                <div>
                   <label class="block text-xs font-medium text-slate-500 mb-1">Jenis Pergerakan / Siklus</label>
                   <select id="siklus-jenis" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white">
                      <option value="">Pilih Jenis...</option>
                      <option value="Onboarding">Onboarding (Karyawan Baru)</option>
                      <option value="Mutasi">Mutasi (Pindah Cabang/Divisi)</option>
                      <option value="Promosi">Promosi (Naik Jabatan)</option>
                      <option value="Demosi">Demosi (Turun Jabatan)</option>
                      <option value="Offboarding">Offboarding (Resign/PHK)</option>
                   </select>
                </div>
                <div id="wrap-nama">
                   <label class="block text-xs font-medium text-slate-500 mb-1">Pilih Karyawan Aktif</label>
                   <select id="siklus-nama" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                      <option value="">Sedang Memuat Data Karyawan...</option>
                   </select>
                </div>
                
                <div id="siklus-dynamic-fields" class="space-y-4 border-t border-slate-100 pt-4 mt-4 hidden"></div>
                
                <button type="button" id="btn-kalkulasi" class="w-full bg-slate-800 text-white font-medium py-2.5 rounded-lg hover:bg-slate-900 transition hidden shadow-sm">Buat Rincian & Analisa Dokumen</button>
             </form>
          </div>

          <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200">
             <h3 class="font-bold text-slate-800 mb-4">Hasil Analisa & Rencana Aksi</h3>
             <div id="siklus-result-box" class="space-y-4">
                <div class="text-center py-10 flex flex-col items-center justify-center text-slate-400">
                   <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                   <p class="text-sm">Pilih jenis siklus dan isi formulir di samping untuk melihat prosedur & dokumen yang harus disiapkan.</p>
                </div>
             </div>
          </div>
        </div>
      </div>
      
      <div id="sk-panel-riwayat" class="hidden"></div>
    </div>
  `;

  const allKaryawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeKaryawan = allKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
  activeKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||""));
  
  const selectNama = container.querySelector("#siklus-nama");
  selectNama.innerHTML = `<option value="">Pilih Karyawan Aktif...</option>` + 
    activeKaryawan.map(k => `<option value="${k.id}">${escapeHtml(k.nama_karyawan)} - ${escapeHtml(k.jabatan || "")} (${escapeHtml(k.cabang || "-")})</option>`).join("");

  const selJenis = container.querySelector("#siklus-jenis");
  const dynFields = container.querySelector("#siklus-dynamic-fields");
  const btnKalkulasi = container.querySelector("#btn-kalkulasi");
  const resBox = container.querySelector("#siklus-result-box");

  let currentSelectedKaryawan = null;

  selectNama.addEventListener("change", () => {
     currentSelectedKaryawan = activeKaryawan.find(k => k.id === selectNama.value);
     renderFields(); 
  });

  selJenis.addEventListener("change", renderFields);

  function formatDateInput(d) {
      if(!d) return "";
      const date = smartParseDate(d);
      if (!date) return "";
      return date.toISOString().split("T")[0];
  }

  function renderFields() {
     const jenis = selJenis.value;
     if (!jenis) {
         dynFields.classList.add("hidden");
         btnKalkulasi.classList.add("hidden");
         return;
     }

     dynFields.classList.remove("hidden");
     btnKalkulasi.classList.remove("hidden");
     resBox.innerHTML = `<p class="text-sm text-slate-400 text-center py-10 border-2 border-dashed border-slate-200 rounded-xl mt-4">Isi form di samping lalu klik tombol Buat Rincian.</p>`;

     const joinDate = currentSelectedKaryawan ? formatDateInput(currentSelectedKaryawan.tanggal_join) : "";
     const jabLama = currentSelectedKaryawan ? escapeHtml(currentSelectedKaryawan.jabatan || "-") : "";
     const cabLama = currentSelectedKaryawan ? escapeHtml(currentSelectedKaryawan.cabang || "-") : "";

     if (jenis === "Offboarding") {
         dynFields.innerHTML = `
             <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Join (Auto)</label><input type="date" id="off-join" value="${joinDate}" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none bg-slate-50 text-slate-600"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Efektif Keluar</label><input type="date" id="off-out" required class="w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-maroon-400 border-slate-300"></div>
             </div>
             <div><label class="block text-xs font-bold text-slate-600 mb-1">Gaji Pokok + Tunjangan Tetap (Rp)</label><input type="number" id="off-gaji" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Cth: 5000000"></div>
             <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Alasan Terminasi (Sesuai PP Andela Jaya)</label>
                <select id="off-alasan" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400 bg-white font-medium text-slate-700">
                   <option value="Resign">Mengundurkan Diri (Resign) - Pasal 46 & 61</option>
                   <option value="PHK Efisiensi">PHK - Efisiensi / Perusahaan Tutup - Pasal 55 & 56</option>
                   <option value="Mangkir">Mangkir > 5 Hari Kerja - Pasal 52</option>
                   <option value="Pelanggaran Berat">PHK - Pelanggaran Peraturan Berat - Pasal 53</option>
                   <option value="Pensiun">Mencapai Usia Pensiun - Pasal 47</option>
                </select>
             </div>
         `;
     } else if (["Mutasi", "Promosi", "Demosi"].includes(jenis)) {
         dynFields.innerHTML = `
             <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-xs font-bold text-slate-500 mb-1">Jabatan Saat Ini</label><input type="text" id="lama-jabatan" value="${jabLama}" readonly class="w-full px-3 py-2 text-sm border rounded-lg bg-slate-100 outline-none text-slate-500 border-transparent"></div>
                <div><label class="block text-xs font-bold text-slate-500 mb-1">Cabang Saat Ini</label><input type="text" id="lama-cabang" value="${cabLama}" readonly class="w-full px-3 py-2 text-sm border rounded-lg bg-slate-100 outline-none text-slate-500 border-transparent"></div>
             </div>
             <div class="flex items-center gap-3">
                <div class="h-px bg-slate-200 flex-1"></div><span class="text-[10px] font-bold text-maroon-700 uppercase">Posisi Baru</span><div class="h-px bg-slate-200 flex-1"></div>
             </div>
             <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-xs font-bold text-maroon-700 mb-1">Jabatan Baru</label><input type="text" id="baru-jabatan" required class="w-full px-3 py-2 text-sm border border-maroon-200 rounded-lg outline-none focus:border-maroon-500 focus:ring-2 focus:ring-maroon-50"></div>
                <div><label class="block text-xs font-bold text-maroon-700 mb-1">Cabang Baru</label><input type="text" id="baru-cabang" required class="w-full px-3 py-2 text-sm border border-maroon-200 rounded-lg outline-none focus:border-maroon-500 focus:ring-2 focus:ring-maroon-50"></div>
             </div>
             <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Efektif</label><input type="date" id="mutasi-tgl" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">No. SK Direksi</label><input type="text" id="mutasi-sk" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Opsi"></div>
             </div>
             <div><label class="block text-xs font-medium text-slate-500 mb-1">Catatan</label><textarea id="mutasi-catatan" rows="2" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400"></textarea></div>
         `;
     } else if (jenis === "Onboarding") {
          dynFields.innerHTML = `
             <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Bergabung (Auto)</label><input type="date" id="onb-tgl" value="${joinDate}" required class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400"></div>
                <div>
                   <label class="block text-xs font-bold text-slate-600 mb-1">Tipe Kontrak</label>
                   <select id="onb-status" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400 bg-white">
                      <option value="PKWTT">PKWTT (Tetap)</option>
                      <option value="PKWT">PKWT (Kontrak)</option>
                      <option value="PROBATION">Probation / Masa Percobaan</option>
                   </select>
                </div>
             </div>
             <div><label class="block text-xs font-medium text-slate-500 mb-1">Catatan Fasilitas Karyawan</label><textarea id="onb-catatan" rows="2" class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-maroon-400" placeholder="Cth: Diberikan ID Card, Seragam, dsb..."></textarea></div>
         `;
     }
  }

  btnKalkulasi.addEventListener("click", () => {
      const form = container.querySelector("#form-siklus");
      if (!form.reportValidity()) return;
      if (!currentSelectedKaryawan) return toast("Pilih Karyawan terlebih dahulu", "warning");

      const jenis = selJenis.value;
      let previewHtml = "";
      
      let payloadLog = {
         id_karyawan: currentSelectedKaryawan.id,
         nama_karyawan: currentSelectedKaryawan.nama_karyawan,
         jenis_siklus: jenis,
         tanggal_proses: new Date().toISOString()
      };

      if (jenis === "Offboarding") {
         const join = new Date(container.querySelector("#off-join").value);
         const out = new Date(container.querySelector("#off-out").value);
         const gaji = parseFloat(container.querySelector("#off-gaji").value) || 0;
         const alasan = container.querySelector("#off-alasan").value;

         let diffTime = out - join;
         if (diffTime < 0) diffTime = 0;
         const years = diffTime / (1000 * 3600 * 24 * 365.25);
         const mathYears = Math.floor(years); 

         const hitungUangPisah = (y, upah) => {
            if (y >= 9) return 4 * upah;
            if (y >= 6) return 3 * upah;
            if (y >= 3) return 2 * upah;
            return 0;
         };

         const hitungPesangon = (y, upah) => {
            let bln = y + 1;
            if (bln > 9) bln = 9;
            return bln * upah;
         };

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

         let pesangon = 0, upmk = 0, uangPisah = 0;
         let checklist = [];

         if (alasan === "Resign" || alasan === "Mangkir") {
            uangPisah = hitungUangPisah(mathYears, gaji);
            checklist = ["Surat Pengunduran Diri (Jika Resign)", "Surat Panggilan Mangkir 1 & 2 (Jika Mangkir)", "Form Exit Interview", "Form Serah Terima Aset & Kerahasiaan", "Surat Keterangan Penonaktifan BPJS"];
         } else if (alasan === "PHK Efisiensi") {
            pesangon = hitungPesangon(mathYears, gaji); 
            upmk = hitungUPMK(mathYears, gaji);
            checklist = ["Surat Pemberitahuan PHK", "Perjanjian Bersama (Bipartit)", "Form Pengembalian Aset", "Pencabutan Akses Sistem", "Penerbitan Paklaring"];
         } else if (alasan === "Pelanggaran Berat") {
            uangPisah = hitungUangPisah(mathYears, gaji);
            checklist = ["BAP (Berita Acara Pemeriksaan)", "SK Pemutusan Hubungan Kerja (PHK) Cacat Hukum", "Bukti Kronologi Pelanggaran (Saksi)", "Tanda Terima Pengembalian Aset"];
         } else if (alasan === "Pensiun") {
            pesangon = hitungPesangon(mathYears, gaji) * 1.75; 
            upmk = hitungUPMK(mathYears, gaji);
            checklist = ["Surat Keputusan Pensiun Karyawan", "Formulir Pencairan BPJS JHT & JP", "Penyerahan Piagam Penghargaan / Tali Asih", "Serah Terima Pekerjaan kepada Tim"];
         }

         payloadLog.tanggal_efektif = out.toISOString();
         payloadLog.keterangan = `Alasan: ${alasan}`;
         payloadLog.detail_offboarding = { masa_kerja_tahun: mathYears, pesangon, upmk, uang_pisah: uangPisah };
         payloadLog.update_master = { aktif_tdk_aktif: "TIDAK AKTIF" }; 

         previewHtml = `
            <div class="mb-4">
               <p class="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Lama Masa Kerja</p>
               <p class="text-xl font-black text-slate-800">${mathYears} Tahun <span class="text-sm font-medium text-slate-500">(${(years).toFixed(1)} Thn riil)</span></p>
            </div>
            <div class="space-y-2 mb-6">
               <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Pesangon (Psl 58)</span><span class="font-bold text-maroon-700">${fmtRupiah(pesangon)}</span></div>
               <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Penghargaan Masa Kerja</span><span class="font-bold text-maroon-700">${fmtRupiah(upmk)}</span></div>
               <div class="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center"><span class="text-xs font-semibold text-slate-500">Uang Pisah (Psl 61/62)</span><span class="font-bold text-maroon-700">${fmtRupiah(uangPisah)}</span></div>
               <div class="p-3 bg-amber-50 rounded-lg border border-amber-200 flex justify-between items-center"><span class="text-xs font-bold text-amber-700">Sisa Cuti / Penggantian Hak</span><span class="font-bold text-amber-700 text-xs text-right">Dihitung manual<br/>oleh HR/Finance</span></div>
            </div>
            <div>
               <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Checklist Dokumen Wajib</p>
               <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
                  ${checklist.map(c => `
                    <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" class="mt-1 w-4 h-4 rounded border-slate-300 text-maroon-700 focus:ring-maroon-400"> <span>${escapeHtml(c)}</span>
                    </label>
                  `).join("")}
               </div>
            </div>
         `;
      } 
      else if (["Mutasi", "Promosi", "Demosi"].includes(jenis)) {
         const tglEfektif = container.querySelector("#mutasi-tgl").value;
         const jLama = container.querySelector("#lama-jabatan").value;
         const cLama = container.querySelector("#lama-cabang").value;
         const jBaru = container.querySelector("#baru-jabatan").value.trim();
         const cBaru = container.querySelector("#baru-cabang").value.trim();
         const sk = container.querySelector("#mutasi-sk").value.trim();
         const cat = container.querySelector("#mutasi-catatan").value.trim();

         payloadLog.tanggal_efektif = new Date(tglEfektif).toISOString();
         payloadLog.keterangan = cat || `${jenis} Jabatan`;
         payloadLog.detail_mutasi = { jabatan_lama: jLama, cabang_lama: cLama, jabatan_baru: jBaru, cabang_baru: cBaru, no_sk: sk };
         payloadLog.update_master = { jabatan: jBaru, cabang: cBaru }; 

         previewHtml = `
            <div class="bg-white p-4 rounded-xl border border-slate-200 mb-5 text-center">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Peta Perubahan Jabatan</p>
                <div class="flex items-center justify-center gap-4">
                    <div class="flex-1 text-right">
                        <p class="text-base font-bold text-slate-800">${escapeHtml(jLama)}</p>
                        <p class="text-xs text-slate-500 font-medium">${escapeHtml(cLama)}</p>
                    </div>
                    <div class="w-10 h-10 shrink-0 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center border-4 border-white shadow-sm">➔</div>
                    <div class="flex-1 text-left">
                        <p class="text-base font-black text-maroon-700">${escapeHtml(jBaru)}</p>
                        <p class="text-xs text-maroon-600 font-medium">${escapeHtml(cBaru)}</p>
                    </div>
                </div>
            </div>
            <div>
               <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Checklist Dokumen Mutasi</p>
               <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
                  <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> SK Direksi / Surat Penugasan (Bipartit)</label>
                  <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Berita Acara Serah Terima Jabatan</label>
                  <label class="flex items-start gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Penyesuaian Akses Sistem / Portal / Grup WhatsApp</label>
               </div>
            </div>
         `;
      }
      else if (jenis === "Onboarding") {
         const tgl = container.querySelector("#onb-tgl").value;
         const cat = container.querySelector("#onb-catatan").value.trim();
         const stat = container.querySelector("#onb-status").value;

         payloadLog.tanggal_efektif = new Date(tgl).toISOString();
         payloadLog.keterangan = cat || `Onboarding Karyawan`;
         payloadLog.update_master = { status_karyawan: stat };
         
         previewHtml = `
            <div class="mb-4">
               <p class="text-[11px] text-slate-500 uppercase tracking-wider font-bold">Status Hubungan Kerja</p>
               <p class="text-lg font-bold text-slate-800">${escapeHtml(stat)}</p>
            </div>
            <div>
               <p class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Checklist Kelengkapan Onboarding</p>
               <div class="bg-white border border-slate-200 p-3 rounded-xl space-y-2">
                  <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Penandatanganan Kontrak / PKWTT Baru</label>
                  <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Pembuatan ID Card & Seragam Kerja</label>
                  <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Pendaftaran BPJS Ketenagakerjaan & Kesehatan</label>
                  <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Pembuatan Akun Portal HRIS & Email Operasional</label>
                  <label class="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" class="mt-1 w-4 h-4 text-maroon-700"> Tur Pengenalan Divisi & Pembacaan Peraturan Perusahaan</label>
               </div>
            </div>
         `;
      }

      resBox.innerHTML = `
         ${previewHtml}
         <div class="mt-6 pt-4 border-t border-slate-200">
            <button type="button" id="btn-final-simpan" class="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition shadow-md flex items-center justify-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
               Selesaikan Proses & Perbarui Master Karyawan
            </button>
            <p class="text-[10px] text-center text-slate-400 mt-2">Menekan tombol di atas akan merekam log riwayat ini dan <b class="text-slate-500">secara ajaib otomatis mengubah status/jabatan karyawan tersebut di Database Induk (Master Karyawan)</b>.</p>
         </div>
      `;

      resBox.querySelector("#btn-final-simpan").addEventListener("click", async () => {
         const btnSimpan = resBox.querySelector("#btn-final-simpan");
         btnSimpan.disabled = true;
         btnSimpan.textContent = "Menyimpan ke Database...";

         try {
            await fsAdd(COL.SIKLUS_KARYAWAN, payloadLog, genId("SKL"));

            if (payloadLog.update_master) {
                await updateDoc(doc(db, COL.MASTER_KARYAWAN, payloadLog.id_karyawan), payloadLog.update_master);
                Object.assign(currentSelectedKaryawan, payloadLog.update_master);
            }

            toast("Siklus berhasil direkam & Data Induk sukses diperbarui!", "success");
            
            form.reset();
            selectNama.value = "";
            currentSelectedKaryawan = null;
            dynFields.classList.add("hidden");
            btnKalkulasi.classList.add("hidden");
            resBox.innerHTML = `<p class="text-sm text-slate-400 text-center py-10">Pilih jenis siklus dan isi formulir di samping untuk melihat prosedur & dokumen yang harus disiapkan.</p>`;
            
            if (loaded.riwayat) await loadRiwayat();
         } catch (e) {
            toast("Gagal memproses data: " + e.message, "error");
            btnSimpan.disabled = false;
            btnSimpan.innerHTML = `Selesaikan Proses & Perbarui Master Karyawan`;
         }
      });
  });

  const panelInput = container.querySelector("#sk-panel-input");
  const panelRiwayat = container.querySelector("#sk-panel-riwayat");
  const loaded = {};

  async function loadRiwayat() {
     await renderCrudModule(panelRiwayat, {
         title: "Riwayat Pergerakan & Terminasi",
         subtitle: "Log historis seluruh mutasi, promosi, demosi, dan offboarding karyawan.",
         collectionName: COL.SIKLUS_KARYAWAN,
         idPrefix: "SKL",
         canCreate: false, 
         searchFields: ["nama_karyawan", "jenis_siklus", "keterangan"],
         orderByField: "tanggal_proses",
         columns: [
             { key: "tanggal_efektif", label: "Tgl Efektif", type: "date" },
             { key: "nama_karyawan", label: "Karyawan" },
             { key: "jenis_siklus", label: "Jenis Siklus", type: "badge", badgeTone: (v) => v === "Offboarding" ? "red" : v === "Onboarding" ? "green" : v === "Demosi" ? "amber" : "blue" },
             { key: "keterangan", label: "Alasan / Catatan" }
         ],
         formFields: [
             { name: "tanggal_efektif", label: "Tanggal Efektif", type: "date" },
             { name: "nama_karyawan", label: "Nama Karyawan", type: "text" },
             { name: "jenis_siklus", label: "Jenis Siklus", type: "text" },
             { name: "keterangan", label: "Keterangan", type: "textarea", full: true }
         ]
     });
  }

  container.querySelectorAll(".sk-tab").forEach(btn => {
     btn.addEventListener("click", async () => {
        const tab = btn.dataset.stab;
        panelInput.classList.toggle("hidden", tab !== "input");
        panelRiwayat.classList.toggle("hidden", tab !== "riwayat");
        
        container.querySelectorAll(".sk-tab").forEach(b => {
           b.classList.toggle("border-maroon-700", b === btn);
           b.classList.toggle("text-maroon-700", b === btn);
           b.classList.toggle("border-transparent", b !== btn);
           b.classList.toggle("text-slate-500", b !== btn);
        });
        
        if (tab === "riwayat" && !loaded.riwayat) {
           loaded.riwayat = true;
           await loadRiwayat();
        }
     });
  });

  return { unmount() {} };
}
