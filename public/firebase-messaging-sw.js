// Firebase Messaging Service Worker
// Handles background push notifications for the SwiftRun business portal.
// Config values are NEXT_PUBLIC_* (already browser-exposed) — safe to hardcode here.

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDbzdIZy0ETlO4D9MntxdgNzY3EG8p_f7M",
  authDomain: "vlogx-f4c1f.firebaseapp.com",
  projectId: "vlogx-f4c1f",
  storageBucket: "vlogx-f4c1f.firebasestorage.app",
  messagingSenderId: "221443112938",
  appId: "1:221443112938:web:a65ae2683819671cf43c93",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "SwiftRun";
  const body = payload.notification?.body ?? "";
  const data = payload.data ?? {};

  self.registration.showNotification(title, {
    body,
    icon: "/swiftrun-icon.png",
    badge: "/swiftrun-icon.png",
    tag: data.type ?? "swiftrun",
    data,
  });
});
