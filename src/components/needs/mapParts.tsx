'use client';

import { NEED_SCALE } from '@/lib/needs/colors';

/** Pieces the need map and the SA2 need map share: the NSW view, the selected-LGA outline, tooltip escaping and the legend. */

export const NSW_CENTRE: [number, number] = [-32.8, 147];
export const NSW_ZOOM = 6;
/** Outline of a selected LGA, on the map and in the legend. */
export const SELECTED_OUTLINE = '#111827';
const SWATCH_STROKE = '#cbd5e1';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text for a tooltip's HTML. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export interface LegendStep { fill: string; label: string }

/** The need scale as legend steps: "0–20" … "80–100". */
export const NEED_STEPS: LegendStep[] = NEED_SCALE.map((fill, i) => ({ fill, label: `${i * 20}–${(i + 1) * 20}` }));

/** A map legend: what the shading is, a swatch per step, then the selected-LGA outline. */
export function NeedMapLegend({ note, steps }: { note: string; steps: LegendStep[] }) {
  return (
    <div data-figure-legend className="mt-2 text-xs text-gray-600">
      <p>{note}</p>
      <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-900">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3.5 w-[18px]"
              style={{ backgroundColor: step.fill, border: `1px solid ${SWATCH_STROKE}` }}
            />
            {step.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-3.5 w-[18px] bg-white"
            style={{ border: `3px solid ${SELECTED_OUTLINE}` }}
          />
          Selected LGA
        </li>
      </ul>
    </div>
  );
}
