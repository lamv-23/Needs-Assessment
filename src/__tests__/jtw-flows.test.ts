import { parseTableBuilderCsv, createLgaResolver, summariseFlows } from '../lib/jtw-flows';

// Shape of an ABS TableBuilder "CSV" download: title block, column-variable
// label row, header row of destinations, data rows, then footer notes.
const WIDE_CSV = [
  '"Australian Bureau of Statistics"',
  '',
  '"2021 Census - Employment, Income and Education"',
  '"LGA (UR) by LGA (POW)"',
  '"Counting: Persons Place of Usual Residence"',
  '',
  '"Filters:"',
  '"Default Summation","Persons Place of Usual Residence"',
  '',
  '"LGA (POW)","Sydney","Bayside (NSW)","Wodonga","POW not stated","Total",',
  '"LGA (UR)",',
  '"Sydney","60,000","2,000","0","3,000","65,000",',
  '"Bayside (NSW)","20,000","15,000","0","1,000","36,000",',
  '"Albury","0","0","5,000","200","5,200",',
  '"Total","80,000","17,000","5,000","4,200","106,200",',
  '',
  '"Data Source: Census of Population and Housing, 2021, TableBuilder"',
  '"Copyright Commonwealth of Australia, 2023"',
].join('\n');

const LONG_CSV = [
  '"LGA (UR)","LGA (POW)","Count"',
  '"Sydney","Sydney","60000"',
  '"Sydney","Bayside (NSW)","2000"',
].join('\n');

const areas = [
  { id: 'lga_sydney', name: 'City of Sydney' },
  { id: 'lga_bayside', name: 'Bayside' },
  { id: 'lga_albury', name: 'Albury' },
  { id: 'lga_hills', name: 'The Hills Shire' },
];
const codes = { lga_sydney: '17200', lga_bayside: '10500', lga_albury: '10050', lga_hills: '17420' };

describe('parseTableBuilderCsv', () => {
  it('reads the cross-tab layout, dropping Total rows/columns and thousands separators', () => {
    const flows = parseTableBuilderCsv(WIDE_CSV);
    expect(flows).toContainEqual({ origin: 'Sydney', destination: 'Bayside (NSW)', workers: 2000 });
    expect(flows).toContainEqual({ origin: 'Albury', destination: 'Wodonga', workers: 5000 });
    expect(flows.some(f => f.origin === 'Total' || f.destination === 'Total')).toBe(false);
    expect(flows.some(f => f.workers === 0)).toBe(false);
  });

  it('reads the long (one row per cell) layout', () => {
    expect(parseTableBuilderCsv(LONG_CSV)).toEqual([
      { origin: 'Sydney', destination: 'Sydney', workers: 60000 },
      { origin: 'Sydney', destination: 'Bayside (NSW)', workers: 2000 },
    ]);
  });
});

describe('createLgaResolver', () => {
  const resolve = createLgaResolver(areas, codes);
  it('matches TableBuilder labels to LGA codes despite prefixes, suffixes and codes', () => {
    expect(resolve('Sydney')).toBe('17200');
    expect(resolve('Bayside (NSW)')).toBe('10500');
    expect(resolve('Hills Shire (The)')).toBe('17420');
    expect(resolve('The Hills Shire')).toBe('17420');
    expect(resolve('17200 Sydney (C)')).toBe('17200');
    expect(resolve('Wodonga')).toBeNull();
  });
});

describe('summariseFlows', () => {
  const { byLgaCode, unmatched } = summariseFlows(parseTableBuilderCsv(WIDE_CSV), createLgaResolver(areas, codes));

  it('computes self-containment and self-sufficiency, excluding "not stated" workplaces', () => {
    const syd = byLgaCode['17200'];
    expect(syd.residentWorkers).toBe(62000);   // 60,000 + 2,000 (3,000 not stated excluded)
    expect(syd.workLocally).toBe(60000);
    expect(syd.selfContainment).toBe(96.8);
    expect(syd.localJobs).toBe(80000);         // 60,000 + 20,000 from Bayside
    expect(syd.selfSufficiency).toBe(75);
  });

  it('ranks destinations and origins excluding the home LGA, keeping out-of-NSW places by name', () => {
    expect(byLgaCode['10500'].topDestinations).toEqual([
      { lgaCode: '17200', name: 'Sydney', workers: 20000, share: 57.1 },
    ]);
    expect(byLgaCode['17200'].topOrigins).toEqual([
      { lgaCode: '10500', name: 'Bayside (NSW)', workers: 20000, share: 25 },
    ]);
    expect(byLgaCode['10050'].topDestinations).toEqual([
      { lgaCode: null, name: 'Wodonga', workers: 5000, share: 100 },
    ]);
    expect(byLgaCode['10050'].selfContainment).toBe(0);
  });

  it('uses app display names for matched LGAs when provided', () => {
    const named = summariseFlows(parseTableBuilderCsv(WIDE_CSV), createLgaResolver(areas, codes), c => (c === '17200' ? 'City of Sydney' : undefined));
    expect(named.byLgaCode['10500'].topDestinations[0].name).toBe('City of Sydney');
    expect(named.byLgaCode['10050'].topDestinations[0].name).toBe('Wodonga');
  });

  it('reports origin labels that could not be matched to an LGA', () => {
    const r = summariseFlows([{ origin: 'Atlantis', destination: 'Sydney', workers: 10 }], createLgaResolver(areas, codes));
    expect(r.unmatched).toEqual(['Atlantis']);
    expect(unmatched).toEqual([]);
  });
});
