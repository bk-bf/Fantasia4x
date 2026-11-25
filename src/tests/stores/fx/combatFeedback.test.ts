import { afterEach, describe, expect, it, vi } from 'vitest';
import { combatFeedback } from '$lib/stores/fx/combatFeedback';

const onset = {
  worldX: 3,
  worldY: 4,
  text: 'Winded',
  kind: 'condition' as const,
  conditionId: 'winded'
};
const bleeding = (level: number, easing = false) => ({
  worldX: 3,
  worldY: 4,
  text: 'Bleeding',
  kind: 'condition' as const,
  entityId: 'p1',
  conditionId: 'bleeding',
  level,
  levels: 3,
  easing
});

describe('condition floaters', () => {
  afterEach(() => {
    combatFeedback.clear();
    vi.useRealTimers();
  });

  it('shows one floater per onset while the condition lasts', () => {
    combatFeedback.push({ ...onset, entityId: 'p1' });
    combatFeedback.push({ ...onset, entityId: 'p1' });
    combatFeedback.push({ ...onset, entityId: 'p2' });
    expect(combatFeedback.live(Date.now()).map((e) => e.entityId)).toEqual(['p1', 'p2']);
  });

  it('shows a stage change but never the same stage twice', () => {
    combatFeedback.push(bleeding(1));
    combatFeedback.push(bleeding(1));
    combatFeedback.push(bleeding(2));
    combatFeedback.push(bleeding(1, true));
    expect(combatFeedback.live(Date.now()).map((e) => [e.level, !!e.easing])).toEqual([
      [1, false],
      [2, false],
      [1, true]
    ]);
  });

  it('shows the loss once when the condition ends, then the onset again', () => {
    vi.useFakeTimers();
    combatFeedback.push({ ...onset, entityId: 'p1', color: '#9575cd' });
    vi.advanceTimersByTime(3000);
    const now = Date.now();
    combatFeedback.pruneOnsets(now, () => ({ x: 5, y: 6 }));
    combatFeedback.pruneOnsets(now, () => ({ x: 5, y: 6 }));
    combatFeedback.push({ ...onset, entityId: 'p1' });
    const live = combatFeedback.live(now);
    expect(live.map((e) => [e.text, !!e.lost, e.worldX])).toEqual([
      ['Winded', true, 5],
      ['Winded', false, 3]
    ]);
    expect(live[0].color).toBe('#9575cd');
  });

  it('shows no loss for a creature that died or left', () => {
    vi.useFakeTimers();
    combatFeedback.push({ ...onset, entityId: 'p1' });
    vi.advanceTimersByTime(3000);
    combatFeedback.pruneOnsets(Date.now(), () => null);
    expect(combatFeedback.live(Date.now())).toHaveLength(0);
  });

  it('keeps refusing a repeat while the condition is still on the entity', () => {
    vi.useFakeTimers();
    combatFeedback.push({ ...onset, entityId: 'p1' });
    vi.advanceTimersByTime(3000);
    const now = Date.now();
    combatFeedback.pruneOnsets(now, () => 'on');
    combatFeedback.push({ ...onset, entityId: 'p1' });
    expect(combatFeedback.live(now)).toHaveLength(0);
  });
});
