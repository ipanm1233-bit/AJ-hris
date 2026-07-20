import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsDelete, openModal, closeModal, toast, escapeHtml, sendEmailNotif, genId, localDateStr } from "../utils.js";
import { emptyState } from "../components.js";

export async function mount(container, { session }) {
  let currentDate = new Date();
  
  let cutiData = [];
  let karyawanData = [];
  let agendaData = [];

  container.innerHTML = `
    <div class="max-w-7xl mx-auto space-y-6 pb-10">
       <div class="flex justify-between items-center border-b border-slate-200 pb-4">
          <div>
             <h1 class="text-2xl font-bold text-slate-800">Kalender Pintar HR</h1>
             <p class="text-sm text-slate-500 mt-1">Pantau Cuti, Ulang Tahun, Anniversary, Kontrak Habis & Agenda dalam satu tampilan.</p>
          </div>
          <button id="btn-tambah-agenda" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            Tambah Agenda Internal
          </button>
       </div>
       
       <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <!-- Calendar Header -->
          <div class="flex justify-between items-center mb-6">
             <button id="cal-prev" class="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
             <h2 id="cal-month-year" class="text-xl font-bold text-slate-800 uppercase tracking-wide"></h2>
             <button id="cal-next" class="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
          </div>

          <!-- Keterangan Indikator -->
          <div class="flex flex-wrap gap-4 mb-4 text-[11px] font-medium text-slate-500 justify-center">
             <span class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Cuti / Izin</span>
             <span class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded-full bg-pink-500"></div> Ulang Tahun</span>
             <span class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded-full bg-purple-500"></div> Anniversary Kerja</span>
             <span class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded-full bg-red-500"></div> Habis Kontrak</span>
             <span class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> Agenda HR</span>
          </div>

          <!-- Calendar Grid -->
          <div class="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden" id="cal-grid">
             <!-- Diisi oleh Javascript -->
          </div>
       </div>
    </div>
  `;

  const gridEl = container.querySelector("#cal-grid");
  const monthYearEl = container.querySelector("#cal-month-year");
  
  // Ambil semua data sekaligus
  async function fetchAllData() {
     gridEl.innerHTML = `<div class="col-span-7 bg-white p-10 text-center text-slate-400">Memuat Kalender Pintar...</div>`;
     try {
         [cutiData, karyawanData, agendaData] = await Promise.all([
             fsGetAll(COL.MASTER_CUTI),
             fsGetAll(COL.MASTER_KARYAWAN),
             fsGetAll(COL.KALENDER_HR).catch(() => []) // Fallback kalau collection belum ada
         ]);
         renderCalendar();
     } catch(e) {
         gridEl.innerHTML = `<div class="col-span-7 bg-white p-10 text-center text-red-400">Gagal memuat kalender: ${e.message}</div>`;
     }
  }

  // Fungsi helper standarisasi format YYYY-MM-DD
  function toLocalDateStr(val) {
     return localDateStr(val);
  }

  function renderCalendar() {
     const year = currentDate.getFullYear();
     const month = currentDate.getMonth();
     
     monthYearEl.textContent = new Date(year, month).toLocaleString('id-ID', { month: 'long', year: 'numeric' });

     const firstDay = new Date(year, month, 1).getDay();
     const daysInMonth = new Date(year, month + 1, 0).getDate();

     const daysOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
     let html = daysOfWeek.map(d => `<div class="bg-slate-50 text-center py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">${d}</div>`).join("");

     for (let i = 0; i < firstDay; i++) {
        html += `<div class="bg-white/50 h-28"></div>`; // Kotak kosong bulan lalu
     }

     for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dStr === toLocalDateStr(new Date());

        // Kumpulkan indikator hari ini
        const listCuti = cutiData.filter(c => toLocalDateStr(c.tanggal) === dStr);
        const listBday = karyawanData.filter(k => toLocalDateStr(k.tanggal_lahir)?.substring(5) === dStr.substring(5));
        const listAnniv = karyawanData.filter(k => toLocalDateStr(k.tanggal_join)?.substring(5) === dStr.substring(5) && toLocalDateStr(k.tanggal_join) < dStr);
        const listKontrak = karyawanData.filter(k => toLocalDateStr(k.kontrak_habis) === dStr);
        const listAgenda = agendaData.filter(a => a.tanggal === dStr);

        let dotsHtml = '';
        if(listCuti.length) dotsHtml += `<div class="w-2 h-2 rounded-full bg-blue-500" title="Cuti"></div>`;
        if(listBday.length) dotsHtml += `<div class="w-2 h-2 rounded-full bg-pink-500" title="Ulang Tahun"></div>`;
        if(listAnniv.length) dotsHtml += `<div class="w-2 h-2 rounded-full bg-purple-500" title="Anniversary"></div>`;
        if(listKontrak.length) dotsHtml += `<div class="w-2 h-2 rounded-full bg-red-500" title="Kontrak Habis"></div>`;
        if(listAgenda.length) dotsHtml += `<div class="w-2 h-2 rounded-full bg-emerald-500" title="Agenda HR"></div>`;

        // Ringkasan Teks
        let textSummary = '';
        if (listBday.length) textSummary += `<p class="text-[9px] text-pink-600 truncate font-semibold">🎂 ${listBday.length} Ultah</p>`;
        if (listAnniv.length) textSummary += `<p class="text-[9px] text-purple-600 truncate font-semibold">💼 ${listAnniv.length} Anniv</p>`;
        if (listCuti.length) textSummary += `<p class="text-[9px] text-blue-600 truncate">🛏️ ${listCuti.length} Cuti</p>`;
        if (listAgenda.length) textSummary += `<p class="text-[9px] text-emerald-600 truncate">📌 ${listAgenda[0].judul}</p>`;

        html += `
           <div data-date="${dStr}" class="bg-white h-28 p-1.5 border-t-2 ${isToday ? 'border-maroon-600 bg-maroon-50/20' : 'border-transparent'} hover:bg-slate-50 cursor-pointer transition flex flex-col">
              <div class="flex justify-between items-start mb-1">
                 <span class="text-sm ${isToday ? 'font-black text-maroon-700' : 'font-medium text-slate-700'}">${day}</span>
                 <div class="flex gap-0.5 mt-1">${dotsHtml}</div>
              </div>
              <div class="flex-1 overflow-hidden space-y-0.5 mt-1">
                 ${textSummary}
              </div>
           </div>
        `;
     }
     
     gridEl.innerHTML = html;

     gridEl.querySelectorAll("[data-date]").forEach(cell => {
         cell.onclick = () => openDayDetailModal(cell.dataset.date);
     });
  }

  container.querySelector("#cal-prev").onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
  container.querySelector("#cal-next").onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };

  // ==========================================
  // MODAL DETAIL HARI INI & PENGIRIMAN EMAIL
  // ==========================================
  function openDayDetailModal(dStr) {
      const listCuti = cutiData.filter(c => toLocalDateStr(c.tanggal) === dStr);
      const listBday = karyawanData.filter(k => toLocalDateStr(k.tanggal_lahir)?.substring(5) === dStr.substring(5));
      const listAnniv = karyawanData.filter(k => toLocalDateStr(k.tanggal_join)?.substring(5) === dStr.substring(5) && toLocalDateStr(k.tanggal_join) < dStr);
      const listKontrak = karyawanData.filter(k => toLocalDateStr(k.kontrak_habis) === dStr);
      const listAgenda = agendaData.filter(a => a.tanggal === dStr);

      const formatTgl = new Date(dStr).toLocaleString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

      // Helper Render Baris Email
      const renderEmailRow = (k, type, btnId) => {
         if(!k.email) return `<div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0"><span class="text-sm font-medium text-slate-700">${escapeHtml(k.nama_karyawan)}</span><span class="text-[10px] text-red-500">Email Tidak Tersedia</span></div>`;
         
         let annivYear = "";
         if(type === 'anniv') {
             // Ambil tahun langsung dari teks "YYYY-MM-DD" (bukan re-parse lewat
             // new Date() lagi) supaya tidak ada celah zona waktu sama sekali.
             const yJoin = parseInt(toLocalDateStr(k.tanggal_join)?.substring(0, 4), 10);
             const yNow = parseInt(dStr.substring(0, 4), 10);
             annivYear = yNow - yJoin;
         }

         return `
         <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
            <div>
               <span class="text-sm font-medium text-slate-700">${escapeHtml(k.nama_karyawan)}</span>
               ${type === 'anniv' ? `<p class="text-[10px] text-purple-600 font-semibold">Merayakan ${annivYear} Tahun</p>` : ''}
            </div>
            <button data-email-type="${type}" data-email-target="${k.email}" data-k-name="${escapeHtml(k.nama_karyawan)}" data-anniv-year="${annivYear}" class="text-[10px] font-bold bg-maroon-50 text-maroon-700 border border-maroon-200 px-2 py-1 rounded hover:bg-maroon-700 hover:text-white transition">Kirim Ucapan via Email</button>
         </div>`;
      };

      let bodyHtml = `<p class="text-sm text-slate-500 mb-5 pb-3 border-b border-slate-100">${formatTgl}</p>`;

      if (listAgenda.length) {
         bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-2 flex items-center gap-1">📌 Agenda Internal / To-Do List</h3><div class="bg-emerald-50 rounded-lg p-3 border border-emerald-100 space-y-2">`;
         listAgenda.forEach(a => {
            bodyHtml += `<div class="flex justify-between items-start"><p class="text-sm font-medium text-emerald-900">${escapeHtml(a.judul)}</p><button data-del-agenda="${a.id}" class="text-xs text-red-500 hover:underline">Hapus</button></div><p class="text-xs text-emerald-700">${escapeHtml(a.keterangan || "-")}</p>`;
         });
         bodyHtml += `</div></div>`;
      }

      if (listBday.length) {
         bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-pink-800 uppercase tracking-wide mb-2 flex items-center gap-1">🎂 Ulang Tahun Karyawan</h3><div class="bg-pink-50/50 rounded-lg p-2 border border-pink-100 px-3">`;
         listBday.forEach(k => bodyHtml += renderEmailRow(k, 'bday'));
         bodyHtml += `</div></div>`;
      }

      if (listAnniv.length) {
         bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-purple-800 uppercase tracking-wide mb-2 flex items-center gap-1">💼 Anniversary Kerja</h3><div class="bg-purple-50/50 rounded-lg p-2 border border-purple-100 px-3">`;
         listAnniv.forEach(k => bodyHtml += renderEmailRow(k, 'anniv'));
         bodyHtml += `</div></div>`;
      }

      if (listCuti.length) {
         bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2 flex items-center gap-1">🛏️ Karyawan Sedang Cuti/Izin</h3><ul class="space-y-1.5">`;
         listCuti.forEach(c => bodyHtml += `<li class="text-sm text-slate-700 bg-slate-50 border border-slate-100 p-2 rounded flex justify-between"><span>${escapeHtml(c.nama_karyawan)}</span> <span class="text-xs font-semibold text-blue-600">${escapeHtml(c.type_cuti)}</span></li>`);
         bodyHtml += `</ul></div>`;
      }

      if (listKontrak.length) {
         bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-red-800 uppercase tracking-wide mb-2 flex items-center gap-1">📄 Kontrak Harus Diperbarui</h3><ul class="space-y-1.5">`;
         listKontrak.forEach(k => bodyHtml += `<li class="text-sm text-slate-700 bg-red-50 border border-red-100 p-2 rounded">${escapeHtml(k.nama_karyawan)} <span class="text-xs text-slate-500">(${escapeHtml(k.jabatan||"-")})</span></li>`);
         bodyHtml += `</ul></div>`;
      }

      if(!listCuti.length && !listBday.length && !listAnniv.length && !listKontrak.length && !listAgenda.length) {
         bodyHtml += emptyState("Tidak ada aktivitas di tanggal ini", "Kalender kosong.");
      }

      openModal({
         title: "Aktivitas Harian",
         size: "md",
         bodyHtml: bodyHtml,
         footerHtml: `<button id="btn-tutup-detail" class="w-full py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-200 transition">Tutup Detail</button>`,
         onMount: (m) => {
            m.querySelector("#btn-tutup-detail").onclick = closeModal;

            // FUNGSI PENGIRIMAN EMAIL OTOMATIS
            m.querySelectorAll("[data-email-type]").forEach(btn => {
               btn.onclick = async () => {
                   const type = btn.dataset.emailType;
                   const email = btn.dataset.emailTarget;
                   const name = btn.dataset.kName;
                   
                   btn.disabled = true; btn.textContent = "Mengirim...";

                   try {
                       let subject, htmlBody;
                       if (type === 'bday') {
                           subject = `Selamat Ulang Tahun, ${name}!`;
                           htmlBody = `<div style="font-family: Arial; padding: 30px; text-align: center; border: 1px solid #fbcfe8; background-color: #fdf2f8; border-radius: 10px;">
                               <h1 style="color: #be185d; margin-bottom: 10px;">Selamat Ulang Tahun! &#127874;</h1>
                               <p style="color: #831843; font-size: 16px;">Segenap jajaran Direksi dan tim HRD mengucapkan selamat ulang tahun untuk <strong>${name}</strong>.</p>
                               <p style="color: #831843;">Semoga panjang umur, sehat selalu, dan semakin sukses bersama CV Andela Jaya!</p>
                           </div>`;
                       } else {
                           const years = btn.dataset.annivYear;
                           subject = `Happy Work Anniversary ke-${years}, ${name}!`;
                           htmlBody = `<div style="font-family: Arial; padding: 30px; text-align: center; border: 1px solid #e9d5ff; background-color: #faf5ff; border-radius: 10px;">
                               <h1 style="color: #7e22ce; margin-bottom: 10px;">Happy Work Anniversary! &#127881;</h1>
                               <p style="color: #581c87; font-size: 16px;">Terima kasih atas dedikasi dan kerja keras <strong>${name}</strong> selama <strong>${years} Tahun</strong> ini bersama kami.</p>
                               <p style="color: #581c87;">Mari terus tumbuh dan mencapai kesuksesan bersama CV Andela Jaya!</p>
                           </div>`;
                       }
                       await sendEmailNotif(email, subject, htmlBody);
                       toast("Ucapan berhasil dikirim ke Email Karyawan!", "success");
                       btn.className = "text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded";
                       btn.textContent = "Terkirim ✓";
                   } catch(e) {
                       toast("Gagal mengirim email: " + e.message, "error");
                       btn.disabled = false; btn.textContent = "Coba Lagi";
                   }
               };
            });

            // FUNGSI HAPUS AGENDA
            m.querySelectorAll("[data-del-agenda]").forEach(btn => {
               btn.onclick = async () => {
                  if(confirm("Hapus agenda ini?")) {
                      await fsDelete(COL.KALENDER_HR, btn.dataset.delAgenda);
                      toast("Agenda dihapus", "success");
                      closeModal();
                      fetchAllData();
                  }
               };
            });
         }
      });
  }

  // ==========================================
  // MODAL TAMBAH AGENDA MANUAL
  // ==========================================
  container.querySelector("#btn-tambah-agenda").onclick = () => {
      openModal({
          title: "Tambah Agenda HR / To-Do List",
          bodyHtml: `
            <form id="form-agenda" class="space-y-4">
               <div><label class="block text-xs font-medium text-slate-500 mb-1">Tanggal Eksekusi</label><input type="date" id="ag-tgl" required class="w-full px-3 py-2 text-sm rounded border border-slate-200 outline-none focus:border-maroon-400"></div>
               <div><label class="block text-xs font-medium text-slate-500 mb-1">Judul Agenda / Tugas</label><input type="text" id="ag-judul" placeholder="Cth: Meeting Evaluasi Kuartal 3" required class="w-full px-3 py-2 text-sm rounded border border-slate-200 outline-none focus:border-maroon-400"></div>
               <div><label class="block text-xs font-medium text-slate-500 mb-1">Keterangan / Detail Tugas</label><textarea id="ag-ket" rows="2" class="w-full px-3 py-2 text-sm rounded border border-slate-200 outline-none focus:border-maroon-400"></textarea></div>
            </form>
          `,
          footerHtml: `
             <button id="btn-ag-batal" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
             <button id="btn-ag-simpan" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md">Simpan Agenda</button>
          `,
          onMount: m => {
              m.querySelector("#btn-ag-batal").onclick = closeModal;
              m.querySelector("#btn-ag-simpan").onclick = async () => {
                  const form = m.querySelector("#form-agenda");
                  if(!form.reportValidity()) return;

                  const btn = m.querySelector("#btn-ag-simpan");
                  btn.disabled = true; btn.textContent = "Menyimpan...";
                  
                  try {
                      await fsAdd(COL.KALENDER_HR, {
                          tanggal: m.querySelector("#ag-tgl").value,
                          judul: m.querySelector("#ag-judul").value.trim(),
                          keterangan: m.querySelector("#ag-ket").value.trim()
                      }, genId("AGD"));
                      
                      toast("Agenda ditambahkan ke kalender!", "success");
                      closeModal();
                      fetchAllData(); // Segarkan tampilan
                  } catch(e) {
                      toast("Gagal menambah: " + e.message, "error");
                      btn.disabled = false; btn.textContent = "Simpan Agenda";
                  }
              };
          }
      });
  };

  fetchAllData();
  return { unmount() {} };
}
