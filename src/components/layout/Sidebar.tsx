'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Train,
  TrendingUp,
  GraduationCap,
  Home,
  BarChart3,
  GitCompare,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/store';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/demographics', label: 'Demographics', icon: Users },
  { href: '/transport', label: 'Transport', icon: Train },
  { href: '/economy', label: 'Economy', icon: TrendingUp },
  { href: '/education', label: 'Education', icon: GraduationCap },
  { href: '/housing', label: 'Housing', icon: Home },
  { href: '/growth', label: 'Growth', icon: BarChart3 },
  { type: 'divider' as const },
  { href: '/compare', label: 'Compare Areas', icon: GitCompare },
  { href: '/report', label: 'Report Builder', icon: FileText },
  { href: '/upload', label: 'Upload Data', icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 flex flex-col',
        sidebarOpen ? 'w-[260px]' : 'w-[68px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-gray-200">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && (
            <div className="whitespace-nowrap">
              <h1 className="text-sm font-bold text-gray-900">Needs Assessment</h1>
              <p className="text-[10px] text-gray-500">Transport Planning Tool</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item, i) => {
          if ('type' in item && item.type === 'divider') {
            return <hr key={i} className="my-3 border-gray-200" />;
          }
          const navItem = item as { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
          const isActive = pathname === navItem.href;
          const Icon = navItem.icon;
          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={!sidebarOpen ? navItem.label : undefined}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-primary-600')} />
              {sidebarOpen && <span>{navItem.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-12 border-t border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
      >
        {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>
    </aside>
  );
}
