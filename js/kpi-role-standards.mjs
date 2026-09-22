const normalize = value => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const q = (aspek, indikator, bobot, source = "BUKTI_DAN_VALIDASI_ATASAN", unit = "%") => ({
  aspek, indikator, bobot, nilai_diberikan: 0, source, unit, cap: 120, evidence_required: true
});

const standard = (key, name, priority, match, questions, extra = {}) => ({
  key, name: `Standar KPI — ${name}`, priority, match, questions,
  version: "2026.1", recommendedCycle: "BULANAN", ...extra
});

export const KPI_ROLE_STANDARDS = [
  standard("general_manager", "General Manager", 120, { positions: ["GENERAL MANAGER", "GM"] }, [
    q("Hasil Bisnis", "Pencapaian sasaran perusahaan dan profitabilitas", 30), q("Strategi", "Eksekusi prioritas strategis lintas cabang", 20),
    q("Kepemimpinan", "Kualitas keputusan, delegasi, dan pengembangan pimpinan", 20), q("Tata Kelola", "Kepatuhan, manajemen risiko, dan akurasi laporan", 15),
    q("Kolaborasi", "Sinergi lintas fungsi dan penyelesaian hambatan", 10), q("Kedisiplinan", "Keteladanan disiplin dan budaya kerja", 5)
  ], { divisions: ["MANAJEMEN"] }),
  standard("branch_manager", "Branch Manager", 115, { positions: ["BRANCH MANAGER", "KEPALA CABANG", "BM"] }, [
    q("Hasil Cabang", "Pencapaian penjualan, margin, dan collection cabang", 30), q("Operasional", "Kualitas layanan dan kelancaran operasional cabang", 20),
    q("Kepemimpinan", "Coaching, produktivitas, dan retensi tim", 20), q("Kontrol", "Akurasi stok, kas, piutang, dan pelaporan", 15),
    q("Perbaikan", "Penyelesaian masalah dan implementasi perbaikan", 10), q("Kedisiplinan", "Kehadiran dan kepatuhan kebijakan", 5)
  ], { divisions: ["MANAJEMEN"] }),
  standard("sales_supervisor", "Supervisor / Koordinator Sales", 110, { positions: ["SPV SALES", "SUPERVISOR SALES", "KOORDINATOR SALES", "SALES COORDINATOR"] }, [
    q("Target Tim", "Pencapaian omzet, volume, dan principal target tim", 30), q("Collection", "Pencapaian collection dan pengendalian overdue", 15),
    q("Coverage", "Active outlet, NOO, dan efektivitas kunjungan tim", 15), q("Kepemimpinan", "Coaching, review rute, dan tindak lanjut kinerja", 20),
    q("Akurasi", "Kualitas forecast, laporan, dan data penjualan", 10), q("Kolaborasi", "Koordinasi dengan admin, warehouse, dan finance", 5),
    q("Kedisiplinan", "Kehadiran dan kepatuhan SOP tim", 5)
  ], { divisions: ["SALES"] }),
  standard("admin_supervisor", "Supervisor / Koordinator Admin", 108, { positions: ["SPV ADMIN", "SUPERVISOR ADMIN", "KOORDINATOR ADMIN"] }, [
    q("SLA Tim", "Ketepatan proses administrasi dan pemenuhan SLA", 25), q("Akurasi", "Akurasi transaksi, master data, dan laporan", 20),
    q("Kontrol", "Rekonsiliasi dokumen, stok, dan penyelesaian selisih", 15), q("Kepemimpinan", "Pembagian kerja, coaching, dan kontrol backlog", 20),
    q("Perbaikan", "Standardisasi proses dan perbaikan sistem", 10), q("Layanan", "Kolaborasi dan kepuasan pengguna internal", 5), q("Kedisiplinan", "Kehadiran dan kepatuhan SOP", 5)
  ], { divisions: ["ADMIN"] }),
  standard("warehouse_leader", "Warehouse Leader", 107, { positions: ["WAREHOUSE LEADER", "KEPALA GUDANG", "SPV WAREHOUSE", "SUPERVISOR WAREHOUSE"] }, [
    q("Akurasi Stok", "Akurasi stok sistem dan fisik", 25), q("Operasional", "SLA inbound, outbound, dan loading", 20),
    q("Kepemimpinan", "Penjadwalan, briefing, dan produktivitas tim", 20), q("Kepatuhan", "SOP, keselamatan kerja, dan keamanan barang", 15),
    q("Kontrol", "Stock opname, selisih, retur, dan barang rusak", 10), q("5R", "Kerapian, kebersihan, dan tata letak gudang", 5), q("Kedisiplinan", "Kehadiran dan kepatuhan waktu", 5)
  ], { divisions: ["WAREHOUSE"] }),
  standard("purchasing_manager", "Purchasing & Inventory Manager", 106, { positions: ["PURCHASING MANAGER", "PROCUREMENT MANAGER", "INVENTORY MANAGER", "MANAGER PURCHASING"] }, [
    q("Ketersediaan", "Service level dan ketersediaan barang", 25), q("Persediaan", "Inventory turnover, aging, dan slow moving", 20),
    q("Pembelian", "Ketepatan PO, harga, dan lead time pemasok", 20), q("Perencanaan", "Akurasi forecast sell-in dan sell-out", 15),
    q("Kepemimpinan", "Kontrol tim, prioritas, dan pengembangan staf", 10), q("Data", "Akurasi item master, harga, dan laporan", 5), q("Kedisiplinan", "Kepatuhan SOP dan tenggat", 5)
  ], { divisions: ["PURCHASING", "INVENTORY", "SUPPLY CHAIN"] }),
  standard("sales_admin", "Admin Sales", 96, { positions: ["ADMIN SALES", "SALES ADMIN"] }, [
    q("Order", "Kecepatan dan ketepatan proses sales order", 25), q("Akurasi", "Akurasi harga, diskon, customer, dan dokumen", 20),
    q("Collection", "Monitoring tagihan dan kelengkapan dokumen penagihan", 15), q("Layanan", "Respons kepada sales dan pelanggan internal", 15),
    q("Pelaporan", "Ketepatan laporan penjualan dan rekonsiliasi", 15), q("Perbaikan", "Inisiatif memperbaiki proses administrasi", 5), q("Kedisiplinan", "Kehadiran dan kepatuhan SOP", 5)
  ], { divisions: ["ADMIN", "SALES"] }),
  standard("warehouse_admin", "Admin Warehouse", 95, { positions: ["ADMIN WAREHOUSE", "ADMIN GUDANG"] }, [
    q("Transaksi Stok", "Ketepatan input penerimaan dan pengeluaran", 25), q("Akurasi", "Kesesuaian dokumen, sistem, dan stok fisik", 25),
    q("SLA", "Ketepatan dokumen inbound, outbound, dan retur", 15), q("Pelaporan", "Stock report, aging, dan penyelesaian selisih", 15),
    q("Koordinasi", "Koordinasi checker, driver, sales, dan admin", 10), q("Arsip", "Kelengkapan serta keterlacakan dokumen", 5), q("Kedisiplinan", "Kehadiran dan kepatuhan SOP", 5)
  ], { divisions: ["ADMIN", "WAREHOUSE"] }),
  standard("admin_support", "Admin Support / DERP", 94, { positions: ["ADMIN SUPPORT", "DERP", "DATA ENTRY", "SYSTEM ADMIN"] }, [
    q("Akurasi Data", "Akurasi input dan pemeliharaan master data", 30), q("SLA", "Kecepatan penyelesaian permintaan dan backlog", 20),
    q("Kontrol", "Validasi, rekonsiliasi, dan penanganan anomali", 15), q("Pelaporan", "Ketepatan laporan dan dokumentasi", 15),
    q("Layanan", "Respons dan komunikasi kepada pengguna", 10), q("Perbaikan", "Otomasi atau penyederhanaan proses", 5), q("Kedisiplinan", "Kehadiran dan kepatuhan SOP", 5)
  ], { divisions: ["ADMIN", "SUPPORT"] }),
  standard("sales_cirebon", "Sales Cirebon", 90, { positions: ["SALES", "SALESMAN", "ACCOUNT OFFICER", "MARKETING"], branches: ["CIREBON"] }, [
    q("Penjualan", "Pencapaian omzet dan volume ICI", 25, "INTEGRASI_TARGET_SALES"), q("Penjualan", "Pencapaian target PRIMA dan DCOTA", 15, "INTEGRASI_TARGET_SALES"),
    q("Collection", "Collection tertagih dan pengendalian overdue", 20, "INTEGRASI_FINANCE"), q("Coverage", "Active outlet, NOO, dan produktivitas kunjungan", 15, "INTEGRASI_TRACKING_SALES"),
    q("Efektivitas", "Konversi kunjungan menjadi order atau tindak lanjut", 10, "INTEGRASI_TRACKING_SALES"), q("Administrasi", "Akurasi order, laporan, dan bukti kunjungan", 10),
    q("Kedisiplinan", "Kehadiran, ketepatan rute, dan kepatuhan SOP", 5, "INTEGRASI_ABSENSI")
  ], { divisions: ["SALES"], branches: ["CIREBON"] }),
  standard("sales_malang", "Sales Malang", 90, { positions: ["SALES", "SALESMAN", "ACCOUNT OFFICER", "MARKETING"], branches: ["MALANG"] }, [
    q("Penjualan", "Pencapaian omzet dan volume ICI", 25, "INTEGRASI_TARGET_SALES"), q("Penjualan", "Pencapaian target Blesscon", 15, "INTEGRASI_TARGET_SALES"),
    q("Collection", "Collection tertagih dan pengendalian overdue", 20, "INTEGRASI_FINANCE"), q("Coverage", "Active outlet, NOO, dan produktivitas kunjungan", 15, "INTEGRASI_TRACKING_SALES"),
    q("Efektivitas", "Konversi kunjungan menjadi order atau tindak lanjut", 10, "INTEGRASI_TRACKING_SALES"), q("Administrasi", "Akurasi order, laporan, dan bukti kunjungan", 10),
    q("Kedisiplinan", "Kehadiran, ketepatan rute, dan kepatuhan SOP", 5, "INTEGRASI_ABSENSI")
  ], { divisions: ["SALES"], branches: ["MALANG"] }),
  standard("checker", "Checker Warehouse", 88, { positions: ["CHECKER", "PICKER", "PACKER"] }, [
    q("Akurasi", "Ketepatan item, batch, dan jumlah barang", 30), q("Produktivitas", "Kecepatan checking/picking sesuai SLA", 20),
    q("Dokumen", "Kelengkapan dokumen dan bukti serah terima", 15), q("Kualitas", "Pencegahan salah kirim dan barang rusak", 15),
    q("SOP", "Kepatuhan keselamatan, FIFO/FEFO, dan prosedur", 10), q("5R", "Kerapian area dan alat kerja", 5), q("Kedisiplinan", "Kehadiran dan ketepatan waktu", 5)
  ], { divisions: ["WAREHOUSE"] }),
  standard("driver", "Driver / Pengiriman", 87, { positions: ["DRIVER", "SOPIR", "PENGIRIMAN", "DELIVERY"] }, [
    q("Pengiriman", "Ketepatan waktu dan keberhasilan pengiriman", 25), q("Akurasi", "Kesesuaian barang, surat jalan, dan penerima", 20),
    q("Efisiensi", "Kepatuhan rute dan efisiensi BBM/jarak", 15), q("Kendaraan", "Checklist, perawatan, dan kebersihan kendaraan", 15),
    q("Layanan", "Komunikasi dan pelayanan kepada pelanggan", 10), q("Keselamatan", "Kepatuhan berkendara dan minim insiden", 10), q("Kedisiplinan", "Kehadiran dan ketepatan waktu", 5)
  ], { divisions: ["WAREHOUSE", "DISTRIBUSI"] }),
  standard("helper", "Helper Warehouse", 86, { positions: ["HELPER", "BURUH BONGKAR", "LOADER"] }, [
    q("Produktivitas", "Kecepatan bongkar, muat, dan penataan", 25), q("Akurasi", "Ketepatan jumlah dan lokasi barang", 20),
    q("Kualitas", "Penanganan barang tanpa kerusakan", 15), q("SOP", "Kepatuhan keselamatan dan instruksi kerja", 15),
    q("5R", "Kerapian dan kebersihan area gudang", 10), q("Kerja Sama", "Dukungan tim dan kesiapan operasional", 10), q("Kedisiplinan", "Kehadiran dan ketepatan waktu", 5)
  ], { divisions: ["WAREHOUSE"] }),
  standard("finance_cashier", "Finance / Kasir", 84, { positions: ["FINANCE", "KASIR", "CASHIER", "TREASURY"] }, [
    q("Akurasi", "Akurasi penerimaan, pembayaran, dan saldo kas", 25), q("Collection", "Monitoring penerimaan dan rekonsiliasi piutang", 20),
    q("SLA", "Ketepatan proses pembayaran dan closing", 15), q("Kontrol", "Kelengkapan bukti, otorisasi, dan rekonsiliasi", 15),
    q("Pelaporan", "Ketepatan cash flow dan laporan keuangan harian", 15), q("Layanan", "Respons kepada pihak internal dan eksternal", 5), q("Kedisiplinan", "Kepatuhan SOP, tenggat, dan kehadiran", 5)
  ], { divisions: ["FINANCE"] }),
  standard("accounting", "Accounting", 83, { positions: ["ACCOUNTING", "AKUNTANSI", "GL", "AR ", "AP "] }, [
    q("Closing", "Ketepatan waktu proses closing", 20), q("Akurasi", "Akurasi jurnal, rekonsiliasi, dan laporan", 25),
    q("Kontrol", "Penyelesaian selisih dan akun outstanding", 15), q("Kepatuhan", "Kesesuaian standar akuntansi dan audit trail", 15),
    q("Analisis", "Kualitas analisis varians dan informasi manajemen", 15), q("Perbaikan", "Efisiensi proses dan kualitas dokumentasi", 5), q("Kedisiplinan", "Kepatuhan tenggat dan kehadiran", 5)
  ], { divisions: ["ACCOUNTING", "FINANCE"] }),
  standard("tax", "Tax", 82, { positions: ["TAX", "PAJAK"] }, [
    q("Kepatuhan", "Ketepatan pelaporan dan pembayaran pajak", 30), q("Akurasi", "Akurasi perhitungan dan rekonsiliasi pajak", 25),
    q("Dokumen", "Kelengkapan faktur dan dokumentasi pendukung", 15), q("Risiko", "Pencegahan sanksi dan penyelesaian temuan", 15),
    q("Koordinasi", "Respons kepada internal, konsultan, dan otoritas", 10), q("Kedisiplinan", "Kepatuhan tenggat dan kehadiran", 5)
  ], { divisions: ["TAX", "FINANCE"] }),
  standard("purchasing_inventory", "Purchasing & Inventory Staff", 81, { positions: ["PURCHASING", "BUYER", "PROCUREMENT", "INVENTORY", "PPIC"] }, [
    q("Pembelian", "Ketepatan PO, harga, kuantitas, dan jadwal", 25), q("Ketersediaan", "Pemenuhan kebutuhan dan pencegahan stockout", 20),
    q("Persediaan", "Kontrol aging, slow moving, dan level stok", 15), q("Pemasok", "Lead time, kualitas, dan tindak lanjut pemasok", 15),
    q("Data", "Akurasi item master, harga, dan dokumen", 15), q("Koordinasi", "Komunikasi lintas divisi", 5), q("Kedisiplinan", "Kepatuhan SOP dan tenggat", 5)
  ], { divisions: ["PURCHASING", "INVENTORY", "SUPPLY CHAIN"] }),
  standard("human_resources", "Human Resources", 80, { positions: ["HRD", "HUMAN RESOURCE", "HR ", "PERSONALIA"] }, [
    q("Layanan SDM", "SLA layanan karyawan dan penyelesaian kasus", 20), q("Administrasi", "Akurasi data, kontrak, absensi, dan payroll input", 20),
    q("Talenta", "Kualitas rekrutmen, onboarding, dan retensi", 15), q("Kinerja", "Ketepatan siklus KPI, coaching, dan pengembangan", 15),
    q("Kepatuhan", "Kepatuhan kebijakan dan dokumentasi ketenagakerjaan", 15), q("Analitik", "Kualitas laporan dan rekomendasi berbasis data", 10), q("Kedisiplinan", "Keteladanan dan kepatuhan tenggat", 5)
  ], { divisions: ["HR", "HRGA"] }),
  standard("general_affairs", "General Affairs", 79, { positions: ["GENERAL AFFAIR", "GA ", "GA STAFF"] }, [
    q("Fasilitas", "Ketersediaan dan kondisi fasilitas kerja", 25), q("Vendor", "SLA, biaya, dan kualitas vendor", 15),
    q("Aset", "Akurasi inventaris dan pemeliharaan aset", 20), q("Layanan", "Kecepatan pemenuhan kebutuhan operasional", 15),
    q("Kepatuhan", "Perizinan, keamanan, dan dokumentasi", 10), q("Efisiensi", "Pengendalian biaya dan inisiatif perbaikan", 10), q("Kedisiplinan", "Kehadiran dan kepatuhan SOP", 5)
  ], { divisions: ["GA", "HRGA"] }),
  standard("security", "Security", 78, { positions: ["SECURITY", "SATPAM"] }, [
    q("Keamanan", "Pencegahan dan penanganan insiden", 25), q("Kontrol", "Pemeriksaan akses orang, kendaraan, dan barang", 20),
    q("Patroli", "Konsistensi patroli dan kontrol area", 15), q("Pelaporan", "Kelengkapan logbook dan eskalasi kejadian", 15),
    q("Layanan", "Sikap, komunikasi, dan bantuan kepada tamu/karyawan", 10), q("SOP", "Kepatuhan prosedur dan kesiapsiagaan", 10), q("Kedisiplinan", "Kehadiran dan ketepatan shift", 5)
  ], { divisions: ["GA", "SECURITY"] }),
  standard("office_boy", "Office Boy / General Service", 77, { positions: ["OFFICE BOY", "OFFICE GIRL", "CLEANING SERVICE", "GENERAL SERVICE", "OB "] }, [
    q("Kebersihan", "Kebersihan area sesuai checklist", 30), q("Kesiapan", "Kesiapan ruang, pantry, dan perlengkapan", 20),
    q("Layanan", "Kecepatan dan kualitas bantuan operasional", 15), q("Persediaan", "Kontrol perlengkapan dan pemakaian", 10),
    q("SOP", "Kepatuhan keselamatan dan prosedur kerja", 10), q("Sikap", "Keramahan, komunikasi, dan kerja sama", 10), q("Kedisiplinan", "Kehadiran dan ketepatan waktu", 5)
  ], { divisions: ["GA"] }),
  standard("generic_staff", "Staf Umum (Fallback)", 0, {}, [
    q("Hasil Kerja", "Pencapaian target dan penyelesaian pekerjaan utama", 30), q("Kualitas", "Akurasi dan kualitas hasil kerja", 20),
    q("SLA", "Ketepatan waktu dan produktivitas", 15), q("Layanan", "Komunikasi dan kolaborasi", 10),
    q("SOP", "Kepatuhan prosedur dan pengelolaan risiko", 10), q("Perbaikan", "Inisiatif dan pengembangan kompetensi", 10), q("Kedisiplinan", "Kehadiran dan ketepatan waktu", 5)
  ], { divisions: ["LAINNYA"] })
].sort((a, b) => b.priority - a.priority);

function hasAny(text, patterns = []) {
  return patterns.some(pattern => {
    const p = normalize(pattern);
    if (p.length <= 3) return (` ${text} `).includes(` ${p} `);
    return text.includes(p);
  });
}

export function resolveKpiStandard(employee = {}) {
  const position = normalize([employee.jabatan, employee.posisi, employee.job_title].join(" "));
  const division = normalize([employee.divisi, employee.departemen, employee.department].join(" "));
  const branch = normalize(employee.cabang || employee.branch);
  return KPI_ROLE_STANDARDS.find(item => {
    if (!item.priority) return false;
    const { positions = [], divisions = [], branches = [] } = item.match || {};
    if (positions.length && !hasAny(position, positions)) return false;
    if (divisions.length && !hasAny(division, divisions)) return false;
    if (branches.length && !hasAny(branch, branches)) return false;
    return true;
  }) || KPI_ROLE_STANDARDS.find(item => item.key === "generic_staff");
}

export function mapEmployeesToKpiStandards(employees = []) {
  return employees.map(employee => ({ employee, standard: resolveKpiStandard(employee) }));
}

export function validateKpiStandards(standards = KPI_ROLE_STANDARDS) {
  const keys = new Set();
  return standards.flatMap(item => {
    const errors = [];
    const total = item.questions.reduce((sum, question) => sum + Number(question.bobot || 0), 0);
    if (keys.has(item.key)) errors.push(`${item.key}: key duplikat`);
    keys.add(item.key);
    if (total !== 100) errors.push(`${item.key}: bobot ${total}, seharusnya 100`);
    if (!item.questions.length) errors.push(`${item.key}: indikator kosong`);
    return errors;
  });
}

export function standardToTemplatePayload(item, assignedEmployees = []) {
  return {
    nama_template: item.name,
    kategori_penilaian: "KPI_360",
    skala_penilaian: "0-100",
    soal_json: item.questions.map(question => ({ ...question })),
    karyawan_assigned: assignedEmployees.map(employee => employee.nama_karyawan || employee.nama).filter(Boolean),
    standard_key: item.key,
    standard_version: item.version,
    standard_divisions: item.divisions || [],
    standard_branches: item.branches || [],
    recommended_cycle: item.recommendedCycle,
    is_system_standard: true,
    decision_policy: "REKOMENDASI_HRD_DENGAN_VALIDASI_BUKTI"
  };
}
