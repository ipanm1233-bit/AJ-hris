import { db, COL, collection, query, where, getDocs } from "../firebase-config.js";
import { fsGetAll, smartParseDate, escapeHtml } from "../utils.js";
import { renderTimeline, badge, skeletonRows } from "../components.js";
import { MANAJEMEN_ROLES } from "../auth.js";

export async function mount(container, { session, params }) {
  const isMgmt = MANAJEMEN_ROLES.includes(session.role) || session.role === "HRD";
  let targetNama = session.nama;

  if (isMgmt) {
    const pickerWrap = container.querySelector("#riwayat-employee-picker");
    pickerWrap.classList.remove("hidden");
    const karyawanList = await fsGetAll(COL.MASTER_KARYAWAN);
    pickerWrap.innerHTML = `
      <select id="riwayat-select-emp" class="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none min-w-[220px]">
        <option value="${session.nama}">Saya (${session.nama})</option>
        ${karyawanList.filter(k => k.nama_karyawan && k.nama_karyawan !== session.nama).map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)}</option>`).join("")}
      </select>`;
    const paramNama = params?.get?.("nama");
    if (paramNama) { targetNama = paramNama; pickerWrap.querySelector("select").value = paramNama; }
    pickerWrap.querySelector("select").addEventListener("change", (e) => loadTimeline(container, e.target.value));
  }

  await loadTimeline(container, targetNama);
  return { unmount() {} };
}

async function loadTimeline(container, nama) {
  const timelineEl = container.querySelector("#riwayat-timeline");
  const summaryEl = container.querySelector("#riwayat-summary");
  timelineEl.innerHTML = skeletonRows(4);
  summaryEl.innerHTML = "";

  const [pengajuan, sp, pemanggilan, broadcasts] = await Promise.all([
    safeQuery(COL.DATA_PENGAJUAN, "nama_pemohon", nama),
    safeQuery(COL.LOG_SP_KONSELING, "nama_karyawan", nama),
    safeQuery(COL.DATA_PEMANGGILAN, "nama_karyawan", nama),
    fsGetAll(COL.BROADCAST).catch(() => [])
  ]);

  const items = [];

  pengajuan.forEach(r => items.push({
    date: r.tgl, type: "pengajuan",
    title: `Pengajuan: ${r.nama_form || r.form_id || "-"}`,
    desc: r.id,
    status: r.status_final || "MENUNGGU",
    tone: (r.status_final || "").includes("APPROVED") ? "green" : (r.status_final || "").includes("REJECT") ? "red" : "amber"
  }));

  sp.forEach(r => items.push({
    date: r.tanggal, type: (r.jenis || "").toLowerCase().includes("konseling") ? "konseling" : "sp",
    title: `${r.jenis || "Surat Peringatan"}`,
    desc: r.alasan || r.catatan || "",
    status: r.status || "-",
    tone: "red"
  }));

  pemanggilan.forEach(r => items.push({
    date: r.tanggal, type: "pemanggilan",
    title: `Pemanggilan: ${r.jenis_pemanggilan || "-"}`,
    desc: r.alasan || "",
    status: r.status || "-",
    tone: "amber"
  }));

  broadcasts
    .filter(b => b.target_type === "ALL" || (Array.isArray(b.target_list) && b.target_list.includes(nama)))
    .forEach(r => items.push({
      date: r.tanggal, type: "memo",
      title: `Memo: ${r.judul || "-"}`,
      desc: String(r.isi || "").replace(/<[^>]+>/g, "").slice(0, 100),
      status: null
    }));

  items.sort((a, b) => (smartParseDate(b.date)?.getTime() || 0) - (smartParseDate(a.date)?.getTime() || 0));

  summaryEl.innerHTML = [
    { label: "Total Pengajuan", val: pengajuan.length, tone: "blue" },
    { label: "SP / Konseling", val: sp.length, tone: "red" },
    { label: "Pemanggilan", val: pemanggilan.length, tone: "amber" },
    { label: "Memo Diterima", val: items.filter(i => i.type === "memo").length, tone: "maroon" }
  ].map(s => `
    <div class="bg-white rounded-xl border border-slate-100 p-4 text-center">
      <p class="text-2xl font-bold text-slate-800">${s.val}</p>
      <p class="text-xs text-slate-400 mt-1">${s.label}</p>
    </div>`).join("");

  renderTimeline(timelineEl, items);
}

async function safeQuery(colName, field, value) {
  try {
    const q = query(collection(db, colName), where(field, "==", value));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { return []; }
}
