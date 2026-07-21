# Fingerprint Bridge — AJ HRIS

Jembatan penghubung mesin absen fingerprint (di kantor) ke sistem AJ HRIS (di web). Skrip ini **dijalankan di komputer server kantor** yang terhubung ke mesin fingerprint lewat jaringan LAN/WiFi — bukan di Vercel/website.

## Cara Kerja Singkat

```
[Mesin Fingerprint] --(LAN, port 4370)--> [sync.js di Komputer Server] --(HTTPS)--> [/api/sync-absen di Vercel] --> [Firestore: data_absensi] --> [Menu Manajemen Absensi]
```

## Setup (Sekali Saja)

1. **Install Node.js** di komputer server kantor (unduh versi LTS di [nodejs.org](https://nodejs.org)).
2. **Copy folder `fingerprint-bridge`** ini (isinya `sync.js`, `package.json`, dst) ke komputer server itu, misalnya ke `D:\hris-bridge\`.
3. Buka **Command Prompt / PowerShell** di dalam folder itu, jalankan:
   ```
   npm install
   ```
4. **Copy `.env.example` jadi `.env`**, lalu isi:
   - `DEVICE_IP` — IP mesin fingerprint di jaringan kantor (cek di layar mesin, menu Comm/Network/Ethernet).
   - `DEVICE_PORT` — biasanya `4370`, jangan diubah kecuali yakin sudah beda.
   - `API_URL` — alamat website HRIS Anda + `/api/sync-absen`.
5. **Tes jalankan manual**:
   ```
   npm start
   ```
   Kalau sukses akan muncul pesan `✅ Sinkronisasi selesai: N data terkirim`. Cek juga di menu **Manajemen Absensi → Lihat & Koreksi Data Absensi** di HRIS — data hari itu harusnya sudah muncul.

## Menjadwalkan Otomatis (Windows Task Scheduler)

Supaya sinkronisasi jalan sendiri tanpa perlu diketik manual tiap kali (misalnya tiap 15–30 menit sekali):

1. Buka **Task Scheduler** (cari lewat Start Menu Windows).
2. **Create Task** (bukan "Create Basic Task", supaya opsinya lebih lengkap):
   - **General**: beri nama mis. "Sync Fingerprint HRIS", centang "Run whether user is logged on or not".
   - **Triggers** → New → "Daily", lalu centang "Repeat task every: 15 minutes" untuk durasi "Indefinitely".
   - **Actions** → New:
     - Program/script: `node`
     - Add arguments: `sync.js`
     - Start in: path folder `fingerprint-bridge` tadi (mis. `D:\hris-bridge`)
   - **Conditions**: matikan centang "Start the task only if the computer is on AC power" (supaya tetap jalan di komputer server yang menyala terus).
3. Klik OK, masukkan password akun Windows kalau diminta.

Setelah ini, data absen dari mesin fingerprint akan otomatis tersinkron ke HRIS setiap 15 menit tanpa perlu campur tangan manual.

## Troubleshooting

- **"Gagal konek/ambil data dari mesin fingerprint"** — Pastikan komputer server & mesin fingerprint ada di jaringan yang sama (bisa saling ping IP-nya), dan `DEVICE_IP`/`DEVICE_PORT` di `.env` sudah benar.
- **"Server menolak data"** — Cek apakah `API_URL` di `.env` sudah benar (harus diakhiri `/api/sync-absen`), dan pastikan environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` sudah diset di Vercel (lihat bagian bawah).
- **Karyawan muncul sebagai "NIK ... (tidak ditemukan di Master Karyawan)"** — berarti NIK yang diketik di mesin fingerprint saat mendaftarkan sidik jari karyawan itu TIDAK SAMA PERSIS dengan field `nik` di Master Karyawan HRIS. Samakan salah satunya.
- **Mesin bukan merek ZKTeco / tidak support TCP-IP** — beri tahu merek & model mesinnya, `ambilLogDariMesin()` di `sync.js` perlu diganti library-nya (bagian pengiriman ke HRIS tidak perlu berubah).

## Environment Variable di Vercel

Endpoint `/api/sync-absen` (dan `/api/send-push`, `/api/cron-check-kontrak`) butuh service account Firebase untuk bisa menulis ke Firestore dari server. Pastikan variabel environment berikut sudah diset di **Vercel → Project Settings → Environment Variables**:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — isi seluruh JSON service account (Firebase Console → Project Settings → Service Accounts → Generate New Private Key), di-paste sebagai satu baris string JSON.
