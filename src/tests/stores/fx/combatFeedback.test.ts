import { afterEach, describe, expect, it, vi } from 'vitest';
import { combatFeedback, onsetKey } from '$lib/stores/fx/combatFeedback';

const onset = { worldX: 3, worldY: 4, text: 'Winded', kind: 'condition' as const };

describe('condition floaters', () => {
  afterEach(() => {
    combatFeedback.clear();
    vi.useRealTimers();
  });

  it('shows one floater per onset while the condition lasts', () => {
    combatFeedback.push({ ...onset, entityId: 'p1', conditionId: 'winded' });
    combatFeedback.push({ ...onset, entityId: 'p1', conditionId: 'winded' });
    combatFeedback.push({ ...onset, entityId: 'p2', conditionId: 'winded' });
    expect(combatFeedback.live(Date.now()).map((e) => e.entityId)).toEqual(['p1', 'p2']);
  });

  it('shows the floater again once the condition has ended', () => {
    vi.useFakeTimers();
    combatFeedback.push({ ...onset, entityId: 'p1', conditionId: 'winded' });
    vi.advanceTimersByTime(3000);
    const now = Date.now();
    combatFeedback.pruneOnsets(now, (key) => key !== onsetKey('p1', 'winded'));
    combatFeedback.push({ ...onset, entityId: 'p1', conditionId: 'winded' });
    expect(combatFeedback.live(now)).toHaveLength(1);
  });

  it('keeps refusing a repeat while the condition is still on the entity', () => {
    vi.useFakeTimers();
    combatFeedback.push({ ...onset, entityId: 'p1', conditionId: 'winded' });
    vi.advanceTimersByTime(3000);
    const now = Date.now();
    combatFeedback.pruneOnsets(now, () => true);
    combatFeedback.push({ ...onset, entityId: 'p1', conditionId: 'winded' });
    expect(combatFeedback.live(now)).toHaveLength(0);
  });
});
