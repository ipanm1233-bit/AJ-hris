import { db, COL, doc, getDoc } from "../firebase-config.js";
import { fsGetAll, escapeHtml, fmtDateShort } from "../utils.js";
import { badge, emptyState } from "../components.js";

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  const m = s.match(/^(\d{1,2})[:\.](\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function getShiftForEmployee(empObjectOrJabatan, cfgJadwal = []) {
  let jab = "";
  let nama = "";

  if (typeof empObjectOrJabatan === "string") {
    jab = empObjectOrJabatan.trim().toLowerCase();
  } else if (empObjectOrJabatan && typeof empObjectOrJabatan === "object") {
    jab = String(empObjectOrJabatan.jabatan || empObjectOrJabatan.posisi || "").trim().toLowerCase();
    nama = String(empObjectOrJabatan.nama_karyawan || empObjectOrJabatan.nama || "").trim().toLowerCase();
  }

  const isCashier = jab.includes("cashier") || jab.includes("kasir") || nama.includes("jannah") || nama.includes("amaliatul");

  if (jab && cfgJadwal && cfgJadwal.length) {
    const match = cfgJadwal.find(j => {
      const jJab = String(j.jabatan || "").trim().toLowerCase();
      return jJab && (jJab === jab || jab.includes(jJab) || jJab.includes(jab));
    });
    if (match && match.masuk) {
      return { masuk: match.masuk, pulang: match.pulang || "17:00" };
    }
  }

  if (isCashier) {
    return { masuk: "09:00", pulang: "18:00" };
  }

  if (cfgJadwal && cfgJadwal.length) {
    const defaultShift = cfgJadwal.find(j => {
      const jJab = String(j.jabatan || "").trim().toLowerCase();
      return !jJab || jJab === "all" || jJab === "semua jabatan" || jJab === "semua";
    });
    if (defaultShift && defaultShift.masuk) {
      return { masuk: defaultShift.masuk, pulang: defaultShift.pulang || "17:00" };
    }
  }

  return { masuk: "08:00", pulang: "17:00" };
}

function checkIsLate(scanMasuk, jadwalMasuk = "08:00", tolTelatMins = 0) {
  const scanMins = parseTimeToMinutes(scanMasuk);
  if (scanMins === null) return false;
  const targetMins = parseTimeToMinutes(jadwalMasuk) ?? 480;
  const tol = parseInt(tolTelatMins, 10) || 0;
  return scanMins > (targetMins + tol);
}

export async function mount(container, { session }) {
  const tbody = container.querySelector("#as-tbody");
  const filterStart = container.querySelector("#as-filter-start");
  const filterEnd = container.querySelector("#as-filter-end");
  const btnReset = container.querySelector("#as-btn-reset");
  const elTotalHadir = container.querySelector("#as-total-hadir");
  const elTotalBulanIni = container.querySelector("#as-total-bulan-ini");
  const elTotalBelumPulang = container.querySelector("#as-total-belum-pulang");
  const elPeriodeLabel = container.querySelector("#as-periode-label");

  tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm">Memuat data absensi Anda...</td></tr>`;

  let myRecords = [];
  let tolTelatMins = 0;
  let myShift = { masuk: "08:00", pulang: "17:00" };

  try {
    const [all, cfgSnap] = await Promise.all([
      fsGetAll(COL.DATA_ABSENSI),
      getDoc(doc(db, COL.APP_SETTINGS, "main")).catch(() => null)
    ]);

    const cfgData = (cfgSnap && cfgSnap.exists()) ? cfgSnap.data() : {};
    const cfgJadwal = cfgData?.jadwal || [];
    tolTelatMins = parseInt(cfgData?.tarif?.tol_telat, 10) || 0;
    myShift = getShiftForEmployee(session, cfgJadwal);

    const uNik = String(session?.nik || "").trim().toLowerCase();
    const uNama = String(session?.nama || "").trim().toLowerCase();
    const uUser = String(session?.username || "").trim().toLowerCase();

    // Karyawan hanya melihat rekap absensi miliknya sendiri (berdasarkan NIK, Nama, Username, atau substring Nama).
    myRecords = all.filter(r => {
      const rNik = String(r.nik || "").trim().toLowerCase();
      const rNama = String(r.nama || "").trim().toLowerCase();
      if (uNik && rNik && uNik === rNik) return true;
      if (uUser && (rNik === uUser || rNama === uUser || rNama.includes(uUser))) return true;
      if (uNama && rNama) {
        if (uNama === rNama || uNama.includes(rNama) || rNama.includes(uNama)) return true;
        if ((uNama.includes("jannah") || uNama.includes("amaliatul")) && (rNama.includes("jannah") || rNama.includes("amaliatul"))) return true;
      }
      return false;
    }).sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500 text-sm">Gagal memuat data: ${escapeHtml(e.message)}</td></tr>`;
    return;
  }

  function render() {
    const start = filterStart.value;
    const end = filterEnd.value;
    const filtered = myRecords.filter(r => {
      if (start && r.tanggal < start) return false;
      if (end && r.tanggal > end) return false;
      return true;
    });

    elPeriodeLabel.textContent = (start || end) ? `${start ? fmtDateShort(start) : "Awal"} - ${end ? fmtDateShort(end) : "Sekarang"}` : "Seluruh data";

    const now = new Date();
    const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    elTotalHadir.textContent = myRecords.length;
    elTotalBulanIni.textContent = myRecords.filter(r => (r.tanggal || "").startsWith(curYm)).length;
    elTotalBelumPulang.textContent = myRecords.filter(r => r.scan_masuk && !r.scan_keluar).length;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="4">${emptyState("Belum ada rekap absensi pada periode ini", "Data akan muncul otomatis setelah proses absensi/sinkronisasi oleh HRD.")}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const uJab = String(session?.jabatan || "").toLowerCase();
      const uNam = String(session?.nama || "").toLowerCase();
      const isCashierOrJannah = uJab.includes("cashier") || uJab.includes("kasir") || uNam.includes("jannah") || uNam.includes("amaliatul");
      const targetJadwal = (r.jadwal_masuk && r.jadwal_masuk !== "08:00" && !isCashierOrJannah) ? r.jadwal_masuk : myShift.masuk;
      const isLate = checkIsLate(r.scan_masuk, targetJadwal, tolTelatMins);
      let statusBadge;
      if (r.scan_masuk && r.scan_keluar) {
        statusBadge = isLate 
          ? badge("Terlambat", "red") 
          : badge("Tepat Waktu", "green");
      } else if (r.scan_masuk && !r.scan_keluar) {
        statusBadge = badge("Belum Scan Pulang", "amber");
      } else {
        statusBadge = badge("Data Tidak Lengkap", "slate");
      }

      const timeInClass = isLate ? "text-rose-600 font-extrabold" : "text-emerald-700 font-semibold";

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="px-4 py-3 font-medium text-slate-700">${escapeHtml(fmtDateShort(r.tanggal) || r.tanggal || "-")}</td>
          <td class="px-4 py-3 text-center font-mono ${timeInClass}">${escapeHtml(r.scan_masuk || "-")}</td>
          <td class="px-4 py-3 text-center font-mono text-slate-700">${escapeHtml(r.scan_keluar || "-")}</td>
          <td class="px-4 py-3 text-center">${statusBadge}</td>
        </tr>`;
    }).join("");
  }

  filterStart.onchange = render;
  filterEnd.onchange = render;
  btnReset.onclick = () => { filterStart.value = ""; filterEnd.value = ""; render(); };

  render();
}
