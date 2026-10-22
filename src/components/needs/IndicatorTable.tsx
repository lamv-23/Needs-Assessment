'use client';

import { Fragment } from 'react';
import { DOMAIN_LABELS } from '@/lib/needs/indicators';
import type { IndicatorTableData } from '@/lib/needs/page-data';

const NO_DATA = 'No data';
// The last two columns are the Greater Sydney and NSW benchmarks.
const BENCHMARK_COLUMNS = 2;

/**
 * Every indicator against the selected areas ("value (pNN)": the need percentile in their comparison
 * group), Greater Sydney and NSW (value only), grouped by domain, with each indicator's source.
 * `comparison` names the comparison group(s) the percentiles are ranked in.
 */
export default function IndicatorTable({ table, comparison }: { table: IndicatorTableData; comparison: string }) {
  const { columns, rows } = table;
  const firstBenchmark = columns.length - BENCHMARK_COLUMNS;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700">
              <th scope="col" className="sticky left-0 z-10 min-w-[220px] bg-gray-50 px-3 py-2 text-left font-semibold">
                Indicator
              </th>
              {columns.map((column, i) => (
                <th
                  key={column}
                  scope="col"
                  className={`min-w-[120px] px-3 py-2 text-right font-semibold ${i >= firstBenchmark ? 'italic text-gray-500' : ''}`}
                >
                  {column}
                </th>
              ))}
              <th scope="col" className="min-w-[150px] px-3 py-2 text-left font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <Fragment key={row.id}>
                {(r === 0 || rows[r - 1].domain !== row.domain) && (
                  <tr className="bg-slate-100">
                    <th scope="colgroup" colSpan={columns.length + 2} className="px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-gray-700">
                      {DOMAIN_LABELS[row.domain]}
                    </th>
                  </tr>
                )}
                <tr className="border-t border-gray-100">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-gray-800">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={columns[i]}
                      className={`px-3 py-2 text-right ${
                        cell === NO_DATA ? 'italic text-gray-500' : i >= firstBenchmark ? 'text-gray-600' : 'text-gray-900'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-xs text-gray-600">{row.source}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-600">
        pNN is an area&apos;s need percentile within its comparison group ({comparison}): higher means more need, and p80 or
        above is a key need. Greater Sydney and NSW are shown as values only. ≈ marks a population-weighted estimate.
      </p>
    </div>
  );
}
