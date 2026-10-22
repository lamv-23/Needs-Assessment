'use client';

import { HEATMAP_CATCHMENT_NOTE, heatmapRowLabel, wrapLabel } from '@/lib/needs/chart-data';
import {
  NEED_SCALE, NO_DATA_COLOR, NEUTRAL_FILL, needColor, needTextColor,
} from '@/lib/needs/colors';
import { markedValue, partialBenchmarkNotes, partialBenchmarks } from '@/lib/needs/coverage';
import { displayScore } from '@/lib/needs/format';
import { DOMAIN_LABELS, INDICATORS, NEED_DOMAINS } from '@/lib/needs/indicators';
import type { AreaAssessment, IndicatorDef, IndicatorScore, NeedsAssessment } from '@/lib/needs/types';

// Plain SVG (not Recharts) so the figure exports cleanly as SVG and PNG. Sizes are in SVG pixels.
const LABEL_W = 268;
const CELL_W = 110;
const ROW_H = 36;
const DOMAIN_H = 26;
const BENCHMARK_GAP = 14;
const HEADER_LINE_H = 14;
const HEADER_MAX_LINES = 4;
const HEADER_CHARS = 14;
const LABEL_LINE_H = 14;
const LEGEND_W = 700;
const LEGEND_LINE_H = 20;
const NOT_RANKED_NOTE = 'not ranked: fewer than 5 LGAs with data in the comparison group, so the cell is unshaded.';
const FONT = 'Inter, system-ui, sans-serif';

const DARK_TEXT = '#111827';
const MUTED_TEXT = '#4b5563';
const CELL_STROKE = '#cbd5e1';

interface Column { key: string; header: string; area: AreaAssessment; benchmark: boolean }

/**
 * How one cell looks: shaded by need only for a ranked, scored indicator of a selected area. A benchmark value made
 * from only some of its LGAs is marked "*"; a value with fewer than 5 LGAs with data in the group is "not ranked" (R58).
 */
function cellAppearance(score: IndicatorScore | undefined, def: IndicatorDef, benchmark: boolean) {
  const text = markedValue(def, score, benchmark ? 'benchmark' : 'area');
  if (!score || score.value === null) {
    return { fill: NO_DATA_COLOR, textColor: MUTED_TEXT, text, hasValue: false, percentile: null, notRanked: false };
  }
  if (benchmark || !def.scored || score.unranked) {
    return {
      fill: NEUTRAL_FILL, textColor: DARK_TEXT, text, hasValue: true, percentile: null,
      notRanked: !benchmark && score.unranked,
    };
  }
  return {
    fill: needColor(score.percentile), textColor: needTextColor(score.percentile), text, hasValue: true,
    percentile: score.percentile, notRanked: false,
  };
}

/** The scale, then a line for each note: ≈, "not ranked" and the benchmark values marked "*". */
function Legend({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  const items = [
    ...NEED_SCALE.map((fill, i) => ({ fill, label: `${i * 20}–${(i + 1) * 20}`, labelWidth: 40 })),
    { fill: NO_DATA_COLOR, label: 'No data', labelWidth: 44 },
    { fill: NEUTRAL_FILL, label: 'Unshaded: benchmark or context', labelWidth: 160 },
  ];
  let cursor = x;
  return (
    <g transform={`translate(0,${y})`}>
      <text x={x} fontSize={11} fill={MUTED_TEXT}>
        Shading shows the need percentile within the comparison group; darker means more need.
      </text>
      <g transform="translate(0,22)">
        {items.map(item => {
          const at = cursor;
          cursor += 18 + 6 + item.labelWidth + 16;
          return (
            <g key={item.label} transform={`translate(${at},0)`}>
              <rect y={-11} width={18} height={14} fill={item.fill} stroke={CELL_STROKE} />
              <text x={24} fontSize={11} fill={DARK_TEXT}>{item.label}</text>
            </g>
          );
        })}
      </g>
      {lines.map((line, i) => (
        <text key={line} x={x} y={44 + i * LEGEND_LINE_H} fontSize={11} fill={MUTED_TEXT}>{line}</text>
      ))}
    </g>
  );
}

/**
 * Indicators (rows, grouped by domain) against the selected areas, Greater Sydney and NSW
 * (columns). Cells are shaded by need percentile; benchmark cells, the context-only indicator and values that are not
 * ranked are unshaded. The notes are drawn inside the SVG, so an SVG download keeps them.
 */
export default function NeedsHeatmap({ assessment }: { assessment: NeedsAssessment }) {
  const { areas, benchmarks } = assessment;
  if (areas.length === 0) return null;

  const columns: Column[] = [
    ...areas.map(area => ({ key: area.areaId, header: area.name, area, benchmark: false })),
    { key: 'gsyd', header: benchmarks.gsyd.name, area: benchmarks.gsyd, benchmark: true },
    { key: 'nsw', header: benchmarks.nsw.name, area: benchmarks.nsw, benchmark: true },
  ];
  const scoresByColumn = columns.map(c => new Map(c.area.indicators.map(s => [s.id, s])));
  const columnX = (i: number) => LABEL_W + i * CELL_W + (i >= areas.length ? BENCHMARK_GAP : 0);
  const columnMid = (i: number) => columnX(i) + CELL_W / 2;

  const headerLines = columns.map(c => wrapLabel(c.header, HEADER_CHARS, HEADER_MAX_LINES));
  const headerH = Math.max(...headerLines.map(l => l.length)) * HEADER_LINE_H + 14;

  const gridW = columnX(columns.length - 1) + CELL_W;
  const width = Math.max(gridW, LEGEND_W);
  const showApproximate = scoresByColumn.some(scores => Array.from(scores.values()).some(s => s.approximate && s.value !== null));
  const showNotRanked = areas.some(area => area.indicators.some(s => s.unranked));
  const legendLines = [
    ...(showApproximate ? ['≈ population-weighted estimate for a combined selection or benchmark.'] : []),
    ...(showNotRanked ? [NOT_RANKED_NOTE] : []),
    ...partialBenchmarkNotes(partialBenchmarks(assessment)),
    ...HEATMAP_CATCHMENT_NOTE,
  ];

  const blocks = NEED_DOMAINS.map(domain => ({ domain, defs: INDICATORS.filter(def => def.domain === domain) }));
  const blockHeight = (block: (typeof blocks)[number]) => DOMAIN_H + block.defs.length * ROW_H;
  const blockTops = blocks.map((_, i) => headerH + blocks.slice(0, i).reduce((sum, block) => sum + blockHeight(block), 0));
  const gridBottom = headerH + blocks.reduce((sum, block) => sum + blockHeight(block), 0);
  const height = gridBottom + 24 + 44 + legendLines.length * LEGEND_LINE_H;

  return (
    <div className="overflow-x-auto">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-none"
        style={{ fontFamily: FONT }}
        role="img"
        aria-label={`Heatmap of need percentile for ${INDICATORS.length} indicators across ${areas.length} ${areas.length === 1 ? 'area' : 'areas'}, Greater Sydney and NSW`}
      >
        <rect width={width} height={height} fill="#ffffff" />

        {columns.map((c, i) => {
          const lines = headerLines[i];
          const firstBaseline = headerH - 8 - (lines.length - 1) * HEADER_LINE_H;
          return (
            <text
              key={c.key}
              textAnchor="middle"
              fontSize={12}
              fontWeight={c.benchmark ? 500 : 600}
              fontStyle={c.benchmark ? 'italic' : 'normal'}
              fill={DARK_TEXT}
            >
              <title>{c.header}</title>
              {lines.map((line, n) => (
                <tspan key={n} x={columnMid(i)} y={firstBaseline + n * HEADER_LINE_H}>{line}</tspan>
              ))}
            </text>
          );
        })}

        {blocks.map(({ domain, defs }, blockIndex) => {
          const domainY = blockTops[blockIndex];
          return (
            <g key={domain}>
              <rect y={domainY} width={gridW} height={DOMAIN_H} fill="#f1f5f9" />
              <text x={8} y={domainY + DOMAIN_H / 2 + 4} fontSize={12} fontWeight={700} fill={DARK_TEXT}>
                {DOMAIN_LABELS[domain]}
              </text>

              {defs.map((def, rowIndex) => {
                const rowY = domainY + DOMAIN_H + rowIndex * ROW_H;
                const midY = rowY + ROW_H / 2 + 4;
                const { lines, hint } = heatmapRowLabel(def);
                const firstBaseline = midY - ((lines.length + (hint ? 1 : 0) - 1) * LABEL_LINE_H) / 2;
                return (
                  <g key={def.id}>
                    <text fontSize={12} fill={DARK_TEXT} fontStyle={def.scored ? 'normal' : 'italic'}>
                      {lines.map((line, n) => (
                        <tspan key={n} x={8} y={firstBaseline + n * LABEL_LINE_H}>{line}</tspan>
                      ))}
                      {hint && (
                        <tspan x={8} y={firstBaseline + lines.length * LABEL_LINE_H} fontSize={10.5} fontStyle="italic" fill={MUTED_TEXT}>
                          {hint}
                        </tspan>
                      )}
                    </text>

                    {columns.map((c, i) => {
                      const score = scoresByColumn[i].get(def.id);
                      const cell = cellAppearance(score, def, c.benchmark);
                      const detail = [
                        cell.percentile !== null ? `need percentile ${displayScore(cell.percentile)}` : null,
                        cell.notRanked ? `not ranked: only ${score?.ranked} LGAs with data in the comparison group` : null,
                        score?.partial ? `some ${c.benchmark ? 'of its' : 'selected'} LGAs have no value` : null,
                      ].filter(Boolean).join('; ');
                      return (
                        <g key={c.key}>
                          <title>{`${c.header}, ${def.label}: ${cell.text}${detail ? `; ${detail}` : ''}`}</title>
                          <rect
                            x={columnX(i) + 1}
                            y={rowY + 1}
                            width={CELL_W - 2}
                            height={ROW_H - 2}
                            fill={cell.fill}
                            stroke={CELL_STROKE}
                            strokeWidth={0.5}
                          />
                          <text
                            x={columnMid(i)}
                            y={cell.notRanked ? midY - 6 : midY}
                            textAnchor="middle"
                            fontSize={12}
                            fontStyle={cell.hasValue ? 'normal' : 'italic'}
                            fill={cell.textColor}
                          >
                            {cell.text}
                          </text>
                          {cell.notRanked && (
                            <text x={columnMid(i)} y={midY + 8} textAnchor="middle" fontSize={10} fontStyle="italic" fill={MUTED_TEXT}>
                              not ranked
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })}

        <Legend x={8} y={gridBottom + 24} lines={legendLines} />
      </svg>
    </div>
  );
}
