'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { Download, ChevronDown, Clipboard, Check, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { wideCaptureSize } from '@/lib/export/capture-size';
import { flattenLeafletTransforms } from '@/lib/export/leaflet-capture';
import { excelSheetName } from '@/lib/export/sheet-name';
import { figureBodyParts, serializeSvg, svgExportable } from '@/lib/export/svg-export';
import { useFigureRegistry } from '@/components/needs/FigureRegistry';

interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  data?: Array<Record<string, unknown>>;
  dataKeys?: string[];
  xAxisKey?: string;
  /** Excel header text by data key, for keys that `toHeaderLabel` would mangle (e.g. "City of Sydney" becomes "City OF Sydney"). */
  headerLabels?: Record<string, string>;
  /** Optional summary stat shown when chart is collapsed */
  collapseSummary?: string;
  /** Start collapsed. Default: false (expanded) */
  defaultCollapsed?: boolean;
  /**
   * Source line rendered under the chart, inside the exported area so PNG and clipboard exports
   * include it: "Figure {n}. {title}. Source: {caption}" inside a FigureRegistryProvider (with
   * `figureId`), otherwise "{title}. Source: {caption}". Nothing is rendered when omitted.
   */
  caption?: string;
  /** Registers this chart with the nearest FigureRegistryProvider (numbering and Word export). Must be unique within the provider. */
  figureId?: string;
  /**
   * Whether "Download SVG" is offered. By default it is detected when the menu opens: only for a body with exactly one
   * chart SVG and no HTML legend or note, which an SVG file would leave out (R62). PNG and Word are unaffected.
   */
  svgExport?: boolean;
  /**
   * Why the figure has nothing to export, e.g. its data could not be loaded. Its Word capture then fails, so the export
   * leaves it out and names it (R22) instead of picturing the message.
   */
  unavailable?: string | null;
}

/** The caption element carries `data-figure-caption` so the registry's capture() can leave it out (Word adds its own). */
const isFigureCaption = (element: Element) => element.hasAttribute('data-figure-caption');

/** "Download SVG" is offered when `svgExport` allows it (auto: the whole figure is one SVG) and there is an SVG to save. */
function offersSvg(root: HTMLElement | null, svgExport: boolean | undefined): boolean {
  if (!root || svgExport === false) return false;
  if (svgExport === undefined && !svgExportable(figureBodyParts(root))) return false;
  return serializeSvg(root) !== null;
}

/** Download links are revoked after a delay: some browsers cancel a download whose URL is revoked straight away. */
const REVOKE_AFTER_MS = 10_000;

/**
 * html2canvas clips content to any ancestor whose overflow is not visible, so a figure wider than
 * its card (inside a scrolling `.overflow-x-auto`) would lose its right-hand side. For such a
 * figure, returns the options that capture its full width; for any other, nothing, so the capture
 * is unchanged.
 */
const SCROLLER = '.overflow-x-auto';
function wideFigureOptions(root: HTMLElement, scale: number): Parameters<typeof html2canvas>[1] {
  let hiddenWidth = 0;
  root.querySelectorAll<HTMLElement>(SCROLLER).forEach((el) => {
    hiddenWidth = Math.max(hiddenWidth, el.scrollWidth - el.clientWidth);
  });
  if (hiddenWidth <= 0) return {};
  const box = root.getBoundingClientRect();
  const size = wideCaptureSize({
    rootWidth: box.width,
    rootHeight: box.height,
    rootLeft: box.left,
    hiddenWidth,
    viewportWidth: window.innerWidth,
    requestedScale: scale,
  });
  return {
    width: size.width,
    windowWidth: size.windowWidth,
    scale: size.scale,
    // The clone is what gets rendered; the live page keeps its scrollbar.
    onclone: (_document, cloned) => {
      cloned.querySelectorAll<HTMLElement>(SCROLLER).forEach((el) => {
        el.style.overflow = 'visible';
      });
    },
  };
}

function toHeaderLabel(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
  return spaced
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase();
      if (word.length <= 3 && word === word.toLowerCase()) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export default function ChartWrapper({
  title,
  subtitle,
  children,
  className,
  data,
  dataKeys,
  xAxisKey = 'name',
  headerLabels,
  collapseSummary,
  defaultCollapsed = false,
  caption,
  figureId,
  svgExport,
  unavailable,
}: ChartWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // Detected after mount: `navigator` doesn't exist during SSR, so checking it
  // while rendering made server and client HTML differ (hydration error).
  const [clipboardSupported, setClipboardSupported] = useState(false);
  useEffect(() => {
    setClipboardSupported(!!navigator.clipboard);
  }, []);

  const [svgAvailable, setSvgAvailable] = useState(false);

  const registry = useFigureRegistry();
  const register = registry?.register;
  const unregister = registry?.unregister;
  const figureNumber = registry && figureId ? registry.numberOf(figureId) : null;

  const fileBase = title.replace(/\s+/g, '_').toLowerCase();

  const captureCanvas = useCallback(async (excludeCaption = false) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const root = chartRef.current;
    if (!root) return null;
    const wide = wideFigureOptions(root, 3);
    return html2canvas(root, {
      backgroundColor: '#ffffff',
      scale: 3,
      useCORS: true,
      ...(excludeCaption && { ignoreElements: isFigureCaption }),
      ...wide,
      onclone: (clonedDocument, cloned) => {
        flattenLeafletTransforms(cloned);
        wide?.onclone?.(clonedDocument, cloned);
      },
    });
  }, []);

  // PNG bytes for the Word export: same render as the PNG download, minus the caption element.
  const captureFigure = useCallback(async () => {
    if (unavailable) throw new Error(`Figure "${title}" is unavailable: ${unavailable}`);
    const canvas = await captureCanvas(true);
    if (!canvas) throw new Error(`Figure "${title}" is not rendered (collapsed or unmounted)`);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error(`Failed to render figure "${title}" as PNG`);
    return {
      png: new Uint8Array(await blob.arrayBuffer()),
      widthPx: canvas.width,
      heightPx: canvas.height,
    };
  }, [captureCanvas, title, unavailable]);

  // Registering again with the same id updates in place (keeps the figure's number), so changes
  // to title/caption don't reorder; the separate unmount effect is the only thing that unregisters.
  useEffect(() => {
    if (!figureId || !register) return;
    register({ id: figureId, title, caption: caption ?? '', capture: captureFigure });
  }, [figureId, register, title, caption, captureFigure]);
  useEffect(() => {
    if (!figureId || !unregister) return;
    return () => unregister(figureId);
  }, [figureId, unregister]);

  const captionText = caption
    ? `${figureNumber !== null ? `Figure ${figureNumber}. ` : ''}${title}. Source: ${caption}`
    : null;

  const toggleDropdown = () => {
    // Checked when the menu opens: charts render after data loads, so chartRef is only reliable now.
    if (!dropdownOpen) setSvgAvailable(offersSvg(chartRef.current, svgExport));
    setDropdownOpen(!dropdownOpen);
  };

  const handleExportPNG = async () => {
    setExporting(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `${fileBase}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export chart:', error);
    } finally {
      setExporting(false);
      setDropdownOpen(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!navigator.clipboard) return;
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }, 'image/png');
    } catch (error) {
      console.error('Failed to copy chart:', error);
    }
  };

  const handleExportSVG = () => {
    setDropdownOpen(false);
    if (!chartRef.current) return;
    try {
      const svg = serializeSvg(chartRef.current);
      if (!svg) return;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const link = document.createElement('a');
      link.download = `${fileBase}.svg`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    } catch (error) {
      console.error('Failed to export SVG:', error);
    }
  };

  const handleExportExcel = () => {
    if (!data || data.length === 0) return;
    setDropdownOpen(false);
    try {
      const allKeys = dataKeys && dataKeys.length > 0
        ? [xAxisKey, ...dataKeys].filter((k) => k in data[0])
        : Object.keys(data[0]);
      const headerRow = allKeys.map((k) => headerLabels?.[k] ?? toHeaderLabel(k));
      const dataRows = data.map((row) => allKeys.map((k) => row[k] ?? ''));
      const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName(title));
      XLSX.writeFile(workbook, `${fileBase}.xlsx`);
    } catch (error) {
      console.error('Failed to export Excel:', error);
    }
  };

  const hasExcelData = data && data.length > 0;

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-gray-200',
        className
      )}
    >
      {/* Header — always visible, click title area to collapse */}
      <div
        className={cn(
          'flex items-start justify-between px-6 pt-5',
          collapsed ? 'pb-5' : 'pb-4'
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-start gap-2 flex-1 min-w-0 text-left group"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-700 transition-colors leading-snug">
              {title}
            </h3>
            {subtitle && !collapsed && (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            )}
            {collapsed && collapseSummary && (
              <p className="text-sm text-primary-600 font-medium mt-0.5">{collapseSummary}</p>
            )}
          </div>
          <span className="mt-1 ml-2 flex-shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors">
            {collapsed
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronUp className="w-4 h-4" />
            }
          </span>
        </button>

        {/* Export controls — only show when expanded */}
        {!collapsed && (
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            {clipboardSupported && (
              <button
                onClick={handleCopyToClipboard}
                title="Copy chart to clipboard"
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Clipboard className="w-4 h-4" />
                )}
              </button>
            )}
            <div className="relative">
              <button
                onClick={toggleDropdown}
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
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[180px]">
                    <button
                      onClick={handleExportPNG}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Download PNG (3x)
                    </button>
                    {svgAvailable && (
                      <button
                        onClick={handleExportSVG}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Download SVG
                      </button>
                    )}
                    {hasExcelData && (
                      <button
                        onClick={handleExportExcel}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Download Excel (.xlsx)
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chart body — hidden when collapsed */}
      {!collapsed && (
        <div ref={chartRef} className="px-6 pb-6">
          {children}
          {captionText && (
            <p data-figure-caption className="mt-3 text-xs text-gray-500">
              {captionText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}


