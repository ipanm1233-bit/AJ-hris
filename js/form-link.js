/**
 * Halaman pengalihan tautan ringkas: /{nama-formulir} -> Google Form.
 * Hanya membaca satu dokumen `form_public_links/{slug}`, tanpa Auth.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { initializeFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  isReservedPublicSlug,
  parsePublicFormSlug,
  resolvePublicLinkTarget
} from "./form-link.mjs";

const FALLBACK_CONFIG = {
  apiKey: "AIzaSyB7hYGj4DmellhfggbDbzQdubeL3T8lKHM",
  authDomain: "gen-lang-client-0670613891.firebaseapp.com",
  projectId: "gen-lang-client-0670613891",
  storageBucket: "gen-lang-client-0670613891.firebasestorage.app",
  messagingSenderId: "558851473740",
  appId: "1:558851473740:web:bb87504a9d5f324aec4fe9"
};
const FALLBACK_DATABASE_ID = "ai-studio-ajhris-b3979000-ada8-4821-9f1a-49af228e2acb";
const READ_TIMEOUT_MS = 10_000;

const els = {
  icon: document.getElementById("state-icon"),
  title: document.getElementById("state-title"),
  message: document.getElementById("state-message"),
  action: document.getElementById("state-action"),
  hint: document.getElementById("state-hint")
};

function setState({ title, message, icon = "info", action = null, hint = "" } = {}) {
  if (els.icon) {
    els.icon.innerHTML = icon === "loading"
      ? '<div class="spinner" aria-hidden="true"></div>'
      : icon === "error"
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>';
  }
  if (els.title) els.title.textContent = title;
  if (els.message) els.message.textContent = message;
  if (els.hint) els.hint.textContent = hint;
  if (els.action) {
    if (action) {
      els.action.hidden = false;
      els.action.textContent = action.label;
      els.action.href = action.href;
    } else {
      els.action.hidden = true;
    }
  }
}

async function readFirebaseConfig() {
  try {
    const response = await fetch("/firebase-applet-config.json", { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return { config: FALLBACK_CONFIG, databaseId: FALLBACK_DATABASE_ID };
    const data = await response.json();
    if (!data || !data.apiKey || !data.projectId) return { config: FALLBACK_CONFIG, databaseId: FALLBACK_DATABASE_ID };
    return { config: data, databaseId: data.firestoreDatabaseId || "" };
  } catch (_) {
    return { config: FALLBACK_CONFIG, databaseId: FALLBACK_DATABASE_ID };
  }
}

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  const slug = parsePublicFormSlug(window.location.pathname);

  if (!slug) {
    setState({
      title: "Tautan formulir tidak lengkap",
      message: "Periksa kembali tautan yang Anda terima, atau hubungi HRD untuk meminta tautan terbaru.",
      icon: "info",
      action: { label: "Buka HRIS", href: "/#login" }
    });
    return;
  }

  if (isReservedPublicSlug(slug)) {
    if (slug === "api") {
      setState({
        title: "Halaman tidak ditemukan",
        message: "Alamat ini bukan tautan formulir.",
        icon: "info",
        action: { label: "Buka HRIS", href: "/#login" }
      });
      return;
    }
    window.location.replace(slug === "login" ? "/#login" : "/");
    return;
  }

  setState({
    title: "Membuka formulir…",
    message: "Mohon tunggu sebentar, Anda akan diarahkan otomatis.",
    icon: "loading",
    hint: `Tautan: /${slug}`
  });

  const { config, databaseId } = await readFirebaseConfig();
  const app = initializeApp(config, "public-form-link");
  const db = databaseId
    ? initializeFirestore(app, {}, databaseId)
    : initializeFirestore(app, {});

  let snapshot;
  try {
    snapshot = await withTimeout(getDoc(doc(db, "form_public_links", slug)), READ_TIMEOUT_MS);
  } catch (error) {
    console.warn("[form-link] Gagal membaca tautan:", error.message);
    setState({
      title: "Gagal memuat tautan",
      message: "Koneksi ke server sedang bermasalah. Periksa jaringan Anda lalu coba lagi.",
      icon: "error",
      action: { label: "Coba Lagi", href: window.location.pathname }
    });
    return;
  }

  const target = resolvePublicLinkTarget(snapshot.exists() ? snapshot.data() : null);

  if (target.status === "inactive") {
    setState({
      title: "Formulir belum dipublikasikan",
      message: "Formulir ini sedang tidak menerima respons. Hubungi HRD bila Anda tetap perlu mengisi formulir.",
      icon: "info",
      action: { label: "Buka HRIS", href: "/#login" }
    });
    return;
  }

  if (target.status !== "ok") {
    setState({
      title: "Tautan formulir tidak ditemukan",
      message: "Tautan mungkin sudah berubah atau salah ketik. Minta tautan terbaru kepada HRD.",
      icon: "info",
      action: { label: "Buka HRIS", href: "/#login" }
    });
    return;
  }

  setState({
    title: "Mengalihkan ke formulir…",
    message: "Anda akan dibawa ke halaman Google Form.",
    icon: "loading",
    hint: "Jika tidak berpindah otomatis, klik tombol di bawah.",
    action: { label: "Buka Formulir", href: target.url }
  });
  window.location.replace(target.url);
}

main();
