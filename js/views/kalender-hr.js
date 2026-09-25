import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsDelete, openModal, closeModal, toast, escapeHtml, sendEmailNotif, buildStandardEmailHtml, genId, localDateStr } from "../utils.js";
import { emptyState } from "../components.js";

export async function mount(container, { session }) {
 let currentDate = new Date();
 
 let cutiData = [];
 let karyawanData = [];
 let agendaData = [];
 let activeFilters = new Set(["cuti", "bday", "anniv", "kontrak", "agenda"]);

 container.innerHTML = `
 <div class="max-w-7xl mx-auto space-y-6 pb-10">
 <div class="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 border-b border-slate-200 pb-4">
 <div>
 <h1 class="text-2xl font-bold text-slate-800">Kalender Pintar HR</h1>
 <p class="text-sm text-slate-500 mt-1">Pantau Cuti, Ulang Tahun, Anniversary, Kontrak Habis & Agenda dalam satu tampilan.</p>
 </div>
 <button id="btn-tambah-agenda" class="bg-maroon-700 hover:bg-maroon-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-2">
 <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
 Tambah Agenda Internal
 </button>
 </div>
 
 <div class="grid grid-cols-2 sm:grid-cols-5 gap-2" id="cal-summary"></div>

 <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-5">
 <!-- Calendar Header -->
 <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
 <div class="flex items-center gap-1"><button id="cal-prev" class="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button><button id="cal-today" class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">Hari Ini</button></div>
 <h2 id="cal-month-year" class="text-xl font-bold text-slate-800 uppercase tracking-wide"></h2>
 <button id="cal-next" class="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
 </div>

 <!-- Keterangan Indikator -->
 <div class="flex flex-wrap gap-2 mb-4 text-[11px] font-bold text-slate-600 justify-center" id="cal-filters">
 <button data-cal-filter="cuti" class="cal-filter px-2.5 py-1.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">● Cuti / Izin</button>
 <button data-cal-filter="bday" class="cal-filter px-2.5 py-1.5 rounded-full border bg-pink-50 text-pink-700 border-pink-200">● Ulang Tahun</button>
 <button data-cal-filter="anniv" class="cal-filter px-2.5 py-1.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">● Anniversary</button>
 <button data-cal-filter="kontrak" class="cal-filter px-2.5 py-1.5 rounded-full border bg-red-50 text-red-700 border-red-200">● Habis Kontrak</button>
 <button data-cal-filter="agenda" class="cal-filter px-2.5 py-1.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">● Agenda HR</button>
 </div>

 <!-- Calendar Grid -->
 <div class="overflow-x-auto"><div class="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden min-w-[920px]" id="cal-grid">
 <!-- Diisi oleh Javascript -->
 </div></div>
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

 function approvedLeave(record) {
  const status = String(record?.status_final || record?.status || "").toUpperCase();
  return !/DITOLAK|REJECT|PENDING|MENUNGGU/.test(status);
 }

 function leaveCoversDate(record, date) {
  if (!approvedLeave(record)) return false;
  const start = toLocalDateStr(record.tanggal || record.tanggal_mulai);
  const end = toLocalDateStr(record.tanggal_selesai || record.tanggal_akhir || record.tanggal || record.tanggal_mulai);
  return Boolean(start && end && date >= start && date <= end);
 }

 function dayLists(dStr) {
  return {
   cuti: cutiData.filter(c => leaveCoversDate(c, dStr)),
   bday: karyawanData.filter(k => toLocalDateStr(k.tanggal_lahir)?.substring(5) === dStr.substring(5)),
   anniv: karyawanData.filter(k => toLocalDateStr(k.tanggal_join)?.substring(5) === dStr.substring(5) && toLocalDateStr(k.tanggal_join) < dStr),
   kontrak: karyawanData.filter(k => toLocalDateStr(k.kontrak_habis) === dStr),
   agenda: agendaData.filter(a => toLocalDateStr(a.tanggal) === dStr)
  };
 }

 function eventChips(lists) {
  const items = [];
  if (activeFilters.has("agenda")) lists.agenda.forEach(a => items.push({ cls: "bg-emerald-50 text-emerald-800 border-emerald-200", text: a.judul || "Agenda HR" }));
  if (activeFilters.has("cuti")) lists.cuti.forEach(c => items.push({ cls: "bg-blue-50 text-blue-800 border-blue-200", text: `${c.nama_karyawan || c.nama || "Karyawan"} • ${c.type_cuti || c.jenis_cuti || "Cuti/Izin"}` }));
  if (activeFilters.has("bday")) lists.bday.forEach(k => items.push({ cls: "bg-pink-50 text-pink-800 border-pink-200", text: ` ${k.nama_karyawan || k.nama}` }));
  if (activeFilters.has("anniv")) lists.anniv.forEach(k => items.push({ cls: "bg-purple-50 text-purple-800 border-purple-200", text: ` ${k.nama_karyawan || k.nama}` }));
  if (activeFilters.has("kontrak")) lists.kontrak.forEach(k => items.push({ cls: "bg-red-50 text-red-800 border-red-200", text: `Kontrak: ${k.nama_karyawan || k.nama}` }));
  return items;
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
 html += `<div class="bg-white/50 min-h-36"></div>`; // Kotak kosong bulan lalu
 }

 for (let day = 1; day <= daysInMonth; day++) {
 const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
 const isToday = dStr === toLocalDateStr(new Date());

 const lists = dayLists(dStr);
 const chips = eventChips(lists);
 const visibleChips = chips.slice(0, 4);

 html += `
 <button type="button" data-date="${dStr}" class="text-left bg-white min-h-36 p-2 border-t-2 ${isToday ? 'border-maroon-600 bg-maroon-50/30' : 'border-transparent'} hover:bg-slate-50 hover:shadow-inner cursor-pointer transition flex flex-col focus:outline-none focus:ring-2 focus:ring-inset focus:ring-maroon-300">
 <div class="flex justify-between items-start mb-1">
 <span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${isToday ? 'font-black text-white bg-maroon-700' : 'font-bold text-slate-700'}">${day}</span>
 ${chips.length ? `<span class="text-[9px] font-bold text-slate-400">${chips.length} item</span>` : ''}
 </div>
 <div class="flex-1 overflow-hidden space-y-1 mt-1">
 ${visibleChips.map(item => `<div class="px-1.5 py-1 rounded-md border text-[9px] font-semibold truncate ${item.cls}" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</div>`).join("")}
 ${chips.length > visibleChips.length ? `<div class="text-[9px] font-bold text-slate-500 px-1">+${chips.length - visibleChips.length} lainnya</div>` : ''}
 </div>
 </button>
 `;
 }
 
 gridEl.innerHTML = html;

 gridEl.querySelectorAll("[data-date]").forEach(cell => {
 cell.onclick = () => openDayDetailModal(cell.dataset.date);
 });

 const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
 const monthly = { cuti: 0, bday: 0, anniv: 0, kontrak: 0, agenda: 0 };
 for (let day = 1; day <= daysInMonth; day++) {
  const lists = dayLists(`${monthPrefix}-${String(day).padStart(2, '0')}`);
  Object.keys(monthly).forEach(type => { monthly[type] += lists[type].length; });
 }
 const summary = container.querySelector("#cal-summary");
 if (summary) summary.innerHTML = [
  ["Cuti / Izin", monthly.cuti, "bg-blue-50 border-blue-200 text-blue-800"],
  ["Ulang Tahun", monthly.bday, "bg-pink-50 border-pink-200 text-pink-800"],
  ["Anniversary", monthly.anniv, "bg-purple-50 border-purple-200 text-purple-800"],
  ["Kontrak Habis", monthly.kontrak, "bg-red-50 border-red-200 text-red-800"],
  ["Agenda HR", monthly.agenda, "bg-emerald-50 border-emerald-200 text-emerald-800"]
 ].map(([label, count, cls]) => `<div class="rounded-xl border p-3 ${cls}"><p class="text-[10px] font-bold uppercase">${label}</p><p class="text-xl font-black mt-1">${count}</p></div>`).join("");
 }

 container.querySelector("#cal-prev").onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
 container.querySelector("#cal-next").onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };
 container.querySelector("#cal-today").onclick = () => { currentDate = new Date(); renderCalendar(); };
 container.querySelectorAll("[data-cal-filter]").forEach(button => {
  button.onclick = () => {
   const type = button.dataset.calFilter;
   if (activeFilters.has(type)) activeFilters.delete(type); else activeFilters.add(type);
   button.classList.toggle("opacity-35", !activeFilters.has(type));
   button.classList.toggle("grayscale", !activeFilters.has(type));
   renderCalendar();
  };
 });

 // ==========================================
 // MODAL DETAIL HARI INI & PENGIRIMAN EMAIL
 // ==========================================
 function openDayDetailModal(dStr) {
 const { cuti: listCuti, bday: listBday, anniv: listAnniv, kontrak: listKontrak, agenda: listAgenda } = dayLists(dStr);

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
 bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-2 flex items-center gap-1">Agenda Internal / To-Do List</h3><div class="bg-emerald-50 rounded-lg p-3 border border-emerald-100 space-y-2">`;
 listAgenda.forEach(a => {
 bodyHtml += `<div class="flex justify-between items-start"><p class="text-sm font-medium text-emerald-900">${escapeHtml(a.judul)}</p><button data-del-agenda="${a.id}" class="text-xs text-red-500 hover:underline">Hapus</button></div><p class="text-xs text-emerald-700">${escapeHtml(a.keterangan || "-")}</p>`;
 });
 bodyHtml += `</div></div>`;
 }

 if (listBday.length) {
 bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-pink-800 uppercase tracking-wide mb-2 flex items-center gap-1">Ulang Tahun Karyawan</h3><div class="bg-pink-50/50 rounded-lg p-2 border border-pink-100 px-3">`;
 listBday.forEach(k => bodyHtml += renderEmailRow(k, 'bday'));
 bodyHtml += `</div></div>`;
 }

 if (listAnniv.length) {
 bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-purple-800 uppercase tracking-wide mb-2 flex items-center gap-1">Anniversary Kerja</h3><div class="bg-purple-50/50 rounded-lg p-2 border border-purple-100 px-3">`;
 listAnniv.forEach(k => bodyHtml += renderEmailRow(k, 'anniv'));
 bodyHtml += `</div></div>`;
 }

 if (listCuti.length) {
 bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2 flex items-center gap-1">Karyawan Sedang Cuti/Izin</h3><ul class="space-y-1.5">`;
 listCuti.forEach(c => bodyHtml += `<li class="text-sm text-slate-700 bg-slate-50 border border-slate-100 p-2 rounded flex justify-between"><span>${escapeHtml(c.nama_karyawan)}</span> <span class="text-xs font-semibold text-blue-600">${escapeHtml(c.type_cuti)}</span></li>`);
 bodyHtml += `</ul></div>`;
 }

 if (listKontrak.length) {
 bodyHtml += `<div class="mb-5"><h3 class="text-xs font-bold text-red-800 uppercase tracking-wide mb-2 flex items-center gap-1">Kontrak Harus Diperbarui</h3><ul class="space-y-1.5">`;
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
 htmlBody = buildStandardEmailHtml({
   badgeText: "Ulang Tahun",
   badgeVariant: "rose",
   title: `Selamat Ulang Tahun, ${name}! `,
   recipientName: name,
   introText: "Segenap jajaran Direksi, Manajemen, dan seluruh keluarga besar CV Andela Jaya mengucapkan selamat ulang tahun!",
   bodyHtml: `
     <div style="background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%); border: 1px solid #fecdd3; border-radius: 10px; padding: 20px; text-align: center; margin: 16px 0;">
       <p style="font-size: 15px; color: #9f1239; margin: 0 0 10px 0; font-weight: bold;">
         Semoga panjang umur, senantiasa diberikan kesehatan, kebahagiaan, dan kelancaran dalam berkarya.
       </p>
       <p style="font-size: 13px; color: #be123c; margin: 0;">
         Terima kasih atas kontribusi terbaik yang telah Anda berikan untuk kemajuan bersama.
       </p>
     </div>
   `,
   secondaryNote: "Salam hangat dari Divisi Human Resource Development (HRD) CV Andela Jaya."
 });
 } else {
 const years = btn.dataset.annivYear;
 subject = `Happy Work Anniversary ke-${years}, ${name}!`;
 htmlBody = buildStandardEmailHtml({
   badgeText: "Work Anniversary",
   badgeVariant: "purple",
   title: `Happy Work Anniversary ke-${years}! `,
   recipientName: name,
   introText: `Terima kasih atas dedikasi dan komitmen luar biasa <strong>${escapeHtml(name)}</strong> selama <strong>${escapeHtml(years)} Tahun</strong> bersama kami.`,
   bodyHtml: `
     <div style="background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border: 1px solid #e9d5ff; border-radius: 10px; padding: 20px; text-align: center; margin: 16px 0;">
       <p style="font-size: 15px; color: #6b21a8; margin: 0 0 10px 0; font-weight: bold;">
         Mari terus melangkah, bertumbuh, dan meraih pencapaian hebat berikutnya bersama CV Andela Jaya!
       </p>
       <p style="font-size: 13px; color: #7e22ce; margin: 0;">
         Dedikasi dan profesionalisme Anda adalah bagian penting dari perjalanan kesuksesan perusahaan ini.
       </p>
     </div>
   `,
   secondaryNote: "Salam hangat dari Divisi Human Resource Development (HRD) CV Andela Jaya."
 });
 }
 await sendEmailNotif(email, subject, htmlBody, "", null, { manual: true });
 toast("Ucapan berhasil dikirim ke Email Karyawan!", "success");
 btn.className = "text-[10px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded";
 btn.textContent = "Terkirim [v]";
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
