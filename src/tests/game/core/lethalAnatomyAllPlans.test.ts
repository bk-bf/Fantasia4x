import { it, expect } from 'vitest';
import {
  createBodyPlanLimbs,
  containedParts,
  lethalAnatomyCause,
  PART_DEF_MAP
} from '$lib/game/core/defs/bodyParts';
import limbmap from '$lib/game/database/pawns/limbmap.json';
import type { BodyPartState } from '$lib/game/core/types';

const plans = Object.keys((limbmap as unknown as { plans: Record<string, unknown> }).plans);

const holdsVital = (id: BodyPartState['id']) =>
  [...containedParts(id)].some((c) => PART_DEF_MAP[c]?.isVital || PART_DEF_MAP[c]?.isCritical);

it('in every plan, destroying a part kills exactly when it is vital, critical, or holds one that is', () => {
  expect(plans.length).toBeGreaterThan(1);
  let lethalSeen = 0;
  for (const plan of plans) {
    const partIds = createBodyPlanLimbs(plan, 1).flatMap((l) => l.parts!.map((p) => p.id));
    for (const id of partIds) {
      const def = PART_DEF_MAP[id];
      const expected = !!(def?.isVital || def?.isCritical || holdsVital(id));
      for (const destroy of [
        (p: BodyPartState) => (p.health = 0),
        (p: BodyPartState) => (p.isMissing = true)
      ]) {
        const limbs = createBodyPlanLimbs(plan, 1);
        destroy(limbs.flatMap((l) => l.parts!).find((p) => p.id === id)!);
        expect(lethalAnatomyCause(limbs), `${plan} ${id}`).toBe(expected ? 'critical_limb' : null);
      }
      if (expected) lethalSeen++;
    }
  }
  expect(lethalSeen).toBeGreaterThan(plans.length);
});

it('a part the anatomy does not know is never lethal, however destroyed', () => {
  const limbs = createBodyPlanLimbs('humanoid', 1);
  limbs[0].parts!.push({
    id: 'notAPart' as BodyPartState['id'],
    health: 0,
    maxHp: 5,
    isMissing: true,
    injuries: []
  });
  expect(lethalAnatomyCause(limbs)).toBeNull();
});
