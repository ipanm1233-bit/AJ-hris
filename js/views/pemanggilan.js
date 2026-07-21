import { COL } from "../firebase-config.js";
import { fsGetAll, fmtDateShort, escapeHtml, notifyUser, sendEmailNotif, getTargetsForRole } from "../utils.js";
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
    <div style="font-family: 'Times New Roman', serif; font-size: 14px; padding: 20px; line-height: 1.5; color: #000; background: #fff;">
      ${isoDocHeaderTable({ judul: "SURAT PANGGILAN KARYAWAN", noDok: "HR-PGL", terbitRevisi: "1/1", hal: "1 dari 1" })}
      <br/><p>Kepada Yth,<br/>Sdr/i <strong>${escapeHtml(data.nama_karyawan)}</strong><br/>Di Tempat</p>
      <p>Dengan hormat,<br/>Bersama surat ini, kami memanggil Saudara/i untuk hadir menemui bagian HRD guna membahas perihal: <strong>${escapeHtml(data.perihal)}</strong>.</p>
      <table style="width: 100%; margin-top: 20px;">
        <tr><td width="20%" style="padding: 4px 8px;">Hari/Tanggal</td><td width="2%" style="padding: 4px 8px;">:</td><td style="padding: 4px 8px;"><strong>${fmtDateShort(data.tanggal_panggilan)}</strong></td></tr>
        <tr><td style="padding: 4px 8px;">Waktu</td><td style="padding: 4px 8px;">:</td><td style="padding: 4px 8px;"><strong>${data.waktu || "09.00 WIB"}</strong></td></tr>
        <tr><td style="padding: 4px 8px;">Tempat</td><td style="padding: 4px 8px;">:</td><td style="padding: 4px 8px;"><strong>Ruang HRD CV Andela Jaya</strong></td></tr>
      </table>
      <p>Demikian surat panggilan ini disampaikan agar dapat dihadiri tepat waktu.</p>
      <table style="width:100%; text-align:center; margin-top:40px;">
        <tr><td width="50%"></td><td width="50%">HRD Manager,</td></tr><tr><td height="80"></td><td></td></tr>
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
    <div style="font-family: 'Times New Roman', serif; font-size: 14px; padding: 20px; line-height: 1.5; color: #000; background: #fff;">
      ${isoDocHeaderTable({ judul: `SURAT PERINGATAN (SP ${data.tingkat_sp.replace(/[^0-9]/g, '')})`, noDok: "HR-SP", terbitRevisi: "1/1", hal: "1 dari 1" })}
      <br/><h3 style="text-align:center; text-decoration:underline;">SURAT PERINGATAN</h3>
      <p>Diberikan kepada:</p>
      <table style="width: 100%;"><tr><td width="20%">Nama</td><td width="2%">:</td><td><strong>${escapeHtml(data.nama_karyawan)}</strong></td></tr></table>
      <p>Surat Peringatan ini dikeluarkan sehubungan dengan tindakan pelanggaran tata tertib perusahaan yang Saudara/i lakukan, yaitu:</p>
      <div style="padding: 10px; border: 1px solid #000; min-height: 60px;">${escapeHtml(data.pelanggaran || data.keterangan)}</div>
      <p>Berlaku sejak: <strong>${fmtDateShort(data.tanggal)}</strong> s/d <strong>${fmtDateShort(data.masa_berlaku)}</strong>.</p>
      <p>Diharapkan Saudara/i dapat memperbaiki kinerja dan tidak mengulangi pelanggaran tersebut.</p>
      <table style="width:100%; text-align:center; margin-top:40px;">
        <tr><td width="50%">Karyawan Ybs,</td><td width="50%">HRD Manager,</td></tr><tr><td height="80"></td><td></td></tr>
        <tr><td>( ${escapeHtml(data.nama_karyawan)} )</td><td>( ................................. )</td></tr>
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
        const targets = await getTargetsForRole("PEMOHON", data.nama_karyawan);
        for (const t of targets) {
          await notifyUser(t.username, "Surat Panggilan/SP Baru", `Anda menerima surat terkait: ${data.perihal || data.pelanggaran || "-"}`);
          if (t.email) await sendEmailNotif(t.email, "Pemberitahuan dari HRD", `<p>Anda menerima dokumen baru dari HRD terkait: <b>${escapeHtml(data.perihal || data.pelanggaran || "-")}</b>. Silakan cek email/kontak HRD untuk detail.</p>`);
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
        const targets = await getTargetsForRole("PEMOHON", data.nama_karyawan);
        for (const t of targets) {
          await notifyUser(t.username, "Surat Panggilan/SP Baru", `Anda menerima surat terkait: ${data.perihal || data.pelanggaran || "-"}`);
          if (t.email) await sendEmailNotif(t.email, "Pemberitahuan dari HRD", `<p>Anda menerima dokumen baru dari HRD terkait: <b>${escapeHtml(data.perihal || data.pelanggaran || "-")}</b>. Silakan cek email/kontak HRD untuk detail.</p>`);
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
