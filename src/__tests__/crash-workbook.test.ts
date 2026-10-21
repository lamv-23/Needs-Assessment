/**
 * NSW crash workbook parsing (TfNSW "NSW Road Crash Data 2020–2024 — crash").
 *
 * Regression: the severity column is "Degree of crash" (Fatal / Injury /
 * Non-casualty (towaway)); the parser only looked for "degree of injury" /
 * "severity", so fatal and injury counts were always 0.
 */

import * as XLSX from 'xlsx';
import { parseCrashWorkbook } from '../lib/tfnsw-api';

// Header order and values as published in the source workbook.
function crashWorkbook(rows: Array<[string, number, number, string]>): ArrayBuffer {
  const data = rows.map(([degree, reportingYear, crashYear, lga]) => ({
    'Crash ID': 1,
    'Degree of crash': degree,
    'Degree of crash - detailed': degree === 'Injury' ? 'Serious Injury' : degree,
    'Reporting year': reportingYear,
    'Year of crash': crashYear,
    LGA: lga,
    'No. killed': degree === 'Fatal' ? 1 : 0,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('parseCrashWorkbook', () => {
  const workbook = crashWorkbook([
    ['Fatal', 2024, 2024, 'Sydney'],
    ['Injury', 2024, 2024, 'Sydney'],
    ['Injury', 2024, 2024, 'Sydney'],
    ['Non-casualty (towaway)', 2024, 2024, 'Sydney'],
    ['Injury', 2024, 2023, 'Sydney'],      // reported late: counted in reporting year
    ['Fatal', 2024, 2024, 'Blacktown'],    // other LGA: excluded
  ]);

  it('counts fatal and injury crashes from the "Degree of crash" column', () => {
    expect(parseCrashWorkbook(workbook, ['Sydney'])).toEqual([
      { year: 2024, totalCrashes: 5, fatalCrashes: 1, injuryCrashes: 3 },
    ]);
  });

  it('only counts rows for the requested LGA', () => {
    expect(parseCrashWorkbook(workbook, ['Blacktown'])).toEqual([
      { year: 2024, totalCrashes: 1, fatalCrashes: 1, injuryCrashes: 0 },
    ]);
  });
});
