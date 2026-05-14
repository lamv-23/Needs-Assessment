'use client';

import { cn } from '@/lib/utils';

interface StatCardSkeletonProps {
  className?: string;
  count?: number;
}

export function StatCardSkeleton({ className, count = 4 }: StatCardSkeletonProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 animate-pulse">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-gray-200 rounded-lg" />
            <div className="h-3.5 bg-gray-200 rounded w-24" />
          </div>
          <div className="h-7 bg-gray-200 rounded w-16 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 p-5 animate-pulse', className)}>
      <div className="h-4 bg-gray-200 rounded w-40 mb-1" />
      <div className="h-3 bg-gray-100 rounded w-56 mb-4" />
      <div className="h-64 bg-gray-50 rounded" />
    </div>
  );
}