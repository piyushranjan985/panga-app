import type { Metadata } from 'next';
import ThemeScript from '@/components/ThemeScript';
import './globals.css';

export const metadata: Metadata = {
  title: 'VybeMatch Admin',
  description: 'Operations, Trust & Safety, Support, Privacy/Compliance and Analytics console for VybeMatch.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
