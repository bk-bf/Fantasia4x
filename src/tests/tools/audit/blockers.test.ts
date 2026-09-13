import { describe, it, expect } from 'vitest';
import {
  issueOfBranch,
  blockedMessage,
  blockProblem
} from '../../../../tools/audit/lib/blockers.mjs';

const gate = { number: 126, title: 'Measure what every pull request costs', state: 'OPEN' };

describe('issueOfBranch', () => {
  it('reads the issue number a branch name ends in', () => {
    expect(issueOfBranch('fix/stealth-encounter-pacing-42')).toBe(42);
  });

  it('finds none on the long-lived branches', () => {
    expect(issueOfBranch('dev')).toBeNull();
    expect(issueOfBranch('main')).toBeNull();
  });
});

describe('blockProblem', () => {
  it('names the blocking issue for a branch whose issue is blocked', () => {
    expect(blockProblem('refactor/store-split-78', () => [gate])).toBe(
      '#78 is blocked by #126 (Measure what every pull request costs). Work on it locally; ' +
        'pushing its branch and opening its pull request wait until it closes.'
    );
  });

  it('lets a branch through when its issue has no open blocker', () => {
    expect(blockProblem('ci/codspeed-ubuntuserver-127', () => [])).toBeNull();
  });

  it('never looks up a branch that names no issue', () => {
    expect(
      blockProblem('dev', () => {
        throw new Error('looked up');
      })
    ).toBeNull();
  });
});

describe('blockedMessage', () => {
  it('says "those close" when more than one issue blocks', () => {
    const other = { number: 75, title: 'Pin hot-path work', state: 'OPEN' };
    expect(blockedMessage(9, [gate, other])).toContain('wait until those close.');
  });
});
