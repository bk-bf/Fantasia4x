import { describe, it, expect } from 'vitest';
import { parseProfile, countsTable, countsReport, verdict } from '../../../../tools/bench/counts.mjs';

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

const MOBS = 'tools/bench/mobs.bench.ts::mobs::180 ticks';

describe('parseProfile', () => {
  it('reads each benchmark part of a combined dump, without the system-call columns', () => {
    expect(parseProfile(PROFILE)).toEqual({
      [MOBS]: {
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

describe('verdict', () => {
  it('calls an instruction change inside the noise band within noise', () => {
    expect(verdict(counts(1_000_000, 100), counts(1_004_000, 100))).toBe('within noise');
  });

  it('calls more instructions past the band slower and fewer faster', () => {
    expect(verdict(counts(1_000_000, 100), counts(1_017_470, 100))).toBe('**slower**');
    expect(verdict(counts(1_000_000, 100), counts(990_000, 100))).toBe('**faster**');
  });

  it('names cache misses only when they move past their fifteen percent band', () => {
    expect(verdict(counts(1_000_000, 100), counts(1_000_000, 112))).toBe('within noise');
    expect(verdict(counts(1_000_000, 100), counts(1_000_000, 130))).toBe('within noise, LL misses up past noise');
  });
});

describe('countsTable', () => {
  it('shows the head counts with their change against the base and a verdict', () => {
    const table = countsTable({ [MOBS]: counts(1_017_470, 99) }, { [MOBS]: counts(1_000_000, 100) });
    expect(table).toContain('| `mobs.bench.ts::mobs::180 ticks` | 1,017,470 | +1.75% | 99 | -1.0% | **slower** |');
  });

  it('names a benchmark only one side has', () => {
    const table = countsTable({ 'b::new': counts(5, 1) }, { 'a::old': counts(7, 2) });
    expect(table).toContain('| `a::old` | - | gone | - | gone | benchmark gone |');
    expect(table).toContain('| `b::new` | 5 | new | 1 | new | new benchmark |');
  });

  it('lists head counts alone when there is no base', () => {
    expect(countsTable({ 'x::y': counts(1234567, 89) })).toContain('| `x::y` | 1,234,567 | 89 |');
  });
});

describe('countsReport', () => {
  it('names the base commit and explains each column', () => {
    const report = countsReport(
      { [MOBS]: counts(1, 1) },
      { sha: 'd41cfc7a0123', url: 'https://example.test/run', counts: { [MOBS]: counts(1, 1) } }
    );
    expect(report).toContain('against `dev` at `d41cfc7a`');
    expect(report).toContain('- **instructions**');
    expect(report).toContain('- **LL misses**');
  });

  it('says when no dev run has counts yet', () => {
    expect(countsReport({ [MOBS]: counts(1, 1) }, null)).toContain('no `dev` run has counts to compare against yet');
  });
});
