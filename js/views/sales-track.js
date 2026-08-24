import {
  openModal, closeModal, toast, escapeHtml, fsGetAll, fsAdd, fsUpdate, fsDelete, downloadXlsx,
  geocodeAddressSmart, parseGpsCoordinates, calcHaversineDistance, calculateSalesRouteMetrics,
  normalizeCheckinItem, cleanSalesName, smartParseDate, confirmDialog, promptDialog, downloadHtmlAsPdf,
  isValidOperationalCoordinate, getDirectImageUrl, findMatchingMasterOutlet, hasExplicitGpsOrPlusCode, cleanStoreName
} from "../utils.js";
import { COL } from "../firebase-config.js";
import { isoDocHeaderTable, COMPANY_NAME, logoImgTag } from "../branding.js";
import { getSession } from "../auth.js";

// Beautiful SVG D3 visualization loaded from ESM
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export async function mount(container, { session } = {}) {
  const activeSession = session || getSession() || {};
  const userRole = (activeSession.role || "").toUpperCase();
  const userPosisi = (activeSession.posisi || activeSession.jabatan || "").toUpperCase();
  const userNama = (activeSession.nama || "").trim();
  const userNik = (activeSession.nik || "").trim();
  const userCabang = (activeSession.cabang || "").trim().toUpperCase();

  // Role Access Levels
  const isSuperOrHrd = ["SUPERADMIN", "HRD", "DIREKTUR", "DIRECTOR", "GM"].includes(userRole);
  const isSpvOrKoordinatorSales = !isSuperOrHrd && (
    ["SPV", "KOORDINATOR", "MANAGER", "BRANCH MANAGER"].includes(userRole) ||
    userPosisi.includes("SPV") ||
    userPosisi.includes("SUPERVISOR") ||
    userPosisi.includes("KOORDINATOR") ||
    userPosisi.includes("KORLAP") ||
    userPosisi.includes("MANAGER")
  );
  const isStandardKaryawan = !isSuperOrHrd && !isSpvOrKoordinatorSales;

  const btnSync = container.querySelector("#btn-sync-kanal");
  const btnExport = container.querySelector("#btn-export-sales-visits");
  const btnExportPdf = container.querySelector("#btn-export-sales-pdf");
  const btnImport = container.querySelector("#btn-import-sales-visits");
  const fileImportInput = container.querySelector("#file-import-sales-visits");
  const btnPurgeDummy = container.querySelector("#btn-purge-dummy-sales");
  const btnConfigDeparture = container.querySelector("#btn-config-departure");
  const timelineEl = container.querySelector("#live-timeline");

  // Apply RBAC UI Restrictions immediately
  if (isStandardKaryawan) {
    if (btnImport) btnImport.classList.add("hidden");
    if (btnPurgeDummy) btnPurgeDummy.classList.add("hidden");
    if (btnConfigDeparture) btnConfigDeparture.classList.add("hidden");
    if (btnSync) btnSync.classList.add("hidden");
  } else if (isSpvOrKoordinatorSales) {
    if (btnImport) btnImport.classList.add("hidden");
    if (btnPurgeDummy) btnPurgeDummy.classList.add("hidden");
  }

  const subtitleEl = container.querySelector("#kanal-status-subtitle");
  const distEl = container.querySelector("#track-dist");
  const ecEl = container.querySelector("#track-ec");
  const timeEl = container.querySelector("#track-time");
  const visitsEl = container.querySelector("#track-visits");
  const totalKmEl = container.querySelector("#track-total-km");
  const companyBadgeEl = container.querySelector("#track-company-badge");
  const feedCountEl = container.querySelector("#visit-feed-count");
  const salesmanGridEl = container.querySelector("#salesman-cards-grid");

  // Filters
  const filterSalesmanSelect = container.querySelector("#filter-salesman");
  const filterPeriodSelect = container.querySelector("#filter-period");
  const filterStatusSelect = container.querySelector("#filter-status");
  const filterSearchInput = container.querySelector("#filter-search");
  const btnResetFilter = container.querySelector("#btn-reset-sales-filter");
  const activeFilterBadge = container.querySelector("#active-filter-badge");

  // Get current date strings for today (Asia/Jakarta WIB)
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(yesterday);

  let companyName = "CV ANDELA JAYA CIREBON";
  let allCheckinsList = [];
  let karyawanList = [];
  let odometerLogsMap = new Map();

  // Function to purge all dummy/mock checkin visits from the database
  async function purgeDummyVisits() {
    try {
      const rawCheckins = await fsGetAll("kanal_checkins").catch(() => []);
      const dummyIds = [];
      for (const c of rawCheckins) {
        const id = String(c.id || "");
        const outlet = String(c.toko_outlet || "").trim();
        const cat = String(c.catatan || "").trim();
        const sumber = String(c.sumber || "").trim();

        // Check if this record is a dummy/mock entry
        const isDummy = 
          id.startsWith("CHK-SLS-") || 
          id.startsWith("CHK-LIVE-") ||
          sumber.includes("API Kanal") ||
          cat.includes("via API Kanal") ||
          cat.includes("Check-in kunjungan sales") ||
          ["Toko Kelontong Berkah", "Minimarket Harapan Jaya", "Swalayan Surya Cirebon", "Toko Rejeki Makmur", "Outlet Mitra Kanal"].includes(outlet) ||
          (!sumber.includes("Import Excel") && !id.startsWith("CHK-IMP-") && !cat.startsWith("Import Excel:"));

        if (isDummy && !id.startsWith("CHK-IMP-") && !sumber.includes("Import Excel")) {
          dummyIds.push(c.id);
        }
      }

      if (dummyIds.length > 0) {
        for (const dId of dummyIds) {
          await fsDelete("kanal_checkins", dId).catch(() => {});
        }
        console.log(`[SALES TRACK] Purged ${dummyIds.length} dummy visit records.`);
      }
      return dummyIds.length;
    } catch (e) {
      console.warn("Error purging dummy visits:", e);
      return 0;
    }
  }

  // Helper: Resolve & standardize salesman name in UPPERCASE and link with Master Karyawan
  function resolveSalesmanInfo(rawName, rawNik = "") {
    const normName = cleanSalesName(rawName);
    let resolvedNik = (rawNik || "").trim();
    let resolvedName = normName;

    if (karyawanList && karyawanList.length > 0) {
      // 1. Case-insensitive & trimmed match with Master Karyawan
      const matchedByName = karyawanList.find(k => {
        const kName = cleanSalesName(k.nama_karyawan || "");
        return kName && (kName === normName || kName.includes(normName) || normName.includes(kName));
      });

      const matchedByNik = (resolvedNik && resolvedNik !== "SLS-IMP" && resolvedNik !== "SLS-001" && resolvedNik !== "-")
        ? karyawanList.find(k => (k.nik_karyawan || "").trim() === resolvedNik)
        : null;

      const matched = matchedByName || matchedByNik;
      if (matched) {
        resolvedName = cleanSalesName(matched.nama_karyawan);
        if (matched.nik_karyawan) resolvedNik = matched.nik_karyawan.trim();
      }
    }

    if (!resolvedNik || resolvedNik === "SLS-IMP" || resolvedNik === "-") {
      const acronym = normName.replace(/[^A-Z]/g, "").substring(0, 3) || "SLS";
      resolvedNik = "SLS-" + acronym;
    }

    return { name: resolvedName, nik: resolvedNik };
  }

  // Helper: Get effective daily GPS distance (custom manual override or auto calculated)
  function getEffectiveDailyGpsDistance(salesNik, tanggal, calculatedKm = 0) {
    const key = `${salesNik}_${tanggal}`;
    const odm = odometerLogsMap.get(key);
    if (odm && odm.manual_jarak_gps !== undefined && odm.manual_jarak_gps !== null && Number(odm.manual_jarak_gps) > 0) {
      return {
        totalKm: Math.round(Number(odm.manual_jarak_gps) * 10) / 10,
        isManual: true,
        calculatedKm: Math.round(Number(calculatedKm) * 10) / 10
      };
    }
    return {
      totalKm: Math.round(Number(calculatedKm) * 10) / 10,
      isManual: false,
      calculatedKm: Math.round(Number(calculatedKm) * 10) / 10
    };
  }

  // Helper: Save/Update Custom Daily GPS Distance (e.g. from Google Maps route discrepancy)
  async function saveCustomDailyGpsKm(salesNik, salesNama, tanggal, customKmInput, calculatedKm = 0) {
    if (isStandardKaryawan) {
      toast("Akses terbatas: Karyawan hanya memiliki akses melihat data rute.", "warning");
      return false;
    }
    if (!salesNik || !tanggal) {
      toast("Data sales / tanggal tidak valid.", "warning");
      return false;
    }

    const key = `${salesNik}_${tanggal}`;
    const docId = `ODM-${salesNik}-${tanggal}`;
    const existingOdm = odometerLogsMap.get(key) || {};

    let manualGpsVal = null;
    if (customKmInput !== null && customKmInput !== undefined && String(customKmInput).trim() !== "") {
      const parsed = parseFloat(String(customKmInput).replace(",", "."));
      if (isNaN(parsed) || parsed <= 0) {
        toast("Nilai jarak GPS harus berupa angka positif!", "error");
        return false;
      }
      manualGpsVal = Math.round(parsed * 10) / 10;
    }

    const effectiveGps = (manualGpsVal !== null && manualGpsVal > 0) ? manualGpsVal : (calculatedKm || 0);
    const kmAwal = existingOdm.km_awal !== undefined ? existingOdm.km_awal : 0;
    const kmAkhir = existingOdm.km_akhir !== undefined ? existingOdm.km_akhir : 0;
    const jarakOdm = (kmAkhir >= kmAwal) ? (kmAkhir - kmAwal) : 0;
    const selisih = Math.round((jarakOdm - effectiveGps) * 10) / 10;

    const odmRecord = {
      ...existingOdm,
      id: docId,
      sales_nik: salesNik,
      sales_nama: salesNama || existingOdm.sales_nama || "Salesman",
      tanggal: tanggal,
      km_awal: kmAwal,
      km_akhir: kmAkhir,
      jarak_odometer: Math.round(jarakOdm * 10) / 10,
      jarak_gps: Math.round(effectiveGps * 10) / 10,
      manual_jarak_gps: manualGpsVal,
      is_manual_gps: manualGpsVal !== null,
      selisih: selisih,
      updated_at: new Date().toISOString()
    };

    try {
      await fsUpdate("sales_odometer", docId, odmRecord).catch(async () => {
        await fsAdd("sales_odometer", odmRecord, docId);
      });

      odometerLogsMap.set(key, odmRecord);

      if (manualGpsVal !== null) {
        toast(`Jarak GPS Hari Ini (${tanggal}) berhasil disesuaikan menjadi ${manualGpsVal.toFixed(1)} KM (Google Maps)!`, "success");
      } else {
        toast(`Jarak GPS Hari Ini (${tanggal}) dikembalikan ke kalkulasi sistem (${Number(calculatedKm).toFixed(1)} KM).`, "info");
      }

      applyAndRenderDashboard();
      return true;
    } catch (e) {
      console.error("Gagal simpan penyesuaian jarak GPS:", e);
      toast("Gagal menyimpan penyesuaian jarak GPS: " + e.message, "error");
      return false;
    }
  }

  // Helper: Save/Update Sales Odometer log to Firestore
  async function saveOdometerLog(salesNik, salesNama, tanggal, kmAwalInput, kmAkhirInput, jarakGps) {
    if (isStandardKaryawan) {
      toast("Akses terbatas: Karyawan hanya memiliki akses melihat data rute.", "warning");
      return false;
    }
    if (!salesNik || !tanggal) {
      toast("Data sales/tanggal tidak valid.", "warning");
      return false;
    }

    const kmAwal = parseFloat(kmAwalInput) || 0;
    const kmAkhir = parseFloat(kmAkhirInput) || 0;
    if (kmAkhir < kmAwal && kmAkhir > 0) {
      toast("KM Akhir tidak boleh lebih kecil dari KM Awal!", "warning");
      return false;
    }

    const jarakOdometer = (kmAkhir >= kmAwal) ? (kmAkhir - kmAwal) : 0;
    const key = `${salesNik}_${tanggal}`;
    const existingOdm = odometerLogsMap.get(key) || {};
    const effectiveGps = (existingOdm.manual_jarak_gps !== undefined && existingOdm.manual_jarak_gps !== null && existingOdm.manual_jarak_gps > 0)
      ? Number(existingOdm.manual_jarak_gps)
      : Number(jarakGps);

    const selisih = Math.round((jarakOdometer - effectiveGps) * 10) / 10;
    const docId = `ODM-${salesNik}-${tanggal}`;

    const odmRecord = {
      ...existingOdm,
      id: docId,
      sales_nik: salesNik,
      sales_nama: salesNama || existingOdm.sales_nama || "Salesman",
      tanggal: tanggal,
      km_awal: kmAwal,
      km_akhir: kmAkhir,
      jarak_odometer: Math.round(jarakOdometer * 10) / 10,
      jarak_gps: Math.round(effectiveGps * 10) / 10,
      manual_jarak_gps: existingOdm.manual_jarak_gps || null,
      is_manual_gps: !!existingOdm.manual_jarak_gps,
      selisih: selisih,
      updated_at: new Date().toISOString()
    };

    try {
      await fsUpdate("sales_odometer", docId, odmRecord).catch(async () => {
        await fsAdd("sales_odometer", odmRecord, docId);
      });

      odometerLogsMap.set(key, odmRecord);
      toast(`Data Odometer ${salesNama} (${tanggal}) berhasil disimpan! Jarak Odometer: ${jarakOdometer.toFixed(1)} KM, Selisih: ${selisih >= 0 ? '+' : ''}${selisih.toFixed(1)} KM`, "success");
      applyAndRenderDashboard();
      return true;
    } catch (e) {
      console.error("Gagal simpan odometer:", e);
      toast("Gagal menyimpan data odometer: " + e.message, "error");
      return false;
    }
  }
  
  // Departure & Route Configuration state
  let departureConfig = {
    id: "sales_departure_config",
    kantor_default: {
      nama: "Kantor CV Andela Jaya Cirebon",
      alamat: "Jl. Pegambiran No. 12, Cirebon",
      gps: "-6.7320, 108.5520"
    },
    sales_points: {
      "SLS-001": {
        start_type: "KOSAN",
        start_nama: "Kosan Budi Santoso (Jl. Pemuda)",
        start_gps: "-6.7280, 108.5450",
        end_type: "KANTOR",
        end_nama: "Kantor CV Andela Jaya Cirebon",
        end_gps: "-6.7320, 108.5520"
      },
      "SLS-002": {
        start_type: "KOSAN",
        start_nama: "Kosan Andika Putera (Jl. Kartini)",
        start_gps: "-6.7250, 108.5580",
        end_type: "KANTOR",
        end_nama: "Kantor CV Andela Jaya Cirebon",
        end_gps: "-6.7320, 108.5520"
      },
      "SLS-003": {
        start_type: "KANTOR",
        start_nama: "Kantor CV Andela Jaya Cirebon",
        start_gps: "-6.7320, 108.5520",
        end_type: "KANTOR",
        end_nama: "Kantor CV Andela Jaya Cirebon",
        end_gps: "-6.7320, 108.5520"
      }
    }
  };

  // Perform Kanal API Sync with Automatic Geocoding
  async function doKanalSync() {
    let currentCfg = {};
    try {
      const allCfg = await fsGetAll(COL.APP_SETTINGS);
      currentCfg = allCfg.find(c => c.id === "kanal_config") || {};
      if (currentCfg.company) companyName = currentCfg.company;

      const depCfgDoc = allCfg.find(c => c.id === "sales_departure_config");
      if (depCfgDoc) departureConfig = { ...departureConfig, ...depCfgDoc };
    } catch (e) { console.warn("Err loading settings:", e); }

    const apiKey = currentCfg.key || "MjJdcpPYYBLRDcUP9gee";
    const secretKey = currentCfg.secret || "c10b04f80cea668339b95195107c6c5e349a43e926679d82985d37ef70cf71ef";
    const accessToken = currentCfg.token || "eyJ0aW1lX2NyZWF0ZSI6MTc4NDg4MTY0NiwidGltZV9leHAiOjE3ODU1MTcxOTksImFwaWtleSI6Ik1qSmRjcFBZWUJMUkRjVVA5Z2VlIiwiY29tcGFueUlkIjoiMzYxMSJ9.be3bd89a1f49ebfeedf7c6f93c331321ebc7d642b6dbdf96f7ab375aca7f964b";
    const apiUrl = currentCfg.url || "https://api.kanal.work/v1/checkin";

    let liveItems = [];
    let isLiveSuccess = false;
    try {
      const proxyResp = await fetch("/api/kanal-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: apiUrl,
          apiKey: apiKey,
          secretKey: secretKey,
          accessToken: accessToken,
          company: companyName,
          dataType: "checkin_sales"
        })
      });
      const proxyData = await proxyResp.json();
      if (proxyData.success && proxyData.data) {
        const raw = proxyData.data;
        if (Array.isArray(raw)) liveItems = raw;
        else if (raw && Array.isArray(raw.data)) liveItems = raw.data;
        else if (raw && Array.isArray(raw.items)) liveItems = raw.items;
        else if (raw && Array.isArray(raw.checkins)) liveItems = raw.checkins;

        if (liveItems.length > 0) isLiveSuccess = true;
      }
    } catch (e) {
      console.log("Kanal Sales Track live API proxy notice:", e);
    }

    try {
      karyawanList = await fsGetAll(COL.MASTER_KARYAWAN);
    } catch (e) { console.warn("Err loading karyawan:", e); }

    let salesList = karyawanList.filter(k => {
      const div = (k.divisi || "").toLowerCase();
      const jab = (k.jabatan || "").toLowerCase();
      return div.includes("sales") || div.includes("penjualan") || div.includes("marketing") || jab.includes("sales") || jab.includes("field");
    });

    if (salesList.length === 0) {
      salesList = [
        { nik_karyawan: "SLS-001", nama_karyawan: "Budi Santoso", jabatan: "Sales Canvassing", divisi: "Penjualan" },
        { nik_karyawan: "SLS-002", nama_karyawan: "Andika Putera", jabatan: "Sales Executive", divisi: "Penjualan" },
        { nik_karyawan: "SLS-003", nama_karyawan: "Eko Prasetyo", jabatan: "Field Representative", divisi: "Marketing" }
      ];
    }

    const sampleOutlets = [
      { nama: "Toko Kelontong Berkah", alamat: "Jl. Siliwangi No. 42, Cirebon", gps: "-6.7321, 108.5523" },
      { nama: "Minimarket Harapan Jaya", alamat: "Jl. Pemuda No. 18, Cirebon", gps: "-6.7214, 108.5612" },
      { nama: "Swalayan Surya Cirebon", alamat: "Jl. Karanggetas No. 88, Cirebon", gps: "-6.7189, 108.5678" },
      { nama: "Toko Rejeki Makmur", alamat: "Jl. Kartini No. 105, Cirebon", gps: "-6.7255, 108.5590" }
    ];

    const timestamp = new Date().toISOString();
    const batchId = "KNL-SLS-" + Date.now().toString(36).toUpperCase();
    const fetchedCheckins = [];

    // Preload Master Outlets for coordinate fallback
    const masterOutlets = await fsGetAll("sales_outlets").catch(() => []);

    if (isLiveSuccess && liveItems.length > 0) {
      for (let idx = 0; idx < liveItems.length; idx++) {
        const item = liveItems[idx];
        const chkId = item.id || item.checkin_id || `CHK-LIVE-${idx}-${Date.now()}`;
        const rawAddr = item.alamat || item.address || item.toko || "Cirebon";
        const storeName = item.toko || item.outlet_name || item.store_name || "Outlet Mitra Kanal";
        
        let finalGps = item.gps || item.lat_long || "";
        const matchMaster = findMatchingMasterOutlet(storeName || rawAddr, masterOutlets);

        if (hasExplicitGpsOrPlusCode(rawAddr) || hasExplicitGpsOrPlusCode(finalGps)) {
          const geoResult = await geocodeAddressSmart(rawAddr || finalGps, idx);
          if (geoResult && isValidOperationalCoordinate(geoResult.lat, geoResult.lng)) {
            finalGps = `${geoResult.lat}, ${geoResult.lng}`;
          }
        } else if (matchMaster && matchMaster.koordinat_gps) {
          finalGps = matchMaster.koordinat_gps;
        } else {
          const geoResult = await geocodeAddressSmart(rawAddr, idx);
          finalGps = `${geoResult.lat}, ${geoResult.lng}`;
        }

        fetchedCheckins.push({
          id: String(chkId),
          sales_nik: item.nik || item.sales_nik || item.user_id || "SLS-KNL",
          sales_nama: item.nama || item.sales_nama || item.user_name || "Sales Kanal",
          toko_outlet: storeName,
          alamat_toko: rawAddr,
          koordinat_gps: finalGps,
          waktu_checkin: item.checkin_time || item.waktu || "08:30 WIB",
          waktu_checkout: item.checkout_time || "09:05 WIB",
          tanggal: item.tanggal || item.date || todayStr,
          status_kunjungan: item.status || item.visit_status || "Effective Call (Order Toko)",
          catatan: item.catatan || "Live check-in toko via API Kanal",
          sumber: `API Kanal (${companyName})`,
          perusahaan: companyName,
          geocoded_at: timestamp,
          updated_at: timestamp
        });
      }
    } else {
      // User directive: DO NOT generate dummy checkin visits!
      console.log("[SALES TRACK] Tidak ada data live checkin dari server Kanal.work API. Tidak menambahkan data dummy.");
    }

    for (const chk of fetchedCheckins) {
      await fsUpdate("kanal_checkins", chk.id, chk).catch(async () => {
        await fsAdd("kanal_checkins", chk, chk.id);
      });
    }

    if (fetchedCheckins.length > 0) {
      const logRecord = {
        id: batchId,
        company: companyName,
        data_type: "CHECKIN_SALES_TOKO",
        total_records: fetchedCheckins.length,
        items: fetchedCheckins,
        status: "SUCCESS",
        synced_at: timestamp
      };

      await fsAdd("kanal_data", logRecord, batchId);
    }
  }

  // Load and populate full dashboard
  async function loadAndRenderTrack() {
    try {
      const allCfg = await fsGetAll(COL.APP_SETTINGS).catch(() => []);
      const currentCfg = allCfg.find(c => c.id === "kanal_config") || {};
      if (currentCfg.company) companyName = currentCfg.company;

      const depCfgDoc = allCfg.find(c => c.id === "sales_departure_config");
      if (depCfgDoc) departureConfig = { ...departureConfig, ...depCfgDoc };

      try {
        karyawanList = await fsGetAll(COL.MASTER_KARYAWAN);
      } catch (e) { console.warn("Err loading karyawan:", e); }

      if (subtitleEl) subtitleEl.innerHTML = `Terhubung ke cloud server <b>API Kanal (${escapeHtml(companyName)})</b>. Geocoding alamat otomatis & kalkulasi jarak tempuh sales aktif.`;
      if (companyBadgeEl) companyBadgeEl.textContent = companyName;

      // Automatically purge leftover dummy visits so only Excel imported records remain
      await purgeDummyVisits();

      const rawCheckins = await fsGetAll("kanal_checkins").catch(() => []);
      allCheckinsList = rawCheckins.map(c => {
        const item = normalizeCheckinItem(c);
        const sInfo = resolveSalesmanInfo(item.sales_nama, item.sales_nik);
        item.sales_nama = sInfo.name;
        if (sInfo.nik && (!item.sales_nik || item.sales_nik === "SLS-IMP" || item.sales_nik === "SLS-001" || item.sales_nik === "-")) {
          item.sales_nik = sInfo.nik;
        }
        return item;
      });

      // Preload Master Outlets to prioritize coordinates registered in Master Outlet database
      const masterOutlets = await fsGetAll("sales_outlets").catch(() => []);

      // Auto-correct invalid or non-operational GPS coordinates, prioritizing Master Outlet coordinates
      for (let i = 0; i < allCheckinsList.length; i++) {
        const item = allCheckinsList[i];
        const parsed = parseGpsCoordinates(item.koordinat_gps);
        const matchOutlet = findMatchingMasterOutlet(item.toko_outlet || item.alamat_toko, masterOutlets);

        // If master outlet has registered coordinates and visit has not been explicitly custom-edited:
        if (matchOutlet && matchOutlet.koordinat_gps && !item.manual_gps_edited) {
          const matchParsed = parseGpsCoordinates(matchOutlet.koordinat_gps);
          if (matchParsed && isValidOperationalCoordinate(matchParsed.lat, matchParsed.lng)) {
            if (item.koordinat_gps !== matchOutlet.koordinat_gps) {
              item.koordinat_gps = matchOutlet.koordinat_gps;
              item.lat = matchParsed.lat;
              item.lng = matchParsed.lng;
              fsUpdate("kanal_checkins", item.id, { koordinat_gps: item.koordinat_gps, lat: item.lat, lng: item.lng }).catch(() => {});
              continue;
            }
          }
        }

        if (!parsed || !isValidOperationalCoordinate(parsed.lat, parsed.lng)) {
          if (matchOutlet && matchOutlet.koordinat_gps) {
            item.koordinat_gps = matchOutlet.koordinat_gps;
            const mp = parseGpsCoordinates(matchOutlet.koordinat_gps);
            item.lat = mp?.lat;
            item.lng = mp?.lng;
            fsUpdate("kanal_checkins", item.id, { koordinat_gps: item.koordinat_gps, lat: item.lat, lng: item.lng }).catch(() => {});
          } else {
            const queryAddr = [item.alamat_toko, item.toko_outlet].filter(Boolean).join(", ");
            const geoRes = await geocodeAddressSmart(queryAddr || "Klampok Wanasari Brebes Tegal", i);
            item.koordinat_gps = `${geoRes.lat}, ${geoRes.lng}`;
            item.lat = geoRes.lat;
            item.lng = geoRes.lng;
            fsUpdate("kanal_checkins", item.id, { koordinat_gps: item.koordinat_gps, lat: item.lat, lng: item.lng }).catch(() => {});
          }
        }
      }

      // Load Sales Odometer logs
      const rawOdm = await fsGetAll("sales_odometer").catch(() => []);
      odometerLogsMap.clear();
      rawOdm.forEach(o => {
        if (o.sales_nik && o.tanggal) {
          odometerLogsMap.set(`${o.sales_nik}_${o.tanggal}`, o);
        }
      });

      // Role-Based Scope & Branch Filtering
      if (isStandardKaryawan) {
        const normUserNama = cleanSalesName(userNama);
        const myEmp = (karyawanList || []).find(k => (userNik && (k.nik_karyawan || "").trim() === userNik) || cleanSalesName(k.nama_karyawan || "") === normUserNama);
        const effectiveNik = myEmp?.nik_karyawan?.trim() || userNik;
        const effectiveName = myEmp?.nama_karyawan ? cleanSalesName(myEmp.nama_karyawan) : normUserNama;

        allCheckinsList = allCheckinsList.filter(c => {
          const cName = cleanSalesName(c.sales_nama);
          const cNik = (c.sales_nik || "").trim();
          return (
            (effectiveName && cName === effectiveName) ||
            (effectiveNik && cNik === effectiveNik) ||
            (userNik && cNik === userNik) ||
            (normUserNama && (cName.includes(normUserNama) || normUserNama.includes(cName)))
          );
        });

        if (subtitleEl) {
          subtitleEl.innerHTML = `Rekapan Kunjungan Sales Mandiri: <b>${escapeHtml(effectiveName || userNama)}</b> ${effectiveNik ? `(${escapeHtml(effectiveNik)})` : ''}. Tampilan Read-Only.`;
        }
      } else if (isSpvOrKoordinatorSales) {
        if (userCabang && userCabang !== "-" && userCabang !== "ALL" && userCabang !== "PUSAT") {
          const branchEmployees = (karyawanList || []).filter(k => (k.cabang || "").trim().toUpperCase() === userCabang);
          const branchNames = new Set(branchEmployees.map(k => cleanSalesName(k.nama_karyawan || "")));
          const branchNiks = new Set(branchEmployees.map(k => (k.nik_karyawan || "").trim()).filter(Boolean));

          allCheckinsList = allCheckinsList.filter(c => {
            const cName = cleanSalesName(c.sales_nama);
            const cNik = (c.sales_nik || "").trim();
            const cCabang = (c.cabang || "").trim().toUpperCase();
            if (cCabang === userCabang) return true;
            if (branchNames.has(cName)) return true;
            if (cNik && branchNiks.has(cNik)) return true;
            for (const bName of branchNames) {
              if (bName && cName && (bName.includes(cName) || cName.includes(bName))) return true;
            }
            const fullAddr = `${c.alamat_toko || ""} ${c.toko_outlet || ""} ${c.perusahaan || ""}`.toUpperCase();
            if (fullAddr.includes(userCabang)) return true;
            return false;
          });

          if (subtitleEl) {
            subtitleEl.innerHTML = `Monitoring Kunjungan & Rute Tim Sales Wilayah/Cabang <b>${escapeHtml(userCabang)}</b> (${allCheckinsList.length} kunjungan terdata).`;
          }
        }
      }

      // Populate Salesman Dropdown
      populateSalesmanOptions();

      // Apply Filters and Render
      applyAndRenderDashboard();

    } catch (e) {
      console.error("Err loading sales track data:", e);
    }
  }

  function populateSalesmanOptions() {
    if (!filterSalesmanSelect) return;
    const salesMap = new Map();
    allCheckinsList.forEach(c => {
      const name = cleanSalesName(c.sales_nama);
      if (name) {
        if (!salesMap.has(name)) {
          salesMap.set(name, c.sales_nik || "");
        } else if (!salesMap.get(name) && c.sales_nik) {
          salesMap.set(name, c.sales_nik);
        }
      }
    });

    if (isStandardKaryawan) {
      const normUserNama = cleanSalesName(userNama);
      const displayName = salesMap.size > 0 ? Array.from(salesMap.keys())[0] : (normUserNama || "Saya");
      const displayNik = salesMap.size > 0 ? Array.from(salesMap.values())[0] : userNik;
      filterSalesmanSelect.innerHTML = `<option value="${escapeHtml(displayName)}">${escapeHtml(displayName)} ${displayNik ? `(${escapeHtml(displayNik)})` : ''}</option>`;
      filterSalesmanSelect.value = displayName;
      filterSalesmanSelect.disabled = true;
      return;
    }

    const currentVal = (filterSalesmanSelect.value || "ALL").trim().toUpperCase();
    const allLabel = isSpvOrKoordinatorSales && userCabang
      ? `Semua Salesman Cabang ${escapeHtml(userCabang)} (${salesMap.size})`
      : `Semua Salesman (${salesMap.size})`;

    filterSalesmanSelect.disabled = false;
    filterSalesmanSelect.innerHTML = `<option value="ALL">${allLabel}</option>` + 
      Array.from(salesMap.entries()).map(([nama, nik]) => 
        `<option value="${escapeHtml(nama)}">${escapeHtml(nama)} ${nik ? `(${escapeHtml(nik)})` : ''}</option>`
      ).join("");

    filterSalesmanSelect.value = salesMap.has(currentVal) ? currentVal : "ALL";
  }

  function applyAndRenderDashboard() {
    const salesmanFilter = (filterSalesmanSelect ? filterSalesmanSelect.value : "ALL").trim().toUpperCase();
    const periodFilter = filterPeriodSelect ? filterPeriodSelect.value : "ALL";
    const statusFilter = filterStatusSelect ? filterStatusSelect.value : "ALL";
    const searchFilter = (filterSearchInput ? filterSearchInput.value : "").toLowerCase().trim();

    // Check if active filter
    const isFiltered = salesmanFilter !== "ALL" || periodFilter !== "ALL" || statusFilter !== "ALL" || searchFilter !== "";
    if (activeFilterBadge) activeFilterBadge.classList.toggle("hidden", !isFiltered);

    const filteredRecords = allCheckinsList.filter(item => {
      // Salesman filter (Case-insensitive & whitespace normalized)
      if (salesmanFilter !== "ALL") {
        const itemSales = cleanSalesName(item.sales_nama);
        if (itemSales !== salesmanFilter) return false;
      }

      // Status filter
      if (statusFilter === "EC") {
        if (!(item.status_kunjungan || "").toLowerCase().includes("effective") && !item.is_effective_call) return false;
      } else if (statusFilter === "STOK") {
        if (!(item.status_kunjungan || "").toLowerCase().includes("stok")) return false;
      } else if (statusFilter === "PENAWARAN") {
        if (!(item.status_kunjungan || "").toLowerCase().includes("penawaran")) return false;
      }

      // Period filter
      if (periodFilter === "TODAY") {
        if (item.tanggal !== todayStr) return false;
      } else if (periodFilter === "WEEK") {
        const itemDate = new Date(item.tanggal);
        const diffDays = (now - itemDate) / (1000 * 3600 * 24);
        if (isNaN(diffDays) || diffDays > 7) return false;
      } else if (periodFilter === "MONTH") {
        const itemMonth = (item.tanggal || "").substring(0, 7);
        const currentMonth = todayStr.substring(0, 7);
        if (itemMonth !== currentMonth) return false;
      }

      // Search term
      if (searchFilter) {
        const text = `${item.sales_nama} ${item.toko_outlet} ${item.alamat_toko} ${item.catatan} ${item.status_kunjungan}`.toLowerCase();
        if (!text.includes(searchFilter)) return false;
      }

      return true;
    });

    // Calculate Route Distances for Filtered Sales Routes
    const salesGroup = new Map();
    filteredRecords.forEach(r => {
      const key = `${r.sales_nik || r.sales_nama}_${r.tanggal || todayStr}`;
      if (!salesGroup.has(key)) salesGroup.set(key, { nik: r.sales_nik || "", name: r.sales_nama || "", visits: [] });
      salesGroup.get(key).visits.push(r);
    });

    let cumulativeKm = 0;
    salesGroup.forEach((grp, key) => {
      const metrics = calculateSalesRouteMetrics(grp.visits, departureConfig, grp.nik);
      const sampleTgl = grp.visits[0]?.tanggal || todayStr;
      const eff = getEffectiveDailyGpsDistance(grp.nik, sampleTgl, metrics.totalKm);
      cumulativeKm += eff.totalKm;
    });

    // Update Top Summary Cards
    if (distEl) distEl.textContent = `${filteredRecords.length} Visit`;
    if (totalKmEl) totalKmEl.textContent = `${cumulativeKm.toFixed(1)} KM`;

    if (ecEl) {
      const ecCount = filteredRecords.filter(a => (a.status_kunjungan || "").toLowerCase().includes("effective") || a.is_effective_call === true).length;
      const pct = filteredRecords.length > 0 ? Math.round((ecCount / filteredRecords.length) * 100) : 100;
      ecEl.textContent = `${pct}%`;
    }

    if (visitsEl) {
      const uniqueOutlets = new Set(filteredRecords.map(r => r.toko_outlet)).size;
      visitsEl.textContent = `${uniqueOutlets} Outlet`;
    }

    if (timeEl) timeEl.textContent = "35 Menit";
    if (feedCountEl) feedCountEl.textContent = `${filteredRecords.length} Visit`;

    // Render Salesman Cards
    renderSalesmanCards(allCheckinsList, salesmanFilter);

    // Render Charts
    renderD3SalesmanChart(filteredRecords);
    renderD3StatusChart(filteredRecords);

    // Render Activity Feed Timeline
    renderActivityFeed(filteredRecords);
  }

  function renderSalesmanCards(allRecords, activeSalesman) {
    if (!salesmanGridEl) return;

    const normalizedActive = (activeSalesman || "ALL").trim().toUpperCase();

    // Group records by standardized uppercase salesman name
    const salesMap = new Map();
    allRecords.forEach(r => {
      const name = cleanSalesName(r.sales_nama);
      if (!salesMap.has(name)) {
        salesMap.set(name, {
          nama: name,
          nik: r.sales_nik || "-",
          visits: [],
          ecCount: 0
        });
      }
      const data = salesMap.get(name);
      data.visits.push(r);
      if (r.sales_nik && (!data.nik || data.nik === "-" || data.nik === "SLS-IMP")) {
        data.nik = r.sales_nik;
      }
      if ((r.status_kunjungan || "").toLowerCase().includes("effective") || r.is_effective_call === true) {
        data.ecCount++;
      }
    });

    if (salesMap.size === 0) {
      salesmanGridEl.innerHTML = `<div class="col-span-full text-center py-6 text-slate-400 italic text-xs">Belum ada data salesmen</div>`;
      return;
    }

    salesmanGridEl.innerHTML = Array.from(salesMap.values()).map(s => {
      const total = s.visits.length;
      const ecPct = total > 0 ? Math.round((s.ecCount / total) * 100) : 0;
      const isSelected = normalizedActive === s.nama;
      const topStore = s.visits[0]?.toko_outlet || "Outlet Utama";

      // Compute effective route distance for this salesman across his visit dates
      const salesDates = Array.from(new Set(s.visits.map(v => v.tanggal).filter(Boolean)));
      let salesmanEffectiveTotalKm = 0;
      let hasCustomGps = false;
      if (salesDates.length > 0) {
        salesDates.forEach(d => {
          const dVisits = s.visits.filter(v => v.tanggal === d);
          const dMet = calculateSalesRouteMetrics(dVisits, departureConfig, s.nik);
          const eff = getEffectiveDailyGpsDistance(s.nik, d, dMet.totalKm);
          salesmanEffectiveTotalKm += eff.totalKm;
          if (eff.isManual) hasCustomGps = true;
        });
      } else {
        const routeMetrics = calculateSalesRouteMetrics(s.visits, departureConfig, s.nik);
        salesmanEffectiveTotalKm = routeMetrics.totalKm;
      }
      salesmanEffectiveTotalKm = Math.round(salesmanEffectiveTotalKm * 10) / 10;
      const baseRouteMetrics = calculateSalesRouteMetrics(s.visits, departureConfig, s.nik);

      // Check recorded odometer for sales & today/filtered date
      const sampleVisitDate = s.visits[0]?.tanggal || todayStr;
      const savedOdm = odometerLogsMap.get(`${s.nik}_${sampleVisitDate}`) || {};
      const jarakOdmStr = (savedOdm.jarak_odometer !== undefined && savedOdm.jarak_odometer !== null) ? `${savedOdm.jarak_odometer.toFixed(1)} KM` : "-";
      const selisihVal = savedOdm.selisih;
      const selisihStr = (selisihVal !== undefined && selisihVal !== null) ? `${selisihVal > 0 ? '+' : ''}${selisihVal.toFixed(1)} KM` : "-";

      return `
      <div class="salesman-card bg-white rounded-2xl border ${isSelected ? 'border-maroon-600 ring-2 ring-maroon-100 bg-maroon-50/20 shadow-md' : 'border-slate-100 hover:border-slate-300'} p-4 shadow-sm transition flex flex-col justify-between cursor-pointer" data-salesman="${escapeHtml(s.nama)}">
        <div>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-maroon-700 text-white font-black flex items-center justify-center text-sm shadow-sm">
                ${escapeHtml((s.nama[0] || 'S').toUpperCase())}
              </div>
              <div>
                <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(s.nama)}</h4>
                <p class="text-[10px] text-slate-400">NIK: ${escapeHtml(s.nik)}</p>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold ${isSelected ? 'bg-maroon-700 text-white' : 'bg-slate-100 text-slate-700'}">
              ${total} Visit
            </span>
          </div>

          <div class="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-slate-500 font-semibold">Total Jarak GPS:</span>
              <span class="font-black text-indigo-700 text-sm flex items-center gap-1">
                ${salesmanEffectiveTotalKm} KM
                ${hasCustomGps ? `<span class="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[8.5px] font-bold" title="Memiliki nilai jarak GPS yang disesuaikan">Custom</span>` : ''}
              </span>
            </div>
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-slate-500 font-semibold">Odometer Sales:</span>
              <span class="font-black text-amber-700 text-xs">${jarakOdmStr}</span>
            </div>
            <div class="flex justify-between items-center text-[10px]">
              <span class="text-slate-500">Selisih (Odm - GPS):</span>
              <span class="font-extrabold ${selisihVal !== undefined ? (selisihVal >= 0 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}">${selisihStr}</span>
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-200/50">
              <span>Keberangkatan:</span>
              <span class="font-bold text-slate-700 truncate max-w-[150px]">${escapeHtml(baseRouteMetrics.startPoint.nama)}</span>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
            <div>
              <p class="text-[10px] text-slate-400 font-semibold uppercase">Effective Call</p>
              <p class="font-black text-emerald-600 mt-0.5">${s.ecCount} EC (${ecPct}%)</p>
            </div>
            <div>
              <p class="text-[10px] text-slate-400 font-semibold uppercase">Outlet Terakhir</p>
              <p class="font-bold text-slate-700 mt-0.5 truncate">${escapeHtml(topStore)}</p>
            </div>
          </div>
        </div>

        <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <button class="btn-filter-sales text-[11px] font-bold text-maroon-700 hover:underline cursor-pointer">
            ${isSelected ? '● Sedang Dilihat (Reset)' : 'Filter Sales Ini'}
          </button>
          <button class="btn-route-detail bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer">
            <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
            <span>Detail Rute & Jarak</span>
          </button>
        </div>
      </div>
      `;
    }).join("");

    salesmanGridEl.querySelectorAll(".salesman-card").forEach(card => {
      const name = card.dataset.salesman;
      const salesObj = Array.from(salesMap.values()).find(s => s.nama === name);
      
      const triggerFilter = () => {
        if (!filterSalesmanSelect) return;
        const isCurrent = (filterSalesmanSelect.value || "ALL").trim().toUpperCase() === name.trim().toUpperCase();
        filterSalesmanSelect.value = isCurrent ? "ALL" : name;

        // If filtering by this specific salesman and current period filter yields 0 records, auto switch period dropdown to ALL
        if (!isCurrent && filterPeriodSelect && filterPeriodSelect.value !== "ALL") {
          const matchingVisits = allCheckinsList.filter(item => cleanSalesName(item.sales_nama) === name.trim().toUpperCase());
          let countInCurrentPeriod = 0;
          matchingVisits.forEach(item => {
            if (filterPeriodSelect.value === "TODAY" && item.tanggal === todayStr) countInCurrentPeriod++;
            else if (filterPeriodSelect.value === "WEEK") {
              const diffDays = (now - new Date(item.tanggal)) / (1000 * 3600 * 24);
              if (!isNaN(diffDays) && diffDays <= 7) countInCurrentPeriod++;
            } else if (filterPeriodSelect.value === "MONTH") {
              if ((item.tanggal || "").substring(0, 7) === todayStr.substring(0, 7)) countInCurrentPeriod++;
            }
          });

          if (countInCurrentPeriod === 0) {
            filterPeriodSelect.value = "ALL";
          }
        }

        applyAndRenderDashboard();
      };

      card.querySelector(".btn-filter-sales")?.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerFilter();
      });

      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input")) return;
        triggerFilter();
      });

      card.querySelector(".btn-route-detail")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (salesObj) {
          const metrics = calculateSalesRouteMetrics(salesObj.visits, departureConfig, salesObj.nik);
          openSalesRouteDetailModal(salesObj.nama, salesObj.nik, salesObj.visits, metrics);
        }
      });
    });
  }

  function renderD3SalesmanChart(records) {
    const box = container.querySelector("#d3-salesman-chart");
    if (!box) return;
    box.innerHTML = "";

    const salesMap = {};
    records.forEach(r => {
      const name = r.sales_nama || "Salesman";
      if (!salesMap[name]) salesMap[name] = { total: 0, ec: 0 };
      salesMap[name].total++;
      if ((r.status_kunjungan || "").toLowerCase().includes("effective")) {
        salesMap[name].ec++;
      }
    });

    const data = Object.keys(salesMap).map(k => ({
      salesman: k.length > 10 ? k.substring(0, 10) + ".." : k,
      fullName: k,
      total: salesMap[k].total,
      ec: salesMap[k].ec
    }));

    if (data.length === 0) {
      box.innerHTML = `<p class="text-xs text-slate-400 italic">Tidak ada data untuk grafik</p>`;
      return;
    }

    const width = 420;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    const x0 = d3.scaleBand()
      .domain(data.map(d => d.salesman))
      .range([margin.left, width - margin.right])
      .padding(0.3);

    const maxVal = d3.max(data, d => d.total) || 5;

    const y = d3.scaleLinear()
      .domain([0, maxVal + 2])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Total Bars
    svg.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => x0(d.salesman))
      .attr("y", d => y(d.total))
      .attr("height", d => y(0) - y(d.total))
      .attr("width", x0.bandwidth())
      .attr("fill", "#7a1f2b")
      .attr("rx", 4);

    // EC Bars
    svg.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", d => x0(d.salesman) + x0.bandwidth() * 0.2)
      .attr("y", d => y(d.ec))
      .attr("height", d => y(0) - y(d.ec))
      .attr("width", x0.bandwidth() * 0.6)
      .attr("fill", "#10b981")
      .attr("rx", 3);

    // X Axis
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x0).tickSizeOuter(0))
      .attr("font-size", "10px")
      .attr("color", "#64748b");

    // Y Axis
    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .attr("font-size", "10px")
      .attr("color", "#64748b");

    box.appendChild(svg.node());
  }

  function renderD3StatusChart(records) {
    const box = container.querySelector("#d3-status-chart");
    if (!box) return;
    box.innerHTML = "";

    let ecCount = 0;
    let stokCount = 0;
    let penawaranCount = 0;
    let lainCount = 0;

    records.forEach(r => {
      const st = (r.status_kunjungan || "").toLowerCase();
      if (st.includes("effective")) ecCount++;
      else if (st.includes("stok")) stokCount++;
      else if (st.includes("penawaran")) penawaranCount++;
      else lainCount++;
    });

    const data = [
      { status: "Effective Call", count: ecCount, color: "#10b981" },
      { status: "Cek Stok", count: stokCount, color: "#3b82f6" },
      { status: "Penawaran", count: penawaranCount, color: "#f59e0b" },
      { status: "Lainnya", count: lainCount, color: "#64748b" }
    ].filter(d => d.count > 0);

    if (data.length === 0) {
      box.innerHTML = `<p class="text-xs text-slate-400 italic">Tidak ada data status kunjungan</p>`;
      return;
    }

    const width = 420;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };

    const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    const y = d3.scaleBand()
      .domain(data.map(d => d.status))
      .range([margin.top, height - margin.bottom])
      .padding(0.3);

    const maxCount = d3.max(data, d => d.count) || 5;

    const x = d3.scaleLinear()
      .domain([0, maxCount + 2])
      .range([margin.left, width - margin.right]);

    svg.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", margin.left)
      .attr("y", d => y(d.status))
      .attr("width", d => x(d.count) - margin.left)
      .attr("height", y.bandwidth())
      .attr("fill", d => d.color)
      .attr("rx", 4);

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSizeOuter(0))
      .attr("font-size", "10px")
      .attr("color", "#334155");

    svg.append("g")
      .selectAll("text")
      .data(data)
      .join("text")
      .attr("x", d => x(d.count) + 6)
      .attr("y", d => y(d.status) + y.bandwidth() / 2 + 4)
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .attr("fill", "#1e293b")
      .text(d => `${d.count} Visit`);

    box.appendChild(svg.node());
  }

  function renderActivityFeed(records) {
    if (!timelineEl) return;
    if (!records || records.length === 0) {
      timelineEl.innerHTML = `
      <div class="text-center py-8 text-slate-400 italic text-xs">
        Tidak ada data kunjungan yang sesuai filter.
      </div>
      `;
      return;
    }

    const sorted = [...records].sort((a,b) => (b.tanggal || "").localeCompare(a.tanggal || "") || (a.sales_nama || "").localeCompare(b.sales_nama || ""));

    timelineEl.innerHTML = sorted.map((t) => {
      const checkinTime = t.waktu_checkin || "08:30 WIB";
      const checkoutTime = t.waktu_checkout || "09:05 WIB";
      const statusText = t.status_kunjungan || "Effective Call (Order Toko)";
      const salesName = t.sales_nama || "Salesman";
      const salesNik = t.sales_nik || "-";
      const tokoName = t.toko_outlet || "Toko Mitra";
      const alamatToko = t.alamat_toko || "Cirebon";
      const gpsPos = t.koordinat_gps || "-6.7321, 108.5523";
      const dateVal = t.tanggal || todayStr;
      const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(gpsPos)}`;
      const visitId = t._docId || t.id;

      const rawPhoto = t.gambar_checkin || t.foto_checkin || t.foto || t.checkin_photo || t.image || t.image_url || "";
      const photoUrl = getDirectImageUrl(rawPhoto);
      const isEc = (statusText || "").toLowerCase().includes("effective") || t.is_effective_call === true;

      return `
      <div class="bg-slate-50 border border-slate-100 p-3.5 rounded-xl hover:bg-white hover:border-maroon-200 transition shadow-2xs">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p class="text-xs font-bold text-slate-800">${escapeHtml(salesName)} <span class="font-normal text-slate-400">(${escapeHtml(salesNik)})</span> <span class="text-maroon-700 font-bold">@ ${escapeHtml(tokoName)}</span></p>
            <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(alamatToko)}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <a href="${mapsUrl}" target="_blank" class="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold text-[10px] rounded-lg border border-blue-200 hover:bg-blue-100 transition inline-flex items-center gap-1">
              <svg class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <span>Maps</span>
            </a>
            ${isSuperOrHrd ? `
            <button class="btn-feed-delete-visit px-2.5 py-1 bg-rose-50 text-rose-700 font-bold text-[10px] rounded-lg border border-rose-200 hover:bg-rose-100 transition inline-flex items-center gap-1 cursor-pointer" data-visitid="${escapeHtml(visitId)}" data-storename="${escapeHtml(tokoName)}">
              <svg class="w-3 h-3 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              <span>Hapus</span>
            </button>
            ` : ''}
          </div>
        </div>

        <!-- Kolom Titik Koordinat GPS -->
        <div class="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60 flex-wrap">
          <span class="text-[10px] font-bold text-slate-600 flex items-center gap-1">
            <svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span>Koordinat GPS:</span>
          </span>
          ${!isStandardKaryawan ? `
          <input type="text" 
            class="input-feed-inline-gps px-2.5 py-1 text-[11px] font-mono border border-slate-300 rounded-lg w-44 bg-white focus:border-maroon-600 focus:ring-1 focus:ring-maroon-600 outline-none text-slate-800"
            value="${escapeHtml(gpsPos)}"
            placeholder="-6.732042, 108.552190"
            data-visitid="${escapeHtml(visitId)}"
            data-storename="${escapeHtml(tokoName)}" />
          <button class="btn-feed-save-inline-gps px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition cursor-pointer shadow-2xs flex items-center gap-1"
            data-visitid="${escapeHtml(visitId)}"
            data-storename="${escapeHtml(tokoName)}">
            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            <span>Simpan</span>
          </button>
          ` : `
          <span class="px-2.5 py-1 text-[11px] font-mono border border-slate-200 rounded-lg bg-slate-100 text-slate-700 font-semibold select-all">${escapeHtml(gpsPos)}</span>
          `}
        </div>

        <div class="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[10px] text-slate-500 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <label class="inline-flex items-center gap-1.5 ${isStandardKaryawan ? 'cursor-default' : 'cursor-pointer'} select-none px-2.5 py-1 rounded-lg border transition shadow-2xs ${isEc ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-200 text-slate-600'}" title="${isStandardKaryawan ? (isEc ? 'Status: Effective Call (Order Toko)' : 'Status: Visit Biasa') : 'Centang jika kunjungan ini menghasilkan Order (Effective Call)'}">
              <input type="checkbox"
                     class="chk-feed-effective-call accent-emerald-600 rounded ${isStandardKaryawan ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} w-3.5 h-3.5"
                     data-visitid="${escapeHtml(visitId)}"
                     data-storename="${escapeHtml(tokoName)}"
                     ${isStandardKaryawan ? "disabled" : ""}
                     ${isEc ? "checked" : ""} />
              <span class="text-[10px] font-extrabold">${isEc ? "✓ Effective Call (Order Toko)" : "○ Visit Toko (Tanpa Order)"}</span>
            </label>
            <span>Check-in: <b>${escapeHtml(checkinTime)}</b> - <b>${escapeHtml(checkoutTime)}</b></span>
          </div>
          <span class="font-mono font-bold text-slate-600">${escapeHtml(dateVal)}</span>
        </div>
        ${photoUrl ? `
        <div class="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/60 p-2 rounded-xl border border-slate-100">
          <div class="flex items-center gap-3">
            <a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener" class="block shrink-0 relative group">
              <img src="${escapeHtml(photoUrl)}" 
                   alt="Foto Check In" 
                   loading="lazy"
                   onerror="if(!this.dataset.retry){this.dataset.retry=1;this.src='/api/proxy-image?url='+encodeURIComponent(this.src);}"
                   class="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform" />
              <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center text-white text-[9px] font-bold">Zoom</div>
            </a>
            <div>
              <span class="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span>Foto Check-in Field</span>
              </span>
              <a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[10.5px] font-bold text-blue-700 hover:text-blue-900 hover:underline mt-1">
                <span>Lihat Foto Full-Size &rarr;</span>
              </a>
            </div>
          </div>
          <span class="text-[9px] text-slate-400 font-mono self-end sm:self-center">Kanal Work Media</span>
        </div>
        ` : `
        <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 italic">
          <span>Foto check-in tidak dilampirkan</span>
          <span class="text-[9px] font-mono text-slate-300">No Photo</span>
        </div>
        `}
      </div>
      `;
    }).join("");

    timelineEl.querySelectorAll(".btn-feed-delete-visit").forEach(btn => {
      btn.onclick = () => {
        const visitId = btn.dataset.visitid;
        const storeName = btn.dataset.storename;
        deleteVisitDirectly(visitId, storeName);
      };
    });

    timelineEl.querySelectorAll(".chk-feed-effective-call").forEach(chk => {
      chk.onchange = (e) => {
        const visitId = chk.dataset.visitid;
        const storeName = chk.dataset.storename;
        toggleVisitEffectiveCallDirectly(visitId, storeName, e.target.checked);
      };
    });

    timelineEl.querySelectorAll(".btn-feed-save-inline-gps").forEach(btn => {
      btn.onclick = () => {
        const visitId = btn.dataset.visitid;
        const storeName = btn.dataset.storename;
        const inputEl = timelineEl.querySelector(`.input-feed-inline-gps[data-visitid="${visitId}"]`);
        const newGps = inputEl ? inputEl.value : "";
        saveVisitGpsDirectly(visitId, storeName, newGps);
      };
    });

    timelineEl.querySelectorAll(".input-feed-inline-gps").forEach(input => {
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const visitId = input.dataset.visitid;
          const storeName = input.dataset.storename;
          saveVisitGpsDirectly(visitId, storeName, input.value);
        }
      };
    });
  }

  // MODAL: HRD Pengaturan Titik Keberangkatan & Kepulangan Sales
  function openDepartureConfigModal() {
    let salesOptionsHtml = `<option value="DEFAULT">-- Defaults Kantor Utama --</option>`;
    
    // Combine karyawan sales list and checkin sales
    const salesListMap = new Map();
    karyawanList.forEach(k => {
      const div = (k.divisi || "").toLowerCase();
      const jab = (k.jabatan || "").toLowerCase();
      if (div.includes("sales") || div.includes("penjualan") || div.includes("marketing") || jab.includes("sales") || jab.includes("field")) {
        salesListMap.set(k.nik_karyawan || k.nik, { name: k.nama_karyawan || k.nama, nik: k.nik_karyawan || k.nik });
      }
    });

    allCheckinsList.forEach(c => {
      if (c.sales_nik && !salesListMap.has(c.sales_nik)) {
        salesListMap.set(c.sales_nik, { name: c.sales_nama, nik: c.sales_nik });
      }
    });

    salesListMap.forEach(s => {
      salesOptionsHtml += `<option value="${escapeHtml(s.nik)}">${escapeHtml(s.name)} (NIK: ${escapeHtml(s.nik)})</option>`;
    });

    const modalHtml = `
    <div class="p-6 space-y-5 max-w-2xl mx-auto">
      <div class="border-b border-slate-100 pb-3 flex justify-between items-center">
        <div>
          <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>Pengaturan Titik Keberangkatan & Kepulangan HRD</span>
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">Tentukan lokasi awal (Kosan / Kantor) dan titik akhir keberangkatan sales untuk kalkulasi jarak tempuh.</p>
        </div>
        <button id="modal-close-dep" class="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">✕</button>
      </div>

      <div class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Pilih Karyawan Salesman</label>
          <select id="dep-sales-select" class="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold bg-slate-50 focus:border-indigo-600 outline-none">
            ${salesOptionsHtml}
          </select>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <!-- TITIK AWAL -->
          <div class="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2.5">
            <h4 class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
              <span>Titik Awal Keberangkatan</span>
            </h4>
            
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tipe Lokasi</label>
              <select id="dep-start-type" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-bold">
                <option value="KOSAN">Kosan / Rumah Sales</option>
                <option value="KANTOR">Kantor Utama Perusahaan</option>
                <option value="CUSTOM">Custom Address & GPS</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Nama Lokasi Awal</label>
              <input type="text" id="dep-start-nama" placeholder="misal: Kosan Budi Santoso (Jl. Pemuda)" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-medium">
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Koordinat GPS Awal (Latitude, Longitude)</label>
              <input type="text" id="dep-start-gps" placeholder="-6.7280, 108.5450" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white">
            </div>
          </div>

          <!-- TITIK AKHIR -->
          <div class="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-2.5">
            <h4 class="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
              <span>Titik Akhir Kepulangan</span>
            </h4>
            
            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Tipe Lokasi</label>
              <select id="dep-end-type" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-bold">
                <option value="KANTOR">Kantor Utama Perusahaan</option>
                <option value="KOSAN">Kosan / Rumah Sales</option>
                <option value="CUSTOM">Custom Address & GPS</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Nama Lokasi Akhir</label>
              <input type="text" id="dep-end-nama" placeholder="misal: Kantor CV Andela Jaya Cirebon" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-medium">
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-600 mb-1">Koordinat GPS Akhir (Latitude, Longitude)</label>
              <input type="text" id="dep-end-gps" placeholder="-6.7320, 108.5520" class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white">
            </div>
          </div>
        </div>

        <!-- GEOCODE TESTER -->
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p class="font-bold text-slate-700 text-[11px]">Geocoder Alamat ke Titik Koordinat GPS:</p>
          <div class="flex gap-2">
            <input type="text" id="input-test-geocode" placeholder="Ketik nama jalan/alamat di Malang, Batu, Cirebon, dll..." class="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white">
            <button id="btn-run-test-geocode" class="px-3 py-1.5 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 transition">
              Generate GPS
            </button>
          </div>
          <p id="test-geocode-result" class="text-[11px] text-slate-500 italic">Masukkan alamat (contoh: "Jl. Soekarno Hatta Malang", "Batu Town Square", "Jl. Pemuda Cirebon") untuk mengkonversi ke GPS.</p>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button id="btn-cancel-dep" class="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition">
          Batal
        </button>
        <button id="btn-save-dep" class="px-5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-xl text-xs shadow-sm transition">
          Simpan Titik Keberangkatan
        </button>
      </div>
    </div>
    `;

    openModal({
      title: "Pengaturan Titik Keberangkatan Sales HRD",
      bodyHtml: modalHtml,
      size: "lg"
    });

    const modalEl = document.querySelector("#app-modal-backdrop");
    if (!modalEl) return;

    modalEl.querySelector("#modal-close-dep")?.addEventListener("click", closeModal);
    modalEl.querySelector("#btn-cancel-dep")?.addEventListener("click", closeModal);

    const selSales = modalEl.querySelector("#dep-sales-select");
    const inpStartType = modalEl.querySelector("#dep-start-type");
    const inpStartNama = modalEl.querySelector("#dep-start-nama");
    const inpStartGps = modalEl.querySelector("#dep-start-gps");

    const inpEndType = modalEl.querySelector("#dep-end-type");
    const inpEndNama = modalEl.querySelector("#dep-end-nama");
    const inpEndGps = modalEl.querySelector("#dep-end-gps");

    const inpGeocodeAddr = modalEl.querySelector("#input-test-geocode");
    const btnGeocode = modalEl.querySelector("#btn-run-test-geocode");
    const resGeocode = modalEl.querySelector("#test-geocode-result");

    function updateFormForSales(nik) {
      const salesPt = departureConfig.sales_points?.[nik] || {};
      const matchedSales = (karyawanList || []).find(k => (k.nik_karyawan || k.nik) === nik);
      const isMalang = matchedSales && ((matchedSales.cabang || "").toLowerCase().includes("malang") || (matchedSales.cabang || "").toLowerCase().includes("batu") || (matchedSales.alamat || "").toLowerCase().includes("malang") || (matchedSales.alamat || "").toLowerCase().includes("batu"));
      const kantorDef = departureConfig.kantor_default || (isMalang 
        ? { nama: "Kantor Hub Malang - CV Andela Jaya", gps: "-7.9520, 112.6320" }
        : { nama: "Kantor CV Andela Jaya Cirebon", gps: "-6.7320, 108.5520" });

      inpStartType.value = salesPt.start_type || "KOSAN";
      inpStartNama.value = salesPt.start_nama || `Kosan Sales (${nik})`;
      inpStartGps.value = salesPt.start_gps || (isMalang ? "-7.9650, 112.6250" : "-6.7280, 108.5450");

      inpEndType.value = salesPt.end_type || "KANTOR";
      inpEndNama.value = salesPt.end_nama || kantorDef.nama;
      inpEndGps.value = salesPt.end_gps || kantorDef.gps;
    }

    if (selSales) {
      selSales.onchange = () => updateFormForSales(selSales.value);
      updateFormForSales(selSales.value);
    }

    if (btnGeocode) {
      btnGeocode.onclick = async () => {
        const addr = inpGeocodeAddr.value.trim();
        if (!addr) return toast("Masukkan alamat terlebih dahulu", "warning");
        btnGeocode.disabled = true;
        btnGeocode.textContent = "Processing...";
        
        const geoRes = await geocodeAddressSmart(addr);
        resGeocode.innerHTML = `
          <div class="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl mt-1 space-y-1 text-xs">
            <div class="font-bold text-emerald-900">Hasil Geocoding (${geoRes.source || 'OSM'}):</div>
            <div class="font-mono text-emerald-800 text-sm font-bold">${geoRes.lat}, ${geoRes.lng}</div>
            <div class="text-[11px] text-slate-600">${escapeHtml(geoRes.formatted || addr)}</div>
            <a href="https://www.google.com/maps?q=${geoRes.lat},${geoRes.lng}" target="_blank" class="inline-block mt-1 px-2 py-0.5 bg-blue-600 text-white font-bold text-[10px] rounded hover:bg-blue-700 transition">
              Buka di Google Maps
            </a>
          </div>
        `;
        inpStartGps.value = `${geoRes.lat}, ${geoRes.lng}`;
        btnGeocode.disabled = false;
        btnGeocode.textContent = "Generate GPS";
        toast("Sukses menggenerasi titik koordinat GPS dari alamat!", "success");
      };
    }

    modalEl.querySelector("#btn-save-dep")?.addEventListener("click", async () => {
      const activeNik = selSales.value;
      if (!departureConfig.sales_points) departureConfig.sales_points = {};

      if (activeNik === "DEFAULT") {
        departureConfig.kantor_default = {
          nama: inpStartNama.value || "Kantor CV Andela Jaya Cirebon",
          gps: inpStartGps.value || "-6.7320, 108.5520"
        };
      } else {
        departureConfig.sales_points[activeNik] = {
          start_type: inpStartType.value,
          start_nama: inpStartNama.value,
          start_gps: inpStartGps.value,
          end_type: inpEndType.value,
          end_nama: inpEndNama.value,
          end_gps: inpEndGps.value,
          updated_at: new Date().toISOString()
        };
      }

      await fsUpdate(COL.APP_SETTINGS, "sales_departure_config", departureConfig).catch(async () => {
        await fsAdd(COL.APP_SETTINGS, { id: "sales_departure_config", ...departureConfig }, "sales_departure_config");
      });

      toast("Titik keberangkatan & kepulangan sales berhasil disimpan!", "success");
      closeModal();
      applyAndRenderDashboard();
    });
  }

  // HRD Direct Edit GPS Coordinates for Check-in Record (No popup dialog)
  async function saveVisitGpsDirectly(visitId, storeName, rawGpsInput) {
    if (isStandardKaryawan) {
      toast("Akses terbatas: Karyawan hanya memiliki akses melihat data rute.", "warning");
      return false;
    }
    if (!visitId) {
      toast("ID Check-in tidak ditemukan.", "warning");
      return false;
    }

    const trimmed = (rawGpsInput || "").trim();
    if (!trimmed) {
      toast("Koordinat GPS tidak boleh kosong!", "warning");
      return false;
    }

    const coords = parseGpsCoordinates(trimmed);
    if (!coords || isNaN(coords.lat) || isNaN(coords.lng) || Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) {
      toast("Format GPS tidak valid! Gunakan format: Latitude, Longitude (contoh: -6.732042, 108.552190)", "error");
      return false;
    }

    const validGpsStr = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;

    try {
      await fsUpdate("kanal_checkins", visitId, {
        koordinat_gps: validGpsStr,
        lat: coords.lat,
        lng: coords.lng,
        manual_gps_edited: true,
        updated_at: new Date().toISOString()
      });

      const foundInAll = allCheckinsList.find(c => (c._docId || c.id) === visitId);
      if (foundInAll) {
        foundInAll.koordinat_gps = validGpsStr;
        foundInAll.lat = coords.lat;
        foundInAll.lng = coords.lng;
        foundInAll.manual_gps_edited = true;
      }

      // Propagate to all visits of the same store in current list & database
      const cleanTarget = cleanStoreName(storeName);
      if (cleanTarget) {
        for (const chk of allCheckinsList) {
          const chkClean = cleanStoreName(chk.toko_outlet);
          if (chkClean === cleanTarget && (chk._docId || chk.id) !== visitId) {
            chk.koordinat_gps = validGpsStr;
            chk.lat = coords.lat;
            chk.lng = coords.lng;
            chk.manual_gps_edited = true;
            fsUpdate("kanal_checkins", chk._docId || chk.id, {
              koordinat_gps: validGpsStr,
              lat: coords.lat,
              lng: coords.lng,
              manual_gps_edited: true,
              updated_at: new Date().toISOString()
            }).catch(() => {});
          }
        }
      }

      // CRITICAL: Synchronize / update Master Outlet database (sales_outlets)
      try {
        const allOutlets = await fsGetAll("sales_outlets").catch(() => []);
        const matchingOutlet = findMatchingMasterOutlet(storeName, allOutlets);

        if (matchingOutlet) {
          await fsUpdate("sales_outlets", matchingOutlet.id, {
            koordinat_gps: validGpsStr,
            lat: coords.lat,
            lng: coords.lng,
            updated_at: new Date().toISOString()
          });
        } else {
          // If not in Master Outlet database, auto-register it so future imports will use this coordinate
          const nextIdx = allOutlets.length + 1;
          const newOutlet = {
            id: `OT-${String(nextIdx).padStart(3, '0')}`,
            kode: `OT-${String(nextIdx).padStart(3, '0')}`,
            nama: storeName,
            wilayah: "Cirebon",
            alamat: foundInAll?.alamat_toko || storeName,
            telepon: "-",
            tipe: "Retail",
            koordinat_gps: validGpsStr,
            lat: coords.lat,
            lng: coords.lng,
            assigned_sales_nama: foundInAll?.sales_nama || "",
            assigned_sales_nik: foundInAll?.sales_nik || "",
            salesperson: foundInAll?.sales_nama || "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await fsAdd("sales_outlets", newOutlet, newOutlet.id);
        }
      } catch (outletSyncErr) {
        console.warn("Gagal update master outlet database:", outletSyncErr);
      }

      toast(`Koordinat GPS '${storeName}' diperbarui (${validGpsStr}) & otomatis tersimpan ke Master Outlet!`, "success");
      applyAndRenderDashboard();
      return true;
    } catch (err) {
      console.error("Gagal memperbarui GPS:", err);
      toast("Gagal memperbarui titik koordinat: " + err.message, "error");
      return false;
    }
  }

  // HRD Delete Check-in Record (for duplicate/invalid entries)
  async function deleteVisitDirectly(visitId, storeName) {
    if (!isSuperOrHrd) {
      toast("Akses terbatas: Hanya Superadmin dan HRD yang memiliki wewenang untuk menghapus data kunjungan.", "warning");
      return false;
    }
    if (!visitId) {
      toast("ID Check-in tidak ditemukan.", "warning");
      return false;
    }

    const confirmed = await confirmDialog(
      `Apakah Anda yakin ingin menghapus titik kunjungan '${storeName}'?\n\nPenghapusan ini akan menghapus data kunjungan ganda dari database.`,
      { title: "Hapus Titik Kunjungan", danger: true }
    );
    if (!confirmed) return false;

    try {
      await fsDelete("kanal_checkins", visitId);

      // Remove from memory list
      const idx = allCheckinsList.findIndex(c => String(c._docId || c.id) === String(visitId) || String(c.id) === String(visitId));
      if (idx !== -1) {
        allCheckinsList.splice(idx, 1);
      }

      toast(`Titik kunjungan '${storeName}' berhasil dihapus.`, "success");
      applyAndRenderDashboard();
      return true;
    } catch (err) {
      console.error("Gagal menghapus kunjungan:", err);
      toast("Gagal menghapus titik kunjungan: " + (err.message || err), "error");
      return false;
    }
  }

  // HRD Toggle Effective Call (Order Toko) Status
  async function toggleVisitEffectiveCallDirectly(visitId, storeName, isChecked) {
    if (isStandardKaryawan) {
      toast("Akses terbatas: Karyawan hanya memiliki akses melihat data rute.", "warning");
      return false;
    }
    if (!visitId) {
      toast("ID Check-in tidak ditemukan.", "warning");
      return false;
    }

    const newStatus = isChecked ? "Effective Call (Order Toko)" : "Visit Toko (Tanpa Order)";

    try {
      await fsUpdate("kanal_checkins", visitId, {
        status_kunjungan: newStatus,
        is_effective_call: isChecked,
        updated_at: new Date().toISOString()
      });

      const foundInAll = allCheckinsList.find(c => String(c._docId || c.id) === String(visitId) || String(c.id) === String(visitId));
      if (foundInAll) {
        foundInAll.status_kunjungan = newStatus;
        foundInAll.is_effective_call = isChecked;
      }

      toast(`Status '${storeName}' diubah: ${isChecked ? "✓ Effective Call (Order Toko)" : "○ Visit biasa (Tanpa Order)"}`, "success");
      applyAndRenderDashboard();
      return true;
    } catch (err) {
      console.error("Gagal memperbarui Effective Call:", err);
      toast("Gagal memperbarui status kunjungan: " + err.message, "error");
      return false;
    }
  }

  // MODAL: Detail Rute Itinerary & Jarak Tempuh Sales
  function openSalesRouteDetailModal(salesName, salesNik, allSalesVisits = [], initialMetrics = null) {
    const dateSet = new Set(allSalesVisits.map(v => v.tanggal).filter(Boolean));
    const sortedDates = Array.from(dateSet).sort((a,b) => b.localeCompare(a)); // Newest first
    
    // Default active date: "ALL" to display all date cards, or specific date if selected
    let activeDate = "ALL";
    const selectedVisitIds = new Set();

    // Helper: In-Modal Non-Destructive Confirmation Overlay (does not close main modal)
    function showInModalConfirm(message, { title = "Konfirmasi Hapus", danger = true } = {}) {
      return new Promise((resolve) => {
        const modalEl = document.querySelector("#app-modal-backdrop");
        if (!modalEl) {
          resolve(window.confirm(message));
          return;
        }

        const confirmOverlay = document.createElement("div");
        confirmOverlay.id = "in-modal-confirm-overlay";
        confirmOverlay.className = "fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-150";
        confirmOverlay.innerHTML = `
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl ${danger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'} flex items-center justify-center shrink-0">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h4 class="text-base font-bold text-slate-900">${escapeHtml(title)}</h4>
                <p class="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>
            <div class="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
              ${escapeHtml(message)}
            </div>
            <div class="flex items-center justify-end gap-2 pt-1">
              <button type="button" id="inmodal-btn-cancel" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer">
                Batal
              </button>
              <button type="button" id="inmodal-btn-confirm" class="px-4 py-2 rounded-xl text-xs font-bold text-white ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-maroon-700 hover:bg-maroon-800'} transition cursor-pointer shadow-sm">
                Ya, Hapus
              </button>
            </div>
          </div>
        `;

        modalEl.appendChild(confirmOverlay);

        const closeOverlay = (result) => {
          confirmOverlay.remove();
          resolve(result);
        };

        confirmOverlay.querySelector("#inmodal-btn-cancel").onclick = () => closeOverlay(false);
        confirmOverlay.querySelector("#inmodal-btn-confirm").onclick = () => closeOverlay(true);
        confirmOverlay.addEventListener("click", (e) => {
          if (e.target === confirmOverlay) closeOverlay(false);
        });
      });
    }

    // Single visit deletion without closing modal
    async function deleteSingleVisitInModal(visitId, storeName) {
      if (!isSuperOrHrd) {
        toast("Akses terbatas: Hanya Superadmin dan HRD yang memiliki wewenang untuk menghapus data kunjungan.", "warning");
        return;
      }
      if (!visitId) {
        toast("ID Kunjungan tidak ditemukan.", "warning");
        return;
      }

      const confirmed = await showInModalConfirm(
        `Apakah Anda yakin ingin menghapus titik kunjungan '${storeName}'?\n\nPenghapusan ini akan menghapus data kunjungan dari database dan memperbarui kalkulasi rute secara otomatis.`,
        { title: "Hapus Titik Kunjungan", danger: true }
      );
      if (!confirmed) return;

      try {
        await fsDelete("kanal_checkins", visitId);

        const idx = allCheckinsList.findIndex(c => String(c._docId || c.id) === String(visitId) || String(c.id) === String(visitId));
        if (idx !== -1) allCheckinsList.splice(idx, 1);

        allSalesVisits = allSalesVisits.filter(v => String(v._docId || v.id) !== String(visitId) && String(v.id) !== String(visitId));
        selectedVisitIds.delete(String(visitId));

        toast(`Titik kunjungan '${storeName}' berhasil dihapus.`, "success");
        applyAndRenderDashboard();
        refreshModalView();
      } catch (err) {
        console.error("Gagal menghapus kunjungan:", err);
        toast("Gagal menghapus titik kunjungan: " + (err.message || err), "error");
      }
    }

    // Batch visits deletion without closing modal
    async function deleteBatchVisitsInModal(idsToDelete = []) {
      if (!isSuperOrHrd) {
        toast("Akses terbatas: Hanya Superadmin dan HRD yang memiliki wewenang untuk menghapus data kunjungan.", "warning");
        return;
      }
      const list = (idsToDelete && idsToDelete.length > 0) ? idsToDelete : Array.from(selectedVisitIds);
      if (list.length === 0) {
        toast("Pilih setidaknya 1 titik kunjungan untuk dihapus.", "warning");
        return;
      }

      const confirmed = await showInModalConfirm(
        `Apakah Anda yakin ingin menghapus ${list.length} titik kunjungan yang dipilih?\n\nData kunjungan yang dipilih akan dihapus secara permanen dan rute GPS akan dikalkulasi ulang secara otomatis.`,
        { title: `Hapus ${list.length} Titik Kunjungan`, danger: true }
      );
      if (!confirmed) return;

      toast(`Menghapus ${list.length} titik kunjungan...`, "info");
      let deletedCount = 0;

      for (const vid of list) {
        try {
          await fsDelete("kanal_checkins", vid);
          deletedCount++;
          const idx = allCheckinsList.findIndex(c => String(c._docId || c.id) === String(vid) || String(c.id) === String(vid));
          if (idx !== -1) allCheckinsList.splice(idx, 1);
          allSalesVisits = allSalesVisits.filter(v => String(v._docId || v.id) !== String(vid) && String(v.id) !== String(vid));
          selectedVisitIds.delete(String(vid));
        } catch (err) {
          console.error("Gagal menghapus visit id:", vid, err);
        }
      }

      toast(`${deletedCount} titik kunjungan berhasil dihapus.`, "success");
      applyAndRenderDashboard();
      refreshModalView();
    }

    function renderModalContent() {
      const datesToRender = (activeDate === "ALL") 
        ? sortedDates 
        : sortedDates.filter(d => d === activeDate);

      // Compute overall stats across all dates in range
      const totalVisitsCount = allSalesVisits.length;
      let totalOverallGpsKm = 0;
      sortedDates.forEach(d => {
        const dVisits = allSalesVisits.filter(v => v.tanggal === d);
        const dMet = calculateSalesRouteMetrics(dVisits, departureConfig, salesNik);
        const eff = getEffectiveDailyGpsDistance(salesNik, d, dMet.totalKm);
        totalOverallGpsKm += eff.totalKm;
      });
      totalOverallGpsKm = Math.round(totalOverallGpsKm * 10) / 10;

      // Base Config points
      const baseStart = departureConfig.sales_points && departureConfig.sales_points[salesNik] && departureConfig.sales_points[salesNik].start_gps
        ? departureConfig.sales_points[salesNik].start_gps
        : (departureConfig.default_start_gps || "-6.728000, 108.545000");
      const baseEnd = departureConfig.sales_points && departureConfig.sales_points[salesNik] && departureConfig.sales_points[salesNik].end_gps
        ? departureConfig.sales_points[salesNik].end_gps
        : (departureConfig.default_end_gps || "-6.732000, 108.552000");

      const dateCardsHtml = datesToRender.length === 0 ? `
        <div class="bg-white p-8 text-center rounded-2xl border border-slate-200 shadow-2xs">
          <p class="text-slate-400 font-medium text-sm">Tidak ada data rute / visit outlet pada tanggal ini.</p>
        </div>
      ` : datesToRender.map(tgl => {
        const dailyVisits = allSalesVisits.filter(v => v.tanggal === tgl);
        const dailyMetrics = calculateSalesRouteMetrics(dailyVisits, departureConfig, salesNik);
        const effectiveGps = getEffectiveDailyGpsDistance(salesNik, tgl, dailyMetrics.totalKm);
        const effectiveGpsKm = effectiveGps.totalKm;
        const isCustomGps = effectiveGps.isManual;

        const savedOdm = odometerLogsMap.get(`${salesNik}_${tgl}`) || {};
        const initAwal = (savedOdm.km_awal !== undefined && savedOdm.km_awal !== null) ? savedOdm.km_awal : "";
        const initAkhir = (savedOdm.km_akhir !== undefined && savedOdm.km_akhir !== null) ? savedOdm.km_akhir : "";
        const numAwal = parseFloat(initAwal) || 0;
        const numAkhir = parseFloat(initAkhir) || 0;
        const initJarakOdm = (numAkhir >= numAwal) ? (numAkhir - numAwal) : 0;
        const initSelisih = Math.round((initJarakOdm - effectiveGpsKm) * 10) / 10;

        const originStr = encodeURIComponent(dailyMetrics.startPoint.gps);
        const destStr = encodeURIComponent(dailyMetrics.endPoint.gps);
        const waypoints = (dailyMetrics.waypointsGps && dailyMetrics.waypointsGps.length > 0)
          ? dailyMetrics.waypointsGps.map(g => encodeURIComponent(g)).join("|")
          : dailyVisits.map(v => encodeURIComponent(v.koordinat_gps || "-6.7321, 108.5523")).join("|");
        const dailyMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&waypoints=${waypoints}&travelmode=driving`;

        // Check how many visits for this date are selected
        const dailyVisitIds = dailyMetrics.legs.map(l => l.visitId).filter(Boolean);
        const dailySelectedIds = dailyVisitIds.filter(vid => selectedVisitIds.has(String(vid)));
        const allDateLegsSelected = dailyVisitIds.length > 0 && dailySelectedIds.length === dailyVisitIds.length;

        const startRowHtml = `
        <tr class="bg-indigo-50/60 border-b border-indigo-100/80 text-xs font-bold">
          ${isSuperOrHrd ? `<td class="p-2.5 text-center text-slate-300"></td>` : ''}
          <td class="p-2.5 text-center">
            <span class="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-extrabold">START / AWAL</span>
          </td>
          <td class="p-2.5 text-slate-800 font-bold">
            ${escapeHtml(dailyMetrics.startPoint.nama)}
            <span class="text-[10px] text-indigo-600 font-normal block">(${escapeHtml(dailyMetrics.startPoint.type || 'Kosan/Base')})</span>
          </td>
          <td class="p-2.5 text-slate-600">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-500 font-bold">GPS:</span>
              ${!isStandardKaryawan ? `
              <input type="text" 
                class="input-daily-start-gps px-2 py-0.5 text-[10px] font-mono border border-indigo-200 rounded w-36 bg-white focus:border-indigo-600 outline-none text-slate-800"
                value="${escapeHtml(dailyMetrics.startPoint.gps)}"
                placeholder="-6.728000, 108.545000"
                data-date="${tgl}" />
              <button class="btn-save-daily-start-gps px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded transition cursor-pointer shadow-2xs flex items-center gap-1"
                data-date="${tgl}">
                <span>Simpan</span>
              </button>
              ` : `
              <span class="px-2 py-0.5 text-[10px] font-mono border border-indigo-200 rounded bg-white text-slate-800">${escapeHtml(dailyMetrics.startPoint.gps)}</span>
              `}
            </div>
          </td>
          <td class="p-2.5 text-right font-black text-indigo-700">0 KM</td>
          <td class="p-2.5 text-center">
            <a href="https://www.google.com/maps?q=${encodeURIComponent(dailyMetrics.startPoint.gps)}" target="_blank" class="px-2 py-1 bg-indigo-100 text-indigo-800 font-bold text-[10px] rounded hover:bg-indigo-200 transition inline-block">
              Map
            </a>
          </td>
        </tr>
        `;

        const visitLegsHtml = dailyMetrics.legs.map((leg) => {
          const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(leg.toGps)}`;
          const legPhoto = leg.photoUrl ? getDirectImageUrl(leg.photoUrl) : "";
          const isLegEc = (leg.statusKunjungan || "").toLowerCase().includes("effective") || leg.isEffectiveCall === true;
          const isLegSelected = leg.visitId ? selectedVisitIds.has(String(leg.visitId)) : false;

          return `
          <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs ${isLegSelected ? 'bg-rose-50/50' : ''}">
            ${isSuperOrHrd ? `
              <td class="p-2.5 text-center">
                ${leg.visitId ? `
                  <input type="checkbox"
                         class="chk-modal-select-visit rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                         data-visitid="${escapeHtml(leg.visitId)}"
                         data-toname="${escapeHtml(leg.toName)}"
                         data-date="${tgl}"
                         ${isLegSelected ? 'checked' : ''}
                         title="Pilih '${escapeHtml(leg.toName)}' untuk dihapus" />
                ` : ''}
              </td>
            ` : ''}
            <td class="p-2.5 text-center text-slate-500 font-mono font-bold">
              <span>Leg #${leg.legIndex}</span>
              <span class="block text-[10px] text-slate-400 font-normal">${escapeHtml(leg.waktuCheckin || '')}</span>
            </td>
            <td class="p-2.5 text-slate-900 font-bold">
              <div class="flex items-start gap-2.5">
                ${legPhoto ? `
                  <a href="${escapeHtml(legPhoto)}" target="_blank" rel="noopener" class="shrink-0 relative group block" title="Klik untuk lihat foto full">
                    <img src="${escapeHtml(legPhoto)}" 
                         alt="Foto ${escapeHtml(leg.toName)}" 
                         loading="lazy"
                         onerror="if(!this.dataset.retry){this.dataset.retry=1;this.src='/api/proxy-image?url='+encodeURIComponent(this.src);}"
                         class="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform" />
                    <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white text-[8px] font-bold">Zoom</div>
                  </a>
                ` : ''}
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                    <span>${escapeHtml(leg.toName)}</span>
                    ${isLegSelected ? `<span class="px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded text-[9px] font-bold">Dipilih</span>` : ''}
                  </div>
                  <div class="text-[10px] text-slate-500 font-normal truncate max-w-[220px]">${escapeHtml(leg.toAddress)}</div>
                  ${leg.visitId ? `
                    <label class="inline-flex items-center gap-1.5 ${isStandardKaryawan ? 'cursor-default' : 'cursor-pointer'} mt-1 px-2 py-0.5 rounded border transition select-none ${isLegEc ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-200 text-slate-600'}" title="${isStandardKaryawan ? (isLegEc ? 'Status: Effective Call (Order)' : 'Status: Tanpa Order') : 'Tandai HRD: Kunjungan ini menghasilkan Order (Effective Call)'}">
                      <input type="checkbox"
                             class="chk-modal-effective-call accent-emerald-600 rounded ${isStandardKaryawan ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} w-3.5 h-3.5"
                             data-visitid="${escapeHtml(leg.visitId)}"
                             data-toname="${escapeHtml(leg.toName)}"
                             ${isStandardKaryawan ? "disabled" : ""}
                             ${isLegEc ? "checked" : ""} />
                      <span class="text-[9.5px] font-extrabold">${isLegEc ? '✓ Effective Call (Order)' : '○ Tanpa Order'}</span>
                    </label>
                  ` : (leg.statusKunjungan ? `<span class="inline-block px-1.5 py-0.5 mt-0.5 bg-emerald-50 text-emerald-800 text-[9px] font-bold rounded border border-emerald-200">${escapeHtml(leg.statusKunjungan)}</span>` : '')}
                </div>
              </div>
            </td>
            <td class="p-2.5 text-slate-600">
              ${leg.visitId && !isStandardKaryawan ? `
                <div class="flex items-center gap-1.5">
                  <span class="text-[10px] text-slate-400 font-mono">GPS:</span>
                  <input type="text" 
                    class="input-modal-inline-gps px-2 py-0.5 text-[10px] font-mono border border-slate-200 rounded w-36 bg-white focus:border-indigo-600 outline-none text-slate-800"
                    value="${escapeHtml(leg.toGps)}"
                    placeholder="-6.732042, 108.552190"
                    data-visitid="${escapeHtml(leg.visitId)}"
                    data-toname="${escapeHtml(leg.toName)}" />
                  <button class="btn-modal-save-inline-gps px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded transition cursor-pointer shadow-2xs"
                    data-visitid="${escapeHtml(leg.visitId)}"
                    data-toname="${escapeHtml(leg.toName)}"
                    title="Simpan Perubahan GPS">
                    Simpan
                  </button>
                </div>
              ` : `
                <div class="text-[10px] text-slate-700 font-mono font-semibold">GPS: ${escapeHtml(leg.toGps)}</div>
              `}
            </td>
            <td class="p-2.5 text-right font-black text-indigo-700">${leg.distanceKm} KM</td>
            <td class="p-2.5 text-center">
              <div class="flex items-center justify-center gap-1.5">
                <a href="${mapsUrl}" target="_blank" class="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px] rounded border border-blue-200 transition inline-flex items-center gap-0.5">
                  Map
                </a>
                ${leg.visitId && isSuperOrHrd ? `
                  <button class="btn-modal-delete-visit px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-[10px] rounded border border-rose-200 transition cursor-pointer inline-flex items-center gap-0.5"
                    data-visitid="${escapeHtml(leg.visitId)}"
                    data-toname="${escapeHtml(leg.toName)}"
                    title="Hapus titik kunjungan ini">
                    Hapus
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
          `;
        }).join("");

        const endRowHtml = `
        <tr class="bg-slate-100/80 border-b border-slate-200 text-xs font-bold">
          ${isSuperOrHrd ? `<td class="p-2.5 text-center text-slate-300"></td>` : ''}
          <td class="p-2.5 text-center">
            <span class="px-2 py-0.5 bg-slate-800 text-white rounded text-[10px] font-extrabold">FINISH / AKHIR</span>
          </td>
          <td class="p-2.5 text-slate-900 font-bold">
            ${escapeHtml(dailyMetrics.endPoint.nama)}
            <span class="text-[10px] text-slate-500 font-normal block">(${escapeHtml(dailyMetrics.endPoint.type || 'Kantor/Base')})</span>
          </td>
          <td class="p-2.5 text-slate-600">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-slate-500 font-bold">GPS:</span>
              ${!isStandardKaryawan ? `
              <input type="text" 
                class="input-daily-end-gps px-2 py-0.5 text-[10px] font-mono border border-slate-300 rounded w-36 bg-white focus:border-indigo-600 outline-none text-slate-800"
                value="${escapeHtml(dailyMetrics.endPoint.gps)}"
                placeholder="-6.732000, 108.552000"
                data-date="${tgl}" />
              <button class="btn-save-daily-end-gps px-2 py-0.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] rounded transition cursor-pointer shadow-2xs"
                data-date="${tgl}">
                Simpan
              </button>
              ` : `
              <span class="px-2 py-0.5 text-[10px] font-mono border border-slate-300 rounded bg-white text-slate-800">${escapeHtml(dailyMetrics.endPoint.gps)}</span>
              `}
            </div>
          </td>
          <td class="p-2.5 text-right font-black text-indigo-700">${dailyMetrics.legs.length > 0 ? dailyMetrics.legs[dailyMetrics.legs.length - 1].distanceKm : 0} KM</td>
          <td class="p-2.5 text-center">
            <a href="https://www.google.com/maps?q=${encodeURIComponent(dailyMetrics.endPoint.gps)}" target="_blank" class="px-2 py-1 bg-slate-200 text-slate-800 font-bold text-[10px] rounded border border-slate-300 hover:bg-slate-300 transition inline-block">
              Map
            </a>
          </td>
        </tr>
        `;

        const legsTableHtml = startRowHtml + visitLegsHtml + endRowHtml;

        return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-5 transition hover:border-slate-300">
          <!-- CARD HEADER -->
          <div class="bg-slate-900 text-white p-3.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-800">
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="px-3 py-1 bg-amber-500 text-slate-950 text-xs font-black rounded-lg">Tanggal: ${escapeHtml(tgl)}</span>
              <span class="text-xs text-indigo-200 font-bold bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">${dailyVisits.length} Outlet Visit</span>
              <span class="text-xs text-slate-300 hidden sm:inline">${escapeHtml(dailyMetrics.startPoint.nama)} ➔ ${escapeHtml(dailyMetrics.endPoint.nama)}</span>
              ${isSuperOrHrd && dailySelectedIds.length > 0 ? `
                <button type="button" class="btn-delete-date-selected px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition flex items-center gap-1 cursor-pointer" data-date="${tgl}">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  <span>Hapus ${dailySelectedIds.length} Terpilih di Tgl Ini</span>
                </button>
              ` : ''}
            </div>

            <!-- RIGHT HEADER: EDITABLE DAILY GPS & MAPS LINK -->
            <div class="flex items-center gap-2.5 flex-wrap">
              <!-- BOX JARAK GPS HARI INI DENGAN FITUR UBAH / SESUAIKAN -->
              <div class="bg-slate-800 border border-slate-700 rounded-xl p-2 sm:px-3 sm:py-1.5 flex items-center gap-2 shadow-2xs">
                <div class="text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <span class="text-[10px] text-slate-400 uppercase font-bold">Jarak GPS Hari Ini</span>
                    ${isCustomGps ? `<span class="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-extrabold" title="Jarak telah disesuaikan manual sesuai Google Maps">✏️ Custom</span>` : ''}
                  </div>
                  <div class="flex items-center justify-end gap-1.5">
                    <span class="text-base font-black text-amber-400 font-mono">${effectiveGpsKm} KM</span>
                    ${isCustomGps ? `<span class="text-[10px] text-slate-400 line-through" title="Kalkulasi otomatis sistem: ${dailyMetrics.totalKm} KM">(${dailyMetrics.totalKm} KM)</span>` : ''}
                  </div>
                </div>

                ${!isStandardKaryawan ? `
                <!-- Inline Edit GPS Controls -->
                <div class="flex items-center gap-1 pl-2 border-l border-slate-700">
                  <div class="view-gps-controls flex items-center gap-1" data-date="${tgl}">
                    <button type="button" 
                            class="btn-toggle-edit-daily-gps px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                            data-date="${tgl}"
                            title="Ubah nilai jarak GPS hari ini sesuai rute Google Maps">
                      <span>✏️ Ubah</span>
                    </button>
                    ${isCustomGps ? `
                    <button type="button" 
                            class="btn-reset-daily-gps px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold transition cursor-pointer"
                            data-date="${tgl}"
                            data-salesnik="${salesNik}"
                            data-salesnama="${escapeHtml(salesName)}"
                            data-calcgps="${dailyMetrics.totalKm}"
                            title="Kembalikan ke jarak kalkulasi sistem (${dailyMetrics.totalKm} KM)">
                      <span>🔄 Reset</span>
                    </button>
                    ` : ''}
                  </div>

                  <div class="form-inline-edit-gps hidden flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-amber-500/60 shadow-lg" data-date="${tgl}">
                    <div class="flex items-center gap-0.5">
                      <input type="number" 
                             step="0.1" 
                             min="0.1" 
                             max="9999" 
                             class="input-custom-daily-gps-val w-20 px-2 py-1 bg-slate-900 border border-amber-400 rounded text-xs font-mono font-bold text-amber-300 outline-none focus:ring-1 focus:ring-amber-400" 
                             value="${effectiveGpsKm}" 
                             placeholder="KM" 
                             data-date="${tgl}" />
                      <span class="text-[10px] font-bold text-slate-400 pr-1">KM</span>
                    </div>
                    <button type="button" 
                            class="btn-save-inline-daily-gps px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] rounded transition cursor-pointer shadow-2xs"
                            data-date="${tgl}"
                            data-salesnik="${salesNik}"
                            data-salesnama="${escapeHtml(salesName)}"
                            data-calcgps="${dailyMetrics.totalKm}"
                            title="Simpan Jarak GPS Baru">
                      Simpan
                    </button>
                    <button type="button" 
                            class="btn-cancel-inline-daily-gps px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px] font-bold rounded cursor-pointer"
                            data-date="${tgl}"
                            title="Batal">
                      ✕
                    </button>
                  </div>
                </div>
                ` : ''}
              </div>

              <a href="${dailyMapsUrl}" target="_blank" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5 shrink-0" title="Buka rute Google Maps untuk verifikasi rute sesungguhnya">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span>Rute Google Maps (${dailyVisits.length} Visit)</span>
              </a>
            </div>
          </div>

          <!-- ODOMETER INPUT SECTION -->
          <div class="p-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2 font-bold text-xs text-slate-800">
                <span>Odometer Kendaraan (${tgl}):</span>
                <span class="text-[11px] font-normal text-slate-500">(GPS Terpakai: <b class="text-indigo-700 font-mono">${effectiveGpsKm} KM</b>)</span>
              </div>
              
              <div class="flex items-center gap-2 flex-wrap text-xs">
                <div class="flex items-center gap-1 bg-white px-2.5 py-1 border border-slate-200 rounded-lg">
                  <span class="text-[10px] font-bold text-slate-500">KM Awal:</span>
                  <input type="number" data-date="${tgl}" class="input-daily-km-awal w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-300 rounded font-mono text-slate-900 font-bold text-xs outline-none focus:border-indigo-600 ${isStandardKaryawan ? 'cursor-not-allowed bg-slate-100' : ''}" value="${initAwal}" placeholder="0" ${isStandardKaryawan ? 'disabled readonly' : ''} />
                </div>

                <div class="flex items-center gap-1 bg-white px-2.5 py-1 border border-slate-200 rounded-lg">
                  <span class="text-[10px] font-bold text-slate-500">KM Akhir:</span>
                  <input type="number" data-date="${tgl}" class="input-daily-km-akhir w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-300 rounded font-mono text-slate-900 font-bold text-xs outline-none focus:border-indigo-600 ${isStandardKaryawan ? 'cursor-not-allowed bg-slate-100' : ''}" value="${initAkhir}" placeholder="0" ${isStandardKaryawan ? 'disabled readonly' : ''} />
                </div>

                <div class="flex items-center gap-1 bg-white px-2.5 py-1 border border-slate-200 rounded-lg">
                  <span class="text-[10px] font-bold text-slate-500">Jarak Odm:</span>
                  <span data-date="${tgl}" class="disp-daily-jarak-odm font-black text-amber-700 font-mono text-xs">${initJarakOdm.toFixed(1)} KM</span>
                </div>

                <div class="flex items-center gap-1 bg-white px-2.5 py-1 border border-slate-200 rounded-lg">
                  <span class="text-[10px] font-bold text-slate-500">Selisih:</span>
                  <span data-date="${tgl}" class="disp-daily-selisih-km font-black ${initSelisih >= 0 ? 'text-emerald-600' : 'text-rose-600'} font-mono text-xs">${initSelisih > 0 ? '+' : ''}${initSelisih.toFixed(1)} KM</span>
                </div>

                ${!isStandardKaryawan ? `
                <button data-date="${tgl}" data-gpskm="${effectiveGpsKm}" class="btn-save-daily-odometer px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition text-xs shadow-2xs cursor-pointer">
                  Simpan Odometer
                </button>
                ` : ''}
              </div>
            </div>

            <div data-date="${tgl}" class="disp-daily-status-badge text-[11px] font-semibold text-slate-600">
              ${numAkhir > 0 ? (initSelisih >= 0 ? `Jarak Odometer (${initJarakOdm.toFixed(1)} KM) terpaut +${initSelisih.toFixed(1)} KM lebih tinggi dibanding Rute GPS (${effectiveGpsKm} KM).` : `Jarak Odometer (${initJarakOdm.toFixed(1)} KM) terpaut ${initSelisih.toFixed(1)} KM lebih rendah dibanding Rute GPS (${effectiveGpsKm} KM).`) : 'Input KM Awal & KM Akhir untuk menghitung selisih odometer vs rute GPS'}
            </div>
          </div>

          <!-- TABLE OF VISIT LEGS FOR THIS DATE -->
          <div class="p-3.5">
            <div class="overflow-x-auto border border-slate-200 rounded-xl">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                    ${isSuperOrHrd ? `
                      <th class="p-2.5 text-center w-10">
                        <input type="checkbox" class="chk-select-all-date rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer" data-date="${tgl}" title="Pilih Semua Kunjungan Tanggal ${tgl}" ${allDateLegsSelected ? 'checked' : ''} />
                      </th>
                    ` : ''}
                    <th class="p-2.5 text-center w-16">Leg / Waktu</th>
                    <th class="p-2.5">Tujuan Outlet</th>
                    <th class="p-2.5">Koordinat GPS</th>
                    <th class="p-2.5 text-right w-20">Jarak</th>
                    <th class="p-2.5 text-center w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${legsTableHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        `;
      }).join("");

      return `
      <div class="p-4 md:p-6 space-y-4 w-full mx-auto" id="route-modal-container">
        <!-- MODAL TOP BAR -->
        <div class="border-b border-slate-100 pb-2.5 flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Detail Rute, Odometer & Kunjungan Sales</span>
            </h3>
            <p class="text-xs text-slate-500">${isStandardKaryawan ? 'Rekapan rute harian, riwayat kunjungan outlet, & jarak tempuh sales.' : 'Monitoring rute harian, verifikasi jarak tempuh, edit GPS, & hapus data kunjungan ganda.'}</p>
          </div>
          <button id="modal-close-route" class="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer px-2 py-0.5 rounded-lg hover:bg-slate-100 transition">✕</button>
        </div>

        <!-- SUMMARY BANNER & DATE SELECTOR -->
        <div class="p-3.5 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div class="space-y-0.5">
            <p class="text-xs text-slate-300 flex items-center gap-2">
              <span class="font-bold text-amber-400 text-sm">${escapeHtml(salesName)}</span>
              <span class="text-slate-400">(NIK: ${escapeHtml(salesNik)})</span>
            </p>
            <p class="text-xs text-slate-300">
              Total: <b>${totalVisitsCount} Visit Outlet</b> | Jarak GPS: <b>${totalOverallGpsKm} KM</b> (${sortedDates.length} Hari)
            </p>
          </div>

          <!-- DATE SELECT FILTER -->
          <div class="flex items-center gap-2 flex-wrap">
            <select id="route-modal-date-select" class="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white outline-none focus:border-indigo-500 cursor-pointer">
              <option value="ALL" ${activeDate === 'ALL' ? 'selected' : ''}>Semua Tanggal (${sortedDates.length} Hari)</option>
              ${sortedDates.map(d => `<option value="${escapeHtml(d)}" ${d === activeDate ? 'selected' : ''}>Tanggal ${escapeHtml(d)}</option>`).join("")}
            </select>
          </div>
        </div>

        ${isSuperOrHrd ? `
        <!-- BATCH DELETION ACTION BAR -->
        <div id="batch-action-bar-container">
          ${selectedVisitIds.size > 0 ? `
            <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 flex-wrap shadow-2xs animate-in fade-in duration-150">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 bg-rose-600 text-white rounded text-[11px] font-bold">Terpilih: ${selectedVisitIds.size} Kunjungan</span>
                <span class="text-xs text-rose-800 font-medium hidden sm:inline">Siap untuk dihapus secara massal tanpa menutup popup</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" id="btn-modal-clear-selection" class="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition cursor-pointer">
                  Batal Pilih
                </button>
                <button type="button" id="btn-modal-delete-selected" class="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  <span>Hapus ${selectedVisitIds.size} Terpilih</span>
                </button>
              </div>
            </div>
          ` : `
            <div class="p-2.5 bg-slate-100/80 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs text-slate-600">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                <span>Centang kotak pilihan (checkbox) pada tabel untuk memilih dan menghapus titik kunjungan tertentu secara massal.</span>
              </div>
            </div>
          `}
        </div>
        ` : ''}

        ${!isStandardKaryawan ? `
        <!-- BASE DEPARTURE CONFIGURATION BAR (COMPACT) -->
        <div class="p-2.5 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between gap-3 flex-wrap text-xs">
          <div class="flex items-center gap-1.5 font-bold text-slate-800">
            <span>Base Sales:</span>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1">
              <span class="font-bold text-slate-600 text-[11px]">Kosan:</span>
              <input type="text" id="input-modal-start-base-gps" class="px-2 py-0.5 text-xs font-mono border border-slate-300 rounded w-36 bg-white text-slate-800 outline-none focus:border-indigo-600" value="${escapeHtml(baseStart)}" placeholder="-6.728000, 108.545000" />
              <button id="btn-modal-save-start-base-gps" class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded transition cursor-pointer">Simpan</button>
            </div>
            <div class="flex items-center gap-1">
              <span class="font-bold text-slate-600 text-[11px]">Kantor:</span>
              <input type="text" id="input-modal-end-base-gps" class="px-2 py-0.5 text-xs font-mono border border-slate-300 rounded w-36 bg-white text-slate-800 outline-none focus:border-indigo-600" value="${escapeHtml(baseEnd)}" placeholder="-6.732000, 108.552000" />
              <button id="btn-modal-save-end-base-gps" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px] rounded transition cursor-pointer">Simpan</button>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- CARDS CONTAINER PER TANGGAL KUNJUNGAN -->
        <div class="space-y-4">
          ${dateCardsHtml}
        </div>

        <div class="flex justify-end pt-2 border-t border-slate-200">
          <button id="btn-close-route-modal" class="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition cursor-pointer shadow-xs">
            Tutup Rincian Rute
          </button>
        </div>
      </div>
      `;
    }

    function bindEvents(modalEl) {
      modalEl.querySelector("#modal-close-route")?.addEventListener("click", closeModal);
      modalEl.querySelector("#btn-close-route-modal")?.addEventListener("click", closeModal);

      const dateSelect = modalEl.querySelector("#route-modal-date-select");
      if (dateSelect) {
        dateSelect.onchange = (e) => {
          activeDate = e.target.value;
          refreshModalView();
        };
      }

      // Checkbox visit select handler
      modalEl.querySelectorAll(".chk-modal-select-visit").forEach(chk => {
        chk.onchange = () => {
          const vid = chk.dataset.visitid;
          if (vid) {
            if (chk.checked) {
              selectedVisitIds.add(String(vid));
            } else {
              selectedVisitIds.delete(String(vid));
            }
          }
          refreshModalView();
        };
      });

      // Checkbox select all per date
      modalEl.querySelectorAll(".chk-select-all-date").forEach(chk => {
        chk.onchange = () => {
          const tgl = chk.dataset.date;
          const dateCheckboxes = modalEl.querySelectorAll(`.chk-modal-select-visit[data-date="${tgl}"]`);
          dateCheckboxes.forEach(vChk => {
            const vid = vChk.dataset.visitid;
            if (vid) {
              if (chk.checked) {
                selectedVisitIds.add(String(vid));
              } else {
                selectedVisitIds.delete(String(vid));
              }
            }
          });
          refreshModalView();
        };
      });

      // Clear selection button
      modalEl.querySelector("#btn-modal-clear-selection")?.addEventListener("click", () => {
        selectedVisitIds.clear();
        refreshModalView();
      });

      // Batch delete selected button
      modalEl.querySelector("#btn-modal-delete-selected")?.addEventListener("click", () => {
        deleteBatchVisitsInModal();
      });

      // Date-specific batch delete button
      modalEl.querySelectorAll(".btn-delete-date-selected").forEach(btn => {
        btn.onclick = () => {
          const tgl = btn.dataset.date;
          const dateCheckboxes = modalEl.querySelectorAll(`.chk-modal-select-visit[data-date="${tgl}"]`);
          const targetIds = [];
          dateCheckboxes.forEach(vChk => {
            const vid = vChk.dataset.visitid;
            if (vid && selectedVisitIds.has(String(vid))) {
              targetIds.push(String(vid));
            }
          });
          if (targetIds.length > 0) {
            deleteBatchVisitsInModal(targetIds);
          }
        };
      });

      // Realtime Daily Odometer Calculations
      modalEl.querySelectorAll(".input-daily-km-awal, .input-daily-km-akhir").forEach(input => {
        input.oninput = () => {
          const tgl = input.dataset.date;
          if (!tgl) return;

          const inpAwal = modalEl.querySelector(`.input-daily-km-awal[data-date="${tgl}"]`);
          const inpAkhir = modalEl.querySelector(`.input-daily-km-akhir[data-date="${tgl}"]`);
          const dispJarak = modalEl.querySelector(`.disp-daily-jarak-odm[data-date="${tgl}"]`);
          const dispSelisih = modalEl.querySelector(`.disp-daily-selisih-km[data-date="${tgl}"]`);
          const dispStatus = modalEl.querySelector(`.disp-daily-status-badge[data-date="${tgl}"]`);
          const btnSave = modalEl.querySelector(`.btn-save-daily-odometer[data-date="${tgl}"]`);

          const awal = parseFloat(inpAwal?.value) || 0;
          const akhir = parseFloat(inpAkhir?.value) || 0;
          const gpsKm = parseFloat(btnSave?.dataset?.gpskm) || 0;

          const jarakOdm = (akhir >= awal) ? (akhir - awal) : 0;
          const selisih = Math.round((jarakOdm - gpsKm) * 10) / 10;

          if (dispJarak) dispJarak.textContent = `${jarakOdm.toFixed(1)} KM`;
          if (dispSelisih) {
            dispSelisih.textContent = `${selisih > 0 ? '+' : ''}${selisih.toFixed(1)} KM`;
            dispSelisih.className = `disp-daily-selisih-km font-black ${selisih >= 0 ? 'text-emerald-600' : 'text-rose-600'} font-mono text-xs`;
          }
          if (dispStatus) {
            if (akhir > 0) {
              dispStatus.innerHTML = selisih >= 0
                ? `<span class="text-emerald-700 font-bold">Jarak Odometer (${jarakOdm.toFixed(1)} KM) terpaut +${selisih.toFixed(1)} KM lebih tinggi dibanding Rute GPS (${gpsKm} KM).</span>`
                : `<span class="text-rose-700 font-bold">Jarak Odometer (${jarakOdm.toFixed(1)} KM) terpaut ${selisih.toFixed(1)} KM lebih rendah dibanding Rute GPS (${gpsKm} KM).</span>`;
            } else {
              dispStatus.textContent = "Input KM Awal & KM Akhir untuk menghitung selisih odometer vs rute GPS";
            }
          }
        };
      });

      // Toggle Custom Daily GPS Distance Edit Form
      modalEl.querySelectorAll(".btn-toggle-edit-daily-gps").forEach(btn => {
        btn.onclick = () => {
          const tgl = btn.dataset.date;
          if (!tgl) return;
          const viewBox = modalEl.querySelector(`.view-gps-controls[data-date="${tgl}"]`);
          const formBox = modalEl.querySelector(`.form-inline-edit-gps[data-date="${tgl}"]`);
          const inputEl = modalEl.querySelector(`.input-custom-daily-gps-val[data-date="${tgl}"]`);
          if (viewBox) viewBox.classList.add("hidden");
          if (formBox) formBox.classList.remove("hidden");
          if (inputEl) {
            inputEl.focus();
            inputEl.select();
          }
        };
      });

      // Cancel Custom Daily GPS Edit
      modalEl.querySelectorAll(".btn-cancel-inline-daily-gps").forEach(btn => {
        btn.onclick = () => {
          const tgl = btn.dataset.date;
          if (!tgl) return;
          const viewBox = modalEl.querySelector(`.view-gps-controls[data-date="${tgl}"]`);
          const formBox = modalEl.querySelector(`.form-inline-edit-gps[data-date="${tgl}"]`);
          if (formBox) formBox.classList.add("hidden");
          if (viewBox) viewBox.classList.remove("hidden");
        };
      });

      // Save Custom Daily GPS Distance
      modalEl.querySelectorAll(".btn-save-inline-daily-gps").forEach(btn => {
        btn.onclick = async () => {
          const tgl = btn.dataset.date;
          const sNik = btn.dataset.salesnik || salesNik;
          const sNama = btn.dataset.salesnama || salesName;
          const calcGps = parseFloat(btn.dataset.calcgps) || 0;
          const inputEl = modalEl.querySelector(`.input-custom-daily-gps-val[data-date="${tgl}"]`);
          const customVal = inputEl ? inputEl.value : "";

          const success = await saveCustomDailyGpsKm(sNik, sNama, tgl, customVal, calcGps);
          if (success) {
            refreshModalView();
          }
        };
      });

      modalEl.querySelectorAll(".input-custom-daily-gps-val").forEach(input => {
        input.onkeydown = async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const tgl = input.dataset.date;
            const saveBtn = modalEl.querySelector(`.btn-save-inline-daily-gps[data-date="${tgl}"]`);
            if (saveBtn) {
              saveBtn.click();
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            const tgl = input.dataset.date;
            const cancelBtn = modalEl.querySelector(`.btn-cancel-inline-daily-gps[data-date="${tgl}"]`);
            if (cancelBtn) {
              cancelBtn.click();
            }
          }
        };
      });

      // Reset Custom Daily GPS Distance to Auto Calculation
      modalEl.querySelectorAll(".btn-reset-daily-gps").forEach(btn => {
        btn.onclick = async () => {
          const tgl = btn.dataset.date;
          const sNik = btn.dataset.salesnik || salesNik;
          const sNama = btn.dataset.salesnama || salesName;
          const calcGps = parseFloat(btn.dataset.calcgps) || 0;

          const confirmed = await showInModalConfirm(
            `Kembalikan jarak GPS tanggal ${tgl} ke kalkulasi otomatis sistem (${calcGps} KM)?`,
            { title: "Reset Jarak GPS" }
          );
          if (!confirmed) return;

          const success = await saveCustomDailyGpsKm(sNik, sNama, tgl, null, calcGps);
          if (success) {
            refreshModalView();
          }
        };
      });

      // Save Daily Odometer
      modalEl.querySelectorAll(".btn-save-daily-odometer").forEach(btn => {
        btn.onclick = async () => {
          const tgl = btn.dataset.date;
          if (!tgl) return;
          const inpAwal = modalEl.querySelector(`.input-daily-km-awal[data-date="${tgl}"]`);
          const inpAkhir = modalEl.querySelector(`.input-daily-km-akhir[data-date="${tgl}"]`);
          const awal = inpAwal ? inpAwal.value : "";
          const akhir = inpAkhir ? inpAkhir.value : "";
          const gpsKm = parseFloat(btn.dataset.gpskm) || 0;

          const success = await saveOdometerLog(salesNik, salesName, tgl, awal, akhir, gpsKm);
          if (success) {
            refreshModalView();
          }
        };
      });

      // Delete single visit handler (stay in modal)
      modalEl.querySelectorAll(".btn-modal-delete-visit").forEach(btn => {
        btn.onclick = async () => {
          const visitId = btn.dataset.visitid;
          const storeName = btn.dataset.toname;
          await deleteSingleVisitInModal(visitId, storeName);
        };
      });

      // Toggle Effective Call checkbox inside Modal
      modalEl.querySelectorAll(".chk-modal-effective-call").forEach(chk => {
        chk.onchange = async (e) => {
          const visitId = chk.dataset.visitid;
          const storeName = chk.dataset.toname;
          const isChecked = e.target.checked;
          const success = await toggleVisitEffectiveCallDirectly(visitId, storeName, isChecked);
          if (success) {
            const vItem = allSalesVisits.find(v => (v._docId || v.id) === visitId || v.id === visitId);
            if (vItem) {
              vItem.status_kunjungan = isChecked ? "Effective Call (Order Toko)" : "Visit Toko (Tanpa Order)";
              vItem.is_effective_call = isChecked;
            }
            refreshModalView();
          }
        };
      });

      // Inline Visit GPS Edits
      modalEl.querySelectorAll(".btn-modal-save-inline-gps").forEach(btn => {
        btn.onclick = async () => {
          const visitId = btn.dataset.visitid;
          const storeName = btn.dataset.toname;
          const inputEl = modalEl.querySelector(`.input-modal-inline-gps[data-visitid="${visitId}"]`);
          const newGps = inputEl ? inputEl.value : "";
          const success = await saveVisitGpsDirectly(visitId, storeName, newGps);
          if (success) {
            refreshModalView();
          }
        };
      });

      modalEl.querySelectorAll(".input-modal-inline-gps").forEach(input => {
        input.onkeydown = async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const visitId = input.dataset.visitid;
            const storeName = input.dataset.toname;
            const success = await saveVisitGpsDirectly(visitId, storeName, input.value);
            if (success) {
              refreshModalView();
            }
          }
        };
      });

      // Save Base Departure / Return Points
      const saveBaseGps = async (isStart, customGpsValue = null) => {
        let rawVal = "";
        if (customGpsValue !== null) {
          rawVal = String(customGpsValue).trim();
        } else {
          const inputEl = modalEl.querySelector(isStart ? "#input-modal-start-base-gps" : "#input-modal-end-base-gps");
          rawVal = inputEl ? inputEl.value.trim() : "";
        }
        const coords = parseGpsCoordinates(rawVal);
        if (!coords) {
          toast("Format GPS tidak valid! Gunakan format: Latitude, Longitude (contoh: -6.728000, 108.545000)", "error");
          return;
        }
        const validGps = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        if (!departureConfig.sales_points) departureConfig.sales_points = {};
        if (!departureConfig.sales_points[salesNik]) departureConfig.sales_points[salesNik] = {};

        if (isStart) {
          departureConfig.sales_points[salesNik].start_gps = validGps;
          if (!departureConfig.sales_points[salesNik].start_nama) {
            departureConfig.sales_points[salesNik].start_nama = `Kosan Sales (${salesNik})`;
          }
          toast("Titik Awal Keberangkatan Sales berhasil diperbarui!", "success");
        } else {
          departureConfig.sales_points[salesNik].end_gps = validGps;
          if (!departureConfig.sales_points[salesNik].end_nama) {
            departureConfig.sales_points[salesNik].end_nama = "Kantor CV Andela Jaya Cirebon";
          }
          toast("Titik Akhir Kepulangan Sales berhasil diperbarui!", "success");
        }

        await fsUpdate(COL.APP_SETTINGS, "sales_departure_config", departureConfig).catch(async () => {
          await fsAdd(COL.APP_SETTINGS, { id: "sales_departure_config", ...departureConfig }, "sales_departure_config");
        });

        applyAndRenderDashboard();
        refreshModalView();
      };

      const btnSaveStart = modalEl.querySelector("#btn-modal-save-start-base-gps");
      if (btnSaveStart) btnSaveStart.onclick = () => saveBaseGps(true);

      const btnSaveEnd = modalEl.querySelector("#btn-modal-save-end-base-gps");
      if (btnSaveEnd) btnSaveEnd.onclick = () => saveBaseGps(false);

      // Daily table row start/end GPS edit handlers
      modalEl.querySelectorAll(".btn-save-daily-start-gps").forEach(btn => {
        btn.onclick = () => {
          const tgl = btn.dataset.date;
          const inp = modalEl.querySelector(`.input-daily-start-gps[data-date="${tgl}"]`);
          if (inp) saveBaseGps(true, inp.value);
        };
      });

      modalEl.querySelectorAll(".input-daily-start-gps").forEach(input => {
        input.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveBaseGps(true, input.value);
          }
        };
      });

      modalEl.querySelectorAll(".btn-save-daily-end-gps").forEach(btn => {
        btn.onclick = () => {
          const tgl = btn.dataset.date;
          const inp = modalEl.querySelector(`.input-daily-end-gps[data-date="${tgl}"]`);
          if (inp) saveBaseGps(false, inp.value);
        };
      });

      modalEl.querySelectorAll(".input-daily-end-gps").forEach(input => {
        input.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveBaseGps(false, input.value);
          }
        };
      });
    }

    function refreshModalView() {
      const modalEl = document.querySelector("#app-modal-backdrop");
      if (!modalEl) return;
      const bodyContainer = modalEl.querySelector("#app-modal-panel .overflow-y-auto");
      if (bodyContainer) {
        bodyContainer.innerHTML = renderModalContent();
        bindEvents(modalEl);
      }
    }

    openModal({
      title: `Rincian Rute & Odometer — ${salesName}`,
      bodyHtml: renderModalContent(),
      size: "full",
      onMount: (modalEl) => {
        bindEvents(modalEl);
      }
    });
  }

  // Helper: Extract column value from Excel row regardless of key case
  function getRowVal(row, possibleKeys) {
    if (!row || typeof row !== "object") return "";
    for (const k of possibleKeys) {
      for (const key in row) {
        if (key.trim().toLowerCase() === k.trim().toLowerCase()) {
          const val = row[key];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            return String(val).trim();
          }
        }
      }
    }
    return "";
  }

  // Helper: Parse Indonesian Text Date (e.g., "Sabtu, 08 Agu 2026")
  function parseIndonesianTextDate(rawDate) {
    if (!rawDate) return null;
    
    if (typeof rawDate === "number" && isFinite(rawDate)) {
      const dt = smartParseDate(rawDate);
      if (dt && !isNaN(dt.getTime())) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    const s = String(rawDate).trim();
    if (!s) return null;

    const monthMap = {
      jan: "01", januari: "01",
      feb: "02", februari: "02",
      mar: "03", maret: "03",
      apr: "04", april: "04",
      mei: "05",
      jun: "06", juni: "06",
      jul: "07", juli: "07",
      agu: "08", ags: "08", agustus: "08",
      sep: "09", sept: "09", september: "09",
      okt: "10", oktober: "10",
      nov: "11", november: "11",
      des: "12", desember: "12"
    };

    const textMatch = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (textMatch) {
      let [, dd, mStr, yyyy] = textMatch;
      dd = dd.padStart(2, '0');
      const mNum = monthMap[mStr.toLowerCase()];
      if (mNum) {
        return `${yyyy}-${mNum}-${dd}`;
      }
    }

    const dt = smartParseDate(s);
    if (dt && !isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return null;
  }

  // PDF Report Export Function (2 Versi: SUMMARY vs FULL)
  async function exportSalesVisitsPdf(recordsOverride = null, pdfVersion = "FULL") {
    if (allCheckinsList.length === 0) {
      return toast("Tidak ada data kunjungan sales untuk dibuatkan PDF.", "warning");
    }

    const versionLabel = pdfVersion === "SUMMARY" ? "Rekapan & Analitik Simple" : "Lengkap Detail & Foto";
    toast(`Membuat PDF Laporan Sales (${versionLabel})...`, "info");

    let filteredRecords = [];
    const salesmanFilter = filterSalesmanSelect ? filterSalesmanSelect.value : "ALL";
    const periodFilter = filterPeriodSelect ? filterPeriodSelect.value : "ALL";
    const statusFilter = filterStatusSelect ? filterStatusSelect.value : "ALL";
    const searchFilter = (filterSearchInput ? filterSearchInput.value : "").toLowerCase().trim();

    if (recordsOverride && Array.isArray(recordsOverride)) {
      filteredRecords = recordsOverride;
    } else {
      const now = new Date();

      // Filter records according to active filter
      filteredRecords = allCheckinsList.filter(item => {
        if (salesmanFilter !== "ALL") {
          const itemSales = cleanSalesName(item.sales_nama);
          if (itemSales !== cleanSalesName(salesmanFilter) && item.sales_nik !== salesmanFilter) return false;
        }
        if (statusFilter === "EC" && !(item.status_kunjungan || "").toLowerCase().includes("effective") && !item.is_effective_call) return false;
        if (statusFilter === "STOK" && !(item.status_kunjungan || "").toLowerCase().includes("stok")) return false;
        if (statusFilter === "PENAWARAN" && !(item.status_kunjungan || "").toLowerCase().includes("penawaran")) return false;

        if (periodFilter === "TODAY") {
          if (item.tanggal !== todayStr) return false;
        } else if (periodFilter === "WEEK") {
          const itemDate = new Date(item.tanggal);
          const diffDays = (now - itemDate) / (1000 * 3600 * 24);
          if (isNaN(diffDays) || diffDays > 7) return false;
        } else if (periodFilter === "MONTH") {
          const itemMonth = (item.tanggal || "").substring(0, 7);
          const currentMonth = todayStr.substring(0, 7);
          if (itemMonth !== currentMonth) return false;
        }

        if (searchFilter) {
          const text = `${item.sales_nama} ${item.toko_outlet} ${item.alamat_toko} ${item.catatan} ${item.status_kunjungan}`.toLowerCase();
          if (!text.includes(searchFilter)) return false;
        }

        return true;
      });
    }

    if (filteredRecords.length === 0) {
      return toast("Tidak ada data kunjungan yang cocok dengan filter aktif.", "warning");
    }

    // Group records by Salesman -> then Date
    const salesGroup = new Map();
    filteredRecords.forEach(r => {
      const salesName = cleanSalesName(r.sales_nama);
      const salesNik = (r.sales_nik || "-").trim();
      if (!salesGroup.has(salesName)) {
        salesGroup.set(salesName, {
          nama: salesName,
          nik: salesNik,
          byDate: new Map()
        });
      }
      const sObj = salesGroup.get(salesName);
      if (salesNik && salesNik !== "-" && (!sObj.nik || sObj.nik === "-")) {
        sObj.nik = salesNik;
      }
      const dStr = r.tanggal || todayStr;
      if (!sObj.byDate.has(dStr)) {
        sObj.byDate.set(dStr, []);
      }
      sObj.byDate.get(dStr).push(r);
    });

    // Compute Summary Stats per Salesman
    const salesmanSummaries = [];
    let grandTotalKm = 0;
    let grandTotalVisits = 0;
    let grandTotalEc = 0;

    salesGroup.forEach((sData, sName) => {
      let salesTotalKm = 0;
      let salesTotalVisits = 0;
      let salesEcCount = 0;
      const dates = Array.from(sData.byDate.keys()).sort((a,b) => b.localeCompare(a));

      dates.forEach(dStr => {
        const visits = sData.byDate.get(dStr);
        const metrics = calculateSalesRouteMetrics(visits, departureConfig, sData.nik);
        const eff = getEffectiveDailyGpsDistance(sData.nik, dStr, metrics.totalKm);
        salesTotalKm += eff.totalKm;
        salesTotalVisits += visits.length;
        visits.forEach(v => {
          if ((v.status_kunjungan || "").toLowerCase().includes("effective")) salesEcCount++;
        });
      });

      grandTotalKm += salesTotalKm;
      grandTotalVisits += salesTotalVisits;
      grandTotalEc += salesEcCount;

      salesmanSummaries.push({
        nama: sName,
        nik: sData.nik,
        activeDays: dates.length,
        totalVisits: salesTotalVisits,
        totalKm: Number(salesTotalKm.toFixed(1)),
        avgKmPerDay: dates.length > 0 ? Number((salesTotalKm / dates.length).toFixed(1)) : 0,
        ecCount: salesEcCount,
        ecPct: salesTotalVisits > 0 ? Math.round((salesEcCount / salesTotalVisits) * 100) : 0,
        byDate: sData.byDate
      });
    });

    const grandEcPct = grandTotalVisits > 0 ? Math.round((grandTotalEc / grandTotalVisits) * 100) : 0;
    const reportDateStr = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date());

    const periodLabel = periodFilter === "TODAY" ? `Hari Ini (${todayStr})`
      : periodFilter === "WEEK" ? "7 Hari Terakhir"
      : periodFilter === "MONTH" ? `Bulan ${todayStr.substring(0, 7)}`
      : "Seluruh Periode Terdaftar";

    // Build SVG Bar Chart for PDF Analitik Visual
    const maxKm = Math.max(...salesmanSummaries.map(s => s.totalKm), 1);
    const chartBarsHtml = salesmanSummaries.map(s => {
      const pct = Math.max(8, Math.round((s.totalKm / maxKm) * 100));
      return `
        <div style="margin-bottom: 7px;">
          <div style="display: flex; justify-content: space-between; font-size: 9.5px; font-weight: bold; margin-bottom: 2px;">
            <span>${escapeHtml(s.nama)} (${escapeHtml(s.nik)})</span>
            <span style="color: #4338ca;">${s.totalKm} KM | ${s.totalVisits} Visit (${s.ecPct}% EC)</span>
          </div>
          <div style="background-color: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; border: 1px solid #cbd5e1;">
            <div style="width: ${pct}%; background: linear-gradient(90deg, #4f46e5, #0284c7); height: 100%; border-radius: 6px;"></div>
          </div>
        </div>
      `;
    }).join("");

    // Summary Table Rows
    const summaryRowsHtml = salesmanSummaries.map((s, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10.5px;">
        <td style="padding: 6px 8px; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="padding: 6px 8px; font-family: monospace;">${escapeHtml(s.nik)}</td>
        <td style="padding: 6px 8px; font-weight: bold; color: #1e293b;">${escapeHtml(s.nama)}</td>
        <td style="padding: 6px 8px; text-align: center;">${s.totalVisits} Outlet</td>
        <td style="padding: 6px 8px; text-align: center;">${s.activeDays} Hari</td>
        <td style="padding: 6px 8px; text-align: right; font-weight: bold; color: #4338ca;">${s.totalKm} KM</td>
        <td style="padding: 6px 8px; text-align: right; color: #475569;">${s.avgKmPerDay} KM/Hari</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: ${s.ecPct >= 70 ? '#15803d' : '#b45309'};">${s.ecPct}% EC</td>
      </tr>
    `).join("");

    // Detailed Breakdown per Salesman (HANYA UNTUK VERSI "FULL")
    let detailedHtml = "";
    if (pdfVersion === "FULL") {
      salesmanSummaries.forEach(s => {
        detailedHtml += `
          <div style="margin-top: 18px; page-break-inside: avoid;">
            <div style="background-color: #0f172a; color: #ffffff; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 10px; font-weight: bold; color: #818cf8; text-transform: uppercase;">SALES REPRESENTATIVE</div>
                <div style="font-size: 13px; font-weight: 900; margin-top: 2px;">${escapeHtml(s.nama)} <span style="font-size: 10px; font-weight: normal; color: #94a3b8;">(NIK: ${escapeHtml(s.nik)})</span></div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 9px; color: #cbd5e1;">Total Jarak Periode</div>
                <div style="font-size: 15px; font-weight: 900; color: #818cf8;">${s.totalKm} KM</div>
              </div>
            </div>
        `;

        const dates = Array.from(s.byDate.keys()).sort((a,b) => b.localeCompare(a));
        dates.forEach(dStr => {
          const visits = s.byDate.get(dStr);
          const metrics = calculateSalesRouteMetrics(visits, departureConfig, s.nik);
          const effGps = getEffectiveDailyGpsDistance(s.nik, dStr, metrics.totalKm);

          const pdfStartRow = `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px; background-color: #e0e7ff; font-weight: bold;">
              <td style="padding: 5px 6px; text-align: center; color: #3730a3;">START</td>
              <td style="padding: 5px 6px; text-align: center; color: #4338ca;">Start</td>
              <td style="padding: 5px 6px; font-weight: bold; color: #1e1b4b;">${escapeHtml(metrics.startPoint.nama)} (${escapeHtml(metrics.startPoint.type || 'Kosan/Base')})</td>
              <td style="padding: 5px 6px; color: #475569;">
                <div>Titik Keberangkatan Salesman</div>
                <div style="font-size: 8.5px; color: #4338ca; font-family: monospace;">GPS: ${escapeHtml(metrics.startPoint.gps)}</div>
              </td>
              <td style="padding: 5px 6px; text-align: center; color: #94a3b8; font-style: italic;">Base Point</td>
              <td style="padding: 5px 6px; text-align: right; font-weight: bold; color: #4338ca;">0 KM</td>
            </tr>
          `;

          const pdfVisitRows = metrics.legs.map((leg) => {
            if (leg.legIndex > visits.length) return ""; // end leg handled separately

            const legPhoto = leg.photoUrl ? getDirectImageUrl(leg.photoUrl) : "";
            const isLegEc = (leg.statusKunjungan || "").toLowerCase().includes("effective") || leg.isEffectiveCall === true;
            const statusBadgeHtml = isLegEc
              ? `<span style="display: inline-block; padding: 1px 5px; background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 4px; font-size: 8px; font-weight: bold; margin-top: 2px;">✓ Effective Call (Order)</span>`
              : `<span style="display: inline-block; padding: 1px 5px; background-color: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 8px; font-weight: bold; margin-top: 2px;">○ Visit Toko (Tanpa Order)</span>`;

            return `
              <tr style="border-bottom: 1px solid #f1f5f9; font-size: 10px;">
                <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: bold; color: #4338ca;">Leg #${leg.legIndex}</td>
                <td style="padding: 5px 6px; text-align: center;">
                  <div style="font-weight: bold; color: #0f172a;">${escapeHtml(leg.waktuCheckin)}</div>
                  <div style="font-size: 8.5px; color: #64748b;">Out: ${escapeHtml(leg.waktuCheckout)}</div>
                </td>
                <td style="padding: 5px 6px;">
                  <div style="font-weight: bold; color: #0f172a;">${escapeHtml(leg.toName)}</div>
                  <div>${statusBadgeHtml}</div>
                </td>
                <td style="padding: 5px 6px; color: #475569;">
                  <div>${escapeHtml(leg.toAddress)}</div>
                  <div style="font-size: 8.5px; color: #4f46e5; font-family: monospace;">GPS: ${escapeHtml(leg.toGps)}</div>
                  ${leg.catatan && leg.catatan !== '-' ? `<div style="font-size: 8.5px; color: #0f172a; font-style: italic; margin-top: 1px;">Catatan: ${escapeHtml(leg.catatan)}</div>` : ''}
                </td>
                <td style="padding: 5px 6px; text-align: center;">
                  ${legPhoto ? `
                    <div style="display: inline-block; text-align: center;">
                      <img src="${escapeHtml(legPhoto)}" 
                           alt="Foto ${escapeHtml(leg.toName)}"
                           loading="eager"
                           onerror="if(!this.dataset.retry){this.dataset.retry=1;this.src='/api/proxy-image?url='+encodeURIComponent(this.src);}"
                           style="width: 55px; height: 55px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; display: block; margin: 0 auto;" />
                      <span style="font-size: 7.5px; color: #16a34a; font-weight: bold; display: block; margin-top: 1px;">Foto Field</span>
                    </div>
                  ` : `
                    <span style="font-size: 8px; color: #94a3b8; font-style: italic;">No Photo</span>
                  `}
                </td>
                <td style="padding: 5px 6px; text-align: right; font-weight: bold; color: #4338ca;">${leg.distanceKm} KM</td>
              </tr>
            `;
          }).join("");

          const pdfEndRow = `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px; background-color: #f1f5f9; font-weight: bold;">
              <td style="padding: 5px 6px; text-align: center; color: #1e293b;">FINISH</td>
              <td style="padding: 5px 6px; text-align: center; color: #475569;">Selesai</td>
              <td style="padding: 5px 6px; font-weight: bold; color: #0f172a;">${escapeHtml(metrics.endPoint.nama)} (${escapeHtml(metrics.endPoint.type || 'Kantor/Base')})</td>
              <td style="padding: 5px 6px; color: #475569;">
                <div>Titik Kepulangan Salesman</div>
                <div style="font-size: 8.5px; color: #334155; font-family: monospace;">GPS: ${escapeHtml(metrics.endPoint.gps)}</div>
              </td>
              <td style="padding: 5px 6px; text-align: center; color: #94a3b8; font-style: italic;">End Point</td>
              <td style="padding: 5px 6px; text-align: right; font-weight: bold; color: #4338ca;">${metrics.legs.length > 0 ? metrics.legs[metrics.legs.length - 1].distanceKm : 0} KM</td>
            </tr>
          `;

          const legsRows = pdfStartRow + pdfVisitRows + pdfEndRow;

          detailedHtml += `
            <div style="margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
              <div style="background-color: #f1f5f9; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px;">
                <span style="font-weight: bold; color: #1e293b;">Tanggal: ${escapeHtml(dStr)}</span>
                <span style="font-size: 9.5px; color: #475569;">Keberangkatan: <b>${escapeHtml(metrics.startPoint.nama)}</b> | Total Jarak GPS: <b style="color:#4338ca;">${effGps.totalKm} KM</b> ${effGps.isManual ? '<span style="color:#d97706;font-weight:bold;">(Custom Google Maps)</span>' : ''}</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background-color: #f8fafc; color: #64748b; font-size: 8.5px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">
                    <th style="padding: 5px; text-align: center; width: 45px;">Leg</th>
                    <th style="padding: 5px; text-align: center; width: 65px;">Waktu</th>
                    <th style="padding: 5px; width: 140px;">Toko / Outlet Target</th>
                    <th style="padding: 5px;">Alamat & Koordinat GPS</th>
                    <th style="padding: 5px; text-align: center; width: 65px;">Foto Bukti</th>
                    <th style="padding: 5px; text-align: right; width: 60px;">Jarak (KM)</th>
                  </tr>
                </thead>
                <tbody>
                  ${legsRows}
                </tbody>
              </table>
            </div>
          `;
        });

        detailedHtml += `</div>`;
      });
    }

    const fullPdfHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #1e293b; padding: 16px; background-color: #ffffff; max-width: 800px; margin: 0 auto;">
        <!-- KOP DOKUMEN RESMI STANDAR ISO CV ANDELA JAYA -->
        <div style="margin-bottom: 12px; page-break-inside: avoid;">
          ${isoDocHeaderTable({
            judul: pdfVersion === "SUMMARY" 
              ? "LAPORAN REKAPAN PERFORMANCE & JARAK TEMPUH SALES" 
              : "LAPORAN LENGKAP DETAIL RUTE & FOTO BUKTI KUNJUNGAN SALES",
            noDok: "SL-TRK/01",
            terbitRevisi: "1/0",
            tglTerbit: reportDateStr || "13 Agustus 2026",
            hal: "1 dari 1"
          })}
        </div>

        <!-- METADATA DOKUMEN PERUSAHAAN -->
        <div style="border: 1px solid #cbd5e1; background-color: #f8fafc; padding: 6px 10px; border-radius: 4px; margin-bottom: 12px; font-size: 9.5px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <div><b>Periode Laporan:</b> <span style="color: #0f172a;">${escapeHtml(periodLabel)}</span></div>
          <div><b>Tipe Dokumen:</b> <span style="color: #7a1f2b; font-weight: bold;">${pdfVersion === "SUMMARY" ? "Versi 1: Rekapan & Grafik Analitik" : "Versi 2: Lengkap Detail & Foto Field"}</span></div>
          <div><b>Tanggal Cetak:</b> ${reportDateStr}</div>
        </div>

        <!-- STATS HIGHLIGHT -->
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 8.5px; color: #64748b; font-weight: bold; text-transform: uppercase;">Total Salesman</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a;">${salesmanSummaries.length} Orang</div>
          </div>
          <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 8.5px; color: #64748b; font-weight: bold; text-transform: uppercase;">Total Visit Outlet</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a;">${grandTotalVisits} Visit</div>
          </div>
          <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 8.5px; color: #64748b; font-weight: bold; text-transform: uppercase;">Total Jarak Tempuh</div>
            <div style="font-size: 13px; font-weight: 900; color: #4338ca;">${grandTotalKm.toFixed(1)} KM</div>
          </div>
          <div style="flex: 1; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 8.5px; color: #64748b; font-weight: bold; text-transform: uppercase;">Overall EC Rate</div>
            <div style="font-size: 13px; font-weight: 900; color: ${grandEcPct >= 70 ? '#15803d' : '#b45309'};">${grandEcPct}% EC</div>
          </div>
        </div>

        <!-- GRAFIK ANALITIK VISUAL (BAR CHART) -->
        <div style="margin-bottom: 14px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px;">
          <h4 style="font-size: 9.5px; font-weight: bold; color: #7a1f2b; margin: 0 0 6px 0; text-transform: uppercase;">
            📊 Grafik Visual Akumulasi Jarak Tempuh (KM) Per Salesman
          </h4>
          ${chartBarsHtml}
        </div>

        <!-- BAGIAN 1: TABEL REKAPAN -->
        <div style="margin-bottom: 14px;">
          <h4 style="font-size: 10px; font-weight: bold; color: #7a1f2b; margin: 0 0 5px 0; border-bottom: 1.5px solid #7a1f2b; padding-bottom: 2px;">1. REKAPAN AKUMULASI PERFORMA & JARAK TEMPUH PER SALESMAN</h4>
          <table style="width: 100%; border-collapse: collapse; text-align: left; border: 1px solid #cbd5e1;">
            <thead>
              <tr style="background-color: #f1f5f9; color: #1e293b; font-size: 9px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 5px 6px; text-align: center; width: 25px;">#</th>
                <th style="padding: 5px 6px; width: 65px;">NIK</th>
                <th style="padding: 5px 6px;">Nama Salesman</th>
                <th style="padding: 5px 6px; text-align: center;">Total Visit</th>
                <th style="padding: 5px 6px; text-align: center;">Hari Aktif</th>
                <th style="padding: 5px 6px; text-align: right;">Total Jarak</th>
                <th style="padding: 5px 6px; text-align: right;">Rata-Rata/Hari</th>
                <th style="padding: 5px 6px; text-align: center;">EC Rate</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRowsHtml}
            </tbody>
          </table>
        </div>

        ${pdfVersion === "FULL" ? `
        <!-- BAGIAN 2: DETAIL HARIAN PER SALES & FOTO BUKTI FIELD -->
        <div style="margin-bottom: 14px;">
          <h4 style="font-size: 10px; font-weight: bold; color: #7a1f2b; margin: 0 0 5px 0; border-bottom: 1.5px solid #7a1f2b; padding-bottom: 2px;">2. DETAIL RINCIAN KUNJUNGAN HARI DEMI HARI & FOTO BUKTI FIELD</h4>
          ${detailedHtml}
        </div>
        ` : ''}

        <!-- LEMBAR TANDA TANGAN HRD & MANAJEMEN CV ANDELA JAYA -->
        <div style="margin-top: 24px; page-break-inside: avoid; display: flex; justify-content: space-between; text-align: center; font-size: 9.5px;">
          <div style="width: 200px;">
            <p style="margin: 0; font-weight: bold; color: #334155;">Dibuat Oleh,</p>
            <p style="margin: 0; color: #64748b; font-size: 8.5px;">Administrator HRD & Operasional</p>
            <div style="height: 45px;"></div>
            <p style="margin: 0; font-weight: bold; text-decoration: underline; color: #0f172a;">( Tim HRD CV Andela Jaya )</p>
          </div>
          <div style="width: 200px;">
            <p style="margin: 0; font-weight: bold; color: #334155;">Disetujui Oleh,</p>
            <p style="margin: 0; color: #64748b; font-size: 8.5px;">Manager Penjualan & HRGA</p>
            <div style="height: 45px;"></div>
            <p style="margin: 0; font-weight: bold; text-decoration: underline; color: #0f172a;">( Manajemen CV Andela Jaya )</p>
          </div>
        </div>
      </div>
    `;

    try {
      const fileNameSuffix = pdfVersion === "SUMMARY" ? "Rekapan" : "Detail_Foto";
      await downloadHtmlAsPdf(fullPdfHtml, `Laporan_Rute_Sales_${fileNameSuffix}_${todayStr}.pdf`, "portrait");
      toast(`File PDF Laporan Sales (${versionLabel}) berhasil diunduh!`, "success");
    } catch (err) {
      console.error("Gagal cetak PDF Sales:", err);
      toast("Gagal men-generate PDF Laporan Sales: " + err.message, "error");
    }
  }

  // MODAL Export Data Kunjungan dengan Pemilihan Periode & Filter
  function openExportPeriodModal(defaultFormat = "EXCEL") {
    if (allCheckinsList.length === 0) {
      return toast("Belum ada data kunjungan sales yang tersimpan di sistem.", "warning");
    }

    // Build salesman list options
    const salesMap = new Map();
    allCheckinsList.forEach(c => {
      const name = cleanSalesName(c.sales_nama);
      const nik = (c.sales_nik || "").trim();
      const key = (nik && nik !== "-" && nik !== "SLS-IMP") ? nik : name;
      if (name && !salesMap.has(key)) {
        salesMap.set(key, { nama: name, nik: (nik && nik !== "SLS-IMP") ? nik : "" });
      }
    });

    let salesOptionsHtml = `<option value="ALL">-- Semua Salesman --</option>`;
    salesMap.forEach((sData, key) => {
      salesOptionsHtml += `<option value="${escapeHtml(key)}">${escapeHtml(sData.nama)} ${sData.nik ? `(NIK: ${escapeHtml(sData.nik)})` : ''}</option>`;
    });

    const currentYearMonth = todayStr.substring(0, 7);

    const modalOverlay = document.createElement("div");
    modalOverlay.className = "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4";

    modalOverlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div class="bg-gradient-to-r from-maroon-800 to-slate-900 text-white p-5 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="p-2 bg-white/10 rounded-xl">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div>
              <h3 class="font-bold text-base text-white">Export Data Kunjungan Sales</h3>
              <p class="text-xs text-slate-300">Pilih periode tarikan data & format file sebelum export</p>
            </div>
          </div>
          <button id="btn-close-export-modal" class="text-slate-300 hover:text-white text-xl font-bold cursor-pointer transition">✕</button>
        </div>

        <div class="p-6 space-y-4 text-xs text-slate-700">
          <!-- 1. PERIODE TARIKAN DATA -->
          <div>
            <label class="block font-bold text-slate-800 mb-1.5 text-xs">Periode Tarikan Data:</label>
            <select id="export-period-select" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-maroon-600 outline-none cursor-pointer">
              <option value="TODAY">Hari Ini (${escapeHtml(todayStr)})</option>
              <option value="YESTERDAY">Kemarin (${escapeHtml(yesterdayStr)})</option>
              <option value="WEEK">7 Hari Terakhir</option>
              <option value="MONTH" selected>Bulan Ini (${escapeHtml(currentYearMonth)})</option>
              <option value="CUSTOM">Rentang Tanggal Spesifik...</option>
              <option value="ALL">Semua Data (${allCheckinsList.length} Visit)</option>
            </select>
          </div>

          <!-- CUSTOM DATE RANGE -->
          <div id="export-custom-date-container" class="hidden grid grid-cols-2 gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
            <div>
              <label class="block font-bold text-amber-900 mb-1 text-[11px]">Tanggal Mulai:</label>
              <input type="date" id="export-date-from" value="${escapeHtml(todayStr)}" class="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono outline-none focus:border-maroon-600" />
            </div>
            <div>
              <label class="block font-bold text-amber-900 mb-1 text-[11px]">Tanggal Selesai:</label>
              <input type="date" id="export-date-to" value="${escapeHtml(todayStr)}" class="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-mono outline-none focus:border-maroon-600" />
            </div>
          </div>

          <!-- 2. FILTER SALESMAN -->
          <div>
            <label class="block font-bold text-slate-800 mb-1.5 text-xs">Filter Salesman:</label>
            <select id="export-salesman-select" class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-maroon-600 outline-none cursor-pointer">
              ${salesOptionsHtml}
            </select>
          </div>

          <!-- 3. FORMAT LAPORAN & VERSI EXPORT -->
          <div>
            <label class="block font-bold text-slate-800 mb-1.5 text-xs">Format & Versi Laporan Export:</label>
            <div class="space-y-2">
              <label class="flex items-start gap-3 p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50 border-slate-200 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50/50 transition">
                <input type="radio" name="export-format" value="EXCEL" ${defaultFormat === "EXCEL" ? "checked" : ""} class="accent-emerald-600 mt-1" />
                <div>
                  <p class="font-bold text-slate-800">File Spreadsheet Excel (.xlsx)</p>
                  <p class="text-[10.5px] text-slate-500">Tabel raw data kunjungan, koordinat GPS, & catatan untuk olah data spreadsheet.</p>
                </div>
              </label>

              <label class="flex items-start gap-3 p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50 border-slate-200 has-[:checked]:border-red-600 has-[:checked]:bg-red-50/50 transition">
                <input type="radio" name="export-format" value="PDF_SUMMARY" ${defaultFormat === "PDF" ? "checked" : ""} class="accent-red-600 mt-1" />
                <div>
                  <p class="font-bold text-slate-800">📄 PDF Versi 1: Rekapan & Analitik (Ringkas / Simple)</p>
                  <p class="text-[10.5px] text-slate-500">Rangkuman statistik 1-2 halaman, grafik visual jarak sales, dan tabel akumulasi (tanpa rincian toko per toko).</p>
                </div>
              </label>

              <label class="flex items-start gap-3 p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50 border-slate-200 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50/50 transition">
                <input type="radio" name="export-format" value="PDF_FULL" class="accent-indigo-600 mt-1" />
                <div>
                  <p class="font-bold text-slate-800">📋 PDF Versi 2: Lengkap Detail Rute + Foto Kunjungan</p>
                  <p class="text-[10.5px] text-slate-500">Laporan lengkap berisi ringkasan, grafik, rincian rute harian, koordinat GPS, dan foto bukti check-in tiap toko.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          <span id="export-preview-count" class="text-[11px] font-bold text-slate-600 bg-slate-200 px-2.5 py-1 rounded-lg">
            Estimasi: 0 Visit Data
          </span>
          <div class="flex items-center gap-2">
            <button id="btn-cancel-export" class="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-300 transition cursor-pointer">Batal</button>
            <button id="btn-confirm-export" class="px-5 py-2 bg-maroon-700 text-white font-bold rounded-xl text-xs hover:bg-maroon-800 transition cursor-pointer flex items-center gap-1.5 shadow-sm">
              Unduh Laporan
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    const periodSelect = modalOverlay.querySelector("#export-period-select");
    const customContainer = modalOverlay.querySelector("#export-custom-date-container");
    const dateFromEl = modalOverlay.querySelector("#export-date-from");
    const dateToEl = modalOverlay.querySelector("#export-date-to");
    const salesmanSelect = modalOverlay.querySelector("#export-salesman-select");
    const countEl = modalOverlay.querySelector("#export-preview-count");

    const getFilteredRecords = () => {
      const period = periodSelect.value;
      const salesNik = salesmanSelect.value;
      const dateFrom = dateFromEl.value;
      const dateTo = dateToEl.value;

      return allCheckinsList.filter(item => {
        // Salesman filter
        if (salesNik !== "ALL") {
          const itemNik = (item.sales_nik || "").trim();
          const itemName = cleanSalesName(item.sales_nama);
          if (itemNik !== salesNik && itemName !== cleanSalesName(salesNik)) {
            return false;
          }
        }

        // Date period filter
        const d = item.tanggal || "";
        if (period === "TODAY") {
          if (d !== todayStr) return false;
        } else if (period === "YESTERDAY") {
          if (d !== yesterdayStr) return false;
        } else if (period === "WEEK") {
          const itemDate = new Date(d);
          const diffDays = (now - itemDate) / (1000 * 3600 * 24);
          if (isNaN(diffDays) || diffDays > 7 || diffDays < -1) return false;
        } else if (period === "MONTH") {
          if (!d.startsWith(currentYearMonth)) return false;
        } else if (period === "CUSTOM") {
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
        }
        return true;
      });
    };

    const updatePreviewCount = () => {
      const list = getFilteredRecords();
      countEl.textContent = `Estimasi: ${list.length} Data Visit`;
    };

    periodSelect.onchange = () => {
      if (periodSelect.value === "CUSTOM") {
        customContainer.classList.remove("hidden");
      } else {
        customContainer.classList.add("hidden");
      }
      updatePreviewCount();
    };

    salesmanSelect.onchange = () => updatePreviewCount();
    dateFromEl.onchange = () => updatePreviewCount();
    dateToEl.onchange = () => updatePreviewCount();

    // Initial update
    updatePreviewCount();

    const closeModal = () => modalOverlay.remove();
    modalOverlay.querySelector("#btn-close-export-modal").onclick = closeModal;
    modalOverlay.querySelector("#btn-cancel-export").onclick = closeModal;

    modalOverlay.querySelector("#btn-confirm-export").onclick = async () => {
      const targetRecords = getFilteredRecords();
      if (targetRecords.length === 0) {
        toast("Tidak ada data kunjungan pada periode/filter yang dipilih.", "warning");
        return;
      }

      const selectedFormat = modalOverlay.querySelector('input[name="export-format"]:checked')?.value || "EXCEL";
      closeModal();

      if (selectedFormat === "EXCEL") {
        toast(`Mengeksport ${targetRecords.length} data kunjungan ke Excel...`, "info");
        const headers = ["ID Checkin", "Salesman", "NIK Sales", "Nama Toko / Outlet", "Alamat Toko", "Status Kunjungan", "Waktu Check-in", "Waktu Check-out", "Tanggal", "Koordinat GPS", "Gambar Check In", "Catatan"];
        const matrix = targetRecords.map(item => [
          item.id || "-",
          item.sales_nama || "-",
          item.sales_nik || "-",
          item.toko_outlet || "-",
          item.alamat_toko || "-",
          item.status_kunjungan || "-",
          item.waktu_checkin || "-",
          item.waktu_checkout || "-",
          item.tanggal || "-",
          item.koordinat_gps || "-",
          item.gambar_checkin || item.foto_checkin || "-",
          item.catatan || "-"
        ]);

        await downloadXlsx(`Data_Kunjungan_Sales_${todayStr}.xlsx`, headers, matrix, "Data_Kunjungan");
        toast(`File Excel (${targetRecords.length} data) berhasil diunduh!`, "success");
      } else if (selectedFormat === "PDF_SUMMARY") {
        await exportSalesVisitsPdf(targetRecords, "SUMMARY");
      } else if (selectedFormat === "PDF_FULL") {
        await exportSalesVisitsPdf(targetRecords, "FULL");
      } else {
        await exportSalesVisitsPdf(targetRecords, "FULL");
      }
    };
  }

  // Bind Export Excel
  if (btnExport) {
    btnExport.onclick = () => openExportPeriodModal("EXCEL");
  }

  // Bind Export PDF
  if (btnExportPdf) {
    btnExportPdf.onclick = () => openExportPeriodModal("PDF");
  }

  // Bind Import Excel
  if (btnImport && fileImportInput) {
    btnImport.onclick = () => fileImportInput.click();

    fileImportInput.onchange = async (evt) => {
      const file = evt.target.files && evt.target.files[0];
      if (!file) return;

      if (typeof window.XLSX === "undefined") {
        toast("Pustaka XLSX belum siap di sistem, harap segarkan halaman.", "error");
        fileImportInput.value = "";
        return;
      }

      try {
        toast("Membaca file Excel kunjungan...", "info");
        const dataBuffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(dataBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rows || rows.length === 0) {
          toast("File Excel kosong atau tidak memiliki baris data.", "warning");
          fileImportInput.value = "";
          return;
        }

        openModal({
          title: "Proses Import Kunjungan Sales",
          bodyHtml: `
            <div class="space-y-4 p-2">
              <div class="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p class="text-sm font-bold text-blue-900">Menganalisis & Mengimpor ${rows.length} Baris Kunjungan</p>
                <p class="text-xs text-blue-700 mt-1">Sistem melakukan geocoding alamat, pencocokan salesman, dan pembuatan titik GPS rute otomatis.</p>
              </div>
              <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div id="import-progress-bar" class="bg-blue-600 h-full w-0 transition-all duration-200"></div>
              </div>
              <p id="import-progress-status" class="text-xs text-slate-600 font-semibold text-center">Memulai pemrosesan...</p>
            </div>
          `,
          size: "md"
        });

        const progressBar = document.getElementById("import-progress-bar");
        const progressStatus = document.getElementById("import-progress-status");

        // Clean out any dummy/mock records before importing
        await purgeDummyVisits();

        // Preload Master Outlets to use registered coordinates when raw address lacks Plus code or GPS
        const masterOutlets = await fsGetAll("sales_outlets").catch(() => []);

        let successCount = 0;

        for (let idx = 0; idx < rows.length; idx++) {
          const row = rows[idx];
          
          const pct = Math.round(((idx + 1) / rows.length) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;

          const namaSales = getRowVal(row, ["Nama", "Salesman", "Nama Sales", "Sales", "User"]);
          const jabatanSales = getRowVal(row, ["Jabatan", "Position", "Jabatan Sales"]);
          const rawDate = getRowVal(row, ["Tanggal", "Date", "Tgl"]);
          const rawTime = getRowVal(row, ["Waktu", "Time", "Jam", "Jam Check In", "Check In"]);
          const rawAddress = getRowVal(row, ["Alamat Check In", "Alamat", "Alamat Toko", "Address", "Lokasi"]);
          const rawStatus = getRowVal(row, ["Keterangan Check In", "Keterangan", "Status", "Status Kunjungan"]);
          const rawCustomer = getRowVal(row, ["Nama Pelanggan", "Pelanggan", "Nama Toko", "Toko", "Outlet"]);
          const rawImage = getRowVal(row, ["Gambar Check In", "Gambar", "Foto", "Foto Check In", "Image", "Url", "Link Foto", "Photo", "Foto Kunjungan", "Bukti Foto", "Lampiran", "Link", "Foto Toko", "Foto Pelanggan"]);

          // GPS Column Reading from Excel
          const rawGps = getRowVal(row, [
            "Koordinat GPS", "GPS", "Koordinat", "Lat, Lng", "Lat/Lng",
            "Lokasi GPS", "Titik GPS", "Position GPS", "Coordinat", "GPS Pos",
            "Lat Long", "Latitude/Longitude", "Geo", "Google Map", "Maps", "Koordinat_GPS", "KoordinatGps"
          ]);
          const rawLat = getRowVal(row, ["Latitude", "Lat", "Lattitude"]);
          const rawLng = getRowVal(row, ["Longitude", "Lng", "Long", "Longtitude"]);

          if (!namaSales && !rawCustomer && !rawAddress && !rawGps) continue;

          if (progressStatus) {
            progressStatus.textContent = `[${idx + 1}/${rows.length}] Processing ${escapeHtml(rawCustomer || namaSales || "Outlet")} (${escapeHtml((rawAddress || rawGps || "").substring(0, 30))}...)`;
          }

          const dateStr = parseIndonesianTextDate(rawDate) || todayStr;
          
          let timeStr = rawTime || "08:30:00";
          if (typeof rawTime === "number") {
            const totalSecs = Math.round(rawTime * 86400);
            const hh = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
            const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
            const ss = String(totalSecs % 60).padStart(2, '0');
            timeStr = `${hh}:${mm}:${ss}`;
          }

          // SMART GPS RESOLUTION HIERARCHY:
          // 1. If raw address has explicit Plus Code or explicit GPS coordinates, decode/geocode directly with high precision
          let finalGpsStr = "";
          const queryAddr = [rawAddress, rawCustomer].filter(Boolean).join(", ");
          const matchMaster = findMatchingMasterOutlet(rawCustomer || rawAddress, masterOutlets);

          const hasExplicit = hasExplicitGpsOrPlusCode(rawAddress) || hasExplicitGpsOrPlusCode(rawGps);

          if (hasExplicit) {
            const geoRes = await geocodeAddressSmart(rawAddress || rawGps, idx);
            if (geoRes && isValidOperationalCoordinate(geoRes.lat, geoRes.lng)) {
              finalGpsStr = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
              // Auto-update master outlet if coordinates were missing
              if (matchMaster && !matchMaster.koordinat_gps) {
                matchMaster.koordinat_gps = finalGpsStr;
                matchMaster.lat = geoRes.lat;
                matchMaster.lng = geoRes.lng;
                fsUpdate("sales_outlets", matchMaster.id, {
                  koordinat_gps: finalGpsStr,
                  lat: geoRes.lat,
                  lng: geoRes.lng,
                  updated_at: new Date().toISOString()
                }).catch(() => {});
              }
            }
          }

          // 2. If raw data lacks explicit Plus Code / GPS, fallback to Master Outlet database registered coordinates!
          if (!finalGpsStr && matchMaster && matchMaster.koordinat_gps) {
            const parsedMaster = parseGpsCoordinates(matchMaster.koordinat_gps);
            if (parsedMaster && isValidOperationalCoordinate(parsedMaster.lat, parsedMaster.lng)) {
              finalGpsStr = `${parsedMaster.lat.toFixed(6)}, ${parsedMaster.lng.toFixed(6)}`;
              console.log(`[EXCEL IMPORT] Menggunakan titik koordinat terdaftar di Master Outlet untuk '${rawCustomer}': ${finalGpsStr}`);
            }
          }

          // 3. Fallback to smart geocoding (OpenStreetMap / City lookup)
          if (!finalGpsStr && queryAddr) {
            if (idx > 0) {
              await new Promise(r => setTimeout(r, 150));
            }
            const geoRes = await geocodeAddressSmart(queryAddr, idx);
            if (geoRes && isValidOperationalCoordinate(geoRes.lat, geoRes.lng)) {
              finalGpsStr = `${geoRes.lat.toFixed(6)}, ${geoRes.lng.toFixed(6)}`;
            }
          }

          // 4. Fallback to raw GPS from Excel columns if available
          if (!finalGpsStr) {
            let parsedGps = null;
            if (rawGps) {
              parsedGps = parseGpsCoordinates(String(rawGps));
            }
            if (!parsedGps && rawLat && rawLng) {
              parsedGps = parseGpsCoordinates(`${rawLat}, ${rawLng}`);
            }
            if (parsedGps && isValidOperationalCoordinate(parsedGps.lat, parsedGps.lng)) {
              finalGpsStr = `${parsedGps.lat.toFixed(6)}, ${parsedGps.lng.toFixed(6)}`;
            }
          }

          // 5. Ultimate fallback if still no valid GPS
          if (!finalGpsStr) {
            const fallbackRes = await geocodeAddressSmart(queryAddr || rawCustomer || rawAddress || "Klampok Wanasari Brebes Tegal", idx);
            finalGpsStr = `${fallbackRes.lat.toFixed(6)}, ${fallbackRes.lng.toFixed(6)}`;
          }

          // Find Salesman NIK match & standardized uppercase name
          const sInfo = resolveSalesmanInfo(namaSales, "");
          const finalSalesName = sInfo.name;
          const salesNik = sInfo.nik;

          const checkinId = `CHK-IMP-${salesNik}-${dateStr}-${idx}-${Date.now().toString(36)}`;
          
          const checkinDoc = normalizeCheckinItem({
            id: checkinId,
            sales_nik: salesNik,
            sales_nama: finalSalesName,
            sales_jabatan: jabatanSales || "Sales Canvassing",
            toko_outlet: rawCustomer || "Pelanggan / Toko",
            alamat_toko: rawAddress || "Cirebon",
            koordinat_gps: finalGpsStr,
            waktu_checkin: timeStr,
            waktu_checkout: timeStr,
            tanggal: dateStr,
            status_kunjungan: rawStatus || "Kunjungan (Import Excel)",
            catatan: `Import Excel: ${rawStatus || "Done"}`,
            gambar_checkin: rawImage || "",
            sumber: "Import Excel Kunjungan",
            perusahaan: companyName,
            geocoded_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          await fsUpdate("kanal_checkins", checkinDoc.id, checkinDoc).catch(async () => {
            await fsAdd("kanal_checkins", checkinDoc, checkinDoc.id);
          });

          successCount++;
        }

        closeModal();
        toast(`Sukses mengimpor ${successCount} data kunjungan sales dari Excel!`, "success");
        
        fileImportInput.value = "";
        
        // Reload data & refresh UI
        await loadAndRenderTrack();

      } catch (err) {
        console.error("Error importing sales visits Excel:", err);
        closeModal();
        toast("Gagal mengimpor file Excel: " + err.message, "error");
        fileImportInput.value = "";
      }
    };
  }

  if (btnConfigDeparture) {
    btnConfigDeparture.onclick = () => openDepartureConfigModal();
  }

  // Bind Filter Event Handlers
  if (filterSalesmanSelect) filterSalesmanSelect.onchange = applyAndRenderDashboard;
  if (filterPeriodSelect) filterPeriodSelect.onchange = applyAndRenderDashboard;
  if (filterStatusSelect) filterStatusSelect.onchange = applyAndRenderDashboard;
  if (filterSearchInput) filterSearchInput.oninput = applyAndRenderDashboard;

  if (btnResetFilter) {
    btnResetFilter.onclick = () => {
      if (filterSalesmanSelect) filterSalesmanSelect.value = "ALL";
      if (filterPeriodSelect) filterPeriodSelect.value = "TODAY";
      if (filterStatusSelect) filterStatusSelect.value = "ALL";
      if (filterSearchInput) filterSearchInput.value = "";
      applyAndRenderDashboard();
      toast("Filter berhasil direset", "info");
    };
  }

  if (btnPurgeDummy) {
    btnPurgeDummy.onclick = async () => {
      const ok = await confirmDialog("Hapus seluruh data kunjungan dummy / contoh dan hanya menyisakan data kunjungan hasil import Excel?", { title: "Konfirmasi Hapus Kunjungan Dummy" });
      if (!ok) return;
      try {
        toast("Sedang membersihkan kunjungan dummy...", "info");
        const count = await purgeDummyVisits();
        await loadAndRenderTrack();
        toast(`Berhasil menghapus ${count} data kunjungan dummy! Hanya menyisakan data hasil import Excel.`, "success");
      } catch (e) {
        toast("Gagal menghapus data dummy: " + e.message, "error");
      }
    };
  }

  btnSync.onclick = async () => {
    btnSync.disabled = true;
    btnSync.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Tarik & Geocode Data...
    `;

    try {
      await doKanalSync();
      await loadAndRenderTrack();
      toast(`Sukses mengsinkronkan data check-in Kanal & geocoding rute untuk ${companyName}!`, "success");
    } catch (e) {
      toast("Gagal melakukan sinkronisasi Kanal: " + e.message, "error");
    } finally {
      btnSync.disabled = false;
      btnSync.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15H15.75" />
        </svg>
        Sinkronisasi Kanal.work
      `;
    }
  };

  await loadAndRenderTrack();

  return { unmount() {} };
}
