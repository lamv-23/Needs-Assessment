import { pickFrequencyBenchmark, describeStopsVsUse } from '../lib/data/transport-helpers';

const benchmarks = { greaterSydneyFrequentStopShare: 28, nswFrequentStopShare: 10.6 };

describe('pickFrequencyBenchmark', () => {
  it('compares Greater Sydney LGAs with Greater Sydney and everything else with NSW', () => {
    expect(pickFrequencyBenchmark(benchmarks, 'Greater Sydney')).toEqual({ label: 'Greater Sydney', share: 28 });
    expect(pickFrequencyBenchmark(benchmarks, 'Riverina-Murray')).toEqual({ label: 'NSW', share: 10.6 });
    expect(pickFrequencyBenchmark(undefined, 'Greater Sydney')).toBeNull();
  });
});

describe('describeStopsVsUse', () => {
  const base = { areaName: 'Testville', stops: 900, ptShareLabel: 'of all trips (HTS 2024/25)' };
  const gs = { label: 'Greater Sydney' as const, share: 28 };

  it('flags a frequency gap when few stops are frequent and PT use is low', () => {
    const text = describeStopsVsUse({ ...base, ptShare: 8, frequentStopShare: 12, benchmark: gs });
    expect(text).toMatch(/^⚠️/);
    expect(text).toContain('12.0% of stops');
    expect(text).toContain('Greater Sydney 28.0%');
    expect(text).toContain('service frequency gap');
  });

  it('points away from frequency when service is frequent but PT use is still low', () => {
    const text = describeStopsVsUse({ ...base, ptShare: 8, frequentStopShare: 40, benchmark: gs });
    expect(text).toContain('frequency is not the main barrier');
  });

  it('notes latent demand when PT use is healthy despite infrequent service', () => {
    const text = describeStopsVsUse({ ...base, ptShare: 22, frequentStopShare: 12, benchmark: gs });
    expect(text).toContain('more frequent network');
  });

  it('falls back to the stop-count rules without frequency data', () => {
    expect(describeStopsVsUse({ ...base, stops: 30, ptShare: 5, frequentStopShare: null, benchmark: null }))
      .toContain('supply gap');
    expect(describeStopsVsUse({ ...base, stops: 300, ptShare: 10, frequentStopShare: null, benchmark: null }))
      .toContain('frequency or reliability gap');
  });
});
