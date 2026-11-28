import { describe, it, expect } from 'vitest';
import {
  chainRefOf,
  pickRun,
  runBranch,
  verdict,
  precheckSkipped
} from '../../../../tools/lib/chain-run.mjs';
import runs from './runs-ecdadc67.json';
import branchPushRun from './run-46150521435.json';
import chainPushRun from './run-46150528067.json';

const sha = 'ecdadc67d67be75b63ecbc4ce5d7df151aff19cf';
const branch = 'feat/ledger-supersede';
const since = Date.parse('2026-11-28T13:37:14Z');
const branchRun = runs.find((r) => r.databaseId === 46150521435)!;
const chainRun = runs.find((r) => r.databaseId === 46150528067)!;
const pushQuery = { event: 'push', headBranch: runBranch('push', branch), sha, since };

describe('pickRun', () => {
  it('waits for the chain push run while only the branch push run exists', () => {
    expect(pickRun([branchRun], pushQuery)).toBeNull();
  });

  it('takes the run on the chain ref once it appears, whatever order gh lists them in', () => {
    expect(pickRun(runs, pushQuery)?.databaseId).toBe(46150528067);
    expect(pickRun([branchRun, chainRun], pushQuery)?.databaseId).toBe(46150528067);
  });

  it('rejects a chain ref run on another commit or from before the push', () => {
    expect(pickRun([chainRun], { ...pushQuery, sha: 'f'.repeat(40) })).toBeNull();
    expect(
      pickRun([chainRun], { ...pushQuery, since: Date.parse('2026-11-28T13:40:00Z') })
    ).toBeNull();
  });

  it('watches the branch itself for a pull request or a dispatched pre-check', () => {
    expect(runBranch('pull_request', branch)).toBe(branch);
    expect(runBranch('workflow_dispatch', branch)).toBe(branch);
    expect(runBranch('push', branch)).toBe(chainRefOf(branch));
    expect(chainRefOf(branch)).toBe('chain/feat-ledger-supersede');
  });
});

describe('verdict', () => {
  it('calls the branch push run red, because its pre-check was skipped', () => {
    expect(branchPushRun.conclusion).toBe('success');
    expect(precheckSkipped(branchPushRun.jobs)).toBe(true);
    expect(verdict(branchPushRun).green).toBe(false);
  });

  it('calls the chain push run green', () => {
    expect(precheckSkipped(chainPushRun.jobs)).toBe(false);
    expect(verdict(chainPushRun)).toEqual({ green: true, reason: '' });
  });

  it('is never green for a run still in progress', () => {
    const running = { ...chainPushRun, status: 'in_progress', conclusion: '' };
    expect(verdict(running).green).toBe(false);
    expect(verdict(running).reason).toMatch(/in_progress/);
  });
});
