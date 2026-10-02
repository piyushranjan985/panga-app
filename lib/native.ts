/**
 * Thin bridge to the Capacitor native shell -- every call here degrades
 * gracefully to the ordinary browser API when the app is just running in
 * a regular mobile/desktop browser tab (capacitor.config.ts's remote-URL
 * setup means this exact same web app serves both), so nothing in the
 * rest of the codebase needs an #ifdef-style branch of its own.
 *
 * This is also what keeps the iOS/Android shells from being "just a
 * wrapped website" for App Store review purposes (Apple's Guideline 4.2,
 * Minimum Functionality): the native permission dialogs and device APIs
 * below are real native integration, not a relabeled browser prompt.
 *
 * @capacitor/core and @capacitor/geolocation are optional peer-ish
 * dependencies as far as the web build is concerned -- dynamic import
 * means `next build` for the plain website never needs them resolved,
 * only the native app bundles that actually ship with Capacitor do.
 */

export async function isNativeApp(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    // @capacitor/core isn't installed yet, or this is a plain web build --
    // either way, definitely not running natively.
    return false;
  }
}

export interface NativeCoords {
  latitude: number;
  longitude: number;
}

/**
 * Same contract as the Profile screen's existing browser-Geolocation call
 * (see app/profile/page.tsx's shareLocation), but goes through
 * @capacitor/geolocation's native permission dialog and location provider
 * when running inside the iOS/Android shell -- more reliable indoors and
 * on iOS in particular, where Safari's WebView geolocation can be flaky.
 */
export async function getCurrentPosition(): Promise<NativeCoords> {
  if (await isNativeApp()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const permission = await Geolocation.checkPermissions();
    if (permission.location !== 'granted') {
      const requested = await Geolocation.requestPermissions();
      if (requested.location !== 'granted') {
        throw new Error('Location permission was denied — enable it in your phone’s Settings for findmyVybe.');
      }
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied — enable it in your browser settings to share it.'
              : 'Could not get your location. Try again.'
          )
        );
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}

export type PushPlatform = 'ios' | 'android' | 'web';

/**
 * Registers this device for push notifications and tells the server
 * about it (POST /api/push/register) -- see docs/PUSH_NOTIFICATIONS.md.
 * Same native/web branching contract as getCurrentPosition above:
 * inside the Capacitor shell this goes through @capacitor/push-
 * notifications' real native permission dialog (iOS/Android); in a
 * plain browser tab it goes through lib/notifications/pushClient.ts's
 * Firebase Web SDK flow (Android Chrome + desktop only -- iOS Safari web
 * push isn't supported, see that file's doc comment). Throws a
 * user-facing message on denial/failure; callers (the Profile settings
 * toggles) catch and show it rather than silently failing.
 *
 * @capacitor-firebase/messaging is an optional peer-ish dependency the
 * same way @capacitor/geolocation is above -- dynamic import keeps the
 * plain web build from needing it resolved. It wraps the native Firebase
 * Messaging SDK on both platforms (not just Android's auto-wired one),
 * so getToken() hands back a real FCM registration token on iOS too --
 * plain @capacitor/push-notifications would only give the raw APNs
 * device token there, which lib/notifications/push.ts's FCM-for-all-3-
 * platforms sender can't use (see docs/PUSH_NOTIFICATIONS.md §2).
 */
export async function requestPushPermission(): Promise<boolean> {
  if (await isNativeApp()) {
    const { Capacitor } = await import('@capacitor/core');
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

    const permission = await FirebaseMessaging.checkPermissions();
    if (permission.receive !== 'granted') {
      const requested = await FirebaseMessaging.requestPermissions();
      if (requested.receive !== 'granted') {
        throw new Error('Notification permission was denied — enable it in your phone’s Settings for findmyVybe.');
      }
    }

    const { token } = await FirebaseMessaging.getToken();

    const platform = Capacitor.getPlatform() as PushPlatform; // 'ios' | 'android' when native
    await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
    });
    return true;
  }

  const { isWebPushSupported, requestWebPushToken } = await import('./notifications/pushClient');
  if (!isWebPushSupported()) {
    throw new Error('Push notifications aren’t supported in this browser.');
  }
  const token = await requestWebPushToken();
  if (!token) return false;

  await fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'web' as PushPlatform }),
  });
  return true;
}
