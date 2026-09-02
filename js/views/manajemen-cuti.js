import { db, COL, doc, updateDoc } from "../firebase-config.js";
import { fsGetAll, toast, escapeHtml, smartParseDate, toNumber, getCalculatedJatahCuti, getCarryoverPercentage, calculateCarryoverJatah } from "../utils.js";
import { emptyState } from "../components.js";

export async function mount(container, { session }) {
 // Memastikan library pembaca Excel (SheetJS) ter-load dengan aman
 if (!window.XLSX) {
 const script = document.createElement('script');
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
 document.head.appendChild(script);
 }

 const tbody = container.querySelector("#cuti-tbody");
 const btnImport = container.querySelector("#btn-import-excel");
 const fileInput = container.querySelector("#excel-upload");
 const btnReset = container.querySelector("#btn-reset-tahunan");

 const userRole = (session?.role || "").toUpperCase();
 const isHrdRole = ["HRD", "SUPERADMIN", "ADMIN"].includes(userRole);

 if (!isHrdRole) {
 if (btnImport) btnImport.style.display = "none";
 if (fileInput) fileInput.style.display = "none";
 if (btnReset) btnReset.style.display = "none";
 const excelBox = container.querySelector(".bg-blue-50");
 if (excelBox) excelBox.style.display = "none";
 }

 let allKaryawan = [];
 let allCuti = [];

 const searchInput = container.querySelector("#manajemen-cuti-search");
 const countDisplay = container.querySelector("#manajemen-cuti-count");

 function renderRows() {
  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const filtered = allKaryawan.filter(k => {
   if (!searchTerm) return true;
   const name = (k.nama_karyawan || "").toLowerCase();
   const nik = (k.nik || k.nik_karyawan || "").toLowerCase();
   const jabatan = (k.jabatan || "").toLowerCase();
   return name.includes(searchTerm) || nik.includes(searchTerm) || jabatan.includes(searchTerm);
  });

  if (countDisplay) {
   countDisplay.textContent = `${filtered.length} / ${allKaryawan.length} Karyawan`;
  }

  if (filtered.length === 0) {
   tbody.innerHTML = `<tr><td colspan="6">${emptyState("Tidak ada data karyawan yang cocok dengan pencarian.")}</td></tr>`;
   return;
  }

  const now = new Date();
  tbody.innerHTML = filtered.map(k => {
   let masaKerjaStr = "-";
   if (k.tanggal_join) {
    const join = smartParseDate(k.tanggal_join);
    if (join) {
     const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
     const yrs = Math.floor(diffMonths / 12);
     const mths = diffMonths % 12;
     masaKerjaStr = yrs > 0 ? `${yrs} Thn ${mths} Bln` : `${mths} Bln`;
    }
   }

   const empCuti = allCuti.filter(c => c.nama_karyawan === k.nama_karyawan || (k.nik && c.nik === k.nik));
   const calc = getCalculatedJatahCuti(k, empCuti);

   return `
   <tr class="hover:bg-slate-50/50 transition">
   <td class="py-3 px-4">
   <p class="font-bold text-slate-800">${escapeHtml(k.nama_karyawan)}</p>
   <p class="text-[11px] text-slate-400 font-medium">${escapeHtml(k.nik || k.nik_karyawan || "-")}</p>
   </td>
   <td class="py-3 px-4 text-slate-600 font-medium text-xs">${masaKerjaStr}</td>
   
   <!-- CUTI TAHUNAN -->
   <td class="py-3 px-4 text-center">
   <div class="inline-flex flex-col items-center">
   <span class="bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-lg text-xs">Sisa: ${calc.sisaTahunan} Hari</span>
   <span class="text-[10px] text-slate-500 mt-1">Awal: <strong>${calc.jatahTahunan}</strong> • Pakai: <strong class="text-amber-700">${calc.usedTahunan}</strong></span>
   </div>
   </td>

   <!-- CUTI KHUSUS -->
   <td class="py-3 px-4 text-center">
   <div class="inline-flex flex-col items-center">
   <span class="bg-purple-100 text-purple-800 font-bold px-2.5 py-0.5 rounded-lg text-xs">Sisa: ${calc.sisaKhusus} Hari</span>
   <span class="text-[10px] text-slate-500 mt-1">Awal: <strong>${calc.jatahKhusus}</strong> • Pakai: <strong class="text-amber-700">${calc.usedKhusus}</strong></span>
   </div>
   </td>

   <!-- CARRYOVER AKUMULASI -->
   <td class="py-3 px-4 text-center">
   <div class="inline-flex flex-col items-center">
   <span class="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-lg text-xs">Sisa: ${calc.sisaAkumulasi} Hari</span>
   <span class="text-[10px] text-slate-500 mt-1">Awal: <strong>${calc.jatahAkumulasi}</strong> • Pakai: <strong class="text-amber-700">${calc.usedAkumulasi}</strong></span>
   ${k.cuti_akumulasi_expired ? `<p class="text-[9px] text-amber-600 mt-0.5 font-medium">Hangus stlh ${escapeHtml(k.cuti_akumulasi_expired)}</p>` : ""}
   </div>
   </td>

   <!-- SISA CUTI TAHUN LALU (INPUT MANUAL) -->
   <td class="py-3 px-4 text-center">
   <input type="number" step="0.5" min="0" data-sisa-lalu="${k.id}"
   value="${k.sisa_cuti_tahun_lalu ?? ""}" placeholder="Belum diisi"
   class="w-24 text-center px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-maroon-400 text-sm font-semibold text-slate-700">
   ${(k.sisa_cuti_tahun_lalu === undefined || k.sisa_cuti_tahun_lalu === null) ? `<p class="text-[10px] text-amber-600 mt-1">Belum diisi HRD</p>` : ""}
   </td>
   </tr>
   `;
  }).join("");

  tbody.querySelectorAll("[data-sisa-lalu]").forEach(inp => {
   inp.addEventListener("change", async () => {
    const id = inp.dataset.sisaLalu;
    const val = inp.value === "" ? null : (parseFloat(inp.value) || 0);
    try {
     const emp = allKaryawan.find(k => k.id === id);
     let jAkumulasiBaru = 0;
     if (val !== null && val > 0 && emp) {
      jAkumulasiBaru = calculateCarryoverJatah(val, emp.tanggal_join);
     }
     await updateDoc(doc(db, COL.MASTER_KARYAWAN, id), { 
      sisa_cuti_tahun_lalu: val,
      jatah_cuti_akumulasi: jAkumulasiBaru,
      jatah_akumulasi: jAkumulasiBaru
     });
     if (emp) {
      emp.sisa_cuti_tahun_lalu = val;
      emp.jatah_cuti_akumulasi = jAkumulasiBaru;
      emp.jatah_akumulasi = jAkumulasiBaru;
     }
     toast("Sisa cuti tahun lalu dan jatah akumulasi berhasil diperbarui", "success");
     renderRows();
    } catch (e) {
     toast("Gagal menyimpan: " + e.message, "error");
    }
   });
  });
 }

 if (searchInput) {
  searchInput.addEventListener("input", () => {
   renderRows();
  });
 }

 // ==========================================
 // 1. MEMUAT & MENAMPILKAN DATA KARYAWAN
 // ==========================================
 async function loadData() {
  const [dataKaryawan, dataCuti] = await Promise.all([
    fsGetAll(COL.MASTER_KARYAWAN),
    fsGetAll(COL.MASTER_CUTI)
  ]);
  allKaryawan = dataKaryawan.filter(k => (k.aktif_tdk_aktif || "AKTIF").toUpperCase() === "AKTIF");
  allKaryawan.sort((a,b) => (a.nama_karyawan||"").localeCompare(b.nama_karyawan||""));
  allCuti = dataCuti || [];

  if (allKaryawan.length === 0) {
   tbody.innerHTML = `<tr><td colspan="6">${emptyState("Belum ada data karyawan aktif.")}</td></tr>`;
   return;
  }

  renderRows();
 }

 // ==========================================
 // 2. PROSES IMPORT FILE EXCEL
 // ==========================================
 btnImport.onclick = () => fileInput.click();
 
 fileInput.onchange = (e) => {
 const file = e.target.files[0];
 if (!file) return;

 const reader = new FileReader();
 reader.onload = async (event) => {
 try {
 const data = new Uint8Array(event.target.result);
 const workbook = XLSX.read(data, {type: 'array'});
 const worksheet = workbook.Sheets[workbook.SheetNames[0]];
 const json = XLSX.utils.sheet_to_json(worksheet);

 if (json.length === 0) throw new Error("File Excel kosong.");

 btnImport.disabled = true;
 btnImport.textContent = "Memproses...";

  // Helper flexible matching column name
					const getVal = (row, names) => {
						const rowKeys = Object.keys(row);
						for (const n of names) {
							const cleanN = n.toLowerCase().replace(/[^a-z0-9]/g, "");
							for (const k of rowKeys) {
								const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
								if (cleanK === cleanN) return row[k];
							}
						}
						for (const n of names) {
							const cleanN = n.toLowerCase().replace(/[^a-z0-9]/g, "");
							if (!cleanN) continue;
							for (const k of rowKeys) {
								const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
								if (cleanK.includes(cleanN) || cleanN.includes(cleanK)) return row[k];
							}
						}
						return undefined;
					};

					const parseNum = (v) => {
						if (v === undefined || v === null || v === "") return null;
						if (typeof v === "number") return isNaN(v) ? null : v;
						const str = String(v).trim().replace(",", ".");
						const m = str.match(/-?\d+(\.\d+)?/);
						if (m) {
							const res = parseFloat(m[0]);
							return isNaN(res) ? null : res;
						}
						return null;
					};

					let updateCount = 0;

					for (const row of json) {
						const nikRaw = getVal(row, ["nik", "no induk", "no. induk", "nomor induk", "id karyawan", "nip", "no karyawan", "kode karyawan", "id"]);
						const namaRaw = getVal(row, ["nama karyawan", "nama", "nama lengkap", "karyawan", "nama_karyawan", "nama pemohon"]);

						const cleanNik = nikRaw !== undefined && nikRaw !== null ? String(nikRaw).trim() : "";
						const cleanNama = namaRaw !== undefined && namaRaw !== null ? String(namaRaw).trim().toLowerCase().replace(/\s+/g, " ") : "";

						if (!cleanNik && !cleanNama) continue;

						let targetEmp = null;
						if (cleanNik) {
							const pureNik = cleanNik.replace(/^0+/, "");
							targetEmp = allKaryawan.find(k => {
								const kNik = (k.nik || k.nik_karyawan || "").toString().trim();
								return kNik && (kNik === cleanNik || kNik.replace(/^0+/, "") === pureNik);
							});
						}
						if (!targetEmp && cleanNama) {
							targetEmp = allKaryawan.find(k => (k.nama_karyawan || "").trim().toLowerCase().replace(/\s+/g, " ") === cleanNama);
							if (!targetEmp && cleanNama.length >= 4) {
								targetEmp = allKaryawan.find(k => {
									const kN = (k.nama_karyawan || "").trim().toLowerCase().replace(/\s+/g, " ");
									return kN.includes(cleanNama) || cleanNama.includes(kN);
								});
							}
						}

						if (!targetEmp) continue;

						const jTahunan = parseNum(getVal(row, ["jatah cuti tahunan", "jatah tahunan", "jatah tahunan awal", "jatah cuti tahunan awal", "cuti tahunan", "tahunan", "hak cuti tahunan", "saldo cuti tahunan", "sisa cuti tahunan"]));
						const jKhusus = parseNum(getVal(row, ["jatah cuti khusus", "jatah khusus", "jatah khusus awal", "jatah cuti khusus awal", "cuti khusus", "khusus", "hak cuti khusus", "saldo cuti khusus", "sisa cuti khusus"]));
						const jAkumulasi = parseNum(getVal(row, ["jatah cuti akumulasi", "jatah akumulasi", "jatah akumulasi carryover", "carryover akumulasi", "carryover", "akumulasi", "cuti akumulasi", "hak cuti akumulasi", "saldo cuti akumulasi", "sisa cuti akumulasi"]));
						const sisaLalu = parseNum(getVal(row, ["sisa cuti tahun lalu", "sisa cuti tahun lalu manual hrd", "sisa cuti tahun lalu input manual hrd", "sisa tahun lalu", "sisa cuti lalu", "sisa lalu", "sisa cuti tahun sebelumnya", "cuti tahun lalu"]));

						const payload = {};
						let hasChange = false;

						if (jTahunan !== null) {
							payload.jatah_cuti_tahunan = jTahunan;
							payload.jatah_tahunan = jTahunan;
							hasChange = true;
						}
						if (jKhusus !== null) {
							payload.jatah_cuti_khusus = jKhusus;
							payload.jatah_khusus = jKhusus;
							hasChange = true;
						}
						if (jAkumulasi !== null) {
							payload.jatah_cuti_akumulasi = jAkumulasi;
							payload.jatah_akumulasi = jAkumulasi;
							hasChange = true;
						}
						if (sisaLalu !== null) {
							payload.sisa_cuti_tahun_lalu = sisaLalu;
							if (jAkumulasi === null) {
								const calcAkum = calculateCarryoverJatah(sisaLalu, targetEmp.tanggal_join);
								payload.jatah_cuti_akumulasi = calcAkum;
								payload.jatah_akumulasi = calcAkum;
							}
							hasChange = true;
						}

						if (hasChange) {
							await updateDoc(doc(db, COL.MASTER_KARYAWAN, targetEmp.id), payload);
							Object.assign(targetEmp, payload);
							updateCount++;
						}
					}

	toast(`Berhasil mengupdate jatah cuti ${updateCount} karyawan!`, "success");
  await loadData();
  } catch (err) {
  console.error(err);
  toast("Gagal membaca Excel. Pastikan format kolom sesuai.", "error");
  } finally {
  btnImport.disabled = false;
  btnImport.innerHTML = `<i class="fa-solid fa-file-import opacity-80"></i> Import Excel`;
  fileInput.value = ""; 
  }
  };
  reader.readAsArrayBuffer(file);
  };

  // ==========================================
  // 3. KALKULASI & RESET OTOMATIS BERDASARKAN SK No.018/HRGA-AJ/XII/2024
  // (Surat Keputusan Kebijakan Cuti Karyawan CV Andela Jaya)
  // ==========================================
  btnReset.onclick = async () => {
  if (!confirm("Apakah Anda yakin ingin me-reset jatah cuti seluruh karyawan aktif?\n\nSistem akan menggunakan 'Sisa Cuti Tahun Lalu' (input manual HRD / Import Excel) dikalikan persentase masa kerja sebagai basis carryover cuti akumulasi (sesuai SK No.018/HRGA-AJ/XII/2024):\n- 0 s/d < 3 tahun: 0%\n- 3 s/d < 5 tahun: 50%\n- 5 tahun ke atas: 100%\n\nLanjutkan?")) return;

  btnReset.disabled = true;
  btnReset.textContent = "Mengkalkulasi...";

  try {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;

  const allCutiLog = await fsGetAll(COL.MASTER_CUTI);
  const tahunLalu = now.getFullYear() - 1;
  const terpakaiTahunLalu = {};
  allCutiLog.forEach(r => {
  const key = r.nama_karyawan;
  if (!key) return;
  const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : null);
  if (rowYear !== tahunLalu) return;
  if (!terpakaiTahunLalu[key]) terpakaiTahunLalu[key] = { Tahunan: 0, Akumulasi: 0 };
  if (r.potong_jatah === "Tahunan" || r.potong_jatah === "Akumulasi") {
  terpakaiTahunLalu[key][r.potong_jatah] += parseFloat(r.count) || 0;
  }
  });

  for (const emp of allKaryawan) {
  let jTahunanBaru = 12;
  let jKhusus = 4;
  let jAkumulasiBaru = 0;

  const jatahTahunanLama = toNumber(emp.jatah_cuti_tahunan ?? emp.jatah_tahunan ?? 12);
  const used = terpakaiTahunLalu[emp.nama_karyawan] || { Tahunan: 0, Akumulasi: 0 };

  const sisaLaluManual = emp.sisa_cuti_tahun_lalu;
  const adaInputManual = sisaLaluManual !== undefined && sisaLaluManual !== null && sisaLaluManual !== "";
  const sisaTahunanAktual = Math.max(jatahTahunanLama - used.Tahunan, 0);
  const totalSisaUntukCarry = adaInputManual ? toNumber(sisaLaluManual) : sisaTahunanAktual;

  if (emp.tanggal_join) {
  const join = smartParseDate(emp.tanggal_join);
  if (join) {
  const diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
  const tenureYears = diffMonths / 12;

  // A. LOGIKA CUTI TAHUNAN
  if (diffMonths >= 12) {
    if (tenureYears >= 10 || diffMonths >= 120) jTahunanBaru = 16;
    else if (tenureYears >= 8 || diffMonths >= 96) jTahunanBaru = 14;
    else if (tenureYears >= 6 || diffMonths >= 72) jTahunanBaru = 13;
    else jTahunanBaru = 12;
  } else if (diffMonths >= 3) {
    jTahunanBaru = diffMonths;
  } else {
    jTahunanBaru = 0;
  }

  // B. LOGIKA PERSENTASE CARRYOVER SISA CUTI TAHUNAN
  // - 0 s/d < 3 tahun: 0%
  // - 3 s/d < 5 tahun: 50%
  // - 5 tahun ke atas: 100%
  if (tenureYears >= 5 || diffMonths >= 60) {
    jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 1.0);
  } else if (tenureYears >= 3 || diffMonths >= 36) {
    jAkumulasiBaru = Math.floor(totalSisaUntukCarry * 0.5);
  } else {
    jAkumulasiBaru = 0;
  }
  } else {
  jTahunanBaru = 12;
  jAkumulasiBaru = 0;
  }
  } else {
  jTahunanBaru = 12;
  jAkumulasiBaru = 0;
  }

 // Simpan ganda ke field snake_case baru dan format lama agar kompatibel di semua widget.
 // `cuti_akumulasi_expired` mencatat batas pemakaian carryover sesuai SK bagian C:
 // "Sisa Cuti Tahunan bisa digunakan karyawan maksimal sampai bulan Juni tahun
 // berikutnya, jika melewati maka sisa cuti tahunan yang dimiliki karyawan akan hangus."
 await updateDoc(doc(db, COL.MASTER_KARYAWAN, emp.id), {
 jatah_cuti_tahunan: jTahunanBaru, jatah_tahunan: jTahunanBaru,
 jatah_cuti_khusus: jKhusus, jatah_khusus: jKhusus,
 jatah_cuti_akumulasi: jAkumulasiBaru, jatah_akumulasi: jAkumulasiBaru,
 sisa_cuti_tahun_lalu: null, // dikosongkan lagi -- HRD wajib input ulang utk siklus tahun berikutnya
 cuti_akumulasi_expired: `30 Juni ${nextYear}`
 });
 }

 toast("Kalkulasi & Reset Tahunan Selesai Berhasil (mengacu SK No.018/HRGA-AJ/XII/2024)!", "success");
 await loadData();
 } catch (err) {
 console.error(err);
 toast("Terjadi kesalahan saat mereset data.", "error");
 } finally {
 btnReset.disabled = false;
 btnReset.innerHTML = `<i class="fa-solid fa-rotate opacity-80"></i> Reset Otomatis`;
 }
 };

 await loadData();
 return { unmount() {} };
}
