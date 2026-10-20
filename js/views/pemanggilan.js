import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fmtDateShort, escapeHtml, notifyUser, sendEmailNotif, buildStandardEmailHtml, getTargetsForRole, localDateStr, navigate } from "../utils.js";
import { renderCrudModule, icon } from "../components.js";
import { getSession, canEditModuleData, resolveBranchScope, branchMatches } from "../auth.js";
import { isoDocHeaderTable } from "../branding.js";
import { disciplinePpArticles, getPpArticle, ppArticleLabel, PP_META, mergePpCatalog } from "../peraturan-perusahaan.mjs";

export async function mount(container, { params } = {}) {
 // GM (tanpa override) hanya boleh melihat/export/print → matikan aksi tulis di modul CRUD
 const authSession = getSession();
 const gmViewOnly = String(authSession?.role || "").toUpperCase() === "GM" && !(await canEditModuleData(authSession));
 // Branch Manager hanya melihat data cabangnya sendiri; role pusat bebas (branchScope = "")
 const branchScope = resolveBranchScope(authSession);

 // Ambil Dropdown Karyawan Aktif
 const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
 // Peta nama karyawan -> cabang untuk me-resolve baris yang tidak punya kolom cabang langsung
 const empBranchMap = {};
 karyawan.forEach(k => {
 const nm = String(k.nama_karyawan || "").trim().toUpperCase();
 if (nm && k.cabang) empBranchMap[nm] = k.cabang;
 });
 const activeEmpNames = karyawan
 .filter(k => (k.aktif_tdk_aktif||"AKTIF").toUpperCase() === "AKTIF")
 .filter(k => branchMatches(branchScope, k.cabang))
 .map(k => k.nama_karyawan).sort();

 // Pilihan pasal PP 2026 yang relevan untuk SP. Label lengkap disimpan agar
 // surat tetap dapat dibaca walau katalog berubah; ID pasal disimpan terpisah.
 // Override/kustom pasal dari menu Peraturan Perusahaan ikut dimuat agar pasal
 // tambahan yang terkait disiplin langsung tersedia di formulir SP.
 let ppCatalog = null;
 try {
   ppCatalog = mergePpCatalog(await fsGetAll(COL.PERATURAN_PERUSAHAAN));
 } catch (error) {
   console.warn("Katalog PP memakai data bawaan (override tidak dapat dimuat):", error);
 }
 const ppDisciplineArticles = disciplinePpArticles(ppCatalog || undefined);
 const ppArticleOptions = ppDisciplineArticles.map(a => ppArticleLabel(a));
 const ppCategoryOptions = [...new Set(ppDisciplineArticles.flatMap(a => a.disiplin?.jenis || []))].sort();

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
 ${data.pasal_pp ? `<tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Pasal PP</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.pasal_pp)}</td></tr>` : ""}
 ${data.dasar_hukum ? `<tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Dasar Hukum</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.dasar_hukum)}</td></tr>` : ""}
 ${data.pp_status ? `<tr><td style="border: 1px solid #000; padding: 6px 10px; font-weight: bold; background: #f8fafc;">Status Rujukan PP</td><td style="border: 1px solid #000; padding: 6px 10px;">${escapeHtml(data.pp_status)}${data.pp_periode ? ` (${escapeHtml(data.pp_periode)})` : ""}</td></tr>` : ""}
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
 const spCrud = await renderCrudModule(panels.sp, {
 title: "Log SP & Konseling",
 collectionName: COL.LOG_SP_KONSELING,
 idPrefix: "SP", printFn: printSuratPeringatan, printLabel: "Cetak Surat SP (PDF)",
 canCreate: !gmViewOnly, canEdit: !gmViewOnly,
 searchFields: ["nama_karyawan", "pelanggaran", "pasal_pp", "kategori_pelanggaran"],
 filterFn: (row) => branchMatches(branchScope, empBranchMap[String(row.nama_karyawan || "").trim().toUpperCase()]),
 extraToolbarHtml: `<button id="sp-open-pp" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition">${icon("book", "w-4 h-4")} Peraturan Perusahaan</button>`,
 columns: [
 { key: "tanggal", label: "Tanggal", type: "date" },
 { key: "nama_karyawan", label: "Nama Karyawan" },
 { key: "tingkat_sp", label: "Tingkat", type: "badge" },
 { key: "pasal_pp", label: "Pasal PP", format: (v, row) => {
   if (!v) return `<span class="text-slate-400">-</span>`;
   const pasal = String(row?.pasal_pp_id || "").replace(/^pp-/, "") || (String(v).match(/\d+/) || [""])[0];
   if (!pasal) return `<span class="text-[11px] font-semibold text-maroon-800">${escapeHtml(v)}</span>`;
   return `<a href="#peraturan-perusahaan?pasal=${encodeURIComponent(pasal)}" class="text-[11px] font-semibold text-maroon-800 hover:underline" title="Buka pasal di Peraturan Perusahaan">${escapeHtml(v)}</a>`;
 } },
 { key: "pelanggaran", label: "Pelanggaran" }
 ],
 formFields: [
 { name: "tanggal", label: "Tanggal Dikeluarkan", type: "date", required: true },
 { name: "nama_karyawan", label: "Nama Karyawan", type: "select", options: activeEmpNames, required: true },
 { name: "tingkat_sp", label: "Tingkat Peringatan", type: "select", options: ["Teguran Lisan", "SP 1", "SP 2", "SP 3", "Konseling"], required: true },
 { name: "pasal_pp", label: "Pasal Peraturan Perusahaan", type: "select", options: ppArticleOptions },
 { name: "kategori_pelanggaran", label: "Kategori Pelanggaran", type: "select", options: ppCategoryOptions },
 { name: "pelanggaran", label: "Deskripsi Pelanggaran", type: "textarea", full: true, required: true },
 { name: "masa_berlaku", label: "Masa Berlaku Sanksi Hingga", type: "date" },
 ],
 beforeSave: (data) => {
  const article = getPpArticle(data.pasal_pp, ppCatalog || undefined);
  const next = { ...data };
  if (article) {
    next.pasal_pp = ppArticleLabel(article);
    next.pasal_pp_id = article.id;
    next.dasar_hukum = (article.dasar_hukum || []).join("; ");
    next.pp_tingkat = article.disiplin?.tingkat || "";
    next.pp_periode = PP_META.period_label;
    next.pp_status = PP_META.status;
    if (!next.kategori_pelanggaran && article.disiplin?.jenis?.length) {
      next.kategori_pelanggaran = article.disiplin.jenis[0];
    }
  } else {
    next.pasal_pp_id = "";
    next.dasar_hukum = "";
    next.pp_tingkat = "";
    next.pp_periode = "";
    next.pp_status = "";
  }
  return next;
 },
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
 `Surat Peringatan (${data.tingkat_sp || 'SP'}) Diterbitkan`,
 `Anda menerima ${data.tingkat_sp || 'Surat Peringatan'}: ${data.pelanggaran || '-'}. Klik untuk membaca & TTD digital.`,
 `#profile?tab=documents&doc_id=${docId}`
 );
 if (t.email) {
   const emailBody = buildStandardEmailHtml({
     badgeText: data.tingkat_sp || "Surat Peringatan",
     badgeVariant: "amber",
     title: "Surat Peringatan Diterbitkan",
     recipientName: data.nama_karyawan,
     introText: `Anda menerima dokumen resmi <strong>${escapeHtml(docJudul)}</strong> dari HRD CV Andela Jaya.`,
     infoList: [
       { label: "Karyawan", value: data.nama_karyawan },
       { label: "Tingkat", value: data.tingkat_sp || "SP" },
       { label: "Pelanggaran", value: data.pelanggaran || "-" }
     ],
     actionUrl: `${window.location.origin}/#profile?tab=documents&doc_id=${docId}`,
     actionText: "Buka Dokumen & Tanda Tangan Digital →",
     secondaryNote: "Dokumen ini memerlukan konfirmasi dan tanda tangan digital Anda melalui aplikasi HRIS."
   });
   await sendEmailNotif(t.email, `[Dokumen HRD] ${docJudul}`, emailBody);
 }
 }
 }
 });
 panels.sp.querySelector("#sp-open-pp")?.addEventListener("click", () => navigate("peraturan-perusahaan"));
 const ppParam = params?.get?.("pp");
 if (ppParam) {
   const article = getPpArticle(ppParam, ppCatalog || undefined);
   if (article) {
     const label = ppArticleLabel(article);
     spCrud?.openForm?.(null, {
       tanggal: localDateStr(new Date()),
       pasal_pp: label,
       kategori_pelanggaran: article.disiplin?.jenis?.[0] || "",
       pelanggaran: `Pelanggaran terhadap ${label}. `
     });
   }
 }
 }

 async function loadPanggil() {
 await renderCrudModule(panels.panggil, {
 title: "Data Pemanggilan Karyawan",
 collectionName: COL.DATA_PEMANGGILAN,
 idPrefix: "PGL", printFn: printSuratPanggilan, printLabel: "Cetak Surat Panggilan (PDF)",
 canCreate: !gmViewOnly, canEdit: !gmViewOnly,
 searchFields: ["nama_karyawan", "perihal"],
 filterFn: (row) => branchMatches(branchScope, empBranchMap[String(row.nama_karyawan || "").trim().toUpperCase()]),
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
 " Surat Pemanggilan Karyawan Diterbitkan",
 `Anda menerima Surat Pemanggilan perihal: ${data.perihal || '-'}. Klik untuk membaca & TTD digital.`,
 `#profile?tab=documents&doc_id=${docId}`
 );
 if (t.email) {
   const emailBody = buildStandardEmailHtml({
     badgeText: "Surat Pemanggilan",
     badgeVariant: "maroon",
     title: "Surat Pemanggilan HRD",
     recipientName: data.nama_karyawan,
     introText: `Anda menerima dokumen resmi <strong>${escapeHtml(docJudul)}</strong> dari HRD CV Andela Jaya.`,
     infoList: [
       { label: "Karyawan", value: data.nama_karyawan },
       { label: "Tanggal Pertemuan", value: fmtDateShort(data.tanggal_panggilan) },
       { label: "Jam Pertemuan", value: data.waktu || "09:00" },
       { label: "Perihal", value: data.perihal || "-" }
     ],
     actionUrl: `${window.location.origin}/#profile?tab=documents&doc_id=${docId}`,
     actionText: "Buka Dokumen & Konfirmasi Kehadiran →",
     secondaryNote: "Harap hadir tepat waktu sesuai dengan jadwal yang telah ditentukan."
   });
   await sendEmailNotif(t.email, `[Panggilan HRD] ${docJudul}`, emailBody);
 }
 }
 }
 });
 }

 await loadSP(); loaded.sp = true;
 if (params?.get("nama")) {
   const search = panels.sp.querySelector("#crud-search");
   if (search) {
     search.value = params.get("nama");
     search.dispatchEvent(new Event("input", { bubbles: true }));
   }
 }
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
