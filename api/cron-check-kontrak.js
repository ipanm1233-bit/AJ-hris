/**
 * =====================================================================
 * CRON CHECK KONTRAK — ENGINE SIKLUS EVALUASI KONTRAK & PROBATION
 * Terinspirasi blueprint "Sistem Evaluasi Kontrak & Probation" (Mekari):
 *   1. Setiap hari (00:10 WIB, Vercel Cron) memeriksa karyawan PKWT /
 *      PROBATION yang kontraknya berakhir dalam N hari (default 30).
 *   2. Membuat draft evaluasi baru di koleksi `evaluation_cycles`
 *      (status PENDING) dengan reviewer = atasan langsung (field
 *      `atasan` di master_karyawan).
 *   3. Mengirim notifikasi: email (nodemailer), in-app (koleksi
 *      `notifications`), dan push FCM ke reviewer.
 *   4. Reminder harian mulai H-15 selama reviewer belum submit, dan
 *      digest harian ke HRD/SUPERADMIN (draft baru, belum dikerjakan,
 *      kontrak sudah lewat).
 * Idempoten: ID siklus deterministik `EVC-<nik>-<tgl_akhir>` + `cron_locks`
 * untuk email/push (pola sama dengan api/cron-rekap-cuti.js).
 *
 * Konfigurasi (app_settings/evaluation_cycle_config):
 *   enabled             (bool, default true)
 *   trigger_days        (int, default 30)  — H-x pembuatan draft
 *   remind_start_days   (int, default 15)  — mulai reminder harian
 *   exclude_status      (array string, default ["PKWTT","TETAP"])
 * =====================================================================
 */
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const nodemailer = require('nodemailer');
const { requireCronSecret, enforceRateLimit, writeAuditLog } = require('../lib/security.js');

const DEFAULT_CONFIG = {
  enabled: true,
  trigger_days: 30,
  remind_start_days: 15,
  exclude_status: ["PKWTT", "TETAP"],
};
const EMAIL_FIELDS = ["email", "email_karyawan", "email_perusahaan", "email_pribadi", "email_personal", "email_aktif", "auth_email"];

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      disableFileAccess: true,
      disableUrlAccess: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
  }
  return transporter;
}

function getWibDateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(d);
}

function toDateOnly(value) {
  if (!value) return "";
  if (typeof value?.toDate === "function") return getWibDateStr(value.toDate());
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.substring(0, 10) : getWibDateStr(parsed);
}

function daysBetween(fromStr, toStr) {
  const a = new Date(`${fromStr}T00:00:00Z`).getTime();
  const b = new Date(`${toStr}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
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
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function pickEmail(data) {
  for (const f of EMAIL_FIELDS) {
    const v = String(data?.[f] || "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !v.endsWith("@auth.andelajaya.internal")) return v;
  }
  return "";
}

function buildEmailHtml({ badgeText, title, introText, tableRows, footerNote }) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#7a1f2b 0%,#4a0e17 100%);padding:24px 28px;color:#fff">
      <table style="width:100%"><tr>
        <td>
          <div style="display:inline-block;background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:8px">${escapeHtml(badgeText)}</div>
          <h1 style="margin:0;font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(title)}</h1>
        </td>
        <td style="text-align:right;vertical-align:middle"><div style="background:#fff;border-radius:10px;padding:6px 10px;display:inline-block"><span style="color:#7a1f2b;font-weight:900;font-size:13px;letter-spacing:1px">ANDELA JAYA</span></div></td>
      </tr></table>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 16px;font-size:13.5px;color:#334155;line-height:1.6">${introText}</p>
      <div style="margin:18px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12.5px;color:#1e293b">
          <thead><tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0">
            <th style="padding:10px 12px">Karyawan</th><th style="padding:10px 12px">Jabatan</th><th style="padding:10px 12px">Kontrak Berakhir</th><th style="padding:10px 12px">Sisa</th><th style="padding:10px 12px">Status Siklus</th>
          </tr></thead>
          <tbody>${tableRows.join("")}</tbody>
        </table>
      </div>
      ${footerNote ? `<div style="margin-top:20px;padding:12px 16px;background:#fff1f2;border-left:4px solid #be123c;border-radius:8px"><p style="margin:0;font-size:12px;color:#881337;line-height:1.5">${footerNote}</p></div>` : ""}
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#64748b">Sistem HRIS &amp; Operasional CV Andela Jaya &bull; Siklus Evaluasi Kontrak</p>
      <p style="margin:4px 0 0;font-size:10.5px;color:#94a3b8">Email ini dikirim otomatis oleh sistem sesuai jadwal ketentuan perusahaan.</p>
    </div>
  </div>`;
}

/* Matriks baris untuk email ringkasan. rows: [{nama, jabatan, akhir, sisa, status}] */
function buildRows(items) {
  const badge = (status) => {
    const s = String(status || "PENDING").toUpperCase();
    const color = s === "PENDING" ? "#fef3c7|#92400e" : s === "IN_PROGRESS" ? "#dbeafe|#1e40af" : s === "SUBMITTED_TO_HR" ? "#dcfce7|#166534" : s === "OVERDUE" ? "#ffe4e6|#9f1239" : "#e2e8f0|#334155";
    const [bg, fg] = color.split("|");
    return `<span style="background:${bg};color:${fg};padding:3px 8px;border-radius:6px;font-weight:700;font-size:11px">${escapeHtml(s.replace(/_/g, " "))}</span>`;
  };
  return items.map((it, idx) => `<tr style="border-bottom:1px solid #f1f5f9;${idx % 2 === 1 ? "background:#fafbfd" : ""}">
    <td style="padding:10px 12px"><b>${escapeHtml(it.nama)}</b><br><span style="font-size:11px;color:#64748b;font-family:monospace">${escapeHtml(it.nik || "-")}</span></td>
    <td style="padding:10px 12px">${escapeHtml(it.jabatan || "-")}<br><span style="font-size:11px;color:#64748b">${escapeHtml(it.cabang || "-")}</span></td>
    <td style="padding:10px 12px"><b style="color:#7a1f2b">${escapeHtml(formatIndoDate(it.akhir))}</b></td>
    <td style="padding:10px 12px;font-weight:700">${it.sisa == null ? "-" : (it.sisa <= 0 ? "HABIS/LEWAT" : `${it.sisa} hari`)}</td>
    <td style="padding:10px 12px">${badge(it.status)}</td>
  </tr>`);
}

/* =====================================================================
 * PIP — pengingat email otomatis per periode evaluasi
 * Hanya program berstatus AKTIF dengan email_mode = OTOMATIS.
 * Idempoten per program + periode (harian/mingguan/bulanan) via cron_locks.
 * ===================================================================== */
const PIP_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function pipPeriodKey(period, dateStr) {
  const mode = String(period || "MINGGUAN").toUpperCase();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || "")) ? String(dateStr) : getWibDateStr();
  if (mode === "HARIAN") return base;
  if (mode === "BULANAN") return base.slice(0, 7);
  const d = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return base;
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

function pipPeriodLabel(period, dateStr) {
  const mode = String(period || "MINGGUAN").toUpperCase();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || "")) ? String(dateStr) : getWibDateStr();
  const [y, m] = base.split("-");
  if (mode === "HARIAN") return `Harian ${formatIndoDate(base)}`;
  if (mode === "BULANAN") return `Bulanan ${PIP_MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
  const start = pipPeriodKey("MINGGUAN", base);
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return `Mingguan ${formatIndoDate(start)} - ${formatIndoDate(endDate.toISOString().slice(0, 10))}`;
}

function pipRoundForDate(rounds, dateStr) {
  const list = Array.isArray(rounds) ? rounds : [];
  const match = list.find(r => {
    const start = toDateOnly(r.start);
    const end = toDateOnly(r.end);
    return start && end && start <= dateStr && dateStr <= end;
  });
  return match || list.find(r => String(r.status || "").toUpperCase() === "PENDING") || list[list.length - 1] || null;
}

function buildPipEmailHtml({ program, round, periodLabel, recipientName, recipientRole, isEmployee, appUrl }) {
  const roundRows = (program.rounds || []).map(item => `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11.5px">Babak ${escapeHtml(item.index)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11.5px">${formatIndoDate(toDateOnly(item.start))} - ${formatIndoDate(toDateOnly(item.end))}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11.5px">${escapeHtml(String(item.status || "").toUpperCase() === "PENDING" ? "Berjalan / menunggu" : item.status || "-")}</td>
  </tr>`).join("");
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#7a1f2b 0%,#4a0e17 100%);padding:24px 28px;color:#fff">
      <div style="display:inline-block;background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:8px">PIP • PERFORMANCE IMPROVEMENT</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(isEmployee ? `Jadwal Evaluasi PIP - ${periodLabel}` : `Tugas Penilaian PIP - ${program.nama_karyawan || "-"}`)}</h1>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 14px;font-size:13.5px;color:#334155;line-height:1.6">
        ${isEmployee
          ? `Halo <b>${escapeHtml(recipientName || "-")}</b>, program Performance Improvement (PIP) Anda sedang berjalan. Berikut jadwal evaluasi periode <b>${escapeHtml(periodLabel)}</b> bersama evaluator yang ditunjuk.`
          : `Halo <b>${escapeHtml(recipientName || "-")}</b>, Anda ditunjuk sebagai evaluator PIP (<b>${escapeHtml(recipientRole || "Evaluator")}</b>) untuk <b>${escapeHtml(program.nama_karyawan || "-")}</b>. Mohon lakukan penilaian pada periode <b>${escapeHtml(periodLabel)}</b>.`}
      </p>
      <div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:12px;color:#334155">
        <p style="margin:0 0 4px"><b>Periode evaluasi:</b> ${escapeHtml(periodLabel)}</p>
        <p style="margin:0 0 4px"><b>Babak:</b> ${escapeHtml(String(round?.index ?? "-"))} (${formatIndoDate(toDateOnly(round?.start))} - ${formatIndoDate(toDateOnly(round?.end))})</p>
        <p style="margin:0 0 4px"><b>Standar nilai lulus:</b> ${escapeHtml(String(Number(program.standar_nilai) || 75))}</p>
        <p style="margin:0"><b>Evaluator:</b> ${escapeHtml((program.evaluators || []).map(e => `${e.nama} (${e.peran})`).join(", ") || program.evaluator || "-")}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11.5px;color:#1e293b">
        <thead><tr style="background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase"><th style="padding:6px 8px">Babak</th><th style="padding:6px 8px">Periode</th><th style="padding:6px 8px">Status</th></tr></thead>
        <tbody>${roundRows || `<tr><td colspan="3" style="padding:8px;font-size:11.5px;color:#64748b">Belum ada babak evaluasi.</td></tr>`}</tbody>
      </table>
      <p style="font-size:12px;color:#475569;margin:16px 0 0">${isEmployee ? "Silakan pantau perkembangan Anda dan koordinasikan dengan evaluator." : "Silakan buka menu Penilaian & Kontrak → PIP untuk mengisi penilaian."}</p>
      <p style="margin:8px 0 0"><a href="${escapeHtml(appUrl)}/#/penilaian-kontrak?tab=pip" style="color:#7a1f2b;font-weight:700;font-size:12.5px">Buka Program PIP →</a></p>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#64748b">Sistem HRIS &amp; Operasional CV Andela Jaya • Performance Improvement Plan</p>
      <p style="margin:4px 0 0;font-size:10.5px;color:#94a3b8">Email ini dikirim otomatis sesuai jadwal periode evaluasi PIP.</p>
    </div>
  </div>`;
}

async function processPipEmails(db, appUrl) {
  const summary = { programs: 0, sent: 0, skipped: 0, failed: 0 };
  const todayStr = getWibDateStr();
  let programsSnap;
  try {
    programsSnap = await db.collection('pip_programs').where('status', '==', 'AKTIF').get();
  } catch (error) {
    programsSnap = await db.collection('pip_programs').get();
  }
  const targets = programsSnap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .filter(item => String(item.data.status || "").toUpperCase() === "AKTIF" && String(item.data.email_mode || "").toUpperCase() === "OTOMATIS");
  if (!targets.length) return summary;

  let karyawanSnap;
  try { karyawanSnap = await db.collection('master_karyawan').get(); } catch (error) { karyawanSnap = { forEach() {} }; }
  const byNik = new Map();
  const byNama = new Map();
  karyawanSnap.forEach(d => {
    const data = d.data();
    const nik = String(data.nik_karyawan || data.nik || d.id).trim();
    const nama = String(data.nama_karyawan || data.nama || "").trim().toUpperCase();
    if (nik) byNik.set(nik, data);
    if (nama) byNama.set(nama, data);
  });
  const lookupEmail = (nik, nama) => pickEmail((nik && byNik.get(String(nik).trim())) || (nama && byNama.get(String(nama).trim().toUpperCase())) || {});

  for (const item of targets) {
    const program = item.data;
    summary.programs += 1;
    const round = pipRoundForDate(program.rounds, todayStr);
    if (!round) { summary.skipped += 1; continue; }
    const periodKey = pipPeriodKey(program.periode_penilaian, todayStr);
    if ((program.email_sent_periods || []).map(String).includes(periodKey)) { summary.skipped += 1; continue; }
    const periodLabel = pipPeriodLabel(program.periode_penilaian, todayStr);

    const recipients = [];
    const pushRecipient = (person) => {
      const email = String(person.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      if (recipients.some(r => r.email.toLowerCase() === email.toLowerCase())) return;
      recipients.push({ ...person, email });
    };
    pushRecipient({
      role: "KARYAWAN", roleLabel: "Karyawan PIP",
      nama: program.nama_karyawan || "-", nik: program.karyawan_nik || "",
      email: String(program.email_karyawan || "").trim() || lookupEmail(program.karyawan_nik, program.nama_karyawan)
    });
    for (const evaluator of (program.evaluators || [])) {
      pushRecipient({
        role: evaluator.peran || "EVALUATOR",
        roleLabel: evaluator.peran === "HR" ? "HR" : evaluator.peran === "ATASAN" ? "Atasan" : evaluator.peran === "REKAN" ? "Rekan Kerja" : "Evaluator",
        nama: evaluator.nama || "-", nik: evaluator.nik || "",
        email: String(evaluator.email || "").trim() || lookupEmail(evaluator.nik, evaluator.nama)
      });
    }
    if (!recipients.length) { summary.skipped += 1; continue; }

    let sent = 0;
    let failed = false;
    for (const recipient of recipients) {
      const isEmployee = recipient.role === "KARYAWAN";
      const delivery = await sendCronMailOnce(db, `pip_${item.id}_${periodKey}_${recipient.email}`, {
        from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
        to: recipient.email,
        subject: `[PIP] ${program.nama_karyawan || "Karyawan"} - ${periodLabel}`,
        html: buildPipEmailHtml({ program, round, periodLabel, recipientName: recipient.nama, recipientRole: recipient.roleLabel, isEmployee, appUrl })
      });
      if (delivery.error) failed = true;
      if (!delivery.skipped && !delivery.error) sent += 1;
    }
    if (!sent && failed) { summary.failed += 1; continue; }
    if (!sent) { summary.skipped += 1; continue; }

    const now = new Date().toISOString();
    const emailLog = [...(program.email_log || []), {
      round: Number(round.index), period_key: periodKey, period_label: periodLabel,
      at: now, recipients: recipients.map(r => r.email), by: "CRON"
    }].slice(-50);
    await db.collection('pip_programs').doc(item.id).set({
      email_sent_periods: [...new Set([...(program.email_sent_periods || []).map(String), periodKey])],
      email_sent_rounds: [...new Set([...(program.email_sent_rounds || []).map(Number), Number(round.index)])],
      email_last_at: now,
      email_log: emailLog,
      updated_at: now
    }, { merge: true });

    for (const recipient of recipients) {
      try {
        await writeInAppNotif(db, { username: recipient.nama, nama: recipient.nama, nik: recipient.nik },
          recipient.role === "KARYAWAN" ? `Jadwal Evaluasi PIP - ${periodLabel}` : `Tugas Penilaian PIP - ${program.nama_karyawan || "-"}`,
          `Periode evaluasi ${periodLabel} (Babak ${round.index}) berjalan.`,
          "/#/penilaian-kontrak?tab=pip");
      } catch (error) { /* notifikasi in-app opsional */ }
    }
    summary.sent += sent;
  }
  return summary;
}

/* Kirim email sekali per lock (pola cron-rekap-cuti) */
async function sendCronMailOnce(db, lockId, mailOptions) {
  const ref = db.collection('cron_locks').doc(lockId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 240));
  const maySend = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const existing = snap.exists ? snap.data() : null;
    if (existing?.status === 'SENT') return false;
    const startedAt = existing?.started_at ? new Date(existing.started_at).getTime() : 0;
    if (existing?.status === 'SENDING' && Date.now() - startedAt < 15 * 60_000) return false;
    transaction.set(ref, { status: 'SENDING', started_at: new Date().toISOString(), attempts: (existing?.attempts || 0) + 1 }, { merge: true });
    return true;
  });
  if (!maySend) return { skipped: true };
  try {
    const info = await getTransporter().sendMail(mailOptions);
    await ref.set({ status: 'SENT', sent_at: new Date().toISOString(), message_id: info.messageId }, { merge: true });
    return { skipped: false, info };
  } catch (error) {
    await ref.set({ status: 'FAILED', failed_at: new Date().toISOString(), error: String(error.message || error).slice(0, 500) }, { merge: true });
    return { skipped: false, error: String(error.message || error).slice(0, 300) };
  }
}

/* Tulis notifikasi in-app (pola payload notifyUser di utils.js) */
async function writeInAppNotif(db, target, judul, pesan, link) {
  const aliases = [target.username, target.username?.toLowerCase(), target.nama, target.nama?.toLowerCase(), target.nik, target.nik?.toLowerCase()].filter(Boolean);
  await db.collection('notifications').add({
    username_target: String(target.username || ""),
    nama_target: String(target.nama || ""),
    nik_target: String(target.nik || ""),
    target_aliases: aliases,
    judul, pesan,
    link: link || "",
    dibaca: false,
    tanggal: new Date().toISOString()
  });
}

/* Kumpulkan token FCM satu orang dari users + master_karyawan */
function collectTokens(userData, karyawanData) {
  const tokens = new Set();
  for (const src of [userData, karyawanData]) {
    if (!src) continue;
    if (Array.isArray(src.fcm_tokens)) src.fcm_tokens.forEach(t => t && tokens.add(String(t)));
    if (src.fcm_token) tokens.add(String(src.fcm_token));
  }
  return [...tokens].filter(Boolean).slice(0, 8);
}

async function pushTokens(admin, tokens, title, body, link) {
  if (!tokens.length) return;
  try {
    await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      webpush: link ? { fcmOptions: { link } } : undefined,
      tokens
    });
  } catch (err) {
    console.warn("Push FCM gagal:", err?.message || err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  if (!enforceRateLimit(req, res, { namespace: 'cron-contract', limit: 5, windowMs: 60_000 })) return;
  if (!requireCronSecret(req, res)) return;
  const { admin, db, error } = getFirebaseAdmin();
  if (!admin || !db) {
    return res.status(500).json({ success: false, error: error || "Firebase Admin environment variables are not configured." });
  }

  try {
    const todayStr = getWibDateStr();
    const appUrl = process.env.APP_URL || "https://hris.andelajaya.com";
    const routeLink = `${appUrl}/#/penilaian-kontrak?tab=siklus`;

    /* PIP: email otomatis per periode evaluasi (independen dari siklus kontrak) */
    let pipSummary = { programs: 0, sent: 0, skipped: 0, failed: 0 };
    try {
      pipSummary = await processPipEmails(db, appUrl);
    } catch (ePip) {
      console.warn("Email PIP otomatis gagal:", ePip?.message || ePip);
      pipSummary = { error: String(ePip?.message || ePip).slice(0, 300) };
    }

    /* 1. Konfigurasi */
    let cfg = { ...DEFAULT_CONFIG };
    try {
      const cfgSnap = await db.collection('app_settings').doc('evaluation_cycle_config').get();
      if (cfgSnap.exists) cfg = { ...cfg, ...cfgSnap.data() };
    } catch (eCfg) { console.warn("Konfigurasi siklus gagal dibaca:", eCfg.message); }
    if (!cfg.enabled) {
      await writeAuditLog(db, req, null, { action: 'CRON_EVAL_CYCLE', module: 'CONTRACT', metadata: { skipped: "config disabled", pip: pipSummary } });
      return res.status(200).json({ success: true, message: "Siklus evaluasi kontrak dinonaktifkan via konfigurasi.", date: todayStr, pip: pipSummary });
    }
    const triggerDays = Math.max(1, Number(cfg.trigger_days) || 30);
    const remindDays = Math.max(0, Number(cfg.remind_start_days) || 15);
    const excludeStatus = (cfg.exclude_status || DEFAULT_CONFIG.exclude_status).map(s => String(s).toUpperCase());

    /* 2. Muat data dasar */
    const [karyawanSnap, kontrakSnap, usersSnap, cyclesSnap] = await Promise.all([
      db.collection('master_karyawan').get(),
      db.collection('master_kontrak').get(),
      db.collection('users').get(),
      db.collection('evaluation_cycles').where('status', 'in', ["PENDING", "IN_PROGRESS", "SUBMITTED_TO_HR", "COMPLETED", "BATAL"]).get().catch(async () => {
        // fallback bila field status belum bagus utk query 'in'
        return db.collection('evaluation_cycles').get();
      })
    ]);

    /* index master_karyawan per NIK & per NAMA */
    const karyawanByNik = new Map();
    const karyawanByNama = new Map();
    karyawanSnap.forEach(d => {
      const data = d.data();
      const nik = String(data.nik_karyawan || data.nik || d.id).trim();
      const nama = String(data.nama_karyawan || data.nama || "").trim();
      if (nik) karyawanByNik.set(nik, data);
      if (nama) karyawanByNama.set(nama.toUpperCase(), data);
    });

    /* index users per nik/nama untuk email-username-token reviewer */
    const usersIndex = [];
    usersSnap.forEach(d => {
      const data = d.data();
      usersIndex.push({
        id: d.id,
        username: String(data.username || d.id || "").trim(),
        nama: String(data.nama || "").trim(),
        nik: String(data.nik || "").trim(),
        role: String(data.role || "").toUpperCase(),
        email: pickEmail(data),
        data
      });
    });

    /* Rencana HRD/SUPERADMIN (penerima digest & summary) */
    const hrdUsers = usersIndex.filter(u => u.role === "HRD" || u.role === "SUPERADMIN");

    /* 3. Kandidat kontrak berakhir dalam window */
    const existingCycleKeys = new Set();
    cyclesSnap.forEach(d => existingCycleKeys.add(d.id));

    const candidates = []; // {kontrakId, kontrak, karyawan, nik, akhir}
    kontrakSnap.forEach(d => {
      const kontrak = d.data();
      const akhir = toDateOnly(kontrak.tanggal_akhir || kontrak.tgl_akhir_kontrak || "");
      if (!akhir) return; // PKWTT / tanpa tanggal akhir → skip
      const nik = String(kontrak.nik_karyawan || kontrak.nik || "").trim();
      const nama = String(kontrak.nama_karyawan || "").trim();
      const karyawan = (nik && karyawanByNik.get(nik)) || karyawanByNama.get(nama.toUpperCase()) || {};
      const statusKar = String(karyawan.status_karyawan || "").toUpperCase();
      if (excludeStatus.includes(statusKar)) return;
      if (String(karyawan.aktif_tdk_aktif || "AKTIF").toUpperCase() === "TIDAK AKTIF") return;
      const mulai = toDateOnly(kontrak.tanggal_mulai || "");
      if (mulai && akhir < todayStr) return; // usang: periode sudah lewat, HRD tidak memperpanjang row ini
      const sisa = daysBetween(todayStr, akhir);
      if (sisa === null || sisa < 0 || sisa > triggerDays) return;
      candidates.push({
        kontrakId: d.id, kontrak, karyawan, nik: nik || "", sisa, akhir
      });
    });

    /* Hapus kandidat duplikat nama: keep kontrak_ke tertinggi per person */
    const byPerson = new Map();
    for (const c of candidates) {
      const key = c.nik || String(c.karyawan?.nama_karyawan || c.kontrak?.nama_karyawan || "").toUpperCase();
      const prev = byPerson.get(key);
      if (!prev || Number(c.kontrak.kontrak_ke || 0) > Number(prev.kontrak.kontrak_ke || 0)) byPerson.set(key, c);
    }
    const finalCandidates = [...byPerson.values()];

    let created = [];
    for (const cand of finalCandidates) {
      const akhir = cand.akhir;
      const nik = cand.nik || nikFallback(cand.karyawan, cand.kontrak);
      const cycleId = `EVC-${(nik || String(cand.karyawan.nama_karyawan || "").toUpperCase()).replace(/[^a-zA-Z0-9_-]/g, "-")}-${akhir}`;
      if (existingCycleIdsHas(cycleId, existingCycleKeys)) continue;

      /* reviewer = atasan langsung */
      const atasanNama = String(cand.karyawan.atasan || "").trim();
      const atasanKaryawan = atasanNama ? (karyawanByNama.get(atasanNama.toUpperCase()) || {}) : {};
      const atasanNik = String(atasanKaryawan.nik_karyawan || atasanKaryawan.nik || "").trim();
      const atasanUser = usersIndex.find(u =>
        (atasanNik && u.nik === atasanNik) ||
        (atasanNama && (u.nama.toLowerCase() === atasanNama.toLowerCase() || u.username.toLowerCase() === atasanNama.toLowerCase()))
      ) || null;

      /* tentukan penerima notifikasi: reviewer, fallback HRD */
      const reviewer = {
        nama: atasanNama || "HRD",
        nik: atasanNik || "",
        username: atasanUser?.username || "",
        email: atasanUser?.email || pickEmail(atasanKaryawan) || "",
        tokens: atasanUser ? collectTokens(atasanUser.data, atasanKaryawan) : []
      };

      const cycleDoc = {
        nik_karyawan: nik || "",
        nama_karyawan: String(cand.karyawan.nama_karyawan || cand.kontrak.nama_karyawan || "").trim(),
        jabatan: String(cand.karyawan.jabatan || cand.kontrak.jabatan || "").trim(),
        divisi: String(cand.karyawan.divisi || cand.kontrak.divisi || "").trim(),
        cabang: String(cand.karyawan.cabang || cand.kontrak.cabang || "").trim(),
        kontrak_id: cand.kontrakId,
        kontrak_ke: Number(cand.kontrak.kontrak_ke || 1),
        tanggal_mulai: toDateOnly(cand.kontrak.tanggal_mulai || ""),
        tanggal_akhir: akhir,
        sisa_hari: cand.sisa,
        status_karyawan: String(cand.karyawan.status_karyawan || "").toUpperCase(),
        status: "PENDING",
        reviewer_nama: reviewer.nama,
        reviewer_nik: reviewer.nik || "",
        reviewer_username: reviewer.username,
        reviewer_email: reviewer.email,
        bobot_kategori: DEFAULT_KATEGORI_BOBOT(),
        reminders: 0,
        last_reminder_date: "",
        created_at: new Date().toISOString(),
        created_by: "CRON",
        source: "CRON_H-" + triggerDays
      };

      await db.collection('evaluation_cycles').doc(cycleId).set(cycleDoc);
      existingCycleKeys.add(cycleId);

      const sisaLabel = `${cand.sisa} hari`;
      const judul = `Tindakan Diperlukan: Evaluasi Kontrak ${cycleDoc.nama_karyawan}`;
      const pesan = `Kontrak ke-${cycleDoc.kontrak_ke} ${cycleDoc.nama_karyawan} berakhir ${formatIndoDate(akhir)} (${sisaLabel}). Silakan isi evaluasi kontrak di modul Penilaian & Kontrak, tab Siklus Evaluasi.`;

      await pushTokens(admin, reviewer.tokens, judul, pesan, routeLink);
      await writeInAppNotif(db, { username: reviewer.username || reviewer.nama, nama: reviewer.nama, nik: reviewer.nik }, judul, pesan, "/#/penilaian-kontrak?tab=siklus");

      const mailTarget = reviewer.email;
      let mailStatus = "SKIPPED (no email)";
      if (mailTarget) {
        const html = buildEmailHtml({
          badgeText: "TINDAK DIPERLUKAN • EVALUASI KONTRAK",
          title: `Evaluasi Kontrak: ${cycleDoc.nama_karyawan}`,
          introText: `Kontrak <b>${escapeHtml(cycleDoc.nama_karyawan)}</b> (NIK ${escapeHtml(nik || "-")}) — <b>Kontrak Ke-${cycleDoc.kontrak_ke}</b> — akan berakhir pada <b>${formatIndoDate(akhir)}</b> (${sisaLabel} dari sekarang).<br><br>Silakan masuk ke HRIS → <b>Penilaian &amp; Kontrak → tab Siklus Evaluasi</b> untuk mengisi skala penilaian 1–4, catatan, dan rekomendasi status akhir. Evaluasi ini wajib selesai sebelum tanggal berakhir kontrak.`,
          tableRows: buildRows([{ nama: cycleDoc.nama_karyawan, nik, jabatan: cycleDoc.jabatan, cabang: cycleDoc.cabang, akhir, sisa: cand.sisa, status: "PENDING" }]),
          footerNote: reviewer.nama === "HRD"
            ? "Atasan langsung karyawan ini belum terdata pada master. Mohon HRD tetapkan penilai manual via tab Siklus Evaluasi."
            : "Bila Anda bukan atasan langsung karyawan ini, harap hubungi HRD untuk delegasi reviewer."
        });
        const delivery = await sendCronMailOnce(db, `${cycleId}_created_h${triggerDays}`, {
          from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
          to: mailTarget,
          subject: `[Evaluasi Kontrak] ${cycleDoc.nama_karyawan} — Kontrak berakhir ${formatIndoDate(akhir)} (H-${cand.sisa})`,
          html
        });
        mailStatus = delivery.skipped ? "SKIPPED (already sent)" : (delivery.error ? "FAILED" : "SENT");
      }
      created.push({ id: cycleId, nama: cycleDoc.nama_karyawan, sisa: cand.sisa, reviewer: reviewer.nama, mail: mailStatus });
    }

    /* 4. Reminder harian H-15 untuk siklus belum disubmit */
    const reminderSent = [];
    const overdue = [];
    for (const docSnap of cyclesSnap.docs) {
      const cycle = docSnap.data();
      if (!["PENDING", "IN_PROGRESS"].includes(String(cycle.status || "PENDING"))) continue;
      const akhir = toDateOnly(cycle.tanggal_akhir || cycle.due_date || "");
      const sisa = daysBetween(todayStr, akhir);
      if (sisa === null) continue;
      if (sisa === null || sisa > remindDays) continue;
      if (String(cycle.last_reminder_date || "") === todayStr) continue;

      const isOver = sisa < 0;
      const judul = isOver
        ? `MENDESA: Kontrak ${cycle.nama_karyawan} sudah berakhir — evaluasi belum selesai`
        : `[Pengingat] Evaluasi Kontrak ${cycle.nama_karyawan} (H-${sisa})`;
      const pesan = isOver
        ? `Kontrak ${cycle.nama_karyawan} telah berakhir ${formatIndoDate(akhir)} namun evaluasi kontrak belum disubmit. Mohon segera diproses di tab Siklus Evaluasi.`
        : `Sisa waktu kontrak ${cycle.nama_karyawan}: ${sisa} hari (berakhir ${formatIndoDate(akhir)}). Mohon selesaikan evaluasi kontrak di tab Siklus Evaluasi.`;

      /* reviewer reminder */
      const revUser = usersIndex.find(u =>
        (cycle.reviewer_nik && u.nik === String(cycle.reviewer_nik)) ||
        (cycle.reviewer_username && u.username === String(cycle.reviewer_username)) ||
        (cycle.reviewer_nama && u.nama.toLowerCase() === String(cycle.reviewer_nama).toLowerCase())
      ) || null;
      const revKaryawan = karyawanByNik.get(String(cycle.reviewer_nik || "")) || karyawanByNama.get(String(cycle.reviewer_nama || "").toUpperCase()) || {};
      const revTokens = revUser ? collectTokens(revUser.data, revKaryawan) : [];
      await writeInAppNotif(db, { username: cycle.reviewer_username || cycle.reviewer_nama || "HRD", nama: cycle.reviewer_nama || "HRD", nik: cycle.reviewer_nik || "" }, judul, pesan, "/#/penilaian-kontrak?tab=siklus");
      await pushTokens(admin, revTokens, judul, pesan, routeLink);
      if (cycle.reviewer_email) {
        await sendCronMailOnce(db, `${docSnap.id}_remind_${todayStr}`, {
          from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
          to: cycle.reviewer_email,
          subject: isOver ? `[MENDESA] Evaluasi Kontrak ${cycle.nama_karyawan} belum diselesaikan` : `[Pengingat H-${sisa}] Evaluasi Kontrak ${cycle.nama_karyawan}`,
          html: buildEmailHtml({
            badgeText: isOver ? "MENDESA • EVALUASI BELUM SELESAI" : "PENGINGAT HARIAN • EVALUASI KONTRAK",
            title: `Evaluasi Kontrak: ${cycle.nama_karyawan}`,
            introText: `${pesan}<br><br>Jika Anda berhalangan menilai, beri tahu HRD untuk delegasi reviewer.`,
            tableRows: buildRows([{ nama: cycle.nama_karyawan, nik: cycle.nik_karyawan, jabatan: cycle.jabatan, cabang: cycle.cabang, akhir, sisa, status: isOver ? "OVERDUE" : cycle.status }]),
            footerNote: ""
          })
        });
      }

      /* overdue → HRD */
      if (isOver) {
        overdue.push({ nama: cycle.nama_karyawan, nik: cycle.nik_karyawan, jabatan: cycle.jabatan, cabang: cycle.cabang, akhir, sisa, status: "OVERDUE" });
        for (const hrd of hrdUsers) {
          await writeInAppNotif(db, { username: hrd.username, nama: hrd.nama || hrd.username, nik: hrd.nik }, `Kontrak ${cycle.nama_karyawan} berakhir tanpa evaluasi`, pesan, "/#/penilaian-kontrak?tab=siklus");
          await pushTokens(admin, collectTokens(hrd.data, karyawanByNama.get(String(hrd.nama || "").toUpperCase()) || {}), `Kontrak ${cycle.nama_karyawan} berakhir tanpa evaluasi`, pesan, routeLink);
        }
      }

      await db.collection('evaluation_cycles').doc(docSnap.id).set({
        reminders: Number(cycle.reminders || 0) + 1,
        last_reminder_date: todayStr,
        last_reminder_at: new Date().toISOString()
      }, { merge: true });
      reminderSent.push({ id: docSnap.id, sisa, overdue: isOver });
    }

    /* 5. Digest harian HRD (draft baru + daftar menunggu) */
    const pendingRows = [];
    for (const docSnap of cyclesSnap.docs) {
      const c = docSnap.data();
      if (!["PENDING", "IN_PROGRESS"].includes(String(c.status || "PENDING"))) continue;
      const akhir = toDateOnly(c.tanggal_akhir || c.due_date || "");
      const sisa = daysBetween(todayStr, akhir);
      const isOver = sisa !== null && sisa < 0;
      if (!created.some(cr => cr.id === docSnap.id) && !isOver && sisa !== null && sisa > remindDays) continue; // belum waktunya
      pendingRows.push({ nama: c.nama_karyawan, nik: c.nik_karyawan, jabatan: c.jabatan, cabang: c.cabang, akhir, sisa, status: isOver ? "OVERDUE" : c.status });
    }

    let digestStatus = "SKIPPED (nothing to report)";
    const hrdRows = pendingRows.length ? pendingRows : (created.length
      ? created.map(cr => ({ nama: cr.nama, nik: "", jabatan: "", cabang: "", akhir: finalCandidates.find(f => f.karyawan?.nama_karyawan === cr.nama)?.akhir || "", sisa: cr.sisa, status: "PENDING" }))
      : []);
    if (hrdRows.length) {
      const html = buildEmailHtml({
        badgeText: "DIGEST HARIAN • SIKLUS EVALUASI KONTRAK",
        title: `Ringkasan Siklus Evaluasi (${formatIndoDate(todayStr)})`,
        introText: `Rekap harian siklus evaluasi kontrak: <b>${created.length} draft baru</b> dibuat, <b>${pendingRows.length} masih menunggu</b> penilaian atasan${overdue.length ? `, <b>${overdue.length} kontrak sudah berakhir tanpa evaluasi</b>` : ""}.`,
        tableRows: buildRows(hrdRows.sort((a, b) => (a.sisa ?? 999) - (b.sisa ?? 999))),
        footerNote: "Aksi lanjutan tersedia pada HRIS → Penilaian &amp; Kontrak → tab Siklus Evaluasi (delegasi reviewer, validasi hasil, eksekusi keputusan)."
      });
      const to = hrdUsers.map(u => u.email).filter(Boolean).join(", ");
      if (to) {
        const delivery = await sendCronMailOnce(db, `${todayStr}_eval_digest`, {
          from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
          to,
          subject: `[Evaluasi Kontrak] ${created.length} draft baru · ${pendingRows.length} menunggu (${formatIndoDate(todayStr)})`,
          html
        });
        digestStatus = delivery.skipped ? "SKIPPED (already sent)" : (delivery.error ? "FAILED" : "SENT");
      } else {
        digestStatus = "SKIPPED (no HRD email)";
      }
    }

    await writeAuditLog(db, req, null, {
      action: 'CRON_EVAL_CYCLE', module: 'CONTRACT',
      metadata: { date: todayStr, candidates: finalCandidates.length, created: created.length, reminders: reminderSent.length, overdue: overdue.length, digest: digestStatus, pip: pipSummary }
    });

    return res.status(200).json({
      success: true,
      date: todayStr,
      trigger_days: triggerDays,
      remind_start_days: remindDays,
      candidates: finalCandidates.length,
      created,
      reminders: reminderSent.length,
      overdue: overdue.length,
      digest: digestStatus,
      pip: pipSummary
    });
  } catch (err) {
    console.error("Error in cron-check-kontrak:", err);
    res.status(500).json({ success: false, error: 'Siklus evaluasi kontrak gagal dijalankan.' });
  }
};

function DEFAULT_KATEGORI_BOBOT() {
  return {
    "Kinerja & Pencapaian Target": 25,
    "Disiplin & Kehadiran": 25,
    "Kualitas Kerja & Kompetensi": 25,
    "Kerja Sama & Perilaku": 25
  };
}

function nikFallback(karyawan, kontrak) {
  return String(karyawan?.nik_karyawan || karyawan?.nik || kontrak?.nik_karyawan || kontrak?.nik || "").trim();
}

function existingCycleIdsHas(id, set) {
  return set.has(id);
}
