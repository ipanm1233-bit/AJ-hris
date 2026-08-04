module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Metode tidak diizinkan');

  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "RESEND_API_KEY belum diset di Environment Variables Vercel."
      });
    }

    const { to, subject, htmlBody, cc } = req.body;

    if (!to || !subject || !htmlBody) {
      return res.status(400).json({
        success: false,
        error: "Field 'to', 'subject', dan 'htmlBody' wajib diisi."
      });
    }

    const toArray = Array.isArray(to) ? to : String(to).split(",").map(s => s.trim()).filter(Boolean);

    const payload = {
      // Ganti "onboarding@resend.dev" dengan alamat pengirim ber-domain kamu
      // sendiri setelah domain diverifikasi di dashboard Resend (opsional
      // di awal — "onboarding@resend.dev" bisa dipakai langsung tanpa setup).
      from: "HRIS Andela Jaya <onboarding@resend.dev>",
      to: toArray,
      subject: subject,
      html: htmlBody
    };
    if (cc) {
      payload.cc = Array.isArray(cc) ? cc : String(cc).split(",").map(s => s.trim()).filter(Boolean);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("CRASH SERVER (send-email):", result);
      return res.status(response.status).json({
        success: false,
        error: result?.message || "Resend menolak permintaan pengiriman email."
      });
    }

    res.status(200).json({ success: true, id: result?.id });

  } catch (error) {
    console.error("CRASH SERVER (send-email):", error);
    res.status(500).json({
      success: false,
      error: "Server Error: " + error.message
    });
  }
};
