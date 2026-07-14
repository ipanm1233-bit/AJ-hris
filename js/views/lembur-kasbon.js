import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container) {
  const panels = {
    lembur: container.querySelector("#lb-panel-lembur"),
    kasbon: container.querySelector("#lb-panel-kasbon"),
  };
  const loaded = {};

  function makeCfg(keyword, title) {
    return {
      title,
      subtitle: "Data bersumber dari Katalog Pengajuan ISO (read-only, kelola persetujuan di menu Antrean Persetujuan).",
      collectionName: COL.DATA_PENGAJUAN,
      canCreate: false, canEdit: false, canDelete: false,
      searchFields: ["nama_pemohon", "nama_form"],
      emptyMessage: `Belum ada pengajuan ${title.toLowerCase()}`,
      filterFn: (r) => (r.nama_form || "").toLowerCase().includes(keyword),
      columns: [
        { key: "id", label: "No. Transaksi" },
        { key: "tgl", label: "Tanggal", type: "date" },
        { key: "nama_pemohon", label: "Pemohon" },
        { key: "nama_form", label: "Jenis Form" },
        { key: "status_final", label: "Status", type: "badge", badgeTone: (v) => (v || "").includes("APPROVED") ? "green" : (v || "").includes("REJECT") ? "red" : "amber" },
      ]
    };
  }

  await renderCrudModule(panels.lembur, makeCfg("lembur", "Rekap Pengajuan Lembur"));
  loaded.lembur = true;

  container.querySelectorAll(".lb-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ltab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".lb-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) { loaded[tab] = true; await renderCrudModule(panels.kasbon, makeCfg("kasbon", "Rekap Pengajuan Kasbon")); }
    });
  });

  return { unmount() {} };
}
