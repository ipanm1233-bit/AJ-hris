import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, genId, escapeHtml, fmtDateTime } from "../utils.js";
import { avatar, badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const listEl = container.querySelector("#bc-list");
  listEl.innerHTML = skeletonRows(3);

  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const users = await fsGetAll(COL.USERS);

  async function load() {
    const rows = await fsGetAll(COL.BROADCAST);
    rows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    if (!rows.length) { listEl.innerHTML = emptyState("Belum ada memo yang diterbitkan"); return; }
    listEl.innerHTML = rows.map(r => `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div class="flex items-start gap-3">
          ${avatar(r.dibuat_oleh || "?", "w-10 h-10")}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <p class="font-semibold text-slate-800">${escapeHtml(r.judul)}</p>
              <span class="text-xs text-slate-400">${fmtDateTime(r.tanggal)}</span>
            </div>
            <p class="text-sm text-slate-600 mt-1.5 whitespace-pre-line">${escapeHtml(String(r.isi || "").replace(/<[^>]+>/g, ""))}</p>
            <div class="flex items-center gap-2 mt-3">
              ${badge(r.target_type === "SPESIFIK" ? `${(r.target_list || []).length} Karyawan Terpilih` : "Seluruh Karyawan", "maroon")}
              <span class="text-xs text-slate-400">oleh ${escapeHtml(r.dibuat_oleh || "-")}</span>
            </div>
          </div>
        </div>
      </div>`).join("");
  }
  await load();

  container.querySelector("#bc-new").addEventListener("click", () => openComposeModal(container, session, karyawan, users, load));
  return { unmount() {} };
}

function openComposeModal(container, session, karyawan, users, reload) {
  openModal({
    title: "Buat Memo Baru",
    size: "lg",
    bodyHtml: `
      <form id="bc-form" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Judul Memo</label>
          <input name="judul" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Isi Pengumuman</label>
          <textarea name="isi" rows="4" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none"></textarea>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Target Penerima</label>
          <select id="bc-target-type" name="target_type" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            <option value="ALL">Seluruh Karyawan</option>
            <option value="SPESIFIK">Karyawan Tertentu</option>
          </select>
        </div>
        <div id="bc-target-list-wrap" class="hidden">
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih Karyawan (bisa lebih dari satu)</label>
          <select id="bc-target-list" name="target_list" multiple size="6" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            ${karyawan.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Lampiran URL (opsional)</label>
          <input name="lampiran_url" placeholder="https://..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
      </form>`,
    footerHtml: `
      <button id="bc-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="bc-send" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition">Kirim Memo</button>`,
    onMount: (m) => {
      m.querySelector("#bc-target-type").addEventListener("change", (e) => {
        m.querySelector("#bc-target-list-wrap").classList.toggle("hidden", e.target.value !== "SPESIFIK");
      });
      m.querySelector("#bc-cancel").onclick = closeModal;
      m.querySelector("#bc-send").onclick = async () => {
        const form = m.querySelector("#bc-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const targetType = fd.get("target_type");
        const targetList = targetType === "SPESIFIK" ? Array.from(m.querySelector("#bc-target-list").selectedOptions).map(o => o.value) : [];
        const payload = {
          judul: fd.get("judul"), isi: fd.get("isi"), target_type: targetType,
          target_list: targetList, lampiran_url: fd.get("lampiran_url") || null,
          tanggal: new Date().toISOString(), dibuat_oleh: session.nama
        };
        try {
          const id = genId("BC");
          await fsAdd(COL.BROADCAST, payload, id);
          // Fan-out notifikasi sistem ke penerima
          const targets = targetType === "ALL" ? users.map(u => u.id) : targetList.map(n => users.find(u => u.nama === n)?.id).filter(Boolean);
          await Promise.all(targets.map(uname => fsAdd(COL.NOTIFICATIONS, {
            username_target: uname, judul: `Memo Baru: ${payload.judul}`, pesan: payload.isi, dibaca: false, tanggal: payload.tanggal
          }, genId("NTF"))));
          toast("Memo berhasil dikirim & notifikasi telah dipicu", "success");
          closeModal();
          reload();
        } catch (e) { toast("Gagal mengirim memo: " + e.message, "error"); }
      };
    }
  });
}
