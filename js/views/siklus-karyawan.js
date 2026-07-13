import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";

export async function mount(container, { session }) {
  await renderCrudModule(container.querySelector("#sk-panel"), {
    title: "Siklus Karyawan",
    subtitle: "Riwayat perubahan status kepegawaian karyawan.",
    collectionName: COL.SIKLUS_KARYAWAN,
    idPrefix: "SK",
    searchFields: ["nama_karyawan", "jenis"],
    columns: [
      { key: "tanggal_efektif", label: "Tgl Efektif", type: "date" },
      { key: "nama_karyawan", label: "Karyawan" },
      { key: "jenis", label: "Jenis", type: "badge", badgeTone: (v) => ({ Promosi: "green", Demosi: "red", Mutasi: "blue", Onboarding: "maroon", Offboarding: "slate" }[v] || "slate") },
      { key: "dari", label: "Dari" },
      { key: "ke", label: "Menjadi" },
      { key: "status", label: "Status", type: "badge" },
    ],
    formFields: [
      { name: "nama_karyawan", label: "Nama Karyawan", type: "text", required: true, full: true },
      { name: "nik", label: "NIK", type: "text" },
      { name: "jenis", label: "Jenis Perubahan", type: "select", options: ["Onboarding", "Mutasi", "Promosi", "Demosi", "Offboarding"], required: true },
      { name: "dari", label: "Dari (Jabatan/Cabang Lama)", type: "text" },
      { name: "ke", label: "Menjadi (Jabatan/Cabang Baru)", type: "text" },
      { name: "tanggal_efektif", label: "Tanggal Efektif", type: "date", required: true },
      { name: "keterangan", label: "Keterangan", type: "textarea", full: true },
      { name: "status", label: "Status Proses", type: "select", options: ["Diajukan", "Diproses", "Selesai"], default: "Diajukan" },
    ],
    beforeSave: (data) => ({ ...data, dicatat_oleh: session.nama })
  });
  return { unmount() {} };
}

import { sendEmailNotif } from "../utils.js";

// ... di dalam fungsi simpan Onboarding ...

const emailKaryawanBaru = data.email_pribadi; // didapat dari form
const namaKaryawan = data.nama_karyawan;

const htmlWelcome = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #7a1f2b; padding: 20px; text-align: center;">
      <h2 style="color: white; margin: 0;">Welcome to The Team!</h2>
    </div>
    <div style="padding: 20px; background-color: #f9fafb; color: #333;">
      <p>Halo <strong>${namaKaryawan}</strong>,</p>
      <p>Selamat bergabung dengan perusahaan kami. Berikut adalah beberapa hal yang perlu Anda persiapkan untuk hari pertama (Onboarding):</p>
      <ul>
        <li>Fotokopi KTP & Kartu Keluarga (2 Lembar)</li>
        <li>Fotokopi Buku Rekening Bank</li>
        <li>NPWP & BPJS (Jika ada)</li>
      </ul>
      <p>Anda sudah bisa mengakses sistem HRIS kami melalui tautan di bawah ini:</p>
      <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
        <a href="https://domain-hris-anda.com" style="background-color: #7a1f2b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Masuk ke Sistem HRIS</a>
      </div>
      <p style="font-size: 12px; color: #666;">Jika Anda memiliki pertanyaan, silakan hubungi tim HR kami.</p>
    </div>
  </div>
`;

// Panggil fungsi kirim email
await sendEmailNotif(emailKaryawanBaru, "Welcoming Letter - HRIS", htmlWelcome);
