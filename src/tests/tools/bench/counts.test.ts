import { describe, it, expect } from 'vitest';
import { parseProfile, countsTable } from '../../../../tools/bench/counts.mjs';

const EVENTS_LINE = 'events: Ir Dr Dw I1mr D1mr D1mw ILmr DLmr DLmw sysCount sysTime sysCpuTime';

const PROFILE = [
  'version: 1',
  'creator: callgrind-3.26.0.codspeed7',
  '',
  'part: 1',
  'desc: Trigger: Client Request: tools/bench/mobs.bench.ts::mobs::180 ticks',
  EVENTS_LINE,
  'summary: 0',
  'fn=(1) work',
  '0 5',
  'totals: 86670787 17873423 15473218 14365 44753 262035 2346 11428 67082 340 1258448 1135070',
  '',
  'part: 2',
  'desc: Trigger: Client Request: Metadata: codspeed-node 6.0.0-beta.2',
  EVENTS_LINE,
  'totals: 0',
  '',
  'part: 3',
  'desc: Trigger: Program termination',
  EVENTS_LINE,
  'totals: 0'
].join('\n');

const counts = (Ir: number, ll: number) => ({
  Ir,
  Dr: 0,
  Dw: 0,
  I1mr: 0,
  D1mr: 0,
  D1mw: 0,
  ILmr: ll,
  DLmr: 0,
  DLmw: 0
});

describe('parseProfile', () => {
  it('reads each benchmark part of a combined dump, without the system-call columns', () => {
    expect(parseProfile(PROFILE)).toEqual({
      'tools/bench/mobs.bench.ts::mobs::180 ticks': {
        Ir: 86670787,
        Dr: 17873423,
        Dw: 15473218,
        I1mr: 14365,
        D1mr: 44753,
        D1mw: 262035,
        ILmr: 2346,
        DLmr: 11428,
        DLmw: 67082
      }
    });
  });
});

describe('countsTable', () => {
  it('shows the change between base and head to three decimals', () => {
    const table = countsTable(
      { 'tools/bench/mobs.bench.ts::mobs::180 ticks': counts(1_000_500, 99) },
      { 'tools/bench/mobs.bench.ts::mobs::180 ticks': counts(1_000_000, 100) }
    );
    expect(table).toContain(
      '| `mobs.bench.ts::mobs::180 ticks` | 1,000,000 | 1,000,500 | +0.050% | 100 | 99 | -1.000% |'
    );
  });

  it('names a benchmark only one side has', () => {
    const table = countsTable({ 'b::new': counts(5, 1) }, { 'a::old': counts(7, 2) });
    expect(table).toContain('| `a::old` | 7 | - | gone | 2 | - | gone |');
    expect(table).toContain('| `b::new` | - | 5 | new | - | 1 | new |');
  });

  it('lists head counts alone when there is no base', () => {
    expect(countsTable({ 'x::y': counts(1234567, 89) })).toContain('| `x::y` | 1,234,567 | 89 |');
  });
});
