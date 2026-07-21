import { db, collection, getDocs, addDoc, doc, updateDoc } from "../firebase-config.js";
import { openModal, closeModal, toast, genId, escapeHtml, fmtDateShort } from "../utils.js";
import { emptyState } from "../components.js";

const COL_TASKS = "sales_tasks";
const COL_OUTLETS = "sales_outlets";

const DEFAULT_TASKS = [
  { no_task: "TSK-001", outlet_id: "OT-002", outlet_nama: "Mirota Kampus Godean", tanggal_rencana: "2026-07-21", salesperson: "Andika Putera", agenda: "Penagihan Invoice jatuh tempo & cek ketersediaan stok Berkas Wangi.", status: "PENDING", catatan_kunjungan: "", tanggal_selesai: "" },
  { no_task: "TSK-002", outlet_id: "OT-001", outlet_nama: "Supermarket Pamella 1", tanggal_rencana: "2026-07-20", salesperson: "Andika Putera", agenda: "Pengenalan sampel produk Gula Premium kemasan baru 1kg.", status: "COMPLETED", catatan_kunjungan: "Mitra sangat tertarik dengan kemasan baru dan berminat order 50 karton minggu depan.", tanggal_selesai: "2026-07-20T11:20:00.000Z" },
  { no_task: "TSK-003", outlet_id: "OT-003", outlet_nama: "Toko Kelontong Berkah", tanggal_rencana: "2026-07-22", salesperson: "Bambang Wijaya", agenda: "Follow up penawaran paket sembako murah untuk bazar Agustus.", status: "PENDING", catatan_kunjungan: "", tanggal_selesai: "" }
];

export async function mount(container, { session }) {
  const listPending = container.querySelector("#list-pending");
  const listCompleted = container.querySelector("#list-completed");
  const countPending = container.querySelector("#count-pending");
  const countCompleted = container.querySelector("#count-completed");
  const btnAddTask = container.querySelector("#btn-add-task");

  let tasksList = [];
  let outletsList = [];

  async function loadData() {
    listPending.innerHTML = "<div class='text-center py-6 text-slate-400 text-xs'>Memuat agenda...</div>";
    listCompleted.innerHTML = "<div class='text-center py-6 text-slate-400 text-xs'>Memuat riwayat...</div>";

    try {
      // 1. Load Outlets
      const outletSnap = await getDocs(collection(db, COL_OUTLETS));
      outletsList = outletSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. Load Tasks
      const taskSnap = await getDocs(collection(db, COL_TASKS));
      tasksList = taskSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (tasksList.length === 0) {
        for (const task of DEFAULT_TASKS) {
          await addDoc(collection(db, COL_TASKS), task);
        }
        const reloadSnap = await getDocs(collection(db, COL_TASKS));
        tasksList = reloadSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      renderLists();
    } catch (e) {
      console.error(e);
      listPending.innerHTML = `<div class='text-center py-6 text-rose-500 text-xs'>Error: ${e.message}</div>`;
      listCompleted.innerHTML = `<div class='text-center py-6 text-rose-500 text-xs'>Error: ${e.message}</div>`;
    }
  }

  function renderLists() {
    const pending = tasksList.filter(t => t.status === "PENDING").sort((a, b) => new Date(a.tanggal_rencana) - new Date(b.tanggal_rencana));
    const completed = tasksList.filter(t => t.status === "COMPLETED").sort((a, b) => new Date(b.tanggal_selesai) - new Date(a.tanggal_selesai));

    countPending.textContent = pending.length;
    countCompleted.textContent = completed.length;

    // 1. Render Pending
    if (pending.length === 0) {
      listPending.innerHTML = emptyState("Tidak ada agenda tertunda", "Semua kunjungan Anda telah selesai atau terjadwal ulang.");
    } else {
      listPending.innerHTML = pending.map(t => `
        <div class="bg-white rounded-xl border border-slate-100 shadow-xs p-4 space-y-3 hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[10px] font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded">${escapeHtml(t.no_task)}</span>
            <span class="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded">Rencana: ${t.tanggal_rencana}</span>
          </div>
          <div>
            <h4 class="font-bold text-slate-800 text-xs">${escapeHtml(t.outlet_nama)}</h4>
            <p class="text-[11px] text-slate-500 mt-1 leading-relaxed">${escapeHtml(t.agenda)}</p>
          </div>
          <div class="border-t border-slate-50 pt-3 flex items-center justify-between">
            <span class="text-[10px] font-semibold text-slate-400">Sales: ${escapeHtml(t.salesperson.split(" ")[0])}</span>
            <button data-id="${t.id}" class="btn-complete-task text-[10px] bg-maroon-700 hover:bg-maroon-800 text-white font-bold px-2.5 py-1.5 rounded transition">
              Selesaikan Kunjungan
            </button>
          </div>
        </div>
      `).join("");

      listPending.querySelectorAll(".btn-complete-task").forEach(btn => {
        btn.onclick = () => {
          const task = tasksList.find(x => x.id === btn.dataset.id);
          if (task) openCompleteTaskModal(task);
        };
      });
    }

    // 2. Render Completed
    if (completed.length === 0) {
      listCompleted.innerHTML = emptyState("Belum ada kunjungan selesai", "Selesaikan kunjungan lapangan hari ini untuk mengisi log.");
    } else {
      listCompleted.innerHTML = completed.map(t => {
        const checkinDate = new Date(t.tanggal_selesai).toLocaleDateString("id-ID", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
        return `
          <div class="bg-white rounded-xl border border-slate-100 shadow-xs p-4 space-y-3 hover:border-slate-200 transition">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(t.outlet_nama)}</h4>
                <p class="text-xs text-slate-500 mt-1">Agenda: <span class="italic text-slate-600">${escapeHtml(t.agenda)}</span></p>
              </div>
              <div class="text-right">
                <span class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Selesai Kunjungan</span>
                <span class="text-[10px] text-slate-400 block mt-1">${checkinDate}</span>
              </div>
            </div>
            <div class="bg-slate-50/50 rounded-lg p-3 border border-slate-100 text-xs text-slate-600 leading-relaxed">
              <span class="font-bold text-slate-700 block mb-1">📝 Laporan Hasil Lapangan:</span>
              ${escapeHtml(t.catatan_kunjungan || "Tidak ada catatan tambahan.")}
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50 pt-2">
              <span>Salesperson: <b>${escapeHtml(t.salesperson)}</b></span>
              <span class="font-mono text-[10px]">${escapeHtml(t.no_task)}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  function openCompleteTaskModal(task) {
    openModal({
      title: "Laporan Kunjungan Selesai",
      size: "md",
      bodyHtml: `
        <form id="form-complete" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Outlet Mitra</label>
            <input type="text" readonly value="${escapeHtml(task.outlet_nama)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-100 bg-slate-100 text-slate-500 font-medium">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Hasil Lapangan / Feedback Outlet</label>
            <textarea id="task-catatan" required rows="4" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Tuliskan info stok, nota tagihan, tanggapan pemilik, atau pesanan baru..."></textarea>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-complete" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-complete" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md">Kirim Laporan</button>
      `,
      onMount: (m) => {
        m.querySelector("#btn-cancel-complete").onclick = closeModal;
        m.querySelector("#btn-save-complete").onclick = async () => {
          const form = m.querySelector("#form-complete");
          if (!form.reportValidity()) return;

          const catatan = m.querySelector("#task-catatan").value.trim();
          const btn = m.querySelector("#btn-save-complete");
          btn.disabled = true;
          btn.innerHTML = "Menyimpan...";

          try {
            await updateDoc(doc(db, COL_TASKS, task.id), {
              status: "COMPLETED",
              catatan_kunjungan: catatan,
              tanggal_selesai: new Date().toISOString()
            });

            toast("Kunjungan diselesaikan dengan sukses!", "success");
            closeModal();
            loadData();
          } catch (err) {
            toast(`Gagal menyimpan laporan: ${err.message}`, "error");
            btn.disabled = false;
            btn.innerHTML = "Kirim Laporan";
          }
        };
      }
    });
  }

  btnAddTask.onclick = () => {
    if (outletsList.length === 0) {
      toast("Master Outlet kosong! Daftarkan outlet terlebih dahulu.", "warning");
      return;
    }

    openModal({
      title: "Tambah Agenda Kunjungan Baru",
      size: "md",
      bodyHtml: `
        <form id="form-task-new" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Pilih Outlet Target</label>
            <select name="outlet_id" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition bg-white">
              <option value="">-- Pilih Outlet --</option>
              ${outletsList.map(o => `<option value="${o.id}">${escapeHtml(o.nama)} (${escapeHtml(o.wilayah)})</option>`).join("")}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Kunjungan</label>
              <input type="date" name="tanggal_rencana" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Salesperson</label>
              <input type="text" name="salesperson" readonly value="${escapeHtml(session.nama)}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-100 bg-slate-100 text-slate-500 font-medium">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">Agenda / Kegiatan Kunjungan</label>
            <textarea name="agenda" required rows="3" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none transition" placeholder="Contoh: Cek stok fisik bulanan, promosi teh sachet baru, dsb."></textarea>
          </div>
        </form>
      `,
      footerHtml: `
        <button id="btn-cancel-task" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
        <button id="btn-save-task" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md">Simpan Agenda</button>
      `,
      onMount: (m) => {
        // Default date to tomorrow
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        m.querySelector('input[type="date"]').value = tom.toISOString().split('T')[0];

        m.querySelector("#btn-cancel-task").onclick = closeModal;
        m.querySelector("#btn-save-task").onclick = async () => {
          const form = m.querySelector("#form-task-new");
          if (!form.reportValidity()) return;

          const fd = new FormData(form);
          const outletId = fd.get("outlet_id");
          const outlet = outletsList.find(x => x.id === outletId);

          const btn = m.querySelector("#btn-save-task");
          btn.disabled = true;
          btn.innerHTML = "Menyimpan...";

          try {
            const nextCode = `TSK-${String(tasksList.length + 1).padStart(3, '0')}`;
            const payload = {
              no_task: nextCode,
              outlet_id: outlet.id,
              outlet_nama: outlet.nama,
              tanggal_rencana: fd.get("tanggal_rencana"),
              salesperson: fd.get("salesperson"),
              agenda: fd.get("agenda"),
              status: "PENDING",
              catatan_kunjungan: "",
              tanggal_selesai: ""
            };

            await addDoc(collection(db, COL_TASKS), payload);
            toast("Agenda kunjungan baru berhasil didaftarkan!", "success");
            closeModal();
            loadData();
          } catch (err) {
            toast(`Gagal menambahkan: ${err.message}`, "error");
            btn.disabled = false;
            btn.innerHTML = "Simpan Agenda";
          }
        };
      }
    });
  };

  await loadData();
  return { unmount() {} };
}
