import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, genId, escapeHtml, fmtDateTime, sendEmailNotif, sendFCMNotif } from "../utils.js";
// PERUBAHAN: lampiran memo kini diupload ke Google Drive, bukan Firebase Storage.
import { uploadFileToDrive } from "../gas-integration.js";
import { avatar, badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const listEl = container.querySelector("#bc-list");
  listEl.innerHTML = skeletonRows(3);
  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const users = await fsGetAll(COL.USERS);

  async function load() {
    const allRows = await fsGetAll(COL.BROADCAST);
    allRows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    
    const userRole = (session?.role || "").toUpperCase();
    const isHrd = ["HRD", "SUPERADMIN", "ADMIN"].includes(userRole);

    const isRecipient = (r) => {
      if (isHrd) return true;
      if (r.dibuat_oleh && r.dibuat_oleh.toLowerCase() === String(session?.nama || "").toLowerCase()) return true;
      if (!r.target_type || r.target_type === "ALL") return true;
      if (r.target_type === "SPESIFIK") {
        const list = (r.target_list || []).map(x => String(x || "").trim().toLowerCase());
        const myName = String(session?.nama || "").trim().toLowerCase();
        const myUsername = String(session?.username || "").trim().toLowerCase();
        const myNik = String(session?.nik || "").trim().toLowerCase();
        return list.some(target => 
          target === myName || 
          target === myUsername || 
          (myNik && target === myNik) ||
          (myName && (target.includes(myName) || myName.includes(target)))
        );
      }
      return true;
    };

    const rows = allRows.filter(isRecipient);
    
    if (!rows.length) { listEl.innerHTML = emptyState("Belum ada memo yang diterbitkan"); return; }
    
    listEl.innerHTML = rows.map(r => `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div class="flex items-start gap-3">
          ${avatar(r.dibuat_oleh || "?", "w-10 h-10")}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <p class="font-semibold text-slate-800">${escapeHtml(r.judul)}</p>
              <span class="text-xs text-slate-400">${fmtDateTime(r.tanggal)}</span>
            </div>
            <div class="text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 quill-content">
              ${r.isi}
            </div>
            ${r.lampiran_url ? `<a href="${escapeHtml(r.lampiran_url)}" target="_blank" class="inline-flex items-center gap-1 mt-2 text-xs font-medium text-maroon-700 hover:underline"><svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg><span>Lihat Lampiran</span></a>` : ''}
            <div class="flex items-center gap-2 mt-3">
              ${badge(r.target_type === "SPESIFIK" ? `${(r.target_list || []).length} Karyawan Terpilih` : "Seluruh Karyawan", "maroon")}
              <span class="text-xs text-slate-400">oleh ${escapeHtml(r.dibuat_oleh || "-")} • Berakhir: ${r.tanggal_berakhir || "Tanpa Batas"}</span>
            </div>
          </div>
        </div>
      </div>`).join("");
  }
  
  await load();
  container.querySelector("#bc-new").addEventListener("click", () => openComposeModal(container, session, karyawan, users, load));
  return { unmount() {} };
}

function openComposeModal(container, session, karyawan, users, reload) {
  openModal({
    title: "Buat Memo Baru",
    size: "lg",
    bodyHtml: `
      <form id="bc-form" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Judul Memo</label>
          <input name="judul" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Isi Pengumuman</label>
          <div id="editor-container" class="w-full text-sm rounded-lg border border-slate-200" style="height: 220px; background: white;"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Target Penerima</label>
            <select id="bc-target-type" name="target_type" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
              <option value="ALL">Seluruh Karyawan</option>
              <option value="SPESIFIK">Karyawan Tertentu</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1.5">Deadline Tayang di Dashboard</label>
            <input type="date" id="bc-tanggal-berakhir" name="tanggal_berakhir" required class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
          </div>
        </div>
        <div id="bc-target-list-wrap" class="hidden space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Karyawan Penerima Memo</label>
            <span id="bc-selected-count" class="text-xs font-bold text-maroon-700 bg-maroon-50 px-2 py-0.5 rounded-full border border-maroon-200">0 Terpilih</span>
          </div>
          <div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <div class="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <input type="text" id="bc-search-box" placeholder="Cari nama, jabatan, atau cabang..." class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-maroon-500 bg-white">
              <button type="button" id="bc-toggle-all" class="text-xs font-bold text-maroon-700 hover:bg-maroon-50 px-2.5 py-1 rounded-lg shrink-0 border border-maroon-200 transition">Pilih Semua</button>
            </div>
            <div id="bc-checkbox-list" class="max-h-48 overflow-y-auto divide-y divide-slate-100 p-1 bg-white">
            </div>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Lampiran File (opsional)</label>
          <input type="file" name="lampiran_file" id="bc-lampiran-file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none bg-white">
          <p class="text-[11px] text-slate-400 mt-1">Foto, PDF, atau dokumen Office, maks 10MB.</p>
        </div>
      </form>`,
    footerHtml: `
      <button id="bc-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="bc-send" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition shadow-md">Kirim Memo</button>`,
    onMount: (m) => {
      // Set Default Deadline (7 Hari dari Sekarang)
      const dateInput = m.querySelector("#bc-tanggal-berakhir");
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      dateInput.value = nextWeek.toISOString().split('T')[0];

      const listContainer = m.querySelector("#bc-checkbox-list");
      const searchBox = m.querySelector("#bc-search-box");
      const countBadge = m.querySelector("#bc-selected-count");
      const btnToggleAll = m.querySelector("#bc-toggle-all");

      // Filter active employees with valid names
      const validKaryawan = karyawan.filter(k => k.nama_karyawan);

      function updateCount() {
        const checked = listContainer.querySelectorAll('input[name="bc-emp-checkbox"]:checked').length;
        countBadge.textContent = `${checked} Terpilih`;
      }

      function drawCheckboxes(filterText = "") {
        const term = String(filterText || "").toLowerCase();
        
        listContainer.innerHTML = validKaryawan.map(k => {
          const nama = String(k.nama_karyawan || k.nama || "");
          const jabatan = String(k.jabatan || "");
          const cabang = String(k.cabang || "");

          const match = nama.toLowerCase().includes(term) || jabatan.toLowerCase().includes(term) || cabang.toLowerCase().includes(term);
          if (!match || !nama) return "";

          return `
            <label class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition select-none">
              <input type="checkbox" name="bc-emp-checkbox" value="${escapeHtml(nama)}" class="w-4 h-4 text-maroon-600 border-slate-300 rounded focus:ring-maroon-500 cursor-pointer">
              <div class="text-xs">
                <p class="font-semibold text-slate-800">${escapeHtml(nama)}</p>
                <p class="text-slate-400 text-[10px]">${escapeHtml(jabatan)} ${cabang ? `• ${escapeHtml(cabang)}` : ''}</p>
              </div>
            </label>
          `;
        }).join("");

        listContainer.querySelectorAll('input[name="bc-emp-checkbox"]').forEach(cb => {
          cb.addEventListener("change", updateCount);
        });
        updateCount();
      }

      drawCheckboxes();
      searchBox.oninput = (e) => drawCheckboxes(e.target.value);

      let allChecked = false;
      btnToggleAll.onclick = () => {
        allChecked = !allChecked;
        listContainer.querySelectorAll('input[name="bc-emp-checkbox"]').forEach(cb => {
          cb.checked = allChecked;
        });
        btnToggleAll.textContent = allChecked ? "Batal Semua" : "Pilih Semua";
        updateCount();
      };

      const quill = new window.Quill(m.querySelector('#editor-container'), {
        theme: 'snow',
        placeholder: 'Ketik isi memo di sini...',
        modules: {
          toolbar: {
            container: [
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'header': [1, 2, 3, false] }],
              [{ 'list': 'ordered' }, { 'list': 'bullet' }],
              [{ 'align': [] }],
              ['link', 'table-btn'],
              ['clean']
            ],
            handlers: {
              'table-btn': function() {
                const rows = prompt("Jumlah Baris (misal: 3)", "3");
                if (!rows) return;
                const cols = prompt("Jumlah Kolom (misal: 3)", "3");
                if (!cols) return;
                
                const r = Math.max(parseInt(rows) || 2, 1);
                const c = Math.max(parseInt(cols) || 2, 1);
                
                let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:12px 0; border:1px solid #cbd5e1;"><tbody>';
                for (let i = 0; i < r; i++) {
                  tableHtml += '<tr>';
                  for (let j = 0; j < c; j++) {
                    if (i === 0) {
                      tableHtml += '<th style="border:1px solid #cbd5e1; padding:8px 12px; background-color:#f8fafc; font-weight:600; text-align:left;">Judul ' + (j + 1) + '</th>';
                    } else {
                      tableHtml += '<td style="border:1px solid #cbd5e1; padding:8px 12px;">Data ' + i + '.' + (j + 1) + '</td>';
                    }
                  }
                  tableHtml += '</tr>';
                }
                tableHtml += '</tbody></table><p><br></p>';
                
                const range = this.quill.getSelection(true);
                this.quill.clipboard.dangerouslyPasteHTML(range ? range.index : 0, tableHtml);
              }
            }
          }
        }
      });

      // Custom icon for table button
      const tableBtn = m.querySelector('.ql-table-btn');
      if (tableBtn) {
        tableBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18M9 3v18M15 3v18M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/></svg>`;
        tableBtn.title = "Sisipkan Tabel";
      }

      m.querySelector("#bc-target-type").addEventListener("change", (e) => {
        m.querySelector("#bc-target-list-wrap").classList.toggle("hidden", e.target.value !== "SPESIFIK");
      });
      
      m.querySelector("#bc-cancel").onclick = closeModal;
      m.querySelector("#bc-send").onclick = async () => {
        const form = m.querySelector("#bc-form");
        if (!form.reportValidity()) return;

        const fd = new FormData(form);
        const targetType = fd.get("target_type");

        let targetList = [];
        if (targetType === "SPESIFIK") {
          const checkedBoxes = listContainer.querySelectorAll('input[name="bc-emp-checkbox"]:checked');
          targetList = Array.from(checkedBoxes).map(cb => cb.value);
          if (targetList.length === 0) {
            toast("Centang minimal 1 karyawan penerima memo!", "warning");
            return;
          }
        }

        const htmlContent = quill.root.innerHTML;
        const plainText = quill.getText().trim();

        if (plainText.length === 0) { toast("Isi memo tidak boleh kosong!", "warning"); return; }

        const btnSend = m.querySelector("#bc-send");
        try {
          btnSend.disabled = true; btnSend.innerHTML = "Sedang Mengirim...";

          const id = genId("BC");

          // Upload lampiran (jika ada file dipilih) ke Google Drive
          let lampiranUrl = null;
          const fileInput = m.querySelector("#bc-lampiran-file");
          const file = fileInput.files && fileInput.files[0];
          if (file) {
            if (file.size > 10 * 1024 * 1024) { toast("Ukuran file lampiran maksimal 10MB", "warning"); btnSend.disabled = false; btnSend.innerHTML = "Kirim Memo"; return; }
            btnSend.innerHTML = "Mengupload Lampiran...";
            try {
              lampiranUrl = await uploadFileToDrive(file, `Broadcast/${id}`);
            } catch (upErr) {
              console.warn("Gagal upload ke Drive, melanjutkan tanpa lampiran:", upErr);
            }
            btnSend.innerHTML = "Sedang Mengirim...";
          }

          const payload = {
            judul: fd.get("judul"),
            isi: htmlContent,
            target_type: targetType,
            target_list: targetList,
            tanggal_berakhir: fd.get("tanggal_berakhir"),
            lampiran_url: lampiranUrl,
            tanggal: new Date().toISOString(),
            dibuat_oleh: session.nama
          };

          await fsAdd(COL.BROADCAST, payload, id);

          // Match target users & karyawan
          const fcmTokensSet = new Set();
          const targetEmailsSet = new Set();
          const targetUserIdsSet = new Set();

          const isMatch = (name, uname, nik) => {
            if (targetType === "ALL") return true;
            return targetList.some(t => {
              const term = String(t || "").toLowerCase();
              const n = String(name || "").toLowerCase();
              const u = String(uname || "").toLowerCase();
              const nk = String(nik || "").toLowerCase();
              return n === term || u === term || nk === term || (n && n.includes(term)) || (n && term.includes(n));
            });
          };

          users.forEach(u => {
            const matched = isMatch(u.nama, u.username, u.nik);
            if (matched) {
              if (u.id || u.username) targetUserIdsSet.add(u.id || u.username);
              if (u.fcm_token) fcmTokensSet.add(u.fcm_token);
              if (u.email) targetEmailsSet.add(u.email);
            }
          });

          karyawan.forEach(k => {
            const matched = isMatch(k.nama_karyawan || k.nama, k.username, k.nik_karyawan || k.nik);
            if (matched) {
              if (k.username || k.nik) targetUserIdsSet.add(k.username || k.nik);
              if (k.fcm_token) fcmTokensSet.add(k.fcm_token);
              if (k.email) targetEmailsSet.add(k.email);

              // Cross-match dengan user doc
              const matchingUser = users.find(u => 
                (k.username && u.username === k.username) || 
                (k.nik && (u.nik === k.nik || u.username === k.nik)) ||
                (k.nama_karyawan && u.nama && u.nama.toLowerCase() === k.nama_karyawan.toLowerCase())
              );
              if (matchingUser) {
                if (matchingUser.fcm_token) fcmTokensSet.add(matchingUser.fcm_token);
                if (matchingUser.id || matchingUser.username) targetUserIdsSet.add(matchingUser.id || matchingUser.username);
              }
            }
          });

          // Notif in-app (lonceng)
          const targetUserIds = Array.from(targetUserIdsSet);
          await Promise.all(targetUserIds.map(uname => fsAdd(COL.NOTIFICATIONS, {
            username_target: uname,
            judul: `Memo Baru: ${payload.judul}`,
            pesan: plainText.substring(0, 80) + '...',
            dibaca: false,
            tanggal: payload.tanggal,
            link: `/#broadcast?memo_id=${id}`,
            memo_id: id
          }, genId("NTF"))));

          // Email
          const targetEmails = Array.from(targetEmailsSet);
          if (targetEmails.length > 0) {
            const emailTemplate = `
              <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
                <div style="background-color: #7a1f2b; padding: 15px; text-align: center;"><h2 style="color: white; margin: 0;">${escapeHtml(payload.judul)}</h2></div>
                <div style="padding: 20px; background: white;">${htmlContent}</div>
              </div>`;
            await Promise.all(targetEmails.map(email => sendEmailNotif(email, `[Memo HRIS] ${payload.judul}`, emailTemplate)));
          }

          // Push notification ke HP (FCM)
          const targetTokens = Array.from(fcmTokensSet).filter(Boolean);
          if (targetTokens.length > 0) {
            await sendFCMNotif(targetTokens, `Memo Baru: ${payload.judul}`, plainText.substring(0, 80) + '...', `/#broadcast?memo_id=${id}`);
          }

          toast("Memo berhasil dikirim", "success");
          closeModal();
          reload();
        } catch (e) {
          toast("Gagal mengirim memo: " + e.message, "error");
          btnSend.disabled = false; btnSend.innerHTML = "Kirim Memo";
        }
      };
    }
  });
}
