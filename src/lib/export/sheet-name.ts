/** Excel's limit on a worksheet name. */
const MAX_SHEET_NAME_CHARS = 31;

/**
 * A figure title as an Excel worksheet name: the characters Excel forbids (: \ / ? * [ ]) become spaces, runs of
 * spaces become one, and the name is cut to 31 characters. "Job growth 2021–41: selected areas" would otherwise make
 * a workbook Excel has to repair.
 */
export function excelSheetName(title: string): string {
  const name = title.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SHEET_NAME_CHARS).trim();
  return name || 'Data';
}
