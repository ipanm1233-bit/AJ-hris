export const CASE_CATEGORIES = {
  "Konseling": [
    "Masalah pribadi", "Masalah terkait pekerjaan", "Hubungan dengan rekan kerja",
    "Hubungan dengan atasan", "Stres kerja", "Kendala komunikasi",
    "Kendala motivasi", "Lainnya"
  ],
  "Coaching Kinerja": [
    "Kinerja", "Kehadiran", "Kedisiplinan", "Produktivitas", "Komunikasi",
    "Kepemimpinan", "Kinerja penjualan", "Perilaku kerja", "Kepatuhan SOP", "Lainnya"
  ],
  "Pembinaan Disiplin": [
    "Keterlambatan", "Ketidakhadiran", "Meninggalkan tempat kerja tanpa izin",
    "Pelanggaran SOP", "Kelalaian", "Pelanggaran perilaku", "Penolakan instruksi kerja",
    "Aktivitas tanpa wewenang", "Lainnya"
  ],
  "Tindakan Perbaikan": [
    "Perbaikan kinerja", "Perbaikan perilaku", "Perbaikan kepatuhan SOP",
    "Perbaikan kehadiran", "Perbaikan penjualan"
  ],
  "Tindak Lanjut Surat Peringatan": ["SP1", "SP2", "SP3", "Peringatan formal lainnya"]
};

export const CASE_SOURCES = [
  "Pemantauan HR", "Laporan Atasan", "Permintaan Karyawan", "Data Absensi",
  "Hasil KPI", "Pengaduan", "Arahan Manajemen", "Lainnya"
];

export const ROOT_CAUSES = [
  "Kesenjangan pengetahuan", "Kesenjangan keterampilan", "Kendala komunikasi",
  "Faktor pribadi", "Beban kerja", "Kendala kepemimpinan", "Kendala sistem atau proses",
  "Motivasi", "Kedisiplinan", "Ketidakpahaman SOP", "Lainnya"
];

export const ACTION_TAKENS = [
  "Konseling", "Coaching", "Teguran Lisan", "Teguran Tertulis", "Tindakan Perbaikan",
  "Pelatihan", "Mediasi", "Pemantauan", "Rekomendasi Surat Peringatan",
  "Eskalasi ke Manajemen", "Lainnya"
];

export const CASE_STATUSES = [
  "Draf", "Asesmen Awal", "Klarifikasi", "Rencana Perbaikan", "Pemantauan",
  "Evaluasi", "Selesai", "Dieskalasikan", "Dibatalkan"
];
export const PRIORITIES = ["Rendah", "Sedang", "Tinggi", "Kritis"];
export const CONFIDENTIALITY_LEVELS = ["Terbatas", "Rahasia", "Sangat Rahasia"];
export const ACTION_PLAN_STATUSES = ["Belum Dimulai", "Berjalan", "Selesai", "Dibatalkan"];
export const IMPROVEMENT_STATUSES = [
  "Perbaikan Sangat Baik", "Ada Perbaikan", "Belum Ada Perbaikan", "Mengalami Kemunduran"
];

const typeMap = {
  Counseling: "Konseling", Coaching: "Coaching Kinerja", Disciplinary: "Pembinaan Disiplin",
  "Corrective Action": "Tindakan Perbaikan", "Follow-up SP": "Tindak Lanjut Surat Peringatan"
};
const categoryMap = {
  "Personal issue": "Masalah pribadi", "Work-related issue": "Masalah terkait pekerjaan",
  "Relationship with coworker": "Hubungan dengan rekan kerja", "Relationship with supervisor": "Hubungan dengan atasan",
  "Work stress": "Stres kerja", "Communication issue": "Kendala komunikasi", "Motivation issue": "Kendala motivasi",
  Performance: "Kinerja", Attendance: "Kehadiran", Discipline: "Kedisiplinan", Productivity: "Produktivitas",
  Communication: "Komunikasi", Leadership: "Kepemimpinan", "Sales performance": "Kinerja penjualan",
  "Work behavior": "Perilaku kerja", "SOP compliance": "Kepatuhan SOP", "Late attendance": "Keterlambatan",
  Absence: "Ketidakhadiran", "Leaving workplace without permission": "Meninggalkan tempat kerja tanpa izin",
  "SOP violation": "Pelanggaran SOP", Negligence: "Kelalaian", Misconduct: "Pelanggaran perilaku",
  Insubordination: "Penolakan instruksi kerja", "Unauthorized activity": "Aktivitas tanpa wewenang",
  "Performance improvement": "Perbaikan kinerja", "Behavioral improvement": "Perbaikan perilaku",
  "SOP improvement": "Perbaikan kepatuhan SOP", "Attendance improvement": "Perbaikan kehadiran",
  "Sales improvement": "Perbaikan penjualan", "Other formal warning": "Peringatan formal lainnya", Other: "Lainnya"
};
const sourceMap = {
  "HR Monitoring": "Pemantauan HR", "Supervisor Report": "Laporan Atasan", "Employee Request": "Permintaan Karyawan",
  Attendance: "Data Absensi", KPI: "Hasil KPI", Complaint: "Pengaduan", Management: "Arahan Manajemen", Other: "Lainnya"
};
const rootMap = {
  "Knowledge gap": "Kesenjangan pengetahuan", "Skill gap": "Kesenjangan keterampilan",
  "Communication issue": "Kendala komunikasi", "Personal factor": "Faktor pribadi", Workload: "Beban kerja",
  "Leadership issue": "Kendala kepemimpinan", "System/process issue": "Kendala sistem atau proses",
  Motivation: "Motivasi", Discipline: "Kedisiplinan", "SOP misunderstanding": "Ketidakpahaman SOP", Other: "Lainnya"
};
const actionMap = {
  Counseling: "Konseling", Coaching: "Coaching", "Verbal Reminder": "Teguran Lisan",
  "Written Reminder": "Teguran Tertulis", "Corrective Action": "Tindakan Perbaikan", Training: "Pelatihan",
  Mediation: "Mediasi", Monitoring: "Pemantauan", "SP Recommendation": "Rekomendasi Surat Peringatan",
  "Management Escalation": "Eskalasi ke Manajemen", Other: "Lainnya"
};
const statusMap = {
  Draft: "Draf", Open: "Asesmen Awal", Investigation: "Klarifikasi", Counseling: "Klarifikasi",
  Coaching: "Klarifikasi", "Action Plan": "Rencana Perbaikan", Monitoring: "Pemantauan",
  Review: "Evaluasi", Closed: "Selesai", Escalated: "Dieskalasikan", Cancelled: "Dibatalkan"
};
const priorityMap = { Low: "Rendah", Medium: "Sedang", High: "Tinggi", Critical: "Kritis" };
const confidentialityMap = { Normal: "Terbatas", Confidential: "Rahasia", "Highly Confidential": "Sangat Rahasia" };
const apStatusMap = { Pending: "Belum Dimulai", "In Progress": "Berjalan", Completed: "Selesai", Cancelled: "Dibatalkan" };
const improvementMap = {
  "Significant Improvement": "Perbaikan Sangat Baik", Improvement: "Ada Perbaikan",
  "No Improvement": "Belum Ada Perbaikan", Regression: "Mengalami Kemunduran"
};

const mapped = (value, map, fallback) => map[value] || value || fallback;

export function normalizeCaseRecord(record = {}) {
  return {
    ...record,
    case_type: mapped(record.case_type, typeMap, "Konseling"),
    category: mapped(record.category, categoryMap, "Lainnya"),
    source: mapped(record.source, sourceMap, "Pemantauan HR"),
    priority: mapped(record.priority, priorityMap, "Sedang"),
    confidentiality: mapped(record.confidentiality, confidentialityMap, "Rahasia"),
    status: mapped(record.status, statusMap, "Asesmen Awal"),
    action_taken: mapped(record.action_taken, actionMap, "Coaching"),
    hr_assessment: {
      ...(record.hr_assessment || {}),
      root_cause: mapped(record.hr_assessment?.root_cause, rootMap, "Kedisiplinan"),
      recommended_action: mapped(record.hr_assessment?.recommended_action, actionMap, "Coaching")
    }
  };
}

export function normalizeActionPlanRecord(record = {}) {
  return { ...record, status: mapped(record.status, apStatusMap, "Belum Dimulai") };
}

export function normalizeFollowupRecord(record = {}) {
  return { ...record, improvement_status: mapped(record.improvement_status, improvementMap, "Ada Perbaikan") };
}

export function activeActionPlans(plans = []) {
  return plans.filter(plan => !["Selesai", "Dibatalkan"].includes(normalizeActionPlanRecord(plan).status));
}
