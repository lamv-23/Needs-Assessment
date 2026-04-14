'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardList,
  FileText,
  GitCompare,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  MapPin,
  Train,
  TrendingUp,
  Upload,
  Users,
  Wand2,
} from 'lucide-react';

export type TaskKey = 'explore' | 'analyse' | 'compare' | 'report';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type TaskConfig = {
  key: TaskKey;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  items: NavItem[];
};

export const TASKS: TaskConfig[] = [
  {
    key: 'explore',
    label: 'Explore',
    href: '/',
    icon: LayoutDashboard,
    description: 'Browse the evidence base',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/demographics', label: 'Demographics', icon: Users },
      { href: '/transport', label: 'Transport', icon: Train },
      { href: '/economy', label: 'Economy', icon: TrendingUp },
      { href: '/education', label: 'Education', icon: GraduationCap },
      { href: '/housing', label: 'Housing', icon: Home },
      { href: '/growth', label: 'Growth', icon: BarChart3 },
    ],
  },
  {
    key: 'analyse',
    label: 'Analyse',
    href: '/problem-definition',
    icon: ClipboardList,
    description: 'Define needs and shape options',
    items: [
      { href: '/problem-definition', label: 'Problem Definition', icon: ClipboardList },
      { href: '/strategic-alignment', label: 'Strategic Alignment', icon: Layers },
      { href: '/access-map', label: 'PT Access Map', icon: MapPin },
      { href: '/business-case', label: 'Business Case', icon: Wand2 },
    ],
  },
  {
    key: 'compare',
    label: 'Compare',
    href: '/compare',
    icon: GitCompare,
    description: 'Benchmark places side by side',
    items: [
      { href: '/compare', label: 'Compare Areas', icon: GitCompare },
    ],
  },
  {
    key: 'report',
    label: 'Report',
    href: '/report',
    icon: FileText,
    description: 'Package and export outputs',
    items: [
      { href: '/report', label: 'Report Builder', icon: FileText },
      { href: '/upload', label: 'Upload Data', icon: Upload },
    ],
  },
];

export function getTaskForPath(pathname: string): TaskConfig {
  const normalizedPath = pathname === '/admin' ? '/report' : pathname;
  return (
    TASKS.find((task) => task.items.some((item) => item.href === normalizedPath)) ??
    TASKS[0]
  );
}
