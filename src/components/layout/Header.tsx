'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AreaSelector from './AreaSelector';
import YearSelector from './YearSelector';
import { cn } from '@/lib/utils';
import { getTaskForPath, TASKS } from './navigation';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showTaskNav?: boolean;
}

export default function Header({ title, subtitle, showTaskNav = true }: HeaderProps) {
  const pathname = usePathname();
  const activeTask = getTaskForPath(pathname);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <YearSelector />
            <AreaSelector />
          </div>
        </div>

        {showTaskNav && (
          <nav className="hidden md:flex items-center gap-2 border-t border-gray-100 pt-3">
            {TASKS.map((task) => {
              const Icon = task.icon;
              const isActive = activeTask.key === task.key;

              return (
                <Link
                  key={task.key}
                  href={task.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{task.label}</span>
                </Link>
              );
            })}
            <div className="ml-2 hidden lg:block text-xs text-gray-400">
              {activeTask.description}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
