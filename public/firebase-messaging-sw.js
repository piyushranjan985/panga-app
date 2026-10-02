/**
 * Background push handler for the web app (Android Chrome + desktop
 * browsers -- iOS Safari web push isn't supported, see
 * docs/PUSH_NOTIFICATIONS.md §3). This is a static file served as-is
 * (not run through Next.js), so it can't read process.env directly --
 * lib/notifications/pushClient.ts registers it with the Firebase web
 * config passed as query params on the registration URL, read back here
 * off self.location.search. Those values aren't secrets: Firebase's web
 * "apiKey" only identifies the project, it doesn't authorize anything by
 * itself (that's what Firebase Security Rules / App Check are for).
 *
 * Uses the Firebase compat SDK via importScripts -- the documented
 * approach for firebase-messaging-sw.js, since service workers across
 * browsers don't uniformly support ES module imports the way app code
 * bundled by Next.js does.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Fires for a push that arrives while no tab has focus -- lib/notifications/push.ts
  // always sends a `notification` payload (not data-only), so FCM's own
  // SDK normally auto-displays this without needing a manual
  // showNotification() call; this handler exists mainly so a tap routes
  // back into the app at a sensible URL instead of just dismissing.
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'findmyVybe';
    const options = {
      body: payload.notification?.body || '',
      icon: '/icons/icon-192.png',
      data: payload.fcmOptions?.link || payload.data?.link || '/matches',
    };
    self.registration.showNotification(title, options);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/matches';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
