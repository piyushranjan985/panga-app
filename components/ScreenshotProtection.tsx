'use client';

import { useEffect } from 'react';
import { enableScreenshotProtection } from '@/lib/native';

/**
 * Startup side effect, not UI -- renders nothing. Turns on
 * @capacitor/privacy-screen as early as possible; see lib/native.ts's
 * enableScreenshotProtection for exactly what each platform gets (they
 * are NOT the same -- Android is a real block, iOS is app-switcher blur
 * only, plain web/mobile browser gets nothing, because none of those
 * last two are possible to do any better than that).
 *
 * Mounted once in app/layout.tsx, not per-page, so it covers every
 * screen -- including login/verify/vouch, not just the authenticated
 * Discover/Matches/Profile shell.
 */
export default function ScreenshotProtection() {
  useEffect(() => {
    enableScreenshotProtection();
  }, []);
  return null;
}
