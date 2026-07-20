importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Gunakan konfigurasi Firebase yang sama dengan di js/firebase-config.js
firebase.initializeApp({
  apiKey: "AIzaSyBAAUHaqYrzTp6wi1PDYkrKY0IWI2XQoVw",
  authDomain: "andela-hris-bc9ed.firebaseapp.com",
  projectId: "andela-hris-bc9ed",
  storageBucket: "andela-hris-bc9ed.firebasestorage.app",
  messagingSenderId: "718041616100",
  appId: "1:718041616100:web:cde303edb932b25ae826f1"
});

const messaging = firebase.messaging();

// Menangkap notifikasi saat aplikasi berjalan di background
messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/assets/icon-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
