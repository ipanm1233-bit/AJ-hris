/**
 * Tambahkan fungsi ini ke project Google Apps Script Arsip Absensi.
 * Di dalam router doPost yang sudah ada, tambahkan:
 *
 * if (payload.action === 'archive_kanal_checkins') return jsonOutput(archiveKanalCheckins(payload));
 * if (payload.action === 'get_archived_kanal_checkins') return jsonOutput(getArchivedKanalCheckins(payload));
 */

var KANAL_ARCHIVE_SHEET = 'ARSIP_KANAL_CHECKINS';
var KANAL_ARCHIVE_HEADERS = [
  'ARCHIVE_ID', 'TANGGAL', 'SALES_NIK', 'SALES_NAMA', 'CABANG', 'TOKO_OUTLET',
  'WAKTU_CHECKIN', 'WAKTU_CHECKOUT', 'STATUS_KUNJUNGAN', 'ALAMAT_TOKO',
  'KOORDINAT_GPS', 'CATATAN', 'GAMBAR_CHECKIN', 'RAW_JSON', 'DIARSIPKAN_PADA'
];

function getKanalArchiveSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(KANAL_ARCHIVE_SHEET) || spreadsheet.insertSheet(KANAL_ARCHIVE_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(KANAL_ARCHIVE_HEADERS);
  return sheet;
}

function kanalArchiveId_(row) {
  return String(row.id || row._docId || [row.sales_nik, row.tanggal, row.waktu_checkin, row.toko_outlet].join('|'));
}

function archiveKanalCheckins(payload) {
  var rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { success: true, archived: 0 };
  var sheet = getKanalArchiveSheet_();
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(value) { existing[String(value[0])] = true; });
  }
  var now = new Date();
  var values = rows.filter(function(row) { return !existing[kanalArchiveId_(row)]; }).map(function(row) {
    var id = kanalArchiveId_(row);
    existing[id] = true;
    return [
      id, row.tanggal || '', row.sales_nik || '', row.sales_nama || '', row.cabang || '', row.toko_outlet || '',
      row.waktu_checkin || '', row.waktu_checkout || '', row.status_kunjungan || '', row.alamat_toko || '',
      row.koordinat_gps || '', row.catatan || '', row.gambar_checkin || row.foto_checkin || '', JSON.stringify(row), now
    ];
  });
  if (values.length) sheet.getRange(sheet.getLastRow() + 1, 1, values.length, KANAL_ARCHIVE_HEADERS.length).setValues(values);
  return { success: true, archived: values.length };
}

function getArchivedKanalCheckins(payload) {
  var start = String(payload.start || '');
  var end = String(payload.end || '9999-12-31');
  var sheet = getKanalArchiveSheet_();
  if (sheet.getLastRow() <= 1) return { success: true, rows: [] };
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, KANAL_ARCHIVE_HEADERS.length).getValues();
  var rows = values.filter(function(row) {
    var date = String(row[1] || '');
    return date && date >= start && date <= end;
  }).map(function(row) {
    try { return JSON.parse(row[13]); }
    catch (error) {
      return { id: row[0], tanggal: row[1], sales_nik: row[2], sales_nama: row[3], cabang: row[4], toko_outlet: row[5], waktu_checkin: row[6], waktu_checkout: row[7], status_kunjungan: row[8], alamat_toko: row[9], koordinat_gps: row[10], catatan: row[11], gambar_checkin: row[12] };
    }
  });
  return { success: true, rows: rows };
}
