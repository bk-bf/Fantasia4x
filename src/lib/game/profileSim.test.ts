/**
 * P-5 profiling harness (run on demand, not in the normal suite).
 *
 *   PROFILE=1 npx vitest run src/lib/game/profileSim.test.ts
 *
 * Builds the same scenario as the browser sandbox (dev/profilerScenario, smaller counts here) and
 * runs the engine for N ticks with the turn profiler on, then logs the per-phase avg ms + the P-5
 * scan counts.
 *
 * IMPORTANT CAVEAT — headless ≠ real: vitest runs with `browser=false`, so WasmPathfinderService
 * never initialises (isReady()=false) → no A* pathfinding and no entity movement. This measures the
 * per-tick FIXED cost of every phase + scans that fire without movement, but UNDER-counts
 * `blockedTiles` (most of whose calls live inside pathfinding) and under-represents the `pawns`
 * phase. For the accurate hot path, use the in-browser sandbox: `./dev.sh --profiler`.
 */
import { describe, it } from 'vitest';
import { GameStateManager } from './core/GameState';
// Import order matters: profilerScenario pulls in stores/gameState, which wires the engine at
// module-eval (gameEngine.setGameStateManager). That wiring must run before GameEngineImpl's body
// finishes, so gameState must be the entry of the GEImpl↔store import cycle. Keep this import ABOVE
// the gameEngine import below or module init throws "Cannot read properties of undefined".
import { buildProfilerScenario } from './dev/profilerScenario';
import { gameEngine } from './systems/GameEngineImpl';
import { TICKS_PER_SECOND } from './core/time';

const RUN = process.env.PROFILE === '1';

describe('P-5 profiling harness (PROFILE=1)', () => {
  (RUN ? it : it.skip)('runs the engine with the turn profiler on and logs __profOut', () => {
    const state = buildProfilerScenario({
      pawns: 12,
      mobs: 60,
      buildings: 12,
      designations: 80,
      droppedItems: 40
    });
    gameEngine.setGameStateManager(new GameStateManager(state));

    // The debounced save path calls navigator.sendBeacon, absent in node — stub it so ticks don't
    // abort mid-way (it's swallowed by processGameTurn's try/catch otherwise).
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
    for (let i = 0; i < TICKS; i++) gameEngine.processGameTurn();
    const wall = performance.now() - t0;

    const liveMobs = (gameEngine.getGameState().mobs ?? []).filter(
      (m) => m.state !== 'Corpse'
    ).length;

    // The engine's per-second dump populates __profOut (avg ms/tick over the last second +
    // `#<scan>/tick`) then resets the raw accumulators — so read __profOut.
    const out = (g.__profOut as Record<string, string>) ?? {};
    const phaseRows = Object.entries(out)
      .filter(([k]) => !k.startsWith('#') && k !== 'TOTAL')
      .map(([k, v]) => ({ k, ms: parseFloat(v) }))
      .sort((a, b) => b.ms - a.ms);
    const total = parseFloat(out.TOTAL ?? '0');

    const lines: string[] = [];
    lines.push(
      `\n[P-5 PROFILE] ${TICKS} ticks · pawns=${state.pawns.length} liveMobs=${liveMobs} designations=${Object.keys(state.designations).length}`
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
