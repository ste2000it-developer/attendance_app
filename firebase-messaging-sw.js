importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCJiQv3qKiOu1xyCp81pofQmEul_ceecKY",
  authDomain: "company-backends.firebaseapp.com",
  projectId: "company-backends",
  messagingSenderId: "830419322417",
  appId: "1:830419322417:web:71f846132f2bb21f73b710"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: "/icon.png"
    }
  );
});