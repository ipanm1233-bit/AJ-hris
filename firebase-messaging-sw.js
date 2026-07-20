// Ganti versi 9.22.0 menjadi 10.13.0 agar sama dengan aplikasi
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBAAUHaqYrzTp6wi1PDYkrKY0IWI2XQoVw",
  authDomain: "andela-hris-bc9ed.firebaseapp.com",
  projectId: "andela-hris-bc9ed",
  storageBucket: "andela-hris-bc9ed.firebasestorage.app",
  messagingSenderId: "718041616100",
  appId: "1:718041616100:web:cde303edb932b25ae826f1"
});

const messaging = firebase.messaging();

// Menerima pesan saat browser HP ditutup/dibuang
messaging.onBackgroundMessage(function(payload) {
  console.log("Pesan background masuk:", payload);
  
  const notificationTitle = payload.notification.title || "HRIS Andela Jaya";
  const notificationOptions = {
    body: payload.notification.body || "Ada pembaruan baru.",
    icon: '/assets/icon-192x192.png',
    badge: '/assets/icon-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
