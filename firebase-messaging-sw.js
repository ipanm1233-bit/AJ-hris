importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB7hYGj4DmellhfggbDbzQdubeL3T8lKHM",
  authDomain: "gen-lang-client-0670613891.firebaseapp.com",
  projectId: "gen-lang-client-0670613891",
  storageBucket: "gen-lang-client-0670613891.firebasestorage.app",
  messagingSenderId: "558851473740",
  appId: "1:558851473740:web:bb87504a9d5f324aec4fe9"
});

const messaging = firebase.messaging();

// 1. Menerima pesan & menyelipkan link rahasia
messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title || "HRIS Andela Jaya";
  const notificationOptions = {
    body: payload.notification.body || "Ada pembaruan baru.",
    icon: '/assets/icon-192x192.png',
    badge: '/assets/icon-192x192.png',
    // Tangkap link dari server
    data: { link: payload.data ? payload.data.link : '/' } 
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. FUNGSI BARU: AKSI SAAT NOTIFIKASI DIKLIK OLEH KARYAWAN
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Tutup notifikasi segera setelah diklik
  
  // Baca tujuan URL, jika kosong arahkan ke beranda '/'
  const targetUrl = event.notification.data && event.notification.data.link ? event.notification.data.link : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Cek apakah tab aplikasi HRIS sudah terbuka di HP
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          // Kirim pesan navigasi ke halaman yang sedang terbuka agar diproses secara halus tanpa reload
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus(); // Buka/Fokuskan layarnya
        }
      }
      // Jika aplikasi sedang tertutup total, buka tab baru
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
