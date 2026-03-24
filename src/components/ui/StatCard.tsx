'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  subtitle?: string;
  className?: string;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  change,
  changeLabel,
  subtitle,
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-gray-200 p-5',
        className
      )}
    >
      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="w-5 h-5 text-blue-600" />
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
