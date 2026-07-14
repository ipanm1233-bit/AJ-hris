import { db, COL, doc, getDoc, setDoc, collection, getDocs, writeBatch, query, where } from "../firebase-config.js";
import { toast, genId, escapeHtml } from "../utils.js";

export async function mount(container, { session }) {
  const tBody = container.querySelector("#cfg-jadwal-tbody");
  
  // Referensi Dokumen Konfigurasi Global
  const docRef = doc(db, COL.APP_SETTINGS, "main");
  let cfg = { jadwal: [], tarif: {} };

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

      renderJadwal();
    } catch(e) { console.error(e); }
  }

  function renderJadwal() {
    if (!cfg.jadwal) cfg.jadwal = [];
    tBody.innerHTML = cfg.jadwal.map((j, i) => `
      <tr class="border-b border-slate-50">
        <td class="py-2 pr-2"><input type="text" class="j-jabatan w-full border rounded px-2 py-1 outline-none text-xs" value="${escapeHtml(j.jabatan)}" placeholder="SEMUA JABATAN"></td>
        <td class="py-2 pr-2"><input type="text" class="j-hari w-full border rounded px-2 py-1 outline-none text-xs" value="${escapeHtml(j.hari)}" placeholder="Senin - Jumat"></td>
        <td class="py-2 pr-2"><input type="time" class="j-masuk w-full border rounded px-2 py-1 outline-none text-xs" value="${j.masuk}"></td>
        <td class="py-2 pr-2"><input type="time" class="j-pulang w-full border rounded px-2 py-1 outline-none text-xs" value="${j.pulang}"></td>
        <td class="py-2 text-center"><button type="button" data-del="${i}" class="text-red-500 hover:text-red-700">✖</button></td>
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

    try {
      await setDoc(docRef, { jadwal: jadwalBaru, tarif: tarifBaru }, { merge: true });
      toast("Konfigurasi Sistem Berhasil Disimpan!", "success");
    } catch(e) { toast("Gagal menyimpan: " + e.message, "error"); }
    btn.disabled = false; btn.textContent = "💾 Simpan Semua Konfigurasi";
  };

  // EKSEKUTOR CUTI BERSAMA
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

        // Gunakan WriteBatch agar proses massal aman dan tidak putus di tengah jalan
        const chunkedDocs = [];
        let tempArr = [];
        snapK.docs.forEach(doc => {
           tempArr.push(doc);
           if(tempArr.length === 450) { chunkedDocs.push(tempArr); tempArr = []; } // Max batch firestore is 500
        });
        if(tempArr.length > 0) chunkedDocs.push(tempArr);

        for (const chunk of chunkedDocs) {
           const batch = writeBatch(db);
           chunk.forEach(kDoc => {
               const kData = kDoc.data();
               // 1. Catat ke Log Cuti
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
     btn.disabled = false; btn.textContent = "⚡ EKSEKUSI MASSAL";
  };

  await loadConfig();
  return { unmount() {} };
}
