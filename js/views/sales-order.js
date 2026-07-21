import { db, collection, getDocs, addDoc } from "../firebase-config.js";
import { openModal, closeModal, toast, genId, escapeHtml, downloadHtmlAsPdf } from "../utils.js";
import { emptyState, skeletonRows } from "../components.js";

const COL_ORDERS = "sales_orders";
const COL_OUTLETS = "sales_outlets";
const COL_ITEMS = "sales_items";

// Default seeding of simple orders if empty
const DEFAULT_ORDERS = [
  { no_order: "SO-20260720-001", outlet_id: "OT-001", outlet_nama: "Supermarket Pamella 1", tanggal: "2026-07-20T10:00:00.000Z", salesperson: "Andika Putera", items: [{ sku: "SKU-GULA-01", nama: "Gula Pasir Andela Premium 1kg", harga: 16500, qty: 50, subtotal: 825000 }, { sku: "SKU-BERAS-01", nama: "Beras Mentari Wangi 5kg", harga: 78000, qty: 10, subtotal: 780000 }], total: 1605000 },
  { no_order: "SO-20260719-002", outlet_id: "OT-002", outlet_nama: "Mirota Kampus Godean", tanggal: "2026-07-19T14:30:00.000Z", salesperson: "Bambang Wijaya", items: [{ sku: "SKU-TEH-01", nama: "Teh Melati Wangi Khas Andela", harga: 6000, qty: 120, subtotal: 720000 }], total: 720000 }
];

export async function mount(container, { session }) {
  const tableBody = container.querySelector("#order-table-body");
  const emptyStateContainer = container.querySelector("#order-empty-state");
  const searchInput = container.querySelector("#search-order");
  const btnAddOrder = container.querySelector("#btn-add-order");

  // Stats Elements
  const statsValue = container.querySelector("#stats-order-value");
  const statsCount = container.querySelector("#stats-order-count");
  const statsAov = container.querySelector("#stats-order-aov");

  let ordersList = [];
  let outletsList = [];
  let itemsList = [];

  async function loadData() {
    tableBody.innerHTML = skeletonRows(5);
    emptyStateContainer.classList.add("hidden");

    try {
      // 1. Load Outlets and Items first (prerequisite)
      const outletSnap = await getDocs(collection(db, COL_OUTLETS));
      outletsList = outletSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const itemSnap = await getDocs(collection(db, COL_ITEMS));
      itemsList = itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. Load Orders
      const orderSnap = await getDocs(collection(db, COL_ORDERS));
      ordersList = orderSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (ordersList.length === 0) {
        for (const order of DEFAULT_ORDERS) {
          await addDoc(collection(db, COL_ORDERS), order);
        }
        const reloadSnap = await getDocs(collection(db, COL_ORDERS));
        ordersList = reloadSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      calculateStats();
      renderList();
    } catch (e) {
      console.error(e);
      tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-medium">Gagal memuat data penjualan: ${e.message}</td></tr>`;
    }
  }

  function calculateStats() {
    const totalCount = ordersList.length;
    const totalValue = ordersList.reduce((acc, o) => acc + (o.total || 0), 0);
    const aov = totalCount > 0 ? totalValue / totalCount : 0;

    statsValue.textContent = `Rp ${totalValue.toLocaleString("id-ID")}`;
    statsCount.textContent = `${totalCount} Order`;
    statsAov.textContent = `Rp ${Math.round(aov).toLocaleString("id-ID")}`;
  }

  function renderList() {
    const searchVal = searchInput.value.toLowerCase().trim();

    const filtered = ordersList.filter(o => {
      return (o.no_order || "").toLowerCase().includes(searchVal) ||
             (o.outlet_nama || "").toLowerCase().includes(searchVal) ||
             (o.salesperson || "").toLowerCase().includes(searchVal);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = "";
      emptyStateContainer.innerHTML = emptyState("Tidak ada order ditemukan", "Cari dengan kata kunci lain atau buat order penjualan baru.");
      emptyStateContainer.classList.remove("hidden");
      return;
    }

    emptyStateContainer.classList.add("hidden");
    tableBody.innerHTML = filtered.map(o => {
      const formattedDate = new Date(o.tanggal).toLocaleDateString("id-ID", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
      const itemCount = (o.items || []).reduce((acc, item) => acc + (item.qty || 0), 0);

      return `
        <tr class="hover:bg-slate-50/50 transition">
          <td class="px-6 py-4 font-mono font-semibold text-slate-700">${escapeHtml(o.no_order)}</td>
          <td class="px-6 py-4 font-medium text-slate-800">${escapeHtml(o.outlet_nama)}</td>
          <td class="px-6 py-4 text-xs text-slate-500">${formattedDate}</td>
          <td class="px-6 py-4 text-xs font-semibold text-slate-600">${escapeHtml(o.salesperson || "-")}</td>
          <td class="px-6 py-4 font-mono text-xs text-slate-500">${itemCount} item</td>
          <td class="px-6 py-4 font-mono font-bold text-slate-800">Rp ${Number(o.total || 0).toLocaleString("id-ID")}</td>
          <td class="px-6 py-4 text-right flex gap-3 justify-end">
            <button data-id="${o.id}" class="btn-pdf text-maroon-700 hover:text-maroon-900 font-semibold text-xs flex items-center gap-1 transition">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF Invoice
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tableBody.querySelectorAll(".btn-pdf").forEach(btn => {
      btn.addEventListener("click", () => {
        const order = ordersList.find(x => x.id === btn.dataset.id);
        if (order) generateInvoicePdf(order);
      });
    });
  }

  async function generateInvoicePdf(order) {
    const itemsHtml = (order.items || []).map((it, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 8px; text-align: center; font-size: 11px; color: #64748b;">${idx + 1}</td>
        <td style="padding: 10px 8px; font-size: 12px; color: #334155;"><b>[${escapeHtml(it.sku)}]</b> ${escapeHtml(it.nama)}</td>
        <td style="padding: 10px 8px; text-align: right; font-size: 12px; color: #334155;">Rp ${Number(it.harga).toLocaleString("id-ID")}</td>
        <td style="padding: 10px 8px; text-align: center; font-size: 12px; color: #334155;">${it.qty}</td>
        <td style="padding: 10px 8px; text-align: right; font-size: 12px; font-weight: bold; color: #1e293b;">Rp ${Number(it.subtotal).toLocaleString("id-ID")}</td>
      </tr>
    `).join("");

    const invoiceHtml = `
      <div style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; padding: 10px;">
        <!-- HEADER COMPANY -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <tr>
            <td style="vertical-align: top;">
              <h2 style="color: #7a1f2b; margin: 0; font-size: 22px; letter-spacing: 0.5px;"><b>CV ANDELA JAYA</b></h2>
              <p style="margin: 4px 0 0; font-size: 11px; color: #64748b; line-height: 1.4;">
                Distribusi & Kemitraan Sembako Nasional<br>
                Yogyakarta, Indonesia<br>
                Telp: (0274) 555-8888 | Email: sales@andelajaya.com
              </p>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <h1 style="margin: 0; color: #1e293b; font-size: 24px; font-weight: 800;">INVOICE</h1>
              <p style="margin: 4px 0 0; font-family: monospace; font-size: 13px; font-weight: bold; color: #7a1f2b;">${order.no_order}</p>
            </td>
          </tr>
        </table>

        <!-- DETAILS INFO -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <tr>
            <td style="padding: 15px; width: 50%; vertical-align: top; border-right: 1px solid #e2e8f0;">
              <span style="font-size: 10px; text-transform: uppercase; font-weight: bold; color: #94a3b8; display: block; margin-bottom: 5px;">DITAGIHKAN KEPADA:</span>
              <b style="font-size: 14px; color: #1e293b;">${escapeHtml(order.outlet_nama)}</b><br>
              <p style="margin: 5px 0 0; color: #475569; line-height: 1.4; font-size: 11px;">
                Mitra Outlet Resmi CV Andela Jaya
              </p>
            </td>
            <td style="padding: 15px; width: 50%; vertical-align: top;">
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.6;">
                <tr>
                  <td style="color: #64748b; font-weight: bold;">Tanggal Terbit</td>
                  <td style="text-align: right; color: #334155;">${new Date(order.tanggal).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: bold;">Metode Pembayaran</td>
                  <td style="text-align: right; color: #334155;">COD / Transfer Bank</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: bold;">Salesperson</td>
                  <td style="text-align: right; color: #7a1f2b; font-weight: bold;">${escapeHtml(order.salesperson)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- LINE ITEMS -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #7a1f2b; color: #ffffff;">
              <th style="padding: 10px; width: 6%; text-align: center; font-size: 11px; font-weight: bold;">NO</th>
              <th style="padding: 10px; text-align: left; font-size: 11px; font-weight: bold;">DESKRIPSI PRODUK</th>
              <th style="padding: 10px; width: 18%; text-align: right; font-size: 11px; font-weight: bold;">HARGA SATUAN</th>
              <th style="padding: 10px; width: 10%; text-align: center; font-size: 11px; font-weight: bold;">QTY</th>
              <th style="padding: 10px; width: 22%; text-align: right; font-size: 11px; font-weight: bold;">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="border: none;"></td>
              <td style="padding: 15px 10px 10px; text-align: right; font-size: 12px; font-weight: bold; color: #64748b;">Grand Total:</td>
              <td style="padding: 15px 10px 10px; text-align: right; font-size: 16px; font-weight: 900; color: #7a1f2b; border-bottom: 2px double #7a1f2b;">
                Rp ${Number(order.total).toLocaleString("id-ID")}
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- SIGNATURE AREA -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 40px; font-size: 11px;">
          <tr>
            <td style="width: 50%; text-align: center; vertical-align: top;">
              <p style="margin: 0; color: #64748b;">Hormat Kami,</p>
              <b style="color: #1e293b; display: block; margin-top: 60px;">CV ANDELA JAYA</b>
              <span style="color: #94a3b8; font-size: 9px; display: block; margin-top: 2px;">(Bagian Penjualan & Sales)</span>
            </td>
            <td style="width: 50%; text-align: center; vertical-align: top;">
              <p style="margin: 0; color: #64748b;">Penerima / Outlet,</p>
              <b style="color: #1e293b; display: block; margin-top: 60px;">${escapeHtml(order.outlet_nama)}</b>
              <span style="color: #94a3b8; font-size: 9px; display: block; margin-top: 2px;">(Tanda Tangan & Cap Outlet)</span>
            </td>
          </tr>
        </table>

        <!-- FOOTER MEMO -->
        <div style="margin-top: 60px; padding-top: 15px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 10px; color: #94a3b8;">
          Terima kasih atas kemitraan dan kepercayaan Anda kepada CV Andela Jaya.
        </div>
      </div>
    `;

    toast("Sedang mengunduh berkas invoice PDF...", "info");
    await downloadHtmlAsPdf(invoiceHtml, `Invoice-${order.no_order}.pdf`);
    toast("Unduhan selesai!", "success");
  }

  btnAddOrder.onclick = () => {
    if (outletsList.length === 0 || itemsList.length === 0) {
      toast("Pastikan Master Outlet & Master Item sudah memiliki data sebelum membuat order!", "warning");
      return;
    }

    openModal({
      title: "Buat Order Penjualan Baru",
      size: "lg",
      bodyHtml: `
        <form id="form-order-new" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Pilih Outlet Mitra</label>
              <select id="sel-outlet" required class="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none bg-white transition">
                <option value="">-- Pilih Outlet --</option>
                ${outletsList.map(o => `<option value="${o.id}">${escapeHtml(o.nama)} (${o.wilayah})</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">Salesperson</label>
              <input type="text" readonly value="${escapeHtml(session.nama)}" class="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-medium">
            </div>
          </div>

          <div class="border-t border-slate-100 pt-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wide">Daftar Item Belanja</h4>
              <button type="button" id="btn-add-item-row" class="inline-flex items-center gap-1.5 text-xs text-maroon-700 font-bold hover:text-maroon-900 transition">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Tambah Baris Item
              </button>
            </div>

            <!-- DYNAMIC ROWS -->
            <div id="item-rows-container" class="space-y-3">
              <!-- JS appends rows here -->
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <div class="w-full flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
          <span class="text-sm font-bold text-slate-600">Total Belanja:</span>
          <span id="order-live-total" class="text-xl font-black text-maroon-700">Rp 0</span>
        </div>
        <div class="flex gap-2 justify-end">
          <button id="btn-cancel-order" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition">Batal</button>
          <button id="btn-save-order" class="bg-maroon-700 hover:bg-maroon-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition shadow-md">Simpan & Terbitkan</button>
        </div>
      `,
      onMount: (m) => {
        const containerRows = m.querySelector("#item-rows-container");
        const liveTotalEl = m.querySelector("#order-live-total");

        function calculateLiveTotal() {
          let grandTotal = 0;
          containerRows.querySelectorAll(".item-row").forEach(row => {
            const qty = Number(row.querySelector(".row-qty").value) || 0;
            const price = Number(row.querySelector(".row-price").value) || 0;
            const subtotal = qty * price;
            row.querySelector(".row-subtotal").textContent = `Rp ${subtotal.toLocaleString("id-ID")}`;
            grandTotal += subtotal;
          });
          liveTotalEl.textContent = `Rp ${grandTotal.toLocaleString("id-ID")}`;
        }

        function createItemRow() {
          const rowId = genId("ROW");
          const div = document.createElement("div");
          div.id = rowId;
          div.className = "item-row grid grid-cols-12 gap-3 items-center bg-slate-50/50 p-3 rounded-xl border border-slate-100";
          div.innerHTML = `
            <div class="col-span-5">
              <select required class="row-select w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none bg-white focus:border-maroon-400">
                <option value="">-- Pilih Barang --</option>
                ${itemsList.map(it => `<option value="${it.id}" data-price="${it.harga}" data-sku="${it.sku}">${escapeHtml(it.nama)}</option>`).join("")}
              </select>
            </div>
            <div class="col-span-2">
              <input type="number" required min="1" value="1" class="row-qty w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none text-center focus:border-maroon-400 font-mono">
            </div>
            <div class="col-span-2">
              <input type="number" readonly class="row-price w-full px-2 py-2 text-sm rounded-lg border border-slate-100 bg-slate-100 text-slate-500 font-mono text-right" placeholder="0">
            </div>
            <div class="col-span-2 text-right font-mono font-bold text-slate-800 text-xs row-subtotal">
              Rp 0
            </div>
            <div class="col-span-1 text-center">
              <button type="button" class="btn-delete-row text-rose-500 hover:text-rose-700 transition">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          `;

          const rowSelect = div.querySelector(".row-select");
          const rowPrice = div.querySelector(".row-price");
          const rowQty = div.querySelector(".row-qty");
          const btnDelete = div.querySelector(".btn-delete-row");

          rowSelect.onchange = (e) => {
            const opt = e.target.selectedOptions[0];
            const price = opt ? Number(opt.dataset.price) || 0 : 0;
            rowPrice.value = price;
            calculateLiveTotal();
          };

          rowQty.oninput = calculateLiveTotal;

          btnDelete.onclick = () => {
            div.remove();
            calculateLiveTotal();
          };

          containerRows.appendChild(div);
        }

        // Add initial row
        createItemRow();

        m.querySelector("#btn-add-item-row").onclick = createItemRow;
        m.querySelector("#btn-cancel-order").onclick = closeModal;

        m.querySelector("#btn-save-order").onclick = async () => {
          const form = m.querySelector("#form-order-new");
          if (!form.reportValidity()) return;

          const selectedOutletId = m.querySelector("#sel-outlet").value;
          const outlet = outletsList.find(x => x.id === selectedOutletId);

          // Build line items
          const rows = containerRows.querySelectorAll(".item-row");
          const itemsPayload = [];
          let totalGrand = 0;

          for (const r of rows) {
            const sel = r.querySelector(".row-select");
            const qty = Number(r.querySelector(".row-qty").value) || 0;
            const price = Number(r.querySelector(".row-price").value) || 0;

            if (!sel.value) continue;

            const opt = sel.selectedOptions[0];
            const sku = opt.dataset.sku;
            const nama = opt.text;
            const sub = qty * price;

            itemsPayload.push({
              sku,
              nama,
              harga: price,
              qty,
              subtotal: sub
            });

            totalGrand += sub;
          }

          if (itemsPayload.length === 0) {
            toast("Harap pilih minimal satu barang!", "warning");
            return;
          }

          const btnSave = m.querySelector("#btn-save-order");
          btnSave.disabled = true;
          btnSave.innerHTML = "Menyimpan...";

          try {
            const dateNow = new Date();
            const year = dateNow.getFullYear();
            const month = String(dateNow.getMonth() + 1).padStart(2, '0');
            const day = String(dateNow.getDate()).padStart(2, '0');
            const dateStr = `${year}${month}${day}`;

            const orderNo = `SO-${dateStr}-${String(ordersList.length + 1).padStart(3, '0')}`;

            const payload = {
              no_order: orderNo,
              outlet_id: outlet.id,
              outlet_nama: outlet.nama,
              tanggal: dateNow.toISOString(),
              salesperson: session.nama,
              items: itemsPayload,
              total: totalGrand
            };

            await addDoc(collection(db, COL_ORDERS), payload);
            toast("Order penjualan berhasil diterbitkan!", "success");
            closeModal();
            
            // Reload and ask for instant PDF download
            await loadData();

            // Ask user
            const newestOrder = ordersList.find(x => x.no_order === orderNo);
            if (newestOrder) {
              generateInvoicePdf(newestOrder);
            }

          } catch (err) {
            toast(`Gagal menyimpan order: ${err.message}`, "error");
            btnSave.disabled = false;
            btnSave.innerHTML = "Simpan & Terbitkan";
          }
        };
      }
    });
  };

  searchInput.addEventListener("input", renderList);

  await loadData();
  return { unmount() {} };
}
