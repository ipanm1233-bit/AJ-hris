const { admin, getFirebaseAdmin } = require('./firebase-admin.js');
const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

function initFirebaseAdmin() {
  const { db } = getFirebaseAdmin();
  return db;
}

function getWibDateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function formatIndoDate(dateStr) {
  if (!dateStr) return "-";
  const parts = String(dateStr).split("T")[0].split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1] || m} ${y}`;
  }
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailHtml({ title, subtitle, badgeText, badgeColor = "#7a1f2b", introText, tableHeaders, tableRows, footerNote }) {
  const headersHtml = tableHeaders.map(h => `<th style="padding: 10px 12px; background-color: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; text-align: ${h.align || 'left'};">${escapeHtml(h.label)}</th>`).join("");
  
  const rowsHtml = tableRows.length > 0
    ? tableRows.map((r, idx) => `
        <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? 'background-color: #fafbfd;' : ''}">
          ${r.map((cell, cIdx) => `<td style="padding: 10px 12px; font-size: 12.5px; color: #1e293b; text-align: ${tableHeaders[cIdx]?.align || 'left'};">${cell}</td>`).join("")}
        </tr>
      `).join("")
    : `<tr><td colspan="${tableHeaders.length}" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">Tidak ada data yang tercatat untuk periode ini.</td></tr>`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #7a1f2b 0%, #4a0e17 100%); padding: 24px 28px; color: #ffffff;">
        <table style="width: 100%;">
          <tr>
            <td>
              <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 8px;">
                ${escapeHtml(badgeText)}
              </div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff; line-height: 1.3;">
                ${escapeHtml(title)}
              </h1>
              ${subtitle ? `<p style="margin: 6px 0 0; font-size: 13px; color: #fecdd3;">${escapeHtml(subtitle)}</p>` : ""}
            </td>
            <td style="text-align: right; vertical-align: middle;">
              <div style="background-color: #ffffff; border-radius: 10px; padding: 6px 10px; display: inline-block;">
                <span style="color: #7a1f2b; font-weight: 900; font-size: 13px; letter-spacing: 1px;">ANDELA JAYA</span>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Main Body -->
      <div style="padding: 24px 28px; background-color: #ffffff;">
        <p style="margin: 0 0 16px; font-size: 13.5px; color: #334155; line-height: 1.6;">
          ${introText}
        </p>

        <!-- Data Table -->
        <div style="margin: 18px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr>${headersHtml}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        ${footerNote ? `
          <div style="margin-top: 20px; padding: 12px 16px; background-color: #fff1f2; border-left: 4px solid #be123c; border-radius: 8px;">
            <p style="margin: 0; font-size: 12px; color: #881337; line-height: 1.5;">
              ${footerNote}
            </p>
          </div>
        ` : ""}
      </div>

      <!-- Footer -->
      <div style="padding: 16px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #64748b;">
          Sistem HRIS & Absensi CV Andela Jaya &bull; Otomasi Pemberitahuan Cuti Cabang
        </p>
        <p style="margin: 4px 0 0; font-size: 10.5px; color: #94a3b8;">
          Email ini dikirim secara otomatis oleh sistem sesuai jadwal ketentuan perusahaan.
        </p>
      </div>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  try {
    const db = initFirebaseAdmin();
    if (!db) {
      return res.status(200).json({ success: false, message: "Firebase Admin is not configured or offline." });
    }
    const todayStr = getWibDateStr();
    const todayFormatted = formatIndoDate(todayStr);

    const type = (req.query.type || req.body?.type || "auto").toLowerCase();
    const targetBranchParam = req.query.branch || req.body?.branch || null;
    const forceSend = req.query.force === "true" || req.body?.force === true;

    // 1. Ambil Konfigurasi Email Cabang
    let branchConfig = {
      enabled: true,
      default_cc: "generalaffairhrandelajaya@gmail.com",
      enable_morning: true,
      enable_instant: true,
      enable_evening: true,
      branches: {
        "Cirebon": { emails: ["generalaffairhrandelajaya@gmail.com"], cc: "", enabled: true },
        "Malang": { emails: ["generalaffairhrandelajaya@gmail.com"], cc: "", enabled: true }
      }
    };

    try {
      const cfgSnap = await db.collection('app_settings').doc('email_branch_cuti').get();
      if (cfgSnap.exists) {
        branchConfig = { ...branchConfig, ...cfgSnap.data() };
      } else {
        const mainSnap = await db.collection('app_settings').doc('main').get();
        if (mainSnap.exists && mainSnap.data().branch_cuti_notifications) {
          branchConfig = { ...branchConfig, ...mainSnap.data().branch_cuti_notifications };
        }
      }
    } catch (eCfg) {
      console.warn("Could not load branch_cuti config:", eCfg.message);
    }

    if (!branchConfig.enabled && !forceSend) {
      return res.status(200).json({ success: true, message: "Notifikasi email cabang sedang dinonaktifkan." });
    }

    // Tentukan aksi berdasarkan type: morning, evening, instant, atau auto
    const results = [];

    // =========================================================================
    // 1. PAGI HARI (07:45 WIB) - List Karyawan Cuti di Hari Tersebut
    // =========================================================================
    if (type === "morning" || type === "pagi" || (type === "auto")) {
      if (branchConfig.enable_morning || forceSend) {
        // Ambil data cuti hari ini dari master_cuti & data_pengajuan
        const activeLeaves = [];
        const seenKeys = new Set();

        // Dari master_cuti
        try {
          const mSnap = await db.collection('master_cuti').get();
          mSnap.forEach(docSnap => {
            const d = docSnap.data();
            const tgl = d.tanggal || d.tgl;
            if (tgl === todayStr) {
              const kName = d.nama_karyawan || d.nama || "Karyawan";
              const key = `${kName}_${todayStr}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                activeLeaves.push({
                  nama: kName,
                  nik: d.nik || "-",
                  jabatan: d.jabatan || "-",
                  divisi: d.divisi || d.departemen || "-",
                  cabang: d.cabang || "Cirebon",
                  jenis_cuti: d.type_cuti || d.jenis_cuti || "Cuti Tahunan",
                  periode: formatIndoDate(tgl),
                  durasi: `${d.count || 1} Hari`,
                  alasan: d.keterangan_cuti || d.keterangan || d.alasan || "-",
                  pengganti: d.pejabat_pengganti || "-"
                });
              }
            }
          });
        } catch (eM) {
          console.warn("Err reading master_cuti:", eM.message);
        }

        // Dari data_pengajuan (disetujui / aktif dan mencakup hari ini)
        try {
          const pSnap = await db.collection('data_pengajuan').get();
          pSnap.forEach(docSnap => {
            const p = docSnap.data();
            const isCuti = (p.tipe_form === "FORM_CUTI" || p.form_id === "F-ISO-CUTI" || (p.nama_form || "").toLowerCase().includes("cuti"));
            if (isCuti) {
              const st = (p.status_final || p.status || "").toUpperCase();
              if (st !== "REJECTED" && st !== "DITOLAK") {
                const start = p.tanggal_mulai || p.tgl_mulai;
                const end = p.tanggal_selesai || p.tgl_selesai || start;
                if (start && start <= todayStr && (end >= todayStr || !end)) {
                  const kName = p.nama_pemohon || p.pemohon || p.nama || "Karyawan";
                  const key = `${kName}_${todayStr}`;
                  if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    activeLeaves.push({
                      nama: kName,
                      nik: p.nik_pemohon || p.nik || "-",
                      jabatan: p.jabatan || p.posisi || "-",
                      divisi: p.divisi || p.departemen || "-",
                      cabang: p.cabang || "Cirebon",
                      jenis_cuti: p.kategori_cuti || p.jenis_cuti || "Cuti Tahunan",
                      periode: `${formatIndoDate(start)}${end && end !== start ? ' s/d ' + formatIndoDate(end) : ''}`,
                      durasi: `${p.jumlah_hari || 1} Hari`,
                      alasan: p.alasan || p.keterangan || "-",
                      pengganti: p.pejabat_pengganti || "-"
                    });
                  }
                }
              }
            }
          });
        } catch (eP) {
          console.warn("Err reading data_pengajuan:", eP.message);
        }

        // Group by Cabang
        const branchGroups = {};
        activeLeaves.forEach(item => {
          const cab = item.cabang || "Cirebon";
          if (!branchGroups[cab]) branchGroups[cab] = [];
          branchGroups[cab].push(item);
        });

        // Ensure configured branches are processed
        const allTargetBranches = Object.keys(branchConfig.branches || {});
        if (!allTargetBranches.includes("Cirebon")) allTargetBranches.push("Cirebon");

        for (const cab of allTargetBranches) {
          if (targetBranchParam && cab.toLowerCase() !== targetBranchParam.toLowerCase()) continue;
          
          const cabCfg = branchConfig.branches?.[cab] || {};
          if (cabCfg.enabled === false && !forceSend) continue;

          const targetEmails = Array.isArray(cabCfg.emails) ? cabCfg.emails.filter(Boolean) : (cabCfg.emails || "").split(",").map(s => s.trim()).filter(Boolean);
          const emailTo = targetEmails.length > 0 ? targetEmails.join(", ") : (branchConfig.default_cc || "generalaffairhrandelajaya@gmail.com");
          const cc = cabCfg.cc || branchConfig.default_cc || "";

          const listCutiCabang = branchGroups[cab] || [];

          const tableHeaders = [
            { label: "No", align: "center" },
            { label: "Nama & NIK", align: "left" },
            { label: "Jabatan / Divisi", align: "left" },
            { label: "Jenis Cuti", align: "left" },
            { label: "Periode Cuti", align: "left" },
            { label: "Keterangan", align: "left" },
            { label: "PIC Pengganti", align: "left" }
          ];

          const tableRows = listCutiCabang.map((item, idx) => [
            `<span style="font-weight: bold; color: #64748b;">${idx + 1}</span>`,
            `<b>${escapeHtml(item.nama)}</b><br><span style="font-size: 11px; color: #64748b; font-family: monospace;">${escapeHtml(item.nik)}</span>`,
            `${escapeHtml(item.jabatan)}<br><span style="font-size: 11px; color: #64748b;">${escapeHtml(item.divisi)}</span>`,
            `<span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-weight: bold; font-size: 11px; background-color: #f1f5f9; color: #334155;">${escapeHtml(item.jenis_cuti)}</span>`,
            `<b style="color: #7a1f2b;">${escapeHtml(item.periode)}</b><br><span style="font-size: 11px; color: #64748b;">(${escapeHtml(item.durasi)})</span>`,
            `<span style="font-size: 12px; color: #475569;">${escapeHtml(item.alasan)}</span>`,
            `<span style="font-size: 12px; color: #334155;">${escapeHtml(item.pengganti)}</span>`
          ]);

          const htmlBody = buildEmailHtml({
            badgeText: "🌅 REKAP PAGI (07:45 WIB) • CUTI HARI INI",
            title: `Daftar Karyawan Cuti Hari Ini (${todayFormatted})`,
            subtitle: `Wilayah Cabang / Penempatan: ${cab.toUpperCase()}`,
            introText: listCutiCabang.length > 0
              ? `Berikut adalah daftar <strong>${listCutiCabang.length} orang karyawan</strong> di <strong>Cabang ${escapeHtml(cab)}</strong> yang sedang mengambil hak cuti / izin pada hari ini, <strong>${todayFormatted}</strong>:`
              : `Pemberitahuan harian: Pada hari ini, <strong>${todayFormatted}</strong>, <strong>tidak ada karyawan yang cuti</strong> di <strong>Cabang ${escapeHtml(cab)}</strong> (seluruh personil terjadwal hadir bertugas).`,
            tableHeaders,
            tableRows,
            footerNote: "Mohon Koordinator Cabang / Kepala Bagian terkait dapat menyesuaikan pembagian tugas dan koordinasi operasional di lapangan."
          });

          // Kirim email jika ada data cuti atau jika dipaksa/mode terjadwal
          if (listCutiCabang.length > 0 || forceSend) {
            try {
              const info = await getTransporter().sendMail({
                from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
                to: emailTo,
                cc: cc || undefined,
                subject: `[CUTI HARI INI] ${listCutiCabang.length} Karyawan Cuti (${todayFormatted}) - Cabang ${cab}`,
                html: htmlBody
              });
              results.push({ type: "morning", branch: cab, count: listCutiCabang.length, to: emailTo, messageId: info.messageId, status: "SENT" });
            } catch (sendErr) {
              console.error(`Gagal kirim email pagi cabang ${cab}:`, sendErr);
              results.push({ type: "morning", branch: cab, count: listCutiCabang.length, to: emailTo, error: sendErr.message, status: "FAILED" });
            }
          } else {
            results.push({ type: "morning", branch: cab, count: 0, status: "SKIPPED (No leaves)" });
          }
        }
      }
    }

    // =========================================================================
    // 2. SORE HARI (17:00 WIB) - List Karyawan yang Mengajukan Cuti Hari Ini
    // =========================================================================
    if (type === "evening" || type === "sore" || (type === "auto")) {
      if (branchConfig.enable_evening || forceSend) {
        const submittedLeaves = [];

        try {
          const pSnap = await db.collection('data_pengajuan').get();
          pSnap.forEach(docSnap => {
            const p = docSnap.data();
            const isCuti = (p.tipe_form === "FORM_CUTI" || p.form_id === "F-ISO-CUTI" || (p.nama_form || "").toLowerCase().includes("cuti"));
            if (isCuti) {
              const submitDate = (p.tgl || p.createdAt || p.created_at || p.tanggal_pengajuan || "").substring(0, 10);
              if (submitDate === todayStr) {
                submittedLeaves.push({
                  nama: p.nama_pemohon || p.pemohon || p.nama || "Karyawan",
                  nik: p.nik_pemohon || p.nik || "-",
                  jabatan: p.jabatan || p.posisi || "-",
                  divisi: p.divisi || p.departemen || "-",
                  cabang: p.cabang || "Cirebon",
                  jenis_cuti: p.kategori_cuti || p.jenis_cuti || "Cuti Tahunan",
                  periode: `${formatIndoDate(p.tanggal_mulai)}${p.tanggal_selesai && p.tanggal_selesai !== p.tanggal_mulai ? ' s/d ' + formatIndoDate(p.tanggal_selesai) : ''}`,
                  durasi: `${p.jumlah_hari || 1} Hari`,
                  status: p.status_final || p.status || "MENUNGGU",
                  alasan: p.alasan || p.keterangan || "-"
                });
              }
            }
          });
        } catch (eP) {
          console.warn("Err reading submitted leaves:", eP.message);
        }

        // Group by Cabang
        const branchGroups = {};
        submittedLeaves.forEach(item => {
          const cab = item.cabang || "Cirebon";
          if (!branchGroups[cab]) branchGroups[cab] = [];
          branchGroups[cab].push(item);
        });

        const allTargetBranches = Object.keys(branchConfig.branches || {});
        if (!allTargetBranches.includes("Cirebon")) allTargetBranches.push("Cirebon");

        for (const cab of allTargetBranches) {
          if (targetBranchParam && cab.toLowerCase() !== targetBranchParam.toLowerCase()) continue;

          const cabCfg = branchConfig.branches?.[cab] || {};
          if (cabCfg.enabled === false && !forceSend) continue;

          const targetEmails = Array.isArray(cabCfg.emails) ? cabCfg.emails.filter(Boolean) : (cabCfg.emails || "").split(",").map(s => s.trim()).filter(Boolean);
          const emailTo = targetEmails.length > 0 ? targetEmails.join(", ") : (branchConfig.default_cc || "generalaffairhrandelajaya@gmail.com");
          const cc = cabCfg.cc || branchConfig.default_cc || "";

          const listPengajuanCabang = branchGroups[cab] || [];

          const tableHeaders = [
            { label: "No", align: "center" },
            { label: "Nama & NIK", align: "left" },
            { label: "Jabatan", align: "left" },
            { label: "Jenis Cuti", align: "left" },
            { label: "Rencana Periode", align: "left" },
            { label: "Durasi", align: "center" },
            { label: "Status Approval", align: "center" },
            { label: "Alasan", align: "left" }
          ];

          const tableRows = listPengajuanCabang.map((item, idx) => {
            const st = item.status.toUpperCase();
            const badgeBg = st === "APPROVED" || st === "DISETUJUI" ? "#dcfce7" : (st === "REJECTED" || st === "DITOLAK" ? "#ffe4e6" : "#fef3c7");
            const badgeColor = st === "APPROVED" || st === "DISETUJUI" ? "#166534" : (st === "REJECTED" || st === "DITOLAK" ? "#9f1239" : "#92400e");

            return [
              `<span style="font-weight: bold; color: #64748b;">${idx + 1}</span>`,
              `<b>${escapeHtml(item.nama)}</b><br><span style="font-size: 11px; color: #64748b; font-family: monospace;">${escapeHtml(item.nik)}</span>`,
              `${escapeHtml(item.jabatan)}`,
              `<span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-weight: bold; font-size: 11px; background-color: #f1f5f9; color: #334155;">${escapeHtml(item.jenis_cuti)}</span>`,
              `<b style="color: #7a1f2b;">${escapeHtml(item.periode)}</b>`,
              `<b>${escapeHtml(item.durasi)}</b>`,
              `<span style="background-color: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">${escapeHtml(item.status)}</span>`,
              `<span style="font-size: 12px; color: #475569;">${escapeHtml(item.alasan)}</span>`
            ];
          });

          const htmlBody = buildEmailHtml({
            badgeText: "🌇 REKAP SORE (17:00 WIB) • PENGAJUAN CUTI HARI INI",
            title: `Rekap Pengajuan Cuti Karyawan (${todayFormatted})`,
            subtitle: `Wilayah Cabang / Penempatan: ${cab.toUpperCase()}`,
            introText: listPengajuanCabang.length > 0
              ? `Berikut adalah rekap <strong>${listPengajuanCabang.length} pengajuan cuti baru</strong> yang diajukan oleh karyawan <strong>Cabang ${escapeHtml(cab)}</strong> pada hari ini, <strong>${todayFormatted}</strong>:`
              : `Pemberitahuan sore hari: Pada hari ini, <strong>${todayFormatted}</strong>, <strong>tidak ada pengajuan cuti baru</strong> yang diajukan oleh karyawan di <strong>Cabang ${escapeHtml(cab)}</strong>.`,
            tableHeaders,
            tableRows,
            footerNote: "Atasan Langsung dan HRD diharapkan segera meninjau dan memberikan persetujuan pada menu Persetujuan HRIS."
          });

          if (listPengajuanCabang.length > 0 || forceSend) {
            try {
              const info = await getTransporter().sendMail({
                from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
                to: emailTo,
                cc: cc || undefined,
                subject: `[REKAP PENGAJUAN SORE] ${listPengajuanCabang.length} Pengajuan Cuti (${todayFormatted}) - Cabang ${cab}`,
                html: htmlBody
              });
              results.push({ type: "evening", branch: cab, count: listPengajuanCabang.length, to: emailTo, messageId: info.messageId, status: "SENT" });
            } catch (sendErr) {
              console.error(`Gagal kirim email sore cabang ${cab}:`, sendErr);
              results.push({ type: "evening", branch: cab, count: listPengajuanCabang.length, to: emailTo, error: sendErr.message, status: "FAILED" });
            }
          } else {
            results.push({ type: "evening", branch: cab, count: 0, status: "SKIPPED (No applications)" });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      date: todayStr,
      date_formatted: todayFormatted,
      results
    });

  } catch (error) {
    console.error("CRASH SERVER (cron-rekap-cuti):", error);
    return res.status(500).json({
      success: false,
      error: "Server Error: " + error.message
    });
  }
};
