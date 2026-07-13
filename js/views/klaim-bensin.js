import { COL } from "../firebase-config.js";
import { fsAdd, genId, toast } from "../utils.js";

export async function mount(container, { session }) {
  const tbody = container.querySelector("#kb-tbody");
  const grandTotalEl = container.querySelector("#kb-grand-total");
  
  // Konfigurasi Harga Bensin & Rasio KM (Bisa disesuaikan HRD nanti)
  const HARGA_BENSIN = 10000;
  const RASIO_KM = 25;

  let rowCount = 0;

  function addRow() {
    rowCount++;
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-50";
    tr.innerHTML = `
      <td class="p-2"><input type="date" class="kb-input w-full p-2 border rounded" data-field="tanggal" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border rounded" data-field="km_awal" value="0" min="0" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border rounded" data-field="km_akhir" value="0" min="0" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border rounded" data-field="parkir" value="0" min="0"></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border rounded" data-field="denda" value="0" min="0"></td>
      <td class="p-2 text-right"><span class="kb-row-total font-semibold text-slate-700">0</span></td>
      <td class="p-2 text-center">
        <button type="button" class="kb-delete text-red-500 hover:text-red-700">✖</button>
      </td>
    `;
    
    // Kalkulasi per baris saat diketik
    tr.querySelectorAll(".kb-input").forEach(input => {
      input.addEventListener("input", calculateTotal);
    });
    
    // Hapus baris
    tr.querySelector(".kb-delete").addEventListener("click", () => {
      tr.remove();
      calculateTotal();
    });
    
    tbody.appendChild(tr);
  }

  function calculateTotal() {
    let grandTotal = 0;
    
    tbody.querySelectorAll("tr").forEach(tr => {
      const getValue = (field) => parseFloat(tr.querySelector(`[data-field="${field}"]`).value) || 0;
      
      const kmAwal = Math.max(0, getValue("km_awal"));
      const kmAkhir = Math.max(0, getValue("km_akhir"));
      const parkir = Math.max(0, getValue("parkir"));
      const denda = Math.max(0, getValue("denda"));
      
      // Rumus Petrol: Total Trip * (Harga Bensin / Rasio KM)
      let trip = kmAkhir - kmAwal;
      if (trip < 0) trip = 0; // Mencegah hasil minus jika KM Awal > KM Akhir salah ketik
      
      const totalPetrol = trip * (HARGA_BENSIN / RASIO_KM);
      const rowTotal = totalPetrol + parkir + denda;
      
      tr.querySelector(".kb-row-total").textContent = Math.round(rowTotal).toLocaleString("id-ID");
      grandTotal += rowTotal;
    });
    
    grandTotalEl.textContent = `Rp ${Math.round(grandTotal).toLocaleString("id-ID")}`;
  }

  // Submit Klaim
  container.querySelector("#kb-submit").addEventListener("click", async () => {
    const rows = tbody.querySelectorAll("tr");
    if (rows.length === 0) {
      toast("Tambahkan minimal 1 baris perjalanan", "warning");
      return;
    }
    
    // Kumpulkan data dari tabel
    const detailKlaim = [];
    let totalKlaim = 0;
    
    rows.forEach(tr => {
      const getValue = (field) => parseFloat(tr.querySelector(`[data-field="${field}"]`).value) || 0;
      const tgl = tr.querySelector(`[data-field="tanggal"]`).value;
      
      const trip = Math.max(0, getValue("km_akhir") - getValue("km_awal"));
      const petrol = trip * (HARGA_BENSIN / RASIO_KM);
      const rowTotal = petrol + getValue("parkir") + getValue("denda");
      
      detailKlaim.push({
        tanggal: tgl,
        km_awal: getValue("km_awal"),
        km_akhir: getValue("km_akhir"),
        parkir: getValue("parkir"),
        denda: getValue("denda"),
        total_baris: Math.round(rowTotal)
      });
      
      totalKlaim += rowTotal;
    });
    
    // Matikan tombol saat memproses
    const submitBtn = container.querySelector("#kb-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Mengirim...";
    
    // Struktur payload mirip dengan form pengajuan ISO
    const payload = {
      id: genId("TRX-KLAIM"),
      tgl: new Date().toISOString(),
      nik: session.nik || "-",
      nama_pemohon: session.nama,
      form_id: "F-KLAIM-BENSIN",
      nama_form: "Klaim Bensin Operasional",
      detail: {
        total_klaim: Math.round(totalKlaim),
        rincian_tabel: detailKlaim 
      },
      approval_flow: ["ATASAN", "FINANCE"], // Alur bisa disesuaikan
      approval_steps: ["PENDING", "PENDING"],
      status_final: "MENUNGGU",
      catatan_penolakan: []
    };
    
    try {
      await fsAdd(COL.DATA_PENGAJUAN, payload, payload.id);
      toast("Klaim bensin berhasil diajukan", "success");
      
      // Reset form
      tbody.innerHTML = "";
      addRow();
      calculateTotal();
      
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
      
      // Kembali ke dashboard atau riwayat
      window.location.hash = "#dashboard";
      
    } catch (e) {
      toast("Gagal mengajukan klaim: " + e.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
    }
  });

  // Inisialisasi 1 baris pertama
  addRow();

  return { unmount() {} };
}
