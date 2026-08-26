import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { pawnService } from '$lib/game/services/PawnService';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { GameState } from '$lib/game/core/types';
import type { Pawn } from '$lib/game/core/types';

type Reading = { with: number; without: number };

const strip = (p: Pawn, conditionId: string): Pawn =>
  ({
    ...p,
    id: `${p.id}_control`,
    needs: { ...p.needs },
    transientConditions: (p.transientConditions ?? []).filter((c) => c !== conditionId),
    conditionTimers: {}
  }) as Pawn;

function needAfterOneTick(
  state: GameState,
  p: Pawn,
  need: 'hunger' | 'thirst' | 'fatigue'
): number {
  const clone = { ...p, needs: { ...p.needs } } as Pawn;
  const before = (clone.needs as unknown as Record<string, number>)[need] ?? 0;
  const one = pawnService.processNeedsTick({ ...state, pawns: [clone] } as GameState);
  const after = (one.pawns[0].needs as unknown as Record<string, number>)[need] ?? 0;
  return after - before;
}

const LINES: {
  line: string;
  dish: string;
  condition: string;
  axis: string;
  read: (state: GameState, p: Pawn, cond: string) => Reading;
  better: 'higher' | 'lower';
}[] = [
  {
    line: 'nutrition',
    dish: 'small_stew',
    condition: 'hearty_meal',
    axis: 'hunger per tick',
    read: (s, p, c) => ({
      with: needAfterOneTick(s, p, 'hunger'),
      without: needAfterOneTick(s, strip(p, c), 'hunger')
    }),
    better: 'lower'
  },
  {
    line: 'heat',
    dish: 'honey_tart',
    condition: 'cool_slaked',
    axis: 'thirst per tick',
    read: (s, p, c) => ({
      with: needAfterOneTick(s, p, 'thirst'),
      without: needAfterOneTick(s, strip(p, c), 'thirst')
    }),
    better: 'lower'
  },
  {
    line: 'cold',
    dish: 'pottage',
    condition: 'warmed_through',
    axis: 'cold resistance',
    read: (_s, p, c) => ({
      with: pawnStatService.evaluateStat('cold_resistance', p),
      without: pawnStatService.evaluateStat('cold_resistance', strip(p, c))
    }),
    better: 'higher'
  },
  {
    line: 'health',
    dish: 'baked_fish',
    condition: 'set_to_mend',
    axis: 'fatigue per tick',
    read: (s, p, c) => ({
      with: needAfterOneTick(s, p, 'fatigue'),
      without: needAfterOneTick(s, strip(p, c), 'fatigue')
    }),
    better: 'lower'
  },
  {
    line: 'preservation',
    dish: 'hearty_sandwich',
    condition: 'trail_fed',
    axis: 'tiles per second',
    read: (_s, p, c) => ({
      with: pawnService.getMoveSpeed(p).tilesPerSecond,
      without: pawnService.getMoveSpeed(strip(p, c)).tilesPerSecond
    }),
    better: 'higher'
  },
  {
    line: 'combat',
    dish: 'seared_steak',
    condition: 'fortified',
    axis: 'melee damage',
    read: (_s, p, c) => ({
      with: pawnStatService.evaluateStat('melee_damage', p),
      without: pawnStatService.evaluateStat('melee_damage', strip(p, c))
    }),
    better: 'higher'
  },
  {
    line: 'infection',
    dish: 'pickled_vegetables',
    condition: 'clear_headed',
    axis: 'caretaking quality',
    read: (_s, p, c) => ({
      with: pawnStatService.evaluateStat('caretaking_quality', p),
      without: pawnStatService.evaluateStat('caretaking_quality', strip(p, c))
    }),
    better: 'higher'
  }
];

describe('every meal line lands its condition on a pawn who eats it', () => {
  for (const spec of LINES) {
    it(`${spec.line}: ${spec.dish} → ${spec.condition}, and the sim reads it`, async () => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 61,
          map: { w: 16, h: 16 },
          workReady: true,
          researchMaxTier: 9,
          toolTier: 3,
          infiniteFuel: true,
          pawns: [{ count: 4, skillLevel: 12, needs: { hunger: 95 } as Partial<Pawn['needs']> }],
          items: { [spec.dish]: 24 },
          seedEntities: false
        })
      );

      let fed: Pawn | undefined;
      for (let i = 0; i < 30 && !fed; i++) {
        s.tick(200);
        fed = s.getState().pawns.find((p) => (p.conditionTimers?.[spec.condition] ?? 0) > 0) as
          | Pawn
          | undefined;
      }

      expect(fed, `no pawn ever ate ${spec.dish}`).toBeTruthy();

      for (
        let i = 0;
        i < 10 && s.getState().pawns.find((p) => p.id === fed!.id)?.state?.isEating;
        i++
      )
        s.tick(50);
      fed = s.getState().pawns.find((p) => p.id === fed!.id) as Pawn;

      expect(fed!.transientConditions ?? []).toContain(spec.condition);

      const state = s.getState() as GameState;
      const r = spec.read(state, fed!, spec.condition);
      console.log(
        `[MEAL] ${spec.line}: ${fed!.name} ate ${spec.dish} → ${spec.condition} · ` +
          `${spec.axis} ${r.without.toFixed(4)} → ${r.with.toFixed(4)}`
      );
      if (spec.better === 'lower') expect(r.with).toBeLessThan(r.without);
      else expect(r.with).toBeGreaterThan(r.without);
    }, 120000);
  }
});
