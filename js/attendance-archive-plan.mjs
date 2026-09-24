// Spreadsheet arsip hanya membutuhkan kolom yang didukung Apps Script.
// Jangan hapus sumber absensi: arsip adalah salinan yang dapat diulang.
export function planAttendanceArchive(rows, cutoff, { limit = 5000, chunkSize = 150 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoff || ''))) throw new Error('Batas tanggal arsip tidak valid.');
  if (!Array.isArray(rows) || rows.length >= limit) {
    throw new Error('Terlalu banyak data untuk satu proses. Pilih periode yang lebih pendek lalu coba lagi.');
  }
  const seen = new Set();
  const eligible = [];
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.tanggal || '')) || row.tanggal >= cutoff) continue;
    const id = String(row.id || '').trim();
    if (!id) throw new Error('Ada absensi lama tanpa ID. Arsip dibatalkan untuk diperiksa.');
    if (seen.has(id)) continue;
    seen.add(id);
    eligible.push({
      id, nik: row.nik || '', nama: row.nama || '', tanggal: row.tanggal,
      scan_masuk: row.scan_masuk || '', scan_keluar: row.scan_keluar || '',
      status: row.status || 'Hadir', keterangan: row.keterangan || row.alasan_koreksi || ''
    });
  }
  const chunks = [];
  for (let index = 0; index < eligible.length; index += chunkSize) chunks.push(eligible.slice(index, index + chunkSize));
  return { count: eligible.length, chunks };
}
