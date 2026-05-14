'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ACCENT_COLORS: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
};

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  subtitle?: string;
  className?: string;
  accentColor?: keyof typeof ACCENT_COLORS;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  change,
  changeLabel,
  subtitle,
  className,
  accentColor = 'blue',
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;
  const accent = ACCENT_COLORS[accentColor] ?? ACCENT_COLORS.blue;

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-gray-200 p-5',
        className
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className={cn('p-2 rounded-lg', accent.bg)}>
            <Icon className={cn('w-5 h-5', accent.text)} />
          </div>
        )}
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {isPositive && <TrendingUp className="w-4 h-4 text-green-600" />}
          {isNegative && <TrendingDown className="w-4 h-4 text-red-600" />}
          <span
            className={cn(
              'text-sm font-medium',
              isPositive && 'text-green-600',
              isNegative && 'text-red-600'
            )}
          >
            {isPositive ? '+' : ''}
            {change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-sm text-gray-400 ml-1">{changeLabel}</span>
          )}
        </div>
      )}
      {subtitle && (
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
