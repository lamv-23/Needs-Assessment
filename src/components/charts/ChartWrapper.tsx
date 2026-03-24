'use client';

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export default function ChartWrapper({
  title,
  subtitle,
  children,
  className,
}: ChartWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPNG = async () => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = `${title.replace(/\s+/g, '_').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export chart:', error);
    } finally {
      setExporting(false);
      setDropdownOpen(false);
    }
  };

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-gray-200 p-6',
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            disabled={exporting}
          >
            <Download className="w-4 h-4" />
            <ChevronDown className="w-3 h-3" />
          </button>
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={handleExportPNG}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Download as PNG
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div ref={chartRef}>{children}</div>
    </div>
  );
}
