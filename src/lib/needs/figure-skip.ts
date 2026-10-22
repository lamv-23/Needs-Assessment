/**
 * Why a figure is left out of the Word export (R22, P2-R19): its data or map boundaries could not be loaded
 * (`unavailable`), it is collapsed (`collapsed`), or rendering it failed (`failed`). Kept apart from docx-export.ts so
 * that ChartWrapper can mark its errors without loading the Word library.
 */
export type FigureSkipReason = 'unavailable' | 'collapsed' | 'failed';

export interface SkippedFigure { title: string; reason: FigureSkipReason }

/** The error a figure's capture() throws when it cannot be pictured for a known reason. */
export function figureSkipError(reason: Exclude<FigureSkipReason, 'failed'>, message: string): Error {
  return Object.assign(new Error(message), { skipReason: reason });
}

/** The reason carried by an error from capture(); any other error is a failed render. */
export function skipReasonOf(error: unknown): FigureSkipReason {
  const reason = (error as { skipReason?: unknown } | null | undefined)?.skipReason;
  return reason === 'unavailable' || reason === 'collapsed' ? reason : 'failed';
}
