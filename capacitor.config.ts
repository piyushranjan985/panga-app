import type { CapacitorConfig } from '@capacitor/cli';

// findmyVybe ships as a "remote URL" Capacitor app: the iOS/Android shells
// load a live Vercel deployment directly (same session cookies, same
// API routes, same Prisma-backed backend -- nothing about the server side
// changes), and just gain a real app icon, home-screen presence, and a
// bridge to native device APIs (see lib/native.ts) that a plain mobile
// browser tab can't offer. This is the standard, supported Capacitor
// pattern for a full-stack app like this one -- there is no static
// export step, and none is needed.
//
// Which URL/appId/appName this produces depends on CAP_ENV, read at
// build time (this file runs as a plain Node script under `npx cap
// sync`/`cap build`, so process.env works normally):
//   npx cap sync ios              -- CAP_ENV unset -> production config
//   CAP_ENV=dev npx cap sync ios  -- dev config (dev.findmyvybe.com)
// Defaulting to production when unset is deliberate: a plain `npx cap
// sync` with no special setup should always produce what you'd actually
// ship, never accidentally point a build at dev.
//
// The dev build uses a DIFFERENT appId (app.findmyvybe.mobile.dev) and
// appName ("findmyVybe Dev") on purpose -- that lets the dev and prod
// apps install side by side on the same test device instead of one
// overwriting the other, and makes them impossible to mix up on a home
// screen. See npm scripts `cap:sync` / `cap:sync:dev`.
//
// Editing this file alone is NOT enough to update an already-built
// native app: run `npx cap sync ios` / `npx cap sync android` (for
// whichever CAP_ENV you want) after any change here -- that copies the
// result into ios/App/App/capacitor.config.json and
// android/app/src/main/assets/capacitor.config.json -- and rebuild.
const isDev = process.env.CAP_ENV === 'dev';

const config: CapacitorConfig = {
  appId: isDev ? 'app.findmyvybe.mobile.dev' : 'app.findmyvybe.mobile', // reverse-DNS bundle id -- pick your own if you'd rather not use this one; it must be unique on both stores and, once submitted, is very painful to change
  appName: isDev ? 'findmyVybe Dev' : 'findmyVybe',
  webDir: 'public', // required by the CLI even though remote-URL mode doesn't serve local files as the app's content
  server: {
    url: isDev ? 'https://dev.findmyvybe.com' : 'https://findmyvybe.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
