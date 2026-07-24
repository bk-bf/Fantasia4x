import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

/**
 * NEEDS & MOOD AUDIT (headless, real ticks). The tick-by-tick heart of the colony sim, previously only
 * unit-covered (`moodBreakdown.test.ts`). Drives the real loop: needs build/decay each tick, cross their
 * `seek` threshold, pull the pawn into the satisfying FSM state, and feed `moodBands` into a mood that
 * eases toward `computeMoodTarget`; at mood ≤25/15/5 a once-per-game-hour (750-tick) moral check can drop
 * a pawn into an uncontrollable `mental_breakdown`. Needs are set at spawn (`ScenarioPawnGroup.needs`) and
 * frozen with `needsDisabled`. Sim starts at NIGHT.
 */

const need = (s: HeadlessSession, i: number, k: string) =>
  ((s.getState().pawns[i] as unknown as { needs?: Record<string, number> }).needs?.[k] ?? 0);
const mood = (s: HeadlessSession, i: number) =>
  ((s.getState().pawns[i] as unknown as { state?: { mood?: number } }).state?.mood ?? 50);

describe('needs & mood', () => {
  it('hunger: a hungry pawn abandons idle, eats, and its hunger falls below seek', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 31,
        map: { w: 14, h: 14 },
        workReady: true,
        pawns: [{ count: 2, skillLevel: 10, needs: { hunger: 85 } }], // seek = 70
        items: { spit_meat: 20 },
        seedEntities: false
      })
    );
    const states = new Set<string>();
    for (let i = 0; i < 20 && need(s, 0, 'hunger') >= 70; i++) {
      s.tick(200);
      states.add(String((s.getState().pawns[0] as { currentState?: string }).currentState));
    }
    console.log(
      `[NM hunger] hunger 85 → ${need(s, 0, 'hunger').toFixed(1)} (seek 70); states seen: ${[...states].join(',')}`
    );
    expect(need(s, 0, 'hunger'), 'hunger fell below seek after eating').toBeLessThan(70);
  });

  it('fatigue: a tired pawn sleeps in a bed, recovers, and wakes WELL-RESTED', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 32,
        map: { w: 14, h: 14 },
        workReady: true,
        pawns: [{ count: 2, skillLevel: 10, needs: { fatigue: 92 } }], // seek = 72
        buildings: [{ id: 'hay_bed' }],
        items: { spit_meat: 10 },
        seedEntities: false
      })
    );
    // Run a FULL sleep→wake cycle (well_rested is granted on WAKING from a bed, not mid-sleep).
    let wellRestedSeen = 0;
    let minFatigue = 92;
    const states = new Set<string>();
    for (let i = 0; i < 90 && wellRestedSeen === 0; i++) {
      s.tick(250);
      states.add(String((s.getState().pawns[0] as { currentState?: string }).currentState));
      minFatigue = Math.min(minFatigue, need(s, 0, 'fatigue'));
      const t = (s.getState().pawns[0] as { conditionTimers?: Record<string, number> }).conditionTimers
        ?.well_rested;
      if ((t ?? 0) > 0) wellRestedSeen = t as number;
    }
    console.log(
      `[NM fatigue] fatigue 92 → min ${minFatigue.toFixed(1)}; states: ${[...states].join(',')}; well_rested peak=${wellRestedSeen}`
    );
    expect(minFatigue, 'fatigue recovered by sleeping').toBeLessThan(72);
    expect(wellRestedSeen, 'woke from a bed WELL-RESTED').toBeGreaterThan(0);
  });

  it('thirst: a parched pawn drinks at a well and its thirst falls', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 33,
        map: { w: 14, h: 14 },
        workReady: true,
        pawns: [{ count: 2, skillLevel: 10, needs: { thirst: 92 } }], // seek = 82
        buildings: [{ id: 'well' }], // effects.waterSource
        seedEntities: false
      })
    );
    for (let i = 0; i < 30 && need(s, 0, 'thirst') >= 60; i++) s.tick(200);
    console.log(`[NM thirst] thirst 92 → ${need(s, 0, 'thirst').toFixed(1)} (seek 82)`);
    expect(need(s, 0, 'thirst'), 'thirst fell after drinking at the well').toBeLessThan(82);
  });

  it('hygiene: a filthy pawn washes at a well and its hygiene falls', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 37,
        map: { w: 14, h: 14 },
        workReady: true,
        pawns: [{ count: 2, skillLevel: 10, needs: { hygiene: 94 } }], // seek = 88
        buildings: [{ id: 'well' }], // a well now draws water for washing too (not just drinking)
        seedEntities: false
      })
    );
    for (let i = 0; i < 30 && need(s, 0, 'hygiene') >= 60; i++) s.tick(200);
    console.log(`[NM hygiene] hygiene 94 → ${need(s, 0, 'hygiene').toFixed(1)} (seek 88)`);
    expect(need(s, 0, 'hygiene'), 'hygiene fell after washing at the well').toBeLessThan(88);
  });

  it('relaxation: a bored idle pawn socialises at the fire and relaxation recovers', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 38,
        map: { w: 14, h: 14 },
        workReady: true,
        // relaxation inverted (100 = entertained); seek at/below 30. Spawn bored, with a fire to gather at.
        pawns: [{ count: 3, skillLevel: 10, needs: { relaxation: 12 } }],
        buildings: [{ id: 'campfire' }],
        items: { spit_meat: 10, dry_firewood: 4, plant_fiber: 6 },
        seedEntities: false
      })
    );
    let peak = 12;
    for (let i = 0; i < 30; i++) {
      s.tick(200);
      peak = Math.max(peak, need(s, 0, 'relaxation'));
    }
    console.log(`[NM relaxation] relaxation 12 → peaked at ${peak.toFixed(1)} (inverted: higher = entertained)`);
    expect(peak, 'relaxation recovered after socialising').toBeGreaterThan(30);
  });

  it('mood: eases toward its target — a miserable pawn sinks below a content one', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 34,
        map: { w: 14, h: 14 },
        // pawn 0 miserable (needs maxed + FROZEN so the target stays low); pawn 1 content (low needs).
        pawns: [
          { count: 1, needs: { hunger: 98, fatigue: 96, thirst: 95, hygiene: 92 } },
          { count: 1, needs: { hunger: 5, fatigue: 5, thirst: 5, hygiene: 5 } }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene', 'relaxation'],
        seedEntities: false
      })
    );
    const m0 = () => mood(s, 0);
    const m1 = () => mood(s, 1);
    for (let i = 0; i < 8; i++) s.tick(150); // let mood ease toward target
    console.log(`[NM mood] miserable pawn mood=${m0().toFixed(1)} vs content pawn mood=${m1().toFixed(1)} (base 50)`);
    expect(m0(), 'miserable pawn eased BELOW baseline').toBeLessThan(50);
    expect(m0(), 'miserable well below content').toBeLessThan(m1() - 10);
  });

  it('mental breakdown: a sustained-miserable colony produces an uncontrollable break', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 35,
        map: { w: 18, h: 18 },
        // Whole colony pinned at rock-bottom needs (frozen) → mood target near the floor → moral checks fire.
        pawns: [
          { count: 10, needs: { hunger: 100, fatigue: 100, thirst: 100, hygiene: 100, relaxation: 0, comfort: 0 } }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene', 'relaxation', 'comfort'],
        seedEntities: false
      })
    );
    const BREAK_STATES = new Set(['Crying', 'Hiding', 'Fleeing']);
    let broke = 0;
    let minMood = 50;
    for (let i = 0; i < 40; i++) {
      s.tick(400); // 16000 ticks ≈ 21 game-hours → ~21 moral checks per pawn
      for (const p of s.getState().pawns as unknown as Array<Record<string, unknown>>) {
        minMood = Math.min(minMood, (p.state as { mood?: number })?.mood ?? 50);
        const timer = (p.conditionTimers as Record<string, number>)?.mental_breakdown ?? 0;
        if (timer > 0 || BREAK_STATES.has(String(p.currentState))) broke++;
      }
      if (broke > 0) break;
    }
    console.log(`[NM breakdown] colony min mood reached ${minMood.toFixed(1)}; break events observed: ${broke}`);
    expect(minMood, 'colony mood sank into the breakdown band (≤25)').toBeLessThanOrEqual(25);
    expect(broke, 'at least one pawn suffered a mental breakdown').toBeGreaterThan(0);
  });

  it('comfort: an uncomfortable idle pawn lounges at a seat and its comfort rises', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 36,
        map: { w: 14, h: 14 },
        workReady: true,
        pawns: [{ count: 2, skillLevel: 10, needs: { comfort: 8 } }], // inverted: seek at/below 35
        buildings: [{ id: 'log_stool' }],
        items: { spit_meat: 10 },
        seedEntities: false
      })
    );
    let peak = 8;
    for (let i = 0; i < 30; i++) {
      s.tick(200);
      peak = Math.max(peak, need(s, 0, 'comfort'));
    }
    console.log(`[NM comfort] comfort 8 → peaked at ${peak.toFixed(1)} (inverted: higher = comfier)`);
    expect(peak, 'comfort rose after lounging at a seat').toBeGreaterThan(8);
  });
});
