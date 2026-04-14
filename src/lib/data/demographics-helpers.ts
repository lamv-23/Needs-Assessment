export function buildLanguageChartData(
  languageGroups: Array<{ name: string; code: string; count: number }> | undefined,
  englishOnly: number | undefined,
  limit = 10
): Array<{ name: string; value: number }> {
  const rows: Array<{ name: string; value: number }> = [];

  if ((englishOnly ?? 0) > 0) {
    rows.push({ name: 'English only', value: englishOnly ?? 0 });
  }

  for (const group of languageGroups ?? []) {
    if (group.code === 'other') continue;
    rows.push({ name: group.name, value: group.count });
  }

  return rows.sort((a, b) => b.value - a.value).slice(0, limit);
}
