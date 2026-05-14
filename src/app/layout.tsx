import type { Metadata } from 'next';
import './globals.css';
import { Outfit } from 'next/font/google';
import Sidebar from '@/components/layout/Sidebar';
import MainLayout from '@/components/layout/MainLayout';
import MobileNav from '@/components/layout/MobileNav';
import { DataAsAtBanner } from '@/components/ui/DataAsAtBanner';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Transport Needs Assessment Tool',
  description: 'Data-driven transport planning and business case support for Greater Sydney',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="antialiased font-outfit">
        <DataAsAtBanner />
        <Sidebar />
        <MainLayout>{children}</MainLayout>
        <MobileNav />
      </body>
    </html>
  );
}
