import { COL } from "../firebase-config.js";
import { fsAdd, genId, toast, sendEmailNotif, getEmailsForRole } from "../utils.js";

export async function mount(container, { session }) {
  const tbody = container.querySelector("#kb-tbody");
  const grandTotalEl = container.querySelector("#kb-grand-total");
  const addRowBtn = container.querySelector("#kb-add-row");

  // Konfigurasi Harga Bensin & Rasio KM (Dapat disesuaikan)
  const HARGA_BENSIN = 10000;
  const RASIO_KM = 25;
  let rowCount = 0;

  // Fungsi untuk menambah baris tabel secara dinamis
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
        <button type="button" class="kb-delete text-slate-300 hover:text-red-600 transition" title="Hapus baris ini">✖</button>
      </td>
    `;
    
    // Memicu kalkulasi per baris saat ada input yang diketik
    tr.querySelectorAll(".kb-input").forEach(input => {
      input.addEventListener("input", calculateTotal);
    });
    
    // Fungsi hapus baris
    tr.querySelector(".kb-delete").addEventListener("click", () => {
      tr.remove();
      calculateTotal();
    });
    
    tbody.appendChild(tr);
  }

  // Hubungkan tombol di layar dengan fungsi addRow()
  if (addRowBtn) {
    addRowBtn.addEventListener("click", addRow);
  }

  // Fungsi Kalkulasi Total (Dipanggil otomatis saat ada perubahan input)
  function calculateTotal() {
    let grandTotal = 0;
    
    tbody.querySelectorAll("tr").forEach(tr => {
      const getValue = (field) => parseFloat(tr.querySelector(`[data-field="${field}"]`).value) || 0;
      
      const kmAwal = Math.max(0, getValue("km_awal"));
      const kmAkhir = Math.max(0, getValue("km_akhir"));
      const parkir = Math.max(0, getValue("parkir"));
      const denda = Math.max(0, getValue("denda"));
      
      let trip = kmAkhir - kmAwal;
      if (trip < 0) trip = 0; // Mencegah minus jika salah ketik KM Awal > KM Akhir
      
      const totalPetrol = trip * (HARGA_BENSIN / RASIO_KM);
      const rowTotal = totalPetrol + parkir + denda;
      
      tr.querySelector(".kb-row-total").textContent = Math.round(rowTotal).toLocaleString("id-ID");
      grandTotal += rowTotal;
    });
    
    grandTotalEl.textContent = `Rp ${Math.round(grandTotal).toLocaleString("id-ID")}`;
  }

  // Aksi saat tombol Submit Klaim diklik
  container.querySelector("#kb-submit").addEventListener("click", async () => {
    const rows = tbody.querySelectorAll("tr");
    
    // Validasi kosong
    if (rows.length === 0) {
      toast("Tambahkan minimal 1 baris perjalanan", "warning");
      return;
    }

    // Validasi input tanggal wajib diisi
    let isValid = true;
    rows.forEach(tr => {
      if (!tr.querySelector(`[data-field="tanggal"]`).value) isValid = false;
    });
    if (!isValid) {
      toast("Pastikan semua kolom tanggal telah terisi", "warning");
      return;
    }
    
    const detailKlaim = [];
    let totalKlaim = 0;
    
    // Mengumpulkan dan mengemas data baris-per-baris
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
    
    // Menyiapkan Payload untuk dikirim ke Firestore
    const payload = {
      id: genId("TRX-KLAIM"),
      tgl: new Date().toISOString(),
      nik: session.nik || "-",
      nama_pemohon: session.nama,
      form_id: "F-KLAIM-BENSIN",
      nama_form: "Klaim Bensin Operasional",
      detail: {
        total_klaim: Math.round(totalKlaim),
        rincian_tabel: detailKlaim // Data multi-baris berupa Array of Objects
      },
      // ALUR PERSETUJUAN KLAIM BENSIN (Hardcoded)
      approval_flow: ["ATASAN", "HRD", "FINANCE"],
      approval_steps: ["PENDING", "PENDING", "PENDING"],
      status_final: "MENUNGGU",
      catatan_penolakan: []
    };
    
    try {
      // 1. Simpan ke Database Firebase
      await fsAdd(COL.DATA_PENGAJUAN, payload, payload.id);
      toast("Klaim bensin berhasil diajukan", "success");

      // 2. Kirim Notifikasi Email ke Approver Pertama (ATASAN)
      if (typeof sendEmailNotif === 'function') {
        try {
          const targetEmails = await getEmailsForRole("ATASAN", payload.nama_pemohon);
          
          if (targetEmails.length > 0) {
              const htmlEmail = `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <h2 style="color: #7a1f2b;">Pengajuan Baru: ${payload.nama_form}</h2>
                  <p><strong>Diajukan Oleh:</strong> ${payload.nama_pemohon}</p>
                  <p><strong>Total Klaim:</strong> Rp ${Math.round(totalKlaim).toLocaleString("id-ID")}</p>
                  <p>Pengajuan ini membutuhkan persetujuan Anda sebagai <strong>ATASAN</strong>.</p>
                  <a href="https://andela-hris.netlify.app/#approval" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7a1f2b; color:#fff; text-decoration:none; border-radius:5px;">Masuk ke Antrean Persetujuan</a>
                </div>
              `;
              
              // Jika atasan memiliki beberapa email atau sistem menemukan lebih dari satu email atasan, kirim ke semuanya
              targetEmails.forEach(email => {
                 sendEmailNotif(email, `Persetujuan Dibutuhkan: ${payload.nama_form}`, htmlEmail).catch(e => console.warn("Email warning:", e));
              });
          }
        } catch (emailErr) {
          console.warn("Gagal meresolve email atasan:", emailErr);
        }
      }
      
      // 3. Reset form tabel untuk isian berikutnya
      tbody.innerHTML = "";
      addRow();
      calculateTotal();
      
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
      
      // 4. Kembali ke halaman dashboard
      window.location.hash = "#dashboard";
      
    } catch (e) {
      toast("Gagal mengajukan klaim: " + e.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajukan Klaim";
    }
  });

  // Inisialisasi 1 baris pertama saat halaman dimuat
  addRow();

  return { unmount() {} };
}
