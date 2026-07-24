/* =====================================================================
   STYLE.CSS - Andela Jaya HRIS
   Pelengkap Tailwind: animasi transisi SPA halus, state sidebar,
   scrollbar custom, dan micro-interactions.
   ===================================================================== */
html { scroll-behavior: smooth; }
body { -webkit-font-smoothing: antialiased; }

/* --- Fade-in setiap kali view berpindah (efek halus, anti-kedip) --- */
@keyframes fadein {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fadein { animation: fadein .28s ease-out; }

/* --- Sidebar collapsed state (toggle) --- */
#sidebar.collapsed { width: 4.5rem; }
#sidebar.collapsed .sidebar-label, #sidebar.collapsed .sidebar-group-title { display: none; }
#sidebar.collapsed .sidebar-item { justify-content: center; }
#main-content.expanded { margin-left: 4.5rem !important; }

@media (max-width: 1024px) {
  #sidebar { transform: translateX(-100%); box-shadow: 0 10px 40px rgba(0,0,0,.15); }
  #sidebar.mobile-open { transform: translateX(0); }
  #main-content { margin-left: 0 !important; padding-bottom: 5rem !important; }
}

/* --- Sidebar nav item --- */
.sidebar-item {
  display: flex; align-items: center; gap: .75rem;
  padding: .6rem .75rem; border-radius: .65rem;
  color: #475569; font-size: .875rem; font-weight: 500;
  transition: background-color .15s ease, color .15s ease, transform .1s ease;
  cursor: pointer; white-space: nowrap;
}
.sidebar-item:hover { background-color: #fbf3f3; color: #7a1f2b; }
.sidebar-item.active { background-color: #7a1f2b; color: #fff; box-shadow: 0 4px 12px -2px rgba(122,31,43,0.35); }
.sidebar-item:active { transform: scale(0.98); }

.sidebar-group-title {
  font-size: .68rem; font-weight: 700; letter-spacing: .06em; color: #94a3b8;
  text-transform: uppercase; padding: 1rem .75rem .35rem;
}

/* --- Custom scrollbar --- */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 8px; }
::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

/* --- Loading spinner kecil --- */
.spinner {
  width: 1.1rem; height: 1.1rem; border-radius: 9999px;
  border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* --- Kartu dashboard hover lift --- */
.card-hover { transition: transform .18s ease, box-shadow .18s ease; }
.card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -8px rgba(15,23,42,.12); }

/* --- Drag & drop form builder --- */
.fb-field.dragging { opacity: .4; }
.fb-dropline { height: 3px; background: #7a1f2b; border-radius: 3px; margin: 2px 0; }

/* --- Print-friendly (untuk slip/laporan) --- */
@media print {
  #app-shell header, #sidebar, #toast-host, .no-print { display: none !important; }
  #main-content { margin: 0 !important; padding: 0 !important; }
}

/* --- CSS untuk Quill Memo Reader (Rich Text) --- */
.quill-content h1, .quill-content h2, .quill-content h3 { font-weight: bold; margin-bottom: 0.5em; }
.quill-content p { margin-bottom: 0.7em; line-height: 1.5; }
.quill-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1em; }
.quill-content ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1em; }
.quill-content a { color: #7a1f2b; text-decoration: underline; }

/* =====================================================================
   MOBILE UI OPTIMIZATION & SYMMETRICAL ASPECT RATIOS
   ===================================================================== */
@media (max-width: 640px) {
  body { overflow-x: hidden; }

  /* Ensure main content container fits mobile screen padding symmetrically */
  #main-content {
    padding-left: 0.75rem !important;
    padding-right: 0.75rem !important;
    padding-top: 4.25rem !important;
    padding-bottom: 5.5rem !important;
  }

  /* Touch horizontal scrolling for tables */
  .overflow-x-auto {
    -webkit-overflow-scrolling: touch;
    width: 100%;
  }

  /* Ensure text inputs do not trigger iOS auto-zoom and fit screen width */
  input, select, textarea {
    font-size: 14px !important;
    max-width: 100%;
  }

  /* Symmetrical padding on cards for mobile screens */
  .bg-white.rounded-2xl, .bg-white.rounded-xl {
    padding: 1rem !important;
    border-radius: 1rem !important;
  }

  /* Mobile bottom navigation bar alignment */
  .mobile-bottom-nav {
    display: flex !important;
    justify-content: space-around !important;
    align-items: center !important;
  }

  /* Make stacked modal dialogs fill 92% screen width symmetrically */
  .modal-dialog, [id^="modal-"] > div {
    width: 94% !important;
    max-width: 94vw !important;
    margin: auto !important;
    border-radius: 1.25rem !important;
  }
}
