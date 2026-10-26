import test from "node:test";
import assert from "node:assert/strict";
import {
  filterApprovalTargets,
  isHrFallbackEmployee,
  isOperationalSupport,
  resolveHrdRecipients
} from "../js/approval-recipients.mjs";

/* Data uji mengikuti kondisi produksi saat insiden izin EVA (26 Okt 2026):
   divisi "HRGA" berisi STAFF HRD, General Affair, Office Boy, dan empat Security. */
const employees = [
  { nama_karyawan: "ADELITA FEBYANI", nik_karyawan: "1022602030", divisi: "HRGA", jabatan: "STAFF HRD", cabang: "CIREBON" },
  { nama_karyawan: "PHILIP TAMZIR", nik_karyawan: "1052204600", divisi: "HRGA", jabatan: "GENERAL AFFAIR", cabang: "CIREBON" },
  { nama_karyawan: "DENI KURNIAWAN", nik_karyawan: "1091107830", divisi: "HRGA", jabatan: "OFFICE BOY", cabang: "CIREBON" },
  { nama_karyawan: "RICKY PERMANA", nik_karyawan: "2031805800", divisi: "HRGA", jabatan: "SECURITY", cabang: "MALANG" },
  { nama_karyawan: "NURDIANTO", nik_karyawan: "2031806710", divisi: "HRGA", jabatan: "SECURITY", cabang: "MALANG" },
  { nama_karyawan: "MUHAMMAD SOFYAN", nik_karyawan: "2031808980", divisi: "HRGA", jabatan: "SECURITY", cabang: "MALANG" },
  { nama_karyawan: "ANDIK KRISMAWAN", nik_karyawan: "2031812970", divisi: "HRGA", jabatan: "SECURITY", cabang: "MALANG" },
  { nama_karyawan: "EVA GITA ROSTITA", nik_karyawan: "1012401010", divisi: "ADMIN", jabatan: "ADMIN STAFF 3", cabang: "CIREBON" }
];

const users = [
  { username: "ADELITA", nama: "ADELITA FEBYANI", nik: "1022602030", role: "HRD", email: "adelita@example.com" },
  { username: "IPAN", nama: "IPAN MAULANA", nik: "001", role: "SUPERADMIN", email: "ipan@example.com" },
  { username: "PHILIP", nama: "PHILIP TAMZIR", nik: "1052204600", role: "STAFF", email: "philip@example.com" },
  { username: "DENI", nama: "DENI KURNIAWAN", nik: "1091107830", role: "STAFF", email: "deni@example.com" },
  { username: "RICKY", nama: "RICKY PERMANA", nik: "2031805800", role: "STAFF", email: "ricky@example.com" },
  { username: "NURDIANTO", nama: "NURDIANTO", nik: "2031806710", role: "STAFF", email: "nurdianto@example.com" },
  { username: "MUHAMMAD", nama: "MUHAMMAD SOFYAN", nik: "2031808980", role: "STAFF", email: "muhammad@example.com" },
  { username: "ANDIK", nama: "ANDIK KRISMAWAN", nik: "2031812970", role: "STAFF", email: "andik@example.com" },
  { username: "EVA", nama: "EVA GITA ROSTITA", nik: "1012401010", role: "STAFF", email: "eva@example.com" }
];

const emailFor = (user, employee) => user?.email || employee?.email || "";

test("regresi insiden izin EVA: security/OB/GA tidak lagi menerima persetujuan HRD", () => {
  const recipients = resolveHrdRecipients({ users, employees, emailFor });
  const emails = recipients.map((r) => r.email);
  const names = recipients.map((r) => r.nama);

  // hanya HRD & SUPERADMIN yang tersisa
  assert.deepEqual(emails.sort(), ["adelita@example.com", "ipan@example.com"]);
  for (const terlarang of ["ricky@example.com", "nurdianto@example.com", "muhammad@example.com", "andik@example.com", "philip@example.com", "deni@example.com"]) {
    assert.equal(emails.includes(terlarang), false, `${terlarang} tidak boleh menerima approval HRD`);
  }
  assert.equal(names.includes("RICKY PERMANA"), false);
  assert.equal(names.includes("DENI KURNIAWAN"), false);
});

test("divisi HRGA saja tidak lagi cukup untuk dianggap approver HRD", () => {
  assert.equal(isHrFallbackEmployee({ divisi: "HRGA", jabatan: "SECURITY" }), false);
  assert.equal(isHrFallbackEmployee({ divisi: "HRGA", jabatan: "OFFICE BOY" }), false);
  assert.equal(isHrFallbackEmployee({ divisi: "HRGA", jabatan: "GENERAL AFFAIR" }), false);
  assert.equal(isHrFallbackEmployee({ divisi: "HRGA", jabatan: "STAFF HRD" }), true);
  assert.equal(isHrFallbackEmployee({ divisi: "HRGA", jabatan: "HRGA MANAGER" }), true);
  assert.equal(isHrFallbackEmployee({ divisi: "ADMIN", jabatan: "ADMIN STAFF 3" }), false);
});

test("staf HR tanpa role khusus tetap mendapat notifikasi lewat fallback jabatan", () => {
  const recipients = resolveHrdRecipients({
    users: [],
    employees: [{ nama_karyawan: "SITI NURHALIZA", nik_karyawan: "999", divisi: "HRGA", jabatan: "STAFF RECRUITMENT" }],
    emailFor: () => "siti@example.com"
  });
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].email, "siti@example.com");
});

test("role HRD tetap diutamakan meski divisinya bukan HRGA", () => {
  const recipients = resolveHrdRecipients({
    users: [{ username: "RINA", nama: "RINA HRD", nik: "77", role: "HRD", email: "rina@example.com" }],
    employees: [{ nama_karyawan: "RINA HRD", nik_karyawan: "77", divisi: "MANAJEMEN", jabatan: "MANAGER OPERASIONAL" }],
    emailFor
  });
  assert.deepEqual(recipients.map((r) => r.email), ["rina@example.com"]);
});

test("akun satpam yang salah diberi role HRD tetap dikecualikan", () => {
  const recipients = resolveHrdRecipients({
    users: [{ username: "SATPAM1", nama: "SATPAM SOFYAN", nik: "2610", role: "HRD", jabatan: "SECURITY", email: "satpam@example.com" }],
    employees: [],
    emailFor
  });
  assert.deepEqual(recipients, []);
});

test("penerima digandakan berdasarkan email agar tidak dobel kirim", () => {
  const recipients = resolveHrdRecipients({
    users: [
      { username: "A", nama: "ADELITA FEBYANI", nik: "1", role: "HRD", email: "sama@example.com" },
      { username: "B", nama: "ADELITA FEBYANI", nik: "1", role: "SUPERADMIN", email: "sama@example.com" }
    ],
    employees: [{ nama_karyawan: "ADELITA FEBYANI", nik_karyawan: "1", divisi: "HRGA", jabatan: "STAFF HRD" }],
    emailFor
  });
  assert.equal(recipients.length, 1);
});

test("filterApprovalTargets membuang posisi operasional dari tahap persetujuan", () => {
  const targets = [
    { nama: "RICKY PERMANA", jabatan: "SECURITY", role: "STAFF", email: "ricky@example.com" },
    { nama: "DENI KURNIAWAN", jabatan: "OFFICE BOY", role: "STAFF", email: "deni@example.com" },
    { nama: "IKA NOVISTA", jabatan: "GENERAL MANAGER", role: "GM", email: "ika@example.com" },
    { nama: "IPAN MAULANA", jabatan: "MANAGER HRD", role: "SUPERADMIN", email: "ipan@example.com" }
  ];
  assert.deepEqual(
    filterApprovalTargets(targets).map((t) => t.nama),
    ["IKA NOVISTA", "IPAN MAULANA"]
  );
});

test("isOperationalSupport mengenali variasi penulisan jabatan", () => {
  for (const jabatan of ["SECURITY", "Security", "SATPAM", "OFFICE BOY", "Cleaning Service", "DRIVER / EXPEDISI", "General Affair", "TEKNISI"]) {
    assert.equal(isOperationalSupport({ jabatan }), true, jabatan);
  }
  assert.equal(isOperationalSupport({ jabatan: "STAFF HRD" }), false);
  assert.equal(isOperationalSupport({ jabatan: "GENERAL MANAGER" }), false);
});
