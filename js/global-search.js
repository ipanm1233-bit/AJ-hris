import { MENU_CONFIG } from "./auth.js";
import { icon, avatar } from "./components.js";
import { escapeHtml, fsGetAll, openModal, closeModal } from "./utils.js";
import { COL } from "./firebase-config.js";

/* ---------------------------------------------------------------------
 * GLOBAL SEARCH TOP NAVIGATION BAR (Fitur, Menu Utama, Submenu & Layanan HRIS)
 * ------------------------------------------------------------------- */

let isGlobalSearchInitialized = false;

export function initGlobalSearch(session) {
  const desktopContainer = document.getElementById("top-nav-search-container");
  const desktopInput = document.getElementById("top-nav-search-input");
  const desktopClearBtn = document.getElementById("top-nav-search-clear-btn");
  const desktopResults = document.getElementById("top-nav-search-results");

  const mobileToggleBtn = document.getElementById("btn-mobile-search-toggle");
  const mobileOverlay = document.getElementById("mobile-search-overlay");
  const mobileCloseBtn = document.getElementById("btn-mobile-search-close");
  const mobileInput = document.getElementById("mobile-search-input");
  const mobileClearBtn = document.getElementById("mobile-search-clear-btn");
  const mobileResults = document.getElementById("mobile-search-results");

  if (!desktopInput && !mobileInput) return;

  const userRole = (session?.role || "").toUpperCase();

  // 1. Bangun Master Katalog Global
  const catalog = [];

  // A. Import dari MENU_CONFIG resmi
  (MENU_CONFIG || []).forEach(menu => {
    catalog.push({
      id: menu.id,
      title: menu.label,
      category: menu.kategori || "Menu Utama",
      type: "Menu Utama",
      icon: menu.icon || "box",
      route: menu.id,
      roles: menu.roles || ["ALL"],
      description: `Halaman menu utama ${menu.label} dalam kategori ${menu.kategori || "Umum"}.`,
      keywords: [menu.label, menu.id, menu.kategori || "", "halaman", "modul", "buka", "menu"]
    });

    if (Array.isArray(menu.subMenus)) {
      menu.subMenus.forEach(sub => {
        catalog.push({
          id: `${menu.id}-${sub.id}`,
          title: `${menu.label} — ${sub.label}`,
          parentLabel: menu.label,
          category: menu.kategori || "Menu Utama",
          type: "Submenu",
          icon: menu.icon || "box",
          route: `${menu.id}?sub=${sub.id}`,
          roles: menu.roles || ["ALL"],
          description: `Submenu ${sub.label} pada modul ${menu.label}.`,
          keywords: [menu.label, sub.label, sub.id, menu.kategori || "", "sub", "tab", "bagian", "kelola"]
        });
      });
    }
  });

  // B. Fitur & Aksi Layanan HRIS Spesifik (Paling sering dicari staf / manajemen)
  const specializedFeatures = [
    {
      id: "feat-kpi-360-tugas",
      title: "Tugas Penilaian 360 (KPI Multi-Rater)",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "penilaian-kontrak?tab=kpi360",
      roles: ["ALL"],
      description: "Daftar tugas pengisian evaluasi KPI 360 derajat untuk rekan kerja, atasan, bawahan, atau diri sendiri.",
      keywords: ["kpi", "360", "penilaian", "tugas", "evaluasi", "kompetensi", "skor", "nilai", "kinerja", "rekan", "atasan", "bawahan", "multirater", "peer"]
    },
    {
      id: "feat-kpi-cetak-fisik",
      title: "Cetak Dokumen Fisik Penilaian KPI 360 (1 Lembar A4)",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "penilaian-kontrak?tab=kpi360",
      roles: ["ALL"],
      description: "Cetak langsung formulir fisik instrumen penilaian KPI 360 derajat format standar 1 halaman A4 bebas emotikon untuk tanda tangan basah.",
      keywords: ["cetak", "fisik", "dokumen", "kpi", "360", "lembar", "blangko", "print", "a4", "formulir", "kertas", "tanda tangan", "hardcopy"]
    },
    {
      id: "feat-kpi-download-pdf",
      title: "Download Dokumen Penilaian Fisik (PDF)",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "penilaian-kontrak?tab=kpi360",
      roles: ["ALL"],
      description: "Unduh file PDF formulir blangko penilaian fisik KPI 360 derajat siap print atau diarsip.",
      keywords: ["download", "unduh", "pdf", "kpi", "360", "dokumen", "fisik", "penilaian", "berkas", "file", "cetak"]
    },
    {
      id: "feat-kpi-template-soal",
      title: "Template Soal & Aspek Penilaian KPI",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "penilaian-kontrak?sub=template_soal",
      roles: ["HRD", "SUPERADMIN"],
      description: "Kelola bank soal kuesioner KPI, bobot persentase aspek kompetensi, dan butir indikator kinerja.",
      keywords: ["soal", "template", "pertanyaan", "indikator", "kuesioner", "kompetensi", "kpi", "bobot", "bank soal"]
    },
    {
      id: "feat-kpi-distribusi",
      title: "Distribusi Tugas Penilaian KPI 360",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "user-plus",
      route: "penilaian-kontrak?sub=distribusi_kpi360",
      roles: ["HRD", "SUPERADMIN"],
      description: "Plotting evaluator penilai silang (atasan langsung, bawahan, peer rekan sejajar) dan rilis penugasan.",
      keywords: ["distribusi", "tugas", "kpi", "360", "evaluator", "penilai", "bagi tugas", "jadwal kpi", "kirim tugas"]
    },
    {
      id: "feat-kpi-standar-grade",
      title: "Standar Grade & Skala Ambang Batas Nilai",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "layers",
      route: "penilaian-kontrak?sub=standar_grade",
      roles: ["HRD", "SUPERADMIN"],
      description: "Konfigurasi kriteria predikat nilai (Sangat Baik, Baik, Cukup, Kurang) dan ambang batas kelulusan evaluasi.",
      keywords: ["grade", "standar", "skor", "predikat", "ambang batas", "nilai", "mutu", "a", "b", "c", "d", "kelulusan"]
    },
    {
      id: "feat-evaluasi-kontrak",
      title: "Evaluasi Kontrak & Rekomendasi PKWT",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "penilaian-kontrak?tab=evaluasi",
      roles: ["HRD", "SUPERADMIN"],
      description: "Monitoring masa berlaku kontrak kerja PKWT karyawan, evaluasi akhir, dan rekomendasi perpanjangan/pengangkatan.",
      keywords: ["kontrak", "pkwt", "perpanjangan", "evaluasi", "habis kontrak", "spk", "tetap", "pkwtt", "masa kerja"]
    },
    {
      id: "feat-pengajuan-cuti-online",
      title: "Pengajuan Cuti Online (Tahunan / Melahirkan / Khusus)",
      category: "Kehadiran",
      type: "Fitur / Layanan",
      icon: "calendar",
      route: "pengajuan-cuti",
      roles: ["ALL"],
      description: "Formulir online permohonan cuti tahunan, cuti besar, cuti melahirkan, cuti menikah, atau cuti duka cita.",
      keywords: ["cuti", "ajukan cuti", "saldo cuti", "tahunan", "melahirkan", "nikah", "libur", "form cuti", "izin cuti"]
    },
    {
      id: "feat-approval-cuti",
      title: "Kelola Cuti & Kuota Saldo Karyawan",
      category: "Kehadiran",
      type: "Fitur / Layanan",
      icon: "calendar",
      route: "cuti",
      roles: ["HRD", "SUPERADMIN"],
      description: "Verifikasi persetujuan cuti tim, penyesuaian kuota jatah cuti tahunan, dan rekap cuti terpakai.",
      keywords: ["kelola cuti", "approval cuti", "saldo cuti", "kuota", "potong cuti", "persetujuan cuti", "jatah cuti"]
    },
    {
      id: "feat-presensi-gps",
      title: "Presensi Masuk & Pulang (Foto Selfie + GPS)",
      category: "Kehadiran",
      type: "Fitur / Layanan",
      icon: "clock",
      route: "absensi",
      roles: ["ALL"],
      description: "Rekam kehadiran harian masuk dan pulang kerja secara real-time dengan kamera selfie dan deteksi lokasi kantor.",
      keywords: ["absen", "absensi", "presensi", "masuk", "pulang", "selfie", "gps", "radius", "jam kerja", "hadir", "datang"]
    },
    {
      id: "feat-rekap-absensi",
      title: "Proses & Tarif Laporan Absensi",
      category: "Kehadiran",
      type: "Fitur / Layanan",
      icon: "clock",
      route: "absensi?sub=proses_tarif",
      roles: ["ALL"],
      description: "Rekapitulasi keterlambatan, pulang awal, kehadiran penuh, dan simulasi tarif pemotongan absensi.",
      keywords: ["laporan absensi", "tarif absen", "telat", "terlambat", "rekap absen", "denda", "hadir", "jam masuk"]
    },
    {
      id: "feat-pengajuan-izin",
      title: "Form Pengajuan Izin Sakit / Keperluan Khusus",
      category: "Kehadiran",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "izin",
      roles: ["ALL"],
      description: "Permohonan izin tidak masuk kerja dengan lampiran surat keterangan dokter atau bukti urusan keluarga.",
      keywords: ["izin", "sakit", "surat dokter", "dispensasi", "keperluan", "ijin", "tidak masuk"]
    },
    {
      id: "feat-pengajuan-kasbon",
      title: "Pengajuan Pinjaman Kasbon Karyawan",
      category: "Keuangan",
      type: "Fitur / Layanan",
      icon: "wallet",
      route: "pengajuan-kasbon",
      roles: ["ALL"],
      description: "Pengajuan pinjaman dana kasbon darurat atau uang muka kerja dengan simulasi angsuran pemotongan gaji.",
      keywords: ["kasbon", "pinjaman", "cicilan", "uang muka", "advance", "hutang", "potong gaji", "dana talangan"]
    },
    {
      id: "feat-klaim-bensin",
      title: "Klaim Bensin & Bahan Bakar Operasional",
      category: "Keuangan",
      type: "Fitur / Layanan",
      icon: "wallet",
      route: "klaim-bensin",
      roles: ["ALL"],
      description: "Penggantian biaya pembelian bensin (Pertalite/Pertamax) dinas dengan bukti upload foto struk SPBU resmi.",
      keywords: ["bensin", "bbm", "spbu", "pertalite", "pertamax", "solar", "struk bensin", "klaim bbm", "kendaraan", "reimburse bensin"]
    },
    {
      id: "feat-reimbursement",
      title: "Pengajuan Reimbursement Biaya Operasional",
      category: "Keuangan",
      type: "Fitur / Layanan",
      icon: "wallet",
      route: "reimbursement",
      roles: ["ALL"],
      description: "Klaim penggantian pengeluaran dinas operasional kantor, tiket perjalanan, konsumsi tamu, dan perlengkapan.",
      keywords: ["reimburse", "reimbursement", "klaim", "kuitansi", "nota", "penggantian biaya", "operasional", "invoice"]
    },
    {
      id: "feat-lembur-sppkl",
      title: "Perintah Lembur & Form SPPKL",
      category: "Keuangan",
      type: "Fitur / Layanan",
      icon: "clock",
      route: "lembur-kasbon?sub=perintah",
      roles: ["HRD", "SUPERADMIN", "GM", "FINANCE", "SPV", "MANAGER", "WAREHOUSE", "BACK OFFICE", "BACKOFFICE", "STAFF", "KARYAWAN", "DRIVER"],
      description: "Penerbitan Surat Perintah Perjalanan / Kerja Lembur (SPPKL) resmi dengan rincian durasi dan target tugas.",
      keywords: ["lembur", "sppkl", "surat perintah", "overtime", "perintah lembur", "jam ekstra", "tugas lembur"]
    },
    {
      id: "feat-lembur-realisasi",
      title: "Realisasi & Verifikasi Jam Lembur",
      category: "Keuangan",
      type: "Fitur / Layanan",
      icon: "clock",
      route: "lembur-kasbon?sub=realisasi",
      roles: ["HRD", "SUPERADMIN", "GM", "FINANCE", "SPV", "MANAGER"],
      description: "Verifikasi jam lembur aktual yang telah terlaksana untuk persetujuan perhitungan upah lembur.",
      keywords: ["realisasi lembur", "verifikasi lembur", "jam aktual", "upah lembur", "cek lembur"]
    },
    {
      id: "feat-slip-gaji",
      title: "Riwayat Penggajian & Slip Gaji Karyawan",
      category: "Menu Utama",
      type: "Fitur / Layanan",
      icon: "clock",
      route: "riwayat",
      roles: ["ALL"],
      description: "Lihat rincian pembayaran upah bulanan, komponen tunjangan, potongan iuran/kasbon, dan download slip gaji.",
      keywords: ["slip gaji", "gaji", "payroll", "riwayat gaji", "take home pay", "tunjangan", "potongan", "penerimaan", "upah"]
    },
    {
      id: "feat-aset-inventaris",
      title: "Inventaris Aset Kantor & Peminjaman GA",
      category: "Operasional",
      type: "Fitur / Layanan",
      icon: "box",
      route: "inventory",
      roles: ["HRD", "GA", "SUPERADMIN"],
      description: "Pencatatan aset barang perusahaan (laptop, printer, perabot), riwayat mutasi, dan form peminjaman.",
      keywords: ["aset", "inventaris", "barang", "laptop", "ga", "peminjaman", "peralatan", "kantor", "sarana"]
    },
    {
      id: "feat-kendaraan-dinas",
      title: "Peminjaman Kendaraan Operasional & Logistik",
      category: "Operasional",
      type: "Fitur / Layanan",
      icon: "truck",
      route: "kendaraan",
      roles: ["HRD", "GA", "SUPERADMIN"],
      description: "Jadwal dan permohonan penggunaan armada mobil / sepeda motor dinas, riwayat servis berkala, dan supir.",
      keywords: ["kendaraan", "mobil", "motor", "dinas", "sopir", "driver", "logistik", "servis", "kilometer", "armada"]
    },
    {
      id: "feat-surat-peringatan",
      title: "Penerbitan SP & Penegakan Disiplin (SP 1, SP 2, SP 3)",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "alert",
      route: "pemanggilan",
      roles: ["HRD", "SUPERADMIN"],
      description: "Penerbitan teguran resmi, berita acara pemanggilan, dan administrasi surat peringatan kedisiplinan kerja.",
      keywords: ["sp", "surat peringatan", "sp1", "sp2", "sp3", "teguran", "disiplin", "sanksi", "pemanggilan", "pelanggaran"]
    },
    {
      id: "feat-konseling-coaching",
      title: "Konseling & Coaching Karyawan",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "user-plus",
      route: "konseling-coaching?sub=case_management",
      roles: ["HRD", "SUPERADMIN", "MANAGER", "SPV"],
      description: "Pendampingan konseling internal, evaluasi kendala kerja tim, dan penetapan sasaran rencana perbaikan.",
      keywords: ["konseling", "coaching", "bimbingan", "curhat", "kasus", "action plan", "pembinaan", "konsultasi"]
    },
    {
      id: "feat-rekrutmen-ats",
      title: "Dashboard Rekrutmen ATS & Lowongan Kerja",
      category: "Karyawan & Kinerja",
      type: "Fitur / Layanan",
      icon: "user-plus",
      route: "rekrutmen?sub=dashboard",
      roles: ["HRD", "SUPERADMIN", "GM", "MANAGER"],
      description: "Pelacakan proses rekrutmen karyawan baru, lowongan aktif, screening CV pelamar, dan jadwal wawancara kerja.",
      keywords: ["ats", "rekrutmen", "loker", "pelamar", "kandidat", "screening", "interview", "lowongan", "cv"]
    },
    {
      id: "feat-master-data",
      title: "Data Master Karyawan, Jabatan, & Divisi",
      category: "Pengaturan",
      type: "Fitur / Layanan",
      icon: "database",
      route: "manajemen-data",
      roles: ["HRD", "SUPERADMIN"],
      description: "Pusat database pokok kepegawaian, nomor induk NIK, struktur hierarki organisasi, kantor cabang, dan grade.",
      keywords: ["data master", "master karyawan", "nik", "jabatan", "divisi", "cabang", "perusahaan", "pegawai"]
    },
    {
      id: "feat-hak-akses",
      title: "Pengaturan Hak Akses & User HRIS",
      category: "Pengaturan",
      type: "Fitur / Layanan",
      icon: "user-plus",
      route: "pengaturan",
      roles: ["HRD", "SUPERADMIN"],
      description: "Kelola username login, hak akses modul, password akun pengguna, dan pengaturan role keamanan.",
      keywords: ["hak akses", "role", "user", "password", "kewenangan", "admin", "pengguna", "permission"]
    },
    {
      id: "feat-konfigurasi",
      title: "Konfigurasi Sistem & Parameter Global HRIS",
      category: "Pengaturan",
      type: "Fitur / Layanan",
      icon: "layers",
      route: "konfigurasi",
      roles: ["HRD", "SUPERADMIN"],
      description: "Penyesuaian radius koordinat GPS absensi kantor, setup akun email SMTP, logo perusahaan, dan identitas.",
      keywords: ["konfigurasi", "setting", "parameter", "radius gps", "smtp email", "logo", "sistem"]
    },
    {
      id: "feat-form-builder",
      title: "Form Builder & Desain Kuesioner Dinamis",
      category: "Pengaturan",
      type: "Fitur / Layanan",
      icon: "doc-plus",
      route: "form-builder",
      roles: ["HRD", "SUPERADMIN"],
      description: "Pembuat formulir digital serbaguna tanpa koding untuk survei kepuasan, formulir pendaftaran, dan ceklis.",
      keywords: ["form builder", "formulir", "kuesioner", "survei", "desain form", "custom form", "pertanyaan"]
    },
    {
      id: "feat-sales-order",
      title: "Sales Order & Pesanan Penjualan",
      category: "Sales",
      type: "Fitur / Layanan",
      icon: "wallet",
      route: "sales-order",
      roles: ["ALL"],
      description: "Pembuatan sales order faktur pemesanan barang dari outlet pelanggan dengan kalkulasi diskon dan PPN.",
      keywords: ["sales order", "pesanan", "order", "penjualan", "so", "faktur", "nota"]
    },
    {
      id: "feat-sales-outlet",
      title: "Database Outlet Toko & Pelanggan Sales",
      category: "Sales",
      type: "Fitur / Layanan",
      icon: "user-plus",
      route: "sales-outlet?sub=lihat_semua",
      roles: ["ALL"],
      description: "Manajemen data toko retail, grosir, warung mitra, titik koordinat, dan pemilik toko rekanan penjualan.",
      keywords: ["outlet", "toko", "warung", "mitra", "pelanggan sales", "kunjungan toko", "rekanan"]
    },
    {
      id: "feat-sales-track",
      title: "Live Tracking GPS & Rute Sales Lapangan",
      category: "Sales",
      type: "Fitur / Layanan",
      icon: "layers",
      route: "sales-track",
      roles: ["ALL"],
      description: "Peta pemantauan rute perjalanan sales lapangan, check-in kunjungan outlet, dan waktu tempuh nyata.",
      keywords: ["tracking", "gps sales", "rute", "live map", "posisi salesman", "kunjungan", "lokasi"]
    }
  ];

  specializedFeatures.forEach(feat => catalog.push(feat));

  function norm(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[\(\)\[\]\/\-\_\:\,\.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function highlightMatches(text, queryWords) {
    if (!text) return "";
    let safe = escapeHtml(text);
    queryWords.forEach(word => {
      if (!word || word.length < 2) return;
      const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      safe = safe.replace(regex, '<mark class="bg-amber-100 text-maroon-800 font-bold px-0.5 rounded">$1</mark>');
    });
    return safe;
  }

  function getCategoryBadgeClass(cat) {
    switch (cat) {
      case "Karyawan & Kinerja": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Keuangan": return "bg-amber-50 text-amber-700 border-amber-200";
      case "Kehadiran": return "bg-blue-50 text-blue-700 border-blue-200";
      case "Persetujuan": return "bg-purple-50 text-purple-700 border-purple-200";
      case "Operasional": return "bg-teal-50 text-teal-700 border-teal-200";
      case "Sales": return "bg-rose-50 text-rose-700 border-rose-200";
      case "Pengaturan": return "bg-slate-100 text-slate-700 border-slate-200";
      default: return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
  }

  function getTypeBadgeClass(type) {
    switch (type) {
      case "Submenu": return "bg-sky-50 text-sky-700 border-sky-100";
      case "Fitur / Layanan": return "bg-maroon-50 text-maroon-700 border-maroon-100";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  }

  const QUICK_TAGS = [
    { tag: "kpi 360", label: "KPI 360" },
    { tag: "cetak fisik", label: "Cetak Dokumen Fisik" },
    { tag: "cuti", label: "Cuti" },
    { tag: "absensi", label: "Presensi Absen" },
    { tag: "lembur", label: "Lembur SPPKL" },
    { tag: "reimbursement", label: "Reimburse" },
    { tag: "kasbon", label: "Kasbon" },
    { tag: "bensin", label: "Bensin" },
    { tag: "inventaris", label: "Aset GA" },
    { tag: "data master", label: "Data Master" }
  ];

  function searchCatalog(rawQuery) {
    const q = norm(rawQuery);
    if (!q) return [];

    const queryWords = q.split(" ").filter(w => w.length > 0);
    const scoredItems = [];

    catalog.forEach(item => {
      const titleNorm = norm(item.title);
      const descNorm = norm(item.description);
      const catNorm = norm(item.category);
      const typeNorm = norm(item.type);
      const routeNorm = norm(item.route);
      const kwNorm = Array.isArray(item.keywords) ? item.keywords.map(norm).join(" ") : norm(item.keywords);

      let score = 0;
      let matchedAny = false;

      if (titleNorm === q) {
        score += 160;
        matchedAny = true;
      } else if (titleNorm.startsWith(q)) {
        score += 100;
        matchedAny = true;
      } else if (titleNorm.includes(q)) {
        score += 65;
        matchedAny = true;
      }

      let allWordsMatch = true;
      queryWords.forEach(w => {
        let wordFound = false;
        if (titleNorm.includes(w)) {
          score += 30;
          wordFound = true;
        }
        if (kwNorm.includes(w)) {
          score += 25;
          wordFound = true;
        }
        if (descNorm.includes(w)) {
          score += 15;
          wordFound = true;
        }
        if (catNorm.includes(w)) {
          score += 10;
          wordFound = true;
        }
        if (typeNorm.includes(w)) {
          score += 5;
          wordFound = true;
        }
        if (routeNorm.includes(w)) {
          score += 10;
          wordFound = true;
        }

        if (wordFound) {
          matchedAny = true;
        } else {
          allWordsMatch = false;
        }
      });

      if (allWordsMatch && queryWords.length > 1) {
        score += 45;
      }

      const hasAccess = item.roles.includes("ALL") || item.roles.includes(userRole);
      if (hasAccess) score += 5;

      if (matchedAny && score > 0) {
        scoredItems.push({
          ...item,
          score,
          hasAccess
        });
      }
    });

    const seen = new Set();
    const uniqueItems = [];
    scoredItems.sort((a, b) => b.score - a.score);
    for (const it of scoredItems) {
      const key = `${it.route}|${it.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(it);
      }
    }

    return uniqueItems.slice(0, 15);
  }

  /* ---------------- PENCARIAN KARYAWAN KHUSUS ROLE HRD ---------------- */
  const isHrdRole = ["HRD", "SUPERADMIN"].includes(userRole);
  let cachedEmployees = null;
  let isFetchingEmployees = false;

  async function ensureEmployeesLoaded() {
    if (cachedEmployees !== null || isFetchingEmployees) return;
    isFetchingEmployees = true;
    try {
      const emps = await fsGetAll(COL.MASTER_KARYAWAN);
      cachedEmployees = (emps || []).filter(e => e && e.nama_karyawan && e.nama_karyawan.trim() !== "");
    } catch (e) {
      console.warn("Gagal memuat master karyawan untuk pencarian HRD:", e);
      cachedEmployees = [];
    } finally {
      isFetchingEmployees = false;
    }
  }

  function searchEmployees(rawQuery) {
    if (!isHrdRole || !cachedEmployees || !cachedEmployees.length) return [];
    const q = norm(rawQuery);
    if (!q || q.length < 2) return [];

    const queryWords = q.split(" ").filter(w => w.length > 0);
    const scored = [];

    for (const emp of cachedEmployees) {
      const nameNorm = norm(emp.nama_karyawan);
      const nikNorm = norm(emp.nik_karyawan || emp.nik || "");
      const jabNorm = norm(emp.jabatan || "");
      const divNorm = norm(emp.divisi || "");
      const cabNorm = norm(emp.cabang || "");
      const konNorm = norm(emp.no_kontrak || "");

      let score = 0;
      let matched = false;

      if (nameNorm === q) {
        score += 250;
        matched = true;
      } else if (nikNorm === q) {
        score += 250;
        matched = true;
      } else if (nameNorm.startsWith(q)) {
        score += 150;
        matched = true;
      } else if (nikNorm.startsWith(q)) {
        score += 150;
        matched = true;
      } else if (nameNorm.includes(q)) {
        score += 80;
        matched = true;
      } else if (nikNorm.includes(q)) {
        score += 80;
        matched = true;
      }

      let allWordsFound = true;
      for (const w of queryWords) {
        if (nameNorm.includes(w) || nikNorm.includes(w) || jabNorm.includes(w) || divNorm.includes(w) || cabNorm.includes(w) || konNorm.includes(w)) {
          score += 30;
          matched = true;
        } else {
          allWordsFound = false;
        }
      }

      if (allWordsFound && queryWords.length > 1) {
        score += 40;
      }

      if (matched && score > 0) {
        scored.push({ emp, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map(s => s.emp);
  }

  function openHrdEmployeeDestinationModal(emp) {
    const nik = emp.nik_karyawan || emp.nik || "-";
    const nama = emp.nama_karyawan || "Karyawan";
    const jabatan = emp.jabatan || "-";
    const divisi = emp.divisi || "-";
    const cabang = emp.cabang || "-";
    const status = emp.status_karyawan || "AKTIF";

    const targetMenus = [
      {
        id: "menu-db-karyawan",
        title: "Database Karyawan (Master Data)",
        route: "manajemen-data",
        badge: "Master Database",
        badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
        icon: "database",
        desc: "Lihat profil lengkap, data pokok NIK/KTP/KK, BPJS, rekening, riwayat jabatan, dan mutasi."
      },
      {
        id: "menu-kontrak-pkwt",
        title: "Data Kontrak Kerja & Evaluasi PKWT",
        route: "penilaian-kontrak?tab=evaluasi",
        badge: "SPK & Kontrak",
        badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
        icon: "doc-plus",
        desc: "Pantau masa berlaku SPK, tanggal berakhir kontrak, sisa masa kerja, dan evaluasi perpanjangan."
      },
      {
        id: "menu-cuti",
        title: "Manajemen Cuti & Saldo Jatah",
        route: "cuti",
        badge: "Cuti & Izin",
        badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: "calendar",
        desc: "Riwayat pengajuan cuti, sisa hak cuti tahunan/khusus, input cuti karyawan, dan cetak form fisik."
      },
      {
        id: "menu-absensi",
        title: "Presensi & Rekap Absensi",
        route: "absensi",
        badge: "Kehadiran",
        badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
        icon: "clock",
        desc: "Catatan jam presensi harian, log datang/pulang, keterlambatan, jam lembur, dan koordinat GPS."
      },
      {
        id: "menu-kpi360",
        title: "Penilaian Kinerja / KPI 360",
        route: "penilaian-kontrak?tab=kpi360",
        badge: "Kinerja & KPI",
        badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
        icon: "layers",
        desc: "Instrumen evaluasi multi-rater 360 derajat, skor kompetensi, dan capaian target kerja."
      },
      {
        id: "menu-sp-disiplin",
        title: "Kedisiplinan & Surat Peringatan (SP)",
        route: "pemanggilan",
        badge: "Disiplin & SP",
        badgeColor: "bg-red-50 text-red-700 border-red-200",
        icon: "alert",
        desc: "Catatan berita acara pemanggilan, histori pelanggaran tata tertib, dan surat peringatan (SP)."
      },
      {
        id: "menu-dokumen",
        title: "Arsip Berkas & Dokumen Digital",
        route: "dokumen",
        badge: "Berkas Digital",
        badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
        icon: "box",
        desc: "Pusat arsip berkas digital, ijazah, KTP, perjanjian kerja, dan dokumen resmi kepegawaian."
      },
      {
        id: "menu-konseling",
        title: "Konseling & Coaching Karyawan",
        route: "konseling-coaching",
        badge: "Coaching",
        badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
        icon: "user-plus",
        desc: "Lembar sesi bimbingan internal, evaluasi kendala kerja tim, dan sasaran action plan."
      },
      {
        id: "menu-riwayat-gaji",
        title: "Riwayat Penggajian & Slip Gaji",
        route: "riwayat",
        badge: "Payroll & Slip",
        badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
        icon: "wallet",
        desc: "Rincian pembayaran gaji bulanan, komponen tunjangan, potongan kasbon, dan arsip slip gaji."
      }
    ];

    openModal({
      title: "Pilih Menu Tujuan Karyawan",
      size: "lg",
      bodyHtml: `
        <div class="space-y-4 py-1">
          <!-- Profile Card -->
          <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-maroon-900 rounded-2xl p-4 text-white shadow-sm flex items-center justify-between gap-3">
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center font-black text-base text-amber-300 shrink-0">
                ${escapeHtml((nama || "K").charAt(0).toUpperCase())}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-sm sm:text-base text-white truncate">${escapeHtml(nama)}</h3>
                  <span class="text-[10px] font-mono font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md">NIK: ${escapeHtml(nik)}</span>
                  <span class="text-[10px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded-md">${escapeHtml(status)}</span>
                </div>
                <p class="text-xs text-slate-200 mt-1 truncate">
                  <span class="font-semibold text-amber-200">${escapeHtml(jabatan)}</span> • ${escapeHtml(divisi)} • Cabang: <span class="font-bold text-white">${escapeHtml(cabang)}</span>
                </p>
              </div>
            </div>
          </div>

          <div class="px-0.5">
            <p class="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Sistem menanyakan: Pilih menu tujuan untuk karyawan ini
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1" id="hrd-target-menu-grid">
              ${targetMenus.map(m => `
                <div 
                  data-route="${m.route}"
                  class="btn-select-hrd-dest group p-3 rounded-xl border border-slate-200 hover:border-maroon-500 hover:bg-maroon-50/30 transition cursor-pointer flex flex-col justify-between gap-2 bg-white"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-maroon-700 group-hover:text-white text-slate-700 border border-slate-200 flex items-center justify-center shrink-0 transition">
                        ${icon(m.icon || 'box', 'w-4 h-4')}
                      </div>
                      <span class="font-bold text-xs text-slate-800 group-hover:text-maroon-800 transition truncate">${m.title}</span>
                    </div>
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${m.badgeColor} shrink-0">${m.badge}</span>
                  </div>
                  <p class="text-[10.5px] text-slate-500 leading-relaxed group-hover:text-slate-700 transition line-clamp-2">${m.desc}</p>
                  <div class="pt-1 flex items-center justify-between text-[10px] text-maroon-700 font-bold border-t border-slate-100">
                    <span>Buka Modul</span>
                    <span class="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-cancel-dest-modal" class="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">
          Batal
        </button>
      `,
      onMount: (mEl) => {
        mEl.querySelector("#btn-cancel-dest-modal")?.addEventListener("click", () => closeModal());

        mEl.querySelectorAll(".btn-select-hrd-dest").forEach(card => {
          card.addEventListener("click", () => {
            const route = card.getAttribute("data-route");
            if (!route) return;

            try {
              sessionStorage.setItem("hrd_selected_employee", JSON.stringify({
                nama: nama,
                nik: nik,
                jabatan: jabatan,
                divisi: divisi,
                cabang: cabang
              }));
              sessionStorage.setItem("hrd_search_query", nama);
            } catch (e) {}

            closeModal();

            // Navigasi ke rute tujuan
            window.location.hash = '#' + route;

            // Auto-fill input pencarian pada halaman tujuan
            setTimeout(() => {
              const possibleInputs = document.querySelectorAll(
                '#cuti-search, #cuti-table-search, #search-karyawan, input[id*="search"], input[placeholder*="Cari"], input[placeholder*="cari"]'
              );
              possibleInputs.forEach(inp => {
                if (inp && (inp.offsetParent !== null || inp.offsetWidth > 0)) {
                  inp.value = nama;
                  inp.dispatchEvent(new Event("input", { bubbles: true }));
                }
              });
            }, 350);
          });
        });
      }
    });
  }

  function renderCombinedResultsHtml(catalogResults, employeeResults, rawQuery) {
    const q = norm(rawQuery);
    const queryWords = q.split(" ").filter(w => w.length > 0);

    const totalCount = (catalogResults?.length || 0) + (employeeResults?.length || 0);

    if (totalCount === 0) {
      return `
        <div class="p-5 text-center space-y-3">
          <div class="w-10 h-10 mx-auto rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 class="text-xs sm:text-sm font-bold text-slate-700">Tidak ada hasil yang cocok</h4>
            <p class="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">Tidak ditemukan menu${isHrdRole ? ' atau data karyawan' : ''} untuk "<strong>${escapeHtml(rawQuery)}</strong>".</p>
          </div>
          <div class="pt-1 flex flex-wrap justify-center gap-1.5 text-xs">
            <span class="text-[10.5px] font-bold text-slate-400 self-center">Pintasan Cepat:</span>
            ${QUICK_TAGS.slice(0, 6).map(t => `
              <button type="button" data-tag="${t.tag}" class="btn-search-tag-chip px-2 py-0.5 bg-slate-100 hover:bg-maroon-50 hover:text-maroon-700 text-slate-600 rounded-md text-[10.5px] font-medium transition">${t.label}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    let html = `
      <div class="px-3.5 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between">
        <span class="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Ditemukan <strong>${totalCount}</strong> hasil:
        </span>
        <span class="text-[9.5px] text-slate-400 hidden sm:inline-block">Gunakan ↑ ↓ untuk memilih, Enter untuk membuka</span>
      </div>
      <div class="divide-y divide-slate-100 max-h-96 overflow-y-auto" id="global-search-results-list">
    `;

    // 1. Employee Results (HRD Only)
    if (employeeResults && employeeResults.length > 0) {
      html += `
        <div class="px-3 py-1.5 bg-gradient-to-r from-maroon-50 to-amber-50/30 border-b border-maroon-100 flex items-center justify-between">
          <span class="text-[10.5px] font-black text-maroon-800 uppercase tracking-wide flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            Data Karyawan (Pencarian Role HRD)
          </span>
          <span class="text-[9.5px] font-bold text-maroon-600 bg-white/80 border border-maroon-200 px-1.5 py-0.2 rounded">Pilih Menu</span>
        </div>
      `;

      employeeResults.forEach((emp, empIdx) => {
        const highlightedName = highlightMatches(emp.nama_karyawan, queryWords);
        const highlightedNik = highlightMatches(emp.nik_karyawan || emp.nik || "-", queryWords);
        const cabangStr = emp.cabang || "-";
        const jabatanStr = emp.jabatan || "-";

        html += `
          <div 
            data-type="employee"
            data-emp-idx="${empIdx}"
            class="global-search-interactive-item global-search-emp-row group px-3.5 py-2.5 hover:bg-maroon-50/30 cursor-pointer transition flex items-center justify-between gap-2.5 border-l-2 border-transparent hover:border-maroon-600"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-xl bg-maroon-100 border border-maroon-200 text-maroon-800 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-maroon-700 group-hover:text-white transition">
                ${escapeHtml((emp.nama_karyawan || "K").charAt(0).toUpperCase())}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-maroon-700 transition truncate">${highlightedName}</span>
                  <span class="text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">NIK: ${highlightedNik}</span>
                  <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">${escapeHtml(emp.status_karyawan || "AKTIF")}</span>
                </div>
                <p class="text-[10.5px] text-slate-500 mt-0.5 truncate">${escapeHtml(jabatanStr)} • ${escapeHtml(emp.divisi || "-")} • Cabang: <strong class="text-slate-700">${escapeHtml(cabangStr)}</strong></p>
              </div>
            </div>
            <div class="shrink-0 flex items-center">
              <button type="button" class="px-2.5 py-1 rounded-lg bg-maroon-50 group-hover:bg-maroon-700 group-hover:text-white text-maroon-700 border border-maroon-200 font-bold text-[11px] transition flex items-center gap-1">
                <span>Pilih Menu</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        `;
      });
    }

    // 2. Menu & Feature Results
    if (catalogResults && catalogResults.length > 0) {
      if (employeeResults && employeeResults.length > 0) {
        html += `
          <div class="px-3 py-1.5 bg-slate-50 border-y border-slate-100 flex items-center justify-between">
            <span class="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>
              Menu & Fitur Aplikasi
            </span>
          </div>
        `;
      }

      catalogResults.forEach((item, catIdx) => {
        const catClass = getCategoryBadgeClass(item.category);
        const typeClass = getTypeBadgeClass(item.type);
        const highlightedTitle = highlightMatches(item.title, queryWords);
        const highlightedDesc = highlightMatches(item.description, queryWords);

        html += `
          <div 
            data-type="menu"
            data-route="${escapeHtml(item.route)}" 
            class="global-search-interactive-item global-search-menu-row group px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between gap-2.5"
          >
            <div class="flex items-start gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center shrink-0 group-hover:bg-maroon-50 group-hover:border-maroon-200 group-hover:text-maroon-700 transition">
                ${icon(item.icon || 'box', 'w-3.5 h-3.5')}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-maroon-700 transition truncate">${highlightedTitle}</span>
                  <span class="text-[9px] font-bold px-1.5 py-0.2 rounded border ${catClass}">${item.category}</span>
                  <span class="text-[9px] font-semibold px-1.5 py-0.2 rounded ${typeClass}">${item.type}</span>
                </div>
                <p class="text-[10.5px] text-slate-500 mt-0.5 line-clamp-1">${highlightedDesc}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-[9.5px] font-mono text-slate-400">#${item.route}</span>
                  ${!item.hasAccess ? `<span class="text-[9.5px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">Perlu Role: ${item.roles.join(', ')}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="shrink-0 flex items-center">
              <button type="button" class="px-2 py-1 rounded-lg bg-slate-100 group-hover:bg-maroon-700 group-hover:text-white text-slate-600 font-bold text-[11px] transition flex items-center gap-1">
                <span>Buka</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    return html;
  }

  /* ---------------- DESKTOP SEARCH CONTROLLER ---------------- */
  let desktopSelectedIndex = -1;
  let desktopCurrentCatalogResults = [];
  let desktopCurrentEmployeeResults = [];

  function performDesktopSearch(query) {
    if (!desktopResults || !desktopInput) return;
    const raw = (query || "").trim();

    if (!raw) {
      desktopResults.classList.add("hidden");
      desktopResults.innerHTML = "";
      desktopClearBtn?.classList.add("hidden");
      desktopSelectedIndex = -1;
      desktopCurrentCatalogResults = [];
      desktopCurrentEmployeeResults = [];
      return;
    }

    desktopClearBtn?.classList.remove("hidden");
    desktopCurrentCatalogResults = searchCatalog(raw);
    desktopCurrentEmployeeResults = isHrdRole ? searchEmployees(raw) : [];
    desktopSelectedIndex = -1;

    desktopResults.innerHTML = renderCombinedResultsHtml(desktopCurrentCatalogResults, desktopCurrentEmployeeResults, raw);
    desktopResults.classList.remove("hidden");

    // Bind Employee clicks
    desktopResults.querySelectorAll(".global-search-emp-row").forEach(empRow => {
      empRow.onclick = () => {
        const empIdx = parseInt(empRow.getAttribute("data-emp-idx"), 10);
        const emp = desktopCurrentEmployeeResults[empIdx];
        if (emp) {
          desktopResults.classList.add("hidden");
          desktopInput.blur();
          openHrdEmployeeDestinationModal(emp);
        }
      };
    });

    // Bind Menu clicks
    desktopResults.querySelectorAll(".global-search-menu-row").forEach(itemEl => {
      itemEl.onclick = () => {
        const route = itemEl.getAttribute("data-route");
        if (route) {
          desktopResults.classList.add("hidden");
          desktopInput.blur();
          window.location.hash = '#' + route;
        }
      };
    });

    // Bind chip clicks
    desktopResults.querySelectorAll(".btn-search-tag-chip").forEach(chip => {
      chip.onclick = () => {
        const tag = chip.getAttribute("data-tag");
        if (tag) {
          desktopInput.value = tag;
          performDesktopSearch(tag);
        }
      };
    });
  }

  function updateDesktopActiveItem(newIndex) {
    if (!desktopResults) return;
    const items = desktopResults.querySelectorAll(".global-search-interactive-item");
    if (!items || items.length === 0) return;

    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;

    desktopSelectedIndex = newIndex;

    items.forEach((item, idx) => {
      if (idx === desktopSelectedIndex) {
        item.classList.add("bg-maroon-50", "border-l-4", "border-maroon-700");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("bg-maroon-50", "border-l-4", "border-maroon-700");
      }
    });
  }

  if (desktopInput) {
    desktopInput.addEventListener("input", (e) => {
      if (isHrdRole && !cachedEmployees) ensureEmployeesLoaded();
      performDesktopSearch(e.target.value);
    });

    desktopInput.addEventListener("focus", () => {
      if (isHrdRole && !cachedEmployees) ensureEmployeesLoaded();
      if (desktopInput.value.trim().length > 0) {
        performDesktopSearch(desktopInput.value);
      }
    });

    desktopClearBtn?.addEventListener("click", () => {
      desktopInput.value = "";
      performDesktopSearch("");
      desktopInput.focus();
    });

    desktopInput.addEventListener("keydown", (e) => {
      const items = desktopResults ? desktopResults.querySelectorAll(".global-search-interactive-item") : [];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        updateDesktopActiveItem(desktopSelectedIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateDesktopActiveItem(desktopSelectedIndex - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items.length > 0) {
          const targetIdx = desktopSelectedIndex >= 0 ? desktopSelectedIndex : 0;
          const targetItem = items[targetIdx];
          if (targetItem) {
            targetItem.click();
          }
        }
      } else if (e.key === "Escape") {
        desktopResults?.classList.add("hidden");
        desktopInput.blur();
      }
    });
  }

  /* ---------------- MOBILE SEARCH CONTROLLER ---------------- */
  let mobileSelectedIndex = -1;
  let mobileCurrentCatalogResults = [];
  let mobileCurrentEmployeeResults = [];

  function performMobileSearch(query) {
    if (!mobileResults || !mobileInput) return;
    const raw = (query || "").trim();

    if (!raw) {
      mobileResults.innerHTML = `
        <div class="p-4">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pintasan Fitur Populer</p>
          <div class="flex flex-wrap gap-1.5">
            ${QUICK_TAGS.map(t => `
              <button type="button" data-tag="${t.tag}" class="btn-search-tag-chip px-2.5 py-1 bg-slate-100 hover:bg-maroon-50 hover:text-maroon-700 text-slate-700 rounded-lg text-xs font-medium transition">${t.label}</button>
            `).join('')}
          </div>
        </div>
      `;
      mobileClearBtn?.classList.add("hidden");
      mobileCurrentCatalogResults = [];
      mobileCurrentEmployeeResults = [];
      mobileSelectedIndex = -1;

      mobileResults.querySelectorAll(".btn-search-tag-chip").forEach(chip => {
        chip.onclick = () => {
          const tag = chip.getAttribute("data-tag");
          if (tag && mobileInput) {
            mobileInput.value = tag;
            performMobileSearch(tag);
          }
        };
      });
      return;
    }

    mobileClearBtn?.classList.remove("hidden");
    mobileCurrentCatalogResults = searchCatalog(raw);
    mobileCurrentEmployeeResults = isHrdRole ? searchEmployees(raw) : [];
    mobileSelectedIndex = -1;

    mobileResults.innerHTML = renderCombinedResultsHtml(mobileCurrentCatalogResults, mobileCurrentEmployeeResults, raw);

    // Bind Employee clicks
    mobileResults.querySelectorAll(".global-search-emp-row").forEach(empRow => {
      empRow.onclick = () => {
        const empIdx = parseInt(empRow.getAttribute("data-emp-idx"), 10);
        const emp = mobileCurrentEmployeeResults[empIdx];
        if (emp) {
          closeMobileSearch();
          openHrdEmployeeDestinationModal(emp);
        }
      };
    });

    // Bind Menu clicks
    mobileResults.querySelectorAll(".global-search-menu-row").forEach(itemEl => {
      itemEl.onclick = () => {
        const route = itemEl.getAttribute("data-route");
        if (route) {
          closeMobileSearch();
          window.location.hash = '#' + route;
        }
      };
    });

    mobileResults.querySelectorAll(".btn-search-tag-chip").forEach(chip => {
      chip.onclick = () => {
        const tag = chip.getAttribute("data-tag");
        if (tag && mobileInput) {
          mobileInput.value = tag;
          performMobileSearch(tag);
        }
      };
    });
  }

  function openMobileSearch() {
    if (!mobileOverlay) return;
    if (isHrdRole && !cachedEmployees) ensureEmployeesLoaded();
    mobileOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    if (mobileInput) {
      mobileInput.value = desktopInput?.value || "";
      performMobileSearch(mobileInput.value);
      setTimeout(() => mobileInput.focus(), 50);
    }
  }

  function closeMobileSearch() {
    if (!mobileOverlay) return;
    mobileOverlay.classList.add("hidden");
    document.body.style.overflow = "";
    if (mobileInput) mobileInput.blur();
  }

  if (mobileToggleBtn) {
    mobileToggleBtn.addEventListener("click", openMobileSearch);
  }

  if (mobileCloseBtn) {
    mobileCloseBtn.addEventListener("click", closeMobileSearch);
  }

  if (mobileInput) {
    mobileInput.addEventListener("input", (e) => {
      if (isHrdRole && !cachedEmployees) ensureEmployeesLoaded();
      performMobileSearch(e.target.value);
    });

    mobileClearBtn?.addEventListener("click", () => {
      mobileInput.value = "";
      performMobileSearch("");
      mobileInput.focus();
    });

    mobileInput.addEventListener("keydown", (e) => {
      const items = mobileResults ? mobileResults.querySelectorAll(".global-search-interactive-item") : [];
      if (e.key === "Enter" && items.length > 0) {
        e.preventDefault();
        items[0].click();
      } else if (e.key === "Escape") {
        closeMobileSearch();
      }
    });
  }

  /* ---------------- GLOBAL SHORTCUTS & OUTSIDE CLICK ---------------- */
  if (!isGlobalSearchInitialized) {
    isGlobalSearchInitialized = true;

    // Shortcut Ctrl+K / Cmd+K / '/'
    window.addEventListener("keydown", (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.innerWidth < 1024) {
          openMobileSearch();
        } else if (desktopInput) {
          desktopInput.focus();
          desktopInput.select();
          if (desktopInput.value.trim().length > 0) {
            performDesktopSearch(desktopInput.value);
          }
        }
      } else if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA" && !document.activeElement.isContentEditable) {
        e.preventDefault();
        if (window.innerWidth < 1024) {
          openMobileSearch();
        } else if (desktopInput) {
          desktopInput.focus();
          desktopInput.select();
        }
      }
    });

    // Outside click to dismiss desktop dropdown
    document.addEventListener("click", (e) => {
      if (desktopContainer && desktopResults) {
        if (!desktopContainer.contains(e.target) && !desktopResults.contains(e.target)) {
          desktopResults.classList.add("hidden");
        }
      }
    });
  }
}
