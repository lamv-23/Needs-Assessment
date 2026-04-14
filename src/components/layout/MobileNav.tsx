'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { getTaskForPath, TASKS } from './navigation';

export default function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeTask = getTaskForPath(pathname);

  return (
    <>
      {/* Overlay for "More" drawer */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer */}
      {moreOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-xl rounded-t-xl px-2 pt-3 pb-2 md:hidden">
          <div className="flex items-center justify-between px-3 mb-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{activeTask.label}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{activeTask.description}</p>
            </div>
            <button
              onClick={() => setMoreOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {activeTask.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  'px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex md:hidden safe-bottom">
        {TASKS.map((task) => {
          const isActive = activeTask.key === task.key;
          const Icon = task.icon;
          return (
            <Link
              key={task.key}
              href={task.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'text-primary-600')} />
              {task.label}
              {isActive && <span className="absolute bottom-0 w-6 h-[2px] bg-primary-500 rounded-full" />}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
          More
        </button>
      </nav>
    </>
  );
}
