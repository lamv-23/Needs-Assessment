import {
  pickServiceDate,
  activeServiceIds,
  countPeakDepartures,
  summariseFrequency,
  frequencyBenchmarks,
  FREQUENT_DEPARTURES_THRESHOLD,
} from '../lib/gtfs-frequency';

const calendar = [
  { service_id: 'WKDY', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20261001', end_date: '20261231' },
  { service_id: 'WKND', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '1', sunday: '1', start_date: '20261001', end_date: '20261231' },
  { service_id: 'OLD',  monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20250101', end_date: '20250301' },
];

describe('pickServiceDate', () => {
  it('picks the first Tuesday on or after the reference date', () => {
    // 2026-10-22 is a Thursday → next Tuesday is 2026-10-27
    expect(pickServiceDate(calendar, [], new Date('2026-10-22T00:00:00Z'))).toBe('20261027');
  });

  it('falls forward to the feed start when the reference date precedes it', () => {
    const cal = [{ ...calendar[0], start_date: '20261201' }];
    // 2026-12-01 is a Tuesday
    expect(pickServiceDate(cal, [], new Date('2026-10-22T00:00:00Z'))).toBe('20261201');
  });

  it('uses calendar_dates when calendar.txt is empty', () => {
    const dates = [
      { service_id: 'A', date: '20261103', exception_type: '1' }, // Tuesday
      { service_id: 'A', date: '20261104', exception_type: '1' },
    ];
    expect(pickServiceDate([], dates, new Date('2026-10-22T00:00:00Z'))).toBe('20261103');
  });
});

describe('activeServiceIds', () => {
  it('includes weekday services in range and applies calendar_dates exceptions', () => {
    const dates = [
      { service_id: 'WKDY', date: '20261027', exception_type: '2' }, // removed
      { service_id: 'EXTRA', date: '20261027', exception_type: '1' }, // added
    ];
    const active = activeServiceIds(calendar, dates, '20261027');
    expect(active.has('WKDY')).toBe(false);
    expect(active.has('EXTRA')).toBe(true);
    expect(active.has('WKND')).toBe(false);
    expect(active.has('OLD')).toBe(false);
  });
});

describe('countPeakDepartures', () => {
  const tripService = new Map([['t1', 'WKDY'], ['t2', 'WKDY'], ['t3', 'WKND']]);
  const active = new Set(['WKDY']);

  it('counts departures between 07:00 and 09:00 on active services only', () => {
    const stopTimes = [
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      't1,06:59:00,06:59:00,S1,1',  // before window
      't1,07:00:00,07:00:00,S2,2',  // in
      't1,08:59:59,08:59:59,S3,3',  // in
      't2,09:00:00,09:00:00,S2,1',  // after window (exclusive end)
      't2,7:30:00,7:30:00,S2,2',    // single-digit hour, in
      't3,07:30:00,07:30:00,S2,1',  // weekend service, excluded
      '',
    ].join('\n');
    const counts = countPeakDepartures(stopTimes, tripService, active);
    expect(counts.get('S1')).toBeUndefined();
    expect(counts.get('S2')).toBe(2);
    expect(counts.get('S3')).toBe(1);
  });

  it('handles quoted CSV, CRLF line endings, BOM and reordered columns', () => {
    const stopTimes = '﻿"stop_id","trip_id","departure_time"\r\n"S9","t1","07:15:00"\r\n';
    expect(countPeakDepartures(stopTimes, tripService, active).get('S9')).toBe(1);
  });
});

describe('summariseFrequency', () => {
  it('aggregates departures and frequent stops by mode', () => {
    const departures = new Map([
      ['A', FREQUENT_DEPARTURES_THRESHOLD],     // frequent bus
      ['B', FREQUENT_DEPARTURES_THRESHOLD - 1], // serviced, not frequent
      ['C', 20],                                // frequent train
    ]);
    const stops = [
      { stopId: 'A', mode: 'bus' },
      { stopId: 'B', mode: 'bus' },
      { stopId: 'C', mode: 'train' },
      { stopId: 'D', mode: 'bus' }, // no AM-peak service
    ];
    const s = summariseFrequency(stops, departures, '20261027');
    expect(s.totalStops).toBe(4);
    expect(s.servicedStops).toBe(3);
    expect(s.frequentStops).toBe(2);
    expect(s.frequentStopShare).toBe(50);
    expect(s.amPeakDepartures).toBe(FREQUENT_DEPARTURES_THRESHOLD * 2 - 1 + 20);
    expect(s.frequentStopsByMode).toEqual({ train: 1, bus: 1, metro: 0, lightRail: 0, ferry: 0 });
    expect(s.serviceDate).toBe('20261027');
  });

  it('returns a zero share rather than NaN when there are no stops', () => {
    expect(summariseFrequency([], new Map(), '20261027').frequentStopShare).toBe(0);
  });
});

describe('frequencyBenchmarks', () => {
  it('pools stops across Greater Sydney LGAs and across all LGAs for NSW', () => {
    const lgaStops = new Map([
      ['17200', [{ stopId: 'a', mode: 'bus' }, { stopId: 'b', mode: 'bus' }]],  // Greater Sydney: 1 of 2 frequent
      ['10750', [{ stopId: 'c', mode: 'train' }, { stopId: 'd', mode: 'bus' }]], // Greater Sydney: 1 of 2 frequent
      ['10050', [{ stopId: 'e', mode: 'bus' }, { stopId: 'f', mode: 'bus' }, { stopId: 'g', mode: 'bus' }, { stopId: 'h', mode: 'bus' }]], // regional: 0 of 4
    ]);
    const departures = new Map([['a', 10], ['b', 1], ['c', 12], ['d', 0], ['e', 2]]);
    const b = frequencyBenchmarks(lgaStops, departures, '20261027', code => code !== '10050');
    expect(b.greaterSydney.totalStops).toBe(4);
    expect(b.greaterSydney.frequentStopShare).toBe(50);
    expect(b.nsw.totalStops).toBe(8);
    expect(b.nsw.frequentStopShare).toBe(25);
  });
});
