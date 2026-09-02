/**
 * =====================================================================
 * LEMBUR-MODALS.JS — Form Dialog & Workflow Lembur HRIS Andela Jaya
 * Standar PRD & Workflow Modul Lembur v1.1
 * =====================================================================
 */
import { db, COL, doc, getDoc, setDoc, deleteDoc, updateDoc } from "../firebase-config.js";
import {
  fsGetAll, fsAdd, fsUpdate, toast, fmtDateShort, genId, escapeHtml, openModal, closeModal,
  createLoginToken, sendEmailNotif, buildStandardEmailHtml, notifyUser
} from "../utils.js";
import { findUserForAuth } from "../auth.js";
import {
  DAY_TYPES, DEFAULT_OVERTIME_CONFIG, calculateDurationMinutes, fmtMinutesToDisplay,
  calculateAndelaHours, generateSppklNumber, detectOvertimeVariances
} from "./lembur-calc.js";

/**
 * Mengirimkan notifikasi email resmi dan in-app kepada seluruh karyawan yang ditugaskan lembur
 * Dilengkapi Token Login Langsung (Magic Token) untuk masuk ke sistem tanpa password
 */
export async function sendSppklAssignmentNotifications(orderPayload, allKaryawan = [], userNama = "Atasan") {
  const employees = orderPayload.employees || [];
  if (employees.length === 0) return;

  const appUrl = window.location.origin;
  const orderId = orderPayload.order_id || orderPayload.id;
  const sppklNum = orderPayload.order_number || orderPayload.nomor_sppkl || orderId;
  const tglStr = orderPayload.tanggal || orderPayload.overtime_date || "";
  const jamMulai = orderPayload.jam_mulai || orderPayload.planned_start_at || "";
  const jamSelesai = orderPayload.jam_selesai || orderPayload.planned_end_at || "";
  const durasiJam = orderPayload.durasi_jam || orderPayload.durasi_rencana || 0;
  const lokasi = orderPayload.lokasi || orderPayload.location || "-";
  const tugas = orderPayload.pekerjaan || orderPayload.work_description || "-";
  const target = orderPayload.target_output || orderPayload.expected_output || "-";
  const alasan = orderPayload.alasan_lembur || orderPayload.business_reason || "-";

  for (const emp of employees) {
    try {
      const empNik = String(emp.nik || "").trim();
      const empNama = String(emp.nama || "").trim();

      // Cari data karyawan di master karyawan
      const kMatch = allKaryawan.find(k => 
        (empNik && (k.nik === empNik || k.nik_karyawan === empNik)) || 
        (empNama && (k.nama_karyawan === empNama || k.nama === empNama))
      );
      
      let targetEmail = (emp.email || kMatch?.email || kMatch?.email_perusahaan || "").trim();
      let targetUsername = (emp.username || kMatch?.username || empNik || empNama).trim();

      // Cari data pengguna di koleksi USERS untuk email/username presisi
      const uRes = await findUserForAuth(targetUsername || empNik || empNama);
      if (uRes && uRes.data) {
        if (!targetEmail && uRes.data.email) targetEmail = uRes.data.email.trim();
        if (uRes.data.username) targetUsername = uRes.data.username.trim();
      }

      // Generate Login Token khusus (Magic Token berlaku 24 jam)
      let magicToken = "";
      try {
        magicToken = await createLoginToken(targetUsername || empNik || empNama);
      } catch (e) {
        console.warn("Gagal membuat login token SPPKL:", e);
      }

      const routeHash = `lembur-kasbon?orderId=${encodeURIComponent(orderId)}`;
      const targetLink = magicToken
        ? `${appUrl}/#${routeHash}&token=${encodeURIComponent(magicToken)}`
        : `${appUrl}/#${routeHash}`;

      // 1. Notifikasi In-App (Lonceng Portal)
      const judulNotif = `Penugasan Lembur: ${sppklNum}`;
      const pesanNotif = `Anda ditugaskan lembur pada ${tglStr} (${jamMulai} - ${jamSelesai}) oleh ${userNama}. Klik untuk konfirmasi persetujuan.`;
      
      await notifyUser(targetUsername || empNik || empNama, judulNotif, pesanNotif, `#${routeHash}`, {
        sendEmail: false
      });

      // 2. Email Notifikasi Resmi dengan Tombol Akses Langsung Ber-Token
      if (targetEmail) {
        const infoList = [
          { label: "Nomor SPPKL", value: `<strong style="color: #7a1f2b; font-family: monospace;">${escapeHtml(sppklNum)}</strong>`, isHtml: true },
          { label: "Tanggal Lembur", value: escapeHtml(fmtDateShort(tglStr) || tglStr) },
          { label: "Waktu / Jam", value: `${escapeHtml(jamMulai)} s/d ${escapeHtml(jamSelesai)} (${durasiJam} Jam)` },
          { label: "Lokasi Kerja", value: escapeHtml(lokasi) },
          { label: "Uraian Tugas", value: escapeHtml(tugas) },
          { label: "Target Output", value: escapeHtml(target) },
          { label: "Alasan Lembur", value: escapeHtml(alasan) },
          { label: "Pemberi Tugas", value: `<strong style="color: #0f172a;">${escapeHtml(userNama)}</strong>`, isHtml: true }
        ];

        const emailHtml = buildStandardEmailHtml({
          title: "Surat Perintah Kerja Lembur (SPPKL)",
          recipientName: empNama,
          badgeText: "Penugasan Lembur Resmi",
          badgeVariant: "maroon",
          introText: `Anda telah ditugaskan oleh <strong>${escapeHtml(userNama)}</strong> untuk melaksanakan kerja lembur resmi CV Andela Jaya. Mohon periksa rincian tugas di bawah dan lakukan konfirmasi persetujuan digital di portal HRIS.`,
          infoBoxTitle: "Rincian Surat Perintah Lembur",
          infoList: infoList,
          actionUrl: targetLink,
          actionText: "Masuk & Konfirmasi Lembur Sekarang →",
          secondaryNote: "Tombol di atas dilengkapi token login aman sekali pakai (berlaku 24 jam). Anda akan langsung masuk ke sistem secara otomatis tanpa perlu mengetikkan password."
        });

        await sendEmailNotif(targetEmail, `[SPPKL] Penugasan Lembur: ${sppklNum} - ${tglStr} (${empNama})`, emailHtml);
      }
    } catch (err) {
      console.warn(`Gagal mengirim email lembur ke ${emp.nama}:`, err);
    }
  }
}

/**
 * Modal Buat Perintah Lembur Baru (Atasan / SPV / HR)
 * Mendukung Perintah Individu maupun Perintah Kelompok (Multi-Karyawan)
 */
export function openCreateSppklModal(options = {}, state = {}, onSuccess = () => {}) {
  const { allKaryawan = [], allOrders = [], currentConfig = DEFAULT_OVERTIME_CONFIG, userNama = "Atasan", userNik = "" } = state;
  const { prefill = {} } = options;

  const todayStr = new Date().toISOString().slice(0, 10);
  const sppklNumber = generateSppklNumber(allOrders.length);

  const modalHtml = `
  <div class="space-y-4 text-xs">
    <div class="bg-rose-50 border border-rose-200 rounded-xl p-3 text-maroon-900">
      <div class="font-bold flex items-center justify-between">
        <span>No. SPPKL: <span class="font-mono text-rose-700">${sppklNumber}</span></span>
        <span class="text-[10px] bg-rose-200/80 px-2 py-0.5 rounded-full font-bold">Draft Perintah</span>
      </div>
      <p class="text-[11px] text-rose-700 mt-1">Perintah lembur diterbitkan oleh atasan berwenang dan wajib disetujui digital oleh setiap karyawan.</p>
    </div>

    <!-- Stepper 1: Detail Lembur & Lokasi -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block font-bold text-slate-700 mb-1">Tanggal Lembur <span class="text-rose-500">*</span></label>
        <input type="date" id="m-sppkl-tanggal" value="${prefill.tanggal || todayStr}" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs font-semibold">
      </div>

      <div>
        <label class="block font-bold text-slate-700 mb-1">Jenis Hari <span class="text-rose-500">*</span></label>
        <select id="m-sppkl-jenis-hari" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs">
          <option value="${DAY_TYPES.KERJA}">${DAY_TYPES.KERJA}</option>
          <option value="${DAY_TYPES.ISTIRAHAT}">${DAY_TYPES.ISTIRAHAT}</option>
          <option value="${DAY_TYPES.LIBUR_RESMI}">${DAY_TYPES.LIBUR_RESMI}</option>
        </select>
      </div>
    </div>

    <!-- Jadwal Waktu Rencana -->
    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
      <div class="font-bold text-slate-800 flex items-center justify-between">
        <span>Jadwal Rencana Kerja Lembur</span>
        <span id="m-sppkl-durasi-badge" class="font-mono font-bold text-maroon-700 text-xs">0 Jam</span>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Jam Mulai</label>
          <input type="time" id="m-sppkl-jam-mulai" value="${prefill.start || '17:00'}" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Jam Selesai</label>
          <input type="time" id="m-sppkl-jam-selesai" value="${prefill.end || '19:00'}" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Istirahat (Menit)</label>
          <input type="number" id="m-sppkl-istirahat" value="${prefill.break || 0}" min="0" step="15" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
      </div>
      <div id="m-sppkl-plan-warning" class="hidden text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg"></div>
    </div>

    <!-- Pemilihan Karyawan (Mendukung Multi-Karyawan / Perintah Kelompok) -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="font-bold text-slate-700">Pilih Karyawan yang Ditugaskan <span class="text-rose-500">*</span></label>
        <span id="m-sppkl-selected-count" class="text-[11px] text-slate-500 font-medium">0 Karyawan Dipilih</span>
      </div>
      <div class="border border-slate-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1.5 bg-white">
        ${allKaryawan.length > 0 ? allKaryawan.map(k => `
          <label class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition">
            <div class="flex items-center gap-2">
              <input type="checkbox" name="m-sppkl-karyawan" value="${k.nik || k.id}" 
                data-nama="${escapeHtml(k.nama_lengkap || k.nama || '')}"
                data-nik="${escapeHtml(k.nik || '')}"
                data-jabatan="${escapeHtml(k.jabatan || k.posisi || '')}"
                data-divisi="${escapeHtml(k.divisi || k.departemen || '')}"
                data-cabang="${escapeHtml(k.cabang || 'Pusat')}"
                ${(prefill.empNiks || []).includes(k.nik) || prefill.empNik === k.nik ? 'checked' : ''}
                class="rounded text-maroon-700 focus:ring-maroon-500">
              <div>
                <span class="font-bold text-slate-800">${escapeHtml(k.nama_lengkap || k.nama)}</span>
                <span class="text-[10px] text-slate-400 font-mono ml-1.5">(${escapeHtml(k.nik || '-')})</span>
              </div>
            </div>
            <span class="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium">${escapeHtml(k.divisi || k.departemen || 'Umum')}</span>
          </label>
        `).join('') : '<div class="text-center py-4 text-slate-400">Tidak ada data karyawan aktif</div>'}
      </div>
    </div>

    <!-- Lokasi & Urgensi -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block font-bold text-slate-700 mb-1">Lokasi Kerja Lembur</label>
        <input type="text" id="m-sppkl-lokasi" value="${escapeHtml(prefill.lokasi || 'Kantor / Lokasi Kerja')}" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs">
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Tingkat Urgensi</label>
        <select id="m-sppkl-urgensi" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs font-semibold">
          <option value="NORMAL">Normal (Terjadwal)</option>
          <option value="DARURAT">Darurat (Pengecualian / Insidental)</option>
        </select>
      </div>
    </div>

    <!-- Uraian Tugas, Alasan, & Target Output -->
    <div class="space-y-2">
      <div>
        <label class="block font-bold text-slate-700 mb-1">Uraian Pekerjaan Lembur <span class="text-rose-500">*</span></label>
        <textarea id="m-sppkl-tugas" rows="2" placeholder="Jelaskan pekerjaan yang harus diselesaikan..." class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs">${escapeHtml(prefill.tugas || '')}</textarea>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Alasan Kebutuhan Lembur <span class="text-rose-500">*</span></label>
          <input type="text" id="m-sppkl-alasan" value="${escapeHtml(prefill.alasan || '')}" placeholder="Contoh: Penyelesaian deadline audit" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs">
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Target Hasil / Output <span class="text-rose-500">*</span></label>
          <input type="text" id="m-sppkl-target" value="${escapeHtml(prefill.target || '')}" placeholder="Contoh: 100% berkas selesai diunggah" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs">
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
      <button id="btn-cancel-sppkl" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">Batal</button>
      <button id="btn-submit-sppkl" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center gap-1.5">
        <span>Terbitkan Perintah SPPKL</span>
      </button>
    </div>
  </div>
  `;

  openModal("Terbitkan Surat Perintah Kerja Lembur (SPPKL)", modalHtml);

  // Duration calculation & validation
  const startEl = document.getElementById("m-sppkl-jam-mulai");
  const endEl = document.getElementById("m-sppkl-jam-selesai");
  const breakEl = document.getElementById("m-sppkl-istirahat");
  const badgeEl = document.getElementById("m-sppkl-durasi-badge");
  const warningEl = document.getElementById("m-sppkl-plan-warning");
  const checkboxes = document.querySelectorAll('input[name="m-sppkl-karyawan"]');
  const countEl = document.getElementById("m-sppkl-selected-count");

  function updateDurations() {
    const netMins = calculateDurationMinutes(startEl.value, endEl.value, Number(breakEl.value) || 0);
    const planHours = Math.floor(netMins / 60);
    badgeEl.textContent = `${planHours} Jam (${netMins} Menit)`;

    if (planHours > 4) {
      warningEl.textContent = `Peringatan Kepatuhan: Durasi rencana (${planHours} jam) melebihi batas standar 4 jam sehari.`;
      warningEl.classList.remove("hidden");
    } else {
      warningEl.classList.add("hidden");
    }
  }

  function updateSelectedCount() {
    const selected = Array.from(checkboxes).filter(cb => cb.checked);
    countEl.textContent = `${selected.length} Karyawan Dipilih`;
  }

  startEl?.addEventListener("change", updateDurations);
  endEl?.addEventListener("change", updateDurations);
  breakEl?.addEventListener("input", updateDurations);
  checkboxes.forEach(cb => cb.addEventListener("change", updateSelectedCount));
  updateDurations();
  updateSelectedCount();

  document.getElementById("btn-cancel-sppkl")?.addEventListener("click", () => closeModal());

  document.getElementById("btn-submit-sppkl")?.addEventListener("click", async () => {
    const tanggal = document.getElementById("m-sppkl-tanggal")?.value;
    const jenisHari = document.getElementById("m-sppkl-jenis-hari")?.value;
    const jamMulai = startEl?.value;
    const jamSelesai = endEl?.value;
    const istirahatMenit = Number(breakEl?.value) || 0;
    const lokasi = document.getElementById("m-sppkl-lokasi")?.value || "Kantor / Lapangan";
    const urgensi = document.getElementById("m-sppkl-urgensi")?.value || "NORMAL";
    const tugas = document.getElementById("m-sppkl-tugas")?.value?.trim();
    const alasan = document.getElementById("m-sppkl-alasan")?.value?.trim();
    const target = document.getElementById("m-sppkl-target")?.value?.trim();

    const selectedEmployees = Array.from(checkboxes).filter(cb => cb.checked).map(cb => ({
      nik: cb.dataset.nik,
      nama: cb.dataset.nama,
      jabatan: cb.dataset.jabatan,
      divisi: cb.dataset.divisi,
      cabang: cb.dataset.cabang,
      consent_status: "PENDING",
      consent_timestamp: null,
      status_persetujuan_karyawan: "MENUNGGU",
      durasi_aktual_menit: 0,
      jam_disetujui_hr: 0
    }));

    if (!tanggal) return toast("Wajib memilih tanggal lembur!", "warning");
    if (!jamMulai || !jamSelesai) return toast("Wajib mengisi jam mulai dan selesai!", "warning");
    if (selectedEmployees.length === 0) return toast("Wajib memilih sekurang-kurangnya 1 karyawan!", "warning");
    if (!tugas) return toast("Wajib mengisi uraian pekerjaan lembur!", "warning");
    if (!alasan) return toast("Wajib mengisi alasan kebutuhan lembur!", "warning");
    if (!target) return toast("Wajib mengisi target output yang diharapkan!", "warning");

    const plannedMinutes = calculateDurationMinutes(jamMulai, jamSelesai, istirahatMenit);
    const plannedHours = Math.floor(plannedMinutes / 60);

    const orderId = genId("SPPKL");
    const orderPayload = {
      order_id: orderId,
      order_number: sppklNumber,
      nomor_sppkl: sppklNumber,
      branch_id: selectedEmployees[0]?.cabang || "Pusat",
      department_id: selectedEmployees[0]?.divisi || "Umum",
      divisi: selectedEmployees[0]?.divisi || "Umum",
      cabang: selectedEmployees[0]?.cabang || "Pusat",
      overtime_date: tanggal,
      tanggal: tanggal,
      planned_start_at: jamMulai,
      jam_mulai: jamMulai,
      planned_end_at: jamSelesai,
      jam_selesai: jamSelesai,
      planned_break_minutes: istirahatMenit,
      planned_minutes: plannedMinutes,
      durasi_rencana: plannedHours,
      durasi_jam: plannedHours,
      day_type: jenisHari,
      jenis_hari: jenisHari,
      location: lokasi,
      lokasi: lokasi,
      work_description: tugas,
      pekerjaan: tugas,
      business_reason: alasan,
      alasan_lembur: alasan,
      expected_output: target,
      target_output: target,
      urgency_type: urgensi,
      urgensi: urgensi,
      instructed_by: userNama,
      nama_pembuat: userNama,
      created_by_nik: userNik,
      current_status: "MENUNGGU_PERSETUJUAN_KARYAWAN",
      status: "MENUNGGU_PERSETUJUAN_KARYAWAN",
      current_version: 1,
      employees: selectedEmployees,
      total_participants: selectedEmployees.length,
      // Compatibility fields for single employee
      nama_karyawan: selectedEmployees.map(e => e.nama).join(", "),
      nik_karyawan: selectedEmployees.map(e => e.nik).join(", "),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, COL.OVERTIME_ORDERS || "overtime_orders", orderId), orderPayload);

      // Trigger notifikasi email & in-app otomatis ke seluruh karyawan yang ditugaskan
      sendSppklAssignmentNotifications(orderPayload, allKaryawan, userNama).catch(err => {
        console.warn("Error sending SPPKL email notifications:", err);
      });

      // If linked to proposal, update proposal status
      if (options.proposalId) {
        await fsUpdate(COL.OVERTIME_PROPOSALS || "overtime_proposals", options.proposalId, {
          status: "DIJADIKAN_SPPKL",
          order_id: orderId,
          order_number: sppklNumber,
          approved_by: userNama,
          approved_at: new Date().toISOString()
        });
      }

      closeModal();
      toast(`Surat Perintah Lembur ${sppklNumber} berhasil diterbitkan!`, "success");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast("Gagal membuat SPPKL: " + err.message, "error");
    }
  });
}

/**
 * Modal Ajukan Usulan Lembur (Karyawan Mandiri)
 */
export function openSubmitProposalModal(state = {}, onSuccess = () => {}) {
  const { userNama = "Karyawan", userNik = "", userDivisi = "Umum" } = state;
  const todayStr = new Date().toISOString().slice(0, 10);

  const modalHtml = `
  <div class="space-y-4 text-xs">
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-900">
      <div class="font-bold flex items-center justify-between">
        <span>Pengajuan Usulan Lembur Mandiri</span>
        <span class="text-[10px] bg-blue-200/80 px-2 py-0.5 rounded-full font-bold">Usulan</span>
      </div>
      <p class="text-[11px] text-blue-700 mt-1">Usulan ini akan ditinjau oleh atasan langsung untuk disetujui menjadi Surat Perintah Lembur (SPPKL) resmi.</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block font-bold text-slate-700 mb-1">Nama Pemohon</label>
        <input type="text" value="${escapeHtml(userNama)} (${escapeHtml(userNik || '-')})" disabled class="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-xl text-slate-600 font-semibold text-xs">
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Tanggal Diusulkan <span class="text-rose-500">*</span></label>
        <input type="date" id="m-prop-tanggal" value="${todayStr}" class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 font-semibold text-xs">
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block font-bold text-slate-700 mb-1">Perkiraan Jam Mulai <span class="text-rose-500">*</span></label>
        <input type="time" id="m-prop-jam-mulai" value="17:00" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold text-xs">
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Perkiraan Jam Selesai <span class="text-rose-500">*</span></label>
        <input type="time" id="m-prop-jam-selesai" value="19:00" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold text-xs">
      </div>
    </div>

    <div>
      <label class="block font-bold text-slate-700 mb-1">Rincian Tugas yang Harus Dikerjakan <span class="text-rose-500">*</span></label>
      <textarea id="m-prop-tugas" rows="2" placeholder="Jelaskan pekerjaan penting yang memerlukan kerja lembur..." class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs"></textarea>
    </div>

    <div>
      <label class="block font-bold text-slate-700 mb-1">Alasan Kebutuhan Lembur <span class="text-rose-500">*</span></label>
      <textarea id="m-prop-alasan" rows="2" placeholder="Mengapa pekerjaan ini tidak dapat diselesaikan pada jam kerja normal..." class="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-maroon-500 text-xs"></textarea>
    </div>

    <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
      <button id="btn-cancel-prop" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">Batal</button>
      <button id="btn-submit-prop" class="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs shadow-xs transition flex items-center gap-1.5">
        <span>Kirim Usulan Lembur</span>
      </button>
    </div>
  </div>
  `;

  openModal("Ajukan Usulan Lembur", modalHtml);

  document.getElementById("btn-cancel-prop")?.addEventListener("click", () => closeModal());

  document.getElementById("btn-submit-prop")?.addEventListener("click", async () => {
    const tanggal = document.getElementById("m-prop-tanggal")?.value;
    const start = document.getElementById("m-prop-jam-mulai")?.value;
    const end = document.getElementById("m-prop-jam-selesai")?.value;
    const tugas = document.getElementById("m-prop-tugas")?.value?.trim();
    const alasan = document.getElementById("m-prop-alasan")?.value?.trim();

    if (!tanggal || !start || !end || !tugas || !alasan) {
      return toast("Harap lengkapi semua field usulan lembur!", "warning");
    }

    const propId = genId("PROP");
    const payload = {
      id: propId,
      nama_pemohon: userNama,
      nik_pemohon: userNik,
      divisi: userDivisi,
      tanggal,
      jam_mulai: start,
      jam_selesai: end,
      pekerjaan: tugas,
      alasan,
      status: "USULAN_DIAJUKAN",
      created_at: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, COL.OVERTIME_PROPOSALS || "overtime_proposals", propId), payload);
      closeModal();
      toast("Usulan lembur berhasil dikirim ke atasan!", "success");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast("Gagal mengirim usulan: " + err.message, "error");
    }
  });
}

/**
 * Modal Verifikasi Realisasi & Finalisasi Jam Lembur (Atasan & HR)
 */
export function openVerifyRealisasiModal(order, state = {}, onSuccess = () => {}) {
  const { allAbsensi = [], currentConfig = DEFAULT_OVERTIME_CONFIG, isHr = false, userNama = "Verifikator" } = state;

  // Match attendance log
  const matchAbs = allAbsensi.find(a => 
    (a.nik === order.nik_karyawan || a.nama === order.nama_karyawan) && 
    (a.tanggal === order.tanggal || String(a.createdAt || "").slice(0, 10) === order.tanggal)
  );

  const planStart = order.planned_start_at || order.jam_mulai || "-";
  const planEnd = order.planned_end_at || order.jam_selesai || "-";
  const planMins = Number(order.planned_minutes) || (Number(order.durasi_jam || 0) * 60);

  const curActualStart = order.actual_start_at || order.jam_mulai_aktual || planStart;
  const curActualEnd = order.actual_end_at || order.jam_selesai_aktual || planEnd;
  const curBreak = Number(order.actual_break_minutes !== undefined ? order.actual_break_minutes : (order.istirahat_aktual_menit || 0));

  const modalHtml = `
  <div class="space-y-4 text-xs">
    <!-- Sub-Header Info -->
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
      <div>
        <div class="font-bold text-slate-800">${escapeHtml(order.nama_karyawan || '-')}</div>
        <div class="text-[11px] text-slate-500 font-mono">${escapeHtml(order.order_number || order.nomor_sppkl || order.id)} • ${fmtDateShort(order.tanggal)}</div>
      </div>
      <div class="text-right">
        <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-bold">Verifikasi Realisasi</span>
      </div>
    </div>

    <!-- 4-Way Comparison Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <!-- 1. Rencana SPPKL -->
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">1. Rencana SPPKL</span>
        <div class="font-mono font-bold text-slate-800 text-sm">${planStart} s/d ${planEnd}</div>
        <div class="text-[11px] text-slate-600 font-medium">${fmtMinutesToDisplay(planMins)}</div>
      </div>

      <!-- 2. Log Absensi Mesin -->
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">2. Log Absensi Mesin/GPS</span>
        ${matchAbs ? `
          <div class="font-mono font-bold text-emerald-700 text-sm">${matchAbs.jam_masuk || '-'} s/d ${matchAbs.jam_pulang || '-'}</div>
          <div class="text-[11px] text-slate-500">Status Kehadiran: <span class="font-bold text-slate-700">${matchAbs.status || 'HADIR'}</span></div>
        ` : `
          <div class="font-mono font-bold text-amber-600 text-sm">Tidak Ditemukan Log</div>
          <div class="text-[11px] text-slate-400">Harap sertakan bukti fisik/lampiran kerja</div>
        `}
      </div>
    </div>

    <!-- Input Realisasi Aktual -->
    <div class="p-3 bg-white border border-slate-300 rounded-xl space-y-3">
      <div class="font-bold text-slate-800">3. Waktu Kerja Aktual yang Dilaksanakan</div>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Jam Mulai Aktual</label>
          <input type="time" id="m-vr-act-start" value="${curActualStart}" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Jam Selesai Aktual</label>
          <input type="time" id="m-vr-act-end" value="${curActualEnd}" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
        <div>
          <label class="block text-[11px] text-slate-500 mb-1">Istirahat Aktual (Menit)</label>
          <input type="number" id="m-vr-act-break" value="${curBreak}" min="0" step="15" class="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold">
        </div>
      </div>

      <!-- Live Calculation Card (Internal Andela Policy) -->
      <div id="m-vr-calc-box" class="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
        <div>
          <div class="text-[10px] text-purple-700 font-bold uppercase">4. Hasil Konversi Jam Kebijakan Andela</div>
          <div id="m-vr-calc-text" class="text-xs text-purple-900 font-semibold mt-0.5">Memuat kalkulasi...</div>
        </div>
        <div class="text-right">
          <span id="m-vr-final-badge" class="text-xl font-black font-mono text-purple-800">0 JAM</span>
          <div class="text-[9px] text-purple-600 font-medium">(Maks 4 Jam / Hari)</div>
        </div>
      </div>

      <!-- Variance Flags -->
      <div id="m-vr-flags" class="space-y-1"></div>

      <div>
        <label class="block font-bold text-slate-700 mb-1">Hasil / Output Pekerjaan yang Selesai <span class="text-rose-500">*</span></label>
        <textarea id="m-vr-hasil" rows="2" placeholder="Catat hasil pekerjaan lembur yang telah selesai..." class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs">${escapeHtml(order.actual_work_result || order.hasil_pekerjaan || '')}</textarea>
      </div>

      ${isHr ? `
      <div>
        <label class="block font-bold text-slate-700 mb-1">Catatan Verifikasi HRGA / Alasan Koreksi (Bila Ada)</label>
        <input type="text" id="m-vr-hr-notes" value="${escapeHtml(order.hr_verification_notes || '')}" placeholder="Koreksi jam disetujui HR..." class="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs">
      </div>
      ` : ''}
    </div>

    <!-- Actions -->
    <div class="pt-3 border-t border-slate-200 flex items-center justify-between">
      <button id="btn-vr-clarify" class="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-xl text-xs transition">Minta Klarifikasi</button>
      <div class="flex items-center gap-2">
        <button id="btn-vr-cancel" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition">Tutup</button>
        <button id="btn-vr-save" class="px-5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs shadow-xs transition">
          <span>${isHr ? 'Finalisasi & Kunci Jam HR' : 'Simpan & Verifikasi Atasan'}</span>
        </button>
      </div>
    </div>
  </div>
  `;

  openModal("Verifikasi Realisasi & Jam Lembur Final", modalHtml);

  const actStartEl = document.getElementById("m-vr-act-start");
  const actEndEl = document.getElementById("m-vr-act-end");
  const actBreakEl = document.getElementById("m-vr-act-break");
  const calcTextEl = document.getElementById("m-vr-calc-text");
  const finalBadgeEl = document.getElementById("m-vr-final-badge");
  const flagsEl = document.getElementById("m-vr-flags");

  function refreshCalculations() {
    const netMins = calculateDurationMinutes(actStartEl.value, actEndEl.value, Number(actBreakEl.value) || 0);
    const andelaHours = calculateAndelaHours(netMins, currentConfig);

    calcTextEl.textContent = `Durasi Bersih: ${fmtMinutesToDisplay(netMins)} → Dihitung ${andelaHours.countedFullHours} jam penuh.`;
    finalBadgeEl.textContent = `${andelaHours.approvedHoursHr} JAM`;

    // Detect variance flags
    const flags = detectOvertimeVariances(order, { actual_minutes: netMins }, matchAbs, currentConfig);
    if (flags.length > 0) {
      flagsEl.innerHTML = flags.map(f => `
        <div class="p-2 rounded-lg text-[11px] font-medium flex items-center justify-between ${f.severity === 'alert' ? 'bg-rose-50 text-rose-800 border border-rose-200' : f.severity === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}">
          <span><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.description)}</span>
        </div>
      `).join('');
    } else {
      flagsEl.innerHTML = '<div class="p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold">✓ Realisasi sesuai dengan jadwal rencana SPPKL.</div>';
    }
  }

  actStartEl?.addEventListener("change", refreshCalculations);
  actEndEl?.addEventListener("change", refreshCalculations);
  actBreakEl?.addEventListener("input", refreshCalculations);
  refreshCalculations();

  document.getElementById("btn-vr-cancel")?.addEventListener("click", () => closeModal());

  document.getElementById("btn-vr-clarify")?.addEventListener("click", async () => {
    const note = prompt("Masukkan catatan/pertanyaan klarifikasi kepada karyawan/atasan:");
    if (note === null) return;
    if (!note.trim()) return toast("Wajib mengisi alasan klarifikasi!", "warning");

    await fsUpdate(COL.OVERTIME_ORDERS || "overtime_orders", order.id, {
      current_status: "PERLU_KLARIFIKASI",
      status: "PERLU_KLARIFIKASI",
      clarification_note: note,
      clarification_by: userNama,
      clarification_at: new Date().toISOString()
    });

    closeModal();
    toast("Status diubah menjadi Perlu Klarifikasi", "info");
    onSuccess();
  });

  document.getElementById("btn-vr-save")?.addEventListener("click", async () => {
    const startAct = actStartEl?.value;
    const endAct = actEndEl?.value;
    const breakAct = Number(actBreakEl?.value) || 0;
    const hasil = document.getElementById("m-vr-hasil")?.value?.trim();
    const hrNotes = document.getElementById("m-vr-hr-notes")?.value?.trim() || "";

    if (!hasil) return toast("Wajib mencatat hasil pekerjaan yang diselesaikan!", "warning");

    const netMins = calculateDurationMinutes(startAct, endAct, breakAct);
    const andelaHours = calculateAndelaHours(netMins, currentConfig);

    const updatePayload = {
      actual_start_at: startAct,
      jam_mulai_aktual: startAct,
      actual_end_at: endAct,
      jam_selesai_aktual: endAct,
      actual_break_minutes: breakAct,
      istirahat_aktual_menit: breakAct,
      actual_minutes: netMins,
      durasi_aktual_menit: netMins,
      durasi_aktual: Math.round((netMins / 60) * 10) / 10,
      actual_work_result: hasil,
      hasil_pekerjaan: hasil,
      counted_full_hours: andelaHours.countedFullHours,
      approved_hours_hr: andelaHours.approvedHoursHr,
      jam_disetujui_hr: andelaHours.approvedHoursHr,
      durasi_final_hr: andelaHours.approvedHoursHr,
      over_four_hours_flag: andelaHours.isOverCap,
      rounding_policy_version: andelaHours.policyVersion,
      updated_at: new Date().toISOString()
    };

    if (isHr) {
      updatePayload.current_status = "SELESAI_DIVERIFIKASI_HR";
      updatePayload.status = "SELESAI_DIVERIFIKASI_HR";
      updatePayload.hr_verified_by = userNama;
      updatePayload.hr_verified_at = new Date().toISOString();
      updatePayload.hr_verification_notes = hrNotes;
    } else {
      updatePayload.current_status = "MENUNGGU_VERIFIKASI_HR";
      updatePayload.status = "MENUNGGU_VERIFIKASI_HR";
      updatePayload.supervisor_verified_by = userNama;
      updatePayload.supervisor_verified_at = new Date().toISOString();
    }

    try {
      await fsUpdate(COL.OVERTIME_ORDERS || "overtime_orders", order.id, updatePayload);
      closeModal();
      toast(`Realisasi lembur berhasil ${isHr ? 'diselesaikan dan diverifikasi HR' : 'diverifikasi oleh atasan'}!`, "success");
      onSuccess();
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan verifikasi: " + err.message, "error");
    }
  });
}
