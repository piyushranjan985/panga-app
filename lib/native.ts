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
        throw new Error('Location permission was denied — enable it in your phone’s Settings for VybeMatch.');
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
