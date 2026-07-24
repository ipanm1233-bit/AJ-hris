import { db, COL, doc, deleteDoc, setDoc } from "../firebase-config.js";
import { fsGetAll, smartParseDate, escapeHtml, fmtDateShort, fmtRupiah, openModal, closeModal, toast, confirmDialog, genId } from "../utils.js";
import { renderCrudModule, badge, emptyState, icon } from "../components.js";

export async function mount(container, { session }) {
  const isHrd = ["HRD", "SUPERADMIN", "GA"].includes((session.role || "").toUpperCase());
  
  const alertWrap = container.querySelector("#kend-alert-wrap");
  const cardsGrid = container.querySelector("#kend-cards-grid");
  const searchInput = container.querySelector("#kend-search");
  const statusFilter = container.querySelector("#kend-status-filter");
  const btnAdd = container.querySelector("#btn-add-kendaraan");

  const panels = {
    cards: container.querySelector("#kd-panel-cards"),
    bbm: container.querySelector("#kd-panel-bbm"),
    service: container.querySelector("#kd-panel-service"),
    pajak: container.querySelector("#kd-panel-pajak"),
  };

  let allVehicles = [];
  let allFuelLogs = [];
  let allServiceLogs = [];
  let allComplianceLogs = [];
  let loadedTables = {};

  // Load all dataset
  async function loadAllData() {
    try {
      const [vData, fData, sData, cData] = await Promise.all([
        fsGetAll(COL.MASTER_KENDARAAN),
        fsGetAll(COL.LOG_KENDARAAN_FUEL),
        fsGetAll(COL.LOG_KENDARAAN_SERVICE),
        fsGetAll(COL.LOG_KENDARAAN_COMPLIANCE)
      ]);

      allVehicles = vData;
      allFuelLogs = fData;
      allServiceLogs = sData;
      allComplianceLogs = cData;

      renderAlerts();
      renderVehicleCards();
    } catch (err) {
      console.error("Error loading vehicles:", err);
      cardsGrid.innerHTML = `<div class="col-span-full p-8 text-center text-red-500 bg-red-50 rounded-2xl border border-red-200">Gagal memuat data kendaraan: ${escapeHtml(err.message)}</div>`;
    }
  }

  // -------------------------------------------------------------
  // 1. SMART REMINDER & ALERT COMPUTATION
  // -------------------------------------------------------------
  function renderAlerts() {
    const now = new Date();
    const urgentItems = [];

    allVehicles.forEach(v => {
      const plate = v.no_polisi || "Tanpa Plat";
      const name = `${v.merk || ""} ${v.tipe || ""}`.trim() || plate;

      // Check STNK Tahunan
      if (v.tgl_stnk_tahunan) {
        const d = smartParseDate(v.tgl_stnk_tahunan);
        if (d) {
          const days = Math.round((d - now) / 86400000);
          if (days <= 30) {
            urgentItems.push({ plate, name, type: "Perpanjangan STNK", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
          }
        }
      }

      // Check Pajak 5 Tahun
      if (v.tgl_pajak_5thn) {
        const d = smartParseDate(v.tgl_pajak_5thn);
        if (d) {
          const days = Math.round((d - now) / 86400000);
          if (days <= 30) {
            urgentItems.push({ plate, name, type: "Pajak 5 Tahunan", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
          }
        }
      }

      // Check KIR
      if (v.tgl_kir) {
        const d = smartParseDate(v.tgl_kir);
        if (d) {
          const days = Math.round((d - now) / 86400000);
          if (days <= 30) {
            urgentItems.push({ plate, name, type: "Uji KIR Kendaraan", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
          }
        }
      }

      // Check Scheduled Service
      if (v.tgl_service_berikutnya) {
        const d = smartParseDate(v.tgl_service_berikutnya);
        if (d) {
          const days = Math.round((d - now) / 86400000);
          if (days <= 14) {
            urgentItems.push({ plate, name, type: "Jadwal Rutin Service", date: d, days, level: days < 0 ? "EXPIRED" : "WARNING" });
          }
        }
      }
    });

    if (!urgentItems.length) {
      alertWrap.innerHTML = `
        <div class="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-800 text-xs font-semibold">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span>Seluruh dokumen legalitas (STNK, Pajak 5th, KIR) & jadwal service armada dalam kondisi aman.</span>
          </div>
          <span class="px-2.5 py-1 bg-emerald-100 rounded-lg text-emerald-700 text-[11px]">Status: OK</span>
        </div>`;
      return;
    }

    urgentItems.sort((a, b) => a.days - b.days);

    alertWrap.innerHTML = `
      <div class="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4.5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <p class="text-xs font-bold text-amber-900 uppercase tracking-wide">
              Pengingat Legalitas & Service Kendaraan (${urgentItems.length} Perhatian)
            </p>
          </div>
          <span class="text-[11px] font-medium text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full">Perlu Tindakan Segera</span>
        </div>
        <div class="flex flex-wrap gap-2">
          ${urgentItems.map(item => {
            const isExp = item.level === "EXPIRED";
            const bg = isExp ? "bg-rose-100 border-rose-300 text-rose-800" : "bg-white border-amber-200 text-amber-900";
            const statusStr = item.days < 0 ? `LEWAT ${Math.abs(item.days)} HARI` : `${item.days} HARI LAGI`;
            return `
              <div class="text-xs ${bg} border px-3 py-1.5 rounded-xl font-medium flex items-center gap-2 shadow-xs">
                <span class="font-bold font-mono">${escapeHtml(item.plate)}</span>
                <span class="opacity-40">•</span>
                <span>${escapeHtml(item.type)}</span>
                <span class="opacity-40">•</span>
                <span class="font-bold ${isExp ? 'text-rose-700' : 'text-amber-700'}">${statusStr} (${fmtDateShort(item.date)})</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>`;
  }

  // -------------------------------------------------------------
  // 2. RENDER VEHICLE CARDS GRID
  // -------------------------------------------------------------
  function renderVehicleCards() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const stFilter = statusFilter.value;
    const now = new Date();

    const filtered = allVehicles.filter(v => {
      const plate = String(v.no_polisi || "").toLowerCase();
      const merk = String(v.merk || "").toLowerCase();
      const tipe = String(v.tipe || "").toLowerCase();
      const driver = String(v.nama_pemilik || v.driver_pj || "").toLowerCase();

      const matchQuery = !q || plate.includes(q) || merk.includes(q) || tipe.includes(q) || driver.includes(q);
      if (!matchQuery) return false;

      // Status filter
      if (stFilter === "SIAP") return String(v.status_kendaraan || "SIAP").toUpperCase() === "SIAP";
      if (stFilter === "SERVICE") return String(v.status_kendaraan || "").toUpperCase().includes("SERVICE") || String(v.status_kendaraan || "").toUpperCase().includes("RUSAK");
      
      if (stFilter === "ALERT") {
        let isAlert = false;
        ["tgl_stnk_tahunan", "tgl_pajak_5thn", "tgl_kir", "tgl_service_berikutnya"].forEach(f => {
          const d = smartParseDate(v[f]);
          if (d) {
            const days = Math.round((d - now) / 86400000);
            if (days <= 30) isAlert = true;
          }
        });
        return isAlert;
      }

      return true;
    });

    if (!filtered.length) {
      cardsGrid.innerHTML = `
        <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200/80">
          ${emptyState("Tidak ada data kendaraan yang cocok dengan filter.")}
        </div>`;
      return;
    }

    cardsGrid.innerHTML = filtered.map(v => {
      const plate = escapeHtml(v.no_polisi || "TANPA PLAT");
      const title = escapeHtml(`${v.merk || ""} ${v.tipe || ""}`.trim() || "Kendaraan Operasional");
      const driver = escapeHtml(v.driver_pj || v.nama_pemilik || "Belum Ditetapkan");
      const fuelType = escapeHtml(v.bahan_bakar || "Solar/Bensin");
      const year = v.tahun || "-";

      // Calculate days to STNK, Pajak 5th, KIR
      const dStnk = smartParseDate(v.tgl_stnk_tahunan);
      const dPajak = smartParseDate(v.tgl_pajak_5thn);
      const dKir = smartParseDate(v.tgl_kir);

      const daysStnk = dStnk ? Math.round((dStnk - now) / 86400000) : null;
      const daysKir = dKir ? Math.round((dKir - now) / 86400000) : null;

      let stnkBadge = `<span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">STNK: ${dStnk ? fmtDateShort(dStnk) : '-'}</span>`;
      if (daysStnk !== null) {
        if (daysStnk < 0) stnkBadge = `<span class="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">STNK Expired!</span>`;
        else if (daysStnk <= 30) stnkBadge = `<span class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">STNK: ${daysStnk}hr lagi</span>`;
      }

      let kirBadge = dKir ? `<span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">KIR: ${fmtDateShort(dKir)}</span>` : '';
      if (daysKir !== null) {
        if (daysKir < 0) kirBadge = `<span class="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">KIR Expired!</span>`;
        else if (daysKir <= 30) kirBadge = `<span class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">KIR: ${daysKir}hr lagi</span>`;
      }

      // Count total fuel logs and service cost
      const fuelCount = allFuelLogs.filter(f => String(f.no_polisi || "").toUpperCase() === plate.toUpperCase()).length;
      const vehicleServices = allServiceLogs.filter(s => String(s.no_polisi || "").toUpperCase() === plate.toUpperCase());
      const serviceCost = vehicleServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);

      // Status Badge
      const statusRaw = String(v.status_kendaraan || "Siap Pakai").toUpperCase();
      let statusBadgeHtml = badge("Siap Pakai", "green");
      if (statusRaw.includes("SERVICE") || statusRaw.includes("PERBAIKAN")) {
        statusBadgeHtml = badge("Dalam Perbaikan", "amber");
      } else if (statusRaw.includes("RUSAK")) {
        statusBadgeHtml = badge("Rusak", "red");
      }

      return `
        <div data-vehicle-id="${v.id}" class="vehicle-card bg-white rounded-2xl border border-slate-200/80 hover:border-maroon-400 p-5 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between group relative overflow-hidden">
          <div class="absolute top-0 right-0 w-24 h-24 bg-maroon-500/5 rounded-full blur-xl group-hover:bg-maroon-500/10 transition"></div>
          
          <div class="space-y-3 relative z-10">
            <!-- Header Card: Icon + Plat Nomor -->
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-700 group-hover:bg-maroon-700 group-hover:text-white transition shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 17a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM4 9h11l3 4v4H4V9zM15 9V5a1 1 0 00-1-1H4a1 1 0 00-1 1v4"/></svg>
                </div>
                <div>
                  <div class="inline-block px-2.5 py-0.5 bg-slate-900 text-amber-400 font-mono font-bold text-xs rounded-md tracking-wider border border-slate-800 shadow-2xs">
                    ${plate}
                  </div>
                  <h3 class="font-bold text-slate-800 text-sm mt-1 leading-snug group-hover:text-maroon-700 transition line-clamp-1">${title}</h3>
                </div>
              </div>
              <div class="shrink-0">
                ${statusBadgeHtml}
              </div>
            </div>

            <!-- Details Specs -->
            <div class="grid grid-cols-2 gap-2 py-2 border-y border-slate-100 text-xs">
              <div>
                <span class="text-slate-400 block text-[10px]">DRIVER / PJ</span>
                <span class="font-semibold text-slate-700 truncate block">${driver}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">THN & BAHAN BAKAR</span>
                <span class="font-semibold text-slate-700 block">${year} • ${fuelType}</span>
              </div>
            </div>

            <!-- Expiry Badges -->
            <div class="flex flex-wrap gap-1.5 pt-0.5">
              ${stnkBadge}
              ${kirBadge}
            </div>
          </div>

          <!-- Card Footer Stats & Action -->
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 relative z-10">
            <div class="flex items-center gap-3">
              <span title="Total Log BBM">⛽ <b>${fuelCount}</b> log</span>
              <span title="Total Biaya Service">🔧 <b>${fmtRupiah(serviceCost)}</b></span>
            </div>
            <span class="text-maroon-700 font-bold group-hover:translate-x-0.5 transition flex items-center gap-1">
              Detail Kendaraan →
            </span>
          </div>
        </div>`;
    }).join("");

    // Bind click handlers to cards
    cardsGrid.querySelectorAll("[data-vehicle-id]").forEach(card => {
      card.onclick = () => {
        const vId = card.dataset.vehicleId;
        const vDoc = allVehicles.find(x => x.id === vId);
        if (vDoc) openVehicleDetailModal(vDoc);
      };
    });
  }

  // -------------------------------------------------------------
  // 3. COMPREHENSIVE VEHICLE DETAIL MODAL
  // -------------------------------------------------------------
  function openVehicleDetailModal(vDoc) {
    const plate = escapeHtml(vDoc.no_polisi || "TANPA PLAT");
    const name = escapeHtml(`${vDoc.merk || ""} ${vDoc.tipe || ""}`.trim() || plate);

    // Filter sub logs for this vehicle
    const vehicleFuels = allFuelLogs.filter(f => String(f.no_polisi || "").toUpperCase() === plate.toUpperCase());
    const vehicleServices = allServiceLogs.filter(s => String(s.no_polisi || "").toUpperCase() === plate.toUpperCase());
    const vehicleCompliance = allComplianceLogs.filter(c => String(c.no_polisi || "").toUpperCase() === plate.toUpperCase());

    const totalFuelCost = vehicleFuels.reduce((sum, f) => sum + (parseFloat(f.total_biaya) || 0), 0);
    const totalServiceCost = vehicleServices.reduce((sum, s) => sum + (parseFloat(s.total_biaya) || 0), 0);

    openModal({
      title: `<div class="flex items-center gap-3">
        <span class="px-2.5 py-1 bg-slate-900 text-amber-400 font-mono font-bold text-xs rounded-md tracking-wider border border-slate-800">${plate}</span>
        <span class="text-slate-800 font-bold">${name}</span>
      </div>`,
      size: "xl",
      bodyHtml: `
        <div class="space-y-5 text-left">
          <!-- SUB TABS HEADER -->
          <div class="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 text-xs">
            <button id="vtab-btn-identitas" class="vsub-tab px-4 py-2 font-bold border-b-2 border-maroon-700 text-maroon-700 whitespace-nowrap">
              📑 Identitas & Spesifikasi
            </button>
            <button id="vtab-btn-bbm" class="vsub-tab px-4 py-2 font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap">
              ⛽ Log BBM (${vehicleFuels.length})
            </button>
            <button id="vtab-btn-service" class="vsub-tab px-4 py-2 font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap">
              🔧 Log Service & Perbaikan (${vehicleServices.length})
            </button>
            <button id="vtab-btn-pajak" class="vsub-tab px-4 py-2 font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 whitespace-nowrap">
              📄 Pajak, STNK & KIR (${vehicleCompliance.length})
            </button>
          </div>

          <!-- TAB 1: IDENTITAS -->
          <div id="vtab-panel-identitas" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
                <h4 class="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 text-[11px]">Informasi Fisik & Driver</h4>
                <div class="flex justify-between"><span class="text-slate-500">No. Polisi / Plat:</span><span class="font-mono font-bold text-slate-900">${plate}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Merk & Tipe:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.merk || '-')} ${escapeHtml(vDoc.tipe || '')}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Model & Warna:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.model || '-')} / ${escapeHtml(vDoc.warna || '-')}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Tahun Pembuatan:</span><span class="font-semibold text-slate-800">${vDoc.tahun || '-'}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Bahan Bakar:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.bahan_bakar || '-')}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Driver / PJ:</span><span class="font-bold text-maroon-700">${escapeHtml(vDoc.driver_pj || vDoc.nama_pemilik || '-')}</span></div>
              </div>

              <div class="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
                <h4 class="font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 text-[11px]">Legalitas & Tanggal Penting</h4>
                <div class="flex justify-between"><span class="text-slate-500">Atas Nama Pemilik:</span><span class="font-semibold text-slate-800">${escapeHtml(vDoc.nama_pemilik || '-')}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">No. Rangka:</span><span class="font-mono text-slate-800">${escapeHtml(vDoc.no_rangka || '-')}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">No. Mesin:</span><span class="font-mono text-slate-800">${escapeHtml(vDoc.no_mesin || '-')}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Jatuh Tempo STNK:</span><span class="font-bold text-slate-900">${fmtDateShort(vDoc.tgl_stnk_tahunan)}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Jatuh Tempo Pajak 5Th:</span><span class="font-bold text-slate-900">${fmtDateShort(vDoc.tgl_pajak_5thn)}</span></div>
                <div class="flex justify-between"><span class="text-slate-500">Jatuh Tempo KIR:</span><span class="font-bold text-slate-900">${fmtDateShort(vDoc.tgl_kir)}</span></div>
              </div>
            </div>

            <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs">
              <span class="text-slate-500 block font-semibold mb-1">Alamat Terdaftar STNK / Catatan Tambahan:</span>
              <p class="text-slate-700 leading-relaxed">${escapeHtml(vDoc.alamat || 'Tidak ada catatan khusus.')}</p>
            </div>

            ${isHrd ? `
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button id="btn-edit-veh-${vDoc.id}" class="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition">
                ✏️ Edit Data Kendaraan
              </button>
              <button id="btn-del-veh-${vDoc.id}" class="px-3.5 py-2 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition">
                🗑️ Hapus Kendaraan
              </button>
            </div>` : ''}
          </div>

          <!-- TAB 2: LOG BBM -->
          <div id="vtab-panel-bbm" class="space-y-3 hidden">
            <div class="flex items-center justify-between">
              <div class="text-xs text-slate-500">
                Total Biaya BBM: <b class="text-slate-800 font-mono text-sm">${fmtRupiah(totalFuelCost)}</b> (${vehicleFuels.length} Transaksi)
              </div>
              <button id="btn-quick-add-bbm" class="px-3 py-1.5 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg shadow-xs transition">
                + Input Log BBM
              </button>
            </div>
            
            <div class="border border-slate-200 rounded-xl overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th class="p-2.5">Tanggal</th>
                    <th class="p-2.5">Driver</th>
                    <th class="p-2.5">KM awal - akhir</th>
                    <th class="p-2.5">Liter</th>
                    <th class="p-2.5 text-right">Biaya</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${vehicleFuels.length ? vehicleFuels.map(f => `
                    <tr class="hover:bg-slate-50">
                      <td class="p-2.5 font-medium">${fmtDateShort(f.tanggal)}</td>
                      <td class="p-2.5">${escapeHtml(f.nama_driver || '-')}</td>
                      <td class="p-2.5 font-mono">${f.km_awal || 0} - ${f.km_akhir || 0} km</td>
                      <td class="p-2.5 font-bold">${f.liter || 0} L (${escapeHtml(f.jenis_bbm || 'BBM')})</td>
                      <td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtRupiah(f.total_biaya)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada catatan log BBM untuk kendaraan ini.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 3: LOG SERVICE -->
          <div id="vtab-panel-service" class="space-y-3 hidden">
            <div class="flex items-center justify-between">
              <div class="text-xs text-slate-500">
                Total Biaya Perbaikan: <b class="text-slate-800 font-mono text-sm">${fmtRupiah(totalServiceCost)}</b>
              </div>
              <button id="btn-quick-add-service" class="px-3 py-1.5 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg shadow-xs transition">
                + Input Log Service
              </button>
            </div>

            <div class="border border-slate-200 rounded-xl overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th class="p-2.5">Tanggal</th>
                    <th class="p-2.5">Jenis Service</th>
                    <th class="p-2.5">Vendor / Bengkel</th>
                    <th class="p-2.5">Driver</th>
                    <th class="p-2.5 text-right">Biaya</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${vehicleServices.length ? vehicleServices.map(s => `
                    <tr class="hover:bg-slate-50">
                      <td class="p-2.5 font-medium">${fmtDateShort(s.tanggal)}</td>
                      <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(s.jenis_dokumen || s.keterangan || 'Service Rutin')}</td>
                      <td class="p-2.5">${escapeHtml(s.vendor || '-')}</td>
                      <td class="p-2.5">${escapeHtml(s.nama_driver || '-')}</td>
                      <td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtRupiah(s.total_biaya)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada riwayat service untuk kendaraan ini.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 4: LOG PAJAK & COMPLIANCE -->
          <div id="vtab-panel-pajak" class="space-y-3 hidden">
            <div class="flex items-center justify-between">
              <div class="text-xs text-slate-500">
                Riwayat Perpanjangan STNK / Pajak / KIR (${vehicleCompliance.length} Catatan)
              </div>
              <button id="btn-quick-add-pajak" class="px-3 py-1.5 text-xs font-bold bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg shadow-xs transition">
                + Input Log Pajak/KIR
              </button>
            </div>

            <div class="border border-slate-200 rounded-xl overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                  <tr>
                    <th class="p-2.5">Tgl Bayar</th>
                    <th class="p-2.5">Jenis Pajak / Legalitas</th>
                    <th class="p-2.5">Berlaku Hingga</th>
                    <th class="p-2.5">Dokumen</th>
                    <th class="p-2.5 text-right">Biaya</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${vehicleCompliance.length ? vehicleCompliance.map(c => `
                    <tr class="hover:bg-slate-50">
                      <td class="p-2.5 font-medium">${fmtDateShort(c.tanggal_bayar)}</td>
                      <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(c.jenis_pajak || '-')}</td>
                      <td class="p-2.5 font-bold text-emerald-700">${fmtDateShort(c.berlaku_hingga)}</td>
                      <td class="p-2.5">
                        ${c.dokumen_url ? `<a href="${c.dokumen_url}" target="_blank" class="text-maroon-700 hover:underline font-bold">📄 Lihat Dokumen</a>` : '-'}
                      </td>
                      <td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtRupiah(c.total_biaya)}</td>
                    </tr>
                  `).join('') : `<tr><td colspan="5" class="p-6 text-center text-slate-400">Belum ada catatan pajak & compliance.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>`
    });

    // Sub-tab toggles inside modal
    const vtabs = {
      identitas: document.getElementById("vtab-panel-identitas"),
      bbm: document.getElementById("vtab-panel-bbm"),
      service: document.getElementById("vtab-panel-service"),
      pajak: document.getElementById("vtab-panel-pajak"),
    };
    const vtabBtns = {
      identitas: document.getElementById("vtab-btn-identitas"),
      bbm: document.getElementById("vtab-btn-bbm"),
      service: document.getElementById("vtab-btn-service"),
      pajak: document.getElementById("vtab-btn-pajak"),
    };

    Object.keys(vtabBtns).forEach(k => {
      if (vtabBtns[k]) {
        vtabBtns[k].onclick = () => {
          Object.keys(vtabs).forEach(tk => {
            vtabs[tk].classList.toggle("hidden", tk !== k);
            vtabBtns[tk].classList.toggle("border-maroon-700", tk === k);
            vtabBtns[tk].classList.toggle("text-maroon-700", tk === k);
            vtabBtns[tk].classList.toggle("font-bold", tk === k);
            vtabBtns[tk].classList.toggle("border-transparent", tk !== k);
            vtabBtns[tk].classList.toggle("text-slate-500", tk !== k);
          });
        };
      }
    });

    // Quick Action Buttons
    const btnQuickBbm = document.getElementById("btn-quick-add-bbm");
    if (btnQuickBbm) {
      btnQuickBbm.onclick = () => {
        closeModal();
        openAddFuelModal(vDoc.no_polisi);
      };
    }

    const btnQuickService = document.getElementById("btn-quick-add-service");
    if (btnQuickService) {
      btnQuickService.onclick = () => {
        closeModal();
        openAddServiceModal(vDoc.no_polisi);
      };
    }

    const btnQuickPajak = document.getElementById("btn-quick-add-pajak");
    if (btnQuickPajak) {
      btnQuickPajak.onclick = () => {
        closeModal();
        openAddComplianceModal(vDoc.no_polisi);
      };
    }

    // Edit/Delete Vehicle Buttons
    const btnEdit = document.getElementById(`btn-edit-veh-${vDoc.id}`);
    if (btnEdit) {
      btnEdit.onclick = () => {
        closeModal();
        openVehicleFormModal(vDoc);
      };
    }

    const btnDel = document.getElementById(`btn-del-veh-${vDoc.id}`);
    if (btnDel) {
      btnDel.onclick = async () => {
        if (await confirmDialog(`Hapus kendaraan ${vDoc.no_polisi} dari database?`)) {
          await deleteDoc(doc(db, COL.MASTER_KENDARAAN, vDoc.id));
          toast("Kendaraan berhasil dihapus", "success");
          closeModal();
          await loadAllData();
        }
      };
    }
  }

  // -------------------------------------------------------------
  // 4. FORM MODALS FOR KENDARAAN, FUEL, SERVICE, COMPLIANCE
  // -------------------------------------------------------------
  function openVehicleFormModal(vDoc = null) {
    const isEdit = !!vDoc;
    openModal({
      title: isEdit ? `Edit Kendaraan — ${vDoc.no_polisi}` : "Tambah Kendaraan Baru",
      size: "lg",
      bodyHtml: `
        <form id="form-vehicle" class="space-y-4 text-left grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi / Plat *</label>
            <input type="text" id="fv-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-mono uppercase" placeholder="Cth: B 1234 ABC" value="${vDoc?.no_polisi || ''}">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Nama Pemilik / Atas Nama STNK</label>
            <input type="text" id="fv-pemilik" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="CV Andela Jaya" value="${vDoc?.nama_pemilik || ''}">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Merk Kendaraan *</label>
            <input type="text" id="fv-merk" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Toyota / Isuzu / Honda" value="${vDoc?.merk || ''}">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tipe / Model</label>
            <input type="text" id="fv-tipe" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Hilux / Traga / Grand Max" value="${vDoc?.tipe || ''}">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Tahun & Warna</label>
            <div class="grid grid-cols-2 gap-2">
              <input type="number" id="fv-tahun" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="2022" value="${vDoc?.tahun || ''}">
              <input type="text" id="fv-warna" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Putih" value="${vDoc?.warna || ''}">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Jenis Bahan Bakar</label>
            <select id="fv-bbm" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
              <option value="Solar" ${vDoc?.bahan_bakar === 'Solar' ? 'selected' : ''}>Solar / BioSolar</option>
              <option value="Pertalite" ${vDoc?.bahan_bakar === 'Pertalite' ? 'selected' : ''}>Pertalite</option>
              <option value="Pertamax" ${vDoc?.bahan_bakar === 'Pertamax' ? 'selected' : ''}>Pertamax</option>
              <option value="Dexlite" ${vDoc?.bahan_bakar === 'Dexlite' ? 'selected' : ''}>Dexlite</option>
              <option value="Listrik" ${vDoc?.bahan_bakar === 'Listrik' ? 'selected' : ''}>Listrik (EV)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Driver / Penanggung Jawab</label>
            <input type="text" id="fv-driver" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Nama driver / PJ armada" value="${vDoc?.driver_pj || vDoc?.nama_pemilik || ''}">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Status Kendaraan</label>
            <select id="fv-status" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400">
              <option value="Siap Pakai" ${vDoc?.status_kendaraan === 'Siap Pakai' ? 'selected' : ''}>Siap Pakai / Baik</option>
              <option value="Perlu Service" ${vDoc?.status_kendaraan === 'Perlu Service' ? 'selected' : ''}>Perlu Service / Maintenance</option>
              <option value="Dalam Perbaikan" ${vDoc?.status_kendaraan === 'Dalam Perbaikan' ? 'selected' : ''}>Dalam Perbaikan Bengkel</option>
              <option value="Rusak" ${vDoc?.status_kendaraan === 'Rusak' ? 'selected' : ''}>Rusak / Tidak Layak</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Rangka</label>
            <input type="text" id="fv-rangka" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-mono" value="${vDoc?.no_rangka || ''}">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Mesin</label>
            <input type="text" id="fv-mesin" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400 font-mono" value="${vDoc?.no_mesin || ''}">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo STNK Tahunan</label>
            <input type="date" id="fv-stnk" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_stnk_tahunan || ''}">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo Pajak 5 Tahun</label>
            <input type="date" id="fv-pajak5" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_pajak_5thn || ''}">
          </div>

          <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jatuh Tempo Uji KIR</label>
              <input type="date" id="fv-kir" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_kir || ''}">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jadwal Service Rutin Berikutnya</label>
              <input type="date" id="fv-nxt-service" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" value="${vDoc?.tgl_service_berikutnya || ''}">
            </div>
          </div>

          <div class="md:col-span-2">
            <label class="block text-xs font-bold text-slate-700 mb-1">Alamat Terdaftar / Catatan STNK</label>
            <textarea id="fv-alamat" rows="2" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-maroon-400" placeholder="Alamat cabang / lokasi simpan armada">${vDoc?.alamat || ''}</textarea>
          </div>

          <div class="md:col-span-2 pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button type="button" id="btn-cancel-fv" class="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Batal</button>
            <button type="submit" id="btn-submit-fv" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl transition shadow-xs">
              Simpan Data Kendaraan
            </button>
          </div>
        </form>`
    });

    document.getElementById("btn-cancel-fv").onclick = () => closeModal();
    document.getElementById("form-vehicle").onsubmit = async (e) => {
      e.preventDefault();
      const polisi = document.getElementById("fv-polisi").value.trim().toUpperCase();
      if (!polisi) return toast("No. Polisi Wajib diisi", "warning");

      const payload = {
        no_polisi: polisi,
        nama_pemilik: document.getElementById("fv-pemilik").value.trim(),
        merk: document.getElementById("fv-merk").value.trim(),
        tipe: document.getElementById("fv-tipe").value.trim(),
        tahun: parseInt(document.getElementById("fv-tahun").value) || null,
        warna: document.getElementById("fv-warna").value.trim(),
        bahan_bakar: document.getElementById("fv-bbm").value,
        driver_pj: document.getElementById("fv-driver").value.trim(),
        status_kendaraan: document.getElementById("fv-status").value,
        no_rangka: document.getElementById("fv-rangka").value.trim(),
        no_mesin: document.getElementById("fv-mesin").value.trim(),
        tgl_stnk_tahunan: document.getElementById("fv-stnk").value,
        tgl_pajak_5thn: document.getElementById("fv-pajak5").value,
        tgl_kir: document.getElementById("fv-kir").value,
        tgl_service_berikutnya: document.getElementById("fv-nxt-service").value,
        alamat: document.getElementById("fv-alamat").value.trim(),
        updatedAt: new Date().toISOString()
      };

      const docId = isEdit ? vDoc.id : genId("KND");
      await setDoc(doc(db, COL.MASTER_KENDARAAN, docId), payload, { merge: true });
      toast("Data kendaraan berhasil disimpan!", "success");
      closeModal();
      await loadAllData();
    };
  }

  // Quick Fuel Input
  function openAddFuelModal(defaultPlate = "") {
    openModal({
      title: "Input Log Pengisian BBM",
      size: "md",
      bodyHtml: `
        <form id="form-fuel" class="space-y-3 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi Kendaraan *</label>
            <input type="text" id="ff-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono uppercase" value="${defaultPlate}">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal *</label>
              <input type="date" id="ff-tgl" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Nama Driver *</label>
              <input type="text" id="ff-driver" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${session.nama}">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">KM Awal Speedometer</label>
              <input type="number" id="ff-kmawal" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">KM Akhir Pengisian</label>
              <input type="number" id="ff-kmakhir" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jumlah Liter *</label>
              <input type="number" step="0.1" id="ff-liter" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Total Biaya (Rp) *</label>
              <input type="number" id="ff-biaya" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-bold text-maroon-700">
            </div>
          </div>
          <div class="pt-3 flex justify-end gap-2">
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
            <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Log BBM</button>
          </div>
        </form>`
    });

    document.getElementById("form-fuel").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        no_polisi: document.getElementById("ff-polisi").value.trim().toUpperCase(),
        tanggal: document.getElementById("ff-tgl").value,
        nama_driver: document.getElementById("ff-driver").value.trim(),
        km_awal: parseFloat(document.getElementById("ff-kmawal").value) || 0,
        km_akhir: parseFloat(document.getElementById("ff-kmakhir").value) || 0,
        liter: parseFloat(document.getElementById("ff-liter").value) || 0,
        total_biaya: parseFloat(document.getElementById("ff-biaya").value) || 0,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, COL.LOG_KENDARAAN_FUEL, genId("FUEL")), payload);
      toast("Log BBM tersimpan", "success");
      closeModal();
      await loadAllData();
    };
  }

  // Quick Service Input
  function openAddServiceModal(defaultPlate = "") {
    openModal({
      title: "Input Log Service & Perbaikan",
      size: "md",
      bodyHtml: `
        <form id="form-service" class="space-y-3 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi Kendaraan *</label>
            <input type="text" id="fs-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono uppercase" value="${defaultPlate}">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Service *</label>
              <input type="date" id="fs-tgl" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Vendor / Bengkel</label>
              <input type="text" id="fs-vendor" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Bengkel Resmi / Auto2000">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Rincian Service / Perbaikan *</label>
            <input type="text" id="fs-jenis" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="Ganti oli, rem, balancing, dll">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Driver PJ</label>
              <input type="text" id="fs-driver" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${session.nama}">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Total Biaya (Rp) *</label>
              <input type="number" id="fs-biaya" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-bold text-maroon-700">
            </div>
          </div>
          <div class="pt-3 flex justify-end gap-2">
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
            <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Log Service</button>
          </div>
        </form>`
    });

    document.getElementById("form-service").onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        no_polisi: document.getElementById("fs-polisi").value.trim().toUpperCase(),
        tanggal: document.getElementById("fs-tgl").value,
        vendor: document.getElementById("fs-vendor").value.trim(),
        jenis_dokumen: document.getElementById("fs-jenis").value.trim(),
        nama_driver: document.getElementById("fs-driver").value.trim(),
        total_biaya: parseFloat(document.getElementById("fs-biaya").value) || 0,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, COL.LOG_KENDARAAN_SERVICE, genId("SVC")), payload);
      toast("Log service tersimpan", "success");
      closeModal();
      await loadAllData();
    };
  }

  // Quick Compliance Input
  function openAddComplianceModal(defaultPlate = "") {
    openModal({
      title: "Input Pajak, STNK & Uji KIR",
      size: "md",
      bodyHtml: `
        <form id="form-compliance" class="space-y-3 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">No. Polisi Kendaraan *</label>
            <input type="text" id="fc-polisi" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono uppercase" value="${defaultPlate}">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Jenis Legalitas *</label>
              <select id="fc-jenis" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
                <option value="STNK Tahunan">STNK Tahunan</option>
                <option value="Pajak 5 Tahun">Pajak 5 Tahun (Ganti Kaleng)</option>
                <option value="Uji KIR">Uji KIR Kendaraan</option>
                <option value="Asuransi Armada">Asuransi Armada</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Tanggal Bayar *</label>
              <input type="date" id="fc-tgl" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" value="${new Date().toISOString().split('T')[0]}">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Berlaku Baru Hingga *</label>
              <input type="date" id="fc-berlaku" required class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Total Biaya (Rp)</label>
              <input type="number" id="fc-biaya" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-bold text-maroon-700">
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">URL / Link Dokumen Bukti</label>
            <input type="text" id="fc-url" class="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none" placeholder="https://drive.google.com/...">
          </div>
          <div class="pt-3 flex justify-end gap-2">
            <button type="button" onclick="closeModal()" class="px-4 py-2 text-xs font-semibold text-slate-500">Batal</button>
            <button type="submit" class="px-5 py-2 text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 rounded-xl">Simpan Log Legalitas</button>
          </div>
        </form>`
    });

    document.getElementById("form-compliance").onsubmit = async (e) => {
      e.preventDefault();
      const plate = document.getElementById("fc-polisi").value.trim().toUpperCase();
      const jenis = document.getElementById("fc-jenis").value;
      const berlaku = document.getElementById("fc-berlaku").value;

      const payload = {
        no_polisi: plate,
        jenis_pajak: jenis,
        tanggal_bayar: document.getElementById("fc-tgl").value,
        berlaku_hingga: berlaku,
        total_biaya: parseFloat(document.getElementById("fc-biaya").value) || 0,
        dokumen_url: document.getElementById("fc-url").value.trim(),
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, COL.LOG_KENDARAAN_COMPLIANCE, genId("CMP")), payload);

      // Auto update vehicle expiration date if matching
      const vMatch = allVehicles.find(x => (x.no_polisi || "").toUpperCase() === plate);
      if (vMatch) {
        const updateField = {};
        if (jenis.includes("STNK")) updateField.tgl_stnk_tahunan = berlaku;
        else if (jenis.includes("5 Tahun")) updateField.tgl_pajak_5thn = berlaku;
        else if (jenis.includes("KIR")) updateField.tgl_kir = berlaku;

        if (Object.keys(updateField).length) {
          await setDoc(doc(db, COL.MASTER_KENDARAAN, vMatch.id), updateField, { merge: true });
        }
      }

      toast("Log legalitas tersimpan!", "success");
      closeModal();
      await loadAllData();
    };
  }

  // -------------------------------------------------------------
  // 5. EVENT BINDINGS & TAB SWITCHING
  // -------------------------------------------------------------
  btnAdd.onclick = () => openVehicleFormModal();
  searchInput.oninput = () => renderVehicleCards();
  statusFilter.onchange = () => renderVehicleCards();

  // Tab Switching
  container.querySelectorAll(".kd-tab").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.ktab;
      
      Object.keys(panels).forEach(k => {
        panels[k].classList.toggle("hidden", k !== tab);
      });

      container.querySelectorAll(".kd-tab").forEach(b => {
        const isCurrent = b === btn;
        b.classList.toggle("bg-white", isCurrent);
        b.classList.toggle("text-maroon-700", isCurrent);
        b.classList.toggle("font-bold", isCurrent);
        b.classList.toggle("shadow-sm", isCurrent);
        b.classList.toggle("text-slate-600", !isCurrent);
        b.classList.toggle("font-semibold", !isCurrent);
      });

      if (tab === "bbm" && !loadedTables.bbm) {
        loadedTables.bbm = true;
        await renderCrudModule(panels.bbm, {
          title: "Seluruh Log Pengisian BBM Armada",
          collectionName: COL.LOG_KENDARAAN_FUEL,
          idPrefix: "FUEL",
          searchFields: ["no_polisi", "nama_driver"],
          columns: [
            { key: "tanggal", label: "Tanggal", type: "date" },
            { key: "no_polisi", label: "No. Polisi" },
            { key: "nama_driver", label: "Driver" },
            { key: "km_awal", label: "KM Awal", type: "number" },
            { key: "km_akhir", label: "KM Akhir", type: "number" },
            { key: "liter", label: "Liter", type: "number" },
            { key: "total_biaya", label: "Biaya", type: "currency" },
          ]
        });
      }

      if (tab === "service" && !loadedTables.service) {
        loadedTables.service = true;
        await renderCrudModule(panels.service, {
          title: "Seluruh Log Service & Perbaikan Armada",
          collectionName: COL.LOG_KENDARAAN_SERVICE,
          idPrefix: "SVC",
          searchFields: ["no_polisi", "nama_driver", "vendor"],
          columns: [
            { key: "tanggal", label: "Tanggal", type: "date" },
            { key: "no_polisi", label: "No. Polisi" },
            { key: "jenis_dokumen", label: "Rincian" },
            { key: "vendor", label: "Vendor / Bengkel" },
            { key: "total_biaya", label: "Biaya", type: "currency" },
          ]
        });
      }

      if (tab === "pajak" && !loadedTables.pajak) {
        loadedTables.pajak = true;
        await renderCrudModule(panels.pajak, {
          title: "Seluruh Log Pajak, STNK & Uji KIR",
          collectionName: COL.LOG_KENDARAAN_COMPLIANCE,
          idPrefix: "CMP",
          searchFields: ["no_polisi", "jenis_pajak"],
          columns: [
            { key: "tanggal_bayar", label: "Tgl Bayar", type: "date" },
            { key: "no_polisi", label: "No. Polisi" },
            { key: "jenis_pajak", label: "Jenis" },
            { key: "berlaku_hingga", label: "Berlaku Hingga", type: "date" },
            { key: "total_biaya", label: "Biaya", type: "currency" },
            { key: "dokumen_url", label: "Dokumen", type: "link" },
          ]
        });
      }
    });
  });

  await loadAllData();
  return { unmount() {} };
}
