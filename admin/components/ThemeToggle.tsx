'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Reads the DOM's current class (set by an inline pre-hydration
    // script to avoid a flash of the wrong theme), not React-owned state
    // -- a one-time sync FROM an external system on mount, which is
    // exactly what useEffect is for. react-hooks/set-state-in-effect's
    // concern is setState being used to replace work React should have
    // done during render; there's no render-time equivalent for "what
    // did the browser already do to the DOM before React mounted."
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('vybeadmin-theme', next ? 'dark' : 'light');
    } catch {
      // ignore -- worst case the preference just doesn't persist
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-inkSoft hover:bg-canvas"
      title="Toggle dark mode"
    >
      {dark === null ? null : dark ? '☀️' : '🌙'}
    </button>
  );
}
