'use client';

import { useAppStore } from '@/store';
import { YEARS } from '@/lib/utils';
import { Calendar } from 'lucide-react';

export default function YearSelector() {
  const { selectedYear, setSelectedYear } = useAppStore();

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-400" />
      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(Number(e.target.value))}
        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
      >
        {YEARS.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}
