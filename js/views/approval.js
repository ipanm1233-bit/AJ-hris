import { db, COL, collection, query, where, getDocs } from "../firebase-config.js";
import { fsGetAll, fsUpdate, openModal, closeModal, toast, fmtDateTime, escapeHtml } from "../utils.js";
import { icon, badge, emptyState, skeletonRows } from "../components.js";

let allPengajuan = [], karyawanByNama = {};

export async function mount(container, { session }) {
  const listEl = container.querySelector("#approval-list");
  listEl.innerHTML = skeletonRows(3);

  const [pengajuanRows, karyawanRows] = await Promise.all([
    fsGetAll(COL.DATA_PENGAJUAN),
    fsGetAll(COL.MASTER_KARYAWAN)
  ]);
  allPengajuan = pengajuanRows;
  karyawanByNama = Object.fromEntries(karyawanRows.map(k => [k.nama_karyawan, k]));

  let activeTab = "pending";
  renderList(container, session, activeTab);

  container.querySelectorAll(".approval-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      container.querySelectorAll(".approval-tab-btn").forEach(b => {
        b.classList.toggle("bg-maroon-700", b === btn);
        b.classList.toggle("text-white", b === btn);
        b.classList.toggle("text-slate-600", b !== btn);
      });
      renderList(container, session, activeTab);
    });
  });

  return { unmount() {} };
}

function currentStepIndex(row) {
  const steps = row.approval_steps || [];
  return steps.findIndex(s => s === "PENDING");
}

function isEligible(row, session) {
  const idx = currentStepIndex(row);
  if (idx === -1) return false;
  const stepLabel = (row.approval_flow || [])[idx];
  if (!stepLabel) return false;
  if (stepLabel.toUpperCase() === "ATASAN") {
    const pemohon = karyawanByNama[row.nama_pemohon];
    return pemohon && pemohon.atasan === session.nama;
  }
  return stepLabel.toUpperCase() === session.role.toUpperCase();
}

function renderList(container, session, tab) {
  const listEl = container.querySelector("#approval-list");
  let rows;
  if (tab === "pending") {
    rows = allPengajuan.filter(r => r.status_final === "MENUNGGU" && isEligible(r, session));
  } else {
    rows = allPengajuan.filter(r => (r.catatan_penolakan || []).some(c => c.includes(session.nama)));
  }
  rows.sort((a, b) => new Date(b.tgl) - new Date(a.tgl));

  if (!rows.length) {
    listEl.innerHTML = emptyState(tab === "pending" ? "Tidak ada pengajuan menunggu persetujuan Anda" : "Belum ada riwayat proses persetujuan", "Semua sudah beres!");
    return;
  }

  listEl.innerHTML = rows.map(r => {
    const idx = currentStepIndex(r);
    const tone = r.status_final?.includes("APPROVED") ? "green" : r.status_final?.includes("REJECT") ? "red" : "amber";
    return `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="font-semibold text-slate-800">${escapeHtml(r.nama_form)}</p>
          <p class="text-sm text-slate-500 mt-0.5">Diajukan oleh <span class="font-medium text-slate-700">${escapeHtml(r.nama_pemohon)}</span> • ${fmtDateTime(r.tgl)}</p>
        </div>
        ${badge(r.status_final, tone)}
      </div>

      <div class="flex items-center gap-2 mt-4 flex-wrap">
        ${(r.approval_flow || []).map((step, i) => {
          const st = (r.approval_steps || [])[i];
          const cls = st === "APPROVE" ? "bg-emerald-100 text-emerald-700" : st === "REJECT" ? "bg-red-100 text-red-700" : i === idx ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" : "bg-slate-100 text-slate-400";
          return `<span class="px-2.5 py-1 rounded-full text-xs font-medium ${cls}">${i + 1}. ${escapeHtml(step)}</span>`;
        }).join('<span class="text-slate-300">→</span>')}
      </div>

      <div class="mt-4 flex items-center justify-between">
        <button data-detail="${r.id}" class="text-xs text-maroon-700 font-medium hover:underline">Lihat Detail Pengajuan</button>
        ${tab === "pending" ? `
        <div class="flex gap-2">
          <button data-reject="${r.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition">Tolak</button>
          <button data-approve="${r.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-maroon-700 text-white hover:bg-maroon-800 transition">Setujui</button>
        </div>` : ""}
      </div>
    </div>`;
  }).join("");

  listEl.querySelectorAll("[data-detail]").forEach(btn => btn.addEventListener("click", () => showDetail(rows.find(r => r.id === btn.dataset.detail))));
  listEl.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => actionModal(rows.find(r => r.id === btn.dataset.approve), "APPROVE", session, container, tab)));
  listEl.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", () => actionModal(rows.find(r => r.id === btn.dataset.reject), "REJECT", session, container, tab)));
}

function showDetail(row) {
  const detail = row.detail || {};
  const body = `
    <div class="space-y-3">
      ${Object.entries(detail).map(([k, v]) => `
        <div class="flex justify-between gap-4 text-sm border-b border-slate-50 pb-2">
          <span class="text-slate-500 capitalize">${escapeHtml(k.replace(/_/g, " "))}</span>
          <span class="text-slate-800 font-medium text-right">${escapeHtml(String(v))}</span>
        </div>`).join("")}
    </div>`;
  openModal({ title: `Detail — ${row.nama_form}`, bodyHtml: body, size: "md" });
}

function actionModal(row, action, session, container, tab) {
  const isApprove = action === "APPROVE";
  openModal({
    title: isApprove ? "Setujui Pengajuan" : "Tolak Pengajuan",
    bodyHtml: `
      <p class="text-sm text-slate-600 mb-3">Anda akan <b>${isApprove ? "menyetujui" : "menolak"}</b> pengajuan <b>${escapeHtml(row.nama_form)}</b> dari <b>${escapeHtml(row.nama_pemohon)}</b>. Ini bertindak sebagai tanda tangan digital Anda.</p>
      <textarea id="action-note" rows="3" placeholder="Catatan (opsional)" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition"></textarea>`,
    footerHtml: `
      <button id="action-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="action-confirm" class="px-4 py-2 rounded-lg text-sm font-medium text-white ${isApprove ? "bg-maroon-700 hover:bg-maroon-800" : "bg-red-700 hover:bg-red-800"} transition">${isApprove ? "Ya, Setujui" : "Ya, Tolak"}</button>`,
    onMount: (m) => {
      m.querySelector("#action-cancel").onclick = closeModal;
      m.querySelector("#action-confirm").onclick = async () => {
        const note = m.querySelector("#action-note").value.trim() || "ok";
        await processAction(row, action, note, session);
        closeModal();
        renderList(container, session, tab);
      };
    }
  });
}

async function processAction(row, action, note, session) {
  const idx = currentStepIndex(row);
  const steps = [...(row.approval_steps || [])];
  steps[idx] = action;

  let statusFinal = row.status_final;
  if (action === "REJECT") {
    statusFinal = "REJECTED";
  } else if (idx === steps.length - 1) {
    statusFinal = "APPROVED FINAL";
  } else {
    statusFinal = "MENUNGGU";
  }

  const catatan = [...(row.catatan_penolakan || []), `[${session.nama} - ${action}]: ${note}`];

  try {
    await fsUpdate(COL.DATA_PENGAJUAN, row.id, { approval_steps: steps, status_final: statusFinal, catatan_penolakan: catatan });
    // update local cache
    Object.assign(row, { approval_steps: steps, status_final: statusFinal, catatan_penolakan: catatan });
    toast(action === "APPROVE" ? "Pengajuan disetujui" : "Pengajuan ditolak", action === "APPROVE" ? "success" : "warning");
  } catch (e) {
    console.error(e);
    toast("Gagal memproses persetujuan: " + e.message, "error");
  }
}
