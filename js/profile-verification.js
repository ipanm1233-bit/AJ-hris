import { authFetch } from "./api-client.js";
import { escapeHtml, toast } from "./utils.js";
import { logout, setSession, syncSessionWithDb } from "./auth.js";
import { auth } from "./firebase-config.js";
import {
  formatAccuracy,
  formatCoordinates,
  formatLocationTime,
  getCurrentLocation,
  locationMapUrl
} from "./geolocation.mjs";

const OVERLAY_ID = "profile-verification-overlay";
let activeGate = null;

const GENDERS = ["LAKI-LAKI", "PEREMPUAN"];
const RELIGIONS = ["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU", "LAINNYA"];
const EDUCATIONS = ["SD", "SMP", "SMA/SMK", "D1", "D2", "D3", "S1", "S2", "S3"];
const MARITAL_STATUSES = ["Belum Menikah", "Menikah", "Cerai", "Janda", "Duda"];
const SHIRT_SIZES = ["S", "M", "L", "XL", "XXL", "3XL"];

function esc(value) {
  return escapeHtml(value ?? "");
}

function optionList(options, current) {
  const values = [...new Set([...options, String(current || "").trim()].filter(Boolean))];
  return values.map(value => `<option value="${esc(value)}" ${String(current || "") === value ? "selected" : ""}>${esc(value)}</option>`).join("");
}

function textField(config, value) {
  const required = config.required ? "required" : "";
  const maxLength = config.maxLength ? `maxlength="${config.maxLength}"` : "";
  const pattern = config.pattern ? `pattern="${config.pattern}"` : "";
  const inputMode = config.inputMode ? `inputmode="${config.inputMode}"` : "";
  const hint = config.hint ? `<p class="mt-1 text-[10px] text-slate-400">${esc(config.hint)}</p>` : "";
  return `
    <label class="block">
      <span class="block text-[11px] font-bold text-slate-600 mb-1">${esc(config.label)}${config.required ? ' <span class="text-red-500">*</span>' : ""}</span>
      <input type="${config.type || "text"}" data-pv-field="${esc(config.key)}" value="${esc(value)}"
        ${required} ${maxLength} ${pattern} ${inputMode}
        placeholder="${esc(config.placeholder || "")}"
        class="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition">
      ${hint}
    </label>`;
}

function selectField(config, value, options) {
  return `
    <label class="block">
      <span class="block text-[11px] font-bold text-slate-600 mb-1">${esc(config.label)}</span>
      <select data-pv-field="${esc(config.key)}" class="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition">
        <option value="">Pilih ${esc(config.label)}</option>
        ${optionList(options, value)}
      </select>
    </label>`;
}

function textareaField(config, value) {
  return `
    <label class="block">
      <span class="block text-[11px] font-bold text-slate-600 mb-1">${esc(config.label)}${config.required ? ' <span class="text-red-500">*</span>' : ""}</span>
      <textarea data-pv-field="${esc(config.key)}" rows="${config.rows || 3}" maxlength="${config.maxLength || 500}"
        ${config.required ? "required" : ""} placeholder="${esc(config.placeholder || "")}"
        class="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 transition resize-y">${esc(value)}</textarea>
    </label>`;
}

function identityCard(label, value) {
  return `
    <div class="rounded-xl border border-slate-100 bg-slate-50/80 p-3 min-w-0">
      <p class="text-[9px] font-bold uppercase tracking-wider text-slate-400">${esc(label)}</p>
      <p class="text-xs font-bold text-slate-800 mt-0.5 break-words">${esc(value || "-")}</p>
    </div>`;
}

function formHtml(profile) {
  return `
    <form id="pv-form" class="space-y-5">
      <div class="rounded-2xl border border-amber-100 bg-amber-50 p-3.5 text-[11px] text-amber-900 leading-relaxed">
        <p class="font-extrabold">Verifikasi pertama kali</p>
        <p class="mt-0.5">Periksa dan lengkapi data berikut. Perubahan akan langsung disimpan ke master karyawan. Nama, NIK karyawan, jabatan, cabang, dan divisi hanya dapat diubah oleh HRD.</p>
      </div>

      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-xs font-extrabold text-slate-800">Identitas Akun</h4>
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Terkunci</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          ${identityCard("Nama Karyawan", profile.nama_karyawan)}
          ${identityCard("NIK Karyawan", profile.nik_karyawan)}
          ${identityCard("Jabatan", profile.jabatan)}
          ${identityCard("Divisi", profile.divisi)}
          ${identityCard("Cabang", profile.cabang)}
          ${identityCard("Email Google", profile.email)}
        </div>
      </section>

      <section class="space-y-2">
        <h4 class="text-xs font-extrabold text-slate-800">Data Pribadi</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${textField({ key: "nik_ktp", label: "NIK KTP", maxLength: 16, inputMode: "numeric", pattern: "[0-9]{16}", hint: "16 digit sesuai KTP." }, profile.nik_ktp)}
          ${textField({ key: "no_kk", label: "Nomor Kartu Keluarga", maxLength: 16, inputMode: "numeric", pattern: "[0-9]{16}", hint: "16 digit sesuai KK." }, profile.no_kk)}
          ${textField({ key: "tempat_lahir", label: "Tempat Lahir", maxLength: 120 }, profile.tempat_lahir)}
          ${textField({ key: "tanggal_lahir", label: "Tanggal Lahir", type: "date" }, profile.tanggal_lahir)}
          ${selectField({ key: "jenis_kelamin", label: "Jenis Kelamin" }, profile.jenis_kelamin, GENDERS)}
          ${selectField({ key: "agama", label: "Agama" }, profile.agama, RELIGIONS)}
          ${selectField({ key: "pendidikan", label: "Pendidikan Terakhir" }, profile.pendidikan, EDUCATIONS)}
          ${selectField({ key: "status_pernikahan", label: "Status Pernikahan" }, profile.status_pernikahan, MARITAL_STATUSES)}
          ${textField({ key: "tanggungan", label: "Jumlah Tanggungan", type: "number", inputMode: "numeric" }, profile.tanggungan)}
          ${selectField({ key: "ukuran_baju", label: "Ukuran Seragam" }, profile.ukuran_baju, SHIRT_SIZES)}
        </div>
      </section>

      <section class="space-y-2">
        <h4 class="text-xs font-extrabold text-slate-800">Kontak & Alamat</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${textField({ key: "no_hp_aktif", label: "No. HP Aktif / WhatsApp", type: "tel", required: true, maxLength: 20, inputMode: "tel", placeholder: "08xxxxxxxxxx" }, profile.no_hp_aktif)}
          ${textField({ key: "kontak_darurat_nama", label: "Nama Kontak Darurat", maxLength: 120 }, profile.kontak_darurat_nama)}
          ${textField({ key: "kontak_darurat_hubungan", label: "Hubungan Kontak Darurat", maxLength: 80, placeholder: "Orang tua / pasangan / saudara" }, profile.kontak_darurat_hubungan)}
          ${textField({ key: "kontak_darurat_hp", label: "No. HP Kontak Darurat", type: "tel", maxLength: 20, inputMode: "tel" }, profile.kontak_darurat_hp)}
        </div>
        <div class="grid grid-cols-1 gap-3">
          ${textareaField({ key: "alamat", label: "Alamat Domisili", required: true, rows: 3, maxLength: 500, placeholder: "Alamat tempat tinggal saat ini" }, profile.alamat)}
          ${textareaField({ key: "alamat_ktp", label: "Alamat Sesuai KTP", rows: 3, maxLength: 500, placeholder: "Kosongkan jika sama dengan alamat domisili" }, profile.alamat_ktp)}
        </div>
      </section>

      <section class="space-y-2">
        <h4 class="text-xs font-extrabold text-slate-800">Payroll & Jaminan</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${textField({ key: "nama_bank", label: "Nama Bank", maxLength: 80 }, profile.nama_bank)}
          ${textField({ key: "no_rekening", label: "Nomor Rekening", maxLength: 30, inputMode: "numeric" }, profile.no_rekening)}
          ${textField({ key: "npwp", label: "NPWP", maxLength: 20, inputMode: "numeric" }, profile.npwp)}
          ${textField({ key: "bpjs_tk", label: "No. BPJS Ketenagakerjaan", maxLength: 30, inputMode: "numeric" }, profile.bpjs_tk)}
          ${textField({ key: "bpjs_kes", label: "No. BPJS Kesehatan", maxLength: 30, inputMode: "numeric" }, profile.bpjs_kes)}
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h4 class="text-xs font-extrabold text-slate-800">Titik Lokasi Perangkat</h4>
            <p class="text-[10px] text-slate-400 mt-0.5">Dibaca langsung dari GPS/Wi-Fi perangkat. Wajib untuk verifikasi pertama.</p>
          </div>
          <button type="button" id="pv-location-retry" class="shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition">
            Ambil Ulang
          </button>
        </div>
        <div id="pv-location-box" class="rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-500">
          <p id="pv-location-text">Membaca titik lokasi perangkat...</p>
          <a id="pv-location-map" href="#" target="_blank" rel="noopener noreferrer" class="hidden mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-maroon-700 hover:underline">Buka di Google Maps</a>
        </div>
      </section>

      <label class="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 cursor-pointer">
        <input id="pv-confirm" type="checkbox" class="mt-0.5 w-4 h-4 rounded border-slate-300 text-maroon-700 focus:ring-maroon-400">
        <span class="text-[11px] text-slate-600 leading-relaxed">Saya menyatakan data di atas sudah benar. Saya akan menghubungi HRD jika ada perubahan nama, NIK karyawan, jabatan, cabang, atau divisi.</span>
      </label>

      <p id="pv-alert" class="hidden rounded-xl border p-3 text-xs font-semibold"></p>

      <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
        <button type="button" id="pv-logout" class="h-11 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition">Keluar</button>
        <button type="submit" id="pv-submit" class="h-11 px-5 rounded-xl bg-maroon-700 hover:bg-maroon-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black transition shadow-md shadow-maroon-900/20" disabled>
          Simpan & Verifikasi Data
        </button>
      </div>
    </form>`;
}

function formValues(form) {
  const profile = {};
  form.querySelectorAll("[data-pv-field]").forEach(input => {
    profile[input.dataset.pvField] = input.value;
  });
  return profile;
}

function showAlert(element, message, type = "error") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden", "bg-red-50", "border-red-100", "text-red-700", "bg-emerald-50", "border-emerald-100", "text-emerald-700");
  if (type === "success") {
    element.classList.add("bg-emerald-50", "border-emerald-100", "text-emerald-700");
  } else {
    element.classList.add("bg-red-50", "border-red-100", "text-red-700");
  }
}

function closeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.body.classList.remove("overflow-hidden");
}

function overlayShell() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "fixed inset-0 z-[140] bg-slate-950/70 backdrop-blur-sm overflow-y-auto";
  overlay.innerHTML = `
    <div class="min-h-full flex items-start justify-center p-3 sm:p-6">
      <div class="w-full max-w-4xl bg-slate-50 rounded-3xl shadow-2xl overflow-hidden my-2 sm:my-5">
        <div class="bg-gradient-to-r from-maroon-950 via-maroon-800 to-maroon-700 text-white p-5 sm:p-6">
          <div class="flex items-start gap-3">
            <span class="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-sm font-black shrink-0">AJ</span>
            <div class="min-w-0">
              <p class="text-[9px] font-extrabold uppercase tracking-widest text-maroon-100/80">Verifikasi Akun Google</p>
              <h2 class="text-lg sm:text-xl font-extrabold leading-tight mt-0.5">Lengkapi Data Diri Anda</h2>
              <p class="text-[11px] text-maroon-100/90 mt-1 leading-relaxed">Data ini digunakan untuk master karyawan, kontak darurat, payroll, dan dokumen resmi HRD.</p>
            </div>
          </div>
        </div>
        <div id="pv-body" class="p-4 sm:p-6">
          <div class="flex items-center justify-center gap-2 py-10 text-xs font-bold text-slate-500">
            <span class="spinner"></span> Memuat data karyawan...
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("overflow-hidden");
  return overlay;
}

function renderFatal(overlay, message, onRetry, onLogout) {
  const body = overlay.querySelector("#pv-body");
  if (!body) return;
  body.innerHTML = `
    <div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs text-red-700 leading-relaxed">
      <p class="font-extrabold">Verifikasi belum dapat dimuat</p>
      <p class="mt-1">${esc(message || "Terjadi kesalahan saat memuat data karyawan.")}</p>
    </div>
    <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
      <button type="button" id="pv-fatal-logout" class="h-11 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition">Keluar</button>
      <button type="button" id="pv-fatal-retry" class="h-11 px-5 rounded-xl bg-maroon-700 hover:bg-maroon-800 text-white text-xs font-black transition">Coba Lagi</button>
    </div>`;
  body.querySelector("#pv-fatal-retry").onclick = onRetry;
  body.querySelector("#pv-fatal-logout").onclick = onLogout;
}

function bindForm(overlay, profile, session, resolve) {
  const body = overlay.querySelector("#pv-body");
  body.innerHTML = formHtml(profile);

  const form = body.querySelector("#pv-form");
  const confirmInput = body.querySelector("#pv-confirm");
  const submitBtn = body.querySelector("#pv-submit");
  const retryBtn = body.querySelector("#pv-location-retry");
  const locationText = body.querySelector("#pv-location-text");
  const locationBox = body.querySelector("#pv-location-box");
  const locationMap = body.querySelector("#pv-location-map");
  const alertEl = body.querySelector("#pv-alert");
  const state = { location: null, busy: false, submitting: false };

  function updateSubmit() {
    if (!submitBtn) return;
    submitBtn.disabled = state.submitting || !state.location || !confirmInput?.checked;
  }

  function renderLocation() {
    if (!state.location) return;
    const location = state.location;
    locationText.textContent = `${formatCoordinates(location)} · akurasi ${formatAccuracy(location)} · ${formatLocationTime(location.captured_at)}`;
    locationBox.className = "rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] text-emerald-800";
    const url = locationMapUrl(location);
    if (url && locationMap) {
      locationMap.href = url;
      locationMap.classList.remove("hidden");
    }
    updateSubmit();
  }

  function renderLocationError(message) {
    state.location = null;
    locationText.textContent = message;
    locationBox.className = "rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] text-amber-800";
    if (locationMap) locationMap.classList.add("hidden");
    updateSubmit();
  }

  async function captureLocation() {
    if (state.busy || state.submitting) return;
    state.busy = true;
    if (retryBtn) retryBtn.disabled = true;
    locationText.textContent = "Membaca titik lokasi perangkat...";
    locationBox.className = "rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-500";
    if (locationMap) locationMap.classList.add("hidden");
    try {
      state.location = await getCurrentLocation({ timeout: 20_000 });
      renderLocation();
    } catch (error) {
      renderLocationError(error.message || "Gagal membaca lokasi perangkat.");
    } finally {
      state.busy = false;
      if (retryBtn) retryBtn.disabled = false;
    }
  }

  confirmInput?.addEventListener("change", updateSubmit);
  retryBtn?.addEventListener("click", captureLocation);

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    if (state.submitting) return;
    if (!form.reportValidity()) return;
    if (!state.location) {
      showAlert(alertEl, "Titik lokasi perangkat wajib berhasil dibaca sebelum verifikasi disimpan.");
      return;
    }
    if (!confirmInput?.checked) {
      showAlert(alertEl, "Centang pernyataan bahwa data sudah diperiksa.");
      return;
    }

    state.submitting = true;
    updateSubmit();
    submitBtn.textContent = "Menyimpan...";
    try {
      const response = await authFetch("/api/profile-verify", {
        method: "POST",
        body: JSON.stringify({
          profile: formValues(form),
          location: state.location,
          confirm: true
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Gagal menyimpan verifikasi data diri.");

      showAlert(alertEl, "Data berhasil diverifikasi.", "success");
      // Custom claims sudah memperbolehkan akses penuh. Paksa token baru agar
      // fallback saat Firestore kuota habis juga membaca status terbaru.
      await auth.currentUser?.getIdToken(true).catch(() => {});
      let updated = await syncSessionWithDb(session, true);
      if (!updated) {
        updated = { ...session, profile_verification_required: false };
        setSession(updated);
      } else if (updated.profile_verification_required) {
        updated = { ...updated, profile_verification_required: false };
        setSession(updated);
      }
      toast("Data diri berhasil diverifikasi. Selamat menggunakan HRAPP.", "success");
      closeOverlay();
      resolve(updated);
    } catch (error) {
      state.submitting = false;
      updateSubmit();
      submitBtn.textContent = "Simpan & Verifikasi Data";
      showAlert(alertEl, error.message || "Gagal menyimpan verifikasi data diri.");
    }
  });

  body.querySelector("#pv-logout")?.addEventListener("click", async () => {
    closeOverlay();
    resolve(null);
    await logout();
  });

  captureLocation();
}

async function runGate(session) {
  const overlay = overlayShell();
  return new Promise(resolve => {
    const finishLogout = () => {
      closeOverlay();
      resolve(null);
    };

    const load = async () => {
      const body = overlay.querySelector("#pv-body");
      if (body) {
        body.innerHTML = `<div class="flex items-center justify-center gap-2 py-10 text-xs font-bold text-slate-500"><span class="spinner"></span> Memuat data karyawan...</div>`;
      }
      try {
        const response = await authFetch("/api/profile-verify");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || !payload.profile) {
          throw new Error(payload.error || "Data karyawan tidak dapat dimuat.");
        }
        if (payload.verification && payload.verification.required === false) {
          const updated = await syncSessionWithDb(session, true);
          closeOverlay();
          resolve(updated || { ...session, profile_verification_required: false });
          return;
        }
        bindForm(overlay, payload.profile, session, resolve);
      } catch (error) {
        renderFatal(overlay, error.message, load, finishLogout);
      }
    };

    load();
  });
}

export function requireProfileVerification(session) {
  if (!session?.profile_verification_required) return Promise.resolve(session);
  if (activeGate) return activeGate;
  activeGate = runGate(session).finally(() => {
    activeGate = null;
  });
  return activeGate;
}
