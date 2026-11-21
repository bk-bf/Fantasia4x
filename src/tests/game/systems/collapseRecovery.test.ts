import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { GameState, Pawn } from '$lib/game/core/types';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { RECOVER_CONSCIOUSNESS } from '$lib/game/core/rules/body/conditions';

type Uncached = { _buildCapacities: (p: Pawn, light?: number) => Record<string, number> };
const uncachedConsciousness = (p: Pawn) =>
  (pawnStatService as unknown as Uncached)._buildCapacities(p, p.effectiveLight ?? 1).consciousness;

async function collapsedFromBloodLoss(timers: Record<string, number> = {}) {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 7,
      map: { w: 12, h: 12 },
      workReady: true,
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene', 'wetness', 'relaxation', 'comfort'],
      pawns: [{ count: 1, skillLevel: 5 }],
      seedEntities: false
    })
  );
  const gs = () => s.getState() as GameState;
  const cur = () => gs().pawns[0] as Pawn | undefined;
  s.tick(5);
  const p = cur()!;
  for (const l of p.limbs ?? []) for (const part of l.parts ?? []) part.injuries = [];
  p.injuries = [];
  p.bloodVolume = (p.maxBloodVolume ?? 100) * 0.5;
  p.conditionTimers = { ...(p.conditionTimers ?? {}), ...timers };
  s.tick(2);
  expect(cur()!.currentState, 'half the blood gone knocks the pawn down').toBe('Collapsed');
  return { s, gs, cur };
}

describe('collapse recovery', () => {
  it('capacities follow blood volume when limbs and injuries are unchanged', () => {
    const st = buildScenario({ seed: 9, map: { w: 12, h: 12 }, pawns: [{ count: 1 }] });
    const p0 = st.pawns[0];
    const low = { ...p0, bloodVolume: (p0.maxBloodVolume ?? 100) * 0.5 } as Pawn;
    pawnStatService.computeCapacities(low);
    const full = { ...low, bloodVolume: p0.maxBloodVolume ?? 100 } as Pawn;
    expect(pawnStatService.computeCapacities(full).consciousness).toBeCloseTo(
      uncachedConsciousness(full),
      6
    );
  });

  it('capacities follow transient conditions when limbs and injuries are unchanged', () => {
    const st = buildScenario({ seed: 9, map: { w: 12, h: 12 }, pawns: [{ count: 1 }] });
    const plain = { ...st.pawns[0], transientConditions: [] } as Pawn;
    pawnStatService.computeCapacities(plain);
    const concussed = { ...plain, transientConditions: ['concussed'] } as Pawn;
    const caps = pawnStatService.computeCapacities(concussed);
    expect(caps.consciousness).toBeCloseTo(uncachedConsciousness(concussed), 6);
    const sighted = { ...concussed, transientConditions: ['concussed', 'echo_sighted'] } as Pawn;
    expect(pawnStatService.computeCapacities(sighted).night_vision).toBe(1);
  });

  it('a pawn collapsed from blood loss gets up once regenerated blood lifts consciousness past the recovery threshold', async () => {
    const { s, cur } = await collapsedFromBloodLoss();
    let clearedAt: number | null = null;
    let roseAt: number | null = null;
    let staleSteps = 0;
    for (let t = 0; t < 9000 && roseAt === null; t += 10) {
      s.tick(10);
      const uncached = uncachedConsciousness(cur()!);
      if (pawnStatService.computeCapacities(cur()!).consciousness !== uncached) staleSteps++;
      if (clearedAt === null && uncached >= RECOVER_CONSCIOUSNESS) clearedAt = t;
      if (cur()!.currentState !== 'Collapsed') roseAt = t;
    }
    expect(staleSteps, 'the cached consciousness matches a fresh build at every step').toBe(0);
    expect(clearedAt, 'regenerating blood lifts consciousness past the gate').not.toBeNull();
    expect(roseAt, 'the pawn gets up after clearing the gate').not.toBeNull();
    expect(roseAt! - clearedAt!).toBeLessThanOrEqual(10);
  }, 600_000);

  it('condition timers keep counting down while a pawn lies collapsed', async () => {
    const { s, cur } = await collapsedFromBloodLoss({ nausea: 600, well_rested: 600 });
    const before = { ...cur()!.conditionTimers };
    s.tick(300);
    const after = { ...cur()!.conditionTimers };
    expect(cur()!.currentState).toBe('Collapsed');
    expect(after.nausea ?? 0).toBeLessThanOrEqual((before.nausea ?? 0) - 290);
    expect(after.well_rested ?? 0).toBeLessThanOrEqual((before.well_rested ?? 0) - 290);
  }, 600_000);

  it('a two-second burn on a collapsed pawn goes out instead of burning it to death', async () => {
    const { s, gs, cur } = await collapsedFromBloodLoss();
    cur()!.conditionTimers = { ...(cur()!.conditionTimers ?? {}), burning: 120 };
    s.tick(3000);
    expect((gs().deadPawns ?? []).map((d) => d.cause)).toEqual([]);
    expect(cur()?.conditionTimers?.burning ?? 0).toBe(0);
  }, 600_000);
});
