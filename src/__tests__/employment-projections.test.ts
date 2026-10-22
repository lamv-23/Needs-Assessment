import { getEmploymentProjections, tzp24EmploymentByLGA } from '@/lib/data/nsw-employment-projections';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

const LGA_IDS = SAMPLE_AREAS.filter(a => a.type === 'lga').map(a => a.id);
const sourceIds = [...new Set(tzp24EmploymentByLGA.map(r => r.lgaId))];

test('the bundled TZP24 extract holds 43 LGAs', () => {
  expect(sourceIds).toHaveLength(43);
});

test('every TZP24 LGA resolves from exactly one SAMPLE_AREAS LGA id', () => {
  const resolved = LGA_IDS.filter(id => getEmploymentProjections(id).length > 0);
  expect(resolved).toHaveLength(sourceIds.length);
  // Two area ids must never read the same source rows
  const sourceIdsUsed = resolved.map(id => getEmploymentProjections(id)[0].lgaId);
  expect(new Set(sourceIdsUsed).size).toBe(sourceIds.length);
});

test('LGAs whose TZP24 id spelling differs from the area id still resolve', () => {
  for (const id of ['lga_inner_west', 'lga_canterbury_bankstown', 'lga_hills', 'lga_hunters_hill', 'lga_lake_macquarie']) {
    const rows = getEmploymentProjections(id);
    expect(rows.find(r => r.year === 2021)?.totalEmployed).toBeGreaterThan(0);
    expect(rows.find(r => r.year === 2041)?.totalEmployed).toBeGreaterThan(0);
  }
});

test('LGAs outside the TZP24 extract return no rows', () => {
  expect(getEmploymentProjections('lga_bourke')).toEqual([]);
  expect(getEmploymentProjections('lga_maitland')).toEqual([]);
});
