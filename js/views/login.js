import { login } from "../auth.js";

export function mount(container, { onSuccess }) {
  container.querySelector("#login-year").textContent = new Date().getFullYear();

  const pwInput = container.querySelector("#login-password");
  container.querySelector("#toggle-pw").addEventListener("click", (e) => {
    pwInput.type = pwInput.type === "password" ? "text" : "password";
    e.target.textContent = pwInput.type === "password" ? "Lihat" : "Sembunyikan";
  });

  const form = container.querySelector("#login-form");
  const errorEl = container.querySelector("#login-error");
  const btnText = container.querySelector("#login-btn-text");
  const submitBtn = container.querySelector("#login-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    submitBtn.disabled = true;
    btnText.innerHTML = `<span class="spinner"></span>`;

    const username = container.querySelector("#login-username").value;
    const password = pwInput.value;
    const remember = container.querySelector("#login-remember").checked;

    try {
      await login(username, password, remember);
      btnText.textContent = "Berhasil, mengalihkan...";
      onSuccess && onSuccess();
    } catch (err) {
      errorEl.textContent = err.message || "Login gagal. Periksa kembali username & password Anda.";
      errorEl.classList.remove("hidden");
      submitBtn.disabled = false;
      btnText.textContent = "Masuk";
    }
  });

  return { unmount() {} };
}
