/**
 * Browser-side half of web push -- kept out of lib/native.ts (which stays
 * a thin, dependency-light bridge) because this pulls in the Firebase
 * Web SDK, which should only ever be bundled for the browser code path
 * and only once someone actually asks to enable notifications, not
 * eagerly on every page. lib/native.ts dynamically imports this file
 * only in its web (non-Capacitor) branch -- see requestPushPermission().
 *
 * iOS Safari is deliberately NOT supported here (see
 * docs/PUSH_NOTIFICATIONS.md §3): Apple only allows web push after the
 * site is added to the home screen as a PWA, which is a confusing extra
 * step most users won't take, and the native iOS app (via
 * @capacitor/push-notifications, see lib/native.ts) already covers iOS
 * properly. isWebPushSupported() reflects that -- it checks for the
 * standard Push API rather than trying to special-case Safari versions.
 */

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

const FIREBASE_WEB_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

function firebaseWebConfig(): Record<string, string> | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) return null;
  return { apiKey, authDomain, projectId, storageBucket: storageBucket ?? '', messagingSenderId, appId };
}

export function isFirebaseWebConfigured(): boolean {
  return firebaseWebConfig() !== null && Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
}

/**
 * public/firebase-messaging-sw.js is a static file, so it can't read
 * Next.js env vars directly -- this is the standard workaround for
 * Firebase Web SDK + Next.js: pass the (public, non-secret) web config
 * as query params on the service worker's own URL, and the SW reads them
 * back off `self.location.search`. The Firebase web "apiKey" is not a
 * secret the way a server API key is -- Firebase's actual security
 * boundary is its Security Rules / App Check, not keeping this hidden.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const config = firebaseWebConfig();
  if (!config) throw new Error('Firebase web push is not configured.');
  const qs = new URLSearchParams(config).toString();
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
}

/**
 * Walks through: permission prompt -> service worker registration ->
 * FCM token mint. Returns the token on success, or throws a message
 * meant to be shown directly to the user (same contract as
 * lib/native.ts's getCurrentPosition). Returns null only when the
 * browser lacks push support entirely (isWebPushSupported() is false) --
 * callers should check that first to decide whether to even show the
 * "enable notifications" control.
 */
export async function requestWebPushToken(): Promise<string | null> {
  if (!isWebPushSupported()) return null;
  if (!isFirebaseWebConfigured()) {
    throw new Error('Push notifications are not set up for this app yet.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied -- enable it in your browser settings to turn this on.');
  }

  const registration = await registerServiceWorker();
  const { initializeApp } = await import('firebase/app');
  const { getMessaging, getToken } = await import('firebase/messaging');

  const config = firebaseWebConfig();
  if (!config) throw new Error('Push notifications are not set up for this app yet.');
  const app = initializeApp(config);
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}
