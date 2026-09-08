var DEFAULT_ARCHIVE_SPREADSHEET_ID = "1g1YXSDFgP-FrK0XH2F7brPRkiTzt6tIsdgWouR9l-_g";
var ATTENDANCE_ARCHIVE_SHEET = "Arsip Absensi";
var KANAL_ARCHIVE_SHEET = "ARSIP_KANAL_CHECKINS";
var KANAL_ARCHIVE_HEADERS = [
  "ARCHIVE_ID", "TANGGAL", "SALES_NIK", "SALES_NAMA", "CABANG", "TOKO_OUTLET",
  "WAKTU_CHECKIN", "WAKTU_CHECKOUT", "STATUS_KUNJUNGAN", "ALAMAT_TOKO",
  "KOORDINAT_GPS", "CATATAN", "GAMBAR_CHECKIN", "RAW_JSON", "DIARSIPKAN_PADA"
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    if (action === "archive_attendance") return archiveAttendance(data);
    if (action === "get_archived_attendance") return getArchivedAttendance(data);
    if (action === "archive_kanal_checkins") return archiveKanalCheckins(data);
    if (action === "get_archived_kanal_checkins") return getArchivedKanalCheckins(data);
    return jsonOutput({ success: false, error: "Aksi tidak dikenal: " + action });
  } catch (error) {
    return jsonOutput({ success: false, error: error.toString() });
  }
}

function archiveAttendance(data) {
  var ss = openArchiveSpreadsheet(data);
  var sheet = ss.getSheetByName(ATTENDANCE_ARCHIVE_SHEET) || ss.insertSheet(ATTENDANCE_ARCHIVE_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "NIK", "Nama Karyawan", "Tanggal", "Scan Masuk", "Scan Keluar", "Status", "Keterangan", "Tanggal Dearsipkan"]);
    sheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#f3f4f6");
  }
  sheet.getRange("D:D").setNumberFormat("@STRING@");
  var rows = Array.isArray(data.rows) ? data.rows : [];
  var existingIds = existingIdMap(sheet);
  var nowStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  var dataToAppend = [];
  rows.forEach(function(r) {
    var id = String(r.id || "").trim();
    if (id && existingIds[id]) return;
    if (id) existingIds[id] = true;
    dataToAppend.push([
      id, r.nik || "", r.nama || "", normalizeDateStr(r.tanggal), r.scan_masuk || "-",
      r.scan_keluar || r.scan_pulang || "-", r.status || "Hadir", r.keterangan || "", nowStr
    ]);
  });
  if (dataToAppend.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, dataToAppend.length, 9).setValues(dataToAppend);
  return jsonOutput({
    success: true,
    message: "Berhasil mengarsipkan " + dataToAppend.length + " data absensi ke Spreadsheet.",
    count: dataToAppend.length
  });
}

function getArchivedAttendance(data) {
  var ss = openArchiveSpreadsheet(data);
  var sheet = ss.getSheetByName(ATTENDANCE_ARCHIVE_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonOutput({ success: true, rows: [], debug: "Sheet 'Arsip Absensi' kosong atau tidak ditemukan." });
  }
  var periodStart = normalizeDateStr(data.start || "");
  var periodEnd = normalizeDateStr(data.end || "");
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  var rows = [];
  var sampleRawDates = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var tanggalStr = normalizeDateStr(row[3]);
    if (sampleRawDates.length < 3) sampleRawDates.push(String(row[3]) + " -> " + tanggalStr);
    if (periodStart && tanggalStr < periodStart) continue;
    if (periodEnd && tanggalStr > periodEnd) continue;
    if (!periodStart && !periodEnd) continue;
    rows.push({
      id: row[0], nik: row[1], nama: row[2], tanggal: tanggalStr,
      scan_masuk: row[4], scan_keluar: row[5], status: row[6], keterangan: row[7]
    });
  }
  return jsonOutput({
    success: true,
    rows: rows,
    debug: "Filter: " + periodStart + " s/d " + periodEnd + " | Total baris di sheet: " + values.length + " | Contoh tanggal mentah: " + sampleRawDates.join(", ")
  });
}

function archiveKanalCheckins(data) {
  var ss = openArchiveSpreadsheet(data);
  var sheet = getKanalArchiveSheet(ss);
  var rows = Array.isArray(data.rows) ? data.rows : [];
  var existingIds = existingIdMap(sheet);
  var nowStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  var dataToAppend = [];
  rows.forEach(function(r) {
    var id = kanalArchiveId(r);
    if (existingIds[id]) return;
    existingIds[id] = true;
    dataToAppend.push([
      id,
      normalizeDateStr(r.tanggal || r.date),
      r.sales_nik || r.nik || "",
      r.sales_nama || r.nama || "",
      r.cabang || "",
      r.toko_outlet || r.toko || r.outlet_name || "",
      r.waktu_checkin || r.checkin_time || r.waktu || "",
      r.waktu_checkout || r.checkout_time || "",
      r.status_kunjungan || r.status || "",
      r.alamat_toko || r.alamat || r.address || "",
      r.koordinat_gps || r.gps || r.coordinates || "",
      r.catatan || r.notes || "",
      r.gambar_checkin || r.foto_checkin || r.foto || r.image_url || "",
      JSON.stringify(r),
      nowStr
    ]);
  });
  if (dataToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, dataToAppend.length, KANAL_ARCHIVE_HEADERS.length).setValues(dataToAppend);
  }
  return jsonOutput({
    success: true,
    archived: dataToAppend.length,
    skipped: rows.length - dataToAppend.length,
    message: dataToAppend.length + " data Check-in Kanal berhasil diarsipkan."
  });
}

function getArchivedKanalCheckins(data) {
  var ss = openArchiveSpreadsheet(data);
  var sheet = getKanalArchiveSheet(ss);
  var periodStart = normalizeDateStr(data.start || "");
  var periodEnd = normalizeDateStr(data.end || "");
  if (!periodStart || !periodEnd) return jsonOutput({ success: false, error: "Tanggal mulai dan tanggal akhir arsip Kanal wajib diisi." });
  if (periodStart > periodEnd) return jsonOutput({ success: false, error: "Tanggal mulai tidak boleh melewati tanggal akhir." });
  if (sheet.getLastRow() <= 1) return jsonOutput({ success: true, rows: [], count: 0 });
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, KANAL_ARCHIVE_HEADERS.length).getValues();
  var rows = [];
  values.forEach(function(row) {
    var tanggalStr = normalizeDateStr(row[1]);
    if (!tanggalStr || tanggalStr < periodStart || tanggalStr > periodEnd) return;
    try {
      var raw = JSON.parse(String(row[13] || "{}"));
      raw.id = raw.id || row[0];
      raw.tanggal = normalizeDateStr(raw.tanggal || row[1]);
      rows.push(raw);
    } catch (error) {
      rows.push({
        id: row[0], tanggal: tanggalStr, sales_nik: row[2], sales_nama: row[3],
        cabang: row[4], toko_outlet: row[5], waktu_checkin: row[6], waktu_checkout: row[7],
        status_kunjungan: row[8], alamat_toko: row[9], koordinat_gps: row[10],
        catatan: row[11], gambar_checkin: row[12]
      });
    }
  });
  return jsonOutput({ success: true, rows: rows, count: rows.length, start: periodStart, end: periodEnd });
}

function openArchiveSpreadsheet(data) {
  return SpreadsheetApp.openById(data.spreadsheetId || DEFAULT_ARCHIVE_SPREADSHEET_ID);
}

function getKanalArchiveSheet(ss) {
  var sheet = ss.getSheetByName(KANAL_ARCHIVE_SHEET) || ss.insertSheet(KANAL_ARCHIVE_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(KANAL_ARCHIVE_HEADERS);
    sheet.getRange(1, 1, 1, KANAL_ARCHIVE_HEADERS.length)
      .setFontWeight("bold").setFontColor("#ffffff").setBackground("#8c121e");
    sheet.setFrozenRows(1);
  }
  sheet.getRange("B:B").setNumberFormat("@STRING@");
  return sheet;
}

function existingIdMap(sheet) {
  var map = {};
  if (sheet.getLastRow() <= 1) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(row) {
    var id = String(row[0] || "").trim();
    if (id) map[id] = true;
  });
  return map;
}

function kanalArchiveId(row) {
  var directId = String(row.id || row._docId || "").trim();
  if (directId) return directId;
  return [
    row.sales_nik || row.nik || "",
    normalizeDateStr(row.tanggal || row.date),
    row.waktu_checkin || row.checkin_time || row.waktu || "",
    row.toko_outlet || row.toko || row.outlet_name || ""
  ].join("|");
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function normalizeDateStr(raw) {
  if (raw instanceof Date) return Utilities.formatDate(raw, "Asia/Jakarta", "yyyy-MM-dd");
  var s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, "Asia/Jakarta", "yyyy-MM-dd");
  return s;
}
