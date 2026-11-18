/**
 * Helper tautan publik formulir.
 *
 * Tautan ringkas seperti https://andela-hris.vercel.app/formulir-cuti
 * dialihkan ke Google Form yang terhubung. Logika di sini murni (tanpa DOM)
 * agar mudah diuji dan dipakai ulang oleh Form Builder maupun halaman
 * pengalihan form-link.html.
 */

export const MAX_PUBLIC_SLUG_LENGTH = 60;

// Path yang tidak boleh dipakai sebagai nama formulir. Semua ini sudah
// memiliki arti lain di aplikasi atau di Vercel.
export const RESERVED_PUBLIC_SLUGS = Object.freeze(new Set([
  "api",
  "assets",
  "css",
  "js",
  "views",
  "docs",
  "fonts",
  "index",
  "form-link",
  "super-migrasi",
  "login",
  "logout",
  "manifest",
  "sw",
  "firebase-applet-config",
  "favicon"
]));

export function slugifyFormName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_PUBLIC_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Ambil slug dari pathname. Mendukung bentuk "/formulir-cuti" dan
 * "/f/formulir-cuti". Path dengan lebih dari satu segmen (selain awalan /f)
 * dianggap bukan tautan formulir.
 */
export function parsePublicFormSlug(pathname) {
  const raw = String(pathname || "").split("?")[0].split("#")[0];
  const segments = raw.split("/").filter(Boolean);
  if (!segments.length) return "";

  let candidate = segments[0];
  let consumed = 1;
  if (candidate.toLowerCase() === "f") {
    if (!segments[1]) return "";
    candidate = segments[1];
    consumed = 2;
  }
  if (segments.length !== consumed) return "";

  try {
    candidate = decodeURIComponent(candidate);
  } catch (_) {
    return "";
  }
  return candidate.trim().toLowerCase();
}

export function isReservedPublicSlug(slug) {
  const value = String(slug || "").trim().toLowerCase();
  return !value || RESERVED_PUBLIC_SLUGS.has(value);
}

function parseUrl(value) {
  try {
    return new URL(String(value || "").trim());
  } catch (_) {
    return null;
  }
}

/**
 * Ubah URL Google Form apa pun (termasuk URL edit) menjadi tautan isian
 * publik. URL non-Google dikembalikan apa adanya bila HTTPS.
 */
export function toPublicFormUrl(value) {
  const url = parseUrl(value);
  if (!url) return "";
  if (url.protocol !== "https:") return "";

  const host = url.hostname.toLowerCase();
  if (host === "docs.google.com" || host === "forms.gle") {
    if (host === "forms.gle") return url.toString();
    const match = url.pathname.match(/^\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]{10,})(?:\/.*)?$/);
    if (match) return `https://docs.google.com/forms/d/e/${match[1]}/viewform`;
  }
  return url.toString();
}

export function publicFormUrlFor(definition = {}) {
  const direct = toPublicFormUrl(definition.google_form_url);
  if (direct) return direct;
  const id = String(definition.google_form_id || "").trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    return `https://docs.google.com/forms/d/${id}/viewform`;
  }
  return "";
}

export function buildPublicFormLinkDoc(input = {}) {
  const formId = String(input.formId || input.form_id || "").trim();
  if (!formId) throw new Error("ID formulir HRIS wajib diisi untuk tautan publik.");
  return {
    form_id: formId,
    nama_form: String(input.namaForm || input.nama_form || formId).trim().slice(0, 200),
    google_form_url: publicFormUrlFor(input),
    active: input.active !== false
  };
}

/**
 * Tentukan hasil kunjungan tautan publik.
 * status: "ok" | "missing" | "inactive"
 */
export function resolvePublicLinkTarget(data) {
  if (!data) return { status: "missing" };
  if (data.active === false) return { status: "inactive" };
  const url = publicFormUrlFor({
    google_form_url: data.google_form_url,
    google_form_id: data.google_form_id
  });
  if (!url) return { status: "missing" };
  return { status: "ok", url };
}

/**
 * Pilih slug yang belum dipakai. Bentrok ditangani dengan akhiran -2 sampai
 * -6 agar tetap mudah dibaca. Mengembalikan "" bila semua kandidat terpakai
 * (praktis tidak terjadi) supaya pemanggil bisa memberi pesan yang jelas.
 */
export function pickAvailableSlug(preferred, taken = new Set()) {
  const base = slugifyFormName(preferred);
  if (!base) return "";
  const safeBase = isReservedPublicSlug(base) ? `${base}-form` : base;
  const has = (slug) => (taken instanceof Set ? taken.has(slug) : Array.isArray(taken) && taken.includes(slug));
  if (!has(safeBase)) return safeBase;
  for (let i = 2; i <= 6; i += 1) {
    const candidate = `${safeBase}-${i}`;
    if (!has(candidate)) return candidate;
  }
  return "";
}

/**
 * Tautan ringkas yang ditampilkan ke HRD. origin dipisah agar mudah diuji.
 */
export function publicShortLink(origin, slug) {
  const base = String(origin || "").replace(/\/+$/, "");
  const value = String(slug || "").trim();
  if (!base || !value) return "";
  return `${base}/${value}`;
}
