import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { effectiveVisionRange, getNightVision } from '$lib/game/core/rules/body/vision';
import { computeTileLightLevel, weatherSightMul } from '$lib/game/services/EnvironmentService';
import { revealPawnToMob } from '$lib/game/core/rules/body/stealth';
import type { Mob, Pawn } from '$lib/game/core/types';

const CREATURE = 'orc_reaver';
const SEEDS = [11, 23, 37, 41, 59, 71, 83, 97];
const CONTACT_MAX_TICKS = 9_000;
const FIGHT_MAX_TICKS = 6_000;

interface EncounterRun {
  contactTicks: number | null;
  pawnDied: boolean;
  mobDied: boolean;
}

async function runEncounter(opts: {
  seed: number;
  proximity: 'border' | 'adjacent';
  preDetected: boolean;
}): Promise<EncounterRun> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: opts.seed,
      map: { w: 60, h: 60 },
      pawns: [{ count: 1, stats: { dexterity: 10 }, traits: [] }],
      needsDisabled: ['hunger', 'fatigue', 'mobHunger'],
      seedEntities: false
    })
  );

  const pawn = (s.getState().pawns as Pawn[])[0];
  const px = pawn.position!.x;
  const py = pawn.position!.y;

  s.command({
    type: 'devSpawnMobAt',
    payload: { creatureId: CREATURE, x: px + 20, y: py }
  } as never);
  const mob = (s.getState().mobs as Mob[])[0];

  const tileLight = computeTileLightLevel(0, s.getState().buildings ?? [], mob.x, mob.y, s.getState().worldMap);
  const visionRange = effectiveVisionRange(
    mob,
    tileLight,
    weatherSightMul(s.getState().weather?.type),
    getNightVision(mob)
  );
  const dist = opts.proximity === 'border' ? Math.max(1, Math.floor(visionRange)) : 1;
  mob.x = px + dist;
  mob.y = py;
  if (opts.preDetected) revealPawnToMob(mob, pawn.id, 0);

  // Tick one at a time: the mob can leave 'Wander' and bail back to it (e.g. it downs the
  // pawn, then the now-Collapsed pawn is skipped by nearestPawn and it gives up) within a
  // single multi-tick batch, which a coarser sample would miss entirely.
  let ticks = 0;
  let contactTicks: number | null = null;
  while (ticks < CONTACT_MAX_TICKS) {
    s.tick(1);
    ticks += 1;
    const m = (s.getState().mobs as Mob[])[0];
    if (!m) return { contactTicks: null, pawnDied: false, mobDied: true };
    if (m.state !== 'Wander') {
      contactTicks = ticks;
      break;
    }
  }

  let fightTicks = 0;
  while (fightTicks < FIGHT_MAX_TICKS) {
    s.tick(20);
    fightTicks += 20;
    const pw = (s.getState().pawns as Pawn[])[0];
    const m = (s.getState().mobs as Mob[])[0];
    if (!pw || pw.isAlive === false) return { contactTicks, pawnDied: true, mobDied: false };
    if (!m || m.isAlive === false) return { contactTicks, pawnDied: false, mobDied: true };
  }
  return { contactTicks, pawnDied: false, mobDied: false };
}

async function meanEncounter(
  label: string,
  proximity: 'border' | 'adjacent',
  preDetected: boolean
) {
  const runs: EncounterRun[] = [];
  for (const seed of SEEDS) runs.push(await runEncounter({ seed, proximity, preDetected }));
  const contactSamples = runs.map((r) => r.contactTicks ?? CONTACT_MAX_TICKS);
  const meanContactTicks = contactSamples.reduce((a, v) => a + v, 0) / runs.length;
  const deaths = runs.filter((r) => r.pawnDied).length;
  const row = `${label.padEnd(28)} contact ${Math.round(meanContactTicks)
    .toString()
    .padStart(5)} ticks   ${deaths}/${runs.length} deaths`;
  console.log(`[STEALTH ENCOUNTER PACING] ${row}`);
  return { label, meanContactTicks, deaths, of: runs.length };
}

describe('STEALTH §12 — encounter pacing after always-on detection', () => {
  it(
    'time to first contact and deaths, mean of 8 seeds, a default (non-stealth) pawn vs orc_reaver',
    async () => {
      const borderNow = await meanEncounter('now — border', 'border', false);
      const borderBaseline = await meanEncounter('pre-stealth — border', 'border', true);
      const adjacentNow = await meanEncounter('now — adjacent', 'adjacent', false);
      const adjacentBaseline = await meanEncounter('pre-stealth — adjacent', 'adjacent', true);

      console.log(
        `[STEALTH ENCOUNTER PACING] border delay ×${(borderNow.meanContactTicks / Math.max(1, borderBaseline.meanContactTicks)).toFixed(1)}` +
          ` · adjacent delay ×${(adjacentNow.meanContactTicks / Math.max(1, adjacentBaseline.meanContactTicks)).toFixed(1)}`
      );

      // The pre-stealth baseline acquires on the first tick the pawn is in vision + LOS —
      // always-on detection can only add delay relative to it, never remove it.
      expect(borderNow.meanContactTicks).toBeGreaterThanOrEqual(borderBaseline.meanContactTicks);
      expect(adjacentNow.meanContactTicks).toBeGreaterThanOrEqual(adjacentBaseline.meanContactTicks);
    },
    600_000
  );
});
