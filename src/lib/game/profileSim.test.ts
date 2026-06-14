/**
 * P-5 profiling harness (run on demand, not in the normal suite).
 *
 *   PROFILE=1 npx vitest run src/lib/game/profileSim.test.ts
 *
 * Seeds a realistic-ish colony (full 240×160 world, pawns with elevated needs, seeded mobs, a few
 * beds + a campfire, a batch of harvest designations) and runs the engine for N ticks with the
 * turn profiler on, then logs `__profOut` (per-phase avg ms) + the P-5 scan counts.
 *
 * IMPORTANT CAVEAT — headless ≠ real: vitest runs with `browser=false`, so WasmPathfinderService
 * never initialises (isReady()=false). That means **no A* pathfinding and no entity movement**.
 * So this measures the per-tick FIXED cost of every phase + the scans that fire without movement
 * (findCombatThreat runs per-pawn-per-tick regardless; findNearestRestBuilding fires for tired
 * pawns), but it UNDER-counts `blockedTiles` (most of whose calls live inside pathfinding) and
 * under-represents the `pawns` phase (A* is the real cost). Treat phase ms as a floor and the
 * scan counts as call-frequency evidence; the accurate hot path needs an in-browser profileTurns().
 */
import { describe, it } from 'vitest';
import { initialGameState } from '$lib/stores/gameState';
import { generateWorld } from './world/WorldGenerator';
import { generatePawns } from './entities/Pawns';
import { entityService } from './services/EntityService';
import { workService } from './services/WorkService';
import { GameStateManager } from './core/GameState';
import { gameEngine } from './systems/GameEngineImpl';
import { TICKS_PER_SECOND } from './core/time';
import type { GameState, Pawn, PlacedBuilding, WorldTile } from './core/types';

const RUN = process.env.PROFILE === '1';

function placeOnWalkable(world: WorldTile[][], count: number): Array<{ x: number; y: number }> {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const out: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < 60 && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy++) {
      for (let dx = -r; dx <= r && out.length < count; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (world[y]?.[x]?.walkable && !out.some((o) => o.x === x && o.y === y)) out.push({ x, y });
      }
    }
  }
  return out;
}

describe('P-5 profiling harness (PROFILE=1)', () => {
  (RUN ? it : it.skip)('runs the engine with the turn profiler on and logs __profOut', () => {
    const seed = 1337;
    const world = generateWorld(240, 160, seed); // includes resource generation

    const race = initialGameState.race;
    const pawns: Pawn[] = generatePawns(race, 8);
    const spots = placeOnWalkable(world, pawns.length + 4);
    pawns.forEach((p, i) => {
      p.position = spots[i];
      // Elevate needs so some pawns immediately seek food/rest (exercises the need finders).
      if (i % 2 === 0) p.needs = { ...p.needs, fatigue: 80 };
      else p.needs = { ...p.needs, hunger: 85 };
    });

    // A couple of beds + a campfire near the colony so rest/food finders have real targets.
    const bedSpots = spots.slice(pawns.length);
    const buildings: PlacedBuilding[] = [
      {
        id: 'bed-1',
        type: 'hay_bed',
        x: bedSpots[0].x,
        y: bedSpots[0].y,
        status: 'complete',
        progress: 1
      },
      {
        id: 'bed-2',
        type: 'hay_bed',
        x: bedSpots[1].x,
        y: bedSpots[1].y,
        status: 'complete',
        progress: 1
      },
      {
        id: 'fire-1',
        type: 'campfire',
        x: bedSpots[2].x,
        y: bedSpots[2].y,
        status: 'complete',
        progress: 1,
        lit: true,
        fuel: 40
      }
    ];

    // A batch of harvest designations on resource tiles so generateJobs does real per-tick work.
    const designations: Record<string, string> = {};
    let added = 0;
    for (let y = 0; y < world.length && added < 60; y += 3) {
      for (let x = 0; x < (world[0]?.length ?? 0) && added < 60; x += 3) {
        const t = world[y]?.[x];
        if (t?.walkable && Object.keys(t.resources ?? {}).length > 0) {
          designations[`${x},${y}`] = 'harvest';
          added++;
        }
      }
    }

    let state: GameState = {
      ...initialGameState,
      seed,
      turn: 0,
      worldMap: world,
      pawns,
      buildings,
      designations: designations as GameState['designations'],
      stockpile: { ...initialGameState.stockpile, cooked_meat: 50, water: 50 }
    };
    state = workService.ensureDefaultWorkAssignments(state);
    state = entityService.seedInitialEntities(state);

    gameEngine.setGameStateManager(new GameStateManager(state));

    // The debounced save path calls navigator.sendBeacon, which doesn't exist in node — stub it so
    // ticks don't abort mid-way (it's swallowed by processGameTurn's try/catch otherwise).
    const nav = (globalThis as Record<string, unknown>).navigator as { sendBeacon?: unknown };
    if (nav && typeof nav.sendBeacon !== 'function') {
      try {
        nav.sendBeacon = () => true;
      } catch {
        /* read-only navigator on some runtimes — ignore */
      }
    }

    const g = globalThis as Record<string, unknown>;
    g.__profileTurns = true;
    g.__prof = {};
    g.__profCounts = {};

    const TICKS = TICKS_PER_SECOND * 30; // 30 in-game seconds
    const t0 = performance.now();
    let firstErr = '';
    for (let i = 0; i < TICKS; i++) {
      const r = gameEngine.processGameTurn();
      if (!r.success && !firstErr) firstErr = (r.errors ?? []).join('; ');
    }
    const wall = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(
      `  TICKS_PER_SECOND=${TICKS_PER_SECOND} finalTurn=${gameEngine.getGameState().turn} firstErr=${firstErr || '(none)'}`
    );

    const liveMobs = (gameEngine.getGameState().mobs ?? []).filter(
      (m) => m.state !== 'Corpse'
    ).length;

    // The engine's per-second dump (turn % TICKS_PER_SECOND === 0) populates __profOut with each
    // phase's avg ms/tick over the last second + `#<scan>/tick` counts, then resets the raw
    // accumulators — so read __profOut (the last full second's steady-state profile).
    const out = (g.__profOut as Record<string, string>) ?? {};
    const phaseRows = Object.entries(out)
      .filter(([k]) => !k.startsWith('#') && k !== 'TOTAL')
      .map(([k, v]) => ({ k, ms: parseFloat(v) }))
      .sort((a, b) => b.ms - a.ms);
    const total = parseFloat(out.TOTAL ?? '0');

    const lines: string[] = [];
    lines.push(
      `\n[P-5 PROFILE] ${TICKS} ticks · pawns=${pawns.length} liveMobs=${liveMobs} designations=${added}`
    );
    lines.push(`  wall ${wall.toFixed(0)}ms (${(wall / TICKS).toFixed(3)}ms/tick)`);
    lines.push('  per-phase avg ms/tick over the last in-game second (desc):');
    for (const p of phaseRows) {
      lines.push(
        `    ${p.k.padEnd(20)} ${p.ms.toFixed(4)}ms  (${total ? ((p.ms / total) * 100).toFixed(1) : '0'}%)`
      );
    }
    lines.push(`    ${'TOTAL'.padEnd(20)} ${total.toFixed(4)}ms`);
    lines.push('  suspect scan calls/tick (last second):');
    for (const [k, v] of Object.entries(out).filter(([k]) => k.startsWith('#'))) {
      lines.push(`    ${k.padEnd(26)} ${v}/tick`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    g.__profileTurns = false;
  });
});
