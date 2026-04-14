'use client';

import { useAppStore } from '@/store';
import AreaContextBanner from '@/components/ui/AreaContextBanner';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();
  return (
    <main
      className={`min-h-screen transition-all duration-300 pb-16 md:pb-0 ${
        sidebarOpen ? 'md:ml-[260px]' : 'md:ml-[68px]'
      }`}
    >
      <AreaContextBanner />
      {children}
    </main>
  );
}
