'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
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
