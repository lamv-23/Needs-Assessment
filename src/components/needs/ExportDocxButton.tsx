'use client';

import { useEffect, useRef, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { useFigureRegistry } from '@/components/needs/FigureRegistry';
import type { NarrativeSection } from '@/lib/needs/narrative';
import {
  exportFileName, exportTitle, formatNeedsDate, sameSelection, SELECTION_CHANGED_MESSAGE, type Sa2TableData,
} from '@/lib/needs/page-data';
import type { NeedsAssessment } from '@/lib/needs/types';

interface ExportDocxButtonProps {
  assessment: NeedsAssessment;
  sections: NarrativeSection[];
  /** The page's SA2 table for the selection, exported as a native table; null while the SA2 file is not loaded. */
  sa2Table?: Sa2TableData | null;
  /** What the document needs that is still loading ("SA2 data", "map boundaries"): the button waits until then. */
  waitingFor?: string | null;
}

/**
 * Downloads the assessment as an editable Word document: the findings, native tables, every figure that can be
 * rendered, data notes and sources. A figure that cannot be rendered is left out and named with why: its data or map
 * boundaries could not be loaded, or it is collapsed and can be expanded for another export (R22, P2-R19). The Word
 * library is loaded only when the button is clicked.
 *
 * The figures are captured from the live page, so a selection changed during the export would put pictures of the new
 * selection in a document whose text and table describe the old one. The export is therefore dropped, with a message,
 * if the selection changed at all since the click, checked when the figures are done and again before the download.
 */
export default function ExportDocxButton({
  assessment, sections, sa2Table = null, waitingFor = null,
}: ExportDocxButtonProps) {
  const registry = useFigureRegistry();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasAreas = assessment.areas.length > 0;
  const waiting = hasAreas && waitingFor !== null;

  // Counts every change of the selection the page shows. An export remembers the count at its click, so a selection
  // changed and changed back (A, B, A) during the export still counts as changed, which comparing A with A would miss.
  const latest = useRef(assessment);
  const selectionVersion = useRef(0);
  useEffect(() => {
    if (!sameSelection(latest.current, assessment)) selectionVersion.current += 1;
    latest.current = assessment;
  }, [assessment]);

  const handleExport = async () => {
    const started = assessment;
    const startedSa2Table = sa2Table;
    const version = selectionVersion.current;
    const figures = registry?.figures() ?? [];
    const selectionChanged = () => selectionVersion.current !== version;
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
        sa2Table: startedSa2Table,
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
        disabled={!hasAreas || working || waiting}
        title={hasAreas ? 'Download an editable Word document of this assessment' : 'Select an area to export'}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-primary-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {working || waiting
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <FileDown className="h-4 w-4" aria-hidden="true" />}
        <span>{working ? 'Preparing Word document…' : waiting ? `Loading ${waitingFor}…` : 'Export to Word'}</span>
      </button>
    </div>
  );
}
