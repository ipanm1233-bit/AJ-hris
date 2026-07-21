/**
 * broadcast.gs
 * Endpoint Web App untuk Sistem Notifikasi Email HRIS
 */

// Fungsi untuk menangani pre-flight request (CORS) dari browser
function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(headers);
}

// Fungsi utama untuk menerima POST data dari frontend HRIS
function doPost(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    // Pastikan ada payload yang dikirim
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Tidak ada data payload yang diterima dari sistem.");
    }

    // Parsing JSON dari frontend
    var payload = JSON.parse(e.postData.contents);
    
    // PERBAIKAN: Menggunakan fallback pencarian properti agar fleksibel membaca kiriman dari frontend
    var toEmail = payload.to || payload.toEmail;
    var emailSubject = payload.subject || payload.emailSubject;
    var htmlContent = payload.htmlBody || payload.body || payload.html || payload.htmlContent;
    var ccEmail = payload.cc || payload.ccEmail || ""; 
    var senderName = payload.name || payload.senderName || "HRIS Management System"; 

    // Validasi parameter wajib
    if (!toEmail || !emailSubject || !htmlContent) {
      throw new Error("Parameter wajib tidak lengkap. Pastikan data penerima, subjek, dan konten HTML terisi.");
    }

    // Eksekusi pengiriman email menggunakan GmailApp dengan menyertakan teks alternatif pada argumen ke-3
    GmailApp.sendEmail(toEmail, emailSubject, "Email ini memerlukan aplikasi yang mendukung format HTML.", {
      htmlBody: htmlContent, // Mengunci rendering agar wajib menampilkan visual HTML (Tabel, Style, Form)
      name: senderName,
      cc: ccEmail
    });

    // Buat response sukses
    var responseData = {
      status: "success",
      message: "Email notifikasi profesional berhasil dikirim ke: " + toEmail
    };

    // Kembalikan response JSON ke frontend
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);

  } catch (error) {
    // Tangkap error dan kembalikan ke frontend agar bisa di-log/debug
    var errorData = {
      status: "error",
      message: error.message || error.toString()
    };

    return ContentService.createTextOutput(JSON.stringify(errorData))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
  }
}