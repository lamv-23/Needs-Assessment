'use client';

import { useAppStore } from '@/store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();
  return (
    <main className={`min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-[260px]' : 'ml-[68px]'}`}>
      {children}
    </main>
  );
}
