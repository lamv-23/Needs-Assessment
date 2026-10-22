'use client';

import { useEffect, useRef, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { useFigureRegistry } from '@/components/needs/FigureRegistry';
import type { NarrativeSection } from '@/lib/needs/narrative';
import {
  exportFileName, exportTitle, formatNeedsDate, sameSelection, SELECTION_CHANGED_MESSAGE,
} from '@/lib/needs/page-data';
import type { NeedsAssessment } from '@/lib/needs/types';

interface ExportDocxButtonProps {
  assessment: NeedsAssessment;
  sections: NarrativeSection[];
}

/**
 * Downloads the assessment as an editable Word document: the findings, a native table, every figure that can be
 * rendered, data notes and sources. A figure that cannot be rendered (collapsed) is left out and named, so the user can
 * expand it and export again. The Word library is loaded only when the button is clicked.
 *
 * The figures are captured from the live page, so a selection changed during the export would put pictures of the new
 * selection in a document whose text and table describe the old one. The export is therefore dropped, with a message,
 * if the selection differs from the one at the click when the figures are done and again before the download.
 */
export default function ExportDocxButton({ assessment, sections }: ExportDocxButtonProps) {
  const registry = useFigureRegistry();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasAreas = assessment.areas.length > 0;

  // The assessment the page shows now, which a running export compares with the one it started from.
  const latest = useRef(assessment);
  useEffect(() => {
    latest.current = assessment;
  }, [assessment]);

  const handleExport = async () => {
    const started = assessment;
    const figures = registry?.figures() ?? [];
    const selectionChanged = () => !sameSelection(started, latest.current);
    setWorking(true);
    setMessage(null);
    try {
      const [{ Packer }, { buildNeedsDocument, captureFigures, skippedFiguresMessage }] = await Promise.all([
        import('docx'),
        import('@/lib/needs/docx-export'),
      ]);
      const { captured, skipped } = await captureFigures(figures);
      if (selectionChanged()) {
        setMessage(SELECTION_CHANGED_MESSAGE);
        return;
      }
      const title = exportTitle(started);
      const blob = await Packer.toBlob(buildNeedsDocument({
        title,
        generatedOn: formatNeedsDate(new Date().toISOString()),
        assessment: started,
        narrative: sections,
        figures: captured,
      }));
      if (selectionChanged()) {
        setMessage(SELECTION_CHANGED_MESSAGE);
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked after a delay: some browsers cancel a download whose URL is revoked straight away.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setMessage(skippedFiguresMessage(skipped));
    } catch (error) {
      console.error('Failed to export Word document:', error);
      setMessage('The Word document could not be created. Try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {message && (
        <p role="status" className="max-w-md text-right text-xs text-amber-800">{message}</p>
      )}
      <button
        type="button"
        onClick={handleExport}
        disabled={!hasAreas || working}
        title={hasAreas ? 'Download an editable Word document of this assessment' : 'Select an area to export'}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-primary-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
        <span>{working ? 'Preparing Word document…' : 'Export to Word'}</span>
      </button>
    </div>
  );
}
