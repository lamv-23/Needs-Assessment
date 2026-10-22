'use client';

import { SA2_TABLE_COLUMNS, SA2_TABLE_EMPTY, type Sa2TableData } from '@/lib/needs/page-data';

const NO_DATA = 'No data';
const NO_SCORE = 'No score';

const missing = (cell: string) => cell === NO_DATA || cell === NO_SCORE;

/** Room for the long cells and headers, so the table scrolls rather than squeezes them. */
const MIN_WIDTHS: Partial<Record<(typeof SA2_TABLE_COLUMNS)[number]['key'], string>> = {
  name: 'min-w-[200px]',
  lgas: 'min-w-[160px]',
  overall: 'min-w-[200px]',
  frequent: 'min-w-[170px]',
};

/**
 * The selection's highest-need SA2s by overall SA2 need score: the LGAs each is listed for (with their shares of its
 * residents), its band and score with its rank among NSW SA2s, its transport and socio-economic scores, and its
 * residents near frequent AM-peak public transport (straight-line distance). The notes say what the scores cover. The
 * columns are the Word export's (SA2_TABLE_COLUMNS).
 */
export default function Sa2RankingTable({ table }: { table: Sa2TableData }) {
  const cell = (text: string, align: 'left' | 'right' = 'right') => (
    <td className={`px-3 py-2 ${align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${missing(text) ? 'italic text-gray-500' : 'text-gray-900'}`}>
      {text}
    </td>
  );

  return (
    <div>
      {table.rows.length === 0 ? (
        <p className="text-sm text-gray-600">{SA2_TABLE_EMPTY}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-700">
                {SA2_TABLE_COLUMNS.map(column => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`${MIN_WIDTHS[column.key] ?? ''} px-3 py-2 font-semibold ${column.numeric ? 'text-right' : 'text-left'}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map(row => (
                <tr key={row.code} className="border-t border-gray-100 align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">{row.name}</th>
                  <td className="px-3 py-2 text-left text-gray-700">{row.lgas}</td>
                  <td className="px-3 py-2 text-left">
                    <span className={missing(row.overall) ? 'italic text-gray-500' : 'text-gray-900'}>{row.overall}</span>
                    {row.rank && <span className="block text-xs text-gray-500">{row.rank}</span>}
                  </td>
                  {cell(row.transport)}
                  {cell(row.socio)}
                  {cell(row.frequent)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div data-figure-note className="mt-3 space-y-1 text-xs text-gray-600">
        {table.notes.map(note => <p key={note}>{note}</p>)}
      </div>
    </div>
  );
}
