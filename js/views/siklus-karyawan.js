import { COL } from "../firebase-config.js";
import { renderCrudModule } from "../components.js";
import { sendEmailNotif, toast } from "../utils.js";

export async function mount(container, { session }) {
  await renderCrudModule(container.querySelector("#sk-panel"), {
    title: "Siklus Karyawan",
    subtitle: "Riwayat perubahan status kepegawaian karyawan (Mutasi, Promosi, Onboarding).",
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
      { name: "nik", label: "NIK / ID (Jika ada)", type: "text" },
      { name: "email_karyawan", label: "Email Karyawan (Penting untuk notif Onboarding)", type: "text" },
      { name: "jenis", label: "Jenis Perubahan", type: "select", options: ["Onboarding", "Mutasi", "Promosi", "Demosi", "Offboarding"], required: true },
      { name: "dari", label: "Dari (Jabatan/Cabang Lama)", type: "text" },
      { name: "ke", label: "Menjadi (Jabatan/Cabang Baru)", type: "text" },
      { name: "tanggal_efektif", label: "Tanggal Efektif", type: "date", required: true },
      { name: "keterangan", label: "Keterangan / Fasilitas yang disiapkan", type: "textarea", full: true },
      { name: "status", label: "Status Proses", type: "select", options: ["Diajukan", "Diproses", "Selesai"], default: "Diajukan" },
    ],
    beforeSave: async (data, existing) => {
      // Setup payload bawaan
      const payload = { ...data, dicatat_oleh: session.nama };

      // TRIGGER EMAIL ONBOARDING OTOMATIS
      if (payload.jenis === "Onboarding" && !existing && payload.email_karyawan) {
         const htmlWelcome = `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <div style="background-color: #7a1f2b; padding: 15px; text-align: center; border-radius: 6px 6px 0 0;">
                <h2 style="color: white; margin: 0;">Welcome to The Team!</h2>
              </div>
              <div style="padding: 20px; background-color: #f8fafc;">
                <p>Halo <strong>${payload.nama_karyawan}</strong>,</p>
                <p>Selamat bergabung dengan perusahaan kami. Mohon persiapkan hal-hal berikut untuk hari pertama (Onboarding):</p>
                <p style="white-space: pre-line; background: white; padding: 15px; border-radius: 5px; border: 1px solid #e2e8f0;">${payload.keterangan || "- Fotokopi KTP & KK\n- NPWP\n- Buku Rekening"}</p>
                <p>Sistem HRIS Anda sudah dapat diakses. Silakan masuk menggunakan portal kami.</p>
                <a href="https://andela-hris.vercel.app/#login" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Masuk ke Portal HRIS</a>
              </div>
            </div>
         `;
         // Kirim email (berjalan di background tanpa throw error jika gagal)
         sendEmailNotif(payload.email_karyawan, "Welcoming Letter - HRIS", htmlWelcome).catch(e => console.warn(e));
         toast("Email Welcoming Letter otomatis dipicu", "success");
      }

      return payload;
    }
  });
  return { unmount() {} };
}
