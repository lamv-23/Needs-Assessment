'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { getTaskForPath } from './navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const activeTask = getTaskForPath(pathname);

  return (
    <aside
      className={cn(
        'hidden md:flex fixed left-0 top-0 h-full bg-white border-r border-gray-100 transition-all duration-300 z-40 flex-col shadow-sm',
        sidebarOpen ? 'w-[260px]' : 'w-[68px]'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 border-b border-gray-100', sidebarOpen ? 'px-4' : 'px-3 justify-center')}>
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="whitespace-nowrap min-w-0">
              <p className="text-[13px] font-bold text-gray-900 leading-tight tracking-tight">Needs Assessment</p>
              <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase mt-0.5">Transport Planning</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {sidebarOpen ? (
          <div className="px-4 pb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Current task</p>
            <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
              <p className="text-sm font-semibold text-gray-900">{activeTask.label}</p>
              <p className="mt-1 text-xs text-gray-500">{activeTask.description}</p>
            </div>
          </div>
        ) : (
          <div className="mx-3 my-2 border-t border-gray-100" />
        )}

        <div className="px-2 space-y-0.5">
          {activeTask.items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={!sidebarOpen ? item.label : undefined}
                className={cn(
                  'group relative flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-primary-50 text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary-500 rounded-full" />
                )}
                <div className={cn(
                  'flex-shrink-0 w-5 h-5 flex items-center justify-center',
                  isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                )}>
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                {sidebarOpen && (
                  <span className={cn('truncate text-[13px]', isActive && 'font-semibold')}>
                    {item.label}
                  </span>
                )}
                {isActive && sidebarOpen && (
                  <div className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'flex items-center border-t border-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors',
          sidebarOpen ? 'justify-end px-4 py-3 gap-2' : 'justify-center py-3'
        )}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen && <span className="text-[11px] font-medium text-gray-400">Collapse</span>}
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </aside>
  );
}
