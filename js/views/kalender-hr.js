import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, genId, smartParseDate, escapeHtml, fmtDate } from "../utils.js";
import { badge, emptyState, icon } from "../components.js";

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

let cursor = new Date();
cursor.setDate(1);
let events = [];

export async function mount(container) {
  const [manualEvents, karyawan] = await Promise.all([
    fsGetAll(COL.KALENDER_HR),
    fsGetAll(COL.MASTER_KARYAWAN)
  ]);

  const derived = [];
  karyawan.forEach(k => {
    const lahir = smartParseDate(k.tanggal_lahir);
    if (lahir) derived.push({ _recurring: true, month: lahir.getMonth(), day: lahir.getDate(), title: `Ulang Tahun ${k.nama_karyawan}`, jenis: "Ulang Tahun" });
    const join = smartParseDate(k.tanggal_join);
    if (join) derived.push({ _recurring: true, month: join.getMonth(), day: join.getDate(), title: `Anniversary Kerja ${k.nama_karyawan}`, jenis: "Anniversary" });
  });

  events = { manual: manualEvents, derived };

  renderCalendar(container);
  container.querySelector("#cal-prev").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() - 1); renderCalendar(container); });
  container.querySelector("#cal-next").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() + 1); renderCalendar(container); });
  container.querySelector("#cal-add").addEventListener("click", () => openAgendaModal(container));

  return { unmount() {} };
}

function eventsForDate(d) {
  const list = [];
  events.manual.forEach(e => {
    const start = smartParseDate(e.tanggal_mulai);
    const end = smartParseDate(e.tanggal_selesai) || start;
    if (start && d >= stripTime(start) && d <= stripTime(end)) {
      list.push({ title: e.judul, jenis: e.jenis, tone: jenisColor(e.jenis) });
    }
  });
  events.derived.forEach(e => {
    if (e.month === d.getMonth() && e.day === d.getDate()) {
      list.push({ title: e.title, jenis: e.jenis, tone: jenisColor(e.jenis) });
    }
  });
  return list;
}
function stripTime(d) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function jenisColor(jenis) {
  const map = { "Cuti Massal": "bg-maroon-600", "Ulang Tahun": "bg-amber-500", "Anniversary": "bg-blue-500", "Agenda": "bg-emerald-500", "Reminder": "bg-emerald-500" };
  return map[jenis] || "bg-slate-400";
}

function renderCalendar(container) {
  container.querySelector("#cal-label").textContent = `${BULAN[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const grid = container.querySelector("#cal-grid");
  let cells = HARI.map(h => `<div class="text-center text-[11px] font-semibold text-slate-400 uppercase pb-2">${h}</div>`).join("");

  for (let i = 0; i < startOffset; i++) cells += `<div class="min-h-[84px] rounded-lg bg-slate-50/40"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const isToday = d.toDateString() === today.toDateString();
    const evs = eventsForDate(d);
    cells += `
      <div class="min-h-[84px] rounded-lg border ${isToday ? "border-maroon-300 bg-maroon-50/40" : "border-slate-100"} p-1.5 flex flex-col gap-1">
        <span class="text-xs font-semibold ${isToday ? "text-maroon-700" : "text-slate-500"}">${day}</span>
        <div class="flex flex-col gap-0.5 overflow-hidden">
          ${evs.slice(0, 2).map(e => `<span class="text-[10px] leading-tight px-1.5 py-0.5 rounded text-white truncate ${e.tone}" title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</span>`).join("")}
          ${evs.length > 2 ? `<span class="text-[10px] text-slate-400">+${evs.length - 2} lainnya</span>` : ""}
        </div>
      </div>`;
  }
  grid.innerHTML = cells;

  // upcoming list (30 hari ke depan, gabungan manual+derived tahun berjalan)
  const upcoming = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    eventsForDate(d).forEach(e => upcoming.push({ date: new Date(d), ...e }));
  }
  const upcomingEl = container.querySelector("#cal-upcoming");
  if (!upcoming.length) { upcomingEl.innerHTML = emptyState("Tidak ada agenda dalam 30 hari ke depan"); return; }
  upcomingEl.innerHTML = upcoming.map(e => `
    <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
      <div class="flex items-center gap-3">
        <span class="w-2 h-2 rounded-full ${e.tone}"></span>
        <p class="text-sm font-medium text-slate-700">${escapeHtml(e.title)}</p>
      </div>
      <span class="text-xs text-slate-400">${fmtDate(e.date)}</span>
    </div>`).join("");
}

function openAgendaModal(container) {
  openModal({
    title: "Tambah Agenda Kalender HR",
    bodyHtml: `
      <form id="agenda-form" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Judul Agenda</label>
          <input name="judul" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Tanggal Mulai</label><input type="date" name="tanggal_mulai" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></div>
          <div><label class="block text-xs font-medium text-slate-500 mb-1.5">Tanggal Selesai</label><input type="date" name="tanggal_selesai" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Jenis</label>
          <select name="jenis" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            <option>Cuti Massal</option><option>Agenda</option><option>Reminder</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Keterangan</label>
          <textarea name="keterangan" rows="2" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></textarea>
        </div>
      </form>`,
    footerHtml: `
      <button id="agenda-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="agenda-save" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition">Simpan Agenda</button>`,
    onMount: (m) => {
      m.querySelector("#agenda-cancel").onclick = closeModal;
      m.querySelector("#agenda-save").onclick = async () => {
        const form = m.querySelector("#agenda-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const data = Object.fromEntries(fd.entries());
        try {
          await fsAdd(COL.KALENDER_HR, data, genId("EVT"));
          toast("Agenda berhasil ditambahkan", "success");
          closeModal();
          events.manual.push(data);
          renderCalendar(container);
        } catch (e) { toast("Gagal menyimpan agenda: " + e.message, "error"); }
      };
    }
  });
}
