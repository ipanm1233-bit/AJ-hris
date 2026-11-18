import { COL } from "../firebase-config.js";
import { fsGet, fsGetAll, fsUpdate, toast } from "../utils.js";
import { authFetch } from "../api-client.js";
import { isReservedPublicSlug, pickAvailableSlug, publicFormUrlFor, publicShortLink } from "../form-link.mjs";
import { extractGoogleFormId } from "../google-form-module.mjs";

/**
 * Integrasi Google Form untuk modul TNA dan KPI 360.
 *
 * Alur yang dipakai sama dengan Form Builder: Google Form tetap milik
 * organisasi (gratis), lalu tautan ringkas HRIS menjadi pintu distribusinya.
 * Fungsi di sini tidak membuat Google Form lewat API berbayar; Apps Script
 * yang dihasilkan server dapat membuat form baru secara gratis.
 */

export function originForShare() {
  try {
    return window.location.origin;
  } catch (_) {
    return "";
  }
}

async function formApi(payload) {
  const response = await authFetch("/api/sync-absen", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  let data = {};
  try { data = await response.json(); } catch (_) { data = {}; }
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || `Permintaan gagal (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function ensurePublicShortLink(form, definition) {
  if (!form || !definition) return "";
  const formId = form.id;
  const url = publicFormUrlFor({
    google_form_url: definition.google_form_url,
    google_form_id: definition.google_form_id
  });
  if (!url) return "";

  let slug = String(form.public_slug || "").trim().toLowerCase();
  if (slug && isReservedPublicSlug(slug)) slug = "";
  if (slug) {
    const existing = await fsGet(COL.FORM_PUBLIC_LINKS, slug).catch(() => null);
    if (existing && existing.form_id && existing.form_id !== formId) slug = "";
  }

  if (!slug) {
    const links = await fsGetAll(COL.FORM_PUBLIC_LINKS).catch(() => []);
    const taken = new Set((links || []).map(item => item.id));
    const preferred = form.nama_form || definition.nama_form || formId;
    let candidate = pickAvailableSlug(preferred, taken);
    let guard = 0;
    while (candidate && guard < 6) {
      const existing = await fsGet(COL.FORM_PUBLIC_LINKS, candidate).catch(() => null);
      if (!existing || !existing.form_id || existing.form_id === formId) break;
      taken.add(candidate);
      candidate = pickAvailableSlug(preferred, taken);
      guard += 1;
    }
    slug = candidate;
    if (!slug) return "";
  }

  await fsUpdate(COL.FORM_PUBLIC_LINKS, slug, {
    form_id: formId,
    nama_form: form.nama_form || definition.nama_form || formId,
    google_form_url: url,
    google_form_id: definition.google_form_id || "",
    active: definition.active !== false,
    modul: form.modul || ""
  });
  if (slug !== form.public_slug) {
    await fsUpdate(COL.FORM_CONFIG, formId, { public_slug: slug });
    form.public_slug = slug;
  }
  return slug;
}

/**
 * Simpan konfigurasi form modul, daftarkan ke integrasi Google Form, lalu
 * siapkan tautan ringkas. Bila server integrasi belum dikonfigurasi, konfigurasi
 * tetap disimpan dan HRD masih dapat memakai URL Google Form langsung.
 */
export async function prepareModuleGoogleForm({ formConfig, googleFormUrl = "", fields = [], meta = {} }) {
  const url = publicFormUrlFor({ google_form_url: googleFormUrl });
  const googleFormId = extractGoogleFormId(googleFormUrl);
  // Simpan selalu URL publik yang valid. Bila HRD hanya menempel ID, bentuk
  // tautan /d/<id>/viewform (Google akan mengalihkan ke ID publiknya).
  const effectiveUrl = url
    || (googleFormId ? publicFormUrlFor({ google_form_id: googleFormId }) : "")
    || String(googleFormUrl || "").trim();
  const form = {
    ...formConfig,
    google_form_url: effectiveUrl,
    google_form_id: googleFormId,
    module_meta: meta || formConfig.module_meta || {}
  };
  await fsUpdate(COL.FORM_CONFIG, form.id, form);

  const result = { form, definition: null, appsScript: "", slug: "", shortLink: "", error: "" };
  try {
    const registered = await formApi({
      action: "form_register",
      formId: form.id,
      namaForm: form.nama_form,
      googleFormUrl: effectiveUrl,
      googleFormId,
      fields
    });
    result.definition = registered.definition || null;
    result.appsScript = registered.appsScript || "";
    if (result.definition) {
      result.slug = await ensurePublicShortLink(form, result.definition);
      result.shortLink = result.slug ? publicShortLink(originForShare(), result.slug) : "";
    }
  } catch (error) {
    result.error = error.message || "Integrasi Google Form belum aktif.";
  }
  return result;
}

export async function importModuleGoogleFormResponses(formId) {
  if (!formId) throw new Error("ID formulir tidak valid.");
  return formApi({ action: "form_import", formId, importAll: true, batchSize: 50 });
}

export async function listModuleGoogleFormSubmissions(formId) {
  if (!formId) return [];
  const data = await formApi({ action: "form_submissions", formId, status: "RECEIVED", limit: 100 });
  return Array.isArray(data.submissions) ? data.submissions : [];
}

export function shareLinkMarkup(shortLink, googleUrl) {
  const parts = [];
  if (shortLink) {
    parts.push(`<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p class="text-[11px] font-bold text-emerald-900">Tautan ringkas HRIS (paling mudah dibagikan)</p>
      <div class="mt-1 flex items-center gap-2">
        <input readonly value="${escapeAttr(shortLink)}" class="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-mono">
        <button type="button" data-copy-link="${escapeAttr(shortLink)}" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Salin</button>
      </div>
    </div>`);
  }
  if (googleUrl) {
    parts.push(`<div class="rounded-xl border border-slate-200 bg-white p-3">
      <p class="text-[11px] font-bold text-slate-700">Tautan Google Form asli</p>
      <div class="mt-1 flex items-center gap-2">
        <input readonly value="${escapeAttr(googleUrl)}" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono">
        <button type="button" data-copy-link="${escapeAttr(googleUrl)}" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">Salin</button>
        <a href="${escapeAttr(googleUrl)}" target="_blank" rel="noopener" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">Buka</a>
      </div>
    </div>`);
  }
  return parts.join("");
}

export function wireCopyButtons(root) {
  if (!root) return;
  root.querySelectorAll("[data-copy-link]").forEach(button => {
    button.onclick = async () => {
      const value = button.dataset.copyLink || "";
      try {
        await navigator.clipboard.writeText(value);
        toast("Tautan disalin.", "success");
      } catch (_) {
        const input = button.parentElement?.querySelector("input");
        if (input) {
          input.select();
          document.execCommand("copy");
          toast("Tautan disalin.", "success");
        } else {
          toast("Salin manual: " + value, "info");
        }
      }
    };
  });
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
