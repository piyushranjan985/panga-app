import type { CapacitorConfig } from '@capacitor/cli';

// findmyVybe ships as a "remote URL" Capacitor app: the iOS/Android shells
// load the live Vercel deployment directly (same session cookies, same
// API routes, same Prisma-backed backend -- nothing about the server side
// changes), and just gain a real app icon, home-screen presence, and a
// bridge to native device APIs (see lib/native.ts) that a plain mobile
// browser tab can't offer. This is the standard, supported Capacitor
// pattern for a full-stack app like this one -- there is no static
// export step, and none is needed.
//
// IMPORTANT: replace `server.url` below with your actual production
// domain before running `npx cap add ios` / `npx cap add android` (see
// MOBILE_APP_SETUP.md for the full walkthrough). Until it's a real
// https:// URL, the native shells have nothing to load.
const config: CapacitorConfig = {
  appId: 'app.findmyvybe.mobile', // reverse-DNS bundle id -- pick your own if you'd rather not use this one; it must be unique on both stores and, once submitted, is very painful to change
  appName: 'findmyVybe',
  webDir: 'public', // required by the CLI even though remote-URL mode doesn't serve local files as the app's content
  server: {
    url: 'https://vybematch-app-2.vercel.app',
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
