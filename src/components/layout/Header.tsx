'use client';

import AreaSelector from './AreaSelector';
import YearSelector from './YearSelector';
import { useAppStore } from '@/store';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { sidebarOpen } = useAppStore();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          <YearSelector />
          <AreaSelector />
        </div>
      </div>
    </header>
  );
}
