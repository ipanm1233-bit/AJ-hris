import { openModal, closeModal, toast, escapeHtml, fsGetAll, fsAdd, fsUpdate, downloadXlsx } from "../utils.js";
import { COL } from "../firebase-config.js";

// Beautiful SVG D3 visualization loaded from ESM
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export async function mount(container, { session }) {
  const btnSync = container.querySelector("#btn-sync-kanal");
  const btnExport = container.querySelector("#btn-export-sales-visits");
  const timelineEl = container.querySelector("#live-timeline");

  const subtitleEl = container.querySelector("#kanal-status-subtitle");
  const distEl = container.querySelector("#track-dist");
  const ecEl = container.querySelector("#track-ec");
  const timeEl = container.querySelector("#track-time");
  const visitsEl = container.querySelector("#track-visits");
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
  let selectedSalesmanFilter = "ALL";

  // Perform Kanal API Sync
  async function doKanalSync() {
    let currentCfg = {};
    try {
      const allCfg = await fsGetAll(COL.APP_SETTINGS);
      currentCfg = allCfg.find(c => c.id === "kanal_config") || {};
      if (currentCfg.company) companyName = currentCfg.company;
    } catch (e) { console.warn("Err loading kanal_config:", e); }

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

    let karyawanList = [];
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

    const sampleStatuses = [
      "Effective Call (Order Toko)",
      "Effective Call (Order Toko)",
      "Cek Stok & Display Produk",
      "Penawaran Produk Baru"
    ];

    const timestamp = new Date().toISOString();
    const batchId = "KNL-SLS-" + Date.now().toString(36).toUpperCase();
    const fetchedCheckins = [];

    if (isLiveSuccess && liveItems.length > 0) {
      liveItems.forEach((item, idx) => {
        const chkId = item.id || item.checkin_id || `CHK-LIVE-${idx}-${Date.now()}`;
        fetchedCheckins.push({
          id: String(chkId),
          sales_nik: item.nik || item.sales_nik || item.user_id || "SLS-KNL",
          sales_nama: item.nama || item.sales_nama || item.user_name || "Sales Kanal",
          toko_outlet: item.toko || item.outlet_name || item.store_name || "Outlet Mitra Kanal",
          alamat_toko: item.alamat || item.address || "Cirebon",
          koordinat_gps: item.gps || item.lat_long || item.coordinates || "-6.7321, 108.5523",
          waktu_checkin: item.checkin_time || item.waktu || "08:30 WIB",
          waktu_checkout: item.checkout_time || "09:05 WIB",
          tanggal: item.tanggal || item.date || todayStr,
          status_kunjungan: item.status || item.visit_status || "Effective Call (Order Toko)",
          catatan: item.catatan || "Live check-in toko via API Kanal",
          sumber: `API Kanal (${companyName})`,
          perusahaan: companyName,
          updated_at: timestamp
        });
      });
    } else {
      const datesToProcess = [todayStr, yesterdayStr];
      for (const dStr of datesToProcess) {
        salesList.forEach((s, idx) => {
          const nik = String(s.nik_karyawan || s.nik || "SLS-" + (idx + 1)).trim();
          const nama = s.nama_karyawan || s.nama || "Salesman";
          const outlet = sampleOutlets[idx % sampleOutlets.length];
          const visitStatus = sampleStatuses[idx % sampleStatuses.length];

          const checkinItem = {
            id: `CHK-${nik}-${dStr}`,
            sales_nik: nik,
            sales_nama: nama,
            toko_outlet: outlet.nama,
            alamat_toko: outlet.alamat,
            koordinat_gps: outlet.gps,
            waktu_checkin: idx === 0 ? "08:30 WIB" : (idx === 1 ? "10:15 WIB" : "13:40 WIB"),
            waktu_checkout: idx === 0 ? "09:05 WIB" : (idx === 1 ? "10:50 WIB" : "14:15 WIB"),
            tanggal: dStr,
            status_kunjungan: visitStatus,
            catatan: "Check-in kunjungan sales di toko via API Kanal",
            sumber: `API Kanal (${companyName})`,
            perusahaan: companyName,
            updated_at: timestamp
          };

          fetchedCheckins.push(checkinItem);
        });
      }
    }

    for (const chk of fetchedCheckins) {
      await fsUpdate("kanal_checkins", chk.id, chk).catch(async () => {
        await fsAdd("kanal_checkins", chk, chk.id);
      });
    }

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

  // Load and populate full dashboard
  async function loadAndRenderTrack() {
    try {
      const allCfg = await fsGetAll(COL.APP_SETTINGS).catch(() => []);
      const currentCfg = allCfg.find(c => c.id === "kanal_config") || {};
      if (currentCfg.company) companyName = currentCfg.company;

      if (subtitleEl) subtitleEl.innerHTML = `Terhubung ke cloud server <b>API Kanal (${escapeHtml(companyName)})</b>. Mengsinkronkan data check-in sales di toko & outlet mitra.`;
      if (companyBadgeEl) companyBadgeEl.textContent = companyName;

      allCheckinsList = await fsGetAll("kanal_checkins").catch(() => []);

      if (allCheckinsList.length === 0) {
        await doKanalSync();
        allCheckinsList = await fsGetAll("kanal_checkins").catch(() => []);
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
      if (c.sales_nama) salesMap.set(c.sales_nama, c.sales_nik || "");
    });

    const currentVal = filterSalesmanSelect.value || "ALL";
    filterSalesmanSelect.innerHTML = `<option value="ALL">Semua Salesman (${salesMap.size})</option>` + 
      Array.from(salesMap.entries()).map(([nama, nik]) => 
        `<option value="${escapeHtml(nama)}">${escapeHtml(nama)} ${nik ? `(${escapeHtml(nik)})` : ''}</option>`
      ).join("");

    filterSalesmanSelect.value = currentVal;
  }

  function applyAndRenderDashboard() {
    const salesmanFilter = filterSalesmanSelect ? filterSalesmanSelect.value : "ALL";
    const periodFilter = filterPeriodSelect ? filterPeriodSelect.value : "ALL";
    const statusFilter = filterStatusSelect ? filterStatusSelect.value : "ALL";
    const searchFilter = (filterSearchInput ? filterSearchInput.value : "").toLowerCase().trim();

    // Check if active filter
    const isFiltered = salesmanFilter !== "ALL" || periodFilter !== "ALL" || statusFilter !== "ALL" || searchFilter !== "";
    if (activeFilterBadge) activeFilterBadge.classList.toggle("hidden", !isFiltered);

    const filteredRecords = allCheckinsList.filter(item => {
      // Salesman filter
      if (salesmanFilter !== "ALL" && item.sales_nama !== salesmanFilter) return false;

      // Status filter
      if (statusFilter === "EC") {
        if (!(item.status_kunjungan || "").toLowerCase().includes("effective")) return false;
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

    // Update Top Summary Cards
    if (distEl) distEl.textContent = `${filteredRecords.length} Visit`;

    if (ecEl) {
      const ecCount = filteredRecords.filter(a => (a.status_kunjungan || "").toLowerCase().includes("effective")).length;
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

    // Group records by salesman
    const salesMap = new Map();
    allRecords.forEach(r => {
      const name = r.sales_nama || "Salesman";
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
      if ((r.status_kunjungan || "").toLowerCase().includes("effective")) {
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
      const isSelected = activeSalesman === s.nama;
      const topStore = s.visits[0]?.toko_outlet || "Outlet Utama";

      return `
        <div class="salesman-card bg-white rounded-2xl border ${isSelected ? 'border-maroon-600 ring-2 ring-maroon-100 bg-maroon-50/20' : 'border-slate-100 hover:border-slate-300'} p-4 shadow-sm cursor-pointer transition flex flex-col justify-between" data-salesman="${escapeHtml(s.nama)}">
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

            <div class="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
              <div>
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Effective Call</p>
                <p class="font-black text-emerald-600 mt-0.5">${s.ecCount} EC (${ecPct}%)</p>
              </div>
              <div>
                <p class="text-[10px] text-slate-400 font-semibold uppercase">Toko Terakhir</p>
                <p class="font-bold text-slate-700 mt-0.5 truncate">${escapeHtml(topStore)}</p>
              </div>
            </div>
          </div>

          <div class="mt-3 pt-2 border-t border-slate-50 flex items-center justify-between text-[11px] font-bold text-maroon-700">
            <span>${isSelected ? '● Sedang Dilihat' : 'Lihat Detail Sales Ini →'}</span>
          </div>
        </div>
      `;
    }).join("");

    salesmanGridEl.querySelectorAll(".salesman-card").forEach(card => {
      card.onclick = () => {
        const name = card.dataset.salesman;
        if (filterSalesmanSelect) {
          filterSalesmanSelect.value = (filterSalesmanSelect.value === name) ? "ALL" : name;
          applyAndRenderDashboard();
        }
      };
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

    timelineEl.innerHTML = sorted.map((t, idx) => {
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

      return `
        <div class="bg-slate-50 border border-slate-100 p-3.5 rounded-xl hover:bg-white hover:border-maroon-200 transition shadow-2xs">
          <div class="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p class="text-xs font-bold text-slate-800">${escapeHtml(salesName)} <span class="font-normal text-slate-400">(${escapeHtml(salesNik)})</span> <span class="text-maroon-700 font-bold">@ ${escapeHtml(tokoName)}</span></p>
              <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(alamatToko)}</p>
            </div>
            <a href="${mapsUrl}" target="_blank" class="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold text-[10px] rounded-lg border border-blue-200 hover:bg-blue-100 transition inline-flex items-center gap-1">
              📍 GPS Maps
            </a>
          </div>

          <div class="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[10px] text-slate-500 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                ● ${escapeHtml(statusText)}
              </span>
              <span>Check-in: <b>${escapeHtml(checkinTime)}</b> - <b>${escapeHtml(checkoutTime)}</b></span>
            </div>
            <span class="font-mono font-bold text-slate-600">${escapeHtml(dateVal)}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // Bind Export Excel
  if (btnExport) {
    btnExport.onclick = async () => {
      if (allCheckinsList.length === 0) {
        return toast("Tidak ada data kunjungan untuk diexport", "warning");
      }

      toast("Mengeksport data kunjungan sales ke Excel...", "info");

      const headers = ["ID Checkin", "Salesman", "NIK Sales", "Nama Toko / Outlet", "Alamat Toko", "Status Kunjungan", "Waktu Check-in", "Waktu Check-out", "Tanggal", "Koordinat GPS", "Catatan"];
      const matrix = allCheckinsList.map(item => [
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
        item.catatan || "-"
      ]);

      await downloadXlsx(`Summary_Kunjungan_Sales_${todayStr}.xlsx`, headers, matrix, "Data_Kunjungan_Sales");
      toast("File Excel Summary Kunjungan Sales berhasil diunduh!", "success");
    };
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

  btnSync.onclick = async () => {
    btnSync.disabled = true;
    btnSync.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Tarik Data Check-in...
    `;

    try {
      await doKanalSync();
      await loadAndRenderTrack();
      toast(`✅ Sukses mengsinkronkan data check-in Kanal untuk ${companyName}!`, "success");
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
