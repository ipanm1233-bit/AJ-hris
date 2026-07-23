import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fmtDateShort, escapeHtml, notifyUser, sendEmailNotif, getTargetsForRole } from "../utils.js";
import { renderCrudModule } from "../components.js";
import { isoDocHeaderTable } from "../branding.js";

export async function mount(container) {
  // Ambil Dropdown Karyawan Aktif
  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const activeEmpNames = karyawan.filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF").map(k => k.nama_karyawan).sort();

  const panels = {
    sp: container.querySelector("#pm-panel-sp"),
    panggil: container.querySelector("#pm-panel-panggil"),
  };
  const loaded = {};

  async function printSuratPanggilan(data) {
    const { downloadHtmlAsPdf, toast } = await import("../utils.js");
    toast("Sedang memproses PDF...", "info");
    let html = `
    <div style="width:100%; max-width:760px; margin:0 auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff;">
      <div style="page-break-inside:avoid; margin-bottom:15px;">
        ${isoDocHeaderTable({ judul: "SURAT PANGGILAN KARYAWAN", noDok: "HR-PGL", terbitRevisi: "1/1", hal: "1 dari 1" })}
      </div>
      <p style="margin-top:15px;">Kepada Yth,<br/>Sdr/i <strong>${escapeHtml(data.nama_karyawan)}</strong><br/>Di Tempat</p>
      <p>Dengan hormat,<br/>Bersama surat ini, kami memanggil Saudara/i untuk hadir menemui bagian HRD guna membahas perihal: <strong>${escapeHtml(data.perihal)}</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border: 1px solid #000;">
        <tr><td width="25%" style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Hari / Tanggal</td><td style="border: 1px solid #000; padding: 6px 10px;"><strong>${fmtDateShort(data.tanggal_panggilan)}</strong></td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Waktu</td><td style="border: 1px solid #000; padding: 6px 10px;"><strong>${data.waktu || "09.00 WIB"}</strong></td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Tempat</td><td style="border: 1px solid #000; padding: 6px 10px;"><strong>Ruang HRD CV Andela Jaya</strong></td></tr>
      </table>
      <p style="margin-top:15px;">Demikian surat panggilan ini disampaikan agar dapat dihadiri tepat waktu.</p>
      <table style="width:100%; text-align:center; margin-top:40px; page-break-inside:avoid; font-size:11px;">
        <tr><td width="50%"></td><td width="50%">HRD Manager,</td></tr>
        <tr><td height="60"></td><td></td></tr>
        <tr><td></td><td>( ................................. )</td></tr>
      </table>
    </div>`;
    await downloadHtmlAsPdf(html, `Surat_Panggilan_${escapeHtml(data.nama_karyawan).replace(/\s+/g, "_")}.pdf`);
    toast("PDF berhasil diunduh!", "success");
  }

  async function printSuratPeringatan(data) {
    const { downloadHtmlAsPdf, toast } = await import("../utils.js");
    toast("Sedang memproses PDF...", "info");
    let html = `
    <div style="width:100%; max-width:760px; margin:0 auto; padding:0; font-family:'Times New Roman', Times, serif; font-size:11px; line-height:1.35; color:#000; background:#ffffff;">
      <div style="page-break-inside:avoid; margin-bottom:15px;">
        ${isoDocHeaderTable({ judul: `SURAT PERINGATAN (SP ${data.tingkat_sp.replace(/[^0-9]/g, '') || "1"})`, noDok: "HR-SP", terbitRevisi: "1/1", hal: "1 dari 1" })}
      </div>
      <p style="margin-top:15px;">Diberikan kepada:</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid #000;">
        <tr><td width="25%" style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Nama Karyawan</td><td style="border: 1px solid #000; padding: 6px 10px;"><strong>${escapeHtml(data.nama_karyawan)}</strong></td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Tingkat Sanksi</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.tingkat_sp)}</td></tr>
        <tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Masa Berlaku</td><td style="border: 1px solid #000; padding: 6px 10px;">${fmtDateShort(data.tanggal)} s/d ${fmtDateShort(data.masa_berlaku)}</td></tr>
      </table>
      <p>Surat Peringatan ini dikeluarkan sehubungan dengan tindakan pelanggaran tata tertib perusahaan yang Saudara/i lakukan, yaitu:</p>
      <div style="padding: 10px; border: 1px solid #000; min-height: 50px; margin-top: 5px; margin-bottom: 15px;">${escapeHtml(data.pelanggaran || data.keterangan)}</div>
      <p>Diharapkan Saudara/i dapat memperbaiki kinerja dan tidak mengulangi pelanggaran tersebut.</p>
      <table style="width:100%; text-align:center; margin-top:40px; page-break-inside:avoid; font-size:11px;">
        <tr><td width="50%">Karyawan Ybs,</td><td width="50%">HRD Manager,</td></tr>
        <tr><td height="60"></td><td></td></tr>
        <tr><td>( <strong>${escapeHtml(data.nama_karyawan)}</strong> )</td><td>( ................................. )</td></tr>
      </table>
    </div>`;
    await downloadHtmlAsPdf(html, `Surat_Peringatan_${escapeHtml(data.nama_karyawan).replace(/\s+/g, "_")}.pdf`);
    toast("PDF berhasil diunduh!", "success");
  }

  async function loadSP() {
    await renderCrudModule(panels.sp, {
      title: "Log SP & Konseling",
      collectionName: COL.LOG_SP_KONSELING,
      idPrefix: "SP", printFn: printSuratPeringatan, printLabel: "Cetak Surat SP (PDF)",
      searchFields: ["nama_karyawan", "pelanggaran"],
      columns: [
        { key: "tanggal", label: "Tanggal", type: "date" },
        { key: "nama_karyawan", label: "Nama Karyawan" },
        { key: "tingkat_sp", label: "Tingkat", type: "badge" },
        { key: "pelanggaran", label: "Pelanggaran" }
      ],
      formFields: [
        { name: "tanggal", label: "Tanggal Dikeluarkan", type: "date", required: true },
        { name: "nama_karyawan", label: "Nama Karyawan", type: "select", options: activeEmpNames, required: true },
        { name: "tingkat_sp", label: "Tingkat Peringatan", type: "select", options: ["Teguran Lisan", "SP 1", "SP 2", "SP 3", "Konseling"], required: true },
        { name: "pelanggaran", label: "Deskripsi Pelanggaran", type: "textarea", full: true, required: true },
        { name: "masa_berlaku", label: "Masa Berlaku Sanksi Hingga", type: "date" },
      ],
      afterSave: async (data, isNew) => {
        if (!isNew) return;
        const docId = data.id || `SP_${Date.now()}`;
        const docJudul = `SURAT PERINGATAN (${data.tingkat_sp || "SP"}) - ${data.pelanggaran || "-"}`;
        
        await fsAdd(COL.SIGN_DOCUMENTS, {
          id: docId,
          judul: docJudul,
          nama_penerima: data.nama_karyawan,
          tanggal_buat: data.tanggal || new Date().toISOString().substring(0, 10),
          status: "PENDING",
          file_url: "#"
        }, docId).catch(() => {});

        const targets = await getTargetsForRole("PEMOHON", data.nama_karyawan);
        for (const t of targets) {
          await notifyUser(
            t.username,
            `⚠️ Surat Peringatan (${data.tingkat_sp || 'SP'}) Diterbitkan`,
            `Anda menerima ${data.tingkat_sp || 'Surat Peringatan'}: ${data.pelanggaran || '-'}. Klik untuk membaca & TTD digital.`,
            `#profile?tab=documents&doc_id=${docId}`
          );
          if (t.email) await sendEmailNotif(t.email, "Surat Peringatan dari HRD", `<p>Anda menerima dokumen baru dari HRD: <b>${escapeHtml(docJudul)}</b>. Silakan login ke aplikasi untuk TTD digital.</p>`);
        }
      }
    });
  }

  async function loadPanggil() {
    await renderCrudModule(panels.panggil, {
      title: "Data Pemanggilan Karyawan",
      collectionName: COL.DATA_PEMANGGILAN,
      idPrefix: "PGL", printFn: printSuratPanggilan, printLabel: "Cetak Surat Panggilan (PDF)",
      searchFields: ["nama_karyawan", "perihal"],
      columns: [
        { key: "tanggal_panggilan", label: "Tgl Panggilan", type: "date" },
        { key: "nama_karyawan", label: "Nama Karyawan" },
        { key: "perihal", label: "Perihal" },
        { key: "status", label: "Kehadiran", type: "badge" },
      ],
      formFields: [
        { name: "nama_karyawan", label: "Nama Karyawan", type: "select", options: activeEmpNames, required: true },
        { name: "tanggal_panggilan", label: "Tanggal Pertemuan", type: "date", required: true },
        { name: "waktu", label: "Jam (Cth: 09:00)", type: "text", default: "09:00" },
        { name: "perihal", label: "Perihal Pemanggilan", type: "text", full: true, required: true },
        { name: "status", label: "Status Kehadiran", type: "select", options: ["Menunggu", "Hadir", "Mangkir"], default: "Menunggu" }
      ],
      afterSave: async (data, isNew) => {
        if (!isNew) return;
        const docId = data.id || `PGL_${Date.now()}`;
        const docJudul = `SURAT PEMANGGILAN KARYAWAN - ${data.perihal || "-"}`;
        
        await fsAdd(COL.SIGN_DOCUMENTS, {
          id: docId,
          judul: docJudul,
          nama_penerima: data.nama_karyawan,
          tanggal_buat: data.tanggal_panggilan || new Date().toISOString().substring(0, 10),
          status: "PENDING",
          file_url: "#"
        }, docId).catch(() => {});

        const targets = await getTargetsForRole("PEMOHON", data.nama_karyawan);
        for (const t of targets) {
          await notifyUser(
            t.username,
            "📩 Surat Pemanggilan Karyawan Diterbitkan",
            `Anda menerima Surat Pemanggilan perihal: ${data.perihal || '-'}. Klik untuk membaca & TTD digital.`,
            `#profile?tab=documents&doc_id=${docId}`
          );
          if (t.email) await sendEmailNotif(t.email, "Surat Pemanggilan dari HRD", `<p>Anda menerima Surat Pemanggilan HRD perihal: <b>${escapeHtml(data.perihal || "-")}</b>. Silakan login ke aplikasi untuk TTD digital.</p>`);
        }
      }
    });
  }

  await loadSP(); loaded.sp = true;
  container.querySelectorAll(".pm-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ptab;
      Object.keys(panels).forEach(k => panels[k].classList.toggle("hidden", k !== tab));
      container.querySelectorAll(".pm-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn); b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn); b.classList.toggle("text-slate-500", b !== btn);
      });
      if (!loaded[tab]) { loaded[tab] = true; await loadPanggil(); }
    });
  });

  return { unmount() {} };
}
