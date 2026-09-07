# AJ HRIS Fingerprint Bridge — Solution X150

Bridge ini dijalankan pada satu komputer Windows kantor yang berada dalam LAN yang sama dengan mesin. Bridge **hanya membaca** log; tidak menghapus log atau pengguna dari mesin.

## Persiapan

1. Pasang Node.js 22 LTS pada komputer kantor.
2. Pastikan komputer dapat membuka Command Prompt dan menjalankan `ping 192.168.1.234`.
3. Buka folder `fingerprint-bridge`, jalankan `npm install`.
4. Salin `.env.example` menjadi `.env`.
5. Isi `HRIS_BASE_URL` dan `FINGERPRINT_BRIDGE_SECRET` pada `.env`.
6. Secret pada `.env` harus sama dengan environment variable `FINGERPRINT_BRIDGE_SECRET` di Vercel Preview/Production.

Jangan mengunggah `.env` atau membagikan secret melalui chat.

## Tes aman

Jalankan:

```powershell
npm run check
```

Perintah ini hanya mengetes koneksi, membaca informasi mesin, dan menghitung log. Jika port mesin berbeda dari `4370`, sesuaikan `.env`. Communication Key/Comm Password pada mesin harus `0` atau dinonaktifkan untuk bridge ini.

Setelah identitas/serial benar, coba satu kali sinkronisasi:

```powershell
npm run sync
```

Periksa hasil pada Manajemen Absensi. Jika respons menampilkan `ID mesin belum terpetakan`, isi salah satu field fingerprint pada `master_karyawan` dengan ID yang sama seperti di mesin.

## Menjalankan otomatis

```powershell
npm start
```

Biarkan proses berjalan pada komputer kantor yang selalu menyala. Untuk production, jalankan melalui Windows Task Scheduler saat komputer startup. Jangan membuka atau melakukan port-forwarding port `4370` ke internet.

## Pemecahan masalah

- `Tidak dapat terhubung`: pastikan PC satu subnet, mesin menyala, kabel LAN aktif, IP belum dipakai perangkat lain, dan port/communication key benar.
- `Signature ... tidak valid`: secret pada PC dan Vercel berbeda atau jam Windows meleset lebih dari lima menit.
- Mesin memakai Communication Key: ubah menjadi `0`/nonaktif pada menu komunikasi mesin, lalu tes ulang.
- Jam absen keliru: pastikan zona waktu Windows dan jam mesin sama-sama WIB/Asia Jakarta.
