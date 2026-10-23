# Laporan Update Kontrak Karyawan

- Waktu: 2026-10-23T06:34:58.087Z
- Project: `gen-lang-client-0670613891`
- Database: `ai-studio-ajhris-b3979000-ada8-4821-9f1a-49af228e2acb`
- Sumber: `C:\Users\Ryzen\Downloads\Data Kontrak AJ.csv`
- Mode: **DRY RUN (tidak menulis)**
- Run ID: `20261023T063458Z`

## Ringkasan

| Item | Jumlah |
|---|---:|
| Karyawan di CSV | 77 |
| Baris kontrak di CSV | 177 |
| Dokumen master_kontrak saat ini | 128 |
| Dokumen master_karyawan saat ini | 72 |
| Dokumen lama yang diarsipkan/dihapus | 104 |
| master_karyawan diperbarui | 68 |
| master_karyawan baru | 9 |
| Karyawan master tidak ada di CSV (dibiarkan) | 4 |
| Dokumen kontrak lain (dibiarkan) | 24 |

## Dokumen Lama Tanpa NIK yang Dicocokkan via Nama (Fuzzy)

- `KTR-1785398708304-938` "SURYA MAULANA DWI PUTRA" -> 1072602040 SURYA MAULANA DWI SAHPUTRA (kemiripan 0.885; 2026-07-30 s/d 2026-10-30 vs 2026-07-31 s/d 2026-10-31; selisih mulai 1.0 hari, overlap 0.99)
- `2a140e43-4d55-41f3-b4ed-af3b8b5a708d` "NASRULLAH" -> 1052506990 NASRULLOH (kemiripan 0.889; 2025-05-06 s/d 2025-08-06 vs 2025-05-02 s/d 2025-08-02; selisih mulai 4.0 hari, overlap 0.96)
- `5da2b822-0645-4fb0-b4bc-090ac6440441` "NASRULLAH" -> 1052506990 NASRULLOH (kemiripan 0.889; 2025-08-06 s/d 2025-11-06 vs 2025-08-02 s/d 2025-11-02; selisih mulai 4.0 hari, overlap 0.96)

## Anomali & Normalisasi

- Tanggal Excel serial dikonversi: **1**
  - 2031801860 ZAINUL ARIFIN: 43178 -> 2018-03-19, 46318 -> 2026-10-23
- Baris tanpa tanggal mulai: **1**
  - 1052204600 PHILIP TAMZIR (baris 66, kontrak ke-1)
- Tanggal akhir dihitung dari durasi: **4**
  - 2042505050 ALI AKBAR BREMORO: 2025-04-21 + 3 bulan = 2025-07-21
  - 2042505050 ALI AKBAR BREMORO: 2025-07-21 + 3 bulan = 2025-10-21
  - 2042505050 ALI AKBAR BREMORO: 2025-10-21 + 3 bulan = 2026-01-21
  - 2042505050 ALI AKBAR BREMORO: 2026-01-21 + 3 bulan = 2026-04-21
- Tanggal akhir lebih awal dari tanggal mulai: **1**
  - 2042505050 ALI AKBAR BREMORO (kontrak ke-6): 2026-07-21 s/d 2026-05-29
- Baris AKTIF ganda (dinormalkan hanya kontrak terakhir yang AKTIF): **2**
  - 1072505980 ASHIF SYIFAUL QULUB: 2 baris -> ke-5 2026-07-23..2026-10-23 | ke-6 2026-10-23..2027-04-23
  - 2042505050 ALI AKBAR BREMORO: 4 baris -> ke-1 2025-04-21..2025-07-21 | ke-2 2025-07-21..2025-10-21 | ke-3 2025-10-21..2026-01-21 | ke-4 2026-01-21..2026-04-21
- Kontrak terakhir AKTIF tetapi sudah lewat tanggal akhir: **0**
- Karyawan tanpa baris AKTIF: **9**
  - 1042506890 APID JUNAEDI: terakhir ke-2, 2025-07-23 s/d 2026-02-01, durasi PHK
  - 1082503870 ARIF JABIDI: terakhir ke-4, 2026-05-22 s/d 2026-07-31, durasi RESIGN
  - 1122507920 JUWITA WIDYA NINGRUM: terakhir ke-1, 2025-12-18 s/d 2026-02-18, durasi RESIGN
  - 1042310972 KANIA KARTIKA: terakhir ke-1, 2023-04-11 s/d 2026-02-14, durasi RESIGN
  - 1062408200 MARIA SHIONA RIKIN: terakhir ke-1, 2024-06-06 s/d 2026-05-23, durasi ~
  - 10323020900 SEPTIANI EFRATA LIUNESI: terakhir ke-1, 2023-08-22 s/d 2026-02-20, durasi RESIGN
  - 1897444501 AISYAHTUR RIDHO: terakhir ke-5, 2026-05-12 s/d 2026-06-10, durasi RESIGN
  - 2022503960 FARICH ABDUS SHOMAD: terakhir ke-4, 2026-02-25 s/d 2026-08-25, durasi 6
  - 2082401030 GELORA CLAUDIO WARIYANDONO: terakhir ke-5, 2025-11-23 s/d -, durasi RESIGN
- PKWTT AKTIF: tanggal akhir dikosongkan: **41**

## Karyawan Baru (master_karyawan)

- 1042506890 APID JUNAEDI
- 1082503870 ARIF JABIDI
- 1122507920 JUWITA WIDYA NINGRUM
- 1042310972 KANIA KARTIKA
- 1062408200 MARIA SHIONA RIKIN
- 10323020900 SEPTIANI EFRATA LIUNESI
- 1122003990 VENNY PUTRI MARDELLA
- 2082401030 GELORA CLAUDIO WARIYANDONO
- 32019029 RIZKY KURNIAWAN

## master_karyawan yang Tidak Ada di CSV (dibiarkan)

- 2589 SOFYAN CHANDRA SOEHARTONO
- 01092606920 AYU RISNA YULIANA
- 20082606030 AHMAD PURNAMA GEGANA
- 2102614920 TEDDI NOOR KUSUMA

## Dokumen Kontrak Lama yang Diarsipkan

Total: **104** dokumen.
- 1062503910 AAS ASNAWI: 5 dokumen
- 1022602030 ADELITA FEBYANI: 2 dokumen
- 1897444501 AISYAHTUR RIDHO: 4 dokumen
- 2042505050 ALI AKBAR BREMORO: 4 dokumen
- 1082509980 AMALIATUL JANNAH: 2 dokumen
- 1062408930 ANGGA ARDIANSAH: 6 dokumen
- 1042506890 APID JUNAEDI: 3 dokumen
- ARIF JABIDI: 1 dokumen
- 1072505980 ASHIF SYIFAUL QULUB: 4 dokumen
- 1052611890 ASRI NOVITASARI: 2 dokumen
- 1042511940 EKO MIHARJO: 5 dokumen
- FARICH ABDUS SHOMAD: 4 dokumen
- 2082401030 GELORA CLAUDIO WARIYANDONO: 4 dokumen
- 1092402880 INDRA PURNAMA: 5 dokumen
- 1122507920 JUWITA WIDYA NINGRUM: 1 dokumen
- 1012610950 KURNIA DEWI UTAMI: 3 dokumen
- 1022612010 MALA TRI AYUNINGSIH: 1 dokumen
- MARIA SHIONA RIKIN: 2 dokumen
- 2042509000 MUHAMAD RAFI NUR ROHMAN: 4 dokumen
- MUHAMAD YUSUF: 2 dokumen
- NASRULLAH: 2 dokumen
- 1052506990 NASRULLOH: 4 dokumen
- 1072505910 RIESDIANTO: 5 dokumen
- 1112410850 RIFKI AKHSAN LESMANA: 5 dokumen
- SURYA MAULANA DWI PUTRA: 1 dokumen
- UDIN HERMANTO: 3 dokumen
- 1897444502 VEBY YOLANDA: 4 dokumen
- WAHYU DWI RENGGA: 6 dokumen
- 1052412970 WAHYUDI: 5 dokumen
- 109250781 YEYET YULIATY: 3 dokumen
- 20102607980 ZINEDINE RIZKY MAULANA: 2 dokumen

## Catatan

- Dokumen lama tidak dihapus permanen: disalin ke koleksi `master_kontrak_archive` dengan run ID `20261023T063458Z`.
- Backup JSON lengkap tersedia di `C:\Users\Ryzen\AJ-hris-repo\AJ-hris\backups\kontrak-20261023T063458Z`.
- Status kontrak: hanya baris terakhir per karyawan yang dapat berstatus AKTIF/SEGERA HABIS.
- PKWTT aktif disimpan tanpa tanggal akhir dan tanpa kontrak_habis.
- Data karyawan lain di luar CSV tidak diubah.
