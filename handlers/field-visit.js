/**
 * =====================================================================
 * FIELD VISIT — NOTIFIKASI PENGAJUAN, APPROVAL & LAPORAN KUNJUNGAN
 * =====================================================================
 * Endpoint kecil yang dijalankan dengan Firebase Admin SDK agar dapat:
 *  - Menemukan email Atasan / HRD / HRGA tanpa memberi akses baca `users`
 *    ke seluruh karyawan.
 *  - Mengirim email transaksional + notifikasi lonceng (in-app) secara
 *    konsisten untuk setiap tahap pengajuan kunjungan lapangan.
 *
 * Klien tetap menulis data utama langsung ke Firestore (pola AJ-HRIS),
 * endpoint ini hanya menangani fan-out notifikasi setelah aksi berhasil.
 *
 * POST /api/field-visit
 *   { request_id, event: 'request_submitted' | 'approved_atasan' |
 *     'approved_final' | 'rejected' | 'cancelled' | 'report_submitted',
 *     note?: string }
 * =====================================================================
 */
const nodemailer = require('nodemailer');
const { getFirebaseAdmin } = require('../lib/firebase-admin.js');
const { requireFirebaseAuth, enforceRateLimit, assertAllowedKeys, writeAuditLog } = require('../lib/security.js');

const HRD_ROLES = ['HRD', 'HRGA', 'SUPERADMIN'];
const VIEW_ALL_ROLES = ['HRD', 'HRGA', 'SUPERADMIN', 'GM', 'DIREKTUR', 'DIRECTOR'];
const EMAIL_FIELDS = ['email', 'email_karyawan', 'email_perusahaan', 'email_pribadi', 'email_personal', 'email_aktif', 'auth_email'];

const EVENT_META = {
  request_submitted: {
    badge: 'PENGAJUAN KUNJUNGAN LAPANGAN',
    title: 'Permintaan Persetujuan Kunjungan Lapangan',
    intro: 'Pengajuan kunjungan lapangan baru menunggu persetujuan Anda sebagai Atasan Langsung.',
    linkTab: 'persetujuan'
  },
  approved_atasan: {
    badge: 'PERSETUJUAN TAHAP 1 SELESAI',
    title: 'Pengajuan Kunjungan Menunggu Validasi HRD',
    intro: 'Atasan langsung telah menyetujui pengajuan. Mohon validasi final sebagai HRD/HRGA.',
    linkTab: 'persetujuan'
  },
  approved_final: {
    badge: 'DISETUJUI FINAL',
    title: 'Pengajuan Kunjungan Lapangan Disetujui',
    intro: 'Pengajuan kunjungan Anda telah disetujui final. Kewajiban laporan hasil kunjungan sudah dibuka.',
    linkTab: 'laporan'
  },
  rejected: {
    badge: 'PENGAJUAN DITOLAK',
    title: 'Pengajuan Kunjungan Lapangan Ditolak',
    intro: 'Pengajuan kunjungan lapangan ditolak. Silakan baca catatan dan ajukan ulang bila diperlukan.',
    linkTab: 'pengajuan'
  },
  cancelled: {
    badge: 'PENGAJUAN DIBATALKAN',
    title: 'Pengajuan Kunjungan Lapangan Dibatalkan',
    intro: 'Pengajuan kunjungan lapangan telah dibatalkan. Pengingat laporan otomatis dihentikan.',
    linkTab: 'pengajuan'
  },
  report_submitted: {
    badge: 'LAPORAN KUNJUNGAN DITERIMA',
    title: 'Laporan Hasil Kunjungan Lapangan',
    intro: 'Laporan hasil kunjungan telah dikirim. Berikut ringkasan dan tindak lanjut yang perlu dipantau.',
    linkTab: 'ringkasan'
  }
};

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function pickEmail(...sources) {
  for (const source of sources) {
    if (!source) continue;
    for (const field of EMAIL_FIELDS) {
      const value = String(source[field] || '').trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.endsWith('@auth.andelajaya.internal')) return value;
    }
  }
  return '';
}

function formatIndoDate(value) {
  const raw = String(value || '').slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return value || '-';
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${Number(parts[2])} ${months[Number(parts[1]) - 1] || parts[1]} ${parts[0]}`;
}

function identityMatches(user, person = {}) {
  const userNik = normalize(user.nik);
  const userName = normalize(user.name);
  const userUsername = normalize(user.username);
  const targets = [
    normalize(person.nik), normalize(person.nama), normalize(person.nik_pemohon),
    normalize(person.nama_pemohon), normalize(person.username_pemohon)
  ].filter(Boolean);
  return Boolean(
    (userNik && targets.includes(userNik)) ||
    (userName && targets.includes(userName)) ||
    (userUsername && targets.includes(userUsername))
  );
}

function buildEmailHtml({ meta, request, note, appUrl, recipientName }) {
  const rows = [
    ['Nomor Pengajuan', request.document_number || '-'],
    ['Jenis Kunjungan', request.visit_type === 'AUDIT_LAPANGAN' ? 'Audit Lapangan' : 'Joint Visit / Pendampingan Sales'],
    ['Tanggal', `${formatIndoDate(request.start_date)}${request.end_date && request.end_date !== request.start_date ? ` s/d ${formatIndoDate(request.end_date)}` : ''}`],
    ['Cabang / Area', request.branch || '-'],
    ['Pemohon', `${request.nama_pemohon || '-'}${request.nik_pemohon ? ` (${request.nik_pemohon})` : ''}`],
    ['Status', request.approval_status || '-']
  ];
  if (request.report_deadline_at) rows.push(['Batas Laporan', `${formatIndoDate(request.report_deadline_at)} pukul 10:00 WIB`]);
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#7a1f2b 0%,#4a0e17 100%);padding:24px 28px;color:#fff">
      <div style="display:inline-block;background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:8px">${escapeHtml(meta.badge)}</div>
      <h1 style="margin:0;font-size:20px;font-weight:800;line-height:1.3">${escapeHtml(meta.title)}</h1>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 8px;font-size:13.5px;color:#334155;line-height:1.6">Halo <b>${escapeHtml(recipientName || 'Bapak/Ibu')}</b>,</p>
      <p style="margin:0 0 16px;font-size:13.5px;color:#334155;line-height:1.6">${escapeHtml(meta.intro)}</p>
      <div style="margin:18px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12.5px;color:#1e293b">
          <tbody>${rows.map(([label, value], index) => `<tr style="${index % 2 ? 'background:#fafbfd' : ''}"><td style="padding:9px 12px;color:#64748b;width:38%">${escapeHtml(label)}</td><td style="padding:9px 12px;font-weight:600">${escapeHtml(value)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      ${note ? `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-left:4px solid #7a1f2b;border-radius:8px"><p style="margin:0;font-size:12px;color:#334155;line-height:1.6"><b>Catatan:</b> ${escapeHtml(note)}</p></div>` : ''}
      <p style="margin:18px 0 0"><a href="${escapeHtml(appUrl)}/#kunjungan-lapangan?tab=${escapeHtml(meta.linkTab)}" style="display:inline-block;background:#7a1f2b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:700;font-size:12.5px">Buka Modul Kunjungan Lapangan →</a></p>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#64748b">Sistem HRIS &amp; Operasional CV Andela Jaya • Kunjungan Lapangan</p>
      <p style="margin:4px 0 0;font-size:10.5px;color:#94a3b8">Email ini dikirim otomatis oleh sistem.</p>
    </div>
  </div>`;
}

async function writeInAppNotif(db, person, judul, pesan, link) {
  const aliases = [person.username, person.nama, person.nik]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const allAliases = [...new Set(aliases.flatMap(value => [value, value.toLowerCase()]))];
  await db.collection('notifications').add({
    username_target: String(person.username || ''),
    nama_target: String(person.nama || ''),
    nik_target: String(person.nik || ''),
    target_aliases: allAliases,
    judul, pesan, link,
    dibaca: false,
    tanggal: new Date().toISOString()
  });
}

async function loadPeople(db) {
  const [employeeSnap, userSnap] = await Promise.all([
    db.collection('master_karyawan').get().catch(() => ({ docs: [] })),
    db.collection('users').get().catch(() => ({ docs: [] }))
  ]);
  const employees = employeeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const users = userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { employees, users };
}

function personFor(identity, people) {
  const keyNik = normalize(identity.nik);
  const keyName = normalize(identity.nama || identity.name);
  const keyUsername = normalize(identity.username);
  const employee = people.employees.find(row =>
    (keyNik && normalize(row.nik_karyawan || row.nik) === keyNik) ||
    (keyName && normalize(row.nama_karyawan || row.nama) === keyName)
  ) || {};
  const user = people.users.find(row =>
    (keyUsername && normalize(row.username || row.id) === keyUsername) ||
    (keyNik && normalize(row.nik) === keyNik) ||
    (keyName && normalize(row.nama) === keyName)
  ) || {};
  return {
    nik: String(identity.nik || employee.nik_karyawan || employee.nik || user.nik || '').trim(),
    nama: String(identity.nama || employee.nama_karyawan || employee.nama || user.nama || user.username || '').trim(),
    username: String(identity.username || user.username || user.id || '').trim(),
    email: pickEmail(user, employee),
    data: { user, employee }
  };
}

function hrdPeople(people) {
  const rows = [];
  const seen = new Set();
  people.users.forEach(user => {
    const role = String(user.role || '').toUpperCase();
    if (!HRD_ROLES.includes(role)) return;
    const key = normalize(user.email || user.username || user.nik || user.id);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(personFor({ nik: user.nik, nama: user.nama, username: user.username || user.id }, people));
  });
  people.employees.forEach(employee => {
    const role = String(employee.role || employee.jabatan || '').toUpperCase();
    if (!HRD_ROLES.some(item => role.includes(item))) return;
    const key = normalize(employee.email || employee.nik_karyawan || employee.nama_karyawan);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(personFor({ nik: employee.nik_karyawan, nama: employee.nama_karyawan }, people));
  });
  return rows.filter(row => row.nama || row.email);
}

function uniqueRecipients(rows) {
  const seen = new Set();
  return rows.filter(row => {
    if (!row) return false;
    const key = normalize(row.email || row.username || row.nik || row.nama);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metode tidak diizinkan.' });
  const context = await requireFirebaseAuth(req, res);
  if (!context) return;
  if (!enforceRateLimit(req, res, { namespace: 'field-visit-notify', key: context.user.uid, limit: 40, windowMs: 60 * 60_000 })) return;

  try {
    assertAllowedKeys(req.body || {}, ['request_id', 'event', 'note']);
    const requestId = String(req.body?.request_id || '').trim();
    const event = String(req.body?.event || '').trim();
    const note = String(req.body?.note || '').slice(0, 1200);
    if (!requestId || !EVENT_META[event]) {
      return res.status(400).json({ success: false, error: 'request_id atau event tidak valid.' });
    }

    const { db, error } = getFirebaseAdmin();
    if (!db) return res.status(503).json({ success: false, error: error || 'Firebase Admin belum tersedia.' });
    const snap = await db.collection('field_visit_requests').doc(requestId).get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Pengajuan kunjungan tidak ditemukan.' });
    const request = { id: snap.id, ...snap.data() };

    const role = String(context.user.role || '').toUpperCase();
    const isHrd = HRD_ROLES.includes(role);
    const isViewer = VIEW_ALL_ROLES.includes(role);
    const isRequester = identityMatches(context.user, {
      nik: request.nik_pemohon,
      nama: request.nama_pemohon,
      username: request.username_pemohon
    });
    const isAtasan = identityMatches(context.user, {
      nik: request.atasan_nik,
      nama: request.atasan_nama,
      username: request.atasan_username
    });
    if (!isHrd && !isViewer && !isRequester && !isAtasan) {
      return res.status(403).json({ success: false, error: 'Anda tidak berhak mengirim notifikasi untuk pengajuan ini.' });
    }

    const people = await loadPeople(db);
    const meta = EVENT_META[event];
    const appUrl = String(process.env.APP_URL || req.headers.origin || 'https://andela-hris.vercel.app').replace(/\/$/, '');
    const link = `/#kunjungan-lapangan?tab=${meta.linkTab}`;

    let recipients = [];
    if (event === 'request_submitted') {
      recipients = request.atasan_nik || request.atasan_nama
        ? [personFor({ nik: request.atasan_nik, nama: request.atasan_nama, username: request.atasan_username }, people)]
        : hrdPeople(people);
    } else if (event === 'approved_atasan') {
      recipients = hrdPeople(people);
    } else if (event === 'approved_final' || event === 'rejected' || event === 'cancelled') {
      recipients = [personFor({ nik: request.nik_pemohon, nama: request.nama_pemohon, username: request.username_pemohon }, people)];
    } else if (event === 'report_submitted') {
      recipients = uniqueRecipients([
        ...hrdPeople(people),
        personFor({ nik: request.atasan_nik, nama: request.atasan_nama }, people)
      ]);
    }
    recipients = uniqueRecipients(recipients).filter(person => person.nama || person.email);
    if (!recipients.length) return res.status(200).json({ success: true, sent: 0, skipped: 'no-recipient' });

    let sent = 0;
    let emailSent = 0;
    for (const recipient of recipients) {
      const judul = `${meta.title}: ${request.document_number || request.nama_pemohon || ''}`;
      const pesan = `${meta.intro} ${request.nama_pemohon || ''} • ${formatIndoDate(request.start_date)}${request.branch ? ` • ${request.branch}` : ''}`;
      try {
        await writeInAppNotif(db, recipient, judul, pesan, link);
        sent += 1;
      } catch (notifError) {
        console.warn('field-visit in-app notif gagal:', notifError?.message || notifError);
      }
      if (recipient.email && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        try {
          await getTransporter().sendMail({
            from: `"HRIS Andela Jaya" <${process.env.GMAIL_USER}>`,
            to: recipient.email,
            subject: `[Kunjungan Lapangan] ${meta.title} — ${request.document_number || ''}`,
            html: buildEmailHtml({ meta, request, note, appUrl, recipientName: recipient.nama })
          });
          emailSent += 1;
        } catch (mailError) {
          console.warn('field-visit email gagal:', mailError?.message || mailError);
        }
      }
    }

    await writeAuditLog(db, req, context.user, {
      action: `FIELD_VISIT_${event.toUpperCase()}`,
      module: 'FIELD_VISIT',
      recordId: requestId,
      metadata: { recipients: recipients.length, email_sent: emailSent }
    });

    return res.status(200).json({ success: true, recipients: recipients.length, in_app: sent, email: emailSent });
  } catch (error) {
    console.error('CRASH SERVER (field-visit):', error);
    return res.status(500).json({ success: false, error: 'Notifikasi kunjungan gagal diproses.' });
  }
};

module.exports._test = { identityMatches, buildEmailHtml, personFor, uniqueRecipients };
