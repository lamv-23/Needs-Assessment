type EmploymentEntry = { year: number; employed: number; unemployed: number };

/**
 * Returns the employed count for year 2021 from the employment trend array.
 * Uses year-based lookup (not index 0) to avoid showing 2011 data labelled as 2021.
 */
export function getEmployed2021(trend: EmploymentEntry[]): number | null {
  const entry = trend.find(d => d.year === 2021);
  return entry?.employed ?? null;
}
