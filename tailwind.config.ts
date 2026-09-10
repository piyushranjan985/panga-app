import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        paper: '#FCF6F1',
        ink: '#271A2B',
        inkSoft: '#5B4A5F',
        marigold: '#FF7A29',
        magenta: '#E8367B',
        mint: '#0FB88A',
        line: '#EADFD8',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '22px',
      },
    },
  },
  plugins: [],
};

export default config;
