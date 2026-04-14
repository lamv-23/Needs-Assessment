'use client';

import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Severity = 'critical' | 'warning' | 'info' | 'success';

interface FindingCalloutProps {
  severity: Severity;
  heading: string;
  children: React.ReactNode;
  className?: string;
}

interface SeverityConfig {
  icon: React.ElementType;
  bg: string;
  border: string;
  heading: string;
  iconColor: string;
}

const config: Record<Severity, SeverityConfig> = {
  critical: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    heading: 'text-red-800',
    iconColor: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    heading: 'text-amber-800',
    iconColor: 'text-amber-500',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    heading: 'text-blue-800',
    iconColor: 'text-blue-500',
  },
  success: {
    icon: CheckCircle2,
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    heading: 'text-emerald-800',
    iconColor: 'text-emerald-500',
  },
};

export function FindingCallout({ severity, heading, children, className }: FindingCalloutProps) {
  const c = config[severity];
  const Icon = c.icon;
  return (
    <div className={cn('rounded-xl border p-4 flex gap-3', c.bg, c.border, className)}>
      <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', c.iconColor)} />
      <div>
        <p className={cn('text-sm font-semibold leading-snug', c.heading)}>{heading}</p>
        <div className="text-sm text-gray-600 mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
