import type { Config } from 'tailwindcss';

// A separate, deliberately more utilitarian palette from the consumer
// app's warm/playful one (tailwind.config.ts one level up) -- this is an
// internal ops console read by staff for hours at a time, not a dating
// app screen. `brand` is the one accent shared with the consumer app
// (findmyVybe magenta) used sparingly for primary actions and active nav;
// everything else is a quiet slate scale plus semantic status colors.
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every token below reads from a CSS custom property (defined in
        // app/globals.css for :root and redefined under .dark) so a
        // component never needs its own `dark:` variant -- flipping the
        // `dark` class on <html> (see components/ThemeScript.tsx) is
        // enough for the whole app to relight.
        brand: 'rgb(var(--color-brand) / <alpha-value>)',
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surfaceRaised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        inkSoft: 'rgb(var(--color-ink-soft) / <alpha-value>)',
        inkFaint: 'rgb(var(--color-ink-faint) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        successSoft: 'rgb(var(--color-success-soft) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        warningSoft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
        critical: 'rgb(var(--color-critical) / <alpha-value>)',
        criticalSoft: 'rgb(var(--color-critical-soft) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        infoSoft: 'rgb(var(--color-info-soft) / <alpha-value>)',
      },
      fontFamily: {
        // System font stack -- no next/font/google build-time fetch to
        // depend on, and it's the right call for a dense, text-heavy
        // internal console read by staff on their own OS anyway.
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
