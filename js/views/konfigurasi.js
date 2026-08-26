import { db, COL, doc, getDoc, setDoc, collection, getDocs, writeBatch, query, where } from "../firebase-config.js";
import { toast, escapeHtml, sendEmailNotif, buildStandardEmailHtml, smartParseDate, fmtDateShort } from "../utils.js";

export async function mount(container, { session }) {
  const tBody = container.querySelector("#cfg-jadwal-tbody");
  const docRef = doc(db, COL.APP_SETTINGS, "main");
  let cfg = { jadwal: [], tarif: {}, dashboard_widgets: {}, email_reminders: {} };

  async function loadConfig() {
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) cfg = snap.data();
      const t = cfg.tarif || {};
      container.querySelector("#cfg-um-driver").value = t.um_driver || "";
      container.querySelector("#cfg-um-helper").value = t.um_helper || "";
      container.querySelector("#cfg-lembur-bo").value = t.lembur_bo || "";
      container.querySelector("#cfg-lembur-wh").value = t.lembur_wh || "";
      container.querySelector("#cfg-tol-telat").value = t.tol_telat || "";
      container.querySelector("#cfg-denda-awal").value = t.denda_awal || "";
      container.querySelector("#cfg-denda-prog").value = t.denda_prog || "";
      container.querySelector("#cfg-denda-alpa").value = t.denda_alpa || "";
      
      // Load Master Karyawan for per-user widget selector
      const targetUserSelect = container.querySelector("#cfg-widget-target-user");
      if (targetUserSelect) {
        try {
          const kSnap = await getDocs(collection(db, COL.MASTER_KARYAWAN));
          const listKaryawan = kSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a,b) => (a.nama_karyawan || a.nama || "").localeCompare(b.nama_karyawan || b.nama || ""));
          
          targetUserSelect.innerHTML = `
            <option value="GLOBAL">[ GLOBAL ] - Berlaku Default Untuk Semua Karyawan</option>
            <optgroup label="Pengaturan Khusus Per-Karyawan">
              ${listKaryawan.map(k => {
                const rawId = String(k.username || k.nik_karyawan || k.nik || k.nama_karyawan || k.nama || "");
                const identifier = rawId.trim().toLowerCase();
                const displayName = `${k.nama_karyawan || k.nama || 'Karyawan'} (${k.nik_karyawan || k.nik || '-'})`;
                return `<option value="${escapeHtml(identifier)}">${escapeHtml(displayName)}</option>`;
              }).join("")}
            </optgroup>
          `;
        } catch (e) {
          console.warn("Err loading karyawan for widget config:", e);
        }

        targetUserSelect.onchange = () => {
          syncWidgetCheckboxes();
        };
      }

      syncWidgetCheckboxes();
      syncEmailReminderInputs();
      renderJadwal();
    } catch(e) { console.error(e); }
  }

  function syncWidgetCheckboxes() {
    const targetUserSelect = container.querySelector("#cfg-widget-target-user");
    const targetKey = targetUserSelect ? targetUserSelect.value : "GLOBAL";
    
    let targetCfg = {};
    if (targetKey === "GLOBAL") {
      targetCfg = cfg.dashboard_widgets || {};
    } else {
      const userWidgets = cfg.user_dashboard_widgets || {};
      targetCfg = userWidgets[targetKey] || cfg.dashboard_widgets || {};
    }

    container.querySelectorAll(".cfg-widget-toggle").forEach(chk => {
      chk.checked = targetCfg[chk.dataset.widget] !== false;
    });
  }

  function syncEmailReminderInputs() {
    const em = cfg.email_reminders || {};
    
    // 1. Kendaraan & Pajak Armada
    const emKendaraan = em.kendaraan_pajak || {};
    const elKendaraanTo = container.querySelector("#cfg-em-kendaraan-to");
    const elKendaraanActive = container.querySelector("#cfg-em-kendaraan-active");
    const elKendaraanDays = container.querySelector("#cfg-em-kendaraan-days");
    const elKendaraanServiceDays = container.querySelector("#cfg-em-kendaraan-service-days");
    const elKendaraanStnk = container.querySelector("#cfg-em-kendaraan-stnk");
    const elKendaraanPajak5th = container.querySelector("#cfg-em-kendaraan-pajak5th");
    const elKendaraanKir = container.querySelector("#cfg-em-kendaraan-kir");
    const elKendaraanService = container.querySelector("#cfg-em-kendaraan-service");
    const elKendaraanCc = container.querySelector("#cfg-em-kendaraan-cc");

    if (elKendaraanTo) elKendaraanTo.value = emKendaraan.email_tujuan || "generalaffairhrandelajaya@gmail.com";
    if (elKendaraanActive) elKendaraanActive.checked = emKendaraan.enabled !== false;
    if (elKendaraanDays) elKendaraanDays.value = emKendaraan.days_threshold !== undefined ? emKendaraan.days_threshold : 30;
    if (elKendaraanServiceDays) elKendaraanServiceDays.value = emKendaraan.service_days_threshold !== undefined ? emKendaraan.service_days_threshold : 14;
    if (elKendaraanStnk) elKendaraanStnk.checked = emKendaraan.send_stnk !== false;
    if (elKendaraanPajak5th) elKendaraanPajak5th.checked = emKendaraan.send_pajak5th !== false;
    if (elKendaraanKir) elKendaraanKir.checked = emKendaraan.send_kir !== false;
    if (elKendaraanService) elKendaraanService.checked = emKendaraan.send_service !== false;
    if (elKendaraanCc) elKendaraanCc.value = emKendaraan.cc || "";

    // 2. Kontrak Karyawan
    const emKontrak = em.kontrak_karyawan || {};
    const elKontrakTo = container.querySelector("#cfg-em-kontrak-to");
    const elKontrakActive = container.querySelector("#cfg-em-kontrak-active");
    const elKontrakDays = container.querySelector("#cfg-em-kontrak-days");
    const elKontrakProbation = container.querySelector("#cfg-em-kontrak-probation");
    const elKontrakCc = container.querySelector("#cfg-em-kontrak-cc");

    if (elKontrakTo) elKontrakTo.value = emKontrak.email_tujuan || "generalaffairhrandelajaya@gmail.com";
    if (elKontrakActive) elKontrakActive.checked = emKontrak.enabled !== false;
    if (elKontrakDays) elKontrakDays.value = emKontrak.days_threshold !== undefined ? emKontrak.days_threshold : 30;
    if (elKontrakProbation) elKontrakProbation.checked = emKontrak.include_probation !== false;
    if (elKontrakCc) elKontrakCc.value = emKontrak.cc || "";

    // 3. KPI
    const emKpi = em.penilaian_kpi || {};
    const elKpiTo = container.querySelector("#cfg-em-kpi-to");
    const elKpiActive = container.querySelector("#cfg-em-kpi-active");
    const elKpiDays = container.querySelector("#cfg-em-kpi-days");
    const elKpiCc = container.querySelector("#cfg-em-kpi-cc");

    if (elKpiTo) elKpiTo.value = emKpi.email_tujuan || "generalaffairhrandelajaya@gmail.com";
    if (elKpiActive) elKpiActive.checked = emKpi.enabled !== false;
    if (elKpiDays) elKpiDays.value = emKpi.days_threshold !== undefined ? emKpi.days_threshold : 7;
    if (elKpiCc) elKpiCc.value = emKpi.cc || "";

    // 4. LPJ Kasbon & Kalender
    const emKasbon = em.lpj_kasbon || {};
    const emKalender = em.kalender_hr || {};
    const elKasbonTo = container.querySelector("#cfg-em-kasbon-to");
    const elKasbonActive = container.querySelector("#cfg-em-kasbon-active");
    const elKasbonDays = container.querySelector("#cfg-em-kasbon-days");
    const elKalenderDays = container.querySelector("#cfg-em-kalender-days");
    const elKasbonCc = container.querySelector("#cfg-em-kasbon-cc");

    if (elKasbonTo) elKasbonTo.value = emKasbon.email_tujuan || "generalaffairhrandelajaya@gmail.com";
    if (elKasbonActive) elKasbonActive.checked = emKasbon.enabled !== false;
    if (elKasbonDays) elKasbonDays.value = emKasbon.days_threshold !== undefined ? emKasbon.days_threshold : 3;
    if (elKalenderDays) elKalenderDays.value = emKalender.days_threshold !== undefined ? emKalender.days_threshold : 1;
    if (elKasbonCc) elKasbonCc.value = emKasbon.cc || "";
  }

  function getEmailRemindersData() {
    return {
      kendaraan_pajak: {
        email_tujuan: (container.querySelector("#cfg-em-kendaraan-to")?.value || "").trim() || "generalaffairhrandelajaya@gmail.com",
        enabled: container.querySelector("#cfg-em-kendaraan-active")?.checked ?? true,
        days_threshold: parseInt(container.querySelector("#cfg-em-kendaraan-days")?.value || "30", 10),
        service_days_threshold: parseInt(container.querySelector("#cfg-em-kendaraan-service-days")?.value || "14", 10),
        send_stnk: container.querySelector("#cfg-em-kendaraan-stnk")?.checked ?? true,
        send_pajak5th: container.querySelector("#cfg-em-kendaraan-pajak5th")?.checked ?? true,
        send_kir: container.querySelector("#cfg-em-kendaraan-kir")?.checked ?? true,
        send_service: container.querySelector("#cfg-em-kendaraan-service")?.checked ?? true,
        cc: (container.querySelector("#cfg-em-kendaraan-cc")?.value || "").trim()
      },
      kontrak_karyawan: {
        email_tujuan: (container.querySelector("#cfg-em-kontrak-to")?.value || "").trim() || "generalaffairhrandelajaya@gmail.com",
        enabled: container.querySelector("#cfg-em-kontrak-active")?.checked ?? true,
        days_threshold: parseInt(container.querySelector("#cfg-em-kontrak-days")?.value || "30", 10),
        include_probation: container.querySelector("#cfg-em-kontrak-probation")?.checked ?? true,
        cc: (container.querySelector("#cfg-em-kontrak-cc")?.value || "").trim()
      },
      penilaian_kpi: {
        email_tujuan: (container.querySelector("#cfg-em-kpi-to")?.value || "").trim() || "generalaffairhrandelajaya@gmail.com",
        enabled: container.querySelector("#cfg-em-kpi-active")?.checked ?? true,
        days_threshold: parseInt(container.querySelector("#cfg-em-kpi-days")?.value || "7", 10),
        cc: (container.querySelector("#cfg-em-kpi-cc")?.value || "").trim()
      },
      lpj_kasbon: {
        email_tujuan: (container.querySelector("#cfg-em-kasbon-to")?.value || "").trim() || "generalaffairhrandelajaya@gmail.com",
        enabled: container.querySelector("#cfg-em-kasbon-active")?.checked ?? true,
        days_threshold: parseInt(container.querySelector("#cfg-em-kasbon-days")?.value || "3", 10),
        cc: (container.querySelector("#cfg-em-kasbon-cc")?.value || "").trim()
      },
      kalender_hr: {
        email_tujuan: (container.querySelector("#cfg-em-kasbon-to")?.value || "").trim() || "generalaffairhrandelajaya@gmail.com",
        enabled: container.querySelector("#cfg-em-kasbon-active")?.checked ?? true,
        days_threshold: parseInt(container.querySelector("#cfg-em-kalender-days")?.value || "1", 10),
        cc: (container.querySelector("#cfg-em-kasbon-cc")?.value || "").trim()
      },
      updated_at: new Date().toISOString(),
      updated_by: session?.nama || session?.username || "Admin"
    };
  }

  async function saveEmailReminders(notify = true) {
    const emailData = getEmailRemindersData();
    try {
      await setDoc(docRef, { email_reminders: emailData }, { merge: true });
      await setDoc(doc(db, COL.KONFIGURASI_EMAIL, "main"), emailData, { merge: true }).catch(() => {});
      cfg.email_reminders = emailData;
      if (notify) toast("Pengaturan Email Pengingat Berhasil Disimpan!", "success");
      return true;
    } catch(e) {
      console.error("Gagal simpan konfigurasi email:", e);
      if (notify) toast("Gagal menyimpan email pengingat: " + e.message, "error");
      return false;
    }
  }

  function renderJadwal() {
    if (!cfg.jadwal) cfg.jadwal = [];
    tBody.innerHTML = cfg.jadwal.map((j, i) => `
      <tr class="border-b border-slate-50">
        <td class="py-2 pr-2"><input type="text" class="j-jabatan w-full border rounded px-2 py-1 outline-none text-xs" value="${escapeHtml(j.jabatan)}" placeholder="SEMUA JABATAN"></td>
        <td class="py-2 pr-2"><input type="text" class="j-hari w-full border rounded px-2 py-1 outline-none text-xs" value="${escapeHtml(j.hari)}" placeholder="Senin - Jumat"></td>
        <td class="py-2 pr-2"><input type="time" class="j-masuk w-full border rounded px-2 py-1 outline-none text-xs" value="${j.masuk}"></td>
        <td class="py-2 pr-2"><input type="time" class="j-pulang w-full border rounded px-2 py-1 outline-none text-xs" value="${j.pulang}"></td>
        <td class="py-2 text-center"><button type="button" data-del="${i}" class="text-red-500 hover:text-red-700 font-bold">&times;</button></td>
      </tr>
    `).join("");
    tBody.querySelectorAll("button[data-del]").forEach(btn => {
      btn.onclick = () => { cfg.jadwal.splice(btn.dataset.del, 1); renderJadwal(); };
    });
  }

  container.querySelector("#btn-add-shift").onclick = () => {
    cfg.jadwal.push({ jabatan: "", hari: "", masuk: "08:00", pulang: "17:00" });
    renderJadwal();
  };

  container.querySelector("#btn-save-cfg").onclick = async () => {
    const btn = container.querySelector("#btn-save-cfg");
    btn.disabled = true; btn.textContent = "Menyimpan...";
    const jadwalBaru = [];
    tBody.querySelectorAll("tr").forEach(tr => {
      jadwalBaru.push({
        jabatan: tr.querySelector(".j-jabatan").value.trim(),
        hari: tr.querySelector(".j-hari").value.trim(),
        masuk: tr.querySelector(".j-masuk").value,
        pulang: tr.querySelector(".j-pulang").value
      });
    });
    const tarifBaru = {
      um_driver: container.querySelector("#cfg-um-driver").value,
      um_helper: container.querySelector("#cfg-um-helper").value,
      lembur_bo: container.querySelector("#cfg-lembur-bo").value,
      lembur_wh: container.querySelector("#cfg-lembur-wh").value,
      tol_telat: container.querySelector("#cfg-tol-telat").value,
      denda_awal: container.querySelector("#cfg-denda-awal").value,
      denda_prog: container.querySelector("#cfg-denda-prog").value,
      denda_alpa: container.querySelector("#cfg-denda-alpa").value,
    };
    const emailData = getEmailRemindersData();

    try {
      await setDoc(docRef, { jadwal: jadwalBaru, tarif: tarifBaru, email_reminders: emailData }, { merge: true });
      await setDoc(doc(db, COL.KONFIGURASI_EMAIL, "main"), emailData, { merge: true }).catch(() => {});
      cfg.jadwal = jadwalBaru;
      cfg.tarif = tarifBaru;
      cfg.email_reminders = emailData;
      toast("Seluruh Konfigurasi Sistem & Email Pengingat Berhasil Disimpan!", "success");
    } catch(e) { toast("Gagal menyimpan: " + e.message, "error"); }
    btn.disabled = false; btn.textContent = "Simpan Semua Konfigurasi";
  };

  // Button Simpan Khusus Email Reminders
  const btnSaveEmailReminders = container.querySelector("#btn-save-email-reminders");
  if (btnSaveEmailReminders) {
    btnSaveEmailReminders.onclick = async () => {
      btnSaveEmailReminders.disabled = true;
      btnSaveEmailReminders.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        Menyimpan...
      `;
      await saveEmailReminders(true);
      btnSaveEmailReminders.disabled = false;
      btnSaveEmailReminders.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
        Simpan Pengaturan Email
      `;
    };
  }

  // Uji Coba Kirim Email Pengingat Kendaraan
  const btnTestEmKendaraan = container.querySelector("#btn-test-em-kendaraan");
  if (btnTestEmKendaraan) {
    btnTestEmKendaraan.onclick = async () => {
      const emailTo = container.querySelector("#cfg-em-kendaraan-to")?.value.trim();
      const cc = container.querySelector("#cfg-em-kendaraan-cc")?.value.trim();
      if (!emailTo) return toast("Masukkan alamat email tujuan terlebih dahulu.", "warning");

      btnTestEmKendaraan.disabled = true;
      btnTestEmKendaraan.textContent = "Mengirim Test...";

      const htmlBody = buildStandardEmailHtml({
        badgeText: "Uji Coba Pengingat",
        badgeVariant: "maroon",
        title: "Uji Coba Pengingat Armada & Dokumen",
        recipientName: "Tim General Affair / Operasional",
        introText: "Ini adalah pesan konfirmasi bahwa integrasi sistem pengiriman email pengingat legalitas kendaraan (Pajak STNK, Pajak 5 Tahunan, Uji KIR, dan Service Berkala) telah <strong>BERHASIL TERHUBUNG</strong>.",
        infoList: [
          { label: "Email Penerima", value: emailTo },
          { label: "Ambang Batas Peringatan", value: `${container.querySelector("#cfg-em-kendaraan-days")?.value || 30} Hari Sebelum Jatuh Tempo` },
          { label: "Waktu Pengujian", value: new Date().toLocaleString("id-ID") }
        ],
        actionUrl: `${window.location.origin}/#kendaraan`,
        actionText: "Buka Data Master Kendaraan →",
        secondaryNote: "Sistem HRIS akan secara otomatis mengirimkan rekap ketika ada dokumen armada yang mendekati masa perpanjangan."
      });

      try {
        const ok = await sendEmailNotif(emailTo, "[TEST NOTIFIKASI] Pengingat Pajak & Dokumen Armada HRIS Andela Jaya", htmlBody, cc);
        if (ok) {
          toast(`Email uji coba pengingat kendaraan berhasil dikirim ke ${emailTo}!`, "success");
        } else {
          toast("Gagal mengirim email uji coba. Periksa koneksi atau konfigurasi Gmail SMTP.", "error");
        }
      } catch (err) {
        toast("Error kirim email: " + err.message, "error");
      }
      btnTestEmKendaraan.disabled = false;
      btnTestEmKendaraan.textContent = "✉️ Uji Coba Kirim";
    };
  }

  // Scan & Kirim Rekap Pajak Kendaraan Sekarang
  const btnScanSendKendaraan = container.querySelector("#btn-scan-send-kendaraan");
  if (btnScanSendKendaraan) {
    btnScanSendKendaraan.onclick = async () => {
      const emailTo = container.querySelector("#cfg-em-kendaraan-to")?.value.trim() || "generalaffairhrandelajaya@gmail.com";
      const cc = container.querySelector("#cfg-em-kendaraan-cc")?.value.trim();
      const thresholdDays = parseInt(container.querySelector("#cfg-em-kendaraan-days")?.value || "30", 10);
      const serviceThresholdDays = parseInt(container.querySelector("#cfg-em-kendaraan-service-days")?.value || "14", 10);

      btnScanSendKendaraan.disabled = true;
      btnScanSendKendaraan.textContent = "Sedang Memeriksa Armada...";

      try {
        const vSnap = await getDocs(collection(db, COL.MASTER_KENDARAAN));
        const now = new Date();
        const urgentItems = [];

        vSnap.docs.forEach(d => {
          const v = d.data();
          const plate = v.no_polisi || d.id || "Tanpa Plat";
          const name = `${v.merk || ""} ${v.tipe || ""}`.trim() || plate;

          // Check STNK
          if (v.tgl_stnk_tahunan) {
            const dt = smartParseDate(v.tgl_stnk_tahunan);
            if (dt) {
              const days = Math.round((dt - now) / 86400000);
              if (days <= thresholdDays) {
                urgentItems.push({ plate, name, type: "Perpanjangan STNK (Tahunan)", date: dt, days, level: days < 0 ? "EXPIRED" : "WARNING" });
              }
            }
          }

          // Check Pajak 5 Tahun
          if (v.tgl_pajak_5thn) {
            const dt = smartParseDate(v.tgl_pajak_5thn);
            if (dt) {
              const days = Math.round((dt - now) / 86400000);
              if (days <= thresholdDays) {
                urgentItems.push({ plate, name, type: "Pajak 5 Tahunan (Ganti Plat)", date: dt, days, level: days < 0 ? "EXPIRED" : "WARNING" });
              }
            }
          }

          // Check KIR
          if (v.tgl_kir) {
            const dt = smartParseDate(v.tgl_kir);
            if (dt) {
              const days = Math.round((dt - now) / 86400000);
              if (days <= thresholdDays) {
                urgentItems.push({ plate, name, type: "Uji Berkala KIR Kendaraan", date: dt, days, level: days < 0 ? "EXPIRED" : "WARNING" });
              }
            }
          }

          // Check Scheduled Service
          if (v.tgl_service_berikutnya) {
            const dt = smartParseDate(v.tgl_service_berikutnya);
            if (dt) {
              const days = Math.round((dt - now) / 86400000);
              if (days <= serviceThresholdDays) {
                urgentItems.push({ plate, name, type: "Jadwal Rutin Servis Armada", date: dt, days, level: days < 0 ? "EXPIRED" : "WARNING" });
              }
            }
          }
        });

        urgentItems.sort((a, b) => a.days - b.days);

        if (!urgentItems.length) {
          toast("Semua armada kendaraan dalam kondisi aman (tidak ada yang jatuh tempo dalam waktu dekat).", "info");
          btnScanSendKendaraan.disabled = false;
          btnScanSendKendaraan.textContent = "🚀 Scan & Kirim Rekap Pajak Sekarang";
          return;
        }

        // Generate email template
        const tableRowsHtml = urgentItems.map((item, idx) => {
          const isExp = item.days < 0;
          const statusBadge = isExp 
            ? `<span style="background-color: #ffe4e6; color: #9f1239; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">KADALUARSA (${Math.abs(item.days)} hari lalu)</span>`
            : `<span style="background-color: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">${item.days} Hari Lagi</span>`;

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
              <td style="padding: 10px; font-weight: bold; font-family: monospace; font-size: 13px;">${escapeHtml(item.plate)}</td>
              <td style="padding: 10px; font-size: 13px;">${escapeHtml(item.name)}</td>
              <td style="padding: 10px; font-size: 13px;">${escapeHtml(item.type)}</td>
              <td style="padding: 10px; font-size: 13px;">${fmtDateShort(item.date)}</td>
              <td style="padding: 10px; text-align: center;">${statusBadge}</td>
            </tr>
          `;
        }).join("");

        const htmlBody = buildStandardEmailHtml({
          badgeText: "Peringatan Armada",
          badgeVariant: "maroon",
          title: "Rekap Jatuh Tempo Pajak & Dokumen Armada",
          recipientName: "Tim General Affair / Operasional",
          introText: `Berikut adalah rekap <strong>${urgentItems.length} armada kendaraan</strong> yang memerlukan perpanjangan dokumen legalitas (Pajak STNK / KIR) atau servis berkala dalam waktu dekat:`,
          bodyHtml: `
            <div style="overflow-x: auto; margin: 18px 0;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <thead>
                  <tr style="background-color: #f1f5f9; color: #475569; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
                    <th style="padding: 10px;">No. Polisi</th>
                    <th style="padding: 10px;">Kendaraan</th>
                    <th style="padding: 10px;">Kewajiban</th>
                    <th style="padding: 10px;">Jatuh Tempo</th>
                    <th style="padding: 10px; text-align: center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          `,
          actionUrl: `${window.location.origin}/#kendaraan`,
          actionText: "Buka Modul Kendaraan HRIS →",
          secondaryNote: "Mohon segera mengagendakan proses perpanjangan STNK/KIR atau servis berkala armada guna kelancaran operasional distribusi."
        });

        const sent = await sendEmailNotif(emailTo, `[PERHATIAN] Rekap Jatuh Tempo Pajak & Dokumen Armada (${urgentItems.length} Kendaraan)`, htmlBody, cc);
        if (sent) {
          toast(`Berhasil mengirim rekap pengingat ${urgentItems.length} kendaraan ke ${emailTo}!`, "success");
        } else {
          toast("Gagal mengirim email pengingat kendaraan.", "error");
        }
      } catch (err) {
        console.error("Scan kendaraan err:", err);
        toast("Error scan armada: " + err.message, "error");
      }

      btnScanSendKendaraan.disabled = false;
      btnScanSendKendaraan.textContent = "🚀 Scan & Kirim Rekap Pajak Sekarang";
    };
  }

  // Uji Coba Kirim Kontrak
  const btnTestEmKontrak = container.querySelector("#btn-test-em-kontrak");
  if (btnTestEmKontrak) {
    btnTestEmKontrak.onclick = async () => {
      const emailTo = container.querySelector("#cfg-em-kontrak-to")?.value.trim();
      const cc = container.querySelector("#cfg-em-kontrak-cc")?.value.trim();
      if (!emailTo) return toast("Masukkan email tujuan kontrak terlebih dahulu.", "warning");

      btnTestEmKontrak.disabled = true;
      btnTestEmKontrak.textContent = "Mengirim Test...";

      const htmlBody = buildStandardEmailHtml({
        badgeText: "Uji Coba Pengingat",
        badgeVariant: "maroon",
        title: "Uji Coba Pengingat Kontrak Karyawan",
        recipientName: "Tim HRD & General Affair",
        introText: "Pengujian integrasi pengiriman email pengingat masa berlaku kontrak PKWT & evaluasi probation karyawan telah <strong>BERHASIL TERHUBUNG</strong>.",
        infoList: [
          { label: "Email Penerima", value: emailTo },
          { label: "Ambang Batas Peringatan", value: `${container.querySelector("#cfg-em-kontrak-days")?.value || 30} Hari Sebelum Jatuh Tempo` },
          { label: "Waktu Pengujian", value: new Date().toLocaleString("id-ID") }
        ],
        actionUrl: `${window.location.origin}/#manajemen-data`,
        actionText: "Buka Data Karyawan & Kontrak →",
        secondaryNote: "Sistem HRIS akan secara otomatis mengirimkan rekap ketika ada kontrak karyawan yang mendekati masa berakhir."
      });

      const ok = await sendEmailNotif(emailTo, "[TEST NOTIFIKASI] Pengingat Kontrak Karyawan HRIS Andela Jaya", htmlBody, cc);
      if (ok) toast(`Email uji coba kontrak berhasil dikirim ke ${emailTo}!`, "success");
      else toast("Gagal mengirim email uji coba kontrak.", "error");

      btnTestEmKontrak.disabled = false;
      btnTestEmKontrak.textContent = "✉️ Uji Coba Kirim";
    };
  }

  // Scan & Kirim Rekap Kontrak
  const btnScanSendKontrak = container.querySelector("#btn-scan-send-kontrak");
  if (btnScanSendKontrak) {
    btnScanSendKontrak.onclick = async () => {
      const emailTo = container.querySelector("#cfg-em-kontrak-to")?.value.trim() || "generalaffairhrandelajaya@gmail.com";
      const cc = container.querySelector("#cfg-em-kontrak-cc")?.value.trim();
      const thresholdDays = parseInt(container.querySelector("#cfg-em-kontrak-days")?.value || "30", 10);

      btnScanSendKontrak.disabled = true;
      btnScanSendKontrak.textContent = "Sedang Memeriksa Kontrak...";

      try {
        const kSnap = await getDocs(collection(db, COL.MASTER_KONTRAK));
        const now = new Date();
        const urgentContracts = [];

        kSnap.docs.forEach(d => {
          const k = d.data();
          const tglHabis = k.tanggal_berakhir || k.tgl_selesai || k.tgl_habis;
          if (tglHabis) {
            const dt = smartParseDate(tglHabis);
            if (dt) {
              const days = Math.round((dt - now) / 86400000);
              if (days <= thresholdDays) {
                urgentContracts.push({
                  nama: k.nama_karyawan || k.nama || "Karyawan",
                  nik: k.nik_karyawan || k.nik || "-",
                  jabatan: k.jabatan || "-",
                  status: k.status_karyawan || k.status || "PKWT",
                  tgl: dt,
                  days: days
                });
              }
            }
          }
        });

        urgentContracts.sort((a, b) => a.days - b.days);

        if (!urgentContracts.length) {
          toast("Seluruh kontrak karyawan dalam status aman (tidak ada yang habis dalam waktu dekat).", "info");
          btnScanSendKontrak.disabled = false;
          btnScanSendKontrak.textContent = "🚀 Scan & Kirim Rekap Kontrak Sekarang";
          return;
        }

        const tableRowsHtml = urgentContracts.map((c, idx) => {
          const isExp = c.days < 0;
          const statusBadge = isExp 
            ? `<span style="background-color: #ffe4e6; color: #9f1239; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">EXPIRED (${Math.abs(c.days)} hari lalu)</span>`
            : `<span style="background-color: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 11px;">${c.days} Hari Lagi</span>`;

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
              <td style="padding: 10px; font-weight: bold; font-size: 13px;">${escapeHtml(c.nama)}</td>
              <td style="padding: 10px; font-size: 12px; font-family: monospace;">${escapeHtml(c.nik)}</td>
              <td style="padding: 10px; font-size: 13px;">${escapeHtml(c.jabatan)}</td>
              <td style="padding: 10px; font-size: 13px;">${fmtDateShort(c.tgl)}</td>
              <td style="padding: 10px; text-align: center;">${statusBadge}</td>
            </tr>
          `;
        }).join("");

        const htmlBody = buildStandardEmailHtml({
          badgeText: "Peringatan Kontrak",
          badgeVariant: "maroon",
          title: "Rekap Masa Berlaku Kontrak Karyawan",
          recipientName: "Tim HRD & Manajemen",
          introText: `Berikut rekap <strong>${urgentContracts.length} karyawan</strong> yang masa kontrak / probation segera berakhir dan memerlukan tindak lanjut evaluasi / perpanjangan:`,
          bodyHtml: `
            <div style="overflow-x: auto; margin: 18px 0;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <thead>
                  <tr style="background-color: #f1f5f9; color: #475569; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
                    <th style="padding: 10px;">Nama Karyawan</th>
                    <th style="padding: 10px;">NIK</th>
                    <th style="padding: 10px;">Jabatan</th>
                    <th style="padding: 10px;">Batas Kontrak</th>
                    <th style="padding: 10px; text-align: center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml}
                </tbody>
              </table>
            </div>
          `,
          actionUrl: `${window.location.origin}/#manajemen-data`,
          actionText: "Buka Data Karyawan & Kontrak →",
          secondaryNote: "Silakan lakukan penilaian evaluasi kinerja karyawan sebelum masa berlaku kontrak berakhir."
        });

        const sent = await sendEmailNotif(emailTo, `[PERHATIAN] Rekap Masa Kontrak Karyawan Segera Berakhir (${urgentContracts.length} Orang)`, htmlBody, cc);
        if (sent) toast(`Berhasil mengirim rekap ${urgentContracts.length} kontrak ke ${emailTo}!`, "success");
        else toast("Gagal mengirim email rekap kontrak.", "error");

      } catch (err) {
        toast("Error scan kontrak: " + err.message, "error");
      }

      btnScanSendKontrak.disabled = false;
      btnScanSendKontrak.textContent = "🚀 Scan & Kirim Rekap Kontrak Sekarang";
    };
  }

  // Uji Coba Kirim KPI
  const btnTestEmKpi = container.querySelector("#btn-test-em-kpi");
  if (btnTestEmKpi) {
    btnTestEmKpi.onclick = async () => {
      const emailTo = container.querySelector("#cfg-em-kpi-to")?.value.trim();
      const cc = container.querySelector("#cfg-em-kpi-cc")?.value.trim();
      if (!emailTo) return toast("Masukkan email tujuan KPI terlebih dahulu.", "warning");

      btnTestEmKpi.disabled = true;
      btnTestEmKpi.textContent = "Mengirim Test...";

      const htmlBody = buildStandardEmailHtml({
        badgeText: "Uji Coba Pengingat",
        badgeVariant: "maroon",
        title: "Uji Coba Pengingat Penilaian KPI",
        recipientName: "Tim HRD & Atasan Penilai",
        introText: `Uji coba pengiriman pengingat KPI & Penilaian Kinerja HRIS Andela Jaya ke <strong>${escapeHtml(emailTo)}</strong> telah <strong>BERHASIL TERHUBUNG</strong>.`,
        infoList: [
          { label: "Email Tujuan", value: emailTo },
          { label: "Ambang Batas Peringatan", value: `${container.querySelector("#cfg-em-kpi-days")?.value || 7} Hari Sebelum Deadline` },
          { label: "Waktu Pengujian", value: new Date().toLocaleString("id-ID") }
        ],
        actionUrl: `${window.location.origin}/#penilaian-kontrak`,
        actionText: "Buka Modul Penilaian KPI →"
      });
      const ok = await sendEmailNotif(emailTo, "[TEST NOTIFIKASI] Pengingat Penilaian KPI HRIS Andela Jaya", htmlBody, cc);
      if (ok) toast(`Email uji coba KPI berhasil dikirim ke ${emailTo}!`, "success");
      else toast("Gagal mengirim email uji coba KPI.", "error");

      btnTestEmKpi.disabled = false;
      btnTestEmKpi.textContent = "✉️ Uji Coba Kirim";
    };
  }

  // Uji Coba Kirim LPJ / Kalender
  const btnTestEmKasbon = container.querySelector("#btn-test-em-kasbon");
  if (btnTestEmKasbon) {
    btnTestEmKasbon.onclick = async () => {
      const emailTo = container.querySelector("#cfg-em-kasbon-to")?.value.trim();
      const cc = container.querySelector("#cfg-em-kasbon-cc")?.value.trim();
      if (!emailTo) return toast("Masukkan email tujuan terlebih dahulu.", "warning");

      btnTestEmKasbon.disabled = true;
      btnTestEmKasbon.textContent = "Mengirim Test...";

      const htmlBody = buildStandardEmailHtml({
        badgeText: "Uji Coba Pengingat",
        badgeVariant: "maroon",
        title: "Uji Coba Pengingat LPJ & Kalender",
        recipientName: "Tim Finance & HRD",
        introText: `Uji coba pengiriman pengingat LPJ Kasbon & Kalender HRIS Andela Jaya ke <strong>${escapeHtml(emailTo)}</strong> telah <strong>BERHASIL TERHUBUNG</strong>.`,
        infoList: [
          { label: "Email Tujuan", value: emailTo },
          { label: "Waktu Pengujian", value: new Date().toLocaleString("id-ID") }
        ],
        actionUrl: `${window.location.origin}/#kalender-hr`,
        actionText: "Buka Kalender HR & Operasional →"
      });
      const ok = await sendEmailNotif(emailTo, "[TEST NOTIFIKASI] Pengingat LPJ & Kalender HRIS Andela Jaya", htmlBody, cc);
      if (ok) toast(`Email uji coba LPJ/Kalender berhasil dikirim ke ${emailTo}!`, "success");
      else toast("Gagal mengirim email uji coba LPJ/Kalender.", "error");

      btnTestEmKasbon.disabled = false;
      btnTestEmKasbon.textContent = "✉️ Uji Coba Kirim LPJ / Kalender";
    };
  }

  container.querySelector("#btn-save-widget-cfg").onclick = async () => {
    const btn = container.querySelector("#btn-save-widget-cfg");
    const targetUserSelect = container.querySelector("#cfg-widget-target-user");
    const targetKey = targetUserSelect ? targetUserSelect.value : "GLOBAL";

    btn.disabled = true; btn.textContent = "Menyimpan...";
    const widgetCfg = {};
    container.querySelectorAll(".cfg-widget-toggle").forEach(chk => {
      widgetCfg[chk.dataset.widget] = chk.checked;
    });

    try {
      if (targetKey === "GLOBAL") {
        await setDoc(docRef, { dashboard_widgets: widgetCfg }, { merge: true });
        cfg.dashboard_widgets = widgetCfg;
        toast("Pengaturan widget GLOBAL berhasil disimpan", "success");
      } else {
        const userWidgets = cfg.user_dashboard_widgets || {};
        userWidgets[targetKey] = widgetCfg;
        await setDoc(docRef, { user_dashboard_widgets: userWidgets }, { merge: true });
        cfg.user_dashboard_widgets = userWidgets;
        toast(`Pengaturan widget khusus untuk "${targetKey}" berhasil disimpan!`, "success");
      }
    } catch(e) {
      toast("Gagal menyimpan: " + e.message, "error");
    }
    btn.disabled = false; btn.textContent = "Simpan Akses Widget Target";
  };

  container.querySelector("#btn-eksekusi-cuti").onclick = async () => {
    const tgl = container.querySelector("#mass-cuti-tgl").value;
    const ket = container.querySelector("#mass-cuti-ket").value.trim();
    const jenis = container.querySelector("#mass-cuti-jenis").value;
    if(!tgl || !ket) return toast("Tanggal dan Keterangan wajib diisi!", "warning");
    
    if(!confirm(`PERINGATAN!\nAnda akan memotong 1 Saldo Cuti ${jenis} untuk SELURUH karyawan AKTIF pada tanggal ${tgl}.\nLanjutkan?`)) return;
    const btn = container.querySelector("#btn-eksekusi-cuti");
    btn.disabled = true; btn.textContent = "SEDANG MENGEKSEKUSI...";
    try {
      const qK = query(collection(db, COL.MASTER_KARYAWAN), where("aktif_tdk_aktif", "in", ["AKTIF", "Aktif", "aktif"]));
      const snapK = await getDocs(qK);
      
      if (snapK.empty) throw new Error("Tidak ada karyawan aktif ditemukan.");
      
      const chunkedDocs = [];
      let tempArr = [];
      snapK.docs.forEach(doc => {
        tempArr.push(doc);
        if(tempArr.length === 450) { chunkedDocs.push(tempArr); tempArr = []; } 
      });
      if(tempArr.length > 0) chunkedDocs.push(tempArr);

      for (const chunk of chunkedDocs) {
        const batch = writeBatch(db);
        chunk.forEach(kDoc => {
          const kData = kDoc.data();
          const cutiRef = doc(collection(db, COL.MASTER_CUTI));
          batch.set(cutiRef, {
            tanggal: tgl,
            nama_karyawan: kData.nama_karyawan,
            cabang: kData.cabang || "-",
            type_cuti: "CB - Cuti Bersama",
            potong_jatah: jenis,
            keterangan_cuti: ket,
            count: 1,
            tahun: new Date(tgl).getFullYear(),
            bulan: new Date(tgl).toLocaleString('id-ID', { month: 'long' })
          });
        });
        await batch.commit();
      }
      toast(`Sukses! Saldo Cuti ${jenis} untuk ${snapK.docs.length} karyawan telah dipotong.`, "success");
      container.querySelector("#mass-cuti-ket").value = "";
    } catch (e) {
      toast("Gagal eksekusi: " + e.message, "error");
    }
    btn.disabled = false; btn.textContent = "EKSEKUSI MASSAL";
  };

  await loadConfig();
  return { unmount() {} };
}
