import { it, expect, beforeAll } from 'vitest';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink, setVerboseLogging, type SimLogSink } from '$lib/game/core/logSink';
import type { GameState, Mob } from '$lib/game/core/types';

/**
 * TEMP creature-behaviour monitor (HEADLESS-SIM demo): spawn a dense predator/prey/hostile map, run
 * it with the verbose log firehose captured, and flag odd behaviour — stuck movers, empty paths
 * while moving, dangling hunt targets, out-of-range needs, state thrash, mass starvation. Not a
 * committed test; deleted after the run.
 */

const MOVING_STATES = new Set([
  'Wander',
  'Hunting',
  'Foraging',
  'Fleeing',
  'Traveling',
  'Startled',
  'Alerted'
]);
const RESTFUL_STATES = new Set(['Grazing', 'Eating', 'Sleeping', 'Exhausted', 'Collapsed', 'Tamed']);

// Predator/prey/hostile mix — deliberately chosen to force hunting, fleeing, and aggro dynamics.
const SPAWN_MIX: Array<{ id: string; n: number }> = [
  { id: 'wolf', n: 25 },
  { id: 'dire_wolf', n: 10 },
  { id: 'bear', n: 12 },
  { id: 'sabretooth', n: 8 },
  { id: 'thornwood_spider', n: 12 },
  { id: 'jackal', n: 15 },
  { id: 'deer', n: 40 },
  { id: 'rabbit', n: 40 },
  { id: 'boar', n: 25 },
  { id: 'elk', n: 20 },
  { id: 'aurochs', n: 15 },
  { id: 'wild_chicken', n: 25 },
  { id: 'goblin', n: 20 },
  { id: 'orc_grunt', n: 12 }
];

const TICKS = 3600; // 60 in-game seconds
const SAMPLE = 30; // inspect state every 30 ticks
const STUCK_TICKS = 180; // 3 in-game seconds without moving while in a moving state = suspicious

beforeAll(async () => {
  await pathfinderService.init();
});

it('MONITOR: dense creature map behaviour', async () => {
  // Capture the sim's own diagnostic firehose.
  const logs: Record<string, number> = {};
  const deaths: Array<{ name: string; cause: string; turn: number }> = [];
  const sink = {
    logActivity: () => '',
    logEvent: (e: { category: string }) => {
      logs[e.category] = (logs[e.category] ?? 0) + 1;
    },
    logCombatSwing: () => {},
    logCombatKill: () => {},
    pushCombatText: () => {},
    pushAttackLunge: () => {},
    pushCombatSound: () => {},
    pushProjectile: () => {},
    logEntityDeath: (_id: string, name: string, cause: string, turn: number) =>
      deaths.push({ name, cause, turn }),
    threatAlert: () => {
      logs['threatAlert'] = (logs['threatAlert'] ?? 0) + 1;
    },
    vitalAlert: () => {},
    pawnDeath: (_id: string, name: string, cause: string, turn: number) =>
      deaths.push({ name: `PAWN:${name}`, cause, turn })
  } as unknown as SimLogSink;
  setSimLogSink(sink);
  setVerboseLogging(true);

  const session = new HeadlessSession();
  // A quiet colony (no pawns to steal aggro) so we watch pure creature ecology.
  await session.start(
    buildScenario({ seed: 0xbeef, map: { w: 96, h: 96, preset: 'generated' }, pawns: [], seedEntities: true })
  );
  for (const { id, n } of SPAWN_MIX) {
    session.command({ type: 'devSpawnEntities', payload: { count: n, creatureId: id } });
  }

  const s0 = session.getState();
  const W = s0.worldMap[0].length;
  const H = s0.worldMap.length;
  const walkable = (x: number, y: number) => !!s0.worldMap[y]?.[x]?.walkable;
  console.log(`\n[MONITOR] spawned ${(s0.mobs ?? []).length} creatures on ${W}×${H}`);

  // Per-mob trackers.
  const lastPos = new Map<string, { x: number; y: number; since: number }>();
  const stateChanges = new Map<string, number>();
  const lastState = new Map<string, string>();
  const maxHunger = new Map<string, number>();
  const everAte = new Set<string>();

  // Anomaly accumulators (id -> worst example) so one flap doesn't spam.
  const anomalies = {
    stuckMover: new Map<string, string>(),
    emptyPathMoving: new Map<string, string>(),
    danglingHunt: new Map<string, string>(),
    danglingAttack: new Map<string, string>(),
    offMap: new Map<string, string>(),
    needsNaN: new Map<string, string>(),
    needsRange: new Map<string, string>(),
    stuckAlerted: new Map<string, string>()
  };

  for (let t = 0; t < TICKS; t += SAMPLE) {
    session.tick(SAMPLE);
    const s = session.getState();
    const turn = s.turn;
    const byId = new Map<string, Mob>();
    const pawnIds = new Set(s.pawns.map((p) => p.id));
    for (const m of s.mobs ?? []) byId.set(m.id, m);

    for (const m of s.mobs ?? []) {
      if (m.state === 'Corpse' || m.isAlive === false) continue;
      const tag = `${m.creatureId}#${m.id.slice(-6)}`;

      // position / off-map
      if (
        !Number.isInteger(m.x) ||
        !Number.isInteger(m.y) ||
        m.x < 0 ||
        m.y < 0 ||
        m.x >= W ||
        m.y >= H ||
        !walkable(m.x, m.y)
      ) {
        anomalies.offMap.set(m.id, `${tag} @${m.x},${m.y} walkable=${walkable(m.x, m.y)}`);
      }

      // needs sanity
      const hunger = m.needs?.hunger;
      const fatigue = m.needs?.fatigue;
      if (!Number.isFinite(hunger) || !Number.isFinite(fatigue)) {
        anomalies.needsNaN.set(m.id, `${tag} hunger=${hunger} fatigue=${fatigue}`);
      } else {
        if (hunger < -0.01 || hunger > 105 || fatigue < -0.01 || fatigue > 105)
          anomalies.needsRange.set(m.id, `${tag} hunger=${hunger.toFixed(1)} fatigue=${fatigue.toFixed(1)}`);
        maxHunger.set(m.id, Math.max(maxHunger.get(m.id) ?? 0, hunger));
      }
      if (m.state === 'Eating') everAte.add(m.id);

      // movement tracking
      const prev = lastPos.get(m.id);
      if (!prev || prev.x !== m.x || prev.y !== m.y) {
        lastPos.set(m.id, { x: m.x, y: m.y, since: turn });
      } else if (MOVING_STATES.has(m.state) && turn - prev.since >= STUCK_TICKS) {
        anomalies.stuckMover.set(
          m.id,
          `${tag} state=${m.state} stuck @${m.x},${m.y} for ${turn - prev.since}t (blockedTicks=${(m as unknown as { blockedTicks?: number }).blockedTicks ?? 0})`
        );
      }

      // path sanity: in a travel state but no path to follow for a while
      const pathLeft = (m.path?.length ?? 0) - (m.pathIndex ?? 0);
      if (
        (m.state === 'Hunting' || m.state === 'Foraging' || m.state === 'Fleeing') &&
        pathLeft <= 0 &&
        prev &&
        turn - prev.since >= STUCK_TICKS
      ) {
        anomalies.emptyPathMoving.set(m.id, `${tag} state=${m.state} no path, still ${turn - prev.since}t`);
      }

      // target sanity
      if (m.state === 'Hunting') {
        const tgt = m.huntTargetId;
        if (!tgt || (!byId.has(tgt) && !pawnIds.has(tgt)) || byId.get(tgt)?.state === 'Corpse') {
          anomalies.danglingHunt.set(m.id, `${tag} Hunting but huntTargetId=${tgt ?? 'none'} (missing/dead)`);
        }
      }
      if (m.state === 'Attacking') {
        const tp = m.targetPawnId;
        if (tp && !pawnIds.has(tp)) anomalies.danglingAttack.set(m.id, `${tag} Attacking dead/absent pawn ${tp}`);
      }

      // stuck Alerted (never resolves to Attacking/Wander)
      if (m.state === 'Alerted' && turn - (m.stateSince ?? turn) >= 600) {
        anomalies.stuckAlerted.set(m.id, `${tag} Alerted for ${turn - (m.stateSince ?? turn)}t`);
      }

      // state-change churn
      const ls = lastState.get(m.id);
      if (ls !== m.state) {
        lastState.set(m.id, m.state);
        stateChanges.set(m.id, (stateChanges.get(m.id) ?? 0) + 1);
      }
    }
  }

  const sFinal = session.getState();
  const live = (sFinal.mobs ?? []).filter((m) => m.state !== 'Corpse' && m.isAlive !== false);
  const corpses = (sFinal.mobs ?? []).filter((m) => m.state === 'Corpse');

  // ---- report ----
  const rpt: string[] = [];
  rpt.push(`\n===== CREATURE MONITOR REPORT (turn ${sFinal.turn}) =====`);
  rpt.push(`live ${live.length} | corpses ${corpses.length} | total ${(sFinal.mobs ?? []).length}`);
  rpt.push(`log firehose by category: ${JSON.stringify(logs)}`);

  // deaths grouped by cause
  const causeCount: Record<string, number> = {};
  for (const d of deaths) causeCount[d.cause] = (causeCount[d.cause] ?? 0) + 1;
  rpt.push(`deaths (${deaths.length}) by cause: ${JSON.stringify(causeCount)}`);

  // state distribution of the living
  const stateDist: Record<string, number> = {};
  for (const m of live) stateDist[m.state] = (stateDist[m.state] ?? 0) + 1;
  rpt.push(`living state distribution: ${JSON.stringify(stateDist)}`);

  // hunting effectiveness: how many predators ever reached Eating
  const predators = new Set(['wolf', 'dire_wolf', 'bear', 'sabretooth', 'thornwood_spider', 'jackal']);
  const preds = (sFinal.mobs ?? []).filter((m) => predators.has(m.creatureId));
  const predsAte = preds.filter((m) => everAte.has(m.id)).length;
  rpt.push(`predators: ${preds.length} spawned, ${predsAte} ever reached Eating`);

  // state thrash: mobs that changed state a lot
  const thrash = [...stateChanges.entries()].filter(([, c]) => c > 40).sort((a, b) => b[1] - a[1]);
  rpt.push(`state-thrash (>40 changes in ${TICKS}t): ${thrash.length} mobs${thrash.length ? ' — top: ' + thrash.slice(0, 3).map(([id, c]) => `${byIdName(sFinal, id)}=${c}`).join(', ') : ''}`);

  rpt.push(`\n--- ANOMALIES ---`);
  for (const [name, map] of Object.entries(anomalies)) {
    rpt.push(`${name}: ${map.size}`);
    for (const ex of [...map.values()].slice(0, 4)) rpt.push(`    • ${ex}`);
  }
  console.log(rpt.join('\n'));

  // The monitor never fails the run — it's an observation tool. Assert only that the sim didn't crash.
  expect(sFinal.turn).toBe(TICKS);
}, 120_000);

function byIdName(s: GameState, id: string): string {
  const m = (s.mobs ?? []).find((x) => x.id === id);
  return m ? `${m.creatureId}#${id.slice(-6)}` : id;
}
