import { describe, it, expect, beforeEach } from 'vitest';
import { generatePawns } from '$lib/game/entities/Pawns';
import { initialGameState } from '$lib/stores/gameState';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { moodEffect } from '$lib/game/core/defs/moods';
import { getConditionDefById } from '$lib/game/core/rules/body/conditions';
import { shouldRollBreakdown } from '$lib/game/systems/pawn/handlers/breakdown';
import { tryRally, _resetRallyCooldowns } from '$lib/game/systems/pawn/rally';
import { TICKS_PER_GAME_HOUR } from '$lib/game/services/EnvironmentService';
import type { GameState, Pawn } from '$lib/game/core/types';

function scene(id: string, dx: number, score: number) {
  const gen = generatePawns(initialGameState.culture, 2);
  const broken = {
    ...gen[0],
    id: `${id}_b`,
    position: { x: 10, y: 10 },
    conditionTimers: { mental_breakdown: 500 }
  };
  const ally = { ...gen[1], id: `${id}_a`, position: { x: 10 + dx, y: 10 }, conditionTimers: {} };
  const [pawnA, pawnB] = [broken.id, ally.id].sort();
  const state = {
    ...initialGameState,
    pawns: [broken, ally],
    relationships: [
      { pawnA, pawnB, score, stage: 'best_friends', tags: [], points: { history: 0 } }
    ]
  } as unknown as GameState;
  return { broken: broken as Pawn, state };
}

describe('rally system', () => {
  beforeEach(() => _resetRallyCooldowns());

  it('oratory is a real social stat (CHA + prestige + a clear voice)', () => {
    const [p] = generatePawns(initialGameState.culture, 1);
    expect(pawnStatService.evaluateStat('oratory', p)).toBeGreaterThan(0);
  });

  it('the rallied buffer is wired and ~1/3 of catharsis', () => {
    expect(moodEffect('cond_rallied')?.value).toBe(12);
    expect(moodEffect('mood_catharsis')?.value).toBe(40);
    expect(getConditionDefById('rallied')?.mood).toBe('cond_rallied');
  });

  it('grace window: a rallied pawn cannot re-break while the buffer holds', () => {
    const [p] = generatePawns(initialGameState.culture, 1);
    const base = { ...p, state: { ...p.state, mood: 5 }, debugId: 0 };
    expect(
      shouldRollBreakdown(
        { ...base, conditionTimers: { rallied: 100 } } as Pawn,
        TICKS_PER_GAME_HOUR
      )
    ).toBe(false);
    expect(shouldRollBreakdown({ ...base, conditionTimers: {} } as Pawn, TICKS_PER_GAME_HOUR)).toBe(
      true
    );
  });

  it('a broken pawn is rallied by a close ally next to them', () => {
    const { broken, state } = scene('near', 1, 90);
    let rallied = false;
    for (let h = 1; h <= 24; h++)
      if (tryRally(broken, state, h * TICKS_PER_GAME_HOUR)) rallied = true;
    expect(rallied).toBe(true);
  });

  it('no rally beyond a face-to-face range (RALLY_RANGE = 2)', () => {
    const { broken, state } = scene('far', 4, 90);
    let rallied = false;
    for (let h = 1; h <= 24; h++)
      if (tryRally(broken, state, h * TICKS_PER_GAME_HOUR)) rallied = true;
    expect(rallied).toBe(false);
  });

  it('one attempt per game-hour: a try locks out further tries for an hour', () => {
    const { broken, state } = scene('cd', 1, 90);
    const T = 500;
    tryRally(broken, state, T);
    for (let t = T + 1; t < T + TICKS_PER_GAME_HOUR; t++) {
      expect(tryRally(broken, state, t)).toBeNull();
    }
  });
});
