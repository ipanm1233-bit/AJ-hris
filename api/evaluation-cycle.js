/**
 * =====================================================================
 * EVALUATION CYCLE ENDPOINT (/api/evaluation-cycle)
 * Sistem Evaluasi Kontrak & Probation (pola Mekari) — aksi siklus yang
 * membutuhkan otorisasi & audit:
 *   action = "start"   : reviewer mulai mengisi (PENDING → IN_PROGRESS)
 *   action = "submit"  : reviewer kirim hasil (→ SUBMITTED_TO_HR)
 *                        skala 1–4 per kategori berbobot + komentar wajib
 *                        + rekomendasi (PERMANEN|PERPANJANG|BERHENTI)
 *   action = "assign"  : HRD delegasi reviewer (edge case: reviewer
 *                        resign/cuti panjang)
 *   action = "complete": HRD/GM/DIREKTUR eksekusi keputusan akhir
 *                        (→ COMPLETED, menyimpan hr_keputusan)
 *   action = "cancel"  : HRD/GM/DIREKTUR batalkan siklus (→ BATAL)
 *
 * Notifikasi submit: email + in-app + push FCM ke seluruh HRD/SUPERADMIN.
 * Semua tindakan tercatat di `audit_logs` (kebutuhan ISO/kepatuhan).
 * =====================================================================
 */
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const nodemailer = require('nodemailer');
const { requireFirebaseAuth, enforceRateLimit, writeAuditLog } = require('../lib/security.js');

const REKOMENDASI = ["PERMANEN", "PERPANJANG", "BERHENTI"];
const DECISIONS = ["PERMANEN", "PERPANJANG", "BERHENTI"];
const HR_ROLES = ["HRD", "SUPERADMIN", "GM", "DIREKTUR"];
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

async function writeInAppNotif(db, target, judul, pesan, link) {
  const aliases = [target.username, String(target.username || "").toLowerCase(), target.nama, String(target.nama || "").toLowerCase(), target.nik, String(target.nik || "").toLowerCase()].filter(Boolean);
  await db.collection('notifications').add({
    username_target: String(target.username || ""),
    nama_target: String(target.nama || ""),
    nik_target: String(target.nik || ""),
    target_aliases: [...new Set(aliases)],
    judul, pesan,
    link: link || "",
    dibaca: false,
    tanggal: new Date().toISOString()
  });
}

function buildSubmitEmail(cycle, hasil, nilaiAkhir) {
  const kategoriHtml = Object.entries(hasil.skor_kategori || {})
    .map(([nama, skor]) => `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 12px">${escapeHtml(nama)}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:700">${escapeHtml(skor)}</td>
      <td style="padding:8px 12px;text-align:center">${escapeHtml((cycle.bobot_kategori || {})[nama] ?? 0)}%</td>
    </tr>`).join("");
  const rekLabel = hasil.rekomendasi === "PERMANEN" ? "Angkat Menjadi Karyawan Tetap (Permanent)"
    : hasil.rekomendasi === "PERPANJANG" ? "Perpanjang Kontrak (Extend Contract)"
    : "Tidak Dilanjutkan (Terminate)";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#7a1f2b 0%,#4a0e17 100%);padding:24px 28px;color:#fff">
      <div style="display:inline-block;background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;margin-bottom:8px">HASIL EVALUASI KONTRAK</div>
      <h1 style="margin:0;font-size:20px;font-weight:800">Validasi HR: ${escapeHtml(cycle.nama_karyawan)}</h1>
    </div>
    <div style="padding:24px 28px;color:#334155;font-size:13.5px;line-height:1.6">
      <p style="margin:0 0 8px"><b>${escapeHtml(cycle.nama_karyawan)}</b> (NIK ${escapeHtml(cycle.nik_karyawan || "-")}) — Kontrak Ke-${escapeHtml(String(cycle.kontrak_ke ?? 1))}, berakhir ${escapeHtml(cycle.tanggal_akhir || "-")}.</p>
      <p style="margin:0 0 12px">Reviewer <b>${escapeHtml(cycle.reviewer_nama || "-")}</b> telah mensubmit hasil evaluasi. Mohon validasi skor &amp; rekomendasi, lalu jalankan keputusan melalui <b>Penilaian &amp; Kontrak → tab Siklus Evaluasi</b>.</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;border-bottom:2px solid #e2e8f0">
            <th style="padding:8px 12px;text-align:left">Kategori</th><th style="padding:8px 12px">Skor (1–4)</th><th style="padding:8px 12px">Bobot</th>
          </tr></thead>
          <tbody>${kategoriHtml}</tbody>
          <tfoot><tr style="background:#f8fafc;font-weight:800">
            <td style="padding:8px 12px">Skor Akhir Tertimbang</td><td colspan="2" style="text-align:center;color:#7a1f2b">${escapeHtml(nilaiAkhir)}</td>
          </tr></tfoot>
        </table>
      </div>
      <p style="margin:12px 0 4px"><b>Rekomendasi Atasan:</b> ${escapeHtml(rekLabel)}</p>
      <div style="margin-top:12px;padding:12px 16px;background:#fff1f2;border-left:4px solid #be123c;border-radius:8px">
        <p style="margin:0;font-size:12px;color:#881337"><b>Catatan / Feedback:</b> ${escapeHtml(hasil.komentar || "-")}</p>
      </div>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#64748b">Sistem HRIS &amp; Operasional CV Andela Jaya &bull; Siklus Evaluasi Kontrak</p>
    </div>
  </div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan. Gunakan POST JSON.' });
  if (!enforceRateLimit(req, res, { namespace: 'evaluation-cycle', limit: 30, windowMs: 60_000 })) return;

  const authCtx = await requireFirebaseAuth(req, res);
  if (!authCtx) return;
  const { admin, db, user } = authCtx;

  const body = req.body || {};
  const action = String(body.action || "").toLowerCase();
  const cycleId = String(body.id || "").trim();

  try {
    if (!cycleId) return res.status(400).json({ success: false, error: 'ID siklus evaluasi wajib diisi.' });
    const cycleRef = db.collection('evaluation_cycles').doc(cycleId);
    const snap = await cycleRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Siklus evaluasi tidak ditemukan.' });
    const cycle = snap.data();
    const isManagementRole = HR_ROLES.includes(user.role);
    const isReviewer =
      (user.nik && String(cycle.reviewer_nik || "") === String(user.nik)) ||
      (user.username && String(cycle.reviewer_username || "") === String(user.username)) ||
      (user.name && String(user.name).trim().toUpperCase() === String(cycle.reviewer_nama || "").trim().toUpperCase());

    /* --------------------------------------------------------------- */
    /* START: reviewer mulai mengisi                                    */
    /* --------------------------------------------------------------- */
    if (action === 'start') {
      if (!isReviewer && !isManagementRole) {
        return res.status(403).json({ success: false, error: 'Hanya reviewer atau manajemen yang dapat memulai evaluasi.' });
      }
      if (String(cycle.status) !== 'PENDING') return res.status(400).json({ success: false, error: `Siklus berstatus ${cycle.status}, tidak dapat dimulai.` });
      const update = { status: 'IN_PROGRESS', started_at: new Date().toISOString(), started_by: user.username || user.nik };
      await cycleRef.set(update, { merge: true });
      await writeAuditLog(db, req, user, { action: 'EVAL_CYCLE_START', module: 'CONTRACT', recordId: cycleId, metadata: { karyawan: cycle.nama_karyawan } });
      return res.status(200).json({ success: true, update });

    /* --------------------------------------------------------------- */
    /* SUBMIT: reviewer kirim hasil penilaian                           */
    /* --------------------------------------------------------------- */
    } else if (action === 'submit') {
      if (!isReviewer && !isManagementRole) {
        return res.status(403).json({ success: false, error: 'Hanya reviewer atau manajemen yang dapat mensubmit evaluasi ini.' });
      }
      if (["SUBMITTED_TO_HR", "COMPLETED"].includes(String(cycle.status))) {
        return res.status(400).json({ success: false, error: 'Evaluasi ini sudah disubmit sebelumnya.' });
      }
      const skor = body.skor || {};
      const komentar = String(body.komentar || "").trim();
      const rekomendasi = String(body.rekomendasi || "").toUpperCase();
      if (komentar.length < 3) return res.status(400).json({ success: false, error: 'Kolom komentar / feedback wajib diisi (minimal 3 karakter).' });
      if (!REKOMENDASI.includes(rekomendasi)) return res.status(400).json({ success: false, error: 'Rekomendasi harus salah satu dari: PERMANEN, PERPANJANG, BERHENTI.' });

      const bobot = cycle.bobot_kategori || {};
      const kategoriNama = Object.keys(bobot).length ? Object.keys(bobot) : Object.keys(skor);
      const skorBersih = {};
      for (const k of kategoriNama) {
        const val = Number(skor[k]);
        if (!Number.isFinite(val) || val < 1 || val > 4) {
          return res.status(400).json({ success: false, error: `Skor kategori "${k}" wajib berupa angka 1–4.` });
        }
        skorBersih[k] = Number.isInteger(val) ? val : Math.round(val);
      }
      /* weighted score skala 1–4 */
      const totalBobot = kategoriNama.reduce((sum, k) => sum + (Number(bobot[k]) || 0), 0) || kategoriNama.length;
      const weighted = kategoriNama.reduce((sum, k) => {
        const b = Number(bobot[k]) || 0;
        const w = totalBobot ? b / totalBobot : 1 / kategoriNama.length;
        return sum + skorBersih[k] * w;
      }, 0);
      const nilaiAkhir = Math.round(weighted * 100) / 100;

      const update = {
        status: 'SUBMITTED_TO_HR',
        skor_kategori: skorBersih,
        nilai_akhir: nilaiAkhir,
        predikat: nilaiAkhir >= 3 ? "MEET EXPECTATION" : nilaiAkhir >= 2 ? "DEVELOPMENT NEEDED" : "NEEDS IMPROVEMENT",
        komentar,
        rekomendasi_manajer: rekomendasi,
        submitted_at: new Date().toISOString(),
        submitted_by: user.username || user.nik
      };
      await cycleRef.set(update, { merge: true });
      await writeAuditLog(db, req, user, {
        action: 'EVAL_CYCLE_SUBMIT', module: 'CONTRACT', recordId: cycleId,
        metadata: { karyawan: cycle.nama_karyawan, nilai_akhir: nilaiAkhir, rekomendasi: rekomendasi }
      });

      /* Notifikasi ke seluruh HRD/SUPERADMIN: email + in-app + push */
      const usersSnap = await db.collection('users').get();
      const hrdUsers = [];
      usersSnap.forEach(d => {
        const u = d.data();
        if (String(u.role || "").toUpperCase() === "HRD" || String(u.role || "").toUpperCase() === "SUPERADMIN") {
          hrdUsers.push({ id: d.id, username: String(u.username || d.id || ""), nama: String(u.nama || ""), nik: String(u.nik || ""), email: pickEmail(u), data: u });
        }
      });
      const judul = `Evaluasi Kontrak ${cycle.nama_karyawan} menunggu validasi HR`;
      const pesan = `${user.name || user.username} telah menilai ${cycle.nama_karyawan} (skor akhir ${nilaiAkhir}/4, rekomendasi ${rekomendasi}). Mohon validasi di tab Siklus Evaluasi.`;
      for (const hrd of hrdUsers) {
        await writeInAppNotif(db, hrd, judul, pesan, "/#/penilaian-kontrak?tab=siklus");
        await pushTokens(admin, collectTokens(hrd.data, null), judul, pesan, (process.env.APP_URL || "https://hris.andelajaya.com") + "/#/penilaian-kontrak?tab=siklus");
      }
      const emails = hrdUsers.map(h => h.email).filter(Boolean).join(", ");
      if (emails) {
        await getTransporter().sendMail({
          from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
          to: emails,
          subject: `[Evaluasi Kontrak] ${cycle.nama_karyawan} — skor ${nilaiAkhir}/4 · rekomendasi ${rekomendasi}`,
          html: buildSubmitEmail(cycle, { skor_kategori: skorBersih, komentar, rekomendasi }, nilaiAkhir)
        }).catch(err => console.warn("Email submit gagal:", err.message));
      }
      return res.status(200).json({ success: true, update });

    /* --------------------------------------------------------------- */
    /* ASSIGN: delegasi reviewer (HRD/GM/DIREKTUR)                      */
    /* --------------------------------------------------------------- */
    } else if (action === 'assign') {
      if (!isManagementRole) return res.status(403).json({ success: false, error: 'Hanya HRD/GM/Direktur yang dapat mendelegasikan reviewer.' });
      if (String(cycle.status) === 'COMPLETED') return res.status(400).json({ success: false, error: 'Siklus sudah selesai.' });
      const reviewerNama = String(body.reviewer_nama || "").trim();
      if (!reviewerNama) return res.status(400).json({ success: false, error: 'Nama reviewer baru wajib diisi.' });

      const karSnap = await db.collection('master_karyawan').get();
      let matched = null;
      karSnap.forEach(d => {
        const data = d.data();
        if (matched) return;
        const nik = String(data.nik_karyawan || data.nik || "").trim();
        const nama = String(data.nama_karyawan || data.nama || "").trim();
        const nikBaru = String(body.reviewer_nik || "").trim();
        if ((nikBaru && nik === nikBaru) || (nama && nama.toUpperCase() === reviewerNama.toUpperCase())) matched = data;
      });
      let reviewerNik = String((matched?.nik_karyawan) || matched?.nik || body.reviewer_nik || "").trim();
      let reviewerUsername = "";
      let tokens = [];
      if (reviewerNik || reviewerNama) {
        const usersSnap2 = await db.collection('users').get();
        usersSnap2.forEach(d => {
          const u = d.data();
          const uNik = String(u.nik || "").trim();
          const uNama = String(u.nama || "").trim();
          if (!reviewerUsername && ((reviewerNik && uNik === reviewerNik) || uNama.toUpperCase() === reviewerNama.toUpperCase())) {
            reviewerUsername = String(u.username || d.id || "");
            tokens = collectTokens(u, null);
          }
        });
      }

      const update = {
        reviewer_nama: matched ? String(matched.nama_karyawan || matched.nama || reviewerNama) : reviewerNama,
        reviewer_nik: reviewerNik,
        reviewer_username: reviewerUsername,
        reviewer_email: pickEmail(matched),
        delegated_from: cycle.delegated_from || { reviewer_nama: cycle.reviewer_nama || "", reviewer_nik: cycle.reviewer_nik || "" },
        delegation_reason: String(body.alasan || "Delegasi reviewer oleh HRD"),
        delegated_by: user.username || user.nik,
        delegated_at: new Date().toISOString()
      };
      await cycleRef.set(update, { merge: true });
      await writeAuditLog(db, req, user, { action: 'EVAL_CYCLE_ASSIGN', module: 'CONTRACT', recordId: cycleId, metadata: { karyawan: cycle.nama_karyawan, reviewer_baru: update.reviewer_nama } });

      const judul = `Tugas Evaluasi Kontrak: ${cycle.nama_karyawan}`;
      const pesan = `Anda ditetapkan oleh ${user.name || user.username} sebagai reviewer evaluasi kontrak ${cycle.nama_karyawan} (kontrak berakhir ${cycle.tanggal_akhir}).`;
      await writeInAppNotif(db, { username: reviewerUsername || update.reviewer_nama, nama: update.reviewer_nama, nik: reviewerNik }, judul, pesan, "/#/penilaian-kontrak?tab=siklus");
      await pushTokens(admin, tokens, judul, pesan, (process.env.APP_URL || "https://hris.andelajaya.com") + "/#/penilaian-kontrak?tab=siklus");
      return res.status(200).json({ success: true, update });

    /* --------------------------------------------------------------- */
    /* COMPLETE: HRD mengeksekusi keputusan akhir                       */
    /* --------------------------------------------------------------- */
    } else if (action === 'complete') {
      if (!isManagementRole) return res.status(403).json({ success: false, error: 'Hanya HRD/GM/Direktur yang dapat mengeksekusi keputusan.' });
      if (String(cycle.status) !== 'SUBMITTED_TO_HR') return res.status(400).json({ success: false, error: 'Hasil evaluasi belum disubmit oleh reviewer.' });
      const keputusan = String(body.keputusan || "").toUpperCase();
      if (!DECISIONS.includes(keputusan)) return res.status(400).json({ success: false, error: 'Keputusan harus salah satu dari: PERMANEN, PERPANJANG, BERHENTI.' });
      const update = {
        status: 'COMPLETED',
        hr_keputusan: keputusan,
        hr_catatan: String(body.catatan || "").trim(),
        hr_by: user.username || user.nik,
        completed_at: new Date().toISOString()
      };
      await cycleRef.set(update, { merge: true });
      await writeAuditLog(db, req, user, {
        action: 'EVAL_CYCLE_COMPLETE', module: 'CONTRACT', recordId: cycleId,
        metadata: { karyawan: cycle.nama_karyawan, hr_keputusan: keputusan }
      });
      /* beri tahu reviewer bahwa keputusan sudah dieksekusi */
      await writeInAppNotif(db, { username: cycle.reviewer_username || cycle.reviewer_nama, nama: cycle.reviewer_nama || "", nik: cycle.reviewer_nik || "" },
        `Keputusan final: ${cycle.nama_karyawan} → ${keputusan}`,
        `HR telah mengeksekusi keputusan akhir evaluasi kontrak ${cycle.nama_karyawan}: ${keputusan}. Laporan penilaian dapat diunduh di tab Siklus Evaluasi.`,
        "/#/penilaian-kontrak?tab=siklus");
      return res.status(200).json({ success: true, update });

    /* --------------------------------------------------------------- */
    /* CANCEL: batalkan siklus                                          */
    /* --------------------------------------------------------------- */
    } else if (action === 'cancel') {
      if (!isManagementRole) return res.status(403).json({ success: false, error: 'Hanya HRD/GM/Direktur yang dapat membatalkan siklus.' });
      if (String(cycle.status) === 'COMPLETED') return res.status(400).json({ success: false, error: 'Siklus sudah selesai.' });
      const update = {
        status: 'BATAL',
        cancel_reason: String(body.alasan || "").trim(),
        canceled_by: user.username || user.nik,
        canceled_at: new Date().toISOString()
      };
      await cycleRef.set(update, { merge: true });
      await writeAuditLog(db, req, user, { action: 'EVAL_CYCLE_CANCEL', module: 'CONTRACT', recordId: cycleId, metadata: { karyawan: cycle.nama_karyawan, alasan: update.cancel_reason } });
      return res.status(200).json({ success: true, update });

    } else {
      return res.status(400).json({ success: false, error: 'Aksi tidak dikenal. Gunakan: start, submit, assign, complete, cancel.' });
    }
  } catch (err) {
    console.error("Error in evaluation-cycle:", err);
    return res.status(500).json({ success: false, error: 'Siklus evaluasi gagal diproses.' });
  }
};
