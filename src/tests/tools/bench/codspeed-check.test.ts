import { describe, it, expect } from 'vitest';
import { gateVerdict, latestRun } from '../../../../tools/bench/codspeed-check.mjs';

const BENCHMARKS_STARTED = '2026-09-15T15:43:00Z';

const regression = {
  status: 'completed',
  conclusion: 'failure',
  started_at: '2026-09-15T15:50:32Z',
  details_url: 'https://app.codspeed.io/bk-bf/Fantasia4x/runs/1',
  output: { title: 'Performance Regression: -34.42%' }
};
const passed = {
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-09-15T15:50:32Z',
  output: { title: 'Performance Gate Passed' }
};

describe('the CodSpeed verdict gate', () => {
  it('fails a regression without the label and names it', () => {
    const v = gateVerdict(regression, false);
    expect(v.ok).toBe(false);
    expect(v.message).toContain('Performance Regression: -34.42%');
    expect(v.message).toContain(regression.details_url);
  });

  it('passes the same regression with the perf change accepted label, and says so', () => {
    const v = gateVerdict(regression, true);
    expect(v.ok).toBe(true);
    expect(v.message).toContain('allowed by the "perf change accepted" label');
  });

  it('passes a check CodSpeed passed', () => {
    expect(gateVerdict(passed, false)).toEqual({
      ok: true,
      message: 'CodSpeed Performance Analysis: Performance Gate Passed.'
    });
  });

  it('passes when CodSpeed never reported', () => {
    const v = gateVerdict(null, false);
    expect(v.ok).toBe(true);
    expect(v.message).toContain('had not reported');
  });
});

describe('choosing the CodSpeed check run', () => {
  const earlierAttempt = { ...regression, started_at: '2026-09-15T15:10:00Z' };

  it('takes the newest completed run that started after the benchmarks', () => {
    expect(latestRun([earlierAttempt, passed], BENCHMARKS_STARTED)).toBe(passed);
  });

  it('ignores a run left by an earlier attempt', () => {
    expect(latestRun([earlierAttempt], BENCHMARKS_STARTED)).toBeNull();
  });

  it('ignores a run still in progress', () => {
    expect(latestRun([{ ...passed, status: 'in_progress' }], BENCHMARKS_STARTED)).toBeNull();
  });

  it('takes any completed run when no start time is given', () => {
    expect(latestRun([earlierAttempt], undefined)).toBe(earlierAttempt);
  });
});
