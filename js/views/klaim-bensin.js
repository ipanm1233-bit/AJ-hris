import { COL } from "../firebase-config.js";
import { fsAdd, genId, toast, sendEmailNotif } from "../utils.js";

export async function mount(container, { session }) {
  const tbody = container.querySelector("#kb-tbody");
  const grandTotalEl = container.querySelector("#kb-grand-total");
  const addRowBtn = container.querySelector("#kb-add-row"); // Deklarasi tombol tambah baris

  // Konfigurasi Harga Bensin & Rasio KM
  const HARGA_BENSIN = 10000;
  const RASIO_KM = 25;
  let rowCount = 0;

  function addRow() {
    rowCount++;
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-50";
    tr.innerHTML = `
      <td class="p-2"><input type="date" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-sm" data-field="tanggal" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-sm" data-field="km_awal" value="0" min="0" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-sm" data-field="km_akhir" value="0" min="0" required></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-sm" data-field="parkir" value="0" min="0"></td>
      <td class="p-2"><input type="number" class="kb-input w-full p-2 border border-slate-200 rounded outline-none focus:border-maroon-400 text-sm" data-field="denda" value="0" min="0"></td>
      <td class="p-2 text-right"><span class="kb-row-total font-semibold text-slate-700 text-sm">0</span></td>
      <td class="p-2 text-center">
        <button type="button" class="kb-delete text-slate-300 hover:text-red-600 transition">✖</button>
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

  // PERBAIKAN: Hubungkan tombol di layar dengan fungsi addRow()
  if (addRowBtn) {
    addRowBtn.addEventListener("click", addRow);
  }

  function calculateTotal() {
    let grandTotal = 0;
    
    tbody.querySelectorAll("tr").forEach(tr => {
      const getValue = (field) => parseFloat(tr.querySelector(`[data-field="${field}"]`).value) || 0;
      
      const kmAwal = Math.max(0, getValue("km_awal"));
      const kmAkhir = Math.max(0, getValue("km_akhir"));
      const parkir = Math.max(0, getValue("parkir"));
      const denda = Math.max(0, getValue("denda"));
      
      let trip = kmAkhir - kmAwal;
      if (trip < 0) trip = 0; // Mencegah minus jika salah ketik
      
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

    // Validasi dasar
    let isValid = true;
    rows.forEach(tr => {
      if (!tr.querySelector(`[data-field="tanggal"]`).value) isValid = false;
    });
    if (!isValid) {
      toast("Pastikan semua tanggal pada baris tabel terisi", "warning");
      return;
    }
    
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
    
    const submitBtn = container.querySelector("#kb-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Mengirim...";
    
    const payload = {
      id: genId("TRX-KLAIM"),
      tgl: new Date().toISOString(),
      nik: session.nik || "-",
      nama_pemohon: session.nama,
      form_id: "F-KLAIM-BENSIN",
      nama_form: "Klaim Bensin Operasional",
      detail: {
        total_klaim: Math.round(totalKlaim),
        rincian_tabel: detailKlaim // Data multi-baris
      },
      // PERBAIKAN: Menetapkan Alur Baku (Atasan -> HRD -> Finance)
      approval_flow: ["ATASAN", "HRD", "FINANCE"],
      approval_steps: ["PENDING", "PENDING", "PENDING"],
      status_final: "MENUNGGU",
      catatan_penolakan: []
    };
    
    try {
      await fsAdd(COL.DATA_PENGAJUAN, payload, payload.id);
      toast("Klaim bensin berhasil diajukan", "success");

      // Trigger Notifikasi Email otomatis jika diperlukan
      if (typeof sendEmailNotif === 'function') {
        const htmlEmail = `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #7a1f2b;">Pengajuan Baru: ${payload.nama_form}</h2>
            <p><strong>Diajukan Oleh:</strong> ${payload.nama_pemohon}</p>
            <p><strong>Total Klaim:</strong> Rp ${Math.round(totalKlaim).toLocaleString("id-ID")}</p>
            <p>Pengajuan ini membutuhkan persetujuan Anda sebagai <strong>ATASAN</strong>.</p>
            <a href="https://andela-hris.netlify.app/#approval" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Buka Sistem HRIS</a>
          </div>
        `;
        // Catatan: Alamat email tujuan dapat disesuaikan 
        sendEmailNotif("atasan@perusahaan.com", `Persetujuan Dibutuhkan: ${payload.nama_form}`, htmlEmail).catch(e => console.warn(e));
      }
      
      // Reset form
      tbody.innerHTML = "";
      addRow();
      calculateTotal();
      
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
      
      window.location.hash = "#dashboard";
      
    } catch (e) {
      toast("Gagal mengajukan klaim: " + e.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
    }
  });

  // Inisialisasi 1 baris pertama saat dimuat
  addRow();

  return { unmount() {} };
}
