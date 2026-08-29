/**
 * =====================================================================
 * ATS-ENGINE.JS — Rule-based Resume Screening & ATS Scoring Engine
 * HRIS Andela Jaya (Tanpa AI API eksternal - Sesuai PRD & Desain ATS)
 * =====================================================================
 */

import { db, doc, getDoc, setDoc } from "../firebase-config.js";

export const DEFAULT_SYNONYMS = {
  "negosiasi": ["negosiasi", "negotiation", "negotiating", "tawar-menawar", "deal maker", "closing deal", "lobbying"],
  "sales": [
    "sales", "salesman", "sales executive", "sales representative", "sales marketing",
    "account executive", "canvassing", "canvasser", "penjualan", "selling", "b2b sales",
    "b2c sales", "direct sales", "field sales", "telemarketing", "target sales", "sales force"
  ],
  "distributor": ["distributor", "distribution", "distribusi", "fmcg", "retail", "grosir", "agen", "dealer", "prinsipal", "pemasok"],
  "excel": ["excel", "microsoft excel", "ms excel", "vlookup", "hlookup", "pivot table", "pivot", "spreadsheet", "rumus excel", "macro", "data analysis"],
  "admin": ["admin", "administrasi", "administrative", "data entry", "filling", "arsip", "surat-menyurat", "sekretaris", "office administration", "input data"],
  "accounting": ["accounting", "akuntansi", "pembukuan", "jurnal", "buku besar", "laporan keuangan", "financial report", "faktur", "invoicing", "pajak", "tax", "pph", "ppn", "accurate", "zahir", "sap"],
  "driver": ["driver", "sopir", "supir", "pengemudi", "sim a", "sim b1", "sim b2", "sim c", "mengemudi", "kirim barang", "kurir", "delivery", "ekspedisi"],
  "warehouse": ["warehouse", "gudang", "kepala gudang", "staff gudang", "stock opname", "inventaris", "inventory", "bongkar muat", "loading", "unloading", "forklift", "fifo", "fefo"],
  "komunikasi": ["komunikasi", "communication", "public speaking", "presentasi", "presentation", "interpersonal", "hubungan pelanggan", "customer service"],
  "leadership": ["leadership", "kepemimpinan", "supervisory", "supervisor", "team leader", "koordinator", "managerial", "manajemen tim"],
  "problem solving": ["problem solving", "pemecahan masalah", "analitis", "analytical thinking", "decision making", "pengambilan keputusan"],
  "digital marketing": ["digital marketing", "social media", "sosmed", "content creator", "copywriting", "meta ads", "tiktok ads", "seo", "sem", "canva", "photoshop"]
};

export const DEFAULT_ATS_RULES = [
  { kriteria: "Pendidikan", bobot: 10, mandatory: true, key: "pendidikan" },
  { kriteria: "Pengalaman Kerja", bobot: 25, mandatory: true, key: "pengalaman" },
  { kriteria: "SIM C / Mengemudi", bobot: 15, mandatory: true, key: "sim" },
  { kriteria: "Domisili & Penempatan", bobot: 10, mandatory: false, key: "domisili" },
  { kriteria: "Keahlian Utama / Sales", bobot: 20, mandatory: false, key: "skills" },
  { kriteria: "Software & Excel", bobot: 10, mandatory: false, key: "software" },
  { kriteria: "Pengalaman Industri Relevan", bobot: 10, mandatory: false, key: "industri" }
];

export const DEFAULT_INDUSTRY_EXCLUSIONS = {
  enabled: true,
  rule_title: "Eksklusi Alumni Distributor Cat & Kompetitor",
  affected_positions: [
    "sales", "salesman", "sales executive", "sales force", "canvasser", "canvassing",
    "admin", "admin sales", "admin gudang", "administrasi", "collector", "penagihan",
    "staff administrasi", "finance"
  ],
  keywords: [
    "distributor cat", "distribusi cat", "agen cat", "toko cat", "pabrik cat", "industri cat", "cat tembok", "cat kayu",
    "nippon paint", "avian", "dulux", "jotun", "mowilex", "propan", "indaco", "kansai paint", "pacific paint", "warna agung", "dana paint"
  ],
  action: "penalty_flag", // 'auto_reject' | 'penalty_flag' | 'warning_only'
  penalty_points: 25,
  warning_message: "Terindikasi memiliki riwayat kerja di distributor/pabrik cat kompetitor (Dilarang untuk posisi Sales & Admin CV Andela Jaya)"
};

export const DEFAULT_INTERVIEW_TEMPLATES = [
  {
    id: "tpl_sales",
    kategori_posisi: "Sales & Marketing",
    posisi_target: ["Sales", "Sales Executive", "Canvasser", "Sales Force", "Account Executive", "Salesman", "Marketing"],
    aspek: [
      {
        key: "komunikasi",
        label: "Communication & Negotiation",
        desc: "Kelugasan berbicara, daya persuasif, dan teknik negosiasi dengan pemilik toko/outlet retail.",
        pertanyaan_panduan: "Ceritakan bagaimana teknik Anda meyakinkan pemilik toko baru yang menolak mengambil produk display Anda?",
        bobot: 20
      },
      {
        key: "attitude",
        label: "Attitude & Integritas Penagihan",
        desc: "Kejujuran dalam penanganan faktur tagihan tunai/bilyet giro dan kepatuhan absensi lapangan.",
        pertanyaan_panduan: "Pernahkah Anda menghadapi situasi titip nota/titip tagihan dari toko? Bagaimana Anda menjaga integritas setoran harian?",
        bobot: 20
      },
      {
        key: "field_knowledge",
        label: "Penguasaan Rute & Karakter Toko",
        desc: "Pemahaman rute area Cirebon/wilayah penempatan dan pengenalan segmentasi toko.",
        pertanyaan_panduan: "Sebutkan rute toko yang biasa Anda kunjungi dan bagaimana Anda mengatur jadwal kunjungan mingguan secara efisien?",
        bobot: 20
      },
      {
        key: "target_drive",
        label: "Target Orientation & Daya Juang",
        desc: "Daya juang dan konsistensi mencapai target omzet penjualan bulanan di bawah tekanan pasar.",
        pertanyaan_panduan: "Berapa target omzet terbesar yang pernah Anda capai dan bagaimana strategi Anda saat omzet penjualan sedang lesu?",
        bobot: 20
      },
      {
        key: "conflict_check",
        label: "Pemeriksaan Bebas Konflik Industri (Alumni Distributor Cat)",
        desc: "Verifikasi riwayat perusahaan terdahulu agar tidak melanggar ketentuan non-kompetisi CV Andela Jaya.",
        pertanyaan_panduan: "Apakah Anda sebelumnya pernah bekerja di distributor cat atau memiliki keterikatan non-kompetisi dengan perusahaan sebelumnya?",
        bobot: 20
      }
    ]
  },
  {
    id: "tpl_admin",
    kategori_posisi: "Administrasi & Finance",
    posisi_target: ["Admin", "Admin Sales", "Admin Gudang", "Administrasi", "Finance", "Accounting", "Staff Administrasi", "Kasir"],
    aspek: [
      {
        key: "accuracy",
        label: "Ketelitian Data Entry & Rekonsiliasi",
        desc: "Kerapian entri faktur penjualan, pencocokan surat jalan, dan rekonsiliasi data kas/stok.",
        pertanyaan_panduan: "Bagaimana cara Anda memvalidasi selisih antara faktur penjualan dengan bukti transfer atau uang kas setoran sales?",
        bobot: 25
      },
      {
        key: "software_skill",
        label: "Penguasaan Excel & Spreadsheet",
        desc: "Kemahiran rumus VLOOKUP, SUMIFS, Pivot Table, dan kecepatan olah data laporan harian.",
        pertanyaan_panduan: "Sebutkan formula Excel yang biasa Anda pakai untuk mengolah dan merekap ribuan baris data penjualan?",
        bobot: 25
      },
      {
        key: "attitude",
        label: "Kepatuhan SOP & Kerahasiaan Dokumen",
        desc: "Disiplin mematuhi alur persetujuan faktur dan menjaga kerahasiaan data harga/piutang.",
        pertanyaan_panduan: "Bagaimana tindakan Anda jika ada pihak sales mendesak faktur dicetak tanpa approval atasan?",
        bobot: 25
      },
      {
        key: "conflict_check",
        label: "Verifikasi Bebas Konflik Industri (Alumni Distributor Cat)",
        desc: "Memastikan kandidat admin tidak berasal dari alumni distributor cat kompetitor sejenis CV Andela Jaya.",
        pertanyaan_panduan: "Di perusahaan sebelumnya, apa jenis komoditas/produk yang didistribusikan dan apakah bergerak di bidang distributor cat?",
        bobot: 25
      }
    ]
  },
  {
    id: "tpl_driver_warehouse",
    kategori_posisi: "Driver & Gudang (Logistik)",
    posisi_target: ["Driver", "Sopir", "Supir", "Staff Gudang", "Kepala Gudang", "Delivery", "Helper", "Logistik", "Ekspedisi"],
    aspek: [
      {
        key: "safety_driving",
        label: "Kepatuhan Mengemudi & Validitas SIM",
        desc: "Kepemilikan SIM A/B1/B2 aktif, kepatuhan rambu lalu lintas, dan pemahaman rute pengiriman.",
        pertanyaan_panduan: "Berapa tahun pengalaman Anda mengemudikan armada niaga box/engkel dan rute terjauh mana yang sering Anda tempuh?",
        bobot: 30
      },
      {
        key: "integrity_handling",
        label: "Integritas & Penanganan Barang Muatan",
        desc: "Kejujuran saat serah terima barang ke toko, penanganan barang retur, dan pencegahan barang pecah/rusak.",
        pertanyaan_panduan: "Bagaimana prosedur yang Anda jalankan jika barang pesanan toko ada yang rusak/bocor saat diturunkan?",
        bobot: 30
      },
      {
        key: "discipline",
        label: "Kedisiplinan Waktu & Fisik",
        desc: "Kesiapan loading pagi, stamina fisik prima, dan tanggung jawab kebersihan armada.",
        pertanyaan_panduan: "Bagaimana kesiapan fisik Anda untuk proses muat barang pagi hari dan kerja lembur jika dibutuhkan?",
        bobot: 20
      },
      {
        key: "teamwork",
        label: "Koordinasi Tim & Sikap ke Pelanggan",
        desc: "Kerja sama dengan helper/staf gudang dan kesopanan saat bertemu pemilik toko.",
        pertanyaan_panduan: "Bagaimana cara Anda berkomunikasi dengan pemilik toko saat terjadi antrean bongkar muat yang lama?",
        bobot: 20
      }
    ]
  },
  {
    id: "tpl_general",
    kategori_posisi: "Umum / Semua Posisi",
    posisi_target: ["*"],
    aspek: [
      {
        key: "komunikasi",
        label: "Komunikasi & Artikulasi",
        desc: "Kemampuan berbicara jelas, lugas, percaya diri, dan menyimak secara aktif.",
        pertanyaan_panduan: "Ceritakan latar belakang Anda dan pencapaian yang paling Anda banggakan di tempat kerja sebelumnya?",
        bobot: 20
      },
      {
        key: "attitude",
        label: "Attitude & Integritas",
        desc: "Sikap kerja, kejujuran, etika profesional, dan komitmen terhadap perusahaan.",
        pertanyaan_panduan: "Bagaimana cara Anda menyikapi perbedaan pendapat dengan atasan atau rekan kerja satu tim?",
        bobot: 20
      },
      {
        key: "technical",
        label: "Keahlian Teknis & Pemahaman Kerja",
        desc: "Penguasaan tugas pokok dan kesiapan menjalankan tanggung jawab posisi.",
        pertanyaan_panduan: "Apa kelebihan teknis utama Anda yang paling relevan untuk mendukung operasional CV Andela Jaya?",
        bobot: 20
      },
      {
        key: "motivation",
        label: "Motivasi & Daya Juang",
        desc: "Keinginan berkembang, loyalitas, dan kesiapan beradaptasi di lingkungan kerja.",
        pertanyaan_panduan: "Apa yang membuat Anda tertarik bergabung dengan CV Andela Jaya dan apa target karier Anda ke depan?",
        bobot: 20
      },
      {
        key: "culture_fit",
        label: "Culture Fit & Team Work",
        desc: "Kesesuaian dengan budaya kerja cepat, disiplin, dan gotong royong.",
        pertanyaan_panduan: "Bagaimana Anda berkoordinasi saat menghadapi beban kerja tinggi dengan batas waktu ketat?",
        bobot: 20
      }
    ]
  }
];

const LOCAL_STORAGE_KEY_PREFIX = "aj_ats_config_";

/**
 * Memuat Master Konfigurasi ATS (Sinonim, Aturan Bobot, Eksklusi Industri, Template Interview)
 * dari Firestore dengan fallback ke localStorage / Default
 */
export async function loadAtsMasterConfig() {
  const result = {
    synonyms: JSON.parse(JSON.stringify(DEFAULT_SYNONYMS)),
    ats_rules: JSON.parse(JSON.stringify(DEFAULT_ATS_RULES)),
    industry_exclusions: JSON.parse(JSON.stringify(DEFAULT_INDUSTRY_EXCLUSIONS)),
    interview_templates: JSON.parse(JSON.stringify(DEFAULT_INTERVIEW_TEMPLATES)),
    ats_pass_threshold: 70
  };

  // 1. Coba dari LocalStorage terlebih dahulu (fast cache)
  try {
    const localSyn = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + "synonyms");
    if (localSyn) result.synonyms = JSON.parse(localSyn);

    const localRules = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + "ats_rules");
    if (localRules) result.ats_rules = JSON.parse(localRules);

    const localExcl = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + "industry_exclusions");
    if (localExcl) result.industry_exclusions = JSON.parse(localExcl);

    const localTpls = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + "interview_templates");
    if (localTpls) result.interview_templates = JSON.parse(localTpls);

    const localThresh = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + "ats_pass_threshold");
    if (localThresh) result.ats_pass_threshold = parseInt(localThresh, 10) || 70;
  } catch (e) {
    console.warn("Gagal membaca ats config dari localStorage:", e);
  }

  // 2. Coba sync dari Firestore doc `app_settings/ats_config_master`
  try {
    if (db) {
      const docRef = doc(db, "app_settings", "ats_config_master");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData.synonyms && typeof cloudData.synonyms === "object") {
          result.synonyms = cloudData.synonyms;
          localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + "synonyms", JSON.stringify(result.synonyms));
        }
        if (cloudData.ats_rules && Array.isArray(cloudData.ats_rules)) {
          result.ats_rules = cloudData.ats_rules;
          localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + "ats_rules", JSON.stringify(result.ats_rules));
        }
        if (cloudData.industry_exclusions && typeof cloudData.industry_exclusions === "object") {
          result.industry_exclusions = cloudData.industry_exclusions;
          localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + "industry_exclusions", JSON.stringify(result.industry_exclusions));
        }
        if (cloudData.interview_templates && Array.isArray(cloudData.interview_templates)) {
          result.interview_templates = cloudData.interview_templates;
          localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + "interview_templates", JSON.stringify(result.interview_templates));
        }
        if (typeof cloudData.ats_pass_threshold === "number") {
          result.ats_pass_threshold = cloudData.ats_pass_threshold;
          localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + "ats_pass_threshold", String(result.ats_pass_threshold));
        }
      }
    }
  } catch (e) {
    console.warn("Sync cloud ats_config_master info:", e.message);
  }

  return result;
}

/**
 * Menyimpan bagian konfigurasi ATS ke Firestore dan LocalStorage
 */
export async function saveAtsMasterConfig(configType, payload) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + configType, JSON.stringify(payload));
  } catch (e) {
    console.warn("Gagal menyimpan ke localStorage:", e);
  }

  try {
    if (db) {
      const docRef = doc(db, "app_settings", "ats_config_master");
      await setDoc(docRef, {
        [configType]: payload,
        updated_at: new Date().toISOString()
      }, { merge: true });
    }
  } catch (e) {
    console.warn("Gagal update Firestore ats_config_master:", e);
  }
}

/**
 * Reset konfigurasi spesifik ke nilai default
 */
export async function resetAtsMasterConfig(configType) {
  let defaultVal = null;
  if (configType === "synonyms") defaultVal = DEFAULT_SYNONYMS;
  else if (configType === "ats_rules") defaultVal = DEFAULT_ATS_RULES;
  else if (configType === "industry_exclusions") defaultVal = DEFAULT_INDUSTRY_EXCLUSIONS;
  else if (configType === "interview_templates") defaultVal = DEFAULT_INTERVIEW_TEMPLATES;
  else if (configType === "ats_pass_threshold") defaultVal = 70;

  if (defaultVal !== null) {
    await saveAtsMasterConfig(configType, defaultVal);
  }
  return defaultVal;
}

export const CITIES_DICTIONARY = [
  "Cirebon", "Kota Cirebon", "Kabupaten Cirebon", "Kuningan", "Majalengka", "Indramayu",
  "Brebes", "Tegal", "Kota Tegal", "Pemalang", "Pekalongan", "Subang", "Sumedang",
  "Bandung", "Kota Bandung", "Kabupaten Bandung", "Bekasi", "Bogor", "Depok", "Jakarta",
  "Jakarta Timur", "Jakarta Barat", "Jakarta Selatan", "Jakarta Pusat", "Jakarta Utara",
  "Tangerang", "Serang", "Semarang", "Yogyakarta", "Surabaya"
];

export const EDUCATION_LEVELS = {
  "SMA": { level: 1, labels: ["SMA", "SMU", "SLTA", "SEDERAJAT"] },
  "SMK": { level: 1, labels: ["SMK", "STM", "SMEA", "KEJURUAN"] },
  "D3": { level: 2, labels: ["D3", "D-3", "DIPLOMA 3", "DIPLOMA III", "A.MD"] },
  "D4": { level: 3, labels: ["D4", "D-4", "DIPLOMA 4", "DIPLOMA IV", "SARJANA TERAPAN", "S.TR"] },
  "S1": { level: 3, labels: ["S1", "S-1", "SARJANA", "STRATA 1", "BACHELOR", "S.E", "S.KOM", "S.SOS", "S.T", "S.M", "S.SI", "S.PD", "S.H"] },
  "S2": { level: 4, labels: ["S2", "S-2", "MAGISTER", "MASTER", "STRATA 2", "M.M", "M.KOM", "M.T", "M.BA"] }
};

/**
 * Ekstraksi teks dari file PDF (menggunakan pdfjs-dist)
 */
export async function extractTextFromPdfFile(file) {
  if (!window['pdfjs-dist/build/pdf']) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Gagal memuat library PDF.js"));
      document.head.appendChild(script);
    });
  }

  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  const maxPages = Math.min(pdf.numPages, 10);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
}

/**
 * Ekstraksi teks dari file DOCX
 */
export async function extractTextFromDocxFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const textDecoder = new TextDecoder('utf-8');
    const binaryString = textDecoder.decode(arrayBuffer);
    
    // Cari tag XML teks Word <w:t>...</w:t>
    const matches = binaryString.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (matches && matches.length > 0) {
      return matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
    }

    // Fallback: hapus karakter non-printable
    return binaryString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .substring(0, 15000);
  } catch (e) {
    console.warn("Gagal mengekstrak teks docx:", e);
    return "";
  }
}

/**
 * Parser Kontak & Biodata Dasar
 */
export function extractBasicInfo(rawText, filename = "") {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  // 1. Email Regex
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : "";

  // 2. Phone / WhatsApp Regex (+62 / 08 / dsb)
  const phoneMatch = rawText.match(/(?:\+62|62|08)[0-9\s\-]{8,15}/);
  let phone = phoneMatch ? phoneMatch[0].replace(/[\s\-]/g, "") : "";
  if (phone.startsWith("08")) phone = "08" + phone.slice(2);
  else if (phone.startsWith("62")) phone = "0" + phone.slice(2);

  // 3. Nama Kandidat (dari baris awal atau nama file)
  let nama = "";
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    // Abaikan header umum seperti 'CURRICULUM VITAE', 'RESUME', dll
    if (/curriculum\s+vitae|resume|cv|biodata|data\s+pribadi/i.test(line)) continue;
    if (line.includes("@") || /(?:\+62|08)/.test(line)) continue;
    if (line.length >= 3 && line.length <= 45 && /^[a-zA-Z\s.,'\-]+$/.test(line)) {
      nama = line;
      break;
    }
  }

  // Fallback nama dari nama file jika belum ketemu
  if (!nama && filename) {
    const cleanFile = filename.replace(/\.(pdf|docx|doc)$/i, "")
      .replace(/^(cv|resume|lamaran)[_\-\s]+/i, "")
      .replace(/[_\-]+/g, " ")
      .trim();
    if (cleanFile.length >= 3) {
      nama = cleanFile.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
  }
  if (!nama) nama = "Pelamar Baru";

  // 4. Domisili / Kota
  let domisili = "";
  const lowerText = rawText.toLowerCase();
  for (const city of CITIES_DICTIONARY) {
    if (lowerText.includes(city.toLowerCase())) {
      domisili = city;
      break;
    }
  }

  // 5. SIM (Surat Izin Mengemudi)
  const simFound = [];
  if (/\bsim\s*c\b/i.test(rawText)) simFound.push("SIM C");
  if (/\bsim\s*a\b/i.test(rawText)) simFound.push("SIM A");
  if (/\bsim\s*b1\b|\bsim\s*b\s*1\b|\bsim\s*b\s*i\b/i.test(rawText)) simFound.push("SIM B1");
  if (/\bsim\s*b2\b|\bsim\s*b\s*2\b|\bsim\s*b\s*ii\b/i.test(rawText)) simFound.push("SIM B2");

  // 6. Pendidikan
  let pendidikan = "SMA";
  let jurusan = "";
  let institusi = "";
  
  if (/\b(?:s2|magister|master)\b/i.test(rawText)) pendidikan = "S2";
  else if (/\b(?:s1|sarjana|strata\s*1|bachelor)\b/i.test(rawText)) pendidikan = "S1";
  else if (/\b(?:d4|diploma\s*4)\b/i.test(rawText)) pendidikan = "D4";
  else if (/\b(?:d3|diploma\s*3|ahli\s*madya)\b/i.test(rawText)) pendidikan = "D3";
  else if (/\b(?:smk|kejuruan|stm|smea)\b/i.test(rawText)) pendidikan = "SMK";
  else if (/\b(?:sma|smu|slta)\b/i.test(rawText)) pendidikan = "SMA";

  // Jurusan umum
  const majorPatterns = [
    /jurusan\s*:\s*([a-zA-Z\s]+)/i,
    /program\s+studi\s*:\s*([a-zA-Z\s]+)/i,
    /(?:s1|d3|d4|s2|sarjana|smk)\s+([a-zA-Z\s]{4,30})/i,
    /(manajemen|akuntansi|teknik\s+informatika|sistem\s+informasi|ilmu\s+komunikasi|hukum|teknik\s+mesin|teknik\s+industri|pemasaran|bisnis|administrasi\s+bisnis|administrasi\s+perkantoran|ekonomi|keuangan|psikologi|rekayasa\s+perangkat\s+lunak|multimedia)/i
  ];
  for (const pat of majorPatterns) {
    const m = rawText.match(pat);
    if (m && m[1]) {
      jurusan = m[1].trim().replace(/[\r\n]+/g, " ");
      if (jurusan.length <= 40) break;
    }
  }

  // Nama Institusi Pendidikan
  const instPatterns = [
    /(?:universitas|institut|politeknik|stie|stmik|sekolah\s+tinggi|akpol|akmil|akademi)\s+([a-zA-Z0-9\s]{3,35})/i,
    /(?:sma\s*(?:n|negeri)?\s*\d+|smk\s*(?:n|negeri)?\s*\d+|man\s*\d+|smu\s*\d+)\s*([a-zA-Z0-9\s]{0,25})/i
  ];
  for (const pat of instPatterns) {
    const m = rawText.match(pat);
    if (m) {
      institusi = m[0].trim().replace(/[\r\n]+/g, " ");
      if (institusi.length <= 50) break;
    }
  }

  // 7. Pengalaman Kerja & Perhitungan Tahun (TIDAK MEMASUKKAN RIWAYAT PENDIDIKAN)
  const expData = calculateExperience(rawText);

  return {
    nama,
    email,
    no_hp: phone,
    domisili: domisili || "Tidak Tercantum",
    pendidikan_tertinggi: pendidikan,
    jurusan: jurusan || "-",
    institusi: institusi || "-",
    sim: simFound,
    total_pengalaman_tahun: expData.totalYears,
    pengalaman_sales_tahun: expData.salesYears,
    riwayat_kerja: expData.roles,
    raw_text: rawText
  };
}

/**
 * Kalkulator Pengalaman Kerja & Rentang Waktu
 * CATATAN PENTING: Riwayat pendidikan (Universitas, SMA, SMK, Kuliah, Sekolah, dll)
 * TIDAK BOLEH dihitung sebagai pengalaman kerja!
 */
export function calculateExperience(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { totalYears: 0, salesYears: 0, roles: [] };
  }

  let totalYears = 0;
  let salesYears = 0;
  const roles = [];
  const currentYear = new Date().getFullYear();

  // Pattern tahun misalnya: 2019 - 2023, 2021 s/d Sekarang, Jan 2020 - Des 2022
  const dateRangeRegex = /(?:(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)[a-z]*[\s.,]*)?([12][09][0-9]{2})\s*(?:-|–|—|s\/d|to|sampai|hingga)\s*(?:(jan(?:uari)?|feb(?:ruari)?|mar(?:et)?|apr(?:il)?|mei|may|jun(?:i)?|jul(?:i)?|agu(?:stus)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)[a-z]*[\s.,]*)?([12][09][0-9]{2}|sekarang|present|now|saat\s+ini)/gi;

  // Keyword penanda riwayat pendidikan (TIDAK BOLEH DIHITUNG SEBAGAI KERJA)
  const isEduSnippet = (text) => {
    const t = text.toLowerCase();
    const eduKeywords = [
      "universitas", "univ.", " univ ", "institut", "politeknik", "stie", "stmik", "akpol", "akmil",
      "sekolah tinggi", "sekolah menengah", "sekolah dasar", "sma ", "smk ", "smp ", "sd ", "smu ",
      "slta", "sltp", "madrasah", "aliyah", "tsanawiyah", "pesantren", "college", "university",
      "high school", "vocational", "sarjana", "diploma", "magister", "doktor", "bachelor", "master",
      "jurusan", "program studi", "prodi", "fakultas", "mahasiswa", "mahasiswi", "siswa", "siswi",
      "alumni", "ipk", "gpa", "skripsi", "tesis", "tugas akhir", "cumlaude", "pendidikan formal",
      "pendidikan terakhir", "riwayat pendidikan", "latar belakang pendidikan", "education", "academic background"
    ];
    return eduKeywords.some(k => t.includes(k));
  };

  // Keyword penanda pekerjaan nyata
  const isWorkRoleSnippet = (text) => {
    const t = text.toLowerCase();
    const workKeywords = [
      "pt ", "pt.", "cv ", "cv.", "ud ", "ud.", "tbk", "corp", "inc", "ltd", "perusahaan", "company",
      "kantor", "cabang", "toko", "outlet", "distributor", "retail", "posisi", "jabatan", "pekerjaan",
      "sales", "canvasser", "marketing", "supervisor", "spv", "manager", "manajer", "staff", "staf",
      "admin", "administrasi", "officer", "operator", "driver", "sopir", "helper", "kenek", "gudang",
      "kasir", "teller", "teknisi", "leader", "team lead", "koordinator", "head", "direktur",
      "account executive", "field", "freelance", "kontrak", "karyawan", "pegawai", "magang", "intern",
      "tanggung jawab", "deskripsi kerja", "job desc", "jobdesk", "melayani", "mencapai target", "omset", "omzet"
    ];
    return workKeywords.some(k => t.includes(k));
  };

  // 1. Pecah teks menjadi baris dan segmen bagian (Pendidikan vs Pengalaman Kerja)
  const lines = rawText.split(/\r?\n/);
  let currentSection = "GENERAL"; // "EDUCATION", "WORK", "ORGANIZATION", "SKILLS", "GENERAL"

  const sectionBlocks = {
    work: [],
    education: [],
    other: []
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // Deteksi Header Bagian Pengalaman Kerja
    if (/^(?:riwayat\s+pekerjaan|pengalaman\s+kerja|pengalaman\s+bekerja|pengalaman\s+profesional|riwayat\s+karir|jejak\s+karir|work\s+experience|professional\s+experience|employment\s+history|career\s+history|job\s+experience|pengalaman\s+kerja\s*(?:&|dan)\s*organisasi)\b/i.test(lowerLine) ||
        (lowerLine.length < 35 && /^(?:pengalaman|experience|riwayat\s+kerja)$/i.test(lowerLine))) {
      currentSection = "WORK";
      continue;
    }
    
    // Deteksi Header Bagian Pendidikan
    if (/^(?:riwayat\s+pendidikan|pendidikan\s+formal|pendidikan\s+non-formal|latar\s+belakang\s+pendidikan|riwayat\s+sekolah|data\s+pendidikan|kualifikasi\s+pendidikan|jenjang\s+pendidikan|education|educational\s+background|academic\s+background|pendidikan)\b/i.test(lowerLine) ||
        (lowerLine.length < 35 && /^(?:pendidikan|education|edukasi|akademik)$/i.test(lowerLine))) {
      currentSection = "EDUCATION";
      continue;
    }

    // Deteksi Header Bagian Lain (Organisasi, Keahlian, Sertifikasi, Kontak, Profil)
    if (/^(?:keahlian|keterampilan|skills|organisasi|organizational\s+experience|sertifikasi|sertifikat|certifications?|pelatihan|training|tentang\s+saya|about\s+me|ringkasan|summary|profil|profile|kontak|contact|referensi|reference|bahasa|languages)\b/i.test(lowerLine)) {
      currentSection = "OTHER";
      continue;
    }

    if (currentSection === "WORK") {
      sectionBlocks.work.push({ line, index: i });
    } else if (currentSection === "EDUCATION") {
      sectionBlocks.education.push({ line, index: i });
    } else {
      sectionBlocks.other.push({ line, index: i });
    }
  }

  const workSpans = [];

  // Helper untuk mengevaluasi rentang tahun
  const processMatch = (textContext, matchResult, fullRaw) => {
    const startYr = parseInt(matchResult[2], 10);
    let endYr = currentYear;
    if (matchResult[4] && /^[0-9]{4}$/.test(matchResult[4])) {
      endYr = parseInt(matchResult[4], 10);
    }
    
    if (startYr >= 1990 && startYr <= currentYear && endYr >= startYr && endYr <= currentYear + 1) {
      // Periksa apakah konteks teks di sekitarnya mengindikasikan sekolah / pendidikan
      const isEdu = isEduSnippet(textContext);
      const isWork = isWorkRoleSnippet(textContext);

      // JIKA teks tersebut adalah riwayat pendidikan dan tidak memiliki konteks pekerjaan kantor/sales nyata -> TOLAK!
      if (isEdu && !isWork) {
        return null; // Abaikan masa pendidikan
      }

      const diff = Math.max(1, endYr - startYr);
      const isSales = /sales|marketing|canvass|account\s+executive|penjualan|pemasaran|telemarketing|promoter/i.test(textContext);

      return {
        start: startYr,
        end: endYr,
        duration: diff,
        isSales,
        snippet: textContext.replace(/[\r\n]+/g, " ").trim().substring(0, 120)
      };
    }
    return null;
  };

  // 2. Jika ada blok bagian WORK yang terdeteksi, prioritaskan scan pada blok WORK
  if (sectionBlocks.work.length > 0) {
    const workText = sectionBlocks.work.map(w => w.line).join("\n");
    let match;
    while ((match = dateRangeRegex.exec(workText)) !== null) {
      const idx = match.index;
      const snippet = workText.substring(Math.max(0, idx - 100), Math.min(workText.length, idx + 140));
      const res = processMatch(snippet, match, workText);
      if (res) {
        workSpans.push(res);
      }
    }
  }

  // 3. Jika tidak ada blok WORK khusus atau belum menemukan pengalaman kerja, scan seluruh teks
  // TETAPI secara ketat mengecualikan baris/konteks yang berada di bagian riwayat pendidikan
  if (workSpans.length === 0) {
    let match;
    dateRangeRegex.lastIndex = 0;
    while ((match = dateRangeRegex.exec(rawText)) !== null) {
      const idx = match.index;
      const snippet = rawText.substring(Math.max(0, idx - 120), Math.min(rawText.length, idx + 150));
      
      // Filter ketat: jika snippet berada di konteks pendidikan, tolak
      if (isEduSnippet(snippet) && !isWorkRoleSnippet(snippet)) {
        continue;
      }

      // Pastikan ada indikasi pekerjaan atau setidaknya tidak ada kata universitas/sekolah
      const res = processMatch(snippet, match, rawText);
      if (res) {
        workSpans.push(res);
      }
    }
  }

  // 4. Susun daftar roles dan hitung total tahun tanpa overlap
  if (workSpans.length > 0) {
    for (const span of workSpans) {
      roles.push({
        periode: `${span.start} - ${span.end === currentYear ? 'Sekarang' : span.end}`,
        durasi_tahun: span.duration,
        is_sales: span.isSales,
        cuplikan: span.snippet
      });
      if (span.isSales) {
        salesYears += span.duration;
      }
    }

    // Hindari double-count overlap
    workSpans.sort((a, b) => a.start - b.start);
    let mergedYears = 0;
    let currStart = -1;
    let currEnd = -1;

    for (const span of workSpans) {
      if (currStart === -1) {
        currStart = span.start;
        currEnd = span.end;
      } else if (span.start <= currEnd) {
        currEnd = Math.max(currEnd, span.end);
      } else {
        mergedYears += Math.max(1, currEnd - currStart);
        currStart = span.start;
        currEnd = span.end;
      }
    }
    if (currStart !== -1) {
      mergedYears += Math.max(1, currEnd - currStart);
    }

    totalYears = Math.min(mergedYears, 35);
  } else {
    // Fallback pencarian kalimat pengalaman kerja (contoh: "pengalaman kerja 2 tahun")
    // Hindari mencocokkan "pendidikan 3 tahun" atau "kuliah 4 tahun"
    const expTextMatch = rawText.match(/(?:pengalaman\s+kerja|pengalaman\s+bekerja|work\s+experience|pengalaman\s+di\s+bidang)[^0-9]{1,20}([0-9]{1,2})\s*(?:tahun|thn|years)/i);
    if (expTextMatch) {
      totalYears = parseInt(expTextMatch[1], 10);
      if (totalYears > 35) totalYears = 0;
      if (/sales|marketing|penjualan/i.test(expTextMatch[0])) {
        salesYears = totalYears;
      }
    }
  }

  salesYears = Math.min(salesYears, totalYears);

  return {
    totalYears: totalYears || 0,
    salesYears: salesYears || 0,
    roles
  };
}

/**
 * Helper Pencocokan Sinonim & Keyword
 */
export function matchKeywords(text, targetKeywords, customSynonyms = {}) {
  const lower = text.toLowerCase();
  const matched = [];
  const missing = [];
  const synMap = { ...DEFAULT_SYNONYMS, ...customSynonyms };

  for (const kw of targetKeywords) {
    const cleanKw = kw.trim().toLowerCase();
    if (!cleanKw) continue;

    const synList = synMap[cleanKw] || [cleanKw];
    let found = false;
    let foundTerm = "";

    for (const s of synList) {
      const termRegex = new RegExp(`\\b${s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (termRegex.test(lower) || lower.includes(s)) {
        found = true;
        foundTerm = s;
        break;
      }
    }

    if (found) {
      matched.push({ keyword: kw, matchedTerm: foundTerm });
    } else {
      missing.push(kw);
    }
  }

  return { matched, missing };
}

/**
 * Helper Deteksi Larangan / Eksklusi Industri & Anti-Kompetitor
 * (Misal: Posisi Sales & Admin dilarang dari alumni Distributor Cat / Kompetitor Sejenis)
 */
export function detectIndustryExclusion(rawText = "", candidate = {}, vacancy = {}, customExclusionConfig = null) {
  const config = customExclusionConfig || vacancy?.industry_exclusions || DEFAULT_INDUSTRY_EXCLUSIONS;
  if (!config || config.enabled === false) {
    return { detected: false, matched_keywords: [], reason: "" };
  }

  const candPosition = (candidate.posisi_dilamar || vacancy?.posisi || "").toLowerCase();
  const affectedList = (config.affected_positions || []).map(p => p.toLowerCase().trim()).filter(Boolean);
  
  // Periksa apakah posisi yang dilamar termasuk yang terkena aturan eksklusi
  const isPositionAffected = affectedList.length === 0 || affectedList.some(p => 
    p === "*" || candPosition.includes(p) || (p === "sales" && /sales|canvass|marketing|penjualan/i.test(candPosition)) || (p === "admin" && /admin|administrasi|finance|accounting/i.test(candPosition))
  );

  if (!isPositionAffected) {
    return { detected: false, matched_keywords: [], reason: "Posisi tidak terikat aturan eksklusi industri" };
  }

  const textToScan = ((candidate.raw_text || rawText || "") + " " + JSON.stringify(candidate.riwayat_kerja || [])).toLowerCase();
  const keywords = config.keywords || DEFAULT_INDUSTRY_EXCLUSIONS.keywords;
  const matchedKeywords = [];

  for (const kw of keywords) {
    const cleanKw = kw.trim().toLowerCase();
    if (!cleanKw) continue;
    const regex = new RegExp(`\\b${cleanKw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(textToScan) || textToScan.includes(cleanKw)) {
      matchedKeywords.push(kw);
    }
  }

  if (matchedKeywords.length > 0) {
    return {
      detected: true,
      matched_keywords: matchedKeywords,
      affected_position: candidate.posisi_dilamar || vacancy?.posisi || "Posisi Terkait",
      action: config.action || "penalty_flag",
      penalty_points: parseInt(config.penalty_points || 25, 10),
      reason: config.warning_message || `Terindikasi memiliki riwayat dari industri yang dilarang (${matchedKeywords.slice(0, 3).join(", ")})`
    };
  }

  return { detected: false, matched_keywords: [], reason: "" };
}

/**
 * CORE ATS SCORING & EVALUATION ENGINE
 * Menerima kandidat dan aturan lowongan, menghitung skor terbobot dan menghasilkan evidence audit.
 */
export function evaluateCandidateATS(candidate, vacancy = {}, customSynonyms = {}, customSettings = {}) {
  const rawText = candidate.raw_text || "";
  const lowerText = rawText.toLowerCase();

  // Aturan bobot: utamakan vacancy -> customSettings -> default
  const rules = (vacancy?.ats_rules && vacancy.ats_rules.length > 0) 
    ? vacancy.ats_rules 
    : (customSettings?.ats_rules || DEFAULT_ATS_RULES);

  const breakdown = [];
  const evidenceMatches = [];
  const potentialGaps = [];
  let totalScore = 0;
  let mandatoryPassed = true;

  // 1. Deteksi Eksklusi Industri / Anti-Kompetitor (Contoh: Sales/Admin dilarang dari Alumni Distributor Cat)
  const exclusionConfig = vacancy?.industry_exclusions || customSettings?.industry_exclusions || DEFAULT_INDUSTRY_EXCLUSIONS;
  const exclusionResult = detectIndustryExclusion(rawText, candidate, vacancy, exclusionConfig);

  // Persiapan data lowongan
  const minEdu = (vacancy?.pendidikan_min || "SMA").toUpperCase();
  const minExp = parseInt(vacancy?.pengalaman_min || 0, 10);
  const reqSim = vacancy?.sim_required || ["SIM C"];
  const targetLocation = (vacancy?.cabang || vacancy?.penempatan || "Cirebon").toLowerCase();
  const targetSkills = vacancy?.skills || ["Sales", "Negotiation", "Canvassing", "Komunikasi"];
  const targetIndustry = vacancy?.industri_relevan || ["Distributor", "FMCG", "Bahan Bangunan", "Retail"];

  for (const rule of rules) {
    const bobot = parseFloat(rule.bobot) || 0;
    let criterionScore = 0; // 0 - 100%
    let evidence = "";
    let gap = "";

    switch (rule.key || rule.kriteria.toLowerCase()) {
      case "pendidikan": {
        const candEdu = (candidate.pendidikan_tertinggi || "SMA").toUpperCase();
        const candLevel = EDUCATION_LEVELS[candEdu]?.level || 1;
        const targetLevel = EDUCATION_LEVELS[minEdu]?.level || 1;

        if (candLevel >= targetLevel) {
          criterionScore = 100;
          evidence = `Pendidikan "${candEdu}" memenuhi syarat minimal "${minEdu}"`;
          evidenceMatches.push(`✓ Pendidikan: ${candEdu} (Min. ${minEdu})`);
        } else {
          criterionScore = Math.max(20, Math.round((candLevel / targetLevel) * 70));
          gap = `Pendidikan "${candEdu}" berada di bawah syarat minimal "${minEdu}"`;
          potentialGaps.push(`Pendidikan (${candEdu}) di bawah syarat (${minEdu})`);
          if (rule.mandatory) mandatoryPassed = false;
        }
        break;
      }

      case "pengalaman":
      case "pengalaman kerja": {
        const candExp = candidate.total_pengalaman_tahun || 0;
        if (minExp === 0 || candExp >= minExp) {
          criterionScore = 100;
          evidence = `Pengalaman kerja total ${candExp} tahun (Target: ≥ ${minExp} tahun)`;
          evidenceMatches.push(`✓ Pengalaman Kerja: ${candExp} Tahun (Target: ≥ ${minExp} thn)`);
        } else if (candExp > 0) {
          criterionScore = Math.round((candExp / minExp) * 80);
          gap = `Pengalaman ${candExp} tahun kurang dari target ${minExp} tahun`;
          potentialGaps.push(`Pengalaman kerja (${candExp} thn) kurang dari ${minExp} tahun`);
          if (rule.mandatory && candExp === 0) mandatoryPassed = false;
        } else {
          criterionScore = 0;
          gap = `Tidak ditemukan riwayat pengalaman kerja (Target: ${minExp} tahun)`;
          potentialGaps.push(`Pengalaman kerja tidak ditemukan dalam CV`);
          if (rule.mandatory) mandatoryPassed = false;
        }
        break;
      }

      case "sim":
      case "sim c":
      case "sim c / mengemudi": {
        const candSims = candidate.sim || [];
        const requiredSim = Array.isArray(reqSim) ? reqSim : [reqSim];
        const hasSim = requiredSim.length === 0 || requiredSim.some(s => candSims.includes(s) || lowerText.includes(s.toLowerCase()));

        if (hasSim) {
          criterionScore = 100;
          evidence = `Memiliki ${candSims.join(", ") || "SIM yang dipersyaratkan"}`;
          evidenceMatches.push(`✓ Surat Izin Mengemudi: ${candSims.join(", ") || "Terpenuhi"}`);
        } else {
          criterionScore = 0;
          gap = `Persyaratan ${requiredSim.join(", ")} tidak ditemukan dalam CV`;
          potentialGaps.push(`${requiredSim.join(", ")} tidak ditemukan dalam CV`);
          if (rule.mandatory) mandatoryPassed = false;
        }
        break;
      }

      case "domisili":
      case "domisili & penempatan": {
        const candDom = (candidate.domisili || "").toLowerCase();
        const isLocMatch = candDom.includes(targetLocation) || lowerText.includes(targetLocation);

        if (isLocMatch) {
          criterionScore = 100;
          evidence = `Domisili / Lokasi sesuai penempatan: ${candidate.domisili || targetLocation}`;
          evidenceMatches.push(`✓ Domisili / Penempatan: ${candidate.domisili || targetLocation}`);
        } else if (candidate.domisili && candidate.domisili !== "Tidak Tercantum") {
          criterionScore = 50; // Domisili lain tapi tercantum
          gap = `Domisili (${candidate.domisili}) berbeda dengan target cabang (${targetLocation})`;
          potentialGaps.push(`Domisili (${candidate.domisili}) di luar area utama (${targetLocation})`);
        } else {
          criterionScore = 30;
          gap = `Domisili tidak tercantum jelas dalam CV`;
          potentialGaps.push(`Domisili area ${targetLocation} tidak ditemukan dalam CV`);
        }
        break;
      }

      case "skills":
      case "keahlian utama / sales": {
        const { matched, missing } = matchKeywords(rawText, targetSkills, customSynonyms);
        if (targetSkills.length === 0) {
          criterionScore = 100;
        } else {
          criterionScore = Math.round((matched.length / targetSkills.length) * 100);
        }

        if (matched.length > 0) {
          evidence = `Ditemukan skill: ${matched.map(m => m.keyword).join(", ")}`;
          evidenceMatches.push(`✓ Skill Relevan: ${matched.map(m => m.keyword).join(", ")}`);
        }
        if (missing.length > 0) {
          gap = `Skill tidak ditemukan: ${missing.join(", ")}`;
          potentialGaps.push(`Skill ${missing.slice(0, 3).join(", ")} tidak ditemukan dalam CV`);
        }
        break;
      }

      case "software":
      case "software & excel": {
        const { matched, missing } = matchKeywords(rawText, ["Excel", "Microsoft Office", "Spreadsheet", "Admin"], customSynonyms);
        if (matched.length > 0) {
          criterionScore = 100;
          evidence = `Menguasai software perkantoran & spreadsheet`;
          evidenceMatches.push(`✓ Software & Tool: ${matched.map(m => m.keyword).join(", ")}`);
        } else {
          criterionScore = 20;
          gap = `Penguasaan Microsoft Excel / Software tidak tertulis spesifik`;
          potentialGaps.push(`Software / Excel tidak disebutkan dalam CV`);
        }
        break;
      }

      case "industri":
      case "pengalaman industri relevan": {
        const { matched, missing } = matchKeywords(rawText, targetIndustry, customSynonyms);
        if (matched.length > 0) {
          criterionScore = 100;
          evidence = `Memiliki latar belakang industri relevan (${matched.map(m => m.keyword).join(", ")})`;
          evidenceMatches.push(`✓ Industri Relevan: ${matched.map(m => m.keyword).join(", ")}`);
        } else {
          criterionScore = 40;
          gap = `Belum memiliki catatan di industri sejenis (${targetIndustry.slice(0, 2).join(", ")})`;
          potentialGaps.push(`Industri ${targetIndustry.slice(0, 2).join(", ")} tidak ditemukan dalam CV`);
        }
        break;
      }

      default: {
        criterionScore = 75;
        evidence = "Kriteria evaluasi umum";
        break;
      }
    }

    const earnedPoints = (criterionScore / 100) * bobot;
    totalScore += earnedPoints;

    breakdown.push({
      kriteria: rule.kriteria,
      bobot,
      score_percent: criterionScore,
      earned_points: Math.round(earnedPoints * 10) / 10,
      max_points: bobot,
      mandatory: !!rule.mandatory,
      evidence,
      gap
    });
  }

  // Normalisasi skor dasar 0 - 100
  let finalScore = Math.min(100, Math.max(0, Math.round(totalScore)));

  // Terapkan konsekuensi eksklusi industri jika terdeteksi
  let hasExclusionWarning = false;
  if (exclusionResult.detected) {
    hasExclusionWarning = true;
    const matchedStr = exclusionResult.matched_keywords.join(", ");

    if (exclusionResult.action === "auto_reject") {
      mandatoryPassed = false;
      potentialGaps.unshift(`⚠️ DISKUALIFIKASI ATURAN INDUSTRI: Terdeteksi kata kunci terlarang [${matchedStr}] untuk posisi ${exclusionResult.affected_position}`);
    } else if (exclusionResult.action === "penalty_flag") {
      const penalty = exclusionResult.penalty_points || 25;
      finalScore = Math.max(0, finalScore - penalty);
      potentialGaps.unshift(`⚠️ PENALTI EKSKLUSI INDUSTRI (-${penalty}%): Terindikasi alumni distributor cat/kompetitor [${matchedStr}]`);
    } else {
      potentialGaps.unshift(`⚠️ PERINGATAN REVIEW HRD: Terdeteksi latar belakang industri [${matchedStr}]`);
    }
  }

  // Klasifikasi ATS sesuai spesifikasi PRD & Desain
  let klasifikasi = "Not Recommended";
  let badgeClass = "bg-red-100 text-red-800 border-red-200";
  let statusSaran = "Review";

  if (exclusionResult.detected && exclusionResult.action === "auto_reject") {
    klasifikasi = "Diskualifikasi (Eksklusi Industri)";
    badgeClass = "bg-rose-100 text-rose-800 border-rose-200";
    statusSaran = "Rejected";
  } else if (finalScore >= 90) {
    klasifikasi = "Highly Recommended";
    badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
    statusSaran = "Shortlist";
  } else if (finalScore >= 80) {
    klasifikasi = "Recommended";
    badgeClass = "bg-teal-100 text-teal-800 border-teal-200";
    statusSaran = "Shortlist";
  } else if (finalScore >= 70) {
    klasifikasi = "HR Review";
    badgeClass = "bg-blue-100 text-blue-800 border-blue-200";
    statusSaran = "Review";
  } else if (finalScore >= 60) {
    klasifikasi = "Reserve";
    badgeClass = "bg-amber-100 text-amber-800 border-amber-200";
    statusSaran = "Review";
  } else {
    klasifikasi = "Not Recommended";
    badgeClass = "bg-rose-100 text-rose-800 border-rose-200";
    statusSaran = "Rejected";
  }

  const passThreshold = vacancy?.ats_pass_threshold || customSettings?.ats_pass_threshold || 70;
  const isLolosThreshold = finalScore >= passThreshold && mandatoryPassed;

  return {
    skor_ats: finalScore,
    klasifikasi,
    badge_class: badgeClass,
    status_saran: statusSaran,
    is_mandatory_passed: mandatoryPassed,
    is_lolos_threshold: isLolosThreshold,
    has_exclusion_warning: hasExclusionWarning,
    exclusion_details: exclusionResult,
    breakdown,
    evidence_matches: evidenceMatches,
    potential_gaps: potentialGaps,
    timestamp_scoring: new Date().toISOString()
  };
}
