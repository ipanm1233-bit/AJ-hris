/**
 * =====================================================================
 * FINGERPRINT BRIDGE — AJ HRIS
 * =====================================================================
 * Skrip ini TIDAK jalan di Vercel/website — ini jalan LANGSUNG di
 * KOMPUTER SERVER kantor yang terhubung ke mesin fingerprint (via
 * jaringan LAN/WiFi kantor, memakai protokol TCP/IP bawaan mesin
 * ZKTeco & sejenisnya).
 *
 * TUGASNYA:
 * 1. Konek ke mesin fingerprint lewat IP-nya di jaringan lokal.
 * 2. Ambil semua log scan (siapa, jam berapa).
 * 3. Kirim log itu ke endpoint /api/sync-absen di website HRIS, yang
 *    akan mengelompokkannya jadi jam masuk/keluar per karyawan per
 *    hari dan menyimpannya ke Firestore -- otomatis muncul di menu
 *    "Manajemen Absensi > Lihat & Koreksi Data Absensi".
 *
 * ------------------------- CARA SETUP -------------------------------
 * 1. Di komputer server, install Node.js (https://nodejs.org, versi LTS).
 * 2. Copy folder `fingerprint-bridge` ini ke komputer server tsb.
 * 3. Buka terminal/cmd di dalam folder ini, jalankan:
 *      npm install
 * 4. Copy file `.env.example` jadi `.env`, isi sesuai mesin & website
 *    Anda (lihat komentar di masing-masing baris .env.example).
 * 5. Tes jalankan sekali secara manual:
 *      npm start
 *    Kalau berhasil akan muncul "✅ Sinkronisasi selesai: N data terkirim".
 * 6. Supaya berjalan OTOMATIS berkala (mis. tiap 15 menit), jadwalkan
 *    lewat Windows Task Scheduler (lihat README.md di folder ini untuk
 *    langkah lengkap) menjalankan perintah: npm start
 *
 * CATATAN MEREK MESIN: skrip ini memakai library `node-zklib`, yang
 * mendukung mesin absen fingerprint merek ZKTeco (merek paling umum
 * dipakai di Indonesia -- mis. seri SpeedFace, uFace, iFace, MB-series
 * dsb, selama mendukung koneksi TCP/IP). Kalau mesin Anda BUKAN ZKTeco
 * atau tidak mendukung TCP/IP (mis. USB-only/merek Solution X100/Fingerspot
 * versi lama), beri tahu saya merek & model persisnya -- library
 * penghubungnya beda dan bagian `ambilLogDariMesin()` di bawah perlu
 * disesuaikan, tapi bagian pengiriman ke /api/sync-absen TETAP SAMA.
 * ---------------------------------------------------------------------
 */

require('dotenv').config();
const ZKLib = require('node-zklib');

const DEVICE_IP = process.env.DEVICE_IP || '192.168.1.201';
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT || '4370', 10);
const API_URL = process.env.API_URL || 'https://andela-hris.vercel.app/api/sync-absen';

async function ambilLogDariMesin() {
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);
  try {
    console.log(`Menghubungkan ke mesin fingerprint di ${DEVICE_IP}:${DEVICE_PORT} ...`);
    await zk.createSocket();

    const { data } = await zk.getAttendances(); // -> [{ deviceUserId, recordTime, ip, ... }, ...]
    console.log(`Berhasil mengambil ${data.length} log scan dari mesin.`);

    await zk.disconnect();
    return data;
  } catch (err) {
    try { await zk.disconnect(); } catch (_) { /* diamkan */ }
    throw new Error(`Gagal konek/ambil data dari mesin fingerprint: ${err.message}`);
  }
}

async function kirimKeServer(logs) {
  if (!logs.length) {
    console.log("Tidak ada log baru untuk dikirim.");
    return;
  }
  console.log(`Mengirim ${logs.length} log ke ${API_URL} ...`);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs })
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success !== true) {
    throw new Error('Server menolak data: ' + (json && json.error ? json.error : res.status));
  }
  console.log(`✅ Sinkronisasi selesai: ${json.message}`);
}

async function main() {
  try {
    const logs = await ambilLogDariMesin();
    await kirimKeServer(logs);
  } catch (err) {
    console.error('❌ Sinkronisasi GAGAL:', err.message);
    process.exitCode = 1;
  }
}

main();
