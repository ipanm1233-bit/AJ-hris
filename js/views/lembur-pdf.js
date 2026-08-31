/**
 * =====================================================================
 * LEMBUR-PDF.JS — Generator Dokumen Resmi ISO SPPKL (PDF)
 * Surat Perintah dan Persetujuan Kerja Lembur CV Andela Jaya
 * 
 * Standar: ISO 9001 / PP No 35 Tahun 2021 & Kebijakan Internal Andela Jaya
 * Catatan: Dokumen ini berfokus pada jam kerja lembur dan TIDAK memuat
 * perhitungan nominal rupiah upah lembur.
 * =====================================================================
 */
import { isoDocHeaderTable, COMPANY_NAME } from "../branding.js";
import { fmtDateShort, escapeHtml, downloadHtmlAsPdf } from "../utils.js";
import { fmtMinutesToDisplay } from "./lembur-calc.js";

export async function generateSppklPdf(orderData, selectedEmployee = null) {
  const data = orderData || {};
  const sppklNo = data.order_number || data.nomor_sppkl || data.id || "SPPKL/ANDELA/---";
  
  // Specific employee or primary employee
  const emp = selectedEmployee || (Array.isArray(data.employees) && data.employees.length > 0 ? data.employees[0] : {
    nama: data.nama_karyawan || "-",
    nik: data.nik_karyawan || "-",
    jabatan: data.jabatan_karyawan || "-",
    divisi: data.divisi || data.departemen || "-",
    consent_status: data.consent_status,
    consent_timestamp: data.consent_timestamp,
    durasi_aktual_menit: data.durasi_aktual_menit,
    jam_disetujui_hr: data.jam_disetujui_hr !== undefined ? data.jam_disetujui_hr : data.durasi_final_hr
  });

  const empName = emp.nama || emp.nama_karyawan || data.nama_karyawan || "-";
  const nik = emp.nik || emp.nik_karyawan || data.nik_karyawan || "-";
  const jabatan = emp.jabatan || emp.jabatan_karyawan || data.jabatan_karyawan || "-";
  const divisi = data.divisi || data.departemen || emp.divisi || "-";
  const cabang = data.cabang || "Pusat";
  const tanggal = fmtDateShort(data.overtime_date || data.tanggal);
  const jenisHari = data.day_type || data.jenis_hari || "Hari Kerja";
  
  const jamRencana = `${data.planned_start_at || data.jam_mulai || "-"} s/d ${data.planned_end_at || data.jam_selesai || "-"} (${data.planned_break_minutes || data.istirahat_menit || 0}m istirahat)`;
  const durasiRencanaJam = data.durasi_rencana || data.durasi_jam || Math.floor((Number(data.planned_minutes) || 0)/60) || 0;

  const tugas = data.work_description || data.pekerjaan || data.uraian_tugas || "-";
  const targetOutput = data.expected_output || data.target_output || "-";
  const alasanLembur = data.business_reason || data.alasan_lembur || "-";
  const lokasi = data.location || data.lokasi || "Kantor / Lapangan";
  const urgensi = data.urgency_type || data.urgensi || "NORMAL";

  // Consent details
  const isConsentApproved = emp.consent_status === "APPROVED" || emp.status_persetujuan_karyawan === "SETUJU" || data.status === "DISETUJUI_KARYAWAN";
  const isConsentRejected = emp.consent_status === "REJECTED" || emp.status_persetujuan_karyawan === "TOLAK" || data.status === "DITOLAK_KARYAWAN";
  const consentStatusText = isConsentApproved 
    ? "DISETUJUI SECARA DIGITAL (E-CONSENT VERIFIED)" 
    : isConsentRejected ? "DITOLAK OLEH KARYAWAN" : "MENUNGGU PERSETUJUAN KARYAWAN";
  const consentTimestamp = emp.consent_timestamp || emp.persetujuan_karyawan_at || data.consent_timestamp ? fmtDateShort(emp.consent_timestamp || emp.persetujuan_karyawan_at || data.consent_timestamp) : "-";

  // Time & Hour Breakdown
  const actualMinutes = Number(emp.actual_minutes || emp.durasi_aktual_menit || data.durasi_aktual_menit || (Number(emp.durasi_aktual || data.durasi_aktual || 0) * 60) || 0);
  const countedFullHours = emp.counted_full_hours !== undefined ? emp.counted_full_hours : Math.floor(actualMinutes / 60);
  const approvedHoursHr = emp.approved_hours_hr !== undefined ? emp.approved_hours_hr : (emp.jam_disetujui_hr !== undefined ? emp.jam_disetujui_hr : (data.jam_disetujui_hr !== undefined ? data.jam_disetujui_hr : Math.min(countedFullHours, 4)));

  const isMealWajib = actualMinutes >= 240 || durasiRencanaJam >= 4;

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #0f172a; max-width: 800px; margin: 0 auto; font-size: 11px; line-height: 1.45;">
    
    <!-- ISO Header Table -->
    <div style="page-break-inside: avoid; margin-bottom: 12px;">
      ${isoDocHeaderTable({
        judul: "SURAT PERINTAH DAN PERSETUJUAN KERJA LEMBUR (SPPKL)",
        noDok: sppklNo,
        terbitRevisi: "1/1",
        tglTerbit: tanggal,
        hal: "1 dari 1"
      })}
    </div>

    <!-- Sub-Header Info -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; display: flex; justify-content: space-between;">
      <div><strong>No. SPPKL:</strong> <span style="font-family: monospace; color: #881337; font-weight: bold;">${escapeHtml(sppklNo)}</span></div>
      <div><strong>Tingkat Urgensi:</strong> <span style="color: ${urgensi === 'DARURAT' ? '#e11d48' : '#0369a1'}; font-weight: bold;">${escapeHtml(urgensi)}</span></div>
      <div><strong>Status:</strong> <span style="font-weight: bold; color: #059669;">${escapeHtml(data.current_status || data.status || 'DIJADWALKAN')}</span></div>
    </div>

    <!-- Section 1: Identitas Karyawan & Jadwal Perintah -->
    <div style="font-weight: bold; color: #881337; border-bottom: 2px solid #881337; padding-bottom: 3px; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
      I. IDENTITAS KARYAWAN & JADWAL KERJA LEMBUR
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
      <tr>
        <td style="width: 22%; padding: 4px 6px; font-weight: bold; color: #475569;">Nama Karyawan</td>
        <td style="width: 28%; padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: ${escapeHtml(empName)}</td>
        <td style="width: 22%; padding: 4px 6px; font-weight: bold; color: #475569;">NIK / Jabatan</td>
        <td style="width: 28%; padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: ${escapeHtml(nik)} / ${escapeHtml(jabatan)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 6px; font-weight: bold; color: #475569;">Divisi / Cabang</td>
        <td style="padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: ${escapeHtml(divisi)} / ${escapeHtml(cabang)}</td>
        <td style="padding: 4px 6px; font-weight: bold; color: #475569;">Jenis Hari</td>
        <td style="padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: ${escapeHtml(jenisHari)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 6px; font-weight: bold; color: #475569;">Tanggal Lembur</td>
        <td style="padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: ${tanggal}</td>
        <td style="padding: 4px 6px; font-weight: bold; color: #475569;">Jadwal Rencana</td>
        <td style="padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: <strong>${escapeHtml(jamRencana)}</strong></td>
      </tr>
      <tr>
        <td style="padding: 4px 6px; font-weight: bold; color: #475569;">Lokasi Penugasan</td>
        <td colspan="3" style="padding: 4px 6px; border-bottom: 1px dashed #cbd5e1;">: ${escapeHtml(lokasi)}</td>
      </tr>
    </table>

    <!-- Section 2: Uraian Pekerjaan & Alasan Lembur -->
    <div style="font-weight: bold; color: #881337; border-bottom: 2px solid #881337; padding-bottom: 3px; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
      II. URAIAN TUGAS, ALASAN OPERASIONAL & TARGET OUTPUT
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
      <tr>
        <td style="width: 22%; padding: 4px 6px; font-weight: bold; color: #475569; vertical-align: top;">Uraian Tugas</td>
        <td style="padding: 6px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;" colspan="3">
          ${escapeHtml(tugas)}
        </td>
      </tr>
      <tr style="height: 4px;"></tr>
      <tr>
        <td style="width: 22%; padding: 4px 6px; font-weight: bold; color: #475569; vertical-align: top;">Alasan Kebutuhan</td>
        <td style="padding: 6px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;" colspan="3">
          ${escapeHtml(alasanLembur)}
        </td>
      </tr>
      <tr style="height: 4px;"></tr>
      <tr>
        <td style="width: 22%; padding: 4px 6px; font-weight: bold; color: #475569; vertical-align: top;">Target / Output</td>
        <td style="padding: 6px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;" colspan="3">
          ${escapeHtml(targetOutput)}
        </td>
      </tr>
    </table>

    <!-- Section 3: Persetujuan Digital Karyawan (Digital Consent) -->
    <div style="font-weight: bold; color: #881337; border-bottom: 2px solid #881337; padding-bottom: 3px; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
      III. PERNYATAAN & PERSETUJUAN RESMI KARYAWAN (INDIVIDUAL DIGITAL CONSENT)
    </div>
    <div style="border: 1px solid #cbd5e1; background-color: ${isConsentApproved ? '#f0fdf4' : isConsentRejected ? '#fef2f2' : '#fffbeb'}; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px;">
      <div style="font-style: italic; color: ${isConsentApproved ? '#166534' : isConsentRejected ? '#991b1b' : '#854d0e'}; margin-bottom: 4px;">
        "Saya yang bertanda tangan di bawah ini menyatakan telah membaca, memahami, dan MENYETUJUI penugasan kerja lembur sesuai tanggal, waktu, lokasi, dan pekerjaan yang tercantum di atas pada sistem HRIS ${COMPANY_NAME}."
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #334155; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
        <div>Status Persetujuan: <strong>${consentStatusText}</strong></div>
        <div>Waktu Verifikasi Sistem: <strong>${consentTimestamp}</strong></div>
        <div>Kode Otentikasi: <span style="font-family: monospace;">${escapeHtml(data.id ? data.id.slice(-8) : 'DIGITAL-VERIFIED')}</span></div>
      </div>
    </div>

    <!-- Section 4: Verifikasi Jam Lembur (Kebijakan Internal Andela Jaya) -->
    <div style="font-weight: bold; color: #881337; border-bottom: 2px solid #881337; padding-bottom: 3px; margin-bottom: 8px; text-transform: uppercase; font-size: 11px;">
      IV. REKAPITULASI & VERIFIKASI JAM LEMBUR FINAL (KEBIJAKAN ANDELA JAYA)
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px;">
      <thead>
        <tr style="background-color: #f1f5f9; color: #334155;">
          <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">1. Jadwal Rencana</th>
          <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">2. Log Absensi Mesin</th>
          <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">3. Realisasi Aktual</th>
          <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 22%;">4. Jam Disetujui HR</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 6px; vertical-align: top;">
            ${escapeHtml(data.planned_start_at || data.jam_mulai || "-")} s/d ${escapeHtml(data.planned_end_at || data.jam_selesai || "-")}<br/>
            <strong>Durasi Rencana: ${durasiRencanaJam} Jam</strong>
          </td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; vertical-align: top;">
            ${escapeHtml(emp.attendance_in_at || emp.jam_masuk || "-")} s/d ${escapeHtml(emp.attendance_out_at || emp.jam_pulang || "-")}<br/>
            <span style="color: #64748b;">(Status Mesin/GPS)</span>
          </td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; vertical-align: top;">
            ${escapeHtml(emp.actual_start_at || data.jam_mulai_aktual || data.jam_mulai || "-")} s/d ${escapeHtml(emp.actual_end_at || data.jam_selesai_aktual || data.jam_selesai || "-")}<br/>
            <strong>Durasi Bersih: ${fmtMinutesToDisplay(actualMinutes)}</strong>
          </td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; text-align: right; background-color: #fdf2f8;">
            <div style="font-size: 14px; font-weight: bold; color: #881337; font-family: monospace;">${approvedHoursHr} JAM</div>
            <div style="font-size: 9px; color: #64748b;">(Maks 4 Jam / Hari)</div>
          </td>
        </tr>
      </tbody>
    </table>

    ${isMealWajib ? `
    <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 4px; padding: 6px 10px; margin-bottom: 12px; font-size: 10px; color: #92400e;">
      <strong>✓ Fasilitas Konsumsi:</strong> Lembur $\\ge$ 4 jam (240 menit) memenuhi kriteria wajib penyediaan makanan & minuman (sekurang-kurangnya 1.400 kkal) sesuai PP No 35/2021.
    </div>
    ` : ''}

    <!-- Section 5: Lembar Otorisasi & Tanda Tangan Digital -->
    <table style="width: 100%; text-align: center; margin-top: 14px; page-break-inside: avoid; font-size: 10px; border-collapse: collapse;">
      <tr>
        <td style="width: 25%; padding: 4px; vertical-align: top;">
          Pemberi Instruksi / Atasan,<br/>
          <div style="height: 42px; display: flex; align-items: center; justify-content: center; color: #0284c7; font-size: 9px; font-weight: bold;">
            [Digital Approved]
          </div>
          <strong>( ${escapeHtml(data.instructed_by || data.nama_pembuat || data.atasan_nama || 'Atasan Langsung')} )</strong>
        </td>
        <td style="width: 25%; padding: 4px; vertical-align: top;">
          Approver Perusahaan,<br/>
          <div style="height: 42px; display: flex; align-items: center; justify-content: center; color: #0284c7; font-size: 9px; font-weight: bold;">
            [Otorisasi Sistem]
          </div>
          <strong>( ${escapeHtml(data.approver_nama || 'Kepala Divisi / GM')} )</strong>
        </td>
        <td style="width: 25%; padding: 4px; vertical-align: top;">
          Persetujuan Karyawan,<br/>
          <div style="height: 42px; display: flex; align-items: center; justify-content: center; color: ${isConsentApproved ? '#059669' : '#dc2626'}; font-size: 9px; font-weight: bold;">
            ${isConsentApproved ? `✓ E-CONSENT APPROVED<br/><span style="font-size: 8px; font-weight: normal; color: #475569;">${consentTimestamp}</span>` : `✕ ${consentStatusText}`}
          </div>
          <strong>( ${escapeHtml(empName)} )</strong>
        </td>
        <td style="width: 25%; padding: 4px; vertical-align: top;">
          Verifikasi HRGA,<br/>
          <div style="height: 42px; display: flex; align-items: center; justify-content: center; color: #7c3aed; font-size: 9px; font-weight: bold;">
            [Verifikasi Jam Final]
          </div>
          <strong>( Tim HRGA ${COMPANY_NAME} )</strong>
        </td>
      </tr>
    </table>

    <div style="margin-top: 16px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 6px;">
      Dokumen SPPKL ini diterbitkan secara elektronik oleh Sistem HRIS ${COMPANY_NAME} dan sah tanpa tanda tangan basah berdasarkan UU ITE Pasal 5 ayat 1.<br/>
      Keluaran modul ini adalah Jam Lembur Disetujui HR untuk rekapitulasi jam kerja, tanpa perhitungan nominal rupiah.
    </div>

  </div>
  `;

  const fileName = `SPPKL_${escapeHtml(empName).replace(/\s+/g, "_")}_${tanggal.replace(/\s+/g, "_")}.pdf`;
  await downloadHtmlAsPdf(html, fileName);
}
