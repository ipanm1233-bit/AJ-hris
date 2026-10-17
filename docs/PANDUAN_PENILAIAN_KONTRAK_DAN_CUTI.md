# PANDUAN PENGGUNAAN SISTEM — Penilaian Kontrak & Jatah Cuti

Portal HRIS CV Andela Jaya
Dokumen ini merangkum cara memakai dua area sistem secara efektif dan sesuai standar HR:

1. **Menu Penilaian & Kontrak** (evaluasi KPI, alur koordinasi perpanjangan, dan penerbitan keputusan kontrak).
2. **Aturan Jatah Cuti Tahunan berbasis masa kerja** (aturan baru: buka di bulan ke-4).

---

## BAGIAN 1 — MENU PENILAIAN & KONTRAK

### 1.1 Siapa boleh apa

| Peran | Hak akses |
|---|---|
| HRD / SUPERADMIN | Penuh: kelola kartu kontrak, jalankan alur koordinasi, atur Standar Grade, atur Template Soal, terbitkan keputusan (SK). |
| DIREKTUR | Mengelola & menyetujui di tahap akhir (APPROVAL_DIREKTUR); dapat mengeksekusi penerbitan perpanjangan. |
| ATASAN (Manager) | Mengisi penilaian bawahannya (KPI/360), menyetujui/menolak rekomendasi di tahap atasan. |
| KARYAWAN | Melihat grafik penilaian diri sendiri (Panel Grafik) & mengisi penilaian diri/self assessment saat diminta. |
| GM | **Bisa membuka semua menu, tetapi hanya melihat (read-only)** — tidak ada tombol ubah/input/hapus. |

### 1.2 Alur kerja standar (ulang setiap siklus evaluasi)

**Tahap A — Kontrak Karyawan (tab "Kontrak Karyawan")**
1. HRD memantau kartu karyawan: badge urgensi otomatis muncul saat masa kontrak mendekati habis (**H-30 → H-14 → jatuh tempo**).
2. Kumpulkan **evidence** (bukti kinerja: laporan, pencapaian target, catatan disiplin). Rekomendasi HRD baru bisa disimpan bila teks evidence minimal **12 karakter** — ini pengaman agar keputusan selalu berbasis bukti.
3. Tandai status karyawan: **MASA_PERCOBAAN / KONTRAK / KARTAP / PIP / MUTASI_DEMOSI** — status ini menentukan aturan grade yang dipakai.

**Tahap B — Alur Koordinasi (tab "Alur Koordinasi")**
Alur berjenjang, masing-masing tahap harus selesai sebelum tahap berikutnya:

```
REVIEW_HRD  →  KOORDINASI_GM  →  APPROVAL_DIREKTUR  →  DRAFT_KONTRAK  →  Terbit SK
```

- **REVIEW_HRD**: HRD membuat ringkasan hasil evaluasi + evidence.
- **KOORDINASI_GM**: GM dinilai/direkam persetujuannya (GM selalu read-only; perekaman progres dilakukan HRD).
- **APPROVAL_DIREKTUR**: Direktur menyetujui/menolak **dengan tanggal** — tanpa tanggal, SK tidak bisa terbit.
- **DRAFT_KONTRAK**: draf kontrak/keputusan disusun lalu diterbitkan.

**Syarat minimal sebelum SK terbit (sistem mengecek otomatis):**
- Minimal **2 penilai** untuk penilaian KPI/360.
- Ada **rincian indikator** (bukan hanya skor total).
- Ada **rating dari atasan langsung**.
- Ada **daily log / penilaian harian** selama periode.
- Evidence HRD ≥ 12 karakter.
- **Atasan = SETUJU**, **GM tercatat**, **Direktur bertanggal**.

Jika salah satu belum terpenuhi, tombol terbitkan akan menolak dan sistem menampilkan checklist yang masih merah — lengkapi dulu, jangan dipaksa.

**Tahap C — Penilaian Harian & Target (tab "Penilaian Harian & Target")**
- Isi target bulanan + log harian. Data ini jadi satu gerbang kesiapan keputusan (poin B di atas).
- Bobot Penilaian Harian dalam monitoring performa: **60% harian / 20% target / 20% lainnya** (lihat Panel Grafik).

**Tahap D — Template Soal KPI (tab "Template Soal KPI")**
- HRD/SUPERADMIN mengelola bank soal penilaian KPI/360. Penilaian 360 memakai bobot relasi: **Atasan 50% • Peer 25% • Bawahan 15% • Diri sendiri 10%**.

**Penilaian Grade**
- Tombol **"Standar Grade & Keputusan HRD"** (khusus HRD/SUPERADMIN) mengatur ambang nilai → grade (A/B/C/...) per tipe penilaian (MASA_PERCOBAAN, KONTRAK, KARTAP, PIP, MUTASI_DEMOSI, KPI_360). Sistem memvalidasi **tidak ada rentang grade yang tumpang tindih atau bolong** — bila invalen, simpan ditolak.

### 1.3 Jejak audit (wajib dipahami HR)
Semua aksi penting terekam otomatis dan tidak bisa dihapus dari UI:
- `kpi_audit_logs` — siapa mengisi/mengubah penilaian KPI dan kapan.
- `contract_audit_logs` — **REJECT_RENEWAL** dan **ISSUE_RENEWAL** (penerbitan perpanjangan) dengan identitas pelaku dan waktu.
Gunakan log ini saat audit internal/banding karyawan.

### 1.4 Tips agar siklus tidak macet
- Mulai kumpulkan evidence sejak H-45 sebelum kontrak habis, jangan menunggu badge merah.
- Pastikan setiap karyawan punya minimal 2 penilai (atasan + peer) sebelum minggu terakhir koordinasi.
- Cek tab Alur Koordinasi setiap pagi oleh HRD: tahap yang paling lama menunggu adalah **penilaian atasan** ingatkan via chat/email.
- Jangan menonaktifkan gate (checklist) — itu pelindung legalitas keputusan kontrak.

---

## BAGIAN 2 — ATURAN JATAH CUTI TAHUNAN (MASA KERJA)

### 2.1 Ringkasan aturan (sudah otomatis di sistem)

| Masa kerja | Hak cuti tahunan |
|---|---|
| Bulan ke-1 s/d ke-3 (probation / kontrak pertama 3 bulan) | **0 hari — belum berhak**, pengajuan cuti tahunan diblokir sistem |
| Bulan ke-4 | **Langsung 3 hari** |
| Bulan ke-5 s/d ke-11 | Bertambah **+1 hari tiap bulan** (bulan 5 = 4, bulan 6 = 5, … bulan 11 = 10) |
| ≥ 1 tahun **atau** karyawan tetap (PKWTT/KARTAP/TETAP) | **12 hari penuh** |
| 6 tahun | 13 hari |
| 8 tahun | 14 hari |
| 10 tahun | 15 hari |
| 11 tahun ke atas | 16 hari |

Aturan tambahan yang tetap berlaku:
- **Cuti Khusus** (jatah 4 hari) dan kategori tidak-potong (sakit dengan surat dokter, dinas) tidak terpengaruh.
- **Cuti penghargaan masa kerja** (6/8/10/11 tahun) tetap berlaku.
- Jika HRD **mengisi jatah manual** (kolom eksplisit "Jatah Cuti Tahunan" di Master Karyawan), nilai HRD **mengalahkan** hitung otomatis — gunakan hanya untuk koreksi luar biasa (mis. cuti tahunan pro-rata dari perusahaan lama).
- Aturan **carryover akumulasi** SK 018 tetap: < 3 tahun 0%, 3–5 tahun 50%, ≥ 5 tahun 100%.

### 2.2 Yang berubah di layar

1. **Form Pengajuan Cuti (F-ISO-CUTI / Pengajuan Umum)**
   - Banner sisa saldo kini menampilkan catatan aturan masa kerja:
     - karyawan baru (bulan 1–3): kotak kuning "belum berhak… hak cuti terbuka bulan ke-4 (3 hari)".
     - masa bertumbuh (bulan 4–11): kotak kuning "jatah +1 tiap bulan hingga 12 hari setelah 1 tahun".
   - Jika karyawan pada bulan 1–3 memilih kategori Cuti Tahunan (C, C1/2, CB): peringatan muncul saat memilih, dan **submit diblokir** dengan pesan toh kuning. Kategori **Sakit (S)** tetap bisa dicatat karena berjalan di jalur verifikasi HRD/potong gaji yang sudah ada.
2. **Menu Cuti (HRD)**: kolom jatah otomatis mengikuti tabel di atas tanpa input manual.
3. **Riwayat/monitoring & PDF**: semua memakai satu fungsi kalkulasi yang sama, jadi angkanya konsisten di seluruh menu.

### 2.3 SOP per peran

**Karyawan baru**
1. Bulan 1–3: fokus kerja, tidak bisa ajukan cuti tahunan (sistem menolak).
2. Bulan ke-4: sisa saldo langsung menunjukkan 3 hari; bisa mengajukan mulai saat itu.

**HRD**
1. Saat onboarding: pastikan **tanggal_join** di Master Karyawan benar — seluruh aturan menghitung dari field ini.
2. Jangan isi jatah manual untuk karyawan baru; biarkan sistem menghitung (isi manual hanya bila ada dasar SK khusus).
3. Saat kontrak pertama 3 bulan selesai dan status naik (kontrak/KARTAP), cek layar saldo karyawan: bulan ke-4 otomatis 3 hari.
4. Saat konversi jadi PKWTT: pastikan **status_karyawan** diubah ke "PKWTT/KARTAP" — sistem langsung memberi 12 hari (walau belum 1 tahun).

**Atasan/Approver**
- Saat menyetujui cuti karyawan baru, perhatikan saldo: bulan 4–11 saldo kecil (3–10 hari); pengajuan melebihi saldo otomatis jatuh ke jalur **potong gaji** yang ada saat ini — pastikan karyawan sadar sebelum approve.

### 2.4 Contoh perhitungan cepat

Karyawan join **1 Maret 2026**:
- Juni 2026 (bulan ke-4 dari Maret) → jatah = **3 hari**.
- Juli → 4 hari; Agustus → 5 hari; … Februari 2027 (bulan ke-12) → **12 hari**.
- Tanggal 1 Maret 2027 (1 tahun) → tetap 12 hari & masuk siklus reset/carryover SK 018.

---

## Lampiran — Ringkasan teknis (untuk admin/IT)

- Logika masa kerja: `js/leave-entitlement.mjs` (fungsi `getAutoJatahTahunan`, `monthsSinceJoin`, `describeAnnualLeaveTier`).
- Titik integrasi: `js/utils.js` → `getCalculatedJatahCuti` (dipakai semua menu: Cuti, Pengajuan, Pengajuan Cuti, PDF, riwayat).
- Gate form cuti: `js/views/pengajuan-cuti.js` (peringatan real-time + blokir submit bulan 1–3).
- Banner form pengajuan umum: `js/views/pengajuan.js`.
- Tes otomatis: `tests/leave-entitlement.test.mjs` (`npm test` — 213 tes hijau).
- Alur koordinasi & audit: `js/views/penilaian-kontrak.js`, `js/contract-coordination.mjs`, `js/kpi-scoring.mjs`.
