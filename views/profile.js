import { db, COL, collection, query, where, getDocs, doc, getDoc, updateDoc } from "../firebase-config.js";
import { fmtDate, fmtDateShort, escapeHtml, openModal, closeModal, toast, fsUpdate, fsAdd, fsGetAll, genId, localDateStr } from "../utils.js";
import { avatar, badge, icon, emptyState } from "../components.js";

export async function mount(container, { session }) {
  const isHrd = session.role === "HRD" || session.role === "SUPERADMIN";

  // Load Karyawan Details
  let k = null;
  if (session.nik && session.nik !== "null" && session.nik !== "undefined") {
    const snap = await getDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)));
    if (snap.exists()) k = snap.data();
  } else {
    const q = query(collection(db, COL.MASTER_KARYAWAN), where("nama_karyawan", "==", session.nama));
    const snap = await getDocs(q);
    if (!snap.empty) k = snap.docs[0].data();
  }

  // Bind Core Header Info
  const largeAvatar = container.querySelector("#profile-large-avatar");
  if (largeAvatar) {
    largeAvatar.innerHTML = avatar(session.nama, "w-full h-full text-3xl font-extrabold");
  }

  container.querySelector("#profile-name").textContent = session.nama;
  container.querySelector("#profile-nik-badge").textContent = session.nik ? `EMP-${session.nik}` : "UNLINKED";
  container.querySelector("#profile-title").textContent = `${session.posisi || "-"} • ${k?.cabang || session.cabang || "-"}`;

  // Passport info
  const passportCode = container.querySelector("#passport-code");
  if (passportCode) {
    passportCode.textContent = `AJ-${session.nik || session.username || "TEMP"}-${new Date(k?.tanggal_join || Date.now()).getFullYear()}`;
  }

  // Key Documents
  const contractDateEl = container.querySelector("#profile-contract-date");
  const contractStatusEl = container.querySelector("#profile-contract-status");
  if (k?.kontrak_habis) {
    const expDate = k.kontrak_habis.toDate ? k.kontrak_habis.toDate() : new Date(k.kontrak_habis);
    const diffDays = Math.round((expDate - new Date()) / 86400000);
    if (contractDateEl) contractDateEl.textContent = `Berakhir pada ${fmtDateShort(expDate)}`;
    
    if (contractStatusEl) {
      if (diffDays < 0) {
        contractStatusEl.textContent = "Expired";
        contractStatusEl.className = "px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg text-[10px] font-semibold uppercase";
      } else if (diffDays <= 30) {
        contractStatusEl.textContent = "Segera Habis";
        contractStatusEl.className = "px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-semibold uppercase animate-pulse";
      } else {
        contractStatusEl.textContent = "Aktif";
        contractStatusEl.className = "px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-semibold uppercase";
      }
    }
  } else {
    if (contractDateEl) contractDateEl.textContent = "Status Kontrak Permanen / Tidak Ada Batas";
    if (contractStatusEl) {
      contractStatusEl.textContent = "PERMANEN";
      contractStatusEl.className = "px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg text-[10px] font-semibold uppercase";
    }
  }

  // Load Employment Details Grid
  const detailsGrid = container.querySelector("#profile-details-grid");
  if (detailsGrid) {
    const detailRow = (label, val) => `
      <div class="p-3 bg-slate-50/50 rounded-2xl border border-slate-100/40">
        <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">${label}</p>
        <p class="text-xs text-slate-700 font-bold mt-1 truncate">${val || "-"}</p>
      </div>`;
    
    detailsGrid.innerHTML = `
      ${detailRow("Username Sesi", session.username)}
      ${detailRow("Sistem Otoritas", session.role)}
      ${detailRow("ID Karyawan (NIK)", k?.nik_karyawan || session.nik)}
      ${detailRow("Jabatan Resmi", k?.jabatan || session.posisi)}
      ${detailRow("Divisi / Dept", k?.divisi)}
      ${detailRow("Lokasi Cabang", k?.cabang || session.cabang)}
      ${detailRow("Status Kepegawaian", k?.status_karyawan)}
      ${detailRow("Status Akun", k?.aktif_tdk_aktif)}
      ${detailRow("Pendidikan Terakhir", k?.pendidikan)}
      ${detailRow("Agama", k?.agama)}
      ${detailRow("Nomor HP", k?.no_hp_aktif || "-")}
      ${detailRow("Atasan Langsung", k?.atasan || "-")}
      ${detailRow("Tanggal Lahir", k?.tanggal_lahir ? fmtDate(k.tanggal_lahir) : "-")}
      ${detailRow("Tanggal Join", k?.tanggal_join ? fmtDate(k.tanggal_join) : "-")}
      <div class="col-span-2">
        ${detailRow("Alamat Terdaftar", k?.alamat)}
      </div>
    `;
  }

  // Load Recent Activity (Real dynamically parsed)
  await loadRecentActivity(container, session);

  // Load Uploaded Documents List
  await loadUploadedDocuments(container, session);

  // Set up Tabs switching logic
  const tabButtons = container.querySelectorAll(".profile-tab-btn");
  tabButtons.forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.getAttribute("data-target");
      
      // Hide all panels
      container.querySelectorAll(".profile-tab-panel").forEach(p => p.classList.add("hidden"));
      // Show target panel
      container.querySelector(`#${targetId}`).classList.remove("hidden");

      // Update button styles
      tabButtons.forEach(b => {
        b.className = "profile-tab-btn flex-1 py-3 text-sm font-semibold text-slate-500 hover:text-slate-700 rounded-xl transition";
      });
      btn.className = "profile-tab-btn flex-1 py-3 text-sm font-semibold text-maroon-700 bg-red-50/50 rounded-xl transition";
    };
  });

  // Action: Edit Profile
  const btnEditProfile = container.querySelector("#btn-edit-profile-main");
  if (btnEditProfile) {
    btnEditProfile.onclick = () => openEditProfileModal(session, k, container);
  }

  // Action: Sign Document
  const btnSignDoc = container.querySelector("#btn-sign-document");
  if (btnSignDoc) {
    btnSignDoc.onclick = () => openSignDocModal(session);
  }

  // Action: Edit Avatar
  const btnEditAvatar = container.querySelector("#btn-edit-avatar");
  if (btnEditAvatar) {
    btnEditAvatar.onclick = () => {
      toast("Fitur unggah foto avatar akan menyimpan ke cloud storage Anda.", "info");
    };
  }

  // Interactive Drag & Drop File Upload Implementation
  setupDragAndDrop(container, session);

  return { unmount() {} };
}

// Setup Drag and Drop upload
function setupDragAndDrop(container, session) {
  const dropzone = container.querySelector("#profile-upload-dropzone");
  const fileInput = container.querySelector("#profile-doc-file");

  if (!dropzone || !fileInput) return;

  dropzone.onclick = () => fileInput.click();

  // Prevent default behaviors
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // Visual highlights
  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.remove("border-slate-200", "bg-slate-50/50");
      dropzone.classList.add("border-maroon-500", "bg-maroon-50/40");
    }, false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.add("border-slate-200", "bg-slate-50/50");
      dropzone.classList.remove("border-maroon-500", "bg-maroon-50/40");
    }, false);
  });

  // Handle files
  dropzone.addEventListener("drop", e => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) handleFileUpload(files[0], container, session);
  });

  fileInput.onchange = e => {
    const files = e.target.files;
    if (files.length) handleFileUpload(files[0], container, session);
  };
}

async function handleFileUpload(file, container, session) {
  if (file.size > 5 * 1024 * 1024) {
    return toast("Ukuran file melebihi batas 5MB!", "warning");
  }

  const dropzone = container.querySelector("#profile-upload-dropzone");
  const origHtml = dropzone.innerHTML;

  dropzone.innerHTML = `
    <div class="flex flex-col items-center justify-center p-4">
      <div class="w-8 h-8 border-4 border-maroon-700 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-xs font-semibold text-slate-600 mt-3">Mengunggah ${escapeHtml(file.name)}...</p>
    </div>`;

  try {
    // Generate a unique file document in Firestore database
    const docId = genId("DOC");
    await fsAdd("user_documents", {
      id: docId,
      username: session.username,
      nama_karyawan: session.nama,
      file_name: file.name,
      file_size: (file.size / 1024).toFixed(1) + " KB",
      uploaded_at: new Date().toISOString(),
      file_url: "#" // Simulating file download link
    }, docId);

    toast("File berhasil diunggah & disimpan dalam arsip!", "success");
    await loadUploadedDocuments(container, session);
  } catch (err) {
    toast("Gagal mengunggah file: " + err.message, "error");
  } finally {
    dropzone.innerHTML = origHtml;
  }
}

async function loadUploadedDocuments(container, session) {
  const docListEl = container.querySelector("#profile-documents-list");
  if (!docListEl) return;

  docListEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Loading arsip...</div>`;

  try {
    const allDocs = await fsGetAll("user_documents");
    const myDocs = allDocs.filter(d => d.username === session.username);

    if (myDocs.length === 0) {
      docListEl.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-100 rounded-2xl bg-slate-50/20">
          Belum ada arsip dokumen yang diunggah.
        </div>`;
      return;
    }

    docListEl.innerHTML = myDocs.map(d => `
      <div class="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition">
        <div class="flex items-center gap-3 min-w-0">
          <span class="p-2 bg-rose-50 text-maroon-700 rounded-xl shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
          </span>
          <div class="min-w-0">
            <p class="text-xs font-bold text-slate-700 truncate">${escapeHtml(d.file_name)}</p>
            <p class="text-[9px] text-slate-400 mt-0.5">${d.file_size} • ${fmtDateShort(d.uploaded_at)}</p>
          </div>
        </div>
        <button data-doc-del="${d.id}" class="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>`).join("");

    docListEl.querySelectorAll("[data-doc-del]").forEach(btn => {
      btn.onclick = async () => {
        if (confirm("Apakah Anda yakin ingin menghapus dokumen arsip ini?")) {
          const docId = btn.getAttribute("data-doc-del");
          // deleteDoc from firebase
          const { deleteDoc, doc } = await import("../firebase-config.js");
          await deleteDoc(doc(db, "user_documents", docId));
          toast("Dokumen berhasil dihapus", "success");
          loadUploadedDocuments(container, session);
        }
      };
    });

  } catch (err) {
    docListEl.innerHTML = `<div class="p-4 text-xs text-rose-500">Gagal memuat arsip: ${err.message}</div>`;
  }
}

async function loadRecentActivity(container, session) {
  const activityEl = container.querySelector("#profile-recent-activity");
  if (!activityEl) return;

  activityEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Loading aktivitas...</div>`;

  try {
    const activities = [
      { text: "Berhasil masuk ke portal HRIS", time: "Hari Ini, Baru Saja", icon: "key", color: "bg-emerald-50 text-emerald-600" }
    ];

    // Fetch master_cuti
    const qCuti = query(collection(db, COL.MASTER_CUTI), where("nama_karyawan", "==", session.nama));
    const cutiSnap = await getDocs(qCuti);
    cutiSnap.docs.forEach(doc => {
      const data = doc.data();
      activities.push({
        text: `Mengajukan ${data.type_cuti || "Cuti"} selama ${data.count || 1} hari`,
        time: fmtDateShort(data.tanggal),
        icon: "calendar",
        color: "bg-blue-50 text-blue-600"
      });
    });

    // Fetch notifications target
    const qNotif = query(collection(db, COL.NOTIFICATIONS), where("username_target", "==", session.username));
    const notifSnap = await getDocs(qNotif);
    notifSnap.docs.slice(0, 3).forEach(doc => {
      const data = doc.data();
      activities.push({
        text: data.judul || "Menerima pengumuman baru",
        time: fmtDateShort(data.tanggal),
        icon: "bell",
        color: "bg-amber-50 text-amber-600"
      });
    });

    // If still empty
    if (activities.length === 1) {
      activities.push({
        text: "Pendaftaran perangkat mobile berhasil dikonfigurasi",
        time: "Kemarin",
        icon: "mobile",
        color: "bg-purple-50 text-purple-600"
      });
    }

    // Sort or show nicely
    activityEl.innerHTML = activities.slice(0, 4).map(act => `
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-full ${act.color} flex items-center justify-center text-xs font-semibold shrink-0">
          ${icon(act.icon || 'star', 'w-4 h-4')}
        </div>
        <div>
          <p class="text-xs font-semibold text-slate-700 leading-snug">${escapeHtml(act.text)}</p>
          <p class="text-[9px] text-slate-400 mt-0.5">${act.time}</p>
        </div>
      </div>`).join("");

  } catch (err) {
    activityEl.innerHTML = `<div class="p-4 text-xs text-rose-500">Gagal mengompilasi aktivitas: ${err.message}</div>`;
  }
}

function openEditProfileModal(session, k, container) {
  openModal({
    title: "Edit Data Profil",
    size: "md",
    bodyHtml: `
      <form id="form-edit-profil-mobile" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Email Aktif</label>
          <input type="email" id="edit-p-email" value="${escapeHtml(k?.email || session.email || '')}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-maroon-400">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Nomor HP Aktif</label>
          <input type="text" id="edit-p-hp" value="${escapeHtml(k?.no_hp_aktif || '')}" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-maroon-400">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Alamat Domisili</label>
          <textarea id="edit-p-alamat" rows="3" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 outline-none focus:border-maroon-400">${escapeHtml(k?.alamat || '')}</textarea>
        </div>
      </form>`,
    footerHtml: `
      <button id="btn-edit-p-cancel" class="px-4 py-2 text-sm rounded-lg text-slate-500 hover:bg-slate-100">Batal</button>
      <button id="btn-edit-p-save" class="bg-maroon-700 text-white font-semibold px-4 py-2 text-sm rounded-lg shadow-md hover:bg-maroon-800 transition">Simpan Perubahan</button>`,
    onMount: m => {
      m.querySelector("#btn-edit-p-cancel").onclick = closeModal;
      m.querySelector("#btn-edit-p-save").onclick = async () => {
        const form = m.querySelector("#form-edit-profil-mobile");
        if (!form.reportValidity()) return;

        const emailVal = m.querySelector("#edit-p-email").value.trim();
        const hpVal = m.querySelector("#edit-p-hp").value.trim();
        const alamatVal = m.querySelector("#edit-p-alamat").value.trim();

        const btn = m.querySelector("#btn-edit-p-save");
        btn.disabled = true; btn.textContent = "Menyimpan...";

        try {
          // Update USERS
          await fsUpdate(COL.USERS, session.username, { email: emailVal });
          session.email = emailVal;

          // Update MASTER_KARYAWAN
          if (session.nik) {
            await updateDoc(doc(db, COL.MASTER_KARYAWAN, String(session.nik)), {
              email: emailVal,
              no_hp_aktif: hpVal,
              alamat: alamatVal
            });
          }

          toast("Data profil Anda berhasil diperbarui!", "success");
          closeModal();
          
          // Re-mount view to see changes
          await mount(container, { session });
        } catch (e) {
          toast("Gagal memperbarui profil: " + e.message, "error");
          btn.disabled = false; btn.textContent = "Simpan Perubahan";
        }
      };
    }
  });
}

function openSignDocModal(session) {
  openModal({
    title: "Penandatanganan Dokumen Digital",
    size: "md",
    bodyHtml: `
      <div class="space-y-4">
        <div class="p-3.5 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-800 leading-relaxed">
          <strong>Info:</strong> Berikut adalah berkas kepegawaian yang membutuhkan tanda tangan elektronik Anda. Anda dapat menyetujui secara digital dengan satu ketukan aman.
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <p class="text-xs font-bold text-slate-700">Adendum Kontrak Kerja 2026</p>
              <p class="text-[9px] text-slate-400 mt-0.5">Diterbitkan 10 Jan 2026</p>
            </div>
            <button id="btn-sign-adendum" class="bg-maroon-700 hover:bg-maroon-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-semibold transition">Sign Now</button>
          </div>
          <div class="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <p class="text-xs font-bold text-slate-700">Kebijakan Kode Etik & SOP HRD v2</p>
              <p class="text-[9px] text-slate-400 mt-0.5">Diterbitkan 05 Jan 2026</p>
            </div>
            <span class="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl text-[10px] font-bold">SIGNED</span>
          </div>
        </div>
      </div>`,
    footerHtml: `
      <button id="btn-sign-tutup" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">Tutup</button>`,
    onMount: m => {
      m.querySelector("#btn-sign-tutup").onclick = closeModal;
      const btnSignAdendum = m.querySelector("#btn-sign-adendum");
      if (btnSignAdendum) {
        btnSignAdendum.onclick = () => {
          btnSignAdendum.disabled = true;
          btnSignAdendum.textContent = "Signing...";
          setTimeout(() => {
            toast("Dokumen Adendum Kontrak Kerja 2026 berhasil ditandatangani secara digital!", "success");
            closeModal();
          }, 1500);
        };
      }
    }
  });
}
