import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
const sans = DM_Sans({ variable: '--font-garden-sans', subsets: ['latin'] });
export const metadata: Metadata = {
  metadataBase: new URL('https://iwantwaterloo.com'),
  title: 'I Want Waterloo',
  alternates: { canonical: 'https://iwantwaterloo.com/' },
  icons: { icon: '/favicon.svg' },
  description: 'A better city starts with an idea. Share yours for Waterloo.',
  openGraph: {
    title: 'I Want Waterloo',
    description: 'A better city starts with an idea. Share yours for Waterloo.',
    url: 'https://iwantwaterloo.com/',
    siteName: 'I Want Waterloo',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1733,
        height: 908,
        alt: 'I want Waterloo — A better city starts with an idea. A miniature green park with a pond, trees and walking paths.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'I Want Waterloo',
    description: 'A better city starts with an idea. Share yours for Waterloo.',
    images: ['/og.png'],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={sans.variable}>{children}</body>
    </html>
  );
}
