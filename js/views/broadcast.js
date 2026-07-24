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
    const rows = await fsGetAll(COL.BROADCAST);
    rows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    
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
            ${r.lampiran_url ? `<a href="${escapeHtml(r.lampiran_url)}" target="_blank" class="inline-block mt-2 text-xs font-medium text-maroon-700 hover:underline">🔗 Lihat Lampiran</a>` : ''}
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
              <input type="text" id="bc-search-box" placeholder="🔍 Cari nama, jabatan, atau cabang..." class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 outline-none focus:border-maroon-500 bg-white">
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
        const term = filterText.toLowerCase();
        
        listContainer.innerHTML = validKaryawan.map(k => {
          const nama = k.nama_karyawan || "";
          const jabatan = k.jabatan || "";
          const cabang = k.cabang || "";

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
        theme: 'snow', placeholder: 'Ketik isi memo di sini...',
        modules: { toolbar: [['bold', 'italic', 'underline', 'strike'], [{'list': 'ordered'}, {'list': 'bullet'}], [{'align': []}], ['link'], ['clean']] }
      });

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

          const targetUsers = targetType === "ALL" ? users : users.filter(u => targetList.includes(u.nama));
          const targetUserIds = targetUsers.map(u => u.id);

          // Notif in-app (lonceng)
          await Promise.all(targetUserIds.map(uname => fsAdd(COL.NOTIFICATIONS, {
            username_target: uname, judul: `Memo Baru: ${payload.judul}`, pesan: plainText.substring(0, 80) + '...', dibaca: false, tanggal: payload.tanggal
          }, genId("NTF"))));

          // Email (jalur yang sudah ada sebelumnya — TETAP dipertahankan)
          const targetEmails = targetUsers.map(u => u.email).filter(Boolean);
          if (targetEmails.length > 0) {
            const emailTemplate = `
              <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
                <div style="background-color: #7a1f2b; padding: 15px; text-align: center;"><h2 style="color: white; margin: 0;">${escapeHtml(payload.judul)}</h2></div>
                <div style="padding: 20px; background: white;">${htmlContent}</div>
              </div>`;
            await Promise.all(targetEmails.map(email => sendEmailNotif(email, `[Memo HRIS] ${payload.judul}`, emailTemplate)));
          }

          // Push notification ke HP (baru)
          const targetTokens = targetUsers.map(u => u.fcm_token).filter(Boolean);
          if (targetTokens.length > 0) {
            // Parameter ke-4 adalah rute menu aplikasinya
            await sendFCMNotif(targetTokens, `📢 Memo Baru: ${payload.judul}`, plainText.substring(0, 80) + '...', '/#dashboard');
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
