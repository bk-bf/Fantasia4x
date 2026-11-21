import { bench, describe } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { pawnService } from '$lib/game/services/PawnService';
import { lethalAnatomyCause } from '$lib/game/core/defs/bodyParts';
import { rollWoundClotting } from '$lib/game/core/defs/wounds';
import { getConditionCurrentStage } from '$lib/game/core/rules/body/conditions';
import type { Mob, Pawn } from '$lib/game/core/types';
import { devSave, mobs } from '../work-pins/scenarios';
import { ROLLING, warmSession } from './session';

type Body = Pawn | Mob;
type CapacityBuilder = { _buildCapacities(e: Body): Record<string, number> };

const BODY_STATS = ['hunger_rate', 'stamina_recovery_rate', 'blood_clotting'];

async function liveBodies(
  sc: typeof mobs,
  warmTicks: number
): Promise<{ bodies: Body[]; turn: number }> {
  const session = await warmSession(sc, warmTicks);
  const state = session.getState();
  const bodies = [...state.pawns, ...(state.mobs ?? [])].filter((e) => e.isAlive !== false);
  return { bodies, turn: state.turn };
}

const builder = pawnStatService as unknown as CapacityBuilder;

for (const [sc, warm] of [
  [mobs, 300],
  [devSave, 60]
] as const) {
  const { bodies, turn } = await liveBodies(sc, warm);
  describe(`body ${sc.name}`, () => {
    bench(
      'capacities',
      () => {
        for (const e of bodies) builder._buildCapacities(e);
      },
      ROLLING
    );
    bench(
      'stats',
      () => {
        for (const e of bodies) for (const id of BODY_STATS) pawnStatService.evaluateStat(id, e);
      },
      ROLLING
    );
    bench(
      'conditions',
      () => {
        for (const e of bodies) {
          for (const c of e.conditions ?? []) getConditionCurrentStage(c);
          pawnService.getTransientConditions(e);
        }
      },
      ROLLING
    );
    bench(
      'anatomy',
      () => {
        for (const e of bodies) {
          lethalAnatomyCause(e.limbs);
          if (e.limbs) rollWoundClotting(e.limbs, 0, turn);
        }
      },
      ROLLING
    );
  });
}
