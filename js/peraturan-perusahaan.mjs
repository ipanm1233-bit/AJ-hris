// Data Peraturan Perusahaan CV Andela Jaya — Draf Revisi 2026.
// Sumber: Analisa_PP_Andela_Jaya_2026 (laporan analisis, matriks kepatuhan,
// dan Draf Perubahan PP 2026). Data ini statis; tidak melakukan penulisan
// ke Firestore/Supabase dan tidak memicu layanan pembayaran.
//
// PENTING: naskah 2026 adalah DRAF dan belum berkekuatan hukum sampai
// disahkan oleh pejabat ketenagakerjaan yang berwenang.

export const PP_META = Object.freeze({
  "title": "Peraturan Perusahaan CV Andela Jaya",
  "edition": "Draf Revisi 2026",
  "period": "2026",
  "period_label": "2026 (Draf Revisi)",
  "status": "Draf – belum disahkan",
  "source": "Analisa PP Andela Jaya 2026 (16 Oktober 2026)",
  "unit": "Cirebon (Jawa Barat) dan Malang (Jawa Timur)",
  "total_articles": 75,
  "total_bab": 15,
  "approved_note": "Belum berkekuatan hukum sebelum dibahas dengan wakil pekerja/serikat pekerja, ditandatangani pengurus yang berwenang, dan disahkan pejabat ketenagakerjaan."
});

export const PP_BABS = Object.freeze([
  {
    "nomor": 1,
    "judul": "Ketentuan Umum",
    "kategori": "Ketentuan Umum",
    "jumlah_pasal": 3
  },
  {
    "nomor": 2,
    "judul": "Perjanjian Kerja",
    "kategori": "Perjanjian Kerja",
    "jumlah_pasal": 4
  },
  {
    "nomor": 3,
    "judul": "Hak dan Kewajiban Pekerja",
    "kategori": "Hak & Kewajiban",
    "jumlah_pasal": 4
  },
  {
    "nomor": 4,
    "judul": "Larangan bagi Pekerja",
    "kategori": "Larangan",
    "jumlah_pasal": 4
  },
  {
    "nomor": 5,
    "judul": "Jabatan",
    "kategori": "Jabatan",
    "jumlah_pasal": 3
  },
  {
    "nomor": 6,
    "judul": "Pengembangan Kemampuan",
    "kategori": "Pengembangan",
    "jumlah_pasal": 2
  },
  {
    "nomor": 7,
    "judul": "Pengupahan dan Lembur",
    "kategori": "Pengupahan & Lembur",
    "jumlah_pasal": 4
  },
  {
    "nomor": 8,
    "judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "jumlah_pasal": 7
  },
  {
    "nomor": 9,
    "judul": "Perjalanan Dinas",
    "kategori": "Perjalanan Dinas",
    "jumlah_pasal": 1
  },
  {
    "nomor": 10,
    "judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "jumlah_pasal": 6
  },
  {
    "nomor": 11,
    "judul": "Cuti",
    "kategori": "Cuti",
    "jumlah_pasal": 4
  },
  {
    "nomor": 12,
    "judul": "Sanksi dan Penyelesaian",
    "kategori": "Sanksi & Disiplin",
    "jumlah_pasal": 3
  },
  {
    "nomor": 13,
    "judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "jumlah_pasal": 22
  },
  {
    "nomor": 14,
    "judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "jumlah_pasal": 7
  },
  {
    "nomor": 15,
    "judul": "Penutup",
    "kategori": "Penutup",
    "jumlah_pasal": 1
  }
]);

export const PP_ARTICLES = Object.freeze([
  {
    "id": "pp-1",
    "bab": 1,
    "bab_judul": "Ketentuan Umum",
    "kategori": "Ketentuan Umum",
    "pasal": 1,
    "judul": "Pengertian",
    "label": "Pasal 1 — Pengertian",
    "ayat": [
      "(1) Perusahaan adalah CV Andela Jaya, perusahaan perdagangan dan distribusi bahan bangunan yang beroperasi di Cirebon dan Malang. Pengusaha adalah pengurus atau pihak yang sah mewakili CV Andela Jaya berdasarkan akta dan kuasa tertulis.",
      "(2) Pekerja adalah setiap orang yang bekerja pada Perusahaan dengan menerima upah berdasarkan perjanjian kerja waktu tertentu (PKWT) atau perjanjian kerja waktu tidak tertentu (PKWTT). Hubungan kerja tidak ditentukan semata-mata oleh ada atau tidaknya surat keputusan pengangkatan.",
      "(3) Hari kerja, masa kerja, upah, tunjangan tetap, tunjangan tidak tetap, dan keluarga mengikuti definisi peraturan perundang-undangan serta dokumen kerja yang sah.",
      "(4) Identitas akta pendirian dalam naskah 2024-2025 tercatat sebagai nomor 200/2009/CV di hadapan Notaris Sioni Andreas, S.H.; nomor, tanggal, perubahan akta, dan kewenangan pengurus diverifikasi terhadap dokumen perusahaan sebelum pengesahan."
    ],
    "ringkasan": "Perusahaan adalah CV Andela Jaya, perusahaan perdagangan dan distribusi bahan bangunan yang beroperasi di Cirebon dan Malang. Pengusaha adalah pengurus atau pihak yang sah mewakili CV Andela Jaya berdasarkan akta dan kuasa tertulis.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "Definisi hubungan kerja tidak lagi bergantung pada surat keputusan pengangkatan.",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-2",
    "bab": 1,
    "bab_judul": "Ketentuan Umum",
    "kategori": "Ketentuan Umum",
    "pasal": 2,
    "judul": "Maksud dan Tujuan",
    "label": "Pasal 2 — Maksud dan Tujuan",
    "ayat": [
      "(1) Peraturan Perusahaan ini menetapkan syarat kerja, hak dan kewajiban para pihak, serta tata tertib untuk mewujudkan hubungan industrial yang adil, keselamatan kerja, kepastian administrasi, dan produktivitas."
    ],
    "ringkasan": "Peraturan Perusahaan ini menetapkan syarat kerja, hak dan kewajiban para pihak, serta tata tertib untuk mewujudkan hubungan industrial yang adil, keselamatan kerja, kepastian administrasi, dan produktivitas.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-3",
    "bab": 1,
    "bab_judul": "Ketentuan Umum",
    "kategori": "Ketentuan Umum",
    "pasal": 3,
    "judul": "Ruang Lingkup dan Kedudukan",
    "label": "Pasal 3 — Ruang Lingkup dan Kedudukan",
    "ayat": [
      "(1) Peraturan ini berlaku bagi seluruh pekerja di seluruh unit Perusahaan sejak tanggal efektif yang tercantum dalam keputusan pengesahan.",
      "(2) Ketentuan teknis dapat diatur dalam keputusan pengurus atau prosedur tertulis sepanjang tidak mengurangi hak yang diberikan oleh peraturan perundang-undangan, perjanjian kerja, atau Peraturan Perusahaan ini.",
      "(3) Apabila terdapat ketentuan yang lebih rendah dari ketentuan perundang-undangan, berlaku ketentuan perundang-undangan. Hak yang telah diperjanjikan atau dilaksanakan secara lebih baik harus ditelaah dan dipenuhi sesuai dasar berlakunya."
    ],
    "ringkasan": "Peraturan ini berlaku bagi seluruh pekerja di seluruh unit Perusahaan sejak tanggal efektif yang tercantum dalam keputusan pengesahan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-4",
    "bab": 2,
    "bab_judul": "Perjanjian Kerja",
    "kategori": "Perjanjian Kerja",
    "pasal": 4,
    "judul": "Hubungan Kerja dan Perjanjian Kerja",
    "label": "Pasal 4 — Hubungan Kerja dan Perjanjian Kerja",
    "ayat": [
      "(1) Hubungan kerja lahir karena perjanjian kerja antara Perusahaan dan pekerja yang memenuhi unsur pekerjaan, upah, dan perintah.",
      "(2) Jenis hubungan kerja terdiri atas PKWT dan PKWTT. Perjanjian kerja dibuat sesuai bentuk yang diwajibkan hukum; khusus PKWT wajib tertulis dalam bahasa Indonesia dan huruf Latin.",
      "(3) Perusahaan menyerahkan salinan perjanjian atau surat pengangkatan kepada pekerja dan mencatat jabatan, lokasi kerja, komponen upah, waktu kerja, serta hak lainnya secara jelas."
    ],
    "ringkasan": "Hubungan kerja lahir karena perjanjian kerja antara Perusahaan dan pekerja yang memenuhi unsur pekerjaan, upah, dan perintah.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-5",
    "bab": 2,
    "bab_judul": "Perjanjian Kerja",
    "kategori": "Perjanjian Kerja",
    "pasal": 5,
    "judul": "Perjanjian Kerja Waktu Tertentu",
    "label": "Pasal 5 — Perjanjian Kerja Waktu Tertentu",
    "ayat": [
      "(1) PKWT hanya digunakan untuk pekerjaan tertentu yang menurut jenis, sifat, atau kegiatannya diperkirakan selesai dalam waktu tertentu dan tidak digunakan untuk pekerjaan yang bersifat tetap. PKWT dapat didasarkan atas jangka waktu atau selesainya pekerjaan tertentu sesuai PP 35 Tahun 2021.",
      "(2) PKWT berdasarkan jangka waktu, termasuk seluruh perpanjangannya, berlangsung paling lama 5 tahun. PKWT berdasarkan selesainya pekerjaan memuat ruang lingkup dan batas penyelesaian yang disepakati. PKWT tidak boleh mensyaratkan masa percobaan.",
      "(3) Perusahaan mencatatkan PKWT secara daring paling lama 3 hari kerja setelah penandatanganan, atau secara tertulis kepada dinas kabupaten atau kota paling lama 7 hari kerja apabila sistem daring belum tersedia. Perubahan dan perpanjangan didokumentasikan.",
      "(4) Masa kerja yang dijalani dalam PKWT diperhitungkan untuk hak yang mensyaratkan masa kerja menurut ketentuan yang berlaku. Pada akhir masa PKWT dan setiap akhir jangka waktu sebelum perpanjangan, Perusahaan membayar uang kompensasi PKWT sesuai Pasal 15-16 PP 35 Tahun 2021 dan Pasal 60 Peraturan ini.",
      "(5) Untuk PKWT yang didasarkan pada selesainya pekerjaan tertentu, jangka waktu penyelesaian termasuk perpanjangan tidak melebihi 5 tahun sesuai pemaknaan Putusan MK Nomor 168/PUU-XXI/2023. Pekerjaan dan alasan penggunaan PKWT harus dapat dibuktikan secara nyata."
    ],
    "ringkasan": "PKWT hanya digunakan untuk pekerjaan tertentu yang menurut jenis, sifat, atau kegiatannya diperkirakan selesai dalam waktu tertentu dan tidak digunakan untuk pekerjaan yang bersifat tetap. PKWT dapat didasarkan atas jangka waktu atau selesa",
    "dasar_hukum": [
      "PP 35 Tahun 2021",
      "Putusan MK Nomor 168/PUU-XXI/2023",
      "PP 35/2021 Pasal 5-16",
      "Putusan MK 168/PUU-XXI/2023"
    ],
    "referensi": [
      15,
      60
    ],
    "perubahan": "Masa PKWT dihitung sebagai masa kerja, batas 5 tahun termasuk perpanjangan, dan ada uang kompensasi PKWT.",
    "catatan": "",
    "tags": [
      "PKWT",
      "kompensasi"
    ],
    "disiplin": null
  },
  {
    "id": "pp-6",
    "bab": 2,
    "bab_judul": "Perjanjian Kerja",
    "kategori": "Perjanjian Kerja",
    "pasal": 6,
    "judul": "Perjanjian Kerja Waktu Tidak Tertentu",
    "label": "Pasal 6 — Perjanjian Kerja Waktu Tidak Tertentu",
    "ayat": [
      "(1) PKWTT berlaku untuk hubungan kerja yang tidak dibatasi jangka waktu. Jika dibuat lisan, Perusahaan menerbitkan surat pengangkatan yang memuat identitas pekerja, tanggal mulai bekerja, jenis pekerjaan, dan besarnya upah.",
      "(2) Masa percobaan hanya dapat diterapkan untuk PKWTT jika dinyatakan secara tertulis, paling lama 3 bulan. Selama masa percobaan pekerja menerima upah tidak kurang dari upah minimum yang berlaku dan seluruh perlindungan kerja yang diwajibkan hukum."
    ],
    "ringkasan": "PKWTT berlaku untuk hubungan kerja yang tidak dibatasi jangka waktu. Jika dibuat lisan, Perusahaan menerbitkan surat pengangkatan yang memuat identitas pekerja, tanggal mulai bekerja, jenis pekerjaan, dan besarnya upah.",
    "dasar_hukum": [
      "UU 13/2003 Pasal 56, 59-60, 63",
      "PP 35/2021"
    ],
    "referensi": [],
    "perubahan": "PKWTT diatur ulang; masa percobaan maksimal 3 bulan dan wajib tertulis.",
    "catatan": "",
    "tags": [
      "PKWTT",
      "probation"
    ],
    "disiplin": null
  },
  {
    "id": "pp-7",
    "bab": 2,
    "bab_judul": "Perjanjian Kerja",
    "kategori": "Perjanjian Kerja",
    "pasal": 7,
    "judul": "Penerimaan Pekerja",
    "label": "Pasal 7 — Penerimaan Pekerja",
    "ayat": [
      "(1) Penerimaan dilakukan sesuai kebutuhan jabatan melalui persyaratan dan seleksi yang objektif serta tidak diskriminatif. Perusahaan menjelaskan uraian pekerjaan, lokasi, jadwal, dan kompensasi kepada calon pekerja.",
      "(2) Pekerja PKWTT yang menyelesaikan masa percobaan tetap berada dalam hubungan kerja PKWTT; kelulusan dinilai secara tertulis. Surat keputusan administratif bukan syarat lahirnya hak yang sudah timbul."
    ],
    "ringkasan": "Penerimaan dilakukan sesuai kebutuhan jabatan melalui persyaratan dan seleksi yang objektif serta tidak diskriminatif. Perusahaan menjelaskan uraian pekerjaan, lokasi, jadwal, dan kompensasi kepada calon pekerja.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-8",
    "bab": 3,
    "bab_judul": "Hak dan Kewajiban Pekerja",
    "kategori": "Hak & Kewajiban",
    "pasal": 8,
    "judul": "Hak Pekerja",
    "label": "Pasal 8 — Hak Pekerja",
    "ayat": [
      "(1) Pekerja berhak menerima pekerjaan dan upah sesuai perjanjian, waktu istirahat dan cuti, jaminan sosial, perlindungan keselamatan dan kesehatan kerja, serta perlakuan tanpa kekerasan, pelecehan, atau diskriminasi.",
      "(2) Perusahaan menanggung biaya pembelaan hukum yang diperlukan dalam perkara yang timbul dari pelaksanaan tugas resmi dan bukan akibat tindakan pribadi yang melawan hukum, berdasarkan keputusan tertulis setelah pemeriksaan kasus."
    ],
    "ringkasan": "Pekerja berhak menerima pekerjaan dan upah sesuai perjanjian, waktu istirahat dan cuti, jaminan sosial, perlindungan keselamatan dan kesehatan kerja, serta perlakuan tanpa kekerasan, pelecehan, atau diskriminasi.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-9",
    "bab": 3,
    "bab_judul": "Hak dan Kewajiban Pekerja",
    "kategori": "Hak & Kewajiban",
    "pasal": 9,
    "judul": "Kewajiban Melaksanakan Tugas",
    "label": "Pasal 9 — Kewajiban Melaksanakan Tugas",
    "ayat": [
      "(1) Pekerja melaksanakan tugas dengan jujur, tertib, cermat, dan bertanggung jawab; menjaga hubungan kerja yang baik; serta menggunakan waktu, informasi, dan fasilitas kerja untuk kepentingan pekerjaan.",
      "(2) Pekerja yang membawahi pekerja lain wajib memberi petunjuk, penilaian yang adil, kesempatan pengembangan, dan contoh pelaksanaan tata tertib yang baik."
    ],
    "ringkasan": "Pekerja melaksanakan tugas dengan jujur, tertib, cermat, dan bertanggung jawab; menjaga hubungan kerja yang baik; serta menggunakan waktu, informasi, dan fasilitas kerja untuk kepentingan pekerjaan.",
    "dasar_hukum": [
      "UU 13/2003 Pasal 102-103"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "Teguran / SP",
      "jenis": [
        "Kewajiban kerja"
      ],
      "catatan": "Tidak melaksanakan tugas dengan jujur, tertib, cermat, dan bertanggung jawab dapat ditindak secara proporsional setelah pemeriksaan."
    }
  },
  {
    "id": "pp-10",
    "bab": 3,
    "bab_judul": "Hak dan Kewajiban Pekerja",
    "kategori": "Hak & Kewajiban",
    "pasal": 10,
    "judul": "Tata Tertib dan Keselamatan Kerja",
    "label": "Pasal 10 — Tata Tertib dan Keselamatan Kerja",
    "ayat": [
      "(1) Pekerja memeriksa alat kerja, memelihara ketertiban dan kebersihan, menggunakan alat pelindung diri yang disediakan Perusahaan, dan segera melaporkan kondisi berbahaya, kecelakaan, atau kerusakan.",
      "(2) Perusahaan menyediakan alat pelindung diri dan pelatihan keselamatan yang diperlukan tanpa membebankan biayanya kepada pekerja. Instruksi keselamatan di gudang, kendaraan, dan pengiriman dituangkan dalam prosedur kerja yang disosialisasikan.",
      "(3) Pekerja menjaga kesopanan perilaku dan pakaian kerja yang ditetapkan secara wajar; perlengkapan kerja dan alat pelindung diri khusus disediakan Perusahaan."
    ],
    "ringkasan": "Pekerja memeriksa alat kerja, memelihara ketertiban dan kebersihan, menggunakan alat pelindung diri yang disediakan Perusahaan, dan segera melaporkan kondisi berbahaya, kecelakaan, atau kerusakan.",
    "dasar_hukum": [
      "UU 1/1970",
      "PP 35/2021 Pasal 22-25"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "Teguran / SP",
      "jenis": [
        "Tata tertib",
        "K3"
      ],
      "catatan": "Pelanggaran tata tertib, tidak memakai APD, atau tidak melaporkan kondisi berbahaya."
    }
  },
  {
    "id": "pp-11",
    "bab": 3,
    "bab_judul": "Hak dan Kewajiban Pekerja",
    "kategori": "Hak & Kewajiban",
    "pasal": 11,
    "judul": "Kerahasiaan Perusahaan",
    "label": "Pasal 11 — Kerahasiaan Perusahaan",
    "ayat": [
      "(1) Pekerja wajib menjaga data pribadi, rahasia dagang, informasi pelanggan dan pemasok, dokumen, serta akses sistem yang diperoleh karena pekerjaan. Penggunaan atau penyerahan kepada pihak lain harus berdasarkan kewenangan kerja.",
      "(2) Kewajiban ini tidak menghalangi pengungkapan yang diwajibkan hukum atau pelaporan dugaan pelanggaran dengan itikad baik kepada pihak yang berwenang. Saat hubungan kerja berakhir, pekerja mengembalikan dokumen, perangkat, dan akses milik Perusahaan."
    ],
    "ringkasan": "Pekerja wajib menjaga data pribadi, rahasia dagang, informasi pelanggan dan pemasok, dokumen, serta akses sistem yang diperoleh karena pekerjaan. Penggunaan atau penyerahan kepada pihak lain harus berdasarkan kewenangan kerja.",
    "dasar_hukum": [
      "UU 30/2000",
      "UU 13/2003"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "SP / PHK",
      "jenis": [
        "Kerahasiaan"
      ],
      "catatan": "Membocorkan data atau rahasia perusahaan; berat ringannya bergantung pada dampak dan bukti."
    }
  },
  {
    "id": "pp-12",
    "bab": 4,
    "bab_judul": "Larangan bagi Pekerja",
    "kategori": "Larangan",
    "pasal": 12,
    "judul": "Penggunaan Milik Perusahaan",
    "label": "Pasal 12 — Penggunaan Milik Perusahaan",
    "ayat": [
      "(1) Pekerja dilarang mengalihkan, menjual, menggadaikan, menyewakan, membawa keluar tanpa izin, atau menggunakan aset dan data Perusahaan untuk kepentingan pribadi yang tidak disetujui.",
      "(2) Serah terima dan pemeriksaan inventaris dibuat tertulis. Tuntutan ganti rugi didasarkan pada bukti kerugian dan pertanggungjawaban yang proporsional; pemotongan upah hanya dilakukan menurut ketentuan pengupahan dan kesepakatan yang sah.",
      "(3) Aset inventaris mencakup barang bekas pakai dan barang yang tidak digunakan lagi sampai status penghapusannya ditetapkan secara tertulis."
    ],
    "ringkasan": "Pekerja dilarang mengalihkan, menjual, menggadaikan, menyewakan, membawa keluar tanpa izin, atau menggunakan aset dan data Perusahaan untuk kepentingan pribadi yang tidak disetujui.",
    "dasar_hukum": [
      "PP 36/2021 Pasal 57-65"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "SP / PHK",
      "jenis": [
        "Aset perusahaan"
      ],
      "catatan": "Menyalahgunakan atau membawa keluar aset tanpa izin; ganti rugi hanya berdasarkan bukti dan proporsional."
    }
  },
  {
    "id": "pp-13",
    "bab": 4,
    "bab_judul": "Larangan bagi Pekerja",
    "kategori": "Larangan",
    "pasal": 13,
    "judul": "Pencegahan Bahaya Kebakaran",
    "label": "Pasal 13 — Pencegahan Bahaya Kebakaran",
    "ayat": [
      "(1) Merokok di area terlarang, menyalakan sumber api tanpa izin, serta tindakan lain yang meningkatkan risiko kebakaran dilarang. Perusahaan memberi tanda area, alat pemadam, dan prosedur tanggap darurat.",
      "(2) Setiap kejadian diperiksa dengan kesempatan bagi pekerja memberi penjelasan. Pelanggaran dapat dikenai sanksi atau diproses untuk PHK sesuai ketentuan; tidak ada PHK atau penggantian kerugian yang berlaku otomatis tanpa prosedur."
    ],
    "ringkasan": "Merokok di area terlarang, menyalakan sumber api tanpa izin, serta tindakan lain yang meningkatkan risiko kebakaran dilarang. Perusahaan memberi tanda area, alat pemadam, dan prosedur tanggap darurat.",
    "dasar_hukum": [
      "PP 35/2021 Pasal 52",
      "UU 13/2003 Pasal 155"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "SP / PHK",
      "jenis": [
        "Kebakaran",
        "K3"
      ],
      "catatan": "Merokok di area terlarang atau menyalakan api tanpa izin; tidak ada PHK otomatis tanpa prosedur."
    }
  },
  {
    "id": "pp-14",
    "bab": 4,
    "bab_judul": "Larangan bagi Pekerja",
    "kategori": "Larangan",
    "pasal": 14,
    "judul": "Larangan Menerima Pemberian",
    "label": "Pasal 14 — Larangan Menerima Pemberian",
    "ayat": [
      "(1) Pekerja dilarang meminta atau menerima komisi, uang, hadiah, fasilitas, atau manfaat lain yang berkaitan dengan keputusan pembelian, penjualan, penagihan, atau tugasnya tanpa persetujuan tertulis Perusahaan.",
      "(2) Hadiah yang tidak dapat ditolak seketika wajib dilaporkan kepada atasan atau HR untuk diputuskan penanganannya menurut kebijakan benturan kepentingan."
    ],
    "ringkasan": "Pekerja dilarang meminta atau menerima komisi, uang, hadiah, fasilitas, atau manfaat lain yang berkaitan dengan keputusan pembelian, penjualan, penagihan, atau tugasnya tanpa persetujuan tertulis Perusahaan.",
    "dasar_hukum": [
      "UU 13/2003 Pasal 160"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "SP / PHK",
      "jenis": [
        "Benturan kepentingan"
      ],
      "catatan": "Meminta/menerima komisi atau hadiah terkait tugas tanpa persetujuan tertulis."
    }
  },
  {
    "id": "pp-15",
    "bab": 4,
    "bab_judul": "Larangan bagi Pekerja",
    "kategori": "Larangan",
    "pasal": 15,
    "judul": "Pekerjaan Lain dan Benturan Kepentingan",
    "label": "Pasal 15 — Pekerjaan Lain dan Benturan Kepentingan",
    "ayat": [
      "(1) Pekerja wajib mengungkap usaha atau pekerjaan lain yang bersaing langsung, menggunakan aset atau data Perusahaan, atau mengganggu jadwal dan pelaksanaan tugas. Perusahaan menilai konflik kepentingan secara objektif.",
      "(2) Pekerjaan lain yang tidak menimbulkan konflik dan dilakukan di luar jam kerja tidak dilarang secara otomatis. Persetujuan atau pembatasan dituangkan tertulis dan diterapkan proporsional.",
      "(3) Bila Perusahaan memberikan izin tertulis atas kegiatan rangkap yang berpotensi mengganggu pekerjaan, syarat izin, termasuk batas kegiatan 6 jam seminggu dalam kebijakan lama, dinyatakan secara jelas dan tidak membatasi kegiatan pribadi yang tidak berkaitan dengan pekerjaan."
    ],
    "ringkasan": "Pekerja wajib mengungkap usaha atau pekerjaan lain yang bersaing langsung, menggunakan aset atau data Perusahaan, atau mengganggu jadwal dan pelaksanaan tugas. Perusahaan menilai konflik kepentingan secara objektif.",
    "dasar_hukum": [
      "UU 13/2003 Pasal 160 ayat (4)"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "SP",
      "jenis": [
        "Benturan kepentingan",
        "Kerja rangkap"
      ],
      "catatan": "Tidak mengungkap pekerjaan lain yang berkonflik; kegiatan pribadi di luar jam kerja tidak otomatis dilarang."
    }
  },
  {
    "id": "pp-16",
    "bab": 5,
    "bab_judul": "Jabatan",
    "kategori": "Jabatan",
    "pasal": 16,
    "judul": "Penetapan Jabatan",
    "label": "Pasal 16 — Penetapan Jabatan",
    "ayat": [
      "(1) Pengurus Perusahaan menetapkan struktur organisasi, persyaratan jabatan, uraian tugas, serta hubungan pelaporan menurut kebutuhan usaha.",
      "(2) Penempatan memperhatikan kompetensi dan syarat kerja yang telah disepakati. Perubahan penting disampaikan kepada pekerja secara tertulis."
    ],
    "ringkasan": "Pengurus Perusahaan menetapkan struktur organisasi, persyaratan jabatan, uraian tugas, serta hubungan pelaporan menurut kebutuhan usaha.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-17",
    "bab": 5,
    "bab_judul": "Jabatan",
    "kategori": "Jabatan",
    "pasal": 17,
    "judul": "Jenis Perubahan Jabatan",
    "label": "Pasal 17 — Jenis Perubahan Jabatan",
    "ayat": [
      "(1) Promosi adalah penempatan pada jabatan lebih tinggi; mutasi adalah perpindahan pada jabatan setara; demosi adalah penempatan pada jabatan lebih rendah berdasarkan evaluasi yang dapat dijelaskan.",
      "(2) Perubahan jabatan tidak boleh menjadi sarana diskriminasi atau hukuman tanpa pemeriksaan. Perubahan lokasi, upah, atau syarat pokok lain mengikuti perjanjian kerja dan ketentuan penyelesaian perselisihan."
    ],
    "ringkasan": "Promosi adalah penempatan pada jabatan lebih tinggi; mutasi adalah perpindahan pada jabatan setara; demosi adalah penempatan pada jabatan lebih rendah berdasarkan evaluasi yang dapat dijelaskan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-18",
    "bab": 5,
    "bab_judul": "Jabatan",
    "kategori": "Jabatan",
    "pasal": 18,
    "judul": "Prosedur Perubahan Jabatan",
    "label": "Pasal 18 — Prosedur Perubahan Jabatan",
    "ayat": [
      "(1) Atasan mengajukan usulan tertulis dengan alasan, penilaian kinerja, jabatan tujuan, tanggal efektif, lokasi, dan perubahan hak. HR memeriksa konsistensinya sebelum keputusan pengurus disampaikan kepada pekerja.",
      "(2) Orientasi jabatan dapat diberikan selama 3 bulan dan diperpanjang sekali sampai paling lama 6 bulan; orientasi bukan masa percobaan hubungan kerja baru. Besaran upah dan tunjangan selama orientasi dinyatakan tertulis sebelum penempatan.",
      "(3) Jika orientasi tidak berhasil, penempatan selanjutnya dibicarakan dengan pekerja; pengembalian ke jabatan semula dilakukan bila posisi dan syaratnya masih tersedia atau disepakati alternatif yang sah.",
      "(4) Untuk promosi, naskah lama menjamin upah pokok tetap selama orientasi dan tunjangan jabatan baru disesuaikan; penyesuaian upah pokok setelah berhasil menjalani orientasi ditetapkan tertulis tanpa mengurangi upah yang telah disepakati."
    ],
    "ringkasan": "Atasan mengajukan usulan tertulis dengan alasan, penilaian kinerja, jabatan tujuan, tanggal efektif, lokasi, dan perubahan hak. HR memeriksa konsistensinya sebelum keputusan pengurus disampaikan kepada pekerja.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-19",
    "bab": 6,
    "bab_judul": "Pengembangan Kemampuan",
    "kategori": "Pengembangan",
    "pasal": 19,
    "judul": "Penilaian Prestasi Kerja",
    "label": "Pasal 19 — Penilaian Prestasi Kerja",
    "ayat": [
      "(1) Atasan menilai kinerja pekerja secara berkala menggunakan indikator pekerjaan, hasil, perilaku kerja, dan bukti yang relevan. Pekerja diberi kesempatan melihat hasil dan menyampaikan tanggapan.",
      "(2) Hasil dapat digunakan untuk pembinaan, pengembangan, promosi, serta pertimbangan kenaikan upah atau bonus sesuai kebijakan yang diumumkan."
    ],
    "ringkasan": "Atasan menilai kinerja pekerja secara berkala menggunakan indikator pekerjaan, hasil, perilaku kerja, dan bukti yang relevan. Pekerja diberi kesempatan melihat hasil dan menyampaikan tanggapan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-20",
    "bab": 6,
    "bab_judul": "Pengembangan Kemampuan",
    "kategori": "Pengembangan",
    "pasal": 20,
    "judul": "Peningkatan Kemampuan Pekerja",
    "label": "Pasal 20 — Peningkatan Kemampuan Pekerja",
    "ayat": [
      "(1) Perusahaan dapat menugaskan pekerja mengikuti pendidikan dan pelatihan yang terkait pekerjaan. Biaya penugasan ditanggung Perusahaan dan hak upah tetap diberikan selama waktu pelatihan yang ditugaskan.",
      "(2) Apabila ada ikatan dinas setelah pelatihan khusus, biaya yang termasuk, lama ikatan, serta konsekuensi pengakhiran disepakati terpisah secara tertulis dan proporsional.",
      "(3) Selama pendidikan yang ditugaskan Perusahaan, seluruh fasilitas dan tunjangan yang menjadi hak pekerja tetap diberikan sesuai syaratnya."
    ],
    "ringkasan": "Perusahaan dapat menugaskan pekerja mengikuti pendidikan dan pelatihan yang terkait pekerjaan. Biaya penugasan ditanggung Perusahaan dan hak upah tetap diberikan selama waktu pelatihan yang ditugaskan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-21",
    "bab": 7,
    "bab_judul": "Pengupahan dan Lembur",
    "kategori": "Pengupahan & Lembur",
    "pasal": 21,
    "judul": "Penetapan Upah",
    "label": "Pasal 21 — Penetapan Upah",
    "ayat": [
      "(1) Perusahaan menyusun struktur dan skala upah berdasarkan jabatan, masa kerja, kompetensi, dan kinerja. Upah minimum yang berlaku di lokasi kerja diterapkan menurut peraturan pengupahan, terutama bagi pekerja dengan masa kerja kurang dari 1 tahun.",
      "(2) Bagi pekerja dengan masa kerja 1 tahun atau lebih, penetapan dan penyesuaian upah berpedoman pada struktur dan skala upah. Peninjauan upah memperhatikan hasil kerja, kemampuan Perusahaan, serta ketentuan hukum; peninjauan kenaikan upah dilakukan sekali pada awal tahun sebagaimana kebijakan lama; keputusan dan besar kenaikan ditetapkan tertulis, tanpa mengurangi hak yang telah dijanjikan.",
      "(3) Struktur dan skala upah disusun secara proporsional dengan memperhatikan kemampuan Perusahaan, produktivitas, golongan, jabatan, masa kerja, pendidikan, dan kompetensi. Perusahaan memeriksa upah minimum provinsi, kabupaten/kota, dan sektoral yang berlaku bagi jenis usaha serta lokasi kerja menurut PP 36 Tahun 2021 sebagaimana terakhir diubah PP 49 Tahun 2025 dan Putusan MK 168/PUU-XXI/2023."
    ],
    "ringkasan": "Perusahaan menyusun struktur dan skala upah berdasarkan jabatan, masa kerja, kompetensi, dan kinerja. Upah minimum yang berlaku di lokasi kerja diterapkan menurut peraturan pengupahan, terutama bagi pekerja dengan masa kerja kurang dari 1 t",
    "dasar_hukum": [
      "PP 36 Tahun 2021",
      "PP 49 Tahun 2025",
      "Putusan MK 168/PUU-XXI/2023"
    ],
    "referensi": [],
    "perubahan": "Struktur dan skala upah wajib; upah minimum terutama untuk masa kerja kurang dari 1 tahun.",
    "catatan": "",
    "tags": [
      "upah",
      "struktur skala upah"
    ],
    "disiplin": null
  },
  {
    "id": "pp-22",
    "bab": 7,
    "bab_judul": "Pengupahan dan Lembur",
    "kategori": "Pengupahan & Lembur",
    "pasal": 22,
    "judul": "Komponen Upah",
    "label": "Pasal 22 — Komponen Upah",
    "ayat": [
      "(1) Komponen upah setiap pekerja dicantumkan jelas dalam perjanjian atau surat pemberitahuan: upah pokok, tunjangan tetap, dan/atau tunjangan tidak tetap. Tunjangan jabatan atau keahlian diklasifikasikan berdasarkan sifat pembayaran yang sebenarnya.",
      "(2) Biaya komunikasi, perjalanan, bahan bakar, dan pengeluaran operasional yang diganti berdasarkan tugas dan bukti dibedakan dari unsur upah. Dasar perhitungan THR, lembur, iuran jaminan sosial, dan hak PHK mengikuti ketentuan masing-masing."
    ],
    "ringkasan": "Komponen upah setiap pekerja dicantumkan jelas dalam perjanjian atau surat pemberitahuan: upah pokok, tunjangan tetap, dan/atau tunjangan tidak tetap. Tunjangan jabatan atau keahlian diklasifikasikan berdasarkan sifat pembayaran yang sebena",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-23",
    "bab": 7,
    "bab_judul": "Pengupahan dan Lembur",
    "kategori": "Pengupahan & Lembur",
    "pasal": 23,
    "judul": "Pembayaran Upah",
    "label": "Pasal 23 — Pembayaran Upah",
    "ayat": [
      "(1) Upah dibayar setiap bulan melalui transfer pada tanggal 25. Apabila tanggal tersebut merupakan hari bank tidak beroperasi, Perusahaan mengatur pembayaran sehingga tetap dibayar paling lambat pada akhir bulan sebagaimana kebijakan lama, sepanjang memenuhi batas waktu pembayaran upah menurut hukum.",
      "(2) Pekerja menerima rincian komponen upah, tunjangan, iuran, pajak, dan potongan. Keterlambatan pembayaran dan pemotongan upah mengikuti ketentuan peraturan pengupahan."
    ],
    "ringkasan": "Upah dibayar setiap bulan melalui transfer pada tanggal 25. Apabila tanggal tersebut merupakan hari bank tidak beroperasi, Perusahaan mengatur pembayaran sehingga tetap dibayar paling lambat pada akhir bulan sebagaimana kebijakan lama, sepa",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-24",
    "bab": 7,
    "bab_judul": "Pengupahan dan Lembur",
    "kategori": "Pengupahan & Lembur",
    "pasal": 24,
    "judul": "Kerja Lembur",
    "label": "Pasal 24 — Kerja Lembur",
    "ayat": [
      "(1) Kerja lembur adalah pekerjaan di luar waktu kerja normal atau pada hari istirahat mingguan dan hari libur resmi. Lembur dilakukan atas perintah Pengusaha dan persetujuan pekerja secara tertulis atau melalui media digital yang dapat disimpan.",
      "(2) Lembur pada hari kerja paling lama 4 jam sehari dan 18 jam seminggu, di luar lembur pada hari istirahat mingguan atau hari libur resmi. Perusahaan mencatat waktu mulai, waktu selesai, istirahat, dan nama pekerja. Setiap waktu lembur yang sah dihitung menurut durasi sebenarnya; ambang minimal 1 jam tidak digunakan untuk menghapus hak.",
      "(3) Upah sejam adalah 1/173 upah sebulan. Pada hari kerja, jam lembur pertama dibayar 1,5 kali upah sejam dan tiap jam berikutnya 2 kali. Untuk pola 6 hari, kerja pada hari istirahat/libur: jam 1-7 dibayar 2 kali, jam 8 dibayar 3 kali, jam 9-11 dibayar 4 kali; apabila hari libur jatuh pada hari kerja terpendek: jam 1-5 dibayar 2 kali, jam 6 dibayar 3 kali, jam 7-9 dibayar 4 kali. Untuk pola 5 hari: jam 1-8 dibayar 2 kali, jam 9 dibayar 3 kali, jam 10-12 dibayar 4 kali.",
      "(4) Dasar upah lembur mencakup komponen menurut PP 35 Tahun 2021; apabila upah pokok dan tunjangan tetap kurang dari 75% seluruh upah, dasar minimalnya 75% seluruh upah. Lembur paling sedikit 4 jam disertai makanan/minuman paling sedikit 1.400 kilokalori yang tidak diganti uang, serta kesempatan istirahat secukupnya.",
      "(5) Pengecualian upah lembur hanya berlaku bagi pekerja golongan jabatan tertentu yang tanggung jawabnya sebagai pemikir, perencana, pelaksana dan/atau pengendali jalannya Perusahaan, waktu kerjanya tidak dapat dibatasi, serta menerima upah lebih tinggi, dengan pengaturan yang sah. Jabatan kasir, HR, purchasing, accounting, atau sales tidak otomatis dikecualikan hanya karena nama jabatan."
    ],
    "ringkasan": "Kerja lembur adalah pekerjaan di luar waktu kerja normal atau pada hari istirahat mingguan dan hari libur resmi. Lembur dilakukan atas perintah Pengusaha dan persetujuan pekerja secara tertulis atau melalui media digital yang dapat disimpan",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [],
    "perubahan": "Batas lembur 4 jam/hari dan 18 jam/minggu; pengecualian tidak lagi berdasarkan nama jabatan.",
    "catatan": "",
    "tags": [
      "lembur",
      "upah"
    ],
    "disiplin": null
  },
  {
    "id": "pp-25",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 25,
    "judul": "Jaminan Sosial",
    "label": "Pasal 25 — Jaminan Sosial",
    "ayat": [
      "(1) Perusahaan mendaftarkan pekerja yang memenuhi syarat pada BPJS Kesehatan dan program BPJS Ketenagakerjaan yang diwajibkan, termasuk JKK, JKM, JHT, JP, dan JKP menurut syarat masing-masing program.",
      "(2) Dasar upah, pembagian iuran, batas upah, pelaporan, serta manfaat mengikuti peraturan yang berlaku pada periode iuran. Perusahaan memberikan informasi kepesertaan dan memfasilitasi administrasi klaim.",
      "(3) Kepesertaan dan pemenuhan iuran program Jaminan Kehilangan Pekerjaan mengikuti PP 37 Tahun 2021 sebagaimana diubah PP 6 Tahun 2025. Bila terjadi PHK, HR memberikan dokumen hubungan kerja dan bukti PHK yang diperlukan serta informasi prosedur klaim tanpa menjanjikan manfaat kepada peserta yang tidak memenuhi syarat program."
    ],
    "ringkasan": "Perusahaan mendaftarkan pekerja yang memenuhi syarat pada BPJS Kesehatan dan program BPJS Ketenagakerjaan yang diwajibkan, termasuk JKK, JKM, JHT, JP, dan JKP menurut syarat masing-masing program.",
    "dasar_hukum": [
      "PP 37 Tahun 2021",
      "PP 6 Tahun 2025"
    ],
    "referensi": [],
    "perubahan": "Program JKP ditambahkan ke jaminan sosial.",
    "catatan": "",
    "tags": [
      "BPJS",
      "JKP",
      "jaminan sosial"
    ],
    "disiplin": null
  },
  {
    "id": "pp-26",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 26,
    "judul": "Tunjangan Hari Raya Keagamaan",
    "label": "Pasal 26 — Tunjangan Hari Raya Keagamaan",
    "ayat": [
      "(1) Pekerja PKWT atau PKWTT dengan masa kerja terus menerus paling sedikit 1 bulan berhak menerima THR keagamaan. Pekerja dengan masa kerja 12 bulan atau lebih menerima 1 bulan upah; masa kerja 1 bulan sampai kurang dari 12 bulan menerima masa kerja dibagi 12 dikali 1 bulan upah.",
      "(2) THR dibayar penuh paling lambat 7 hari sebelum hari raya keagamaan pekerja. Komponen upah dasar THR dan ketentuan bagi pekerja PKWTT yang hubungan kerjanya berakhir dalam 30 hari sebelum hari raya mengikuti Permenaker 6 Tahun 2016; ketentuan tersebut tidak berlaku dengan cara yang sama untuk PKWT yang berakhir sebelum hari raya.",
      "(3) Apabila Perusahaan selama ini memberikan THR lebih besar, hak yang telah ditetapkan atau disepakati tersebut tetap dipenuhi."
    ],
    "ringkasan": "Pekerja PKWT atau PKWTT dengan masa kerja terus menerus paling sedikit 1 bulan berhak menerima THR keagamaan. Pekerja dengan masa kerja 12 bulan atau lebih menerima 1 bulan upah; masa kerja 1 bulan sampai kurang dari 12 bulan menerima masa ",
    "dasar_hukum": [
      "Permenaker 6 Tahun 2016"
    ],
    "referensi": [],
    "perubahan": "THR berlaku untuk PKWT dan PKWTT; pekerja yang berhenti dalam 30 hari sebelum hari raya tetap berhak.",
    "catatan": "",
    "tags": [
      "THR"
    ],
    "disiplin": null
  },
  {
    "id": "pp-27",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 27,
    "judul": "Tunjangan Kematian dan Uang Duka",
    "label": "Pasal 27 — Tunjangan Kematian dan Uang Duka",
    "ayat": [
      "(1) Apabila pekerja meninggal dunia, Perusahaan membayar hak ahli waris menurut Pasal 51 Peraturan ini, upah bulan berjalan sebagaimana dijanjikan naskah lama dan hak lain yang telah timbul, serta membantu pengurusan manfaat BPJS yang memenuhi syarat.",
      "(2) Uang duka tambahan bagi ahli waris pekerja atau bagi pekerja yang pasangan, anak, atau orang tuanya meninggal ditetapkan dalam keputusan Perusahaan. Uang duka tambahan terpisah dari hak PHK dan manfaat jaminan sosial.",
      "(3) Naskah lama juga menyebut santunan kematian di samping uang duka. Santunan tambahan dari Perusahaan, bila terpisah dari manfaat Jaminan Kematian atau Jaminan Kecelakaan Kerja BPJS, tetap diberikan menurut keputusan yang telah berlaku; sumber, besaran, dan penerimanya harus ditegaskan sebelum pengesahan."
    ],
    "ringkasan": "Apabila pekerja meninggal dunia, Perusahaan membayar hak ahli waris menurut Pasal 51 Peraturan ini, upah bulan berjalan sebagaimana dijanjikan naskah lama dan hak lain yang telah timbul, serta membantu pengurusan manfaat BPJS yang memenuhi ",
    "dasar_hukum": [],
    "referensi": [
      51
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-28",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 28,
    "judul": "Hadiah Pernikahan",
    "label": "Pasal 28 — Hadiah Pernikahan",
    "ayat": [
      "(1) Pekerja yang telah bekerja sekurang-kurangnya 12 bulan berturut-turut dan melangsungkan pernikahan menerima hadiah pernikahan setelah menyerahkan bukti yang wajar. Besarannya ditetapkan dalam keputusan Perusahaan yang diumumkan."
    ],
    "ringkasan": "Pekerja yang telah bekerja sekurang-kurangnya 12 bulan berturut-turut dan melangsungkan pernikahan menerima hadiah pernikahan setelah menyerahkan bukti yang wajar. Besarannya ditetapkan dalam keputusan Perusahaan yang diumumkan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-29",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 29,
    "judul": "Hadiah Kelahiran",
    "label": "Pasal 29 — Hadiah Kelahiran",
    "ayat": [
      "(1) Pekerja yang telah bekerja sekurang-kurangnya 12 bulan berturut-turut menerima hadiah kelahiran anak setelah menyerahkan bukti kelahiran. Besarannya ditetapkan dalam keputusan Perusahaan yang diumumkan."
    ],
    "ringkasan": "Pekerja yang telah bekerja sekurang-kurangnya 12 bulan berturut-turut menerima hadiah kelahiran anak setelah menyerahkan bukti kelahiran. Besarannya ditetapkan dalam keputusan Perusahaan yang diumumkan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-30",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 30,
    "judul": "Pinjaman Pekerja",
    "label": "Pasal 30 — Pinjaman Pekerja",
    "ayat": [
      "(1) Perusahaan dapat memberikan pinjaman tanpa bunga untuk kebutuhan penting kepada pekerja dengan masa kerja sekurang-kurangnya 2 tahun, paling banyak 2 kali upah dan dilunasi paling lama 24 bulan, sepanjang kemampuan keuangan memungkinkan.",
      "(2) Jumlah, jadwal angsuran, dan cara pemotongan disepakati tertulis. Keseluruhan pemotongan upah tidak boleh melebihi batas menurut peraturan pengupahan. Pengajuan baru dipertimbangkan setelah pinjaman sebelumnya lunas dan telah lunas sekurang-kurangnya 3 bulan sebelum permohonan baru, sesuai kebijakan lama."
    ],
    "ringkasan": "Perusahaan dapat memberikan pinjaman tanpa bunga untuk kebutuhan penting kepada pekerja dengan masa kerja sekurang-kurangnya 2 tahun, paling banyak 2 kali upah dan dilunasi paling lama 24 bulan, sepanjang kemampuan keuangan memungkinkan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-31",
    "bab": 8,
    "bab_judul": "Kesejahteraan",
    "kategori": "Kesejahteraan",
    "pasal": 31,
    "judul": "Kesempatan Menyusui",
    "label": "Pasal 31 — Kesempatan Menyusui",
    "ayat": [
      "(1) Pekerja perempuan diberi kesempatan yang patut untuk menyusui atau memerah ASI selama waktu kerja. Perusahaan menyediakan tempat yang layak, aman, dan menjaga privasi serta lemari pendingin khusus ASI yang layak.",
      "(2) Pengaturan waktu dilakukan bersama atasan dengan memperhatikan kebutuhan ibu dan anak serta pekerjaan. Penggunaan hak ini tidak menghapus upah atau hak kerja.",
      "(3) Berdasarkan kebutuhan medis yang dibuktikan keterangan dokter, waktu istirahat atau pengurangan jam kerja untuk menyusui diatur tanpa pengurangan upah atau pembebanan hari kerja tambahan."
    ],
    "ringkasan": "Pekerja perempuan diberi kesempatan yang patut untuk menyusui atau memerah ASI selama waktu kerja. Perusahaan menyediakan tempat yang layak, aman, dan menjaga privasi serta lemari pendingin khusus ASI yang layak.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-32",
    "bab": 9,
    "bab_judul": "Perjalanan Dinas",
    "kategori": "Perjalanan Dinas",
    "pasal": 32,
    "judul": "Perjalanan Dinas",
    "label": "Pasal 32 — Perjalanan Dinas",
    "ayat": [
      "(1) Perjalanan dinas dilaksanakan berdasarkan surat tugas atau persetujuan atasan yang berwenang. Biaya transportasi, penginapan, uang harian, dan bukti pertanggungjawaban diatur dalam ketentuan tertulis Perusahaan.",
      "(2) Biaya yang wajar untuk pelaksanaan tugas resmi tidak dibebankan kepada pekerja."
    ],
    "ringkasan": "Perjalanan dinas dilaksanakan berdasarkan surat tugas atau persetujuan atasan yang berwenang. Biaya transportasi, penginapan, uang harian, dan bukti pertanggungjawaban diatur dalam ketentuan tertulis Perusahaan.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-33",
    "bab": 10,
    "bab_judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "pasal": 33,
    "judul": "Hari dan Jam Kerja",
    "label": "Pasal 33 — Hari dan Jam Kerja",
    "ayat": [
      "(1) Perusahaan menggunakan pola 6 hari kerja dengan waktu kerja paling lama 7 jam sehari dan 40 jam seminggu, atau pola 5 hari kerja dengan waktu kerja paling lama 8 jam sehari dan 40 jam seminggu. Pekerja memperoleh istirahat sekurang-kurangnya 30 menit setelah 4 jam kerja terus menerus; waktu istirahat tidak dihitung sebagai waktu kerja.",
      "(2) Jadwal kerja pola 6 (enam) hari ditetapkan sebagai berikut: Senin sampai dengan Jumat pukul 08.00 sampai dengan 16.00 dengan istirahat 1 (satu) jam sehingga waktu kerja 7 (tujuh) jam sehari, dan Sabtu pukul 08.00 sampai dengan 12.00 dengan waktu kerja 4 (empat) jam; seluruhnya 39 (tiga puluh sembilan) jam seminggu, atau variasi lain yang tidak melebihi 7 (tujuh) jam sehari dan 40 (empat puluh) jam seminggu. Jadwal tiap unit dan jabatan, termasuk shift, ditetapkan dan diumumkan tertulis. Setiap kelebihan waktu kerja di luar jadwal diperlakukan sebagai kerja lembur dan dibayar menurut Pasal 24.",
      "(3) Waktu istirahat mingguan adalah 1 hari untuk pola 6 hari kerja atau 2 hari untuk pola 5 hari kerja. Pekerja yang bertugas di luar kantor tetap mengikuti pencatatan waktu yang sesuai jenis pekerjaannya.",
      "(4) Pekerja yang telah bekerja 6 (enam) tahun secara terus menerus berhak atas istirahat panjang paling sedikit 2 (dua) bulan pada tahun ketujuh dan kedelapan masa kerja, yang pelaksanaannya diatur menurut perjanjian kerja, Peraturan Perusahaan, atau kebijakan Perusahaan tanpa mengurangi ketentuan peraturan perundang-undangan."
    ],
    "ringkasan": "Perusahaan menggunakan pola 6 hari kerja dengan waktu kerja paling lama 7 jam sehari dan 40 jam seminggu, atau pola 5 hari kerja dengan waktu kerja paling lama 8 jam sehari dan 40 jam seminggu. Pekerja memperoleh istirahat sekurang-kurangny",
    "dasar_hukum": [],
    "referensi": [
      24
    ],
    "perubahan": "Pola 6 hari maksimal 7 jam/hari; Sabtu 4 jam; kelebihan waktu dibayar lembur.",
    "catatan": "",
    "tags": [
      "jam kerja",
      "shift"
    ],
    "disiplin": null
  },
  {
    "id": "pp-34",
    "bab": 10,
    "bab_judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "pasal": 34,
    "judul": "Hari Libur",
    "label": "Pasal 34 — Hari Libur",
    "ayat": [
      "(1) Pekerja berhak tidak bekerja pada hari libur resmi yang ditetapkan Pemerintah dengan upah sesuai ketentuan. Jika atas kebutuhan usaha bekerja pada hari tersebut atau pada hari istirahat mingguan, Perusahaan memperoleh persetujuan dan membayar upah lembur menurut Pasal 24.",
      "(2) Hari lain yang secara tertulis dinyatakan libur oleh Perusahaan tetap diberikan sebagai libur perusahaan sesuai keputusan tersebut."
    ],
    "ringkasan": "Pekerja berhak tidak bekerja pada hari libur resmi yang ditetapkan Pemerintah dengan upah sesuai ketentuan. Jika atas kebutuhan usaha bekerja pada hari tersebut atau pada hari istirahat mingguan, Perusahaan memperoleh persetujuan dan membay",
    "dasar_hukum": [],
    "referensi": [
      24
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-35",
    "bab": 10,
    "bab_judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "pasal": 35,
    "judul": "Ketidakhadiran Karena Sakit",
    "label": "Pasal 35 — Ketidakhadiran Karena Sakit",
    "ayat": [
      "(1) Pekerja atau keluarganya memberitahukan sakit kepada atasan dan HR sesegera mungkin. Bukti medis atau keterangan yang wajar diberikan sesuai kondisi dan kebutuhan verifikasi.",
      "(2) Sakit yang dapat dibuktikan secara sah dicatat sebagai sakit, bukan otomatis dipotong cuti tahunan. Penanganan sakit tanpa surat dokter dinilai menurut bukti dan keadaan kasus; pengubahan kategori menjadi cuti tahunan memerlukan dasar dan persetujuan pekerja."
    ],
    "ringkasan": "Pekerja atau keluarganya memberitahukan sakit kepada atasan dan HR sesegera mungkin. Bukti medis atau keterangan yang wajar diberikan sesuai kondisi dan kebutuhan verifikasi.",
    "dasar_hukum": [
      "UU 13/2003 Pasal 93"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "Teguran",
      "jenis": [
        "Administrasi sakit"
      ],
      "catatan": "Tidak memberitahukan sakit; tetap dinilai berdasarkan bukti dan keadaan kasus."
    }
  },
  {
    "id": "pp-36",
    "bab": 10,
    "bab_judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "pasal": 36,
    "judul": "Upah Selama Sakit",
    "label": "Pasal 36 — Upah Selama Sakit",
    "ayat": [
      "(1) Pekerja yang sakit berkepanjangan dan memenuhi syarat pembuktian menerima upah: 100% untuk 4 bulan pertama, 75% untuk 4 bulan kedua, 50% untuk 4 bulan ketiga, dan 25% untuk bulan selanjutnya sebelum PHK sesuai ketentuan yang berlaku.",
      "(2) PHK karena sakit berkepanjangan atau cacat akibat kecelakaan kerja tidak dapat dilakukan hanya setelah 3 bulan; setelah lebih dari 12 bulan berlaku alasan dan hak sebagaimana Pasal 50."
    ],
    "ringkasan": "Pekerja yang sakit berkepanjangan dan memenuhi syarat pembuktian menerima upah: 100% untuk 4 bulan pertama, 75% untuk 4 bulan kedua, 50% untuk 4 bulan ketiga, dan 25% untuk bulan selanjutnya sebelum PHK sesuai ketentuan yang berlaku.",
    "dasar_hukum": [],
    "referensi": [
      50
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-37",
    "bab": 10,
    "bab_judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "pasal": 37,
    "judul": "Izin Penting dengan Upah",
    "label": "Pasal 37 — Izin Penting dengan Upah",
    "ayat": [
      "(1) Pekerja mendapat izin dengan upah penuh untuk: perkawinan pekerja 3 hari; perkawinan anak 2 hari; khitanan anak 2 hari; pembaptisan anak 2 hari; istri melahirkan atau keguguran 2 hari; meninggalnya suami, istri, anak, menantu, orang tua, atau mertua 2 hari; dan anggota keluarga serumah meninggal 1 hari.",
      "(2) Suami yang mendampingi persalinan dapat memperoleh paling lama 3 hari tambahan atau sesuai kesepakatan berdasarkan UU 4 Tahun 2024. Pemberian upah untuk hari tambahan tersebut ditetapkan dalam kesepakatan yang tidak mengurangi 2 hari izin berupah menurut UU Ketenagakerjaan.",
      "(3) Permohonan disampaikan sebelumnya jika dapat direncanakan; keadaan darurat dilaporkan sesegera mungkin. Tambahan waktu perjalanan luar kota yang berlaku lebih baik berdasarkan kebijakan lama dipertahankan setelah disetujui dan didokumentasikan.",
      "(4) Pekerja perempuan yang sakit pada hari pertama dan/atau hari kedua masa haid berhak untuk tidak masuk kerja pada hari tersebut, dengan memberitahukan kepada atasan dan HR, dan upahnya tetap dibayar sesuai ketentuan peraturan perundang-undangan.",
      "(5) Suami dari pekerja yang melahirkan berhak atas cuti pendampingan paling lama 2 (dua) hari dan dapat diberikan paling lama 3 (tiga) hari berikutnya, atau sesuai kesepakatan, sebagaimana diatur dalam Undang-Undang Nomor 4 Tahun 2024. Cuti pendampingan pada saat istri mengalami keguguran diberikan 2 (dua) hari."
    ],
    "ringkasan": "Pekerja mendapat izin dengan upah penuh untuk: perkawinan pekerja 3 hari; perkawinan anak 2 hari; khitanan anak 2 hari; pembaptisan anak 2 hari; istri melahirkan atau keguguran 2 hari; meninggalnya suami, istri, anak, menantu, orang tua, at",
    "dasar_hukum": [
      "UU 4 Tahun 2024"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [
      "izin",
      "haid",
      "cuti pendampingan"
    ],
    "disiplin": null
  },
  {
    "id": "pp-38",
    "bab": 10,
    "bab_judul": "Waktu Kerja dan Izin",
    "kategori": "Waktu Kerja & Izin",
    "pasal": 38,
    "judul": "Tidak Hadir tanpa Izin",
    "label": "Pasal 38 — Tidak Hadir tanpa Izin",
    "ayat": [
      "(1) Pekerja yang tidak hadir tanpa pemberitahuan atau alasan yang sah diminta menjelaskan dan dapat dikenai tindakan disiplin yang proporsional. Satu kali tidak hadir tidak otomatis memenuhi dasar PHK karena mangkir.",
      "(2) Proses PHK karena mangkir hanya dapat dilakukan dengan syarat dan dua panggilan tertulis sebagaimana Pasal 53."
    ],
    "ringkasan": "Pekerja yang tidak hadir tanpa pemberitahuan atau alasan yang sah diminta menjelaskan dan dapat dikenai tindakan disiplin yang proporsional. Satu kali tidak hadir tidak otomatis memenuhi dasar PHK karena mangkir.",
    "dasar_hukum": [
      "PP 35/2021 Pasal 52",
      "UU 13/2003"
    ],
    "referensi": [
      53
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "SP / PHK",
      "jenis": [
        "Mangkir"
      ],
      "catatan": "Tidak hadir tanpa pemberitahuan; PHK mangkir hanya setelah 5 hari kerja berturut-turut dan 2 panggilan tertulis."
    }
  },
  {
    "id": "pp-39",
    "bab": 11,
    "bab_judul": "Cuti",
    "kategori": "Cuti",
    "pasal": 39,
    "judul": "Jenis Cuti",
    "label": "Pasal 39 — Jenis Cuti",
    "ayat": [
      "(1) Jenis cuti dalam Peraturan ini meliputi cuti tahunan, cuti melahirkan atau keguguran, dan cuti di luar tanggungan Perusahaan berdasarkan persetujuan. Hak istirahat dan izin lain mengikuti pasal terkait serta ketentuan hukum.",
      "(2) Cuti tanpa upah harus disepakati tertulis mengenai tanggal, pembayaran upah, dan administrasi jaminan sosial. Masa kerja yang sudah ditempuh tidak dihapus karena cuti tanpa upah."
    ],
    "ringkasan": "Jenis cuti dalam Peraturan ini meliputi cuti tahunan, cuti melahirkan atau keguguran, dan cuti di luar tanggungan Perusahaan berdasarkan persetujuan. Hak istirahat dan izin lain mengikuti pasal terkait serta ketentuan hukum.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-40",
    "bab": 11,
    "bab_judul": "Cuti",
    "kategori": "Cuti",
    "pasal": 40,
    "judul": "Cuti Tahunan",
    "label": "Pasal 40 — Cuti Tahunan",
    "ayat": [
      "(1) Pekerja yang telah bekerja 12 bulan secara terus menerus berhak atas paling sedikit 12 hari kerja cuti tahunan berupah. Perusahaan mencatat saldo, penggunaan, dan sisa hak serta memberi kesempatan nyata untuk mengambilnya.",
      "(2) Jadwal cuti diatur bersama dengan mempertimbangkan permohonan pekerja dan kelangsungan operasi. Cuti yang tertunda atas kepentingan Perusahaan dijadwalkan kembali; sisa cuti yang belum diambil dan belum gugur diperhitungkan saat hubungan kerja berakhir.",
      "(3) Ketentuan tambahan masa kerja, cuti khusus, prorata, dan carryover yang sudah diberikan dalam kebijakan yang sah atau praktik yang mengikat tidak dikurangi melalui Peraturan ini. Rumus dan syaratnya ditetapkan dalam lampiran kebijakan Perusahaan yang ditetapkan Pengurus dan tidak boleh mengurangi hak minimum menurut peraturan perundang-undangan.",
      "(4) Naskah lama menyebut hak cuti dipakai dalam 1 tahun setelah tanggal jatuhnya dan perusahaan memberitahukan tanggal tersebut. Ketentuan penggunaan dan kedaluwarsa hanya diterapkan setelah pemberitahuan serta kesempatan nyata mengambil cuti dan tidak menggugurkan hak yang lebih baik berdasarkan perjanjian atau praktik yang mengikat."
    ],
    "ringkasan": "Pekerja yang telah bekerja 12 bulan secara terus menerus berhak atas paling sedikit 12 hari kerja cuti tahunan berupah. Perusahaan mencatat saldo, penggunaan, dan sisa hak serta memberi kesempatan nyata untuk mengambilnya.",
    "dasar_hukum": [
      "UU 13/2003 Pasal 79"
    ],
    "referensi": [],
    "perubahan": "Cuti tahunan tidak gugur otomatis tanpa pemberitahuan dan kesempatan nyata mengambil cuti.",
    "catatan": "",
    "tags": [
      "cuti tahunan",
      "carryover"
    ],
    "disiplin": null
  },
  {
    "id": "pp-41",
    "bab": 11,
    "bab_judul": "Cuti",
    "kategori": "Cuti",
    "pasal": 41,
    "judul": "Cuti Melahirkan dan Keguguran",
    "label": "Pasal 41 — Cuti Melahirkan dan Keguguran",
    "ayat": [
      "(1) Pekerja perempuan berhak atas cuti melahirkan paling singkat 3 bulan pertama. Apabila terdapat kondisi khusus kesehatan ibu atau bayi yang dibuktikan surat dokter, diberikan tambahan paling lama 3 bulan berikutnya.",
      "(2) Upah dibayar penuh pada bulan pertama sampai keempat dan 75% pada bulan kelima serta keenam sesuai UU 4 Tahun 2024. Istirahat karena keguguran diberikan 1,5 bulan atau sesuai surat keterangan dokter atau bidan menurut UU Ketenagakerjaan.",
      "(3) Cuti melahirkan tidak menghapus cuti tahunan. Pekerja tidak diberhentikan karena menggunakan hak cuti melahirkan atau keguguran.",
      "(4) Untuk cuti melahirkan yang dapat direncanakan, pekerja menyampaikan permohonan sedapat mungkin 1 minggu sebelumnya. Kondisi darurat tidak menghapus hak cuti atau upah."
    ],
    "ringkasan": "Pekerja perempuan berhak atas cuti melahirkan paling singkat 3 bulan pertama. Apabila terdapat kondisi khusus kesehatan ibu atau bayi yang dibuktikan surat dokter, diberikan tambahan paling lama 3 bulan berikutnya.",
    "dasar_hukum": [
      "UU 4 Tahun 2024"
    ],
    "referensi": [],
    "perubahan": "Cuti melahirkan mengacu UU 4/2024; upah 100% bulan 1–4 dan 75% bulan 5–6.",
    "catatan": "",
    "tags": [
      "cuti melahirkan",
      "keguguran"
    ],
    "disiplin": null
  },
  {
    "id": "pp-42",
    "bab": 11,
    "bab_judul": "Cuti",
    "kategori": "Cuti",
    "pasal": 42,
    "judul": "Prosedur Cuti",
    "label": "Pasal 42 — Prosedur Cuti",
    "ayat": [
      "(1) Permohonan cuti diajukan melalui atasan dan HR dengan sistem atau formulir yang tersedia, sedapat mungkin 2 minggu sebelumnya untuk cuti terencana. Keadaan mendesak dan hak kesehatan ditangani tanpa syarat pemberitahuan yang tidak mungkin dipenuhi.",
      "(2) HR mencatat hak awal, penggunaan, sisa, dan keputusan. Tidak berlaku batas mutlak 3 hari untuk satu pengambilan atau 1 pekerja per divisi per hari apabila batas tersebut menghalangi penggunaan hak. Bila tanggal diminta tidak dapat dipenuhi karena kebutuhan operasional yang nyata, Perusahaan memberi alasan tertulis dan pilihan tanggal pengganti."
    ],
    "ringkasan": "Permohonan cuti diajukan melalui atasan dan HR dengan sistem atau formulir yang tersedia, sedapat mungkin 2 minggu sebelumnya untuk cuti terencana. Keadaan mendesak dan hak kesehatan ditangani tanpa syarat pemberitahuan yang tidak mungkin d",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-43",
    "bab": 12,
    "bab_judul": "Sanksi dan Penyelesaian",
    "kategori": "Sanksi & Disiplin",
    "pasal": 43,
    "judul": "Jenis dan Asas Sanksi",
    "label": "Pasal 43 — Jenis dan Asas Sanksi",
    "ayat": [
      "(1) Pelanggaran perjanjian kerja, Peraturan Perusahaan, atau prosedur yang sah diperiksa berdasarkan bukti; pekerja diberi kesempatan menyampaikan penjelasan. Sanksi berupa pembinaan, teguran, dan/atau surat peringatan diberikan secara proporsional dan konsisten.",
      "(2) Kerugian Perusahaan tidak menimbulkan kewajiban pembayaran otomatis. Nilai, sebab, dan tanggung jawab diperiksa; pembayaran atau pemotongan mengikuti hukum pengupahan. PHK hanya dilakukan dengan alasan, prosedur, dan hak menurut peraturan yang berlaku."
    ],
    "ringkasan": "Pelanggaran perjanjian kerja, Peraturan Perusahaan, atau prosedur yang sah diperiksa berdasarkan bukti; pekerja diberi kesempatan menyampaikan penjelasan. Sanksi berupa pembinaan, teguran, dan/atau surat peringatan diberikan secara proporsi",
    "dasar_hukum": [
      "PP 35/2021 Pasal 52",
      "UU 13/2003 Pasal 158"
    ],
    "referensi": [],
    "perubahan": "Sanksi diberikan secara proporsional; tidak ada PHK atau ganti rugi otomatis.",
    "catatan": "",
    "tags": [
      "sanksi",
      "disiplin"
    ],
    "disiplin": {
      "tingkat": "Dasar sanksi",
      "jenis": [
        "Sanksi"
      ],
      "catatan": "Kerangka sanksi: pemeriksaan berbasis bukti, kesempatan menjelaskan, dan sanksi proporsional."
    }
  },
  {
    "id": "pp-44",
    "bab": 12,
    "bab_judul": "Sanksi dan Penyelesaian",
    "kategori": "Sanksi & Disiplin",
    "pasal": 44,
    "judul": "Surat Peringatan",
    "label": "Pasal 44 — Surat Peringatan",
    "ayat": [
      "(1) Surat peringatan pertama, kedua, dan ketiga diberikan secara berurutan; masing-masing berlaku paling lama 6 bulan, kecuali syarat lain yang sah ditetapkan dalam perjanjian kerja, Peraturan Perusahaan, atau perjanjian kerja bersama.",
      "(2) Pelanggaran berulang dalam masa berlaku peringatan dapat meningkatkan tingkat peringatan. Sesudah masa berlaku berakhir tanpa pelanggaran baru, proses peringatan dimulai kembali dari tingkat pertama. Jenis pelanggaran yang dapat dikenai peringatan pertama dan terakhir harus dinyatakan secara jelas dan diterapkan sesuai hukum.",
      "(3) Pelanggaran dalam masa SP III dapat menjadi alasan PHK dengan pembayaran hak menurut Pasal 49 dan Pasal 66; tidak berlaku klausul tanpa kompensasi."
    ],
    "ringkasan": "Surat peringatan pertama, kedua, dan ketiga diberikan secara berurutan; masing-masing berlaku paling lama 6 bulan, kecuali syarat lain yang sah ditetapkan dalam perjanjian kerja, Peraturan Perusahaan, atau perjanjian kerja bersama.",
    "dasar_hukum": [
      "PP 35/2021 Pasal 52",
      "UU 13/2003 Pasal 161"
    ],
    "referensi": [
      49,
      66
    ],
    "perubahan": "SP 1–3 berlaku paling lama 6 bulan; klausul tanpa kompensasi dihapus.",
    "catatan": "",
    "tags": [
      "SP",
      "surat peringatan",
      "disiplin"
    ],
    "disiplin": {
      "tingkat": "SP 1–3",
      "jenis": [
        "Prosedur SP"
      ],
      "catatan": "SP diberikan berurutan dan berlaku paling lama 6 bulan; pelanggaran baru dapat menaikkan tingkat."
    }
  },
  {
    "id": "pp-45",
    "bab": 12,
    "bab_judul": "Sanksi dan Penyelesaian",
    "kategori": "Sanksi & Disiplin",
    "pasal": 45,
    "judul": "Skorsing dalam Proses PHK",
    "label": "Pasal 45 — Skorsing dalam Proses PHK",
    "ayat": [
      "(1) Selama proses perselisihan PHK, para pihak tetap melaksanakan kewajiban masing-masing menurut hukum. Jika Perusahaan melakukan skorsing, keputusan disampaikan tertulis dan Perusahaan tetap membayar upah serta hak lain yang biasa diterima pekerja selama proses berlangsung sesuai ketentuan."
    ],
    "ringkasan": "Selama proses perselisihan PHK, para pihak tetap melaksanakan kewajiban masing-masing menurut hukum. Jika Perusahaan melakukan skorsing, keputusan disampaikan tertulis dan Perusahaan tetap membayar upah serta hak lain yang biasa diterima pe",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-46",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 46,
    "judul": "Dasar dan Tata Cara Pemutusan Hubungan Kerja",
    "label": "Pasal 46 — Dasar dan Tata Cara Pemutusan Hubungan Kerja",
    "ayat": [
      "(1) Perusahaan dan pekerja mengupayakan agar PHK tidak terjadi. PHK dilakukan hanya karena alasan yang dibenarkan hukum dan didukung dokumen yang relevan.",
      "(2) Jika PHK tidak dapat dihindari, Perusahaan memberikan pemberitahuan tertulis mengenai alasan dan hak sesuai tenggat PP 35 Tahun 2021. Jika pekerja menolak, para pihak menempuh perundingan bipartit dan mekanisme penyelesaian perselisihan hubungan industrial. Pelaksanaan PHK mengikuti putusan atau kesepakatan yang sah serta Putusan MK 168/PUU-XXI/2023.",
      "(3) Besaran hak dalam pasal berikut merupakan minimum sesuai alasan; hak yang diperjanjikan lebih baik tetap dihormati.",
      "(4) Apabila perundingan bipartit mengenai PHK tidak mencapai kesepakatan, PHK dilaksanakan setelah penetapan lembaga penyelesaian perselisihan hubungan industrial yang putusannya berkekuatan hukum tetap sebagaimana Putusan MK Nomor 168/PUU-XXI/2023. Selama proses, kewajiban para pihak dan pembayaran upah mengikuti hukum serta Pasal 45."
    ],
    "ringkasan": "Perusahaan dan pekerja mengupayakan agar PHK tidak terjadi. PHK dilakukan hanya karena alasan yang dibenarkan hukum dan didukung dokumen yang relevan.",
    "dasar_hukum": [
      "PP 35 Tahun 2021",
      "Putusan MK 168/PUU-XXI/2023",
      "Putusan MK Nomor 168/PUU-XXI/2023"
    ],
    "referensi": [
      45
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-47",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 47,
    "judul": "Pengunduran Diri",
    "label": "Pasal 47 — Pengunduran Diri",
    "ayat": [
      "(1) Pekerja mengajukan pengunduran diri tertulis paling lambat 30 hari sebelum tanggal efektif, tidak sedang terikat ikatan dinas yang sah, dan tetap melaksanakan kewajiban sampai tanggal akhir. Pekerja menyerahkan pekerjaan serta aset Perusahaan dengan berita acara.",
      "(2) Perusahaan membayar upah yang telah timbul, uang penggantian hak, dan uang pisah menurut Pasal 65. Pelanggaran prosedur pemberitahuan tidak dapat dijadikan alasan menahan seluruh upah atau hak yang sudah timbul; kewajiban masing-masing diselesaikan terpisah menurut hukum.",
      "(3) Sebelum tanggal berakhirnya hubungan kerja, para pihak menyelesaikan pinjaman dan kewajiban keuangan yang sah secara terpisah dari pembayaran hak pekerja."
    ],
    "ringkasan": "Pekerja mengajukan pengunduran diri tertulis paling lambat 30 hari sebelum tanggal efektif, tidak sedang terikat ikatan dinas yang sah, dan tetap melaksanakan kewajiban sampai tanggal akhir. Pekerja menyerahkan pekerjaan serta aset Perusaha",
    "dasar_hukum": [],
    "referensi": [
      65
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-48",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 48,
    "judul": "Usia Pensiun Perusahaan",
    "label": "Pasal 48 — Usia Pensiun Perusahaan",
    "ayat": [
      "(1) Usia pensiun hubungan kerja ditetapkan 58 (lima puluh delapan) tahun, dengan ketentuan bahwa Perusahaan dan wakil pekerja meninjau kembali angka tersebut agar selaras dengan usia mulai manfaat Jaminan Pensiun BPJS Ketenagakerjaan yang berlaku pada saat pekerja mencapai usia pensiun. Penetapan usia pensiun dilakukan dengan saran dan pertimbangan wakil pekerja, diumumkan secara tertulis, dan disertai pengaturan transisi bagi pekerja yang telah mendekati usia pensiun sebelum Peraturan ini berlaku. [CATATAN: pengurus agar mengonfirmasi angka final sebelum pengesahan.]",
      "(2) Usia mulai manfaat Jaminan Pensiun BPJS Ketenagakerjaan merupakan ketentuan program jaminan sosial tersendiri dan tidak otomatis mengganti usia pensiun hubungan kerja dalam Peraturan Perusahaan.",
      "(3) Pekerja yang pensiun menerima hak PHK menurut Pasal 56 PP 35 Tahun 2021, yaitu pesangon 1,75 kali tabel dasar, uang penghargaan masa kerja 1 kali tabel dasar, dan uang penggantian hak. Perpanjangan kerja setelah usia pensiun, bila diperlukan, dituangkan dalam kesepakatan yang sah.",
      "(4) Naskah lama mengatur pemberitahuan tertulis rencana pensiun sekurang-kurangnya 1 tahun sebelumnya, pengingat 11 bulan sesudahnya, dan tanggal PHK pada akhir bulan. Jika usia 56 tahun ditetapkan kembali, prosedur ini dipertahankan sepanjang tidak mengurangi ketentuan pemberitahuan dan hak PHK yang berlaku."
    ],
    "ringkasan": "Usia pensiun hubungan kerja ditetapkan 58 (lima puluh delapan) tahun, dengan ketentuan bahwa Perusahaan dan wakil pekerja meninjau kembali angka tersebut agar selaras dengan usia mulai manfaat Jaminan Pensiun BPJS Ketenagakerjaan yang berla",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      56
    ],
    "perubahan": "",
    "catatan": "pengurus agar mengonfirmasi angka final sebelum pengesahan.",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-49",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 49,
    "judul": "PHK Karena Pelanggaran Setelah Surat Peringatan",
    "label": "Pasal 49 — PHK Karena Pelanggaran Setelah Surat Peringatan",
    "ayat": [
      "(1) Jika pekerja kembali melanggar ketentuan selama masa berlaku SP III setelah proses peringatan berurutan, PHK dapat diproses menurut ketentuan hukum.",
      "(2) Pekerja berhak atas uang pesangon 0,5 kali tabel dasar, uang penghargaan masa kerja 1 kali tabel dasar, dan uang penggantian hak. Uang pisah tambahan yang dijanjikan dalam Pasal 66 tidak mengurangi hak tersebut."
    ],
    "ringkasan": "Jika pekerja kembali melanggar ketentuan selama masa berlaku SP III setelah proses peringatan berurutan, PHK dapat diproses menurut ketentuan hukum.",
    "dasar_hukum": [
      "PP 35/2021 Pasal 52 ayat (1)"
    ],
    "referensi": [
      66
    ],
    "perubahan": "PHK setelah SP III tetap membayar pesangon 0,5x, UPMK 1x, dan UPH.",
    "catatan": "",
    "tags": [
      "PHK",
      "SP III"
    ],
    "disiplin": {
      "tingkat": "PHK",
      "jenis": [
        "Pelanggaran setelah SP III"
      ],
      "catatan": "PHK setelah SP III tetap memberi pesangon 0,5x, UPMK 1x, dan uang penggantian hak."
    }
  },
  {
    "id": "pp-50",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 50,
    "judul": "PHK Karena Sakit Berkepanjangan atau Cacat Akibat Kecelakaan Kerja",
    "label": "Pasal 50 — PHK Karena Sakit Berkepanjangan atau Cacat Akibat Kecelakaan Kerja",
    "ayat": [
      "(1) Jika pekerja tidak dapat bekerja setelah melampaui 12 bulan akibat sakit berkepanjangan atau cacat akibat kecelakaan kerja, Perusahaan atau pekerja dapat mengajukan PHK sesuai prosedur.",
      "(2) Pekerja berhak atas uang pesangon 2 kali tabel dasar, uang penghargaan masa kerja 1 kali tabel dasar, dan uang penggantian hak sebagaimana PP 35 Tahun 2021 Pasal 55."
    ],
    "ringkasan": "Jika pekerja tidak dapat bekerja setelah melampaui 12 bulan akibat sakit berkepanjangan atau cacat akibat kecelakaan kerja, Perusahaan atau pekerja dapat mengajukan PHK sesuai prosedur.",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      55
    ],
    "perubahan": "Ambang PHK karena sakit berkepanjangan menjadi lebih dari 12 bulan.",
    "catatan": "",
    "tags": [
      "PHK",
      "sakit"
    ],
    "disiplin": null
  },
  {
    "id": "pp-51",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 51,
    "judul": "PHK Karena Pekerja Meninggal Dunia",
    "label": "Pasal 51 — PHK Karena Pekerja Meninggal Dunia",
    "ayat": [
      "(1) Hubungan kerja berakhir karena pekerja meninggal dunia. Kepada ahli waris diberikan jumlah setara uang pesangon 2 kali tabel dasar, uang penghargaan masa kerja 1 kali tabel dasar, dan uang penggantian hak.",
      "(2) Pembayaran tersebut tidak menggantikan upah yang masih terutang, manfaat BPJS, atau uang duka tambahan menurut Pasal 27."
    ],
    "ringkasan": "Hubungan kerja berakhir karena pekerja meninggal dunia. Kepada ahli waris diberikan jumlah setara uang pesangon 2 kali tabel dasar, uang penghargaan masa kerja 1 kali tabel dasar, dan uang penggantian hak.",
    "dasar_hukum": [],
    "referensi": [
      27
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-52",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 52,
    "judul": "PHK Atas Permohonan Pekerja Karena Tindakan Pengusaha",
    "label": "Pasal 52 — PHK Atas Permohonan Pekerja Karena Tindakan Pengusaha",
    "ayat": [
      "(1) Pekerja dapat mengajukan PHK karena penganiayaan atau ancaman; bujukan melakukan perbuatan melawan hukum; upah tidak dibayar tepat waktu selama 3 bulan berturut-turut atau lebih; pengingkaran kewajiban yang dijanjikan; perintah bekerja di luar yang diperjanjikan; atau penugasan berbahaya yang tidak diperjanjikan, sesuai PP 35 Tahun 2021 Pasal 36 huruf g.",
      "(2) Jika alasan tersebut terbukti melalui mekanisme penyelesaian, hak pekerja adalah uang pesangon 1 kali tabel dasar, uang penghargaan masa kerja 1 kali tabel dasar, dan uang penggantian hak. Jika dinyatakan tidak terbukti dan pengusaha memutuskan PHK, berlaku uang penggantian hak dan uang pisah sesuai ketentuan."
    ],
    "ringkasan": "Pekerja dapat mengajukan PHK karena penganiayaan atau ancaman; bujukan melakukan perbuatan melawan hukum; upah tidak dibayar tepat waktu selama 3 bulan berturut-turut atau lebih; pengingkaran kewajiban yang dijanjikan; perintah bekerja di l",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      36
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-53",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 53,
    "judul": "PHK Karena Mangkir",
    "label": "Pasal 53 — PHK Karena Mangkir",
    "ayat": [
      "(1) Mangkir sebagai alasan PHK mensyaratkan tidak masuk kerja paling sedikit 5 hari kerja berturut-turut tanpa keterangan tertulis dengan bukti sah, serta 2 kali panggilan yang patut secara tertulis.",
      "(2) Jika seluruh syarat terpenuhi, pekerja menerima uang penggantian hak dan uang pisah menurut skema yang ditetapkan dalam Peraturan ini; upah yang telah timbul tetap diselesaikan."
    ],
    "ringkasan": "Mangkir sebagai alasan PHK mensyaratkan tidak masuk kerja paling sedikit 5 hari kerja berturut-turut tanpa keterangan tertulis dengan bukti sah, serta 2 kali panggilan yang patut secara tertulis.",
    "dasar_hukum": [
      "PP 35/2021 Pasal 52",
      "UU 13/2003 Pasal 168"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [
      "mangkir",
      "PHK"
    ],
    "disiplin": {
      "tingkat": "PHK",
      "jenis": [
        "Mangkir"
      ],
      "catatan": "Syarat: 5 hari kerja berturut-turut tanpa keterangan tertulis dan 2 panggilan tertulis."
    }
  },
  {
    "id": "pp-54",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 54,
    "judul": "Pelanggaran Bersifat Mendesak",
    "label": "Pasal 54 — Pelanggaran Bersifat Mendesak",
    "ayat": [
      "(1) Pelanggaran bersifat mendesak dapat mencakup penipuan, pencurian, atau penggelapan; pemberian keterangan palsu yang merugikan; penggunaan atau peredaran narkotika di tempat kerja; perjudian; kekerasan atau intimidasi serius; pelecehan seksual; perusakan yang menimbulkan bahaya besar; atau pembocoran rahasia yang menimbulkan kerugian serius, sepanjang unsur dan bukti tiap kasus terpenuhi.",
      "(2) Pekerja diberi kesempatan memberikan penjelasan dan laporan ditangani secara objektif. Dalam hal PHK karena pelanggaran mendesak yang memenuhi PP 35 Tahun 2021 Pasal 52 ayat (2), pekerja tetap berhak atas uang penggantian hak dan uang pisah menurut Pasal 66. Dugaan tindak pidana dapat dilaporkan melalui proses hukum yang terpisah.",
      "(3) Kategori pelanggaran mendesak harus dirumuskan spesifik dan dapat dibuktikan. Tuduhan mengenai hubungan pribadi di luar pekerjaan tidak otomatis menjadi dasar PHK; hanya perilaku di tempat kerja yang memenuhi unsur pelanggaran sah serta prosedur hukum yang dapat diproses."
    ],
    "ringkasan": "Pelanggaran bersifat mendesak dapat mencakup penipuan, pencurian, atau penggelapan; pemberian keterangan palsu yang merugikan; penggunaan atau peredaran narkotika di tempat kerja; perjudian; kekerasan atau intimidasi serius; pelecehan seksu",
    "dasar_hukum": [
      "PP 35 Tahun 2021",
      "PP 35/2021 Pasal 52 ayat (2)",
      "Putusan MK 12/PUU-I/2003"
    ],
    "referensi": [
      52,
      66
    ],
    "perubahan": "Istilah 'kesalahan berat' diganti 'pelanggaran mendesak'; tetap ada UPH dan uang pisah.",
    "catatan": "",
    "tags": [
      "pelanggaran mendesak",
      "PHK"
    ],
    "disiplin": {
      "tingkat": "PHK mendesak",
      "jenis": [
        "Pelanggaran berat"
      ],
      "catatan": "Penipuan, pencurian, narkotika, perjudian, kekerasan, pelecehan seksual, perusakan, atau pembocoran rahasia; tetap berhak UPH dan uang pisah."
    }
  },
  {
    "id": "pp-55",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 55,
    "judul": "PHK Karena Perubahan Perusahaan",
    "label": "Pasal 55 — PHK Karena Perubahan Perusahaan",
    "ayat": [
      "(1) PHK karena penggabungan, peleburan, atau pemisahan Perusahaan dengan pekerja tidak bersedia melanjutkan atau pengusaha tidak bersedia menerima pekerja memberikan 1 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak.",
      "(2) PHK karena pengambilalihan Perusahaan memberikan 1 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak; apabila pengambilalihan mengubah syarat kerja dan pekerja tidak bersedia melanjutkan, faktor pesangon 0,5 kali. Setiap keadaan harus dibuktikan dan diproses menurut PP 35 Tahun 2021 Pasal 41-42."
    ],
    "ringkasan": "PHK karena penggabungan, peleburan, atau pemisahan Perusahaan dengan pekerja tidak bersedia melanjutkan atau pengusaha tidak bersedia menerima pekerja memberikan 1 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak.",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      41
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-56",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 56,
    "judul": "PHK Karena Efisiensi",
    "label": "Pasal 56 — PHK Karena Efisiensi",
    "ayat": [
      "(1) Efisiensi akibat Perusahaan mengalami kerugian memberikan 0,5 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak.",
      "(2) Efisiensi untuk mencegah kerugian memberikan 1 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak. Dasar efisiensi, data keuangan, serta upaya menghindari PHK didokumentasikan."
    ],
    "ringkasan": "Efisiensi akibat Perusahaan mengalami kerugian memberikan 0,5 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-57",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 57,
    "judul": "PHK Karena Penutupan Pailit atau Keadaan Memaksa",
    "label": "Pasal 57 — PHK Karena Penutupan Pailit atau Keadaan Memaksa",
    "ayat": [
      "(1) Penutupan Perusahaan karena kerugian terus menerus atau tidak terus menerus selama 2 tahun memberikan 0,5 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak; penutupan bukan karena kerugian memberikan 1 kali pesangon beserta 1 kali uang penghargaan masa kerja dan uang penggantian hak.",
      "(2) Penutupan karena keadaan memaksa memberikan 0,5 kali pesangon; keadaan memaksa tanpa penutupan memberikan 0,75 kali pesangon. Keduanya disertai 1 kali uang penghargaan masa kerja dan uang penggantian hak.",
      "(3) Penundaan kewajiban pembayaran utang karena kerugian memberikan 0,5 kali pesangon; bukan karena kerugian memberikan 1 kali pesangon. Pailit memberikan 0,5 kali pesangon. Setiap keadaan disertai 1 kali uang penghargaan masa kerja dan uang penggantian hak sesuai PP 35 Tahun 2021 Pasal 46-47."
    ],
    "ringkasan": "Penutupan Perusahaan karena kerugian terus menerus atau tidak terus menerus selama 2 tahun memberikan 0,5 kali pesangon, 1 kali uang penghargaan masa kerja, dan uang penggantian hak; penutupan bukan karena kerugian memberikan 1 kali pesango",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      46
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-58",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 58,
    "judul": "Pekerja Ditahan Karena Dugaan Tindak Pidana",
    "label": "Pasal 58 — Pekerja Ditahan Karena Dugaan Tindak Pidana",
    "ayat": [
      "(1) Selama pekerja ditahan pihak berwajib karena diduga melakukan tindak pidana, Perusahaan tidak wajib membayar upah, tetapi wajib memberi bantuan kepada keluarga yang menjadi tanggungannya: 1 tanggungan 25% upah; 2 tanggungan 35%; 3 tanggungan 45%; dan 4 tanggungan atau lebih 50%. Bantuan diberikan paling lama 6 bulan sejak hari pertama penahanan menurut Pasal 53 PP 35 Tahun 2021.",
      "(2) Jika pekerja tidak dapat bekerja selama 6 bulan akibat penahanan, hak PHK dibedakan menurut ada tidaknya kerugian Perusahaan: apabila tindak pidana menyebabkan kerugian Perusahaan, uang penggantian hak dan uang pisah; apabila tidak menyebabkan kerugian Perusahaan, uang penghargaan masa kerja 1 kali tabel dasar dan uang penggantian hak.",
      "(3) Jika pengadilan memutus sebelum 6 (enam) bulan dan pekerja dinyatakan tidak bersalah, pekerja dipekerjakan kembali menurut Pasal 54 ayat (3) PP 35 Tahun 2021. Jika dinyatakan bersalah dan PHK diproses, haknya mengikuti pembedaan kerugian Perusahaan tersebut. Besaran uang pisah mengikuti ketentuan pada Pasal 65 dan Pasal 66."
    ],
    "ringkasan": "Selama pekerja ditahan pihak berwajib karena diduga melakukan tindak pidana, Perusahaan tidak wajib membayar upah, tetapi wajib memberi bantuan kepada keluarga yang menjadi tanggungannya: 1 tanggungan 25% upah; 2 tanggungan 35%; 3 tanggunga",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      53,
      54,
      65,
      66
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-59",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 59,
    "judul": "Jenis Pembayaran Akibat PHK",
    "label": "Pasal 59 — Jenis Pembayaran Akibat PHK",
    "ayat": [
      "(1) Hak pekerja PKWTT akibat PHK dapat meliputi uang pesangon, uang penghargaan masa kerja, uang penggantian hak, uang pisah, atau hak lain berdasarkan alasan yang terbukti. Kompensasi berakhirnya PKWT diatur tersendiri dalam Pasal 60.",
      "(2) Perusahaan menyerahkan rincian tertulis yang menyebut dasar upah, masa kerja, faktor alasan PHK, cuti tersisa, hak tambahan, dan potongan yang sah."
    ],
    "ringkasan": "Hak pekerja PKWTT akibat PHK dapat meliputi uang pesangon, uang penghargaan masa kerja, uang penggantian hak, uang pisah, atau hak lain berdasarkan alasan yang terbukti. Kompensasi berakhirnya PKWT diatur tersendiri dalam Pasal 60.",
    "dasar_hukum": [],
    "referensi": [
      60
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-60",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 60,
    "judul": "Kompensasi dan Pembayaran Hak",
    "label": "Pasal 60 — Kompensasi dan Pembayaran Hak",
    "ayat": [
      "(1) Uang kompensasi PKWT dibayarkan untuk masa kerja terus menerus paling sedikit 1 bulan: masa kerja dibagi 12 dikali 1 bulan upah, dengan dasar komponen upah sesuai PP 35 Tahun 2021 Pasal 16. Hak dibayar pada akhir PKWT dan, bila diperpanjang, pada akhir setiap jangka waktu sebelum perpanjangan serta pada akhir perpanjangan.",
      "(2) Hak PHK pekerja PKWTT dibayarkan sesuai alasan dan pada waktu yang diwajibkan hukum, kesepakatan, atau putusan yang sah. Perbedaan pendapat mengenai hitungan diselesaikan melalui bipartit dan mekanisme perselisihan hubungan industrial tanpa mengabaikan hak yang tidak disengketakan."
    ],
    "ringkasan": "Uang kompensasi PKWT dibayarkan untuk masa kerja terus menerus paling sedikit 1 bulan: masa kerja dibagi 12 dikali 1 bulan upah, dengan dasar komponen upah sesuai PP 35 Tahun 2021 Pasal 16. Hak dibayar pada akhir PKWT dan, bila diperpanjang",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      16
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-61",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 61,
    "judul": "Tabel Dasar Uang Pesangon",
    "label": "Pasal 61 — Tabel Dasar Uang Pesangon",
    "ayat": [
      "(1) Tabel dasar uang pesangon: masa kerja kurang dari 1 tahun = 1 bulan upah; 1 sampai kurang dari 2 tahun = 2 bulan; 2 sampai kurang dari 3 tahun = 3 bulan; 3 sampai kurang dari 4 tahun = 4 bulan; 4 sampai kurang dari 5 tahun = 5 bulan; 5 sampai kurang dari 6 tahun = 6 bulan; 6 sampai kurang dari 7 tahun = 7 bulan; 7 sampai kurang dari 8 tahun = 8 bulan; dan 8 tahun atau lebih = 9 bulan upah.",
      "(2) Tabel ini merupakan dasar sebelum dikalikan faktor menurut alasan PHK yang disebut pada pasal-pasal terkait; tabel tidak berarti seluruh alasan PHK membayar faktor 1 kali.",
      "(3) Angka dalam tabel ini merupakan batas paling sedikit sesuai pemaknaan Putusan MK Nomor 168/PUU-XXI/2023; ketentuan Perusahaan atau perjanjian yang lebih baik tetap berlaku."
    ],
    "ringkasan": "Tabel dasar uang pesangon: masa kerja kurang dari 1 tahun = 1 bulan upah; 1 sampai kurang dari 2 tahun = 2 bulan; 2 sampai kurang dari 3 tahun = 3 bulan; 3 sampai kurang dari 4 tahun = 4 bulan; 4 sampai kurang dari 5 tahun = 5 bulan; 5 samp",
    "dasar_hukum": [
      "Putusan MK Nomor 168/PUU-XXI/2023"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [
      "pesangon"
    ],
    "disiplin": null
  },
  {
    "id": "pp-62",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 62,
    "judul": "Tabel Dasar Uang Penghargaan Masa Kerja",
    "label": "Pasal 62 — Tabel Dasar Uang Penghargaan Masa Kerja",
    "ayat": [
      "(1) Tabel dasar uang penghargaan masa kerja: 3 sampai kurang dari 6 tahun = 2 bulan upah; 6 sampai kurang dari 9 tahun = 3 bulan; 9 sampai kurang dari 12 tahun = 4 bulan; 12 sampai kurang dari 15 tahun = 5 bulan; 15 sampai kurang dari 18 tahun = 6 bulan; 18 sampai kurang dari 21 tahun = 7 bulan; 21 sampai kurang dari 24 tahun = 8 bulan; dan 24 tahun atau lebih = 10 bulan upah.",
      "(2) Masa kerja kurang dari 3 tahun belum memenuhi tabel dasar uang penghargaan masa kerja. Hak yang lebih baik menurut perjanjian kerja tetap dihormati."
    ],
    "ringkasan": "Tabel dasar uang penghargaan masa kerja: 3 sampai kurang dari 6 tahun = 2 bulan upah; 6 sampai kurang dari 9 tahun = 3 bulan; 9 sampai kurang dari 12 tahun = 4 bulan; 12 sampai kurang dari 15 tahun = 5 bulan; 15 sampai kurang dari 18 tahun ",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [
      "UPMK"
    ],
    "disiplin": null
  },
  {
    "id": "pp-63",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 63,
    "judul": "Uang Penggantian Hak dan Manfaat Tambahan Lama",
    "label": "Pasal 63 — Uang Penggantian Hak dan Manfaat Tambahan Lama",
    "ayat": [
      "(1) Uang penggantian hak meliputi cuti tahunan yang belum diambil dan belum gugur, ongkos pulang pekerja dan keluarganya ke tempat pekerja diterima bekerja, serta hak lain yang ditetapkan dalam perjanjian kerja atau Peraturan Perusahaan.",
      "(2) Naskah 2024-2025 menjanjikan penggantian perumahan serta pengobatan dan perawatan sebesar 15% dari uang pesangon dan/atau uang penghargaan masa kerja bagi pekerja yang memenuhi syarat. Karena bukan lagi komponen minimum dalam PP 35 Tahun 2021, manfaat ini dicatat sebagai MANFAAT TAMBAHAN Perusahaan dan dipertahankan sepanjang masih berlaku menurut perjanjian/kebijakan atau praktik yang mengikat. Kriteria penerima dan dasar hitungnya ditetapkan dalam lampiran keputusan Pengurus. [CATATAN: konfirmasi kebijakan 15% sebelum pengesahan.]"
    ],
    "ringkasan": "Uang penggantian hak meliputi cuti tahunan yang belum diambil dan belum gugur, ongkos pulang pekerja dan keluarganya ke tempat pekerja diterima bekerja, serta hak lain yang ditetapkan dalam perjanjian kerja atau Peraturan Perusahaan.",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "konfirmasi kebijakan 15% sebelum pengesahan.",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-64",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 64,
    "judul": "Alasan Pemberian Uang Pisah",
    "label": "Pasal 64 — Alasan Pemberian Uang Pisah",
    "ayat": [
      "(1) Uang pisah diberikan untuk pengunduran diri yang memenuhi syarat, mangkir yang memenuhi syarat, pelanggaran bersifat mendesak, atau alasan lain yang menurut PP 35 Tahun 2021 berhak atas uang pisah. Besaran uang pisah untuk pengunduran diri mengikuti Pasal 65, untuk pelanggaran mengikuti Pasal 66, dan untuk mangkir mengikuti tabel Pasal 65 dan Pasal 66.",
      "(2) Uang pisah tidak mengganti pesangon, uang penghargaan masa kerja, atau uang penggantian hak yang tetap wajib dibayar untuk alasan PHK tertentu."
    ],
    "ringkasan": "Uang pisah diberikan untuk pengunduran diri yang memenuhi syarat, mangkir yang memenuhi syarat, pelanggaran bersifat mendesak, atau alasan lain yang menurut PP 35 Tahun 2021 berhak atas uang pisah. Besaran uang pisah untuk pengunduran diri ",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [
      65,
      66
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-65",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 65,
    "judul": "Uang Pisah Karena Pengunduran Diri",
    "label": "Pasal 65 — Uang Pisah Karena Pengunduran Diri",
    "ayat": [
      "(1) Pekerja yang mengundurkan diri dan memiliki masa kerja 3 tahun sampai kurang dari 6 tahun menerima uang pisah 2 bulan upah; 6 tahun sampai kurang dari 9 tahun menerima 3 bulan upah; dan 9 tahun atau lebih menerima 4 bulan upah.",
      "(2) Untuk masa kerja kurang dari 3 (tiga) tahun, uang pisah ditetapkan sebesar 1 (satu) bulan upah. Uang penggantian hak dan hak lain yang telah timbul tetap dibayar."
    ],
    "ringkasan": "Pekerja yang mengundurkan diri dan memiliki masa kerja 3 tahun sampai kurang dari 6 tahun menerima uang pisah 2 bulan upah; 6 tahun sampai kurang dari 9 tahun menerima 3 bulan upah; dan 9 tahun atau lebih menerima 4 bulan upah.",
    "dasar_hukum": [],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [
      "uang pisah",
      "resign"
    ],
    "disiplin": null
  },
  {
    "id": "pp-66",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 66,
    "judul": "Uang Pisah dalam PHK Akibat Pelanggaran",
    "label": "Pasal 66 — Uang Pisah dalam PHK Akibat Pelanggaran",
    "ayat": [
      "(1) Naskah lama memberikan uang pisah bagi pekerja dengan pelanggaran Peraturan Perusahaan atau SOP: masa kerja 3 tahun sampai kurang dari 6 tahun sebesar 2 bulan upah; 6 tahun sampai kurang dari 9 tahun sebesar 3 bulan upah; dan 9 tahun atau lebih sebesar 4 bulan upah.",
      "(2) Apabila PHK dilakukan setelah surat peringatan berurutan, uang pisah tambahan menurut kebijakan lama ini tidak mengganti pesangon 0,5 kali tabel dasar, uang penghargaan masa kerja, dan uang penggantian hak yang wajib dibayar. Apabila PHK karena pelanggaran bersifat mendesak, uang penggantian hak serta uang pisah tetap dibayar.",
      "(3) Cakupan uang pisah tambahan bagi pelanggaran SOP berlaku bagi PHK karena pelanggaran sebagaimana Pasal 49. Bagi masa kerja kurang dari 3 (tiga) tahun, uang pisah ditetapkan sebesar 1 (satu) bulan upah, tanpa mengurangi uang penggantian hak yang wajib dibayar."
    ],
    "ringkasan": "Naskah lama memberikan uang pisah bagi pekerja dengan pelanggaran Peraturan Perusahaan atau SOP: masa kerja 3 tahun sampai kurang dari 6 tahun sebesar 2 bulan upah; 6 tahun sampai kurang dari 9 tahun sebesar 3 bulan upah; dan 9 tahun atau l",
    "dasar_hukum": [],
    "referensi": [
      49
    ],
    "perubahan": "",
    "catatan": "",
    "tags": [
      "uang pisah",
      "pelanggaran"
    ],
    "disiplin": null
  },
  {
    "id": "pp-67",
    "bab": 13,
    "bab_judul": "Pemutusan Hubungan Kerja",
    "kategori": "PHK & Kompensasi",
    "pasal": 67,
    "judul": "Dasar Upah Perhitungan Hak PHK",
    "label": "Pasal 67 — Dasar Upah Perhitungan Hak PHK",
    "ayat": [
      "(1) Dasar uang pesangon dan uang penghargaan masa kerja adalah upah pokok ditambah tunjangan tetap. Jika struktur upah berbeda, penghitungan mengikuti PP 35 Tahun 2021 dan ketentuan pengupahan yang berlaku.",
      "(2) Dasar manfaat tambahan yang dihitung dari upah bulanan dinyatakan secara tegas dalam keputusan Perusahaan sehingga tidak menimbulkan perbedaan tafsir."
    ],
    "ringkasan": "Dasar uang pesangon dan uang penghargaan masa kerja adalah upah pokok ditambah tunjangan tetap. Jika struktur upah berbeda, penghitungan mengikuti PP 35 Tahun 2021 dan ketentuan pengupahan yang berlaku.",
    "dasar_hukum": [
      "PP 35 Tahun 2021"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-68",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 68,
    "judul": "Kebebasan Berserikat dan Forum Komunikasi",
    "label": "Pasal 68 — Kebebasan Berserikat dan Forum Komunikasi",
    "ayat": [
      "(1) Pekerja berhak membentuk, menjadi anggota, atau tidak menjadi anggota serikat pekerja sesuai UU 21 Tahun 2000. Perusahaan tidak menghalangi atau mendiskriminasi pekerja karena pilihan tersebut, dan memberikan kesempatan menjalankan kegiatan serikat sesuai kesepakatan serta peraturan.",
      "(2) Pengusaha dan wakil pekerja mengembangkan komunikasi hubungan industrial secara berkala. Jika jumlah pekerja mencapai 50 orang atau lebih, Perusahaan membentuk dan menjalankan Lembaga Kerja Sama Bipartit menurut Pasal 106 UU 13 Tahun 2003 dan ketentuan pelaksanaannya; forum ini tidak menggantikan perundingan penyelesaian perselisihan."
    ],
    "ringkasan": "Pekerja berhak membentuk, menjadi anggota, atau tidak menjadi anggota serikat pekerja sesuai UU 21 Tahun 2000. Perusahaan tidak menghalangi atau mendiskriminasi pekerja karena pilihan tersebut, dan memberikan kesempatan menjalankan kegiatan",
    "dasar_hukum": [
      "UU 21 Tahun 2000",
      "UU 13 Tahun 2003"
    ],
    "referensi": [],
    "perubahan": "Kebebasan berserikat dan LKS Bipartit diakui.",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-69",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 69,
    "judul": "Keluhan dan Penyelesaian Perselisihan Hubungan Industrial",
    "label": "Pasal 69 — Keluhan dan Penyelesaian Perselisihan Hubungan Industrial",
    "ayat": [
      "(1) Pekerja atau serikat pekerja dapat menyampaikan keluhan tentang hak, kepentingan, tata tertib, atau PHK kepada atasan dan HR secara lisan atau tertulis. HR mencatat, memeriksa dokumen, mempertemukan pihak terkait, dan menyampaikan tanggapan tanpa tindakan balasan terhadap pengaduan dengan itikad baik.",
      "(2) Perselisihan hubungan industrial wajib terlebih dahulu diupayakan melalui perundingan bipartit paling lama 30 hari kerja sejak perundingan dimulai dengan risalah tertulis. Bila sepakat, para pihak membuat Perjanjian Bersama dan mendaftarkannya sesuai UU 2 Tahun 2004. Bila gagal, para pihak menempuh pencatatan perselisihan dan mediasi, konsiliasi, arbitrase, atau Pengadilan Hubungan Industrial sesuai jenis perselisihan.",
      "(3) Pengaduan internal tidak menutup hak pekerja meminta bantuan serikat, pengawas ketenagakerjaan, atau lembaga penyelesaian perselisihan yang berwenang."
    ],
    "ringkasan": "Pekerja atau serikat pekerja dapat menyampaikan keluhan tentang hak, kepentingan, tata tertib, atau PHK kepada atasan dan HR secara lisan atau tertulis. HR mencatat, memeriksa dokumen, mempertemukan pihak terkait, dan menyampaikan tanggapan",
    "dasar_hukum": [
      "UU 2 Tahun 2004"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-70",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 70,
    "judul": "Pencegahan dan Penanganan Kekerasan serta Pelecehan Seksual",
    "label": "Pasal 70 — Pencegahan dan Penanganan Kekerasan serta Pelecehan Seksual",
    "ayat": [
      "(1) Perusahaan melarang kekerasan fisik, ancaman, perundungan, pelecehan seksual, pemaksaan, dan pembalasan terhadap pelapor atau saksi di kantor, gudang, kendaraan, perjalanan dinas, dan komunikasi kerja. Kebijakan ini berlaku bagi pekerja, atasan, tamu, dan pihak ketiga dalam lingkup kerja.",
      "(2) Laporan diterima melalui HR atau saluran lain yang dapat diakses tanpa melapor kepada terduga pelaku. Perusahaan membentuk mekanisme atau tim pencegahan dan penanganan berdasarkan Kepmenaker 88 Tahun 2023; pemeriksaan menjaga kerahasiaan, memberi kesempatan pihak terkait didengar, mencegah konflik kepentingan, dan mengutamakan keselamatan serta pemulihan korban.",
      "(3) Tindakan disiplin dijatuhkan secara proporsional setelah pemeriksaan. Pelaporan kepada aparat dan akses bantuan medis atau psikologis difasilitasi sesuai kebutuhan dan hukum; kesepakatan internal tidak boleh memaksa korban melepaskan haknya."
    ],
    "ringkasan": "Perusahaan melarang kekerasan fisik, ancaman, perundungan, pelecehan seksual, pemaksaan, dan pembalasan terhadap pelapor atau saksi di kantor, gudang, kendaraan, perjalanan dinas, dan komunikasi kerja. Kebijakan ini berlaku bagi pekerja, at",
    "dasar_hukum": [
      "Kepmenaker 88",
      "Kepmenaker 88/2023",
      "UU 12/2022 (TPKS)"
    ],
    "referensi": [],
    "perubahan": "Larangan kekerasan dan pelecehan seksual beserta mekanisme penanganannya.",
    "catatan": "",
    "tags": [
      "pelecehan seksual",
      "kekerasan"
    ],
    "disiplin": {
      "tingkat": "SP / PHK",
      "jenis": [
        "Kekerasan",
        "Pelecehan seksual"
      ],
      "catatan": "Larangan kekerasan dan pelecehan; penanganan menjaga kerahasiaan dan keselamatan korban."
    }
  },
  {
    "id": "pp-71",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 71,
    "judul": "Pelindungan Data Pribadi dan Pengawasan Sistem Kerja",
    "label": "Pasal 71 — Pelindungan Data Pribadi dan Pengawasan Sistem Kerja",
    "ayat": [
      "(1) Perusahaan memproses data pekerja, termasuk identitas, gaji, absensi biometrik, kesehatan, lokasi kerja, dan data keluarga, untuk tujuan hubungan kerja, pembayaran, keselamatan, jaminan sosial, dan kewajiban hukum dengan dasar pemrosesan yang sah menurut UU 27 Tahun 2022. Informasi tujuan, kategori, masa simpan, dan penerima data disampaikan secara jelas kepada pekerja.",
      "(2) Akses ke HRIS, fingerprint, CCTV, dan data pelacakan perjalanan dibatasi pada petugas berwenang menurut tugas. Perusahaan menerapkan pengamanan, pencatatan akses, pembetulan data keliru, dan retensi serta pemusnahan sesuai hukum. Data kesehatan dan biometrik mendapat pelindungan lebih ketat.",
      "(3) Penggunaan lokasi atau perangkat kerja untuk pengawasan dilakukan secara proporsional, transparan, dan hanya selama tujuan kerja yang sah. Pekerja dapat mengajukan permintaan atas data pribadinya atau melaporkan dugaan kebocoran melalui HR atau penanggung jawab yang ditunjuk; tindak lanjut mengikuti UU Pelindungan Data Pribadi."
    ],
    "ringkasan": "Perusahaan memproses data pekerja, termasuk identitas, gaji, absensi biometrik, kesehatan, lokasi kerja, dan data keluarga, untuk tujuan hubungan kerja, pembayaran, keselamatan, jaminan sosial, dan kewajiban hukum dengan dasar pemrosesan ya",
    "dasar_hukum": [
      "UU 27 Tahun 2022"
    ],
    "referensi": [],
    "perubahan": "Pelindungan data pribadi pekerja dan pengawasan sistem kerja.",
    "catatan": "",
    "tags": [
      "data pribadi",
      "PDP"
    ],
    "disiplin": null
  },
  {
    "id": "pp-72",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 72,
    "judul": "Keselamatan, Kesehatan, dan Pelaporan Kecelakaan Kerja",
    "label": "Pasal 72 — Keselamatan, Kesehatan, dan Pelaporan Kecelakaan Kerja",
    "ayat": [
      "(1) Perusahaan mengidentifikasi bahaya di gudang, bongkar muat, pengiriman, berkendara, bahan kimia, dan pekerjaan kantor; menyediakan alat pelindung diri, instruksi keselamatan, pemeriksaan peralatan, pelatihan, serta prosedur keadaan darurat menurut UU 1 Tahun 1970 dan ketentuan K3 terkait.",
      "(2) Pekerja mematuhi instruksi keselamatan, menggunakan alat pelindung diri, dan segera melaporkan kecelakaan, kejadian nyaris celaka, atau keadaan berbahaya. Atasan mengamankan lokasi, memastikan pertolongan, mendokumentasikan kejadian, dan HR mengurus pelaporan serta manfaat Jaminan Kecelakaan Kerja sesuai ketentuan.",
      "(3) Pekerja yang menyampaikan laporan keselamatan dengan itikad baik tidak dikenai sanksi karena laporannya. Penugasan kembali setelah sakit atau kecelakaan mempertimbangkan rekomendasi medis serta penyesuaian kerja yang layak."
    ],
    "ringkasan": "Perusahaan mengidentifikasi bahaya di gudang, bongkar muat, pengiriman, berkendara, bahan kimia, dan pekerjaan kantor; menyediakan alat pelindung diri, instruksi keselamatan, pemeriksaan peralatan, pelatihan, serta prosedur keadaan darurat ",
    "dasar_hukum": [
      "UU 1 Tahun 1970",
      "UU 1/1970",
      "PP 44/2015"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": {
      "tingkat": "Teguran / SP",
      "jenis": [
        "K3"
      ],
      "catatan": "Tidak mematuhi instruksi keselamatan atau tidak melaporkan kecelakaan/keadaan berbahaya."
    }
  },
  {
    "id": "pp-73",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 73,
    "judul": "Pekerjaan Alih Daya Bila Digunakan",
    "label": "Pasal 73 — Pekerjaan Alih Daya Bila Digunakan",
    "ayat": [
      "(1) Apabila Perusahaan menyerahkan pekerjaan kepada perusahaan alih daya, jenis pekerjaan dan perjanjian tertulis mengikuti PP 35 Tahun 2021, Putusan MK 168/PUU-XXI/2023, dan Permenaker 7 Tahun 2026. Perusahaan memeriksa perizinan dan kewajiban penyedia serta memastikan perlindungan minimum pekerja alih daya, termasuk upah, lembur, waktu kerja, cuti, K3, jaminan sosial, THR, dan hak pada berakhirnya hubungan kerja.",
      "(2) Pekerja alih daya memiliki hubungan kerja dengan penyedia sesuai perjanjiannya. Penerapan aturan keselamatan, akses lokasi, dan mekanisme pengaduan di tempat kerja Andela tidak menghapus tanggung jawab masing-masing pihak menurut hukum."
    ],
    "ringkasan": "Apabila Perusahaan menyerahkan pekerjaan kepada perusahaan alih daya, jenis pekerjaan dan perjanjian tertulis mengikuti PP 35 Tahun 2021, Putusan MK 168/PUU-XXI/2023, dan Permenaker 7 Tahun 2026. Perusahaan memeriksa perizinan dan kewajiban",
    "dasar_hukum": [
      "PP 35 Tahun 2021",
      "Permenaker 7 Tahun 2026",
      "Putusan MK 168/PUU-XXI/2023"
    ],
    "referensi": [],
    "perubahan": "Pekerjaan alih daya dibatasi pada kegiatan penunjang dan hak minimum tetap dilindungi.",
    "catatan": "",
    "tags": [
      "alih daya",
      "outsourcing"
    ],
    "disiplin": null
  },
  {
    "id": "pp-74",
    "bab": 14,
    "bab_judul": "Pelindungan dan Hubungan Industrial",
    "kategori": "Hubungan Industrial",
    "pasal": 74,
    "judul": "Kesetaraan Kesempatan dan Akomodasi yang Layak",
    "label": "Pasal 74 — Kesetaraan Kesempatan dan Akomodasi yang Layak",
    "ayat": [
      "(1) Perusahaan menerapkan seleksi, penempatan, upah, pelatihan, penilaian, dan disiplin berdasarkan persyaratan pekerjaan secara adil tanpa diskriminasi yang dilarang hukum, termasuk karena jenis kelamin, kehamilan, penggunaan hak cuti, disabilitas, agama, atau keanggotaan serikat pekerja.",
      "(2) Pekerja penyandang disabilitas memperoleh kesempatan dan penyesuaian kerja yang layak menurut UU 8 Tahun 2016 sepanjang terkait kebutuhan pekerjaannya. Permintaan penyesuaian dibahas bersama pekerja dengan menjaga kerahasiaan informasi kesehatannya."
    ],
    "ringkasan": "Perusahaan menerapkan seleksi, penempatan, upah, pelatihan, penilaian, dan disiplin berdasarkan persyaratan pekerjaan secara adil tanpa diskriminasi yang dilarang hukum, termasuk karena jenis kelamin, kehamilan, penggunaan hak cuti, disabil",
    "dasar_hukum": [
      "UU 8 Tahun 2016"
    ],
    "referensi": [],
    "perubahan": "Kesetaraan kesempatan dan akomodasi yang layak bagi penyandang disabilitas.",
    "catatan": "",
    "tags": [],
    "disiplin": null
  },
  {
    "id": "pp-75",
    "bab": 15,
    "bab_judul": "Penutup",
    "kategori": "Penutup",
    "pasal": 75,
    "judul": "Penutup dan Masa Berlaku",
    "label": "Pasal 75 — Penutup dan Masa Berlaku",
    "ayat": [
      "(1) Peraturan Perusahaan ini dimintakan saran dan pertimbangan serikat pekerja atau wakil pekerja, ditandatangani pengurus yang sah, dan diajukan untuk pengesahan kepada pejabat berwenang. Karena unit Cirebon dan Malang berada di lebih dari satu provinsi, kewenangan pengesahan perlu dipastikan menurut Permenaker 28 Tahun 2014.",
      "(2) Peraturan berlaku sejak tanggal sesuai keputusan pengesahan untuk jangka waktu paling lama 2 tahun dan dibagikan serta dijelaskan kepada seluruh pekerja. Perubahan di tengah masa berlaku mengikuti prosedur pengesahan kembali dan tidak menghapus hak yang telah timbul.",
      "(3) Hal teknis yang belum diatur dapat ditetapkan secara tertulis sepanjang tidak mengurangi hak minimum menurut hukum atau hak yang lebih baik yang telah berlaku. PENETAPAN Ditetapkan di : Cirebon Pada tanggal : ____________________ CV ANDELA JAYA (_____________________________) Pengurus yang berwenang Bukti permintaan saran dan pertimbangan wakil pekerja/serikat pekerja dilampirkan dalam pengajuan pengesahan kepada pejabat ketenagakerjaan yang berwenang (Permenaker 28/2014)."
    ],
    "ringkasan": "Peraturan Perusahaan ini dimintakan saran dan pertimbangan serikat pekerja atau wakil pekerja, ditandatangani pengurus yang sah, dan diajukan untuk pengesahan kepada pejabat berwenang. Karena unit Cirebon dan Malang berada di lebih dari sat",
    "dasar_hukum": [
      "Permenaker 28 Tahun 2014"
    ],
    "referensi": [],
    "perubahan": "",
    "catatan": "",
    "tags": [],
    "disiplin": null
  }
]);

export const PP_COMPLIANCE_SUMMARY = Object.freeze([
  {
    "status": "BERISIKO HUKUM",
    "jumlah": 5,
    "persen": 6.6,
    "tindak_lanjut": "Perlu diubah - berpotensi sengketa / tidak dapat ditegakkan."
  },
  {
    "status": "SESUAI",
    "jumlah": 26,
    "persen": 34.2,
    "tindak_lanjut": "Dapat dipertahankan."
  },
  {
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "jumlah": 21,
    "persen": 27.6,
    "tindak_lanjut": "Disempurnakan agar lebih lengkap dan jelas."
  },
  {
    "status": "TIDAK SESUAI",
    "jumlah": 13,
    "persen": 17.1,
    "tindak_lanjut": "WAJIB diubah - bertentangan langsung dengan hukum."
  },
  {
    "status": "GAP / BELUM DIATUR",
    "jumlah": 11,
    "persen": 14.5,
    "tindak_lanjut": "Perlu pengaturan baru - materi wajib yang belum ada."
  },
  {
    "status": "TOTAL",
    "jumlah": 76,
    "persen": 100,
    "tindak_lanjut": ""
  }
]);

export const PP_KEY_FINDINGS = Object.freeze([
  "Masa kerja PKWT dianggap tidak dihitung sebagai masa kerja (Pasal 5) - bertentangan dengan PP 35/2021 & MK 168/PUU-XXI/2023.",
  "PHK 'tanpa kompensasi apapun' (Pasal 48) dan 'tanpa pesangon' atas kesalahan berat (Pasal 53) - bertentangan dengan PP 35/2021 Pasal 52.",
  "Ambang PHK sakit berkepanjangan 3 bulan (Pasal 49) - seharusnya setelah melampaui 12 bulan.",
  "Pengecualian upah lembur berdasarkan nama jabatan (Pasal 24) - bertentangan dengan PP 35/2021 Pasal 40(3).",
  "THR hanya untuk karyawan tetap & pekerja berhenti 30 hari sebelum hari raya dianggap tidak berhak (Pasal 26) - bertentangan dengan Permenaker 6/2016.",
  "Struktur & skala upah tidak diatur (Pasal 21) - wajib menurut PP 36/2021 jo. PP 49/2025 & MK 168/PUU-XXI/2023.",
  "Program JKP tidak diatur (Pasal 25) - wajib menurut PP 37/2021 jo. PP 6/2025.",
  "Jam kerja Senin 8 jam pada pola 6 hari (Pasal 32) - melebihi batas 7 jam/hari.",
  "Cuti tahunan gugur otomatis (Pasal 39) dan pembatasan pengambilan cuti (Pasal 41) - berisiko tidak dapat ditegakkan.",
  "Cuti melahirkan belum mengacu UU 4/2024 (Pasal 40); izin haid & cuti pendampingan suami belum diatur."
]);

export const PP_COMPARISONS = Object.freeze([
  {
    "aspek": "Masa kerja PKWT",
    "lama": "Tidak dihitung sebagai masa kerja.",
    "seharusnya": "Seluruh masa PKWT diperhitungkan sebagai masa kerja.",
    "dasar_hukum": "PP 35/2021; MK 168/PUU-XXI/2023"
  },
  {
    "aspek": "Batas PKWT",
    "lama": "2 tahun + 1 kali perpanjangan 1 tahun.",
    "seharusnya": "Termasuk seluruh perpanjangan paling lama 5 tahun.",
    "dasar_hukum": "PP 35/2021 Pasal 8; MK 168/PUU-XXI/2023"
  },
  {
    "aspek": "Uang kompensasi PKWT",
    "lama": "Tidak ada.",
    "seharusnya": "Masa kerja/12 x 1 bulan upah, dibayar tiap akhir PKWT/perpanjangan.",
    "dasar_hukum": "PP 35/2021 Pasal 15-16"
  },
  {
    "aspek": "Struktur & skala upah",
    "lama": "Tidak diatur.",
    "seharusnya": "Wajib disusun untuk pekerja masa kerja >= 1 tahun.",
    "dasar_hukum": "PP 36/2021 Pasal 21-22; PP 49/2025; MK 168"
  },
  {
    "aspek": "Upah minimum",
    "lama": "Tidak kurang dari upah minimum pemerintah (umum).",
    "seharusnya": "UMP/UMK/UMSP/UMSK & sektoral; hanya untuk masa kerja < 1 tahun.",
    "dasar_hukum": "PP 36/2021 Pasal 23-25 jo. PP 49/2025"
  },
  {
    "aspek": "Pengecualian upah lembur",
    "lama": "Berdasarkan nama jabatan: Kasir, HRD, Purchasing, Akunting, Sales.",
    "seharusnya": "Hanya golongan jabatan tertentu: pemikir/perencana/pelaksana/pengendali, waktu kerja tidak dapat dibatasi, upah lebih tinggi.",
    "dasar_hukum": "PP 35/2021 Pasal 40(3)"
  },
  {
    "aspek": "Batas kerja lembur",
    "lama": "Tidak dibatasi.",
    "seharusnya": "Maks 4 jam/hari dan 18 jam/minggu, dengan persetujuan pekerja.",
    "dasar_hukum": "PP 35/2021 Pasal 26"
  },
  {
    "aspek": "Jam kerja pola 6 hari",
    "lama": "Senin 08.00-17.00 (8 jam) - melebihi 7 jam/hari.",
    "seharusnya": "Setiap hari maks 7 jam (mis. Senin-Jumat 08.00-16.00, Sabtu 08.00-12.00).",
    "dasar_hukum": "PP 35/2021 Pasal 22(1)"
  },
  {
    "aspek": "Jaminan sosial",
    "lama": "JKK, JKM, JHT, JP, BPJS Kesehatan.",
    "seharusnya": "Ditambah JKP (iuran 0,36% upah; manfaat s.d. 60% upah 6 bulan).",
    "dasar_hukum": "PP 37/2021 jo. PP 6/2025"
  },
  {
    "aspek": "THR",
    "lama": "Hanya karyawan tetap; berhenti 1 bulan sebelum hari raya tidak berhak.",
    "seharusnya": "Semua pekerja >= 1 bulan masa kerja; berhenti dalam 30 hari sebelum hari raya tetap berhak.",
    "dasar_hukum": "Permenaker 6/2016 Pasal 2, 7"
  },
  {
    "aspek": "Cuti tahunan",
    "lama": "Gugur otomatis bila tidak diambil dalam 1 tahun; maks 3 hari/pengambilan.",
    "seharusnya": "Tidak gugur tanpa pemberitahuan & kesempatan; penjadwalan adil.",
    "dasar_hukum": "UU 13/2003 Pasal 79"
  },
  {
    "aspek": "Cuti melahirkan",
    "lama": "3 bulan (1,5+1,5); upah setelahnya skema sakit 100/75/50/25.",
    "seharusnya": "Paling singkat 3 bulan, dapat ditambah 3 bulan; upah 100% bulan 1-4 & 75% bulan 5-6.",
    "dasar_hukum": "UU 4/2024 Pasal 4-5"
  },
  {
    "aspek": "Izin haid & cuti pendampingan suami",
    "lama": "Tidak diatur.",
    "seharusnya": "Izin hari ke-1 & ke-2 haid; suami 2 hari + paling lama 3 hari berikutnya.",
    "dasar_hukum": "UU 13/2003 Pasal 81; UU 4/2024 Pasal 6"
  },
  {
    "aspek": "PHK karena pelanggaran (SP)",
    "lama": "'Tanpa kompensasi apapun'.",
    "seharusnya": "0,5x pesangon + 1x UPMK + uang penggantian hak.",
    "dasar_hukum": "PP 35/2021 Pasal 52(1)"
  },
  {
    "aspek": "PHK karena kesalahan berat",
    "lama": "'Tanpa pesangon' (istilah kesalahan berat).",
    "seharusnya": "Dicabut; gunakan 'pelanggaran bersifat mendesak', wajib UPH + uang pisah.",
    "dasar_hukum": "PP 35/2021 Pasal 52(2); MK 12/PUU-I/2003"
  },
  {
    "aspek": "PHK sakit berkepanjangan",
    "lama": "Dapat PHK setelah 3 bulan.",
    "seharusnya": "Dapat PHK setelah melampaui 12 bulan; hak 2x pesangon + 1x UPMK + UPH.",
    "dasar_hukum": "PP 35/2021 Pasal 55"
  },
  {
    "aspek": "Usia pensiun",
    "lama": "56 tahun.",
    "seharusnya": "Selaraskan dengan usia manfaat JP BPJS (59 tahun pada 2026) atau atur transisi.",
    "dasar_hukum": "PP 45/2015; praktik BPJS"
  },
  {
    "aspek": "Kebebasan berserikat & LKS Bipartit",
    "lama": "Tidak diatur.",
    "seharusnya": "Diakui; LKS Bipartit wajib bila pekerja >= 50 orang.",
    "dasar_hukum": "UU 21/2000; UU 13/2003 Pasal 106"
  },
  {
    "aspek": "Anti kekerasan & pelecehan seksual",
    "lama": "Tidak diatur.",
    "seharusnya": "Larangan + mekanisme pelaporan & penanganan.",
    "dasar_hukum": "Kepmenaker 88/2023; UU 12/2022"
  },
  {
    "aspek": "Pelindungan data pribadi",
    "lama": "Tidak diatur.",
    "seharusnya": "Tata kelola data pekerja & hak subjek data.",
    "dasar_hukum": "UU 27/2022"
  },
  {
    "aspek": "Pekerjaan alih daya",
    "lama": "Tidak diatur.",
    "seharusnya": "Hanya 6 kegiatan penunjang; jaminan hak minimum; transisi s.d. 30 April 2028.",
    "dasar_hukum": "PP 35/2021; Permenaker 7/2026"
  }
]);

export const PP_MANAGEMENT_DECISIONS = Object.freeze([
  {
    "no": 1,
    "butir": "Usia pensiun hubungan kerja",
    "usulan": "Tetapkan 58 tahun dan tinjau agar selaras dengan usia manfaat JP BPJS (59 tahun pada 2026).",
    "konsekuensi": "Kekosongan penghasilan antara PHK pensiun dan pencairan JP BPJS."
  },
  {
    "no": 2,
    "butir": "Uang pisah masa kerja < 3 tahun",
    "usulan": "1 bulan upah (konsisten untuk mengundurkan diri, mangkir, dan pelanggaran).",
    "konsekuensi": "Ketidakpastian hak & potensi sengketa."
  },
  {
    "no": 3,
    "butir": "Uang pisah karena mangkir & alasan lain",
    "usulan": "Mengikuti tabel Pasal 65/66 (2/3/4 bulan).",
    "konsekuensi": "Hak pekerja tidak dapat dihitung pasti."
  },
  {
    "no": 4,
    "butir": "Jadwal kerja pola 6 hari",
    "usulan": "Senin-Jumat 08.00-16.00 (7 jam), Sabtu 08.00-12.00 (4 jam); maks 7 jam/hari.",
    "konsekuensi": "Pelanggaran jam kerja & risiko upah lembur."
  },
  {
    "no": 5,
    "butir": "Daftar jabatan pengecualian upah lembur",
    "usulan": "Daftar tertutup dengan pemenuhan seluruh 3 unsur (pemikir/perencana/pelaksana/pengendali; waktu tidak dibatasi; upah lebih tinggi).",
    "konsekuensi": "Risiko tuntutan upah lembur."
  },
  {
    "no": 6,
    "butir": "Manfaat 15% perumahan/pengobatan",
    "usulan": "Pertahankan sebagai manfaat tambahan dengan kriteria penerima yang jelas.",
    "konsekuensi": "Sengketa tafsir penerima & dasar hitung."
  },
  {
    "no": 7,
    "butir": "Cuti tambahan & carryover",
    "usulan": "Cantumkan dalam lampiran kebijakan; tidak mengurangi hak minimum.",
    "konsekuensi": "Hak yang sudah dipraktikkan berpotensi dianggap dihapus."
  },
  {
    "no": 8,
    "butir": "Kewenangan pengesahan PP (lintas provinsi)",
    "usulan": "Pastikan pejabat yang berwenang sesuai Permenaker 28/2014.",
    "konsekuensi": "Pengesahan dapat ditolak/tidak sah."
  }
]);

export const PP_LEGAL_BASIS = Object.freeze([
  {
    "no": 1,
    "peraturan": "UU No. 13 Tahun 2003",
    "pokok": "Ketenagakerjaan (sebagaimana diubah UU No. 6 Tahun 2023 jo. Putusan MK No. 168/PUU-XXI/2023)."
  },
  {
    "no": 2,
    "peraturan": "UU No. 6 Tahun 2023",
    "pokok": "Penetapan Perppu No. 2 Tahun 2022 tentang Cipta Kerja menjadi Undang-Undang (klaster ketenagakerjaan)."
  },
  {
    "no": 3,
    "peraturan": "Putusan MK No. 168/PUU-XXI/2023",
    "pokok": "Mengubah/menegaskan: batas PKWT paling lama 5 tahun termasuk perpanjangan; upah minimum hanya bagi masa kerja < 1 tahun; upah di atas minimum berdasarkan struktur & skala upah/kesepakatan; batas PHK & pesangon minimum; pembatasan alih daya."
  },
  {
    "no": 4,
    "peraturan": "PP No. 35 Tahun 2021",
    "pokok": "PKWT, alih daya, waktu kerja & istirahat, dan PHK (Pasal 5-16, 22-40, 50-57)."
  },
  {
    "no": 5,
    "peraturan": "PP No. 36 Tahun 2021",
    "pokok": "Pengupahan, sebagaimana diubah PP No. 51 Tahun 2023 dan PP No. 49 Tahun 2025."
  },
  {
    "no": 6,
    "peraturan": "PP No. 49 Tahun 2025",
    "pokok": "Perubahan kedua PP Pengupahan: struktur & skala upah, UMP/UMK/UMSP/UMSK, nilai alfa 0,5-0,9."
  },
  {
    "no": 7,
    "peraturan": "UU No. 4 Tahun 2024 (UU KIA)",
    "pokok": "Kesejahteraan Ibu dan Anak: cuti melahirkan 3-6 bulan, upah 100% bulan 1-4 & 75% bulan 5-6; cuti pendampingan suami 2+3 hari; hak laktasi."
  },
  {
    "no": 8,
    "peraturan": "Permenaker No. 6 Tahun 2016",
    "pokok": "Tunjangan Hari Raya Keagamaan bagi pekerja/buruh."
  },
  {
    "no": 9,
    "peraturan": "Permenaker No. 28 Tahun 2014",
    "pokok": "Tata cara pembuatan dan pengesahan Peraturan Perusahaan (berlaku maks. 2 tahun)."
  },
  {
    "no": 10,
    "peraturan": "PP No. 44 Tahun 2015",
    "pokok": "JKK & JKM; PP No. 46 Tahun 2015 (JHT); PP No. 45 Tahun 2015 (JP)."
  },
  {
    "no": 11,
    "peraturan": "PP No. 37 Tahun 2021 jo. PP No. 6 Tahun 2025",
    "pokok": "Jaminan Kehilangan Pekerjaan (JKP): iuran 0,36% dari upah, manfaat hingga 60% upah selama 6 bulan."
  },
  {
    "no": 12,
    "peraturan": "Perpres No. 82 Tahun 2018",
    "pokok": "Jaminan Kesehatan (iuran 5%: 4% pemberi kerja, 1% pekerja)."
  },
  {
    "no": 13,
    "peraturan": "UU No. 21 Tahun 2000",
    "pokok": "Serikat Pekerja/Serikat Buruh - kebebasan berserikat."
  },
  {
    "no": 14,
    "peraturan": "UU No. 2 Tahun 2004",
    "pokok": "Penyelesaian Perselisihan Hubungan Industrial (bipartit, mediasi, konsiliasi, arbitrase, PHI)."
  },
  {
    "no": 15,
    "peraturan": "UU No. 1 Tahun 1970",
    "pokok": "Keselamatan Kerja."
  },
  {
    "no": 16,
    "peraturan": "Kepmenaker No. 88 Tahun 2023",
    "pokok": "Pencegahan dan penanganan kekerasan seksual di tempat kerja."
  },
  {
    "no": 17,
    "peraturan": "UU No. 12 Tahun 2022 (TPKS)",
    "pokok": "Tindak Pidana Kekerasan Seksual."
  },
  {
    "no": 18,
    "peraturan": "UU No. 27 Tahun 2022 (PDP)",
    "pokok": "Pelindungan Data Pribadi."
  },
  {
    "no": 19,
    "peraturan": "UU No. 8 Tahun 2016",
    "pokok": "Penyandang Disabilitas - kesetaraan & akomodasi yang layak."
  },
  {
    "no": 20,
    "peraturan": "Permenaker No. 7 Tahun 2026",
    "pokok": "Pekerjaan Alih Daya: membatasi alih daya pada 6 kegiatan penunjang; masa transisi 2 tahun (s.d. 30 April 2028)."
  },
  {
    "no": 21,
    "peraturan": "Kepmenakertrans No. 102/MEN/VI/2004",
    "pokok": "Dasar perhitungan upah lembur (masih dirujuk; kini dilengkapi PP 35/2021)."
  }
]);

export const PP_COMPLIANCE_MATRIX = Object.freeze([
  {
    "no": 1,
    "bab": "BAB 1",
    "pasal": "Pasal 1",
    "judul": "Pengertian",
    "klausul": "Karyawan didefinisikan sebagai tenaga kerja yang diterima berdasarkan Surat Keputusan Pengangkatan oleh Direksi.",
    "status": "BERISIKO HUKUM",
    "dasar_hukum": "UU 13/2003 Pasal 50-51; PP 35/2021 Pasal 3-4",
    "risiko": "Karyawan didefinisikan sebagai tenaga kerja yang diterima berdasarkan Surat Keputusan Pengangkatan oleh Direksi.",
    "rekomendasi": "Definisi diubah: hubungan kerja lahir karena perjanjian kerja (unsur pekerjaan, upah, perintah), bukan semata SK pengangkatan. SK hanya bukti administratif."
  },
  {
    "no": 2,
    "bab": "BAB 1",
    "pasal": "Pasal 2",
    "judul": "Maksud dan tujuan",
    "klausul": "Tujuan menciptakan hubungan kerja baik serta ketenangan dan produktivitas kerja.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 1 angka 1",
    "risiko": "Tujuan menciptakan hubungan kerja baik serta ketenangan dan produktivitas kerja.",
    "rekomendasi": "Pertahankan; dapat ditambah asas hubungan industrial Pancasila (kekeluargaan, gotong royong)."
  },
  {
    "no": 3,
    "bab": "BAB 1",
    "pasal": "Pasal 3",
    "judul": "Ruang lingkup",
    "klausul": "Hal khusus dan yang belum diatur akan diatur dengan Surat Keputusan Direksi.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 52; Permenaker 28/2014",
    "risiko": "Hal khusus dan yang belum diatur akan diatur dengan Surat Keputusan Direksi.",
    "rekomendasi": "Tambahkan klausul: pengaturan teknis hanya sah sepanjang tidak mengurangi hak minimum menurut peraturan perundang-undangan, perjanjian kerja, atau PP ini."
  },
  {
    "no": 4,
    "bab": "BAB 2",
    "pasal": "Pasal 4",
    "judul": "Ketentuan umum perjanjian kerja",
    "klausul": "Menyatakan hubungan kerja lahir dari perjanjian kerja; 2 jenis PKWT & PKWTT.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 50-54; PP 35/2021 Pasal 4-5",
    "risiko": "Menyatakan hubungan kerja lahir dari perjanjian kerja; 2 jenis PKWT & PKWTT.",
    "rekomendasi": "Tambahkan kewajiban menyerahkan salinan perjanjian/surat pengangkatan dan pencatatan jabatan, lokasi, komponen upah, serta waktu kerja."
  },
  {
    "no": 5,
    "bab": "BAB 2",
    "pasal": "Pasal 5",
    "judul": "PKWT",
    "klausul": "PKWT didasarkan jangka waktu/selesainya pekerjaan; tidak boleh masa percobaan; dapat diperpanjang/diperbarui; lama 2 tahun + 1 kali perpanjangan 1 tahun; pekerjaan dianggap selesai paling lama 3 tahun; (Pasal 5 ayat 8) menyatakan masa PKWT TIDAK dihitung sebagai masa kerja.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 5-16; Putusan MK 168/PUU-XXI/2023",
    "risiko": "PKWT didasarkan jangka waktu/selesainya pekerjaan; tidak boleh masa percobaan; dapat diperpanjang/diperbarui; lama 2 tahun + 1 kali perpanjangan 1 tahun; pekerjaan dianggap selesai paling lama 3 tahun; (Pasal 5 ayat 8) menyatakan masa PKWT TIDAK dihitung sebagai masa kerja.",
    "rekomendasi": "PENTING. (a) Masa PKWT HARUS diperhitungkan sebagai masa kerja; frasa 'tidak dihitung sebagai masa kerja' dihapus. (b) Batas waktu disesuaikan: termasuk seluruh perpanjangan paling lama 5 tahun. (c) Tambahkan uang kompensasi PKWT (masa kerja/12 x 1 bulan upah). (d) Tambahkan kewajiban pencatatan PKWT ke Dinas (3/7 hari kerja) & bentuk tertulis Bahasa Indonesia."
  },
  {
    "no": 6,
    "bab": "BAB 2",
    "pasal": "Pasal 6",
    "judul": "PKWTT",
    "klausul": "Isi Pasal 6 mengulang seluruh ketentuan PKWT (salah salin); tidak mengatur PKWTT, masa percobaan, maupun surat pengangkatan.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 56, 59-60, 63; PP 35/2021",
    "risiko": "Isi Pasal 6 mengulang seluruh ketentuan PKWT (salah salin); tidak mengatur PKWTT, masa percobaan, maupun surat pengangkatan.",
    "rekomendasi": "PERBAIKI TOTAL. Pasal 6 harus mengatur: PKWTT untuk waktu tidak terbatas; boleh lisan dengan surat pengangkatan (identitas, tanggal mulai, jenis pekerjaan, upah); masa percobaan hanya untuk PKWTT, tertulis, paling lama 3 bulan, upah >= upah minimum."
  },
  {
    "no": 7,
    "bab": "BAB 2",
    "pasal": "Pasal 7",
    "judul": "Penerimaan karyawan",
    "klausul": "Penerimaan sesuai kebutuhan, melalui prosedur rekrutmen; calon memenuhi usia/pendidikan/keahlian; karyawan tetap menerima SK Direksi.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 59-60; UU 8/2016; UU 21/2000",
    "risiko": "Penerimaan sesuai kebutuhan, melalui prosedur rekrutmen; calon memenuhi usia/pendidikan/keahlian; karyawan tetap menerima SK Direksi.",
    "rekomendasi": "Tambahkan asas seleksi objektif & tidak diskriminatif serta penjelasan syarat kerja kepada calon pekerja."
  },
  {
    "no": 8,
    "bab": "BAB 3",
    "pasal": "Pasal 8",
    "judul": "Hak karyawan",
    "klausul": "Hak atas tugas, imbalan, waktu/hari istirahat, BPJS, dan pembelaan hukum bila terkena tindakan hukum karena menjalankan tugas.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 5-6; UU 12/2022; Kepmenaker 88/2023",
    "risiko": "Hak atas tugas, imbalan, waktu/hari istirahat, BPJS, dan pembelaan hukum bila terkena tindakan hukum karena menjalankan tugas.",
    "rekomendasi": "Tambahkan hak atas perlindungan dari kekerasan, pelecehan seksual, perundungan, dan diskriminasi; serta hak cuti/istirahat dan K3 secara eksplisit."
  },
  {
    "no": 9,
    "bab": "BAB 3",
    "pasal": "Pasal 9",
    "judul": "Kewajiban melaksanakan tugas",
    "klausul": "Melaksanakan tugas dengan tanggung jawab, jujur, tertib, cermat; membimbing bawahan.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 102-103",
    "risiko": "Melaksanakan tugas dengan tanggung jawab, jujur, tertib, cermat; membimbing bawahan.",
    "rekomendasi": "Pertahankan."
  },
  {
    "no": 10,
    "bab": "BAB 3",
    "pasal": "Pasal 10",
    "judul": "Tata tertib kerja",
    "klausul": "Kewajiban memeriksa peralatan, menjaga ketertiban/kebersihan, berpakaian sopan, melaporkan bahaya.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 1/1970; PP 35/2021 Pasal 22-25",
    "risiko": "Kewajiban memeriksa peralatan, menjaga ketertiban/kebersihan, berpakaian sopan, melaporkan bahaya.",
    "rekomendasi": "Tambahkan kewajiban memakai APD, penyediaan APD & pelatihan K3 oleh perusahaan tanpa biaya pekerja, serta prosedur kerja aman di gudang/kendaraan."
  },
  {
    "no": 11,
    "bab": "BAB 3",
    "pasal": "Pasal 11",
    "judul": "Rahasia perusahaan",
    "klausul": "Kewajiban menyimpan rahasia; larangan membawa keluar dokumen; penyerahan dokumen saat PHK; pelanggaran dapat dikategorikan perbuatan melawan hukum.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 30/2000; UU 13/2003",
    "risiko": "Kewajiban menyimpan rahasia; larangan membawa keluar dokumen; penyerahan dokumen saat PHK; pelanggaran dapat dikategorikan perbuatan melawan hukum.",
    "rekomendasi": "Tambahkan pengecualian: kewajiban ini tidak menghalangi pengungkapan yang diwajibkan hukum atau pelaporan dugaan pelanggaran (whistleblowing) dengan itikad baik."
  },
  {
    "no": 12,
    "bab": "BAB 4",
    "pasal": "Pasal 12",
    "judul": "Penggunaan milik perusahaan",
    "klausul": "Larangan menyalahgunakan/membawa keluar aset; barang bekas pakai termasuk inventaris.",
    "status": "BERISIKO HUKUM",
    "dasar_hukum": "PP 36/2021 Pasal 57-65",
    "risiko": "Larangan menyalahgunakan/membawa keluar aset; barang bekas pakai termasuk inventaris.",
    "rekomendasi": "Tambahkan mekanisme ganti rugi berbasis bukti, asas proporsionalitas, dan batas pemotongan upah sesuai peraturan pengupahan (tidak melebihi batas hukum)."
  },
  {
    "no": 13,
    "bab": "BAB 4",
    "pasal": "Pasal 13",
    "judul": "Pencegahan bahaya kebakaran",
    "klausul": "Pelanggaran yang menimbulkan kerugian 'dikenakan hukuman pemutusan hubungan kerja' dan wajib membayar kerugian.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 52; UU 13/2003 Pasal 155",
    "risiko": "Pelanggaran yang menimbulkan kerugian 'dikenakan hukuman pemutusan hubungan kerja' dan wajib membayar kerugian.",
    "rekomendasi": "PHK tidak boleh otomatis. Harus melalui pemeriksaan, kesempatan membela diri, dan prosedur SP/kesalahan mendesak, serta tetap membayar hak PHK. Hilangkan klausul PHK otomatis & ganti rugi otomatis."
  },
  {
    "no": 14,
    "bab": "BAB 4",
    "pasal": "Pasal 14",
    "judul": "Larangan menerima pemberian",
    "klausul": "Larangan menerima komisi/hadiah terkait jabatan.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 160",
    "risiko": "Larangan menerima komisi/hadiah terkait jabatan.",
    "rekomendasi": "Tambahkan kewajiban melaporkan hadiah yang tidak dapat ditolak dan tata kelola benturan kepentingan."
  },
  {
    "no": 15,
    "bab": "BAB 4",
    "pasal": "Pasal 15",
    "judul": "Kerja rangkap jabatan",
    "klausul": "Larangan memiliki usaha/sebagai direksi perusahaan sejenis & bekerja rangkap tanpa izin; batas 6 jam/minggu.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 160(4)",
    "risiko": "Larangan memiliki usaha/sebagai direksi perusahaan sejenis & bekerja rangkap tanpa izin; batas 6 jam/minggu.",
    "rekomendasi": "Pertahankan, tambahkan penegasan bahwa larangan tidak berlaku otomatis bagi kegiatan pribadi yang tidak berkonflik dan dilakukan di luar jam kerja."
  },
  {
    "no": 16,
    "bab": "BAB 5",
    "pasal": "Pasal 16",
    "judul": "Penetapan jabatan",
    "klausul": "Direksi menetapkan jabatan sesuai struktur organisasi dan kualifikasi.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 160",
    "risiko": "Direksi menetapkan jabatan sesuai struktur organisasi dan kualifikasi.",
    "rekomendasi": "Pertahankan; tambahkan kewajiban menyampaikan perubahan penting secara tertulis."
  },
  {
    "no": 17,
    "bab": "BAB 5",
    "pasal": "Pasal 17",
    "judul": "Perubahan jabatan",
    "klausul": "3 jenis perubahan: promosi, mutasi, demosi.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 160",
    "risiko": "3 jenis perubahan: promosi, mutasi, demosi.",
    "rekomendasi": "Pertahankan; pastikan demosi tidak menjadi sarana diskriminasi/hukuman tanpa pemeriksaan."
  },
  {
    "no": 18,
    "bab": "BAB 5",
    "pasal": "Pasal 18",
    "judul": "Ketentuan perubahan jabatan",
    "klausul": "Orientasi 3 bulan (dapat diperpanjang s.d. 6 bulan); promosi: gaji sama selama orientasi, tunjangan disesuaikan.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 160",
    "risiko": "Orientasi 3 bulan (dapat diperpanjang s.d. 6 bulan); promosi: gaji sama selama orientasi, tunjangan disesuaikan.",
    "rekomendasi": "Tambahkan kepastian tertulis besaran upah/tunjangan selama orientasi; orientasi bukan masa percobaan baru dan tidak mengurangi upah yang disepakati."
  },
  {
    "no": 19,
    "bab": "BAB 6",
    "pasal": "Pasal 19",
    "judul": "Penilaian prestasi kerja",
    "klausul": "Penilaian berkala oleh atasan; dasar kenaikan gaji/promosi/bonus.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 160",
    "risiko": "Penilaian berkala oleh atasan; dasar kenaikan gaji/promosi/bonus.",
    "rekomendasi": "Pertahankan; tambahkan hak pekerja melihat hasil & menyampaikan tanggapan."
  },
  {
    "no": 20,
    "bab": "BAB 6",
    "pasal": "Pasal 20",
    "judul": "Peningkatan kualitas SDM",
    "klausul": "Perusahaan memberi kesempatan pendidikan; biaya ditanggung perusahaan; gaji penuh; ada perjanjian pendidikan.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 9-12",
    "risiko": "Perusahaan memberi kesempatan pendidikan; biaya ditanggung perusahaan; gaji penuh; ada perjanjian pendidikan.",
    "rekomendasi": "Pertahankan; jika ada ikatan dinas, atur proporsional & tertulis (biaya, lama ikatan, konsekuensi)."
  },
  {
    "no": 21,
    "bab": "BAB 7",
    "pasal": "Pasal 21",
    "judul": "Penetapan gaji",
    "klausul": "Direksi menetapkan sistem penggajian; kenaikan gaji 1x setiap awal tahun; merujuk inflasi, prestasi, kemampuan; gaji terendah tidak kurang upah minimum.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 36/2021 Pasal 21-24 jo. PP 49/2025; Putusan MK 168/PUU-XXI/2023",
    "risiko": "Direksi menetapkan sistem penggajian; kenaikan gaji 1x setiap awal tahun; merujuk inflasi, prestasi, kemampuan; gaji terendah tidak kurang upah minimum.",
    "rekomendasi": "PENTING. Tambahkan kewajiban menyusun STRUKTUR & SKALA UPAH (wajib). Upah minimum hanya untuk masa kerja < 1 tahun; pekerja >= 1 tahun berpedoman struktur & skala upah. Rujuk UMP/UMK/UMSP/UMSK & upah minimum sektoral. Kenaikan upah 1x/tahun bukan kewajiban hukum tetapi boleh sebagai kebijakan."
  },
  {
    "no": 22,
    "bab": "BAB 7",
    "pasal": "Pasal 22",
    "judul": "Komponen gaji",
    "klausul": "Gaji pokok, tunjangan tetap, tunjangan jabatan, tunjangan keahlian/fungsional, tunjangan komunikasi/operasional.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 36/2021 Pasal 5-8",
    "risiko": "Gaji pokok, tunjangan tetap, tunjangan jabatan, tunjangan keahlian/fungsional, tunjangan komunikasi/operasional.",
    "rekomendasi": "Tegaskan klasifikasi tunjangan tetap vs tidak tetap dan bedakan penggantian biaya operasional (komunikasi/transport) dari unsur upah; nyatakan komponen upah dalam perjanjian/SK."
  },
  {
    "no": 23,
    "bab": "BAB 7",
    "pasal": "Pasal 23",
    "judul": "Pembayaran gaji",
    "klausul": "Dibayarkan tanggal 25, selambat-lambatnya akhir bulan; melalui transfer.",
    "status": "SESUAI",
    "dasar_hukum": "PP 36/2021 Pasal 36-38",
    "risiko": "Dibayarkan tanggal 25, selambat-lambatnya akhir bulan; melalui transfer.",
    "rekomendasi": "Pertahankan; tambahkan hak menerima rincian komponen upah & potongan."
  },
  {
    "no": 24,
    "bab": "BAB 7",
    "pasal": "Pasal 24",
    "judul": "Lembur",
    "klausul": "Lembur di atas 7 jam/40 jam; rujukan Kepmenakertrans 102/2004; upah sejam 1/173; hari biasa 1,5x lalu 2x; hari istirahat/libur 2x/3x/4x; pengecualian lembur bagi Kasir, HRD, Purchasing, Akunting, Sales.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 26-40; UU 13/2003 Pasal 77-78",
    "risiko": "Lembur di atas 7 jam/40 jam; rujukan Kepmenakertrans 102/2004; upah sejam 1/173; hari biasa 1,5x lalu 2x; hari istirahat/libur 2x/3x/4x; pengecualian lembur bagi Kasir, HRD, Purchasing, Akunting, Sales.",
    "rekomendasi": "PENTING. (a) Tambahkan batas lembur 4 jam/hari & 18 jam/minggu. (b) Wajib ada perintah pengusaha + persetujuan pekerja tertulis. (c) HAPUS pengecualian berbasis nama jabatan; pengecualian hanya bagi golongan jabatan tertentu (pemikir/perencana/pelaksana/pengendali, waktu kerja tidak dapat dibatasi, upah lebih tinggi). (d) Tambahkan dasar upah minimal 75% jika upah pokok+tunjangan tetap < 75%. (e) Sediakan makan/minum 1.400 kkal untuk lembur >= 4 jam. (f) Perbarui rujukan hukum."
  },
  {
    "no": 25,
    "bab": "BAB 8",
    "pasal": "Pasal 25",
    "judul": "Program jaminan sosial (BPJS)",
    "klausul": "BPJS Ketenagakerjaan: JKK 0,24%, JKM 0,3%, JHT 3,7%+2%, JP 2%+1%; BPJS Kesehatan 4%+1%. Paragraf iuran diulang dua kali.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 44/2015; PP 45/2015; PP 46/2015; Perpres 82/2018; PP 37/2021 jo. PP 6/2025",
    "risiko": "BPJS Ketenagakerjaan: JKK 0,24%, JKM 0,3%, JHT 3,7%+2%, JP 2%+1%; BPJS Kesehatan 4%+1%. Paragraf iuran diulang dua kali.",
    "rekomendasi": "PENTING. (a) Tambahkan program JKP (iuran 0,36% dari upah; manfaat hingga 60% upah 6 bulan). (b) Tegaskan kelas risiko JKK menentukan besaran iuran (0,24%-1,74%). (c) Hapus duplikasi paragraf. (d) Nyatakan dasar upah & batas upah BPJS Kesehatan."
  },
  {
    "no": 26,
    "bab": "BAB 8",
    "pasal": "Pasal 26",
    "judul": "THR keagamaan",
    "klausul": "THR hanya untuk 'Karyawan tetap'; < 1 tahun proporsional 1/12 tiap bulan genap; yang berhenti >= 1 bulan sebelum hari raya tidak berhak; honorer/kontrak besaran ditentukan Direksi; 1x THR = gaji pokok + tunjangan tetap.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "Permenaker 6/2016 Pasal 2, 3, 5, 6, 7",
    "risiko": "THR hanya untuk 'Karyawan tetap'; < 1 tahun proporsional 1/12 tiap bulan genap; yang berhenti >= 1 bulan sebelum hari raya tidak berhak; honorer/kontrak besaran ditentukan Direksi; 1x THR = gaji pokok + tunjangan tetap.",
    "rekomendasi": "PENTING. THR berlaku untuk SEMUA pekerja (PKWT & PKWTT) dengan masa kerja >= 1 bulan. Pekerja yang berhenti dalam 30 hari sebelum hari raya TETAP berhak THR. Besaran pekerja kontrak/harian mengikuti Permenaker, bukan ditentukan bebas Direksi. Rumus: masa kerja/12 x 1 bulan upah."
  },
  {
    "no": 27,
    "bab": "BAB 8",
    "pasal": "Pasal 27",
    "judul": "Tunjangan kematian & uang duka",
    "klausul": "Meninggal bukan kecelakaan kerja: upah bulan berjalan, uang duka, santunan kematian; kecelakaan kerja: lewat BPJS; besaran uang duka ditetapkan Direksi.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 57; PP 44/2015",
    "risiko": "Meninggal bukan kecelakaan kerja: upah bulan berjalan, uang duka, santunan kematian; kecelakaan kerja: lewat BPJS; besaran uang duka ditetapkan Direksi.",
    "rekomendasi": "Tambahkan hak ahli waris PHK karena meninggal: 2x uang pesangon, 1x UPMK, uang penggantian hak. Perjelas besaran santunan & sumbernya (BPJS JKM vs perusahaan)."
  },
  {
    "no": 28,
    "bab": "BAB 8",
    "pasal": "Pasal 28",
    "judul": "Hadiah pernikahan",
    "klausul": "Hadiah pernikahan setelah bekerja 12 bulan berturut-turut.",
    "status": "SESUAI",
    "dasar_hukum": "Kebijakan perusahaan",
    "risiko": "Hadiah pernikahan setelah bekerja 12 bulan berturut-turut.",
    "rekomendasi": "Pertahankan (manfaat tambahan)."
  },
  {
    "no": 29,
    "bab": "BAB 8",
    "pasal": "Pasal 29",
    "judul": "Hadiah kelahiran",
    "klausul": "Hadiah kelahiran setelah bekerja 12 bulan berturut-turut.",
    "status": "SESUAI",
    "dasar_hukum": "Kebijakan perusahaan",
    "risiko": "Hadiah kelahiran setelah bekerja 12 bulan berturut-turut.",
    "rekomendasi": "Pertahankan (manfaat tambahan)."
  },
  {
    "no": 30,
    "bab": "BAB 8",
    "pasal": "Pasal 30",
    "judul": "Pinjaman",
    "klausul": "Pinjaman tanpa bunga, min. 2 tahun masa kerja, maks 2x upah, lunas maks 24 bulan.",
    "status": "SESUAI",
    "dasar_hukum": "PP 36/2021 Pasal 57-65",
    "risiko": "Pinjaman tanpa bunga, min. 2 tahun masa kerja, maks 2x upah, lunas maks 24 bulan.",
    "rekomendasi": "Pertahankan; pastikan total pemotongan upah tidak melebihi batas hukum."
  },
  {
    "no": 31,
    "bab": "BAB 8",
    "pasal": "Pasal 31",
    "judul": "Waktu menyusui",
    "klausul": "Kesempatan menyusui saat jam kerja, fasilitas kulkas ASI, istirahat/pengurangan jam kerja atas keterangan dokter.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 83; UU 4/2024 Pasal 30-31",
    "risiko": "Kesempatan menyusui saat jam kerja, fasilitas kulkas ASI, istirahat/pengurangan jam kerja atas keterangan dokter.",
    "rekomendasi": "Perbarui rujukan ke UU 4/2024 (UU KIA): hak laktasi hingga anak berusia 2 tahun, kewajiban menyediakan ruang menyusui yang layak & aman, serta hak ASI eksklusif 6 bulan."
  },
  {
    "no": 32,
    "bab": "BAB 9",
    "pasal": "Pasal 32",
    "judul": "Perjalanan dinas",
    "klausul": "Perjalanan dinas berdasarkan surat tugas; biaya diatur keputusan Direksi.",
    "status": "SESUAI",
    "dasar_hukum": "Kebijakan perusahaan",
    "risiko": "Perjalanan dinas berdasarkan surat tugas; biaya diatur keputusan Direksi.",
    "rekomendasi": "Pertahankan; tegaskan biaya wajar tugas resmi tidak dibebankan pekerja. Catat: nomor Pasal 32 dipakai dua kali."
  },
  {
    "no": 33,
    "bab": "BAB 10",
    "pasal": "Pasal 32 (kedua)",
    "judul": "Hari kerja dan jam kerja",
    "klausul": "40 jam/minggu, 6 hari kerja: Senin 08.00-17.00; Selasa-Jumat 08.00-16.00; Sabtu 08.00-12.00; istirahat 1 jam.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 22 & 25; UU 13/2003 Pasal 77",
    "risiko": "40 jam/minggu, 6 hari kerja: Senin 08.00-17.00; Selasa-Jumat 08.00-16.00; Sabtu 08.00-12.00; istirahat 1 jam.",
    "rekomendasi": "PENTING. Hari Senin menghasilkan 8 jam kerja > batas 7 jam/hari untuk pola 6 hari. Perbaiki jadwal agar setiap hari maks 7 jam (mis. Senin-Jumat 08.00-16.00 = 7 jam, Sabtu 08.00-12.00). Nyatakan hak istirahat mingguan 1-2 hari. Perbaiki penomoran pasal ganda."
  },
  {
    "no": 34,
    "bab": "BAB 10",
    "pasal": "Pasal 33",
    "judul": "Hari libur",
    "klausul": "Hari libur resmi pemerintah dan hari libur perusahaan; pada hari libur resmi tetap mendapat gaji penuh.",
    "status": "SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 85; PP 35/2021 Pasal 32-34",
    "risiko": "Hari libur resmi pemerintah dan hari libur perusahaan; pada hari libur resmi tetap mendapat gaji penuh.",
    "rekomendasi": "Pertahankan; tambahkan hak upah lembur bila bekerja pada hari libur resmi/istirahat mingguan."
  },
  {
    "no": 35,
    "bab": "BAB 10",
    "pasal": "Pasal 34",
    "judul": "Tidak hadir karena sakit",
    "klausul": "Wajib memberitahu atasan/HRD; diharuskan membawa Surat Keterangan Dokter.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 93; UU 36/2009",
    "risiko": "Wajib memberitahu atasan/HRD; diharuskan membawa Surat Keterangan Dokter.",
    "rekomendasi": "Lunakkan: bukti medis/keterangan yang wajar sesuai kondisi; sakit terbukti tidak otomatis dipotong cuti tahunan."
  },
  {
    "no": 36,
    "bab": "BAB 10",
    "pasal": "Pasal 35",
    "judul": "Upah selama sakit",
    "klausul": "Ayat 1 menyatakan upah tetap dibayar; ayat 2 skema 100%/75%/50%/25% (4 bulan tiap tahap); setelah 12 bulan dapat PHK.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "UU 13/2003 Pasal 93(2); PP 35/2021 Pasal 55",
    "risiko": "Ayat 1 menyatakan upah tetap dibayar; ayat 2 skema 100%/75%/50%/25% (4 bulan tiap tahap); setelah 12 bulan dapat PHK.",
    "rekomendasi": "Hapus kontradiksi ayat (1) vs (2); pertahankan skema 4x4 bulan (benar). Tambahkan hak PHK sakit berkepanjangan: 2x pesangon, 1x UPMK, UPH. Tegaskan syarat 'setelah melampaui 12 bulan'."
  },
  {
    "no": 37,
    "bab": "BAB 10",
    "pasal": "Pasal 36",
    "judul": "Izin meninggalkan pekerjaan dengan upah penuh",
    "klausul": "Hak izin sesuai Pasal 93(4): kematian, pernikahan, khitanan, pembaptisan, istri melahirkan/keguguran.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "UU 13/2003 Pasal 93; UU 4/2024 Pasal 6; UU 13/2003 Pasal 81",
    "risiko": "Hak izin sesuai Pasal 93(4): kematian, pernikahan, khitanan, pembaptisan, istri melahirkan/keguguran.",
    "rekomendasi": "Tambahkan: (a) cuti pendampingan suami 2 hari + paling lama 3 hari berikutnya (UU KIA). (b) izin tidak masuk pada hari pertama & kedua haid bagi pekerja perempuan (Pasal 81 UU 13/2003)."
  },
  {
    "no": 38,
    "bab": "BAB 10",
    "pasal": "Pasal 37",
    "judul": "Tidak hadir tanpa izin / mangkir",
    "klausul": "Mangkir dikenai surat peringatan.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 52 & 54",
    "risiko": "Mangkir dikenai surat peringatan.",
    "rekomendasi": "Perjelas syarat PHK karena mangkir: tidak masuk >= 5 hari kerja berturut-turut tanpa keterangan tertulis + 2 kali panggilan tertulis; berhak UPH + uang pisah."
  },
  {
    "no": 39,
    "bab": "BAB 11",
    "pasal": "Pasal 38",
    "judul": "Cuti (definisi)",
    "klausul": "Cuti di luar tanggungan: tidak menerima gaji/fasilitas & masa cuti tidak dihitung sebagai masa kerja.",
    "status": "BERISIKO HUKUM",
    "dasar_hukum": "UU 13/2003 Pasal 79, 93",
    "risiko": "Cuti di luar tanggungan: tidak menerima gaji/fasilitas & masa cuti tidak dihitung sebagai masa kerja.",
    "rekomendasi": "Perjelas bahwa cuti di luar tanggungan wajib disepakati tertulis dan masa kerja yang sudah ditempuh tidak dihapus; jaminan sosial tetap mengikuti ketentuan."
  },
  {
    "no": 40,
    "bab": "BAB 11",
    "pasal": "Pasal 39",
    "judul": "Cuti tahunan",
    "klausul": "12 hari setelah 12 bulan; harus diambil dalam 1 tahun; tidak diambil = hapus (gugur); perusahaan memberitahu.",
    "status": "BERISIKO HUKUM",
    "dasar_hukum": "UU 13/2003 Pasal 79; PP 35/2021",
    "risiko": "12 hari setelah 12 bulan; harus diambil dalam 1 tahun; tidak diambil = hapus (gugur); perusahaan memberitahu.",
    "rekomendasi": "Klausul 'gugur otomatis' berisiko tidak ditegakkan (PHI). Syaratkan pemberitahuan & kesempatan nyata mengambil cuti; sisa cuti yang belum gugur diperhitungkan saat hubungan kerja berakhir. Cuti tahunan tidak boleh dipertukarkan uang selama hubungan kerja berjalan."
  },
  {
    "no": 41,
    "bab": "BAB 11",
    "pasal": "Pasal 40",
    "judul": "Cuti melahirkan",
    "klausul": "Cuti melahirkan 3 bulan (1,5 + 1,5); keguguran 1,5 bulan; dapat diperpanjang s.d. 3 bulan; setelah perpanjangan dianggap sakit berkepanjangan dengan skema 100/75/50/25; cuti melahirkan tidak menghapus cuti tahunan.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "UU 4/2024 Pasal 4-6; UU 13/2003 Pasal 82",
    "risiko": "Cuti melahirkan 3 bulan (1,5 + 1,5); keguguran 1,5 bulan; dapat diperpanjang s.d. 3 bulan; setelah perpanjangan dianggap sakit berkepanjangan dengan skema 100/75/50/25; cuti melahirkan tidak menghapus cuti tahunan.",
    "rekomendasi": "PENTING. Sesuaikan UU KIA: cuti melahirkan paling singkat 3 bulan, dapat ditambah paling lama 3 bulan bila ada kondisi khusus (surat dokter). Upah: 100% bulan ke-1 s.d. ke-4 dan 75% bulan ke-5 & ke-6. Tambahkan cuti keguguran 1,5 bulan dan larangan PHK selama cuti melahirkan."
  },
  {
    "no": 42,
    "bab": "BAB 11",
    "pasal": "Pasal 41",
    "judul": "Prosedur cuti",
    "klausul": "Permohonan 2 minggu sebelumnya; penggunaan hak cuti maksimal 3 hari per pengambilan; 1 orang per divisi per hari; Direksi dapat menunda.",
    "status": "BERISIKO HUKUM",
    "dasar_hukum": "UU 13/2003 Pasal 79",
    "risiko": "Permohonan 2 minggu sebelumnya; penggunaan hak cuti maksimal 3 hari per pengambilan; 1 orang per divisi per hari; Direksi dapat menunda.",
    "rekomendasi": "Batas 'maksimal 3 hari per pengambilan' dan '1 orang per divisi per hari' berpotensi menghalangi hak. Ganti dengan mekanisme penjadwalan yang adil + alasan tertulis & tanggal pengganti bila permohonan tidak dapat dipenuhi."
  },
  {
    "no": 43,
    "bab": "BAB 12",
    "pasal": "Pasal 42",
    "judul": "Sanksi",
    "klausul": "Sanksi atas pelanggaran; ganti rugi bila menimbulkan kerugian; jenis sanksi SP1-3; setelah SP3 dapat PHK per Pasal 161 UU 13/2003.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 52; PP 36/2021",
    "risiko": "Sanksi atas pelanggaran; ganti rugi bila menimbulkan kerugian; jenis sanksi SP1-3; setelah SP3 dapat PHK per Pasal 161 UU 13/2003.",
    "rekomendasi": "Tambahkan asas proporsionalitas, pemeriksaan berbukti, dan hak membela diri. Batasi pemotongan upah untuk ganti rugi sesuai peraturan pengupahan. Perbaiki rujukan (bukan lagi 'Pasal 161 UU 13/2003' tetapi PP 35/2021 Pasal 52)."
  },
  {
    "no": 44,
    "bab": "BAB 12",
    "pasal": "Pasal 43",
    "judul": "Pemberian surat peringatan",
    "klausul": "SP1, SP2, SP3 masing-masing berlaku 6 bulan; pelanggaran berulang menaikkan tingkat; setelah 6 bulan kembali ke SP1.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 52",
    "risiko": "SP1, SP2, SP3 masing-masing berlaku 6 bulan; pelanggaran berulang menaikkan tingkat; setelah 6 bulan kembali ke SP1.",
    "rekomendasi": "Pertahankan. Tambahkan jenis pelanggaran yang dapat dikenai 'peringatan pertama dan terakhir' serta hak pekerja atas salinan SP."
  },
  {
    "no": 45,
    "bab": "BAB 12",
    "pasal": "Pasal 44",
    "judul": "Skorsing",
    "klausul": "Selama proses PHK para pihak tetap melaksanakan kewajiban; skorsing dengan tetap membayar upah.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 53",
    "risiko": "Selama proses PHK para pihak tetap melaksanakan kewajiban; skorsing dengan tetap membayar upah.",
    "rekomendasi": "Pertahankan; perjelas skorsing dituangkan tertulis."
  },
  {
    "no": 46,
    "bab": "BAB 13",
    "pasal": "Pasal 45",
    "judul": "PHK (alasan)",
    "klausul": "Daftar alasan PHK (perubahan status, efisiensi, tutup, force majeure, PKPU, pailit, permohonan pekerja, mengundurkan diri, mangkir, pelanggaran+SP, ditahan, sakit berkepanjangan, pensiun, meninggal).",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 36-57; UU 6/2023 Pasal 154",
    "risiko": "Daftar alasan PHK (perubahan status, efisiensi, tutup, force majeure, PKPU, pailit, permohonan pekerja, mengundurkan diri, mangkir, pelanggaran+SP, ditahan, sakit berkepanjangan, pensiun, meninggal).",
    "rekomendasi": "Daftar alasan sudah mengacu hukum, namun belum memetakan BESARAN HAK per alasan. Tambahkan matriks hak PHK per alasan dan kewajiban pemberitahuan tertulis serta upaya bipartit."
  },
  {
    "no": 47,
    "bab": "BAB 13",
    "pasal": "Pasal 46",
    "judul": "PHK karena mengundurkan diri",
    "klausul": "Permohonan tertulis >= 1 bulan sebelumnya; jika tidak, hak karyawan 'akan ditahan'.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "UU 13/2003 Pasal 162; PP 35/2021 Pasal 50",
    "risiko": "Permohonan tertulis >= 1 bulan sebelumnya; jika tidak, hak karyawan 'akan ditahan'.",
    "rekomendasi": "Klausul 'hak ditahan' tidak sah. Hak yang telah timbul (upah, UPH) wajib dibayar; pelanggaran prosedur pemberitahuan tidak dapat menahan hak. Perjelas uang pisah bagi masa kerja < 3 tahun."
  },
  {
    "no": 48,
    "bab": "BAB 13",
    "pasal": "Pasal 47",
    "judul": "PHK karena mencapai usia pensiun",
    "klausul": "Usia pensiun 56 tahun; pemberitahuan 1 tahun sebelumnya; PHK akhir bulan.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 56; PP 45/2015 (JP)",
    "risiko": "Usia pensiun 56 tahun; pemberitahuan 1 tahun sebelumnya; PHK akhir bulan.",
    "rekomendasi": "KEPUTUSAN MANAJEMEN. Usia manfaat JP BPJS Ketenagakerjaan 2026 = 59 tahun. Selaraskan usia pensiun dengan usia JP atau atur transisi agar tidak terjadi kekosongan penghasilan. Tambahkan hak pensiun: 1,75x pesangon, 1x UPMK, UPH."
  },
  {
    "no": 49,
    "bab": "BAB 13",
    "pasal": "Pasal 48",
    "judul": "PHK karena pelanggaran PP tanpa kompensasi",
    "klausul": "PHK bila pelanggaran saat SP3 belum habis 'tanpa kompensasi apapun'.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 52 ayat (1)",
    "risiko": "PHK bila pelanggaran saat SP3 belum habis 'tanpa kompensasi apapun'.",
    "rekomendasi": "PENTING. Tidak boleh 'tanpa kompensasi'. Pekerja berhak 0,5x uang pesangon, 1x UPMK, dan uang penggantian hak."
  },
  {
    "no": 50,
    "bab": "BAB 13",
    "pasal": "Pasal 49",
    "judul": "PHK karena sakit berkepanjangan",
    "klausul": "Perusahaan dapat PHK 'setelah melampaui batas 3 bulan' bagi pekerja sakit berkepanjangan/cacat.",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 55; UU 13/2003 Pasal 93",
    "risiko": "Perusahaan dapat PHK 'setelah melampaui batas 3 bulan' bagi pekerja sakit berkepanjangan/cacat.",
    "rekomendasi": "PENTING. Ambang 3 bulan SALAH dan bertentangan dengan Pasal 35 sendiri. PHK baru dapat dilakukan setelah melampaui 12 bulan. Hak: 2x pesangon, 1x UPMK, UPH."
  },
  {
    "no": 51,
    "bab": "BAB 13",
    "pasal": "Pasal 50",
    "judul": "PHK karena meninggal dunia",
    "klausul": "Hubungan kerja putus otomatis bila karyawan meninggal.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 57",
    "risiko": "Hubungan kerja putus otomatis bila karyawan meninggal.",
    "rekomendasi": "Tambahkan hak ahli waris: 2x pesangon, 1x UPMK, UPH; tidak mengurangi upah terutang & manfaat BPJS."
  },
  {
    "no": 52,
    "bab": "BAB 13",
    "pasal": "Pasal 51",
    "judul": "PHK karena perusahaan menyalahi aturan",
    "klausul": "Alasan pekerja mengajukan PHK (penganiayaan, upah tidak dibayar 3 bulan, dll.).",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 36 huruf g",
    "risiko": "Alasan pekerja mengajukan PHK (penganiayaan, upah tidak dibayar 3 bulan, dll.).",
    "rekomendasi": "Tambahkan hak bila alasan terbukti: 1x pesangon, 1x UPMK, UPH; bila tidak terbukti & pengusaha PHK: UPH + uang pisah."
  },
  {
    "no": 53,
    "bab": "BAB 13",
    "pasal": "Pasal 52",
    "judul": "PHK karena mangkir",
    "klausul": "Mangkir 5 hari berturut-turut tanpa izin + 2 kali panggilan tertulis.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 54",
    "risiko": "Mangkir 5 hari berturut-turut tanpa izin + 2 kali panggilan tertulis.",
    "rekomendasi": "Pertahankan; tetapkan besaran uang pisah untuk mangkir."
  },
  {
    "no": 54,
    "bab": "BAB 13",
    "pasal": "Pasal 53",
    "judul": "PHK karena kesalahan berat",
    "klausul": "PHK 'tanpa memberikan pesangon' atas kesalahan berat (penipuan, pencurian, mabuk, asusila/perselingkuhan, menyerang, merusak, membocorkan rahasia).",
    "status": "TIDAK SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 52 ayat (2); Putusan MK 12/PUU-I/2003",
    "risiko": "PHK 'tanpa memberikan pesangon' atas kesalahan berat (penipuan, pencurian, mabuk, asusila/perselingkuhan, menyerang, merusak, membocorkan rahasia).",
    "rekomendasi": "PENTING. (a) Istilah 'kesalahan berat' sebagai dasar PHK tanpa hak sudah tidak berlaku (MK 12/PUU-I/2003); gunakan 'pelanggaran bersifat mendesak'. (b) Tidak boleh tanpa hak: pekerja berhak UPH + uang pisah. (c) Hilangkan 'perselingkuhan' sebagai pelanggaran kerja (ranah pribadi). (d) Wajib pemeriksaan & hak membela diri."
  },
  {
    "no": 55,
    "bab": "BAB 13",
    "pasal": "Pasal 54",
    "judul": "PHK karena perubahan status perusahaan",
    "klausul": "Perubahan status/penggabungan/peleburan/perubahan kepemilikan.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 41-42",
    "risiko": "Perubahan status/penggabungan/peleburan/perubahan kepemilikan.",
    "rekomendasi": "Tambahkan besaran: 1x pesangon, 1x UPMK, UPH (0,5x bila pengambilalihan mengubah syarat kerja & pekerja tidak bersedia)."
  },
  {
    "no": 56,
    "bab": "BAB 13",
    "pasal": "Pasal 55",
    "judul": "PHK karena efisiensi",
    "klausul": "Efisiensi tanpa penutupan perusahaan.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 43",
    "risiko": "Efisiensi tanpa penutupan perusahaan.",
    "rekomendasi": "Tambahkan besaran: 0,5x pesangon (rugi) / 1x pesangon (mencegah kerugian), 1x UPMK, UPH."
  },
  {
    "no": 57,
    "bab": "BAB 13",
    "pasal": "Pasal 56",
    "judul": "PHK karena perusahaan tutup / pailit",
    "klausul": "Tutup karena kerugian 2 tahun / force majeure / pailit.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 44-47",
    "risiko": "Tutup karena kerugian 2 tahun / force majeure / pailit.",
    "rekomendasi": "Tambahkan besaran per skenario (0,5x-1x pesangon), 1x UPMK, UPH."
  },
  {
    "no": 58,
    "bab": "BAB 13",
    "pasal": "Pasal 57",
    "judul": "Kompensasi PHK",
    "klausul": "Komponen: uang pesangon, UPMK, uang penggantian hak.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 40",
    "risiko": "Komponen: uang pesangon, UPMK, uang penggantian hak.",
    "rekomendasi": "Pertahankan; tambahkan 'uang pisah' sebagai komponen pada alasan tertentu."
  },
  {
    "no": 59,
    "bab": "BAB 13",
    "pasal": "Pasal 58",
    "judul": "Pembayaran kompensasi PHK",
    "klausul": "Dibayarkan sekaligus pada saat PHK berlaku.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 40(5)",
    "risiko": "Dibayarkan sekaligus pada saat PHK berlaku.",
    "rekomendasi": "Pertahankan. Catat: nomor Pasal 58 dipakai dua kali."
  },
  {
    "no": 60,
    "bab": "BAB 13",
    "pasal": "Pasal 58 (duplikat)",
    "judul": "Perhitungan uang pesangon",
    "klausul": "Tabel pesangon 1 s.d. 9 bulan sesuai masa kerja.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 40(2); MK 168/PUU-XXI/2023",
    "risiko": "Tabel pesangon 1 s.d. 9 bulan sesuai masa kerja.",
    "rekomendasi": "Tabel sudah benar (batas minimum). Perbaiki penomoran pasal ganda. Tegaskan angka tabel adalah batas paling sedikit."
  },
  {
    "no": 61,
    "bab": "BAB 13",
    "pasal": "Pasal 59",
    "judul": "Perhitungan UPMK",
    "klausul": "Tabel UPMK 2 s.d. 10 bulan.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 40(3)",
    "risiko": "Tabel UPMK 2 s.d. 10 bulan.",
    "rekomendasi": "Pertahankan."
  },
  {
    "no": 62,
    "bab": "BAB 13",
    "pasal": "Pasal 60",
    "judul": "Uang penggantian hak",
    "klausul": "Cuti belum diambil; ongkos pulang; penggantian perumahan serta pengobatan 15%.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "PP 35/2021 Pasal 40(4)",
    "risiko": "Cuti belum diambil; ongkos pulang; penggantian perumahan serta pengobatan 15%.",
    "rekomendasi": "Komponen 15% bukan lagi unsur wajib UPH dalam PP 35/2021. Pertahankan sebagai MANFAAT TAMBAHAN perusahaan dengan kriteria penerima & dasar hitung yang jelas."
  },
  {
    "no": 63,
    "bab": "BAB 13",
    "pasal": "Pasal 61",
    "judul": "Uang pisah (definisi)",
    "klausul": "Uang pisah untuk: kemauan sendiri, putusan PHI, mangkir, pelanggaran mendesak, ditahan, putusan pidana sebelum 6 bulan.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 50, 52(2), 54",
    "risiko": "Uang pisah untuk: kemauan sendiri, putusan PHI, mangkir, pelanggaran mendesak, ditahan, putusan pidana sebelum 6 bulan.",
    "rekomendasi": "Pertahankan; lengkapi besaran untuk mangkir & alasan lain. Catat nomor Pasal 61 dipakai dua kali."
  },
  {
    "no": 64,
    "bab": "BAB 13",
    "pasal": "Pasal 61 (duplikat)",
    "judul": "Uang pisah karena PHK atas kemauan sendiri",
    "klausul": "Uang pisah 2 bulan (3-<6 th), 3 bulan (6-<9 th), 4 bulan (>=9 th).",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "PP 35/2021 Pasal 50",
    "risiko": "Uang pisah 2 bulan (3-<6 th), 3 bulan (6-<9 th), 4 bulan (>=9 th).",
    "rekomendasi": "Tetapkan uang pisah untuk masa kerja < 3 tahun (usulan: 1 bulan upah). Perbaiki penomoran pasal ganda."
  },
  {
    "no": 65,
    "bab": "BAB 13",
    "pasal": "Pasal 62",
    "judul": "Uang pisah karena kesalahan SOP & PP",
    "klausul": "Uang pisah 2/3/4 bulan untuk pelanggaran PP/SOP.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 52",
    "risiko": "Uang pisah 2/3/4 bulan untuk pelanggaran PP/SOP.",
    "rekomendasi": "Pertahankan sebagai manfaat tambahan; nyatakan tegas bahwa uang pisah TIDAK mengganti pesangon/UPMK/UPH yang wajib. Tetapkan besaran untuk masa kerja < 3 tahun."
  },
  {
    "no": 66,
    "bab": "BAB 13",
    "pasal": "Pasal 63",
    "judul": "Komponen perhitungan uang kompensasi",
    "klausul": "Dasar: gaji pokok + tunjangan tetap.",
    "status": "SESUAI",
    "dasar_hukum": "PP 35/2021 Pasal 40(1)",
    "risiko": "Dasar: gaji pokok + tunjangan tetap.",
    "rekomendasi": "Pertahankan; tambahkan aturan bila upah pokok + tunjangan tetap < 75% seluruh upah (untuk lembur) dan dasar perhitungan THR/lembur/jaminan sosial."
  },
  {
    "no": 67,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Uang kompensasi PKWT",
    "klausul": "Tidak diatur sama sekali.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "PP 35/2021 Pasal 15-16",
    "risiko": "Tidak diatur sama sekali.",
    "rekomendasi": "Tambahkan kewajiban: uang kompensasi dibayar pada akhir PKWT & akhir setiap perpanjangan, sebesar masa kerja/12 x 1 bulan upah."
  },
  {
    "no": 68,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Pencatatan PKWT ke instansi ketenagakerjaan",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "PP 35/2021 Pasal 6",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan kewajiban pencatatan PKWT secara daring paling lama 3 hari kerja (atau tertulis 7 hari kerja)."
  },
  {
    "no": 69,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Kebebasan berserikat & LKS Bipartit",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "UU 21/2000; UU 13/2003 Pasal 106",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan hak berserikat dan kewajiban membentuk Lembaga Kerja Sama Bipartit bila pekerja >= 50 orang."
  },
  {
    "no": 70,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Tata cara penyelesaian perselisihan",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "UU 2/2004",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan mekanisme pengaduan internal & perundingan bipartit maks. 30 hari kerja, lalu mediasi/konsiliasi/arbitrase/PHI."
  },
  {
    "no": 71,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Pencegahan & penanganan kekerasan/pelecehan seksual",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "Kepmenaker 88/2023; UU 12/2022 (TPKS)",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan larangan kekerasan/pelecehan, saluran pelaporan yang aman, tim/mekanisme penanganan, kerahasiaan, dan pelindungan pelapor."
  },
  {
    "no": 72,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Pelindungan data pribadi pekerja",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "UU 27/2022",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan tata kelola data pekerja (identitas, gaji, biometrik, kesehatan, lokasi), dasar pemrosesan, pembatasan akses, retensi & pemusnahan."
  },
  {
    "no": 73,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Pekerjaan alih daya (bila digunakan)",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "PP 35/2021; Permenaker 7/2026",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan ketentuan alih daya: hanya 6 kegiatan penunjang; perjanjian tertulis; jaminan hak minimum pekerja alih daya; masa transisi s.d. 30 April 2028."
  },
  {
    "no": 74,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Kesetaraan & akomodasi disabilitas",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "UU 8/2016",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Tambahkan asas kesetaraan kesempatan & akomodasi yang layak bagi penyandang disabilitas."
  },
  {
    "no": 75,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Istirahat panjang / cuti panjang",
    "klausul": "Tidak diatur.",
    "status": "GAP / BELUM DIATUR",
    "dasar_hukum": "UU 13/2003 Pasal 79(2)(d); PP 35/2021",
    "risiko": "Tidak diatur.",
    "rekomendasi": "Pertimbangkan pengaturan istirahat panjang (2 bulan pada tahun ke-7 & ke-8 masa kerja) atau kebijakan yang setara."
  },
  {
    "no": 76,
    "bab": "GAP",
    "pasal": "-",
    "judul": "Pembaruan rujukan hukum",
    "klausul": "PP ini masih merujuk UU 13/2003 & Kepmenakertrans 102/2004 dan belum merujuk UU 6/2023, MK 168/PUU-XXI/2023, PP 35/2021, PP 36/2021 jo. PP 49/2025, UU 4/2024, PP 6/2025.",
    "status": "SESUAI - PERLU PENYEMPURNAAN",
    "dasar_hukum": "Semua regulasi terkait",
    "risiko": "PP ini masih merujuk UU 13/2003 & Kepmenakertrans 102/2004 dan belum merujuk UU 6/2023, MK 168/PUU-XXI/2023, PP 35/2021, PP 36/2021 jo. PP 49/2025, UU 4/2024, PP 6/2025.",
    "rekomendasi": "Perbarui seluruh rujukan hukum dan cantumkan dasar hukum pada bagian konsiderans serta pasal penutup."
  }
]);

export const PP_CATEGORIES = Object.freeze([...new Set(PP_ARTICLES.map(a => a.kategori))]);

export const PP_DISCIPLINE_CATEGORIES = Object.freeze([...new Set(
  PP_ARTICLES.flatMap(a => a.disiplin?.jenis || [])
)]);

function normalizePasal(value) {
  if (value && typeof value === "object") return Number(value.pasal || 0);
  const text = String(value || "");
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function asText(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function asTextArray(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map(asText).filter(Boolean);
  return [];
}

function asList(value) {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\n]/).map(asText).filter(Boolean);
  return [];
}

function normalizeDisiplin(value) {
  if (!value) return null;
  if (value === true) return { tingkat: "Perlu verifikasi", jenis: ["Pelanggaran"], catatan: "" };
  if (typeof value !== "object") return null;
  const tingkat = asText(value.tingkat || value.level);
  const jenis = asList(value.jenis || value.jenis_pelanggaran);
  const catatan = asText(value.catatan || value.note);
  if (!tingkat && !jenis.length && !catatan) return null;
  return { tingkat: tingkat || "Perlu verifikasi", jenis: jenis.length ? jenis : ["Pelanggaran"], catatan };
}

function babMetaFor(nomor) {
  return PP_BABS.find(b => Number(b.nomor) === Number(nomor))
    || PP_BABS[0]
    || { nomor: 1, judul: "Ketentuan Umum", kategori: "Ketentuan Umum" };
}

/**
 * Normalisasi satu dokumen override/kustom dari Firestore menjadi bentuk pasal
 * yang sama dengan katalog bawaan. Mengembalikan null bila data inti tidak lengkap.
 */
export function normalizePpArticle(row = {}, base = null) {
  const pasal = normalizePasal(row.pasal || base?.pasal);
  if (!pasal) return null;
  const judul = asText(row.judul || base?.judul);
  if (!judul) return null;
  const bab = Number(row.bab || base?.bab || 1);
  const babMeta = babMetaFor(bab);
  const ayat = asTextArray(row.ayat).length ? asTextArray(row.ayat) : (base?.ayat || []);
  if (!ayat.length) return null;
  const kategori = asText(row.kategori || base?.kategori) || "Ketentuan Lain";
  const disiplin = Object.prototype.hasOwnProperty.call(row, "disiplin")
    ? normalizeDisiplin(row.disiplin)
    : (base?.disiplin || null);
  const referensi = asList(row.referensi !== undefined ? row.referensi : base?.referensi)
    .map(normalizePasal)
    .filter(Boolean);
  return {
    id: `pp-${pasal}`,
    bab: Number(babMeta.nomor),
    bab_judul: babMeta.judul,
    kategori,
    pasal,
    judul,
    label: `Pasal ${pasal} — ${judul}`,
    ayat,
    ringkasan: asText(row.ringkasan || base?.ringkasan) || ayat[0],
    dasar_hukum: asList(row.dasar_hukum !== undefined ? row.dasar_hukum : base?.dasar_hukum),
    referensi,
    perubahan: asText(row.perubahan !== undefined ? row.perubahan : base?.perubahan),
    catatan: asText(row.catatan !== undefined ? row.catatan : base?.catatan),
    tags: asList(row.tags !== undefined ? row.tags : base?.tags),
    disiplin,
    sumber: base ? "bawaan" : "manual",
    is_custom: !base
  };
}

/**
 * Gabungkan katalog bawaan dengan override dari Firestore.
 * - Dokumen `{ pasal, deleted: true }` menyembunyikan pasal bawaan.
 * - Dokumen lain menimpa (edit) pasal bawaan atau menambah pasal baru.
 */
export function mergePpCatalog(overrides = [], baseArticles = PP_ARTICLES) {
  const byPasal = new Map(baseArticles.map(article => [article.pasal, article]));
  const rows = Array.isArray(overrides) ? overrides : [];
  rows.filter(row => row && row.deleted).forEach(row => {
    const pasal = normalizePasal(row);
    if (pasal) byPasal.delete(pasal);
  });
  rows.filter(row => row && !row.deleted).forEach(row => {
    const pasal = normalizePasal(row);
    if (!pasal) return;
    const base = baseArticles.find(article => article.pasal === pasal) || null;
    const normalized = normalizePpArticle({ ...row, pasal }, base);
    if (normalized) byPasal.set(pasal, normalized);
  });
  return [...byPasal.values()].sort((a, b) => a.pasal - b.pasal);
}

export function ppCategories(articles = PP_ARTICLES) {
  return [...new Set(articles.map(article => article.kategori).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "id"));
}

export function getPpArticle(value, articles = PP_ARTICLES) {
  const pasal = normalizePasal(value);
  return articles.find(article => article.pasal === pasal) || null;
}

export function ppArticleLabel(article, articles = PP_ARTICLES) {
  if (!article) return "";
  return typeof article === "string" ? (getPpArticle(article, articles)?.label || article) : article.label;
}

export function disciplinePpArticles(articles = PP_ARTICLES) {
  return articles.filter(article => article.disiplin);
}

export function ppArticleReferences(article, articles = PP_ARTICLES) {
  if (!article) return [];
  return (article.referensi || []).map(ref => getPpArticle(ref, articles)).filter(Boolean);
}

export function searchPpArticles({ query = "", kategori = "", bab = "", disciplineOnly = false, articles = PP_ARTICLES } = {}) {
  const term = String(query || "").trim().toLowerCase();
  return articles.filter(article => {
    if (kategori && article.kategori !== kategori) return false;
    if (bab && Number(article.bab) !== Number(bab)) return false;
    if (disciplineOnly && !article.disiplin) return false;
    if (!term) return true;
    const haystack = [
      article.label,
      article.judul,
      article.kategori,
      article.bab_judul,
      article.ringkasan,
      article.ayat.join(" "),
      article.dasar_hukum.join(" "),
      (article.tags || []).join(" ")
    ].join(" ").toLowerCase();
    return haystack.includes(term);
  });
}

export function ppStats(articles = PP_ARTICLES, babs = PP_BABS) {
  return {
    total: articles.length,
    bab: babs.length,
    disiplin: disciplinePpArticles(articles).length,
    denganCatatan: articles.filter(article => article.catatan).length,
    totalPerubahan: articles.filter(article => article.perubahan).length
  };
}

export function ppComplianceCount(status) {
  const row = PP_COMPLIANCE_SUMMARY.find(item => item.status === status);
  return row ? row.jumlah : 0;
}

export function findPolicyArticleById(id, articles = PP_ARTICLES) {
  const key = String(id || "");
  if (!key) return null;
  return articles.find(article => article.id === key || String(article.pasal) === key) || null;
}

export function policyPeriodForArticle(id) {
  if (String(id || "").startsWith("pp-")) return PP_META.period_label;
  return "";
}
