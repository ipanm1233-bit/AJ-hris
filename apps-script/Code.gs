/**
 * =====================================================================
 * AJ HRIS — Google Apps Script Web App
 * =====================================================================
 * Menangani 2 hal untuk sistem HRIS CV Andela Jaya:
 *
 *  1) generate_cuti_doc  -> Menyalin template Form Cuti resmi
 *     (Google Docs), mengisi placeholder {{...}}, export ke PDF.
 *  2) upload_file        -> Menyimpan lampiran (LPJ, Broadcast Memo,
 *     dsb) ke Google Drive, menggantikan Firebase Storage.
 *
 * -------------------- CARA DEPLOY (WAJIB) --------------------------
 *  1. Buka https://script.google.com -> Proyek Baru.
 *  2. Hapus isi default Code.gs, tempel SELURUH isi file ini.
 *  3. Isi 4 konstanta ID_... di bawah (lihat petunjuk masing-masing).
 *  4. WAJIB: buka file manifest "appsscript.json" (kalau tidak
 *     terlihat di sidebar kiri: klik ikon gerigi "Project Settings" ->
 *     centang "Show appsscript.json manifest file in editor"), lalu
 *     ganti isinya persis seperti isi appsscript.json di bagian
 *     PALING BAWAH file ini. Ini WAJIB supaya scope izin akses Google
 *     Drive-nya PENUH -- kalau dilewati, upload/generate dokumen akan
 *     gagal dengan pesan "Access denied: DriveApp" (lihat penjelasan
 *     di bagian appsscript.json paling bawah).
 *  5. Jalankan fungsi testSetup() SEKALI secara manual: pilih
 *     "testSetup" di dropdown fungsi (sebelah tombol Run), klik Run.
 *     Akan muncul layar izin akses -- klik Lanjutkan/Advanced ->
 *     "Buka (nama proyek) (tidak aman)" -> Izinkan. Ini WAJIB supaya
 *     scope Drive benar-benar ter-otorisasi (deploy sebagai Web App
 *     saja TIDAK selalu memicu layar izin ini). Cek hasilnya di menu
 *     "Executions" (ikon jam di sidebar kiri) -- pastikan semua baris
 *     "OK", kalau ada yang "GAGAL" perbaiki dulu ID folder/template-nya.
 *  6. Klik Deploy > Kelola Deployment Baru (New deployment).
 *       - Pilih jenis: Web app
 *       - Execute as: Me (akun Google Anda)
 *       - Who has access: Anyone
 *  7. Copy URL yang diakhiri "/exec".
 *  8. Tempel URL itu ke GAS_WEBAPP_URL di js/gas-integration.js.
 *  9. Setiap kali mengubah kode ini, buat "New deployment" lagi (atau
 *     edit deployment yang sama & pilih versi baru) supaya perubahan
 *     ikut aktif — sekadar Save saja TIDAK otomatis mem-publish ulang.
 * ---------------------------------------------------------------------
 */

// ID diambil dari URL Google Docs: https://docs.google.com/document/d/INI_ID_NYA/edit
const ID_TEMPLATE_FULL = "1nwCuIbnej9qk06tvtyxUnQEKYScN5jBGobdFzPJla9I";      // Template "KARYAWAN ANDELA JAYA - CUTI FULL"
const ID_TEMPLATE_SETENGAH = "1QdfuDD_IZ--KwZzPlliy3Umy8h0pZxXvVHEl2lk5dCM";  // Template "KARYAWAN ANDELA JAYA - CUTI SETENGAH"

// Buat 2 folder baru di Google Drive Anda, lalu ambil ID-nya dari URL folder
// (https://drive.google.com/drive/folders/INI_ID_NYA) dan isikan di sini:
const ID_FOLDER_OUTPUT_CUTI = "1fv4QvqXUrOskhYRz18YIuS3duWl9OdQu";  // tempat menyimpan Form Cuti hasil generate (Doc + PDF)
const ID_FOLDER_UPLOAD_LAMPIRAN = "1fv4QvqXUrOskhYRz18YIuS3duWl9OdQu";     // tempat menyimpan semua lampiran (LPJ, Broadcast, dll)

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "generate_cuti_doc") {
      result = generateCutiDoc(data);
    } else if (data.action === "upload_file") {
      result = uploadFile(data);
    } else {
      throw new Error("Aksi tidak dikenal: " + data.action);
    }
    return jsonOutput({ success: true, ...result });
  } catch (err) {
    return jsonOutput({ success: false, error: String(err && err.message || err) });
  }
}

// Supaya URL /exec bisa dibuka langsung di browser untuk cek status deploy.
function doGet() {
  return ContentService.createTextOutput("AJ HRIS Apps Script Web App aktif. Gunakan metode POST untuk memanggil.");
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Menyalin template resmi (Full/Setengah Hari), mengganti seluruh
 * placeholder {{...}}, lalu export salinannya ke PDF.
 *
 * DAFTAR PLACEHOLDER YANG DIDUKUNG (silakan cocokkan dengan yang ADA
 * di template Anda — buka dokumennya, Ctrl+F "{{" untuk melihat semua
 * placeholder asli, lalu sesuaikan key di object `map` di bawah jika
 * ada perbedaan penulisan/spasi/huruf besar-kecil):
 */
function generateCutiDoc(data) {
  const isHalfDay = !!data.isHalfDay;
  const templateId = isHalfDay ? ID_TEMPLATE_SETENGAH : ID_TEMPLATE_FULL;
  const outputFolder = DriveApp.getFolderById(ID_FOLDER_OUTPUT_CUTI);

  const fileName = `Form Cuti - ${data.nama_karyawan || "Karyawan"} - ${data.tanggal || ""}`.trim();
  const copyFile = DriveApp.getFileById(templateId).makeCopy(fileName, outputFolder);
  const doc = DocumentApp.openById(copyFile.getId());
  const body = doc.getBody();

  const map = {
    "{{NAMA KARYAWAN}}": data.nama_karyawan || "-",
    "{{JABATAN}}": data.jabatan || "-",
    "{{DIVISI}}": data.cabang || data.divisi || "-",
    "{{DIVISI / BAGIAN / UNIT KERJA}}": data.cabang || data.divisi || "-",
    "{{JABATAN / DIVISI}}": `${data.jabatan || "-"} / ${data.cabang || "-"}`,
    "{{TANGGAL MULAI}}": data.tanggal_display || data.tanggal || "-",
    "{{TANGGAL SELESAI}}": data.tgl_akhir_display || data.tgl_akhir || data.tanggal_display || "-",
    "{{TANGGAL CUTI}}": data.tanggal_display || data.tanggal || "-",
    "{{JAM KELUAR}}": data.jam_keluar || "-",
    "{{JAM KEMBALI}}": data.jam_kembali || "-",
    "{{TOTAL HARI}}": String(data.count != null ? data.count : "-"),
    "{{JUMLAH HARI}}": String(data.count != null ? data.count : "-"),
    "{{ALASAN CUTI}}": data.keterangan_cuti || "-",
    "{{KETERANGAN}}": data.keterangan_cuti || "-",
    "{{ALAMAT / NO HP SELAMA CUTI}}": data.kontak || "-",
    "{{KONTAK}}": data.kontak || "-",
    "{{SISA CUTI TAHUNAN}}": String(data.sisa_tahunan != null ? data.sisa_tahunan : "-"),
    "{{SISA CUTI KHUSUS}}": String(data.sisa_khusus != null ? data.sisa_khusus : "-"),
    "{{TANGGAL PENGAJUAN}}": data.tanggal_pengajuan || "-"
  };

  Object.keys(map).forEach(function (key) {
    body.replaceText(escapeRegex(key), map[key]);
  });

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(copyFile.getId()).getAs(MimeType.PDF);
  const pdfFile = outputFolder.createFile(pdfBlob).setName(fileName + ".pdf");
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    pdfUrl: pdfFile.getUrl(),
    docUrl: copyFile.getUrl()
  };
}

/**
 * Menyimpan file (base64) ke subfolder Drive sesuai folderPath, mis.
 * "Pengajuan/TRX-0001" akan otomatis dibuat sebagai
 * ID_FOLDER_UPLOAD_LAMPIRAN/Pengajuan/TRX-0001/.
 */
function uploadFile(data) {
  const bytes = Utilities.base64Decode(data.base64);
  const blob = Utilities.newBlob(bytes, data.mimeType || "application/octet-stream", data.fileName || "file");

  const rootFolder = DriveApp.getFolderById(ID_FOLDER_UPLOAD_LAMPIRAN);
  const targetFolder = getOrCreateFolderPath(rootFolder, data.folderPath || "Lain-lain");

  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { url: file.getUrl(), fileId: file.getId() };
}

function getOrCreateFolderPath(rootFolder, path) {
  let folder = rootFolder;
  String(path).split("/").filter(Boolean).forEach(function (name) {
    const existing = folder.getFoldersByName(name);
    folder = existing.hasNext() ? existing.next() : folder.createFolder(name);
  });
  return folder;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * JALANKAN FUNGSI INI SEKALI SECARA MANUAL DARI EDITOR (bukan lewat Web
 * App) sebelum pertama kali dipakai -- lihat langkah 5 di catatan atas.
 * Tujuannya 2: (1) memicu layar izin akses Google supaya scope Drive
 * benar-benar diotorisasi (Web App tidak selalu memicu ini sendiri),
 * dan (2) mengecek apakah ID_FOLDER_.../ID_TEMPLATE_... di atas sudah
 * benar & bisa diakses. Hasilnya dicek di menu "Executions" (ikon jam
 * di sidebar kiri editor) atau lewat View > Logs.
 *
 * Kalau muncul "Access denied: DriveApp" di sini juga (bukan cuma pas
 * dipanggil dari web), penyebab paling umum:
 *   a) appsscript.json belum diganti sesuai contoh di bagian paling
 *      bawah file ini (scope-nya masih auto-detect yang sempit / hanya
 *      "drive.file", tidak bisa akses folder yang dibuat manual oleh
 *      Anda sendiri di Drive).
 *   b) ID folder/template masih placeholder "GANTI_DENGAN_..." atau
 *      salah ketik.
 *   c) Folder/template dibuat oleh akun Google LAIN (bukan akun yang
 *      dipakai login script.google.com & yang dipilih di "Execute as").
 */
function testSetup() {
  try {
    const f1 = DriveApp.getFolderById(ID_FOLDER_OUTPUT_CUTI);
    Logger.log("OK - Folder Output Cuti ditemukan: " + f1.getName());
  } catch (e) {
    Logger.log("GAGAL akses ID_FOLDER_OUTPUT_CUTI: " + e.message);
  }
  try {
    const f2 = DriveApp.getFolderById(ID_FOLDER_UPLOAD_LAMPIRAN);
    Logger.log("OK - Folder Upload Lampiran ditemukan: " + f2.getName());
  } catch (e) {
    Logger.log("GAGAL akses ID_FOLDER_UPLOAD_LAMPIRAN: " + e.message);
  }
  try {
    const t1 = DriveApp.getFileById(ID_TEMPLATE_FULL);
    Logger.log("OK - Template Full ditemukan: " + t1.getName());
  } catch (e) {
    Logger.log("GAGAL akses ID_TEMPLATE_FULL: " + e.message);
  }
  try {
    const t2 = DriveApp.getFileById(ID_TEMPLATE_SETENGAH);
    Logger.log("OK - Template Setengah ditemukan: " + t2.getName());
  } catch (e) {
    Logger.log("GAGAL akses ID_TEMPLATE_SETENGAH: " + e.message);
  }
  Logger.log("Selesai. Kalau semua baris di atas 'OK', Web App siap dipakai (jangan lupa New Deployment kalau baru edit kode).");
}

/**
 * -------------------------------------------------------------------
 * appsscript.json — GANTI ISI FILE MANIFEST INI (lihat langkah 4).
 * Kenapa perlu: kalau dibiarkan default, Apps Script MENEBAK scope
 * izin yang dibutuhkan dari kode Anda, dan seringkali cuma menebak
 * scope sempit "drive.file" (cuma boleh akses file yang DIBUAT OLEH
 * SCRIPT ITU SENDIRI). Folder & template yang ANDA buat manual di
 * Drive TIDAK termasuk "dibuat oleh script", jadi DriveApp.getFolderById
 * ke folder tsb ditolak dengan pesan "Access denied: DriveApp" walau
 * scriptnya sudah diotorisasi. Scope "drive" (penuh) di bawah ini
 * memperbaikinya.
 *
 * {
 *   "timeZone": "Asia/Jakarta",
 *   "dependencies": {},
 *   "exceptionLogging": "STACKDRIVER",
 *   "runtimeVersion": "V8",
 *   "webapp": {
 *     "access": "ANYONE",
 *     "executeAs": "USER_DEPLOYING"
 *   },
 *   "oauthScopes": [
 *     "https://www.googleapis.com/auth/drive",
 *     "https://www.googleapis.com/auth/documents",
 *     "https://www.googleapis.com/auth/script.external_request"
 *   ]
 * }
 * ------------------------------------------------------------------- */