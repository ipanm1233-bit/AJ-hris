import { login, loginWithGoogleCredential } from "../auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { openModal, closeModal } from "../utils.js";

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
let googleScriptPromise = null;

function loadGoogleIdentityScript() {
 if (typeof window !== "undefined" && window.google?.accounts?.id) return Promise.resolve();
 if (googleScriptPromise) return googleScriptPromise;
 googleScriptPromise = new Promise((resolve, reject) => {
  const script = document.createElement("script");
  script.src = GOOGLE_SCRIPT_URL;
  script.async = true;
  script.defer = true;
  script.onload = () => resolve();
  script.onerror = () => {
   googleScriptPromise = null;
   reject(new Error("Script login Google tidak dapat dimuat."));
  };
  document.head.appendChild(script);
 });
 return googleScriptPromise;
}

function setGoogleMessage(container, message, type = "error") {
 const statusEl = container.querySelector("#google-login-status");
 const errorEl = container.querySelector("#google-login-error");
 [statusEl, errorEl].forEach(el => {
  if (el) {
   el.classList.add("hidden");
   el.textContent = "";
  }
 });
 const target = type === "error" ? errorEl : statusEl;
 if (target) {
  target.textContent = message;
  target.classList.remove("hidden");
 }
}

async function resolveGoogleClientId() {
 const fallback = String(firebaseConfig?.oAuthClientId || window.GOOGLE_OAUTH_CLIENT_ID || "").trim();
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 5_000);
 try {
  const response = await fetch("/api/auth-google", {
   method: "GET",
   headers: { Accept: "application/json" },
   cache: "no-store",
   signal: controller.signal
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload.success && payload.clientId) return String(payload.clientId).trim();
 } catch (error) {
  console.warn("Gagal membaca konfigurasi Google dari server:", error.message);
 } finally {
  clearTimeout(timer);
 }
 return fallback;
}

async function setupGoogleLogin(container, onSuccess, setPasswordBusy) {
 const mountEl = container.querySelector("#google-signin-button");
 if (!mountEl) return;

 const clientId = await resolveGoogleClientId();
 if (!clientId) {
  setGoogleMessage(container, "Login Google belum dikonfigurasi. Hubungi HRD/IT.", "error");
  return;
 }

 try {
  await loadGoogleIdentityScript();
 } catch (error) {
  setGoogleMessage(container, "Login Google tidak dapat dimuat. Periksa koneksi internet lalu muat ulang halaman.", "error");
  return;
 }

 if (!window.google?.accounts?.id) {
  setGoogleMessage(container, "Fitur login Google tidak tersedia di browser ini.", "error");
  return;
 }

 let googleBusy = false;
 try {
  window.google.accounts.id.initialize({
   client_id: clientId,
   auto_select: false,
   cancel_on_tap_outside: true,
   callback: async response => {
    if (googleBusy) return;
    if (!response?.credential) {
     setGoogleMessage(container, "Email Google tidak dipilih. Silakan coba lagi.", "error");
     return;
    }
    googleBusy = true;
    if (setPasswordBusy) setPasswordBusy(true);
    setGoogleMessage(container, "Memverifikasi akun Google...", "status");
    try {
     const remember = container.querySelector("#login-remember")?.checked === true;
     await loginWithGoogleCredential(response.credential, remember);
     setGoogleMessage(container, "Berhasil. Mengalihkan ke beranda...", "status");
     onSuccess && onSuccess();
    } catch (error) {
     googleBusy = false;
     if (setPasswordBusy) setPasswordBusy(false);
     setGoogleMessage(container, error.message || "Login Google gagal. Silakan coba lagi.", "error");
    }
   }
  });

  const width = Math.max(220, Math.min(360, mountEl.clientWidth || 320));
  window.google.accounts.id.renderButton(mountEl, {
   type: "standard",
   theme: "outline",
   size: "large",
   text: "continue_with",
   shape: "rectangular",
   logo_alignment: "left",
   width
  });
 } catch (error) {
  setGoogleMessage(container, error.message || "Tombol login Google gagal dimuat.", "error");
 }
}

export function mount(container, { onSuccess }) {
 const yearEl = container.querySelector("#login-year");
 if (yearEl) yearEl.textContent = new Date().getFullYear();

 const pwInput = container.querySelector("#login-password");
 const togglePwBtn = container.querySelector("#toggle-pw");
 if (togglePwBtn && pwInput) {
  togglePwBtn.addEventListener("click", (e) => {
   pwInput.type = pwInput.type === "password" ? "text" : "password";
   e.target.textContent = pwInput.type === "password" ? "Lihat" : "Sembunyikan";
  });
 }

 const bioBtn = container.querySelector("#btn-biometric-info");
 if (bioBtn) {
  bioBtn.onclick = () => {
   openModal({
    title: "Akses Login Biometrik & Passkey",
    bodyHtml: `
     <div class="space-y-3 text-xs text-slate-600 text-left">
      <div class="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
       <span class="p-2 bg-maroon-700 text-white rounded-xl font-bold">AJ</span>
       <div>
        <p class="font-extrabold text-slate-800 text-sm">Masuk Cepat HRAPP Mobile</p>
        <p class="text-[11px] text-slate-500">Gunakan NIK Karyawan & password yang terdaftar.</p>
       </div>
      </div>
      <p>Sistem ini mendukung penyimpanan sesi otomatis saat Anda mencentang "Ingat Sesi Saya".</p>
      <p>Untuk login fingerprint / biometrik PWA HP, pastikan mengaktifkan izin biometrik di browser perangkat Anda setelah berhasil masuk pertama kali.</p>
      <div class="pt-2 flex justify-end">
       <button id="btn-close-bio-modal" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs">Paham</button>
      </div>
     </div>`,
    onMount: (m) => {
     const cBtn = m.querySelector("#btn-close-bio-modal");
     if (cBtn) cBtn.onclick = closeModal;
    }
   });
  };
 }

 container.querySelectorAll(".btn-login-quick-access").forEach(btn => {
  btn.onclick = () => {
   const info = btn.dataset.info || "Info Bantuan HRIS";
   openModal({
    title: "Informasi Layanan HRIS",
    bodyHtml: `
     <div class="space-y-3 text-xs text-slate-600 text-left">
      <p class="font-medium text-slate-700 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">${info}</p>
      <div class="pt-2 flex justify-end">
       <button id="btn-close-quick-info" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs">Tutup</button>
      </div>
     </div>`,
    onMount: (m) => {
     const cBtn = m.querySelector("#btn-close-quick-info");
     if (cBtn) cBtn.onclick = closeModal;
    }
   });
  };
 });

 const form = container.querySelector("#login-form");
 const errorEl = container.querySelector("#login-error");
 const btnText = container.querySelector("#login-btn-text");
 const submitBtn = container.querySelector("#login-submit");
 const setGoogleBusy = busy => {
  if (submitBtn) submitBtn.disabled = Boolean(busy);
 };

 if (form) {
  form.addEventListener("submit", async (e) => {
   e.preventDefault();
   if (errorEl) errorEl.classList.add("hidden");
   if (submitBtn) submitBtn.disabled = true;
   if (btnText) btnText.innerHTML = `<span class="spinner"></span>`;

   const username = container.querySelector("#login-username").value;
   const password = pwInput ? pwInput.value : "";
   const remember = container.querySelector("#login-remember") ? container.querySelector("#login-remember").checked : false;

   try {
    await login(username, password, remember);
    if (btnText) btnText.textContent = "Berhasil, mengalihkan...";
    onSuccess && onSuccess();
   } catch (err) {
    if (errorEl) {
     errorEl.textContent = err.message || "Login gagal. Periksa kembali username & password Anda.";
     errorEl.classList.remove("hidden");
    }
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = "Masuk Sekarang";
   }
  });
 }

 setupGoogleLogin(container, onSuccess, setGoogleBusy);

 return { unmount() {} };
}

