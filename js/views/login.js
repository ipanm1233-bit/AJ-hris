import { login } from "../auth.js";
import { openModal, closeModal } from "../utils.js";

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

 return { unmount() {} };
}

