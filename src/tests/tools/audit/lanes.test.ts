import { describe, it, expect } from 'vitest';
import { passiveLane } from '../../../../tools/audit/lib/lanes.mjs';

const ready = { number: 1, isDraft: false };
const draft = { number: 1, isDraft: true };

describe('passiveLane', () => {
  it('moves a card whose ready pull request is pushed to In Check', () => {
    expect(passiveLane('in progress', ready)).toBe('in check');
    expect(passiveLane('ready', ready)).toBe('in check');
    expect(passiveLane('manual', ready)).toBe('in check');
  });

  it('moves a card whose branch is pushed without a pull request to In progress', () => {
    expect(passiveLane('ready', null)).toBe('in progress');
    expect(passiveLane('manual', null)).toBe('in progress');
  });

  it('moves a card whose pull request became a draft back to In progress', () => {
    expect(passiveLane('in check', draft)).toBe('in progress');
  });

  it('leaves a card that is already there', () => {
    expect(passiveLane('in check', ready)).toBeNull();
    expect(passiveLane('in progress', null)).toBeNull();
  });

  it('never moves a card out of Failed, PR ready, his lanes or the merged lanes', () => {
    for (const lane of ['failed', 'pr ready', 'needs playtest', 'blocked on you', 'rejected', 'on dev', 'done']) {
      expect(passiveLane(lane, ready)).toBeNull();
      expect(passiveLane(lane, null)).toBeNull();
    }
  });
});
