import { describe, it, expect, beforeAll } from 'vitest';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { SCENARIO_PRESETS, getScenarioPreset } from '$lib/game/headless/scenarios/presets';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * HEADLESS-SIM Phase 5 (ADR-033) — the invariant regression suite. Fast-forwards era scenarios and
 * asserts PROPERTIES, not exact numbers, so rebalances don't stale it: numbers change constantly,
 * but negative wood, NaN stats, a frozen pawn, or a starving pawn beside a full pantry are never
 * intended. Runs the REAL engine (WASM pathfinder incl.) headless — this is the late-game coverage
 * ordinary play never reaches.
 */

const TICKS = 1200; // 20 in-game seconds per era run — enough for jobs/needs/combat to move
const CHECK_EVERY = 100;

// States a pawn may legitimately hold for a long stretch without moving.
const RESTFUL = new Set([
  'Idle',
  'Sleeping',
  'Resting',
  'Eating',
  'Socialising',
  'Collapsed',
  'Dead',
  'Corpse'
]);

beforeAll(async () => {
  await pathfinderService.init();
});

function assertFiniteNumbers(obj: Record<string, unknown>, path: string): void {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') {
      expect(Number.isFinite(v), `${path}.${k} is ${v}`).toBe(true);
    }
  }
}

function checkCoreInvariants(state: GameState, label: string): void {
  // No resource ever negative — the stockpile aggregate and every physical drop.
  for (const [id, amt] of Object.entries(state.stockpile ?? {})) {
    expect(amt, `${label}: stockpile[${id}] negative`).toBeGreaterThanOrEqual(0);
  }
  for (const d of state.droppedItems ?? []) {
    expect(d.quantity, `${label}: drop ${d.id} negative quantity`).toBeGreaterThanOrEqual(0);
  }
  // No NaN/Infinity in pawn stats or need meters.
  for (const p of state.pawns) {
    assertFiniteNumbers(p.stats as unknown as Record<string, unknown>, `${label}:${p.name}.stats`);
    assertFiniteNumbers(p.needs as unknown as Record<string, unknown>, `${label}:${p.name}.needs`);
  }
  for (const m of state.mobs ?? []) {
    if (typeof m.health === 'number') {
      expect(Number.isFinite(m.health), `${label}: mob ${m.id} health ${m.health}`).toBe(true);
    }
  }
}

/** Track per-pawn freeze: same non-restful state + same tile for `limit` consecutive ticks. */
class FreezeTracker {
  private last = new Map<string, { sig: string; since: number }>();
  check(state: GameState, tick: number, limit: number, label: string): void {
    for (const p of state.pawns) {
      if (p.isAlive === false) continue;
      const st = p.currentState ?? 'Idle';
      const sig = `${st}@${p.position?.x},${p.position?.y}`;
      const prev = this.last.get(p.id);
      if (!prev || prev.sig !== sig) {
        this.last.set(p.id, { sig, since: tick });
        continue;
      }
      if (!RESTFUL.has(st)) {
        expect(
          tick - prev.since,
          `${label}: ${p.name} frozen in ${sig} since tick ${prev.since}`
        ).toBeLessThan(limit);
      }
    }
  }
}

async function runEra(presetId: string): Promise<{ session: HeadlessSession; state: GameState }> {
  const preset = getScenarioPreset(presetId)!;
  expect(preset, `preset ${presetId} missing`).toBeTruthy();
  const session = new HeadlessSession();
  await session.start(buildScenario(preset.spec));
  const tracker = new FreezeTracker();
  for (let t = 0; t < TICKS; t += CHECK_EVERY) {
    const { result } = session.tick(CHECK_EVERY);
    expect(result.success, `${presetId}: tick failed: ${(result.errors ?? []).join('; ')}`).toBe(
      true
    );
    const s = session.getState();
    checkCoreInvariants(s, presetId);
    tracker.check(s, t + CHECK_EVERY, 1000, presetId);
  }
  return { session, state: session.getState() };
}

describe('era scenarios build correctly', () => {
  it('every preset builds without throwing and honours its spec', () => {
    for (const preset of SCENARIO_PRESETS) {
      const s = buildScenario(preset.spec);
      const want = (preset.spec.pawns ?? [{ count: 5 }]).reduce((n, g) => n + g.count, 0);
      expect(s.pawns.length, `${preset.id}: pawn count`).toBe(want);
      expect(s.seed).toBe(preset.spec.seed);
      if (preset.spec.researchMaxTier !== undefined) {
        expect(s.completedResearch.length, `${preset.id}: research`).toBeGreaterThan(0);
      }
      for (const b of preset.spec.buildings ?? []) {
        expect(
          s.buildings.some((pb) => pb.type === b.id && pb.status === 'complete'),
          `${preset.id}: building ${b.id} missing`
        ).toBe(true);
      }
      for (const [itemId, amount] of Object.entries(preset.spec.items ?? {})) {
        expect(s.stockpile[itemId] ?? 0, `${preset.id}: stock ${itemId}`).toBeGreaterThanOrEqual(
          amount
        );
      }
      if (preset.spec.needsDisabled?.length) {
        for (const need of preset.spec.needsDisabled) {
          expect(s._needsDisabled?.[need], `${preset.id}: ${need} not frozen`).toBe(true);
        }
      }
    }
  });

  it('war-party pawns spawn drafted and armed, with the goblin pack present', () => {
    const s = buildScenario(getScenarioPreset('war-party')!.spec);
    for (const p of s.pawns) {
      expect(p.drafted, `${p.name} not drafted`).toBe(true);
      expect(p.equipment.mainHand?.itemId, `${p.name} unarmed`).toBe('iron_mace');
    }
    expect((s.mobs ?? []).filter((m) => m.creatureId === 'goblin').length).toBeGreaterThanOrEqual(
      8
    );
  });
});

describe('era invariants under fast-forward', () => {
  it('bronze colony holds core invariants', async () => {
    await runEra('bronze-colony');
  });

  it('iron colony holds core invariants', async () => {
    await runEra('iron-colony');
  });

  it('war party fights without corrupting state (needs frozen)', async () => {
    const s0 = buildScenario(getScenarioPreset('war-party')!.spec);
    const hunger0 = s0.pawns.map((p) => p.needs.hunger);
    const { state } = await runEra('war-party');
    // Frozen needs actually froze: hunger meters of the still-living never accrued.
    for (const p of state.pawns) {
      if (p.isAlive === false) continue;
      const i = s0.pawns.findIndex((q) => q.id === p.id);
      if (i >= 0) expect(p.needs.hunger).toBe(hunger0[i]);
    }
  });

  it('a hungry pawn beside plenty of food eats instead of starving', async () => {
    const preset = getScenarioPreset('bronze-colony')!;
    const spec = {
      ...preset.spec,
      pawns: [{ count: 6, skillLevel: 12, needs: { hunger: 90 } as Partial<Pawn['needs']> }]
    };
    const session = new HeadlessSession();
    await session.start(buildScenario(spec));
    const bread0 = session.getState().stockpile['bread'] ?? 0;
    for (let t = 0; t < 3600; t += 600) {
      const { result } = session.tick(600);
      expect(result.success).toBe(true);
    }
    const s = session.getState();
    // Nobody died of the pantry being ignored…
    expect(s.pawns.filter((p) => p.isAlive !== false).length).toBe(6);
    // …because food actually got eaten.
    const foodEaten =
      (s.stockpile['bread'] ?? 0) < bread0 ||
      s.pawns.some((p) => p.needs.hunger < 90 || p.state.isEating);
    expect(foodEaten, 'no pawn touched the food').toBe(true);
  });

  it('seed replay is byte-identical (same scenario, same ticks ⇒ same state)', async () => {
    const spec = getScenarioPreset('bronze-colony')!.spec; // no `equip` → fully deterministic ids
    const run = async () => {
      const session = new HeadlessSession();
      await session.start(buildScenario(spec));
      session.tick(300);
      return JSON.stringify(session.snapshot());
    };
    const a = await run();
    const b = await run();
    expect(a === b, 'replay diverged').toBe(true);
  });
});
