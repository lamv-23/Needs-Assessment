import { NEEDS_SNAPSHOT } from '@/lib/data/needs-indicators-data';
import { runAssessment } from '@/lib/needs/assess';
import {
  domainScoresExcel, excelOf, growthServiceExcel, indicatorTableExcel, jobsHousingExcel, mismatchExcel, needMapExcel,
  quadrantExcel, radarExcel, stripExcel, trendsExcel, type FigureExcel,
} from '@/lib/needs/excel-data';
import { excelSheetName } from '@/lib/export/sheet-name';
import { displayScore } from '@/lib/needs/format';
import { INDICATOR_BY_ID, INDICATORS, NEED_DOMAINS } from '@/lib/needs/indicators';
import {
  growthServiceChartData, jobsHousingChartData, mismatchChartData, trendData,
} from '@/lib/needs/insight-chart-data';
import { carDependencyMismatch } from '@/lib/needs/insights';
import { mapScores } from '@/lib/needs/map-data';
import { QUADRANT_SCATTERS, RADAR_AXES, inNeedQuadrant, quadrantPanels, radarData } from '@/lib/needs/project-need';
import { needPercentile } from '@/lib/needs/scoring';
import type { NeedsAssessment, NeedsMode, Universe } from '@/lib/needs/types';

/** R64: every figure's Excel data, as numbers. */

const assess = (areaIds: string[], universe: Universe = 'nsw', mode: NeedsMode = 'separate'): NeedsAssessment =>
  runAssessment({ snapshot: NEEDS_SNAPSHOT, areaIds, mode, universe });

/** The sheet as ChartWrapper writes it: the header row, then a row per record in column order (null is a blank cell). */
const sheet = ({ data, xAxisKey, dataKeys, headerLabels }: FigureExcel) => {
  const keys = [xAxisKey, ...dataKeys];
  return { header: keys.map(k => headerLabels[k]), rows: data.map(row => keys.map(k => row[k])) };
};
const column = (excel: FigureExcel, header: string) => {
  const { header: headers, rows } = sheet(excel);
  const at = headers.indexOf(header);
  if (at < 0) throw new Error(`no column "${header}" in ${headers.join(' | ')}`);
  return rows.map(r => r[at]);
};
const isNumberOrBlank = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
const rounded = (v: number, decimals: number) => Number(v.toFixed(decimals));

describe('excelSheetName', () => {
  test('drops the characters Excel forbids and keeps to 31 characters', () => {
    expect(excelSheetName('Job growth 2021–41: selected areas against NSW LGAs')).toBe('Job growth 2021–41 selected are');
    expect(excelSheetName('A/B [x]? *')).toBe('A B x');
    expect(excelSheetName('Need map')).toBe('Need map');
    expect(excelSheetName(':::')).toBe('Data');
  });
});

describe('excelOf', () => {
  test('every record has every column, so no column is dropped for a missing first value', () => {
    const excel = excelOf([{ n: 'a', v: null }, { n: 'b', v: 2 }], [
      { key: 'name', header: 'Name', value: r => r.n },
      { key: 'value', header: 'Value', value: r => r.v },
    ]);
    expect(excel).toEqual({
      data: [{ name: 'a', value: null }, { name: 'b', value: 2 }],
      xAxisKey: 'name',
      dataKeys: ['value'],
      headerLabels: { name: 'Name', value: 'Value' },
    });
  });
});

describe('indicatorTableExcel (table and heatmap)', () => {
  const a = assess(['lga_camden', 'lga_newcastle']);
  const excel = indicatorTableExcel(a);

  test('a row per indicator, with domain, label and unit, then five columns per area and benchmark, then source', () => {
    const { header, rows } = sheet(excel);
    expect(rows).toHaveLength(INDICATORS.length);
    expect(header.slice(0, 3)).toEqual(['Domain', 'Indicator', 'Unit']);
    expect(header.slice(3, 8)).toEqual([
      'Camden value', 'Camden percentile', 'Camden approximate (Y/N)', 'Camden partial (Y/N)', 'Camden not ranked (Y/N)',
    ]);
    expect(header.slice(-6)).toEqual([
      'NSW value', 'NSW percentile', 'NSW approximate (Y/N)', 'NSW partial (Y/N)', 'NSW not ranked (Y/N)', 'Source',
    ]);
    expect(header).toHaveLength(3 + 4 * 5 + 1);
    expect(column(excel, 'Indicator')).toEqual(INDICATORS.map(d => (d.scored ? d.label : `${d.label} (context)`)));
    expect(column(excel, 'Unit')).toEqual(INDICATORS.map(d => d.unit));
  });

  test('values and percentiles are numbers: the value as shown, the percentile floored; no data is blank', () => {
    const camden = a.areas[0];
    const values = column(excel, 'Camden value');
    const percentiles = column(excel, 'Camden percentile');
    INDICATORS.forEach((def, i) => {
      const s = camden.indicators.find(x => x.id === def.id)!;
      expect(values[i]).toBe(s.value === null ? null : rounded(s.value, def.decimals));
      expect(percentiles[i]).toBe(s.percentile === null ? null : displayScore(s.percentile));
    });
    for (const header of sheet(excel).header.filter(h => / (value|percentile)$/.test(h))) {
      expect(column(excel, header).every(isNumberOrBlank)).toBe(true);
    }
  });

  test('flags are Y or N: the NSW job growth value is partial, SEIFA is approximate for benchmarks', () => {
    const at = (id: string) => INDICATORS.findIndex(d => d.id === id);
    expect(column(excel, 'NSW partial (Y/N)')[at('job_growth_2041')]).toBe('Y');
    expect(column(excel, 'NSW partial (Y/N)')[at('car_dependency')]).toBe('N');
    expect(column(excel, 'NSW approximate (Y/N)')[at('seifa_irsd')]).toBe('Y');
    expect(column(excel, 'Camden approximate (Y/N)')[at('seifa_irsd')]).toBe('N');
    for (const header of sheet(excel).header.filter(h => h.endsWith('(Y/N)'))) {
      expect(column(excel, header).every(v => v === 'Y' || v === 'N')).toBe(true);
    }
  });

  test('a value not ranked in its group has its number, a blank percentile and Y (R58)', () => {
    const region = indicatorTableExcel(assess(['lga_newcastle'], 'region'));
    const at = INDICATORS.findIndex(d => d.id === 'job_growth_2041');
    expect(typeof column(region, 'Newcastle value')[at]).toBe('number');
    expect(column(region, 'Newcastle percentile')[at]).toBeNull();
    expect(column(region, 'Newcastle not ranked (Y/N)')[at]).toBe('Y');
  });
});

describe('needMapExcel', () => {
  test('every NSW LGA with its overall score (floored) and band, or why it has none', () => {
    const a = assess(['lga_central_coast'], 'region');
    const excel = needMapExcel(a);
    const scores = mapScores(a);
    expect(sheet(excel).header).toEqual(['LGA', 'Overall need score', 'Band', 'Not scored because']);
    expect(excel.data).toHaveLength(128);
    for (const row of excel.data) {
      const record = a.records.find(r => r.name === row.lga)!;
      const entry = scores.get(record.areaId)!;
      expect(row.score).toBe(entry.score === null ? null : displayScore(entry.score));
      expect(row.band).toBe(entry.band);
      expect(row.reason).toBe(entry.noScoreReason);
    }
    expect(excel.data.find(r => r.lga === 'Central Coast')).toEqual({
      lga: 'Central Coast', score: null, band: null, reason: 'No comparison: only LGA in its group',
    });
  });
});

describe('domainScoresExcel', () => {
  test('a row per area, then Greater Sydney against NSW; scores floored like the chart labels', () => {
    const a = assess(['lga_blacktown', 'lga_penrith']);
    const excel = domainScoresExcel(a);
    expect(sheet(excel).header).toEqual(['Area', 'Transport disadvantage', 'Socio-economic disadvantage', 'Growth pressure']);
    expect(column(excel, 'Area')).toEqual(['Blacktown', 'Penrith', 'Greater Sydney']);
    const transport = a.areas[0].domains.find(d => d.domain === 'transport')!.score!;
    expect(column(excel, 'Transport disadvantage')[0]).toBe(displayScore(transport));
    expect(NEED_DOMAINS.length).toBe(3);
  });

  test('no Greater Sydney row against a region (R61)', () => {
    expect(column(domainScoresExcel(assess(['lga_blacktown'], 'region')), 'Area')).toEqual(['Blacktown']);
  });
});

describe('radarExcel', () => {
  test('a row per axis, a column per drawn series and the typical LGA; percentiles floored, gaps blank', () => {
    const a = assess(['lga_blacktown', 'lga_penrith']);
    const excel = radarExcel(a);
    const data = radarData(a);
    expect(sheet(excel).header).toEqual(['Axis', 'Blacktown', 'Penrith', 'Greater Sydney', 'Typical LGA (NSW LGAs)']);
    expect(column(excel, 'Axis')).toEqual(RADAR_AXES.map(axis => axis.label));
    data.rows.forEach((row, i) => {
      const value = row.a0 as number | null;
      expect(column(excel, 'Blacktown')[i]).toBe(value === null ? null : displayScore(value));
    });
    expect(column(excel, 'Typical LGA (NSW LGAs)').every(v => v === 50)).toBe(true);
  });
});

describe('quadrantExcel', () => {
  test.each(QUADRANT_SCATTERS.map(spec => [spec.id, spec] as const))('%s: every point of every panel, with the medians', (_, spec) => {
    const a = assess(['lga_blacktown', 'lga_newcastle']);
    const excel = quadrantExcel(a, spec);
    const { panels } = quadrantPanels(a, spec);
    const xDef = INDICATOR_BY_ID[spec.x];
    const yDef = INDICATOR_BY_ID[spec.y];
    expect(sheet(excel).header).toEqual([
      'Comparison group', 'Area', 'Point', `${xDef.label} (${xDef.unit})`, `${yDef.label} (${yDef.unit})`,
      'In need quadrant (Y/N)', `Group median: ${xDef.label}`, `Group median: ${yDef.label}`,
    ]);
    const expected = panels.reduce((n, p) => n + p.data.points.length + p.data.selected.length + (p.data.greaterSydney ? 1 : 0), 0);
    expect(excel.data).toHaveLength(expected);
    expect(new Set(column(excel, 'Comparison group'))).toEqual(new Set(panels.map(p => p.group.label)));
    for (const row of excel.data) {
      const panel = panels.find(p => p.group.label === row.group)!;
      expect(row.medianX).toBe(rounded(panel.data.medians.x, xDef.decimals));
      expect(row.medianY).toBe(rounded(panel.data.medians.y, yDef.decimals));
      if (row.x !== null && row.y !== null) {
        expect(row.inQuadrant).toBe(inNeedQuadrant(spec, row.x as number, row.y as number, panel.data.medians) ? 'Y' : 'N');
      }
    }
    const blacktown = excel.data.find(r => r.area === 'Blacktown')!;
    expect(blacktown.point).toBe('Selected area');
    expect(excel.data.filter(r => r.point === 'Other LGA').length).toBe(panels.reduce((n, p) => n + p.data.points.length, 0));
    for (const key of ['x', 'y', 'medianX', 'medianY']) expect(excel.data.every(r => isNumberOrBlank(r[key]))).toBe(true);
  });
});

describe('stripExcel', () => {
  test('every NSW LGA and the benchmarks, with the value and its need percentile among NSW LGAs with data', () => {
    const a = assess(['lga_camden']);
    const excel = stripExcel(a, 'job_growth_2041');
    const def = INDICATOR_BY_ID.job_growth_2041;
    expect(sheet(excel).header).toEqual(['Area', 'Point', `${def.label} (${def.unit})`, 'Need percentile among NSW LGAs with data']);
    const withData = a.records.filter(r => r.values.job_growth_2041.value !== null);
    expect(excel.data).toHaveLength(withData.length + 2);
    expect(column(excel, 'Point').filter(p => p === 'Selected area')).toHaveLength(1);
    const distribution = withData.map(r => r.values.job_growth_2041.value!);
    const camden = excel.data.find(r => r.area === 'Camden')!;
    const value = a.areas[0].indicators.find(s => s.id === 'job_growth_2041')!.value!;
    expect(camden.value).toBe(rounded(value, def.decimals));
    expect(camden.percentile).toBe(displayScore(needPercentile(value, distribution, def.direction)));
    expect(excel.data.find(r => r.area === 'NSW')!.point).toBe('NSW');
    expect(excel.data.every(r => isNumberOrBlank(r.value) && isNumberOrBlank(r.percentile))).toBe(true);
  });
});

describe('mismatchExcel', () => {
  test('every LGA on each usable chart: actual, expected, residual and z, with its setting and predictor', () => {
    const a = assess(['lga_blacktown', 'lga_newcastle']);
    const excel = mismatchExcel(a);
    const charts = mismatchChartData(a).charts.filter(c => c.weakMessage === null);
    expect(sheet(excel).header).toEqual([
      'Setting', 'LGA', 'Selected (Y/N)', 'Stops with frequent AM-peak service (%)', 'Population',
      'Car dependency (%)', 'Expected car dependency (%)', 'Residual (pp)', 'z',
    ]);
    expect(excel.data).toHaveLength(charts.reduce((n, c) => n + c.others.length + c.selected.length, 0));
    const blacktown = excel.data.find(r => r.lga === 'Blacktown')!;
    const m = carDependencyMismatch(a.records.find(r => r.areaId === 'lga_blacktown')!, a.records)!;
    expect(blacktown).toMatchObject({
      setting: 'Metropolitan', selected: 'Y', population: null,
      actual: rounded(m.actual, 1), expected: rounded(m.expected, 1), residual: rounded(m.residual, 1), z: rounded(m.z, 1),
    });
    expect(typeof excel.data.find(r => r.lga === 'Newcastle')!.population).toBe('number');
    for (const row of excel.data) {
      for (const key of ['stopShare', 'population', 'actual', 'expected', 'residual', 'z']) expect(isNumberOrBlank(row[key])).toBe(true);
      // Every row's residual is its actual less its expected, as shown
      expect(Math.abs((row.actual as number) - (row.expected as number) - (row.residual as number))).toBeLessThan(0.11);
    }
  });
});

describe('trendsExcel', () => {
  test('a row per metric, year and series: the selected areas and the group medians', () => {
    const a = assess(['lga_blacktown']);
    const excel = trendsExcel(a);
    expect(sheet(excel).header).toEqual(['Metric', 'Year', 'Series', 'Line', 'Value']);
    const expected = trendData(a).panels.reduce((n, p) => n + p.rows.reduce((m, row) => m + Object.keys(row).length - 1, 0), 0);
    expect(excel.data).toHaveLength(expected);
    expect(new Set(column(excel, 'Line'))).toEqual(new Set(['Actual', 'Projected (NSW DPE)', 'Median', 'Median (projected)']));
    expect(excel.data.every(r => typeof r.year === 'number' && typeof r.value === 'number')).toBe(true);
    const car2021 = excel.data.find(r => r.metric === 'Car dependency' && r.year === 2021 && r.series === 'Blacktown')!;
    expect(car2021.value).toBe(rounded(a.areas[0].indicators.find(s => s.id === 'car_dependency')!.value!, 1));
  });
});

describe('growthServiceExcel and jobsHousingExcel', () => {
  test('the chart rows as numbers', () => {
    const a = assess(['lga_blacktown', 'lga_camden']);
    const growth = growthServiceExcel(a);
    const g = growthServiceChartData(a);
    expect(sheet(growth).header).toEqual([
      'Area', `AM-peak departures per 1,000 residents: ${g.nowLabel}`, 'AM-peak departures per 1,000 residents: 2041 at today\'s service',
    ]);
    expect(growth.data).toEqual(g.rows.map(r => ({ area: r.name, now: rounded(r.now, 1), in2041: rounded(r.in2041, 1) })));

    const jobs = jobsHousingExcel(a);
    const j = jobsHousingChartData(a);
    expect(sheet(jobs).header).toEqual(['Area', 'Local jobs per resident, 2021', 'Local jobs per resident, 2041']);
    expect(jobs.data).toEqual(j.rows.map(r => ({ area: r.name, y2021: rounded(r.y2021, 2), y2041: rounded(r.y2041, 2) })));
  });
});
