import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Plan section 4 asks for a geometric sans; Inter is the free fallback it names.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NutriSnap — Snap it. Track it.',
  description:
    'Photograph your food and NutriSnap logs the calories, protein, carbs and fat automatically.',
};

export const viewport: Viewport = {
  themeColor: '#07090C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
