import { db, collection, getDocs, doc, setDoc, deleteDoc } from "../firebase-config.js";
import { fsGetAll, toast, fmtDateShort, fmtRupiah, genId, escapeHtml, smartParseDate, confirmDialog } from "../utils.js";
import { emptyState, skeletonRows, badge } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

export async function mount(container) {
  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Lembur & Kasbon (HRD)</h1>
        <p class="text-sm text-slate-500 mt-1">Input manual, kalkulasi lembur otomatis (UU Ketenagakerjaan), dan validasi syarat kasbon.</p>
      </div>
      <div class="flex items-center gap-2 border-b border-slate-100">
        <button data-ltab="lembur" class="lb-tab px-4 py-2.5 text-sm font-medium border-b-2 border-maroon-700 text-maroon-700">Data Lembur</button>
        <button data-ltab="kasbon" class="lb-tab px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700">Data Kasbon</button>
      </div>
      <div id="lb-panel-lembur"></div>
      <div id="lb-panel-kasbon" class="hidden"></div>
    </div>
  `;

  const panelLembur = container.querySelector("#lb-panel-lembur");
  const panelKasbon = container.querySelector("#lb-panel-kasbon");

  // Load Karyawan Aktif
  const allKaryawan = await fsGetAll("master_karyawan");
  const activeEmp = allKaryawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF");

  // ==========================================
  // MODUL LEMBUR (KALKULASI OTOMATIS UU KETENAGAKERJAAN)
  // ==========================================
  async function loadLembur() {
    const dataLembur = await fsGetAll("log_lembur");
    panelLembur.innerHTML = `
      <div class="flex justify-between items-center mb-4">
         <h3 class="font-bold text-slate-700">Riwayat Perintah Lembur</h3>
         <button id="btn-add-lembur" class="bg-maroon-700 text-white px-4 py-2 rounded-lg text-sm shadow">+ Input Lembur</button>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
         <table class="w-full text-sm text-left">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500">
               <tr><th class="p-3">Tanggal</th><th class="p-3">Karyawan</th><th class="p-3">Waktu</th><th class="p-3">Durasi</th><th class="p-3">Upah Lembur</th><th class="p-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
               ${dataLembur.length ? dataLembur.map(r => `
                 <tr class="border-b border-slate-50 hover:bg-slate-50">
                    <td class="p-3">${fmtDateShort(r.tanggal)} ${r.is_libur ? badge("Libur", "red") : ""}</td>
                    <td class="p-3 font-semibold text-slate-700">${escapeHtml(r.nama_karyawan)}</td>
                    <td class="p-3">${r.jam_mulai} - ${r.jam_selesai}</td>
                    <td class="p-3">${r.durasi_jam} Jam</td>
                    <td class="p-3 font-mono text-blue-700 font-bold">${fmtRupiah(r.total_upah)}</td>
                    <td class="p-3 text-right">
                       <button data-print-lembur="${r.id}" class="text-slate-400 hover:text-blue-600 mr-2">Cetak</button>
                       <button data-del-lembur="${r.id}" class="text-slate-400 hover:text-red-600">Hapus</button>
                    </td>
                 </tr>
               `).join("") : `<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada data lembur</td></tr>`}
            </tbody>
         </table>
      </div>
    `;

    panelLembur.querySelectorAll("[data-del-lembur]").forEach(btn => btn.onclick = async () => {
       if(await confirmDialog("Hapus data lembur ini?")) { await deleteDoc(doc(db, "log_lembur", btn.dataset.delLembur)); loadLembur(); }
    });
    panelLembur.querySelectorAll("[data-print-lembur]").forEach(btn => btn.onclick = () => {
       const row = dataLembur.find(x => x.id === btn.dataset.printLembur);
       printLemburPdf(row);
    });

    panelLembur.querySelector("#btn-add-lembur").onclick = () => {
       const idForm = "form-add-lembur";
       const modal = document.createElement("div");
       modal.className = "fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4";
       modal.innerHTML = `
         <div class="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 class="font-bold text-slate-800">Form Surat Perintah Lembur</h3>
               <button id="close-lm" class="text-slate-400 hover:text-red-500">✖</button>
            </div>
            <div class="p-5 space-y-4">
               <div class="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-2 text-xs text-blue-800">
                  Kalkulasi otomatis menggunakan rumus baku PP No 35 Th 2021 (1/173 x Gaji Sebulan).
               </div>
               <div><label class="block text-xs font-bold text-slate-600 mb-1">Karyawan</label><select id="lm-emp" class="w-full border p-2 rounded outline-none"><option value="">Pilih Karyawan...</option>${activeEmp.map(k => `<option value="${k.nama_karyawan}">${k.nama_karyawan}</option>`).join("")}</select></div>
               <div class="grid grid-cols-2 gap-4">
                  <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal Lembur</label><input type="date" id="lm-tgl" class="w-full border p-2 rounded outline-none"></div>
                  <div class="flex items-center pt-5"><label class="flex items-center gap-2 text-sm font-bold text-red-600 cursor-pointer"><input type="checkbox" id="lm-libur" class="w-4 h-4"> Di Hari Libur/Minggu</label></div>
               </div>
               <div class="grid grid-cols-2 gap-4">
                  <div><label class="block text-xs font-bold text-slate-600 mb-1">Jam Mulai</label><input type="time" id="lm-start" class="w-full border p-2 rounded outline-none"></div>
                  <div><label class="block text-xs font-bold text-slate-600 mb-1">Jam Selesai</label><input type="time" id="lm-end" class="w-full border p-2 rounded outline-none"></div>
               </div>
               <div><label class="block text-xs font-bold text-slate-600 mb-1">Gaji Pokok Karyawan (Untuk Dasar Hitungan)</label><input type="number" id="lm-gaji" class="w-full border p-2 rounded outline-none" placeholder="Cth: 4000000"></div>
               <div><label class="block text-xs font-bold text-slate-600 mb-1">Pekerjaan / Alasan</label><input type="text" id="lm-tugas" class="w-full border p-2 rounded outline-none" placeholder="Bongkar muat barang..."></div>
               <div class="bg-slate-800 p-4 rounded-lg flex justify-between items-center text-white">
                  <span class="text-sm font-medium">Estimasi Upah Lembur:</span>
                  <span id="lm-hasil" class="text-xl font-bold font-mono">Rp 0</span>
               </div>
               <button id="btn-save-lm" class="w-full bg-maroon-700 text-white font-bold py-2.5 rounded-lg">Simpan & Cetak SPL</button>
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

          if(start && end && gaji) {
              let d1 = new Date(`2000-01-01T${start}`);
              let d2 = new Date(`2000-01-01T${end}`);
              if(d2 < d1) d2.setDate(d2.getDate() + 1); // Jika lewat tengah malam
              let hours = (d2 - d1) / 3600000;
              if (hours < 0) hours = 0;

              let upahSejam = gaji / 173;
              let total = 0;

              if (isLibur) {
                  // Rumus Hari Libur
                  if (hours <= 7) total = hours * 2 * upahSejam;
                  else if (hours === 8) total = (7 * 2 * upahSejam) + (1 * 3 * upahSejam);
                  else total = (7 * 2 * upahSejam) + (1 * 3 * upahSejam) + ((hours - 8) * 4 * upahSejam);
              } else {
                  // Rumus Hari Kerja Biasa
                  if (hours > 0) {
                      total += 1.5 * upahSejam; // 1 Jam Pertama
                      if (hours > 1) total += (hours - 1) * 2 * upahSejam; // Jam Berikutnya
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
           if(!emp || !tgl) return toast("Lengkapi nama dan tanggal!", "warning");
           
           const payload = {
              nama_karyawan: emp, tanggal: tgl,
              jam_mulai: modal.querySelector("#lm-start").value,
              jam_selesai: modal.querySelector("#lm-end").value,
              is_libur: modal.querySelector("#lm-libur").checked,
              gaji_dasar: parseFloat(modal.querySelector("#lm-gaji").value) || 0,
              pekerjaan: modal.querySelector("#lm-tugas").value,
              durasi_jam: parseFloat(modal.querySelector("#lm-hasil").dataset.hours) || 0,
              total_upah: parseFloat(modal.querySelector("#lm-hasil").dataset.val) || 0
           };

           const id = genId("LMBR");
           await setDoc(doc(db, "log_lembur", id), payload);
           toast("Lembur disimpan!", "success");
           modal.remove();
           loadLembur();
           printLemburPdf({...payload, id});
       };
    };
  }

  // ==========================================
  // MODUL KASBON (VALIDASI MASA KERJA & JEDA 3 BULAN)
  // ==========================================
  async function loadKasbon() {
    const dataKasbon = await fsGetAll("log_kasbon");
    panelKasbon.innerHTML = `
      <div class="flex justify-between items-center mb-4">
         <h3 class="font-bold text-slate-700">Data Pinjaman / Kasbon</h3>
         <button id="btn-add-kasbon" class="bg-maroon-700 text-white px-4 py-2 rounded-lg text-sm shadow">+ Input Kasbon Baru</button>
      </div>
      <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
         <table class="w-full text-sm text-left">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500">
               <tr><th class="p-3">Tanggal</th><th class="p-3">Karyawan</th><th class="p-3">Nominal</th><th class="p-3">Status</th><th class="p-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
               ${dataKasbon.length ? dataKasbon.map(r => `
                 <tr class="border-b border-slate-50 hover:bg-slate-50">
                    <td class="p-3">${fmtDateShort(r.tanggal)}</td>
                    <td class="p-3 font-semibold text-slate-700">${escapeHtml(r.nama_karyawan)}</td>
                    <td class="p-3 font-mono font-bold">${fmtRupiah(r.nominal)}</td>
                    <td class="p-3">${r.status_lunas === "LUNAS" ? badge("Lunas", "green") : badge("Belum Lunas", "red")}</td>
                    <td class="p-3 text-right">
                       ${r.status_lunas !== "LUNAS" ? `<button data-lunas-id="${r.id}" class="text-white bg-emerald-600 px-2 py-1 rounded text-[10px] font-bold mr-2 hover:bg-emerald-700">Set Lunas</button>` : `<span class="text-[10px] text-slate-400 mr-2">Tgl Lunas: ${fmtDateShort(r.tanggal_lunas)}</span>`}
                       <button data-print-kasbon="${r.id}" class="text-slate-400 hover:text-blue-600 mr-2">Cetak</button>
                       <button data-del-kasbon="${r.id}" class="text-slate-400 hover:text-red-600">Hapus</button>
                    </td>
                 </tr>
               `).join("") : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada data kasbon</td></tr>`}
            </tbody>
         </table>
      </div>
    `;

    panelKasbon.querySelectorAll("[data-lunas-id]").forEach(btn => btn.onclick = async () => {
       if(await confirmDialog("Tandai kasbon ini LUNAS hari ini?")) {
           await setDoc(doc(db, "log_kasbon", btn.dataset.lunasId), { status_lunas: "LUNAS", tanggal_lunas: new Date().toISOString() }, {merge: true});
           toast("Status diubah ke Lunas", "success"); loadKasbon();
       }
    });
    panelKasbon.querySelectorAll("[data-del-kasbon]").forEach(btn => btn.onclick = async () => {
       if(await confirmDialog("Hapus data kasbon?")) { await deleteDoc(doc(db, "log_kasbon", btn.dataset.delKasbon)); loadKasbon(); }
    });
    panelKasbon.querySelectorAll("[data-print-kasbon]").forEach(btn => btn.onclick = () => {
       const row = dataKasbon.find(x => x.id === btn.dataset.printKasbon);
       printKasbonPdf(row);
    });

    panelKasbon.querySelector("#btn-add-kasbon").onclick = () => {
       const modal = document.createElement("div");
       modal.className = "fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4";
       modal.innerHTML = `
         <div class="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 class="font-bold text-slate-800">Form Pengajuan Kasbon</h3>
               <button id="close-kb" class="text-slate-400 hover:text-red-500">✖</button>
            </div>
            <div class="p-5 space-y-4">
               <div id="kb-warning" class="hidden p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200"></div>
               <div><label class="block text-xs font-bold text-slate-600 mb-1">Karyawan</label><select id="kb-emp" class="w-full border p-2 rounded outline-none"><option value="">Pilih Karyawan...</option>${activeEmp.map(k => `<option value="${k.nama_karyawan}">${k.nama_karyawan}</option>`).join("")}</select></div>
               <div class="grid grid-cols-2 gap-4">
                  <div><label class="block text-xs font-bold text-slate-600 mb-1">Tanggal</label><input type="date" id="kb-tgl" class="w-full border p-2 rounded outline-none" value="${new Date().toISOString().split('T')[0]}"></div>
                  <div><label class="block text-xs font-bold text-slate-600 mb-1">Nominal (Rp)</label><input type="number" id="kb-nom" class="w-full border p-2 rounded outline-none font-bold text-maroon-700"></div>
               </div>
               <div><label class="block text-xs font-bold text-slate-600 mb-1">Keperluan</label><textarea id="kb-kep" rows="2" class="w-full border p-2 rounded outline-none"></textarea></div>
               <button id="btn-save-kb" class="w-full bg-maroon-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">Simpan & Cetak Form</button>
            </div>
         </div>
       `;
       document.body.appendChild(modal);
       modal.querySelector("#close-kb").onclick = () => modal.remove();

       const empSelect = modal.querySelector("#kb-emp");
       const warnBox = modal.querySelector("#kb-warning");
       const btnSave = modal.querySelector("#btn-save-kb");

       empSelect.onchange = () => {
           warnBox.classList.add("hidden"); btnSave.disabled = false;
           if(!empSelect.value) return;
           
           // VALIDASI 1: Masa Kerja Karyawan
           const kData = activeEmp.find(x => x.nama_karyawan === empSelect.value);
           if(kData && kData.tanggal_join) {
               const joinDate = smartParseDate(kData.tanggal_join);
               const now = new Date();
               const monthsTenure = (now.getFullYear() - joinDate.getFullYear()) * 12 + now.getMonth() - joinDate.getMonth();
               if(monthsTenure < 12) {
                   warnBox.innerHTML = "DITOLAK: Masa kerja karyawan belum mencapai 1 Tahun.";
                   warnBox.classList.remove("hidden"); btnSave.disabled = true; return;
               }
           }

           // VALIDASI 2: Kasbon Sebelumnya Lunas & Jeda 3 Bulan
           const prevKasbons = dataKasbon.filter(x => x.nama_karyawan === empSelect.value);
           if(prevKasbons.length > 0) {
               const unpaid = prevKasbons.find(x => x.status_lunas !== "LUNAS");
               if(unpaid) {
                   warnBox.innerHTML = "DITOLAK: Masih ada tunggakan kasbon yang belum lunas.";
                   warnBox.classList.remove("hidden"); btnSave.disabled = true; return;
               }
               // Cek jeda 3 bulan dari kasbon terakhir yg lunas
               const latestPaid = prevKasbons.sort((a,b) => new Date(b.tanggal_lunas) - new Date(a.tanggal_lunas))[0];
               if(latestPaid && latestPaid.tanggal_lunas) {
                   const paidDate = new Date(latestPaid.tanggal_lunas);
                   const now = new Date();
                   const monthsSincePaid = (now.getFullYear() - paidDate.getFullYear()) * 12 + now.getMonth() - paidDate.getMonth();
                   if(monthsSincePaid < 3) {
                       warnBox.innerHTML = `DITOLAK: Jeda pelunasan kasbon sebelumnya belum mencapai 3 bulan (Lunas pada: ${fmtDateShort(paidDate)}).`;
                       warnBox.classList.remove("hidden"); btnSave.disabled = true; return;
                   }
               }
           }
       };

       btnSave.onclick = async () => {
           const emp = empSelect.value;
           const nom = parseFloat(modal.querySelector("#kb-nom").value) || 0;
           if(!emp || !nom) return toast("Lengkapi formulir!", "warning");
           
           const payload = {
              nama_karyawan: emp,
              tanggal: modal.querySelector("#kb-tgl").value,
              nominal: nom,
              keperluan: modal.querySelector("#kb-kep").value,
              status_lunas: "BELUM",
              tanggal_lunas: null
           };

           const id = genId("KSBN");
           await setDoc(doc(db, "log_kasbon", id), payload);
           toast("Kasbon disetujui dan dicatat!", "success");
           modal.remove();
           loadKasbon();
           printKasbonPdf({...payload, id});
       };
    };
  }

  // ==========================================
  // FUNGSI CETAK PDF   // ==========================================
  async function printLemburPdf(data) {
    const { downloadHtmlAsPdf, toast } = await import("../utils.js");
    toast("Sedang memproses PDF...", "info");
    let html = `
    <div style="font-family: 'Times New Roman', serif; font-size: 14px; padding: 20px; line-height: 1.5; color: #000; background: #fff;">
      ${isoDocHeaderTable({ judul: "SURAT PERINTAH LEMBUR KARYAWAN", noDok: "HR-LMBR", terbitRevisi: "1/1", tglTerbit: "1 September 2025", hal: "1 dari 1" })}
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; width: 35%; font-weight: bold; background: #f9fafb;">Nama Karyawan</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">${escapeHtml(data.nama_karyawan)}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Hari / Tanggal</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">${fmtDateShort(data.tanggal)} ${data.is_libur ? "(Hari Libur/Minggu)" : ""}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Waktu Lembur</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">Pukul ${data.jam_mulai} s/d ${data.jam_selesai} (${data.durasi_jam} Jam)</td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Pekerjaan / Tugas</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">${escapeHtml(data.pekerjaan || "-")}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Estimasi Upah Lembur</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;"><strong>${fmtRupiah(data.total_upah)}</strong></td></tr>
      </table>
      <table style="width:100%; text-align:center; margin-top:40px;">
        <tr><td width="33%">Pemohon (Karyawan),</td><td width="33%">Menyetujui (Atasan),</td><td width="33%">Mengetahui (HRD),</td></tr>
        <tr><td height="80"></td><td></td><td></td></tr>
        <tr><td>( ${escapeHtml(data.nama_karyawan)} )</td><td>( ................................. )</td><td>( ................................. )</td></tr>
      </table>
    </div>`;
    await downloadHtmlAsPdf(html, `Surat_Lembur_${escapeHtml(data.nama_karyawan).replace(/\s+/g, "_")}.pdf`);
    toast("PDF berhasil diunduh!", "success");
  }

  async function printKasbonPdf(data) {
    const { downloadHtmlAsPdf, toast } = await import("../utils.js");
    toast("Sedang memproses PDF...", "info");
    let html = `
    <div style="font-family: 'Times New Roman', serif; font-size: 14px; padding: 20px; line-height: 1.5; color: #000; background: #fff;">
      ${isoDocHeaderTable({ judul: "FORMULIR PENGAJUAN PINJAMAN / KASBON", noDok: "FIN-KSBN", terbitRevisi: "1/1", tglTerbit: "1 September 2025", hal: "1 dari 1" })}
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; width: 35%; font-weight: bold; background: #f9fafb;">Nama Karyawan</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">${escapeHtml(data.nama_karyawan)}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Tanggal Pengajuan</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">${fmtDateShort(data.tanggal)}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Nominal Pinjaman</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;"><span style="font-size:16px; font-weight:bold;">${fmtRupiah(data.nominal)}</span></td></tr>
        <tr><td style="border: 1px solid #000; padding: 8px; vertical-align: top; font-weight: bold; background: #f9fafb;">Keperluan</td><td style="border: 1px solid #000; padding: 8px; vertical-align: top;">${escapeHtml(data.keperluan || "-")}</td></tr>
      </table>
      <div style="margin-top:20px; font-size:12px; border:1px solid #000; padding:10px;">
        <strong>Perjanjian:</strong> Dengan ini saya menyatakan meminjam uang perusahaan dan bersedia dipotong gaji setiap bulannya untuk melunasi pinjaman tersebut sesuai kebijakan CV Andela Jaya.
      </div>
      <table style="width:100%; text-align:center; margin-top:40px;">
        <tr><td width="33%">Peminjam,</td><td width="33%">Mengetahui (HRD),</td><td width="33%">Menyetujui (Finance),</td></tr>
        <tr><td height="80"></td><td></td><td></td></tr>
        <tr><td>( ${escapeHtml(data.nama_karyawan)} )</td><td>( ................................. )</td><td>( ................................. )</td></tr>
      </table>
    </div>`;
    await downloadHtmlAsPdf(html, `Form_Kasbon_${escapeHtml(data.nama_karyawan).replace(/\s+/g, "_")}.pdf`);
    toast("PDF berhasil diunduh!", "success");
  }

  // TABS LOGIC
  container.querySelectorAll(".lb-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.ltab;
      panelLembur.classList.toggle("hidden", tab !== "lembur");
      panelKasbon.classList.toggle("hidden", tab !== "kasbon");
      container.querySelectorAll(".lb-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if(tab === "lembur") loadLembur();
      if(tab === "kasbon") loadKasbon();
    });
  });

  loadLembur(); // Load tab pertama
  return { unmount() {} };
}
