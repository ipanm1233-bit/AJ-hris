import { COL } from "../firebase-config.js";
import { fsGetAll, fsAdd, openModal, closeModal, toast, genId, escapeHtml, fmtDateTime, sendEmailNotif } from "../utils.js";
import { avatar, badge, emptyState, skeletonRows } from "../components.js";

export async function mount(container, { session }) {
  const listEl = container.querySelector("#bc-list");
  listEl.innerHTML = skeletonRows(3);
  const karyawan = await fsGetAll(COL.MASTER_KARYAWAN);
  const users = await fsGetAll(COL.USERS);

  async function load() {
    const rows = await fsGetAll(COL.BROADCAST);
    rows.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    
    if (!rows.length) { 
      listEl.innerHTML = emptyState("Belum ada memo yang diterbitkan"); 
      return; 
    }
    
    listEl.innerHTML = rows.map(r => `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div class="flex items-start gap-3">
          ${avatar(r.dibuat_oleh || "?", "w-10 h-10")}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <p class="font-semibold text-slate-800">${escapeHtml(r.judul)}</p>
              <span class="text-xs text-slate-400">${fmtDateTime(r.tanggal)}</span>
            </div>
            <!-- Merender HTML dari Quill Editor -->
            <div class="text-sm text-slate-600 mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 quill-content">
              ${r.isi}
            </div>
            ${r.lampiran_url ? `<a href="${escapeHtml(r.lampiran_url)}" target="_blank" class="inline-block mt-2 text-xs font-medium text-maroon-700 hover:underline">🔗 Lihat Lampiran</a>` : ''}
            <div class="flex items-center gap-2 mt-3">
              ${badge(r.target_type === "SPESIFIK" ? `${(r.target_list || []).length} Karyawan Terpilih` : "Seluruh Karyawan", "maroon")}
              <span class="text-xs text-slate-400">oleh ${escapeHtml(r.dibuat_oleh || "-")}</span>
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
          <!-- Wadah Editor Rich Text (Quill) -->
          <div id="editor-container" class="w-full text-sm rounded-lg border border-slate-200" style="height: 220px; background: white;"></div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Target Penerima</label>
          <select id="bc-target-type" name="target_type" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            <option value="ALL">Seluruh Karyawan</option>
            <option value="SPESIFIK">Karyawan Tertentu</option>
          </select>
        </div>
        <div id="bc-target-list-wrap" class="hidden">
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Pilih Karyawan (Tahan CTRL/CMD untuk memilih lebih dari satu)</label>
          <select id="bc-target-list" name="target_list" multiple size="6" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
            ${karyawan.map(k => `<option value="${escapeHtml(k.nama_karyawan)}">${escapeHtml(k.nama_karyawan)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1.5">Lampiran URL (opsional, misal link Google Drive)</label>
          <input name="lampiran_url" placeholder="https://..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 outline-none">
        </div>
      </form>`,
    footerHtml: `
      <button id="bc-cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
      <button id="bc-send" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-maroon-700 hover:bg-maroon-800 transition shadow-md">Kirim Memo</button>`,
    onMount: (m) => {
      // Inisialisasi Quill.js
      const quill = new window.Quill(m.querySelector('#editor-container'), {
        theme: 'snow',
        placeholder: 'Ketik isi memo di sini...',
        modules: {
          toolbar: [
            ['bold', 'italic', 'underline', 'strike'], 
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'align': [] }],
            ['link'],
            ['clean']
          ]
        }
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
        const targetList = targetType === "SPESIFIK" ? Array.from(m.querySelector("#bc-target-list").selectedOptions).map(o => o.value) : [];
        
        // Ambil hasil HTML dan teks biasa dari Editor
        const htmlContent = quill.root.innerHTML;
        const plainText = quill.getText().trim();

        if (plainText.length === 0) {
          toast("Isi memo tidak boleh kosong!", "warning");
          return;
        }

        const payload = {
          judul: fd.get("judul"), 
          isi: htmlContent, // Simpan format HTML langsung
          target_type: targetType,
          target_list: targetList, 
          lampiran_url: fd.get("lampiran_url") || null,
          tanggal: new Date().toISOString(), 
          dibuat_oleh: session.nama
        };
        
        try {
          // Kunci tombol saat pengiriman diproses
          const btnSend = m.querySelector("#bc-send");
          btnSend.disabled = true;
          btnSend.innerHTML = "Sedang Mengirim...";

          const id = genId("BC");
          await fsAdd(COL.BROADCAST, payload, id);
          
          // 1. Tentukan target (Sistem Notif internal)
          const targetUsers = targetType === "ALL" ? users : users.filter(u => targetList.includes(u.nama));
          const targetUserIds = targetUsers.map(u => u.id);
          
          // Simpan notifikasi ke Firebase agar muncul di lonceng sistem[cite: 1]
          await Promise.all(targetUserIds.map(uname => fsAdd(COL.NOTIFICATIONS, {
            username_target: uname, 
            judul: `Memo Baru: ${payload.judul}`, 
            pesan: plainText.substring(0, 80) + '...', // Potong text polos untuk lonceng notifikasi
            dibaca: false, 
            tanggal: payload.tanggal
          }, genId("NTF"))));

          // 2. Kirim Email Notifikasi (GAS)
          const targetEmails = targetUsers.map(u => u.email).filter(Boolean); // Hanya list user yang mengisi kolom email
          
          if (targetEmails.length > 0) {
            // Desain template Email HTML profesional yang senada dengan UI
            const emailTemplate = `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 0;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                  <div style="background-color: #7a1f2b; padding: 25px 30px; text-align: center;">
                    <h2 style="color: white; margin: 0; font-size: 20px; font-weight: 600;">${escapeHtml(payload.judul)}</h2>
                  </div>
                  <div style="padding: 30px; color: #334155; line-height: 1.6;">
                    ${htmlContent} <!-- Isi memo dimasukkan langsung secara utuh -->
                    
                    ${payload.lampiran_url ? `
                    <div style="margin-top: 25px; padding: 15px; background-color: #fbf3f3; border-left: 4px solid #7a1f2b; border-radius: 4px;">
                      <p style="margin: 0; color: #7a1f2b; font-weight: 600;">Memo ini memiliki lampiran dokumen.</p>
                      <a href="${payload.lampiran_url}" style="display: inline-block; margin-top: 8px; color: #7a1f2b; text-decoration: underline;">Buka Lampiran</a>
                    </div>` : ''}
                  </div>
                  
                  <div style="background-color: #f1f5f9; padding: 20px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
                    <p style="margin: 0 0 15px 0; font-size: 13px; color: #64748b;">
                      Memo ini diterbitkan oleh <strong>${escapeHtml(session.nama)}</strong>. 
                      Untuk melihatnya di sistem, silakan klik tombol di bawah.
                    </p>
                    <a href="https://andela-hris.web.app/#dashboard" style="display: inline-block; background-color: #7a1f2b; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Buka Portal HRIS</a>
                  </div>
                </div>
              </div>
            `;

            // Proses blast email ke semua target secara bersamaan
            await Promise.all(targetEmails.map(email => 
              sendEmailNotif(email, `[Memo HRIS] ${payload.judul}`, emailTemplate)
            ));
          }
          
          toast("Memo berhasil dikirim & email notifikasi telah dipicu", "success");
          closeModal();
          reload();
          
        } catch (e) { 
          toast("Gagal mengirim memo: " + e.message, "error"); 
          const btnSend = m.querySelector("#bc-send");
          btnSend.disabled = false;
          btnSend.textContent = "Kirim Memo";
        }
      };
    }
  });
}
