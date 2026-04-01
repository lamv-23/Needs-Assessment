import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function calculateGrowthRate(
  oldValue: number,
  newValue: number
): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number
): number {
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

export const CHART_COLORS = [
  '#2563EB', // deep blue (primary)
  '#0891B2', // teal-cyan
  '#059669', // emerald
  '#D97706', // warm amber
  '#7C3AED', // violet
  '#DC2626', // clear red
  '#0284C7', // sky blue
  '#EA580C', // burnt orange
  '#4F46E5', // indigo
  '#0D9488', // teal
];

export const YEARS = [2011, 2016, 2021] as const;

export const GREATER_SYDNEY_CENTER = { lat: -33.8688, lng: 151.2093 };
export const DEFAULT_ZOOM = 10;
