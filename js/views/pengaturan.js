import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, fsUpdate, sha256, toast, escapeHtml } from "../utils.js";
import { renderCrudModule, emptyState } from "../components.js";
import { MENU_CONFIG, loadPermissionOverrides } from "../auth.js";

export async function mount(container, { session }) {
  const isHrd = session.role === "HRD";
  container.querySelector("#tab-btn-users").classList.toggle("hidden", !isHrd);
  if (!isHrd) container.querySelector("#st-panel-users").innerHTML = `<div class="bg-white rounded-2xl border border-slate-100 p-6">${emptyState("Hanya HRD yang dapat mengelola akun pengguna", "Anda tetap dapat mengatur hak akses menu & formulir pada tab lain.")}</div>`;
  else await loadUsersTab(container);

  const users = await fsGetAll(COL.USERS);
  await setupRbacMenuTab(container, users);
  await setupRbacFormTab(container, users);

  container.querySelectorAll(".st-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.stab;
      ["users", "menu", "forms"].forEach(t => container.querySelector(`#st-panel-${t}`).classList.toggle("hidden", t !== tab));
      container.querySelectorAll(".st-tab").forEach(b => {
        b.classList.toggle("border-maroon-700", b === btn);
        b.classList.toggle("text-maroon-700", b === btn);
        b.classList.toggle("border-transparent", b !== btn);
        b.classList.toggle("text-slate-500", b !== btn);
      });
    });
  });

  return { unmount() {} };
}

async function loadUsersTab(container) {
  await renderCrudModule(container.querySelector("#st-panel-users"), {
    title: "Manajemen Pengguna",
    subtitle: "Kelola akun login karyawan. Password otomatis dienkripsi (SHA-256).",
    collectionName: COL.USERS,
    idPrefix: "USR",
    orderByField: "nama",
    searchFields: ["nama", "username", "role"],
    columns: [
      { key: "username", label: "Username" },
      { key: "nama", label: "Nama" },
      { key: "role", label: "Role", type: "badge" },
      { key: "posisi", label: "Posisi" },
      { key: "email", label: "Email" },
    ],
    formFields: (() => {
      const f = [
        { name: "username", label: "Username", type: "text", required: true },
        { name: "password", label: "Password Baru (kosongkan jika tidak diubah)", type: "text" },
        { name: "nama", label: "Nama Lengkap", type: "text", required: true },
        { name: "role", label: "Role", type: "select", required: true, options: ["HRD", "GM", "FINANCE", "SPV", "MANAGER", "SALES", "STAFF", "DRIVER", "WAREHOUSE"] },
        { name: "posisi", label: "Posisi / Jabatan", type: "text" },
        { name: "email", label: "Email", type: "text" },
        { name: "nik", label: "NIK (tautkan ke Master Karyawan)", type: "text", full: true },
      ];
      f.idFromField = "username";
      return f;
    })(),
    beforeSave: async (data, existing) => {
      const out = { ...data };
      if (data.password) { out.password_hash = await sha256(data.password); }
      delete out.password;
      if (!out.password_hash && existing) delete out.password_hash; // keep old hash on update if left blank
      out.username = String(out.username).toUpperCase();
      return out;
    }
  });
}

async function setupRbacMenuTab(container, users) {
  const select = container.querySelector("#rbac-user-select");
  select.innerHTML = users.map(u => `<option value="${u.id}">${escapeHtml(u.nama)} (${u.role})</option>`).join("");
  const grid = container.querySelector("#rbac-menu-grid");

  const groupLabel = { all: "Menu Utama", hrd: "Modul HRD", manajemen: "Modul Manajemen" };
  grid.innerHTML = MENU_CONFIG.map(m => `
    <label class="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-sm cursor-pointer">
      <input type="checkbox" data-menu="${m.id}" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-400">
      <span class="text-slate-700">${m.label}</span>
      <span class="text-[10px] text-slate-400 ml-auto">${groupLabel[m.group]}</span>
    </label>`).join("");

  async function loadForUser(username) {
    const overrides = await loadPermissionOverrides(true);
    const current = overrides[username]?.allowed_menus || [];
    grid.querySelectorAll("[data-menu]").forEach(cb => { cb.checked = current.includes(cb.dataset.menu); });
  }
  await loadForUser(select.value);
  select.addEventListener("change", () => loadForUser(select.value));

  container.querySelector("#rbac-menu-save").addEventListener("click", async () => {
    const username = select.value;
    const checked = Array.from(grid.querySelectorAll("[data-menu]:checked")).map(cb => cb.dataset.menu);
    try {
      await fsUpdate(COL.USER_PERMISSIONS, username, { allowed_menus: checked }).catch(async () => {
        await fsAdd(COL.USER_PERMISSIONS, { allowed_menus: checked, allowed_forms: [] }, username);
      });
      toast(`Hak akses menu untuk ${username} berhasil disimpan`, "success");
    } catch (e) { toast("Gagal menyimpan: " + e.message, "error"); }
  });
}

async function setupRbacFormTab(container, users) {
  const forms = await fsGetAll(COL.FORM_CONFIG);
  const select = container.querySelector("#rbac-form-user-select");
  select.innerHTML = users.map(u => `<option value="${u.id}">${escapeHtml(u.nama)} (${u.role})</option>`).join("");
  const grid = container.querySelector("#rbac-form-grid");

  if (!forms.length) { grid.innerHTML = emptyState("Belum ada formulir terdaftar di Form Builder"); }
  else grid.innerHTML = forms.map(f => `
    <label class="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-sm cursor-pointer">
      <input type="checkbox" data-form="${f.id}" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-400">
      <span class="text-slate-700">${escapeHtml(f.nama_form || f.id)}</span>
    </label>`).join("");

  async function loadForUser(username) {
    const overrides = await loadPermissionOverrides(true);
    const current = overrides[username]?.allowed_forms || [];
    grid.querySelectorAll("[data-form]").forEach(cb => { cb.checked = current.includes(cb.dataset.form); });
  }
  if (forms.length) { await loadForUser(select.value); select.addEventListener("change", () => loadForUser(select.value)); }

  container.querySelector("#rbac-form-save").addEventListener("click", async () => {
    const username = select.value;
    const checked = Array.from(grid.querySelectorAll("[data-form]:checked")).map(cb => cb.dataset.form);
    try {
      await fsUpdate(COL.USER_PERMISSIONS, username, { allowed_forms: checked }).catch(async () => {
        await fsAdd(COL.USER_PERMISSIONS, { allowed_forms: checked, allowed_menus: [] }, username);
      });
      toast(`Hak akses formulir untuk ${username} berhasil disimpan`, "success");
    } catch (e) { toast("Gagal menyimpan: " + e.message, "error"); }
  });
}
