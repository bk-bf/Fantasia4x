/// <reference lib="webworker" />
import { isClientRuntime } from '../core/util/runtime';
import { pathfinderService } from '../services/PathfinderService';
import { GameStateManager } from '../core/state/GameStateManager';
import { gameEngine } from '../systems/GameEngineImpl';
import { rng } from '../core/util/rng';
import { resetUnreachableJobs } from '../systems/PawnStateMachine';
import { TICKS_PER_SECOND } from '../core/util/time';
import { setSimLogSink, simLog, setVerboseLogging, type SimLogSink } from '../core/util/logSink';
import { applySimCommand } from './commands';
import { projectSentEntity } from './entityProjection';
import type { SimLogEvent, EntitySync } from './simProtocol';
import { drainTileDeltasBudgeted, clearTileDeltas } from '../core/state/tileDeltas';
import { carcassConditionByType } from '../core/rules/world/carcassCondition';
import { buildingsVisualSig } from '../core/state/buildingSig';
import { gameLogger } from '../debug/gameLogger';
import type { GameState, WorldTile, DroppedItem } from '../core/types';

const TICK_MS = 1000 / TICKS_PER_SECOND;
const BATCH_BUDGET_MS = 16;
const MAX_STEPS_PER_BATCH = 120;
const MAX_BACKLOG_MS = 150;

let speed = 1;
let paused = true;
let perfTicksAccum = 0;
let perfWindowStart = 0;
let accMs = 0;
let lastBatch = 0;
let loop: ReturnType<typeof setInterval> | null = null;
let lastWorldMap: GameState['worldMap'] | null = null;
let terrainRev = 0;
let snowRev = 0;
const SNOW_DELTA_BUDGET_PER_FLUSH = 3000;
let designationRev = 0;
let _trigWM = 0,
  _trigDelta = 0,
  _trigBSig = 0,
  _trigZone = 0,
  _trigDesig = 0;
let prevWM: unknown,
  prevBuildingsSig = '',
  prevDesignations: unknown,
  prevZoneTiles: unknown;

function post(msg: unknown) {
  (self as unknown as Worker).postMessage(msg);
}

let logBuffer: SimLogEvent[] = [];
function flushLog() {
  if (logBuffer.length === 0) return;
  post({ kind: 'simlog', events: logBuffer });
  logBuffer = [];
}
function installForwardingLogSink() {
  const fwd =
    (m: string) =>
    (...a: unknown[]) => {
      logBuffer.push({ m, a });
    };
  setSimLogSink({
    logActivity: (...a: unknown[]) => {
      logBuffer.push({ m: 'logActivity', a });
      return '';
    },
    logEvent: fwd('logEvent'),
    logCombatSwing: fwd('logCombatSwing'),
    logCombatKill: fwd('logCombatKill'),
    pushCombatText: fwd('pushCombatText'),
    pushAttackLunge: fwd('pushAttackLunge'),
    pushCombatSound: fwd('pushCombatSound'),
    pushProjectile: fwd('pushProjectile'),
    logEntityDeath: fwd('logEntityDeath'),
    threatAlert: fwd('threatAlert'),
    vitalAlert: fwd('vitalAlert'),
    pawnDeath: fwd('pawnDeath')
  } as SimLogSink);
}

let lastSent: Record<string, unknown> = {};
const SECTIONAL_SKIP = new Set(['pawns', 'mobs', 'worldMap', 'droppedItems']);

const lastDropRefs = new Map<string, DroppedItem>();
let lastDropIds = new Set<string>();
let lastDropsArrRef: DroppedItem[] | undefined = undefined;

function syncDrops(arr: readonly DroppedItem[]): EntitySync<DroppedItem> {
  const upserts: DroppedItem[] = [];
  const order: string[] = new Array(arr.length);
  const cur = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    order[i] = d.id;
    cur.add(d.id);
    if (lastDropRefs.get(d.id) !== d) {
      lastDropRefs.set(d.id, d);
      upserts.push(d);
    }
  }
  const removed: string[] = [];
  for (const id of lastDropIds) if (!cur.has(id)) removed.push(id);
  for (const id of removed) lastDropRefs.delete(id);
  lastDropIds = cur;
  return { upserts, removed, order };
}

const PAWN_COLD = new Set<string>([
  'inventory',
  'equipment',
  'stats',
  'physicalTraits',
  'traits',
  'skills',
  'limbs',
  'injuries',
  'conditions',
  'conditionTimers',
  'kin',
  'moodModifiers',
  'socialBreak'
]);
const MOB_COLD = new Set<string>([
  'stats',
  'physicalTraits',
  'skills',
  'limbs',
  'injuries',
  'conditions',
  'conditionTimers',
  'equipment',
  'name',
  'stateSince',
  'targetPawnId',
  'diedAt',
  'huntTargetId',
  'huntCooldownUntil',
  'forageCooldownUntil',
  'blockedTicks',
  'pain',
  'bloodVolume',
  'maxBloodVolume'
]);
const MOB_VOLATILE = new Set<string>(['needs']);
const lastPawnCold = new Map<string, Record<string, unknown>>();
const lastMobCold = new Map<string, Record<string, unknown>>();
const SNAP_SIZE_LOG = false;
let flushSeq = 0;
let lastPawnIds = new Set<string>();
let lastMobIds = new Set<string>();

function slimEntity<T extends { id: string }>(
  e: T,
  cold: Set<string>
): Partial<T> & { id: string } {
  const o: Record<string, unknown> = {};
  for (const k in e) if (!cold.has(k)) o[k] = (e as Record<string, unknown>)[k];
  return o as Partial<T> & { id: string };
}

const TILE_RENDER_FIELDS = [
  'x',
  'y',
  'type',
  'terrainType',
  'subType',
  'movementCost',
  'walkable',
  'resources',
  'resourceCooldowns',
  'growth',
  'fertilityWear',
  'snow',
  'ice'
] as const;
function slimTile(tile: WorldTile): Partial<WorldTile> {
  const o: Record<string, unknown> = {};
  for (const k of TILE_RENDER_FIELDS) {
    const v = (tile as unknown as Record<string, unknown>)[k];
    if (v !== undefined) o[k] = v;
  }
  return o as Partial<WorldTile>;
}

function syncEntities<T extends { id: string }>(
  arr: readonly T[],
  prevIds: Set<string>,
  cold: Set<string>,
  lastCold: Map<string, Record<string, unknown>>,
  volatile?: Set<string>
): EntitySync<T> {
  const upserts: Array<Partial<T> & { id: string }> = new Array(arr.length);
  const order: string[] = new Array(arr.length);
  const cur = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    order[i] = e.id;
    cur.add(e.id);
    const er = e as Record<string, unknown>;
    const seen = prevIds.has(e.id);
    let refs = lastCold.get(e.id);
    if (!refs) lastCold.set(e.id, (refs = {}));
    let o: Record<string, unknown>;
    if (volatile) {
      o = { id: e.id };
      for (const k in e) {
        if (k === 'id') continue;
        const v = er[k];
        if (!seen || volatile.has(k) || v !== refs[k]) {
          o[k] = v;
          refs[k] = v;
        }
      }
    } else {
      o = slimEntity(e, cold) as Record<string, unknown>;
      for (const k of cold) {
        const v = er[k];
        if (!seen || v !== refs[k]) {
          o[k] = v;
          refs[k] = v;
        }
      }
    }
    projectSentEntity(o);
    upserts[i] = o as Partial<T> & { id: string };
  }
  const removed: string[] = [];
  for (const id of prevIds)
    if (!cur.has(id)) {
      removed.push(id);
      lastCold.delete(id);
    }
  prevIds.clear();
  for (const id of cur) prevIds.add(id);
  return { upserts, removed, order };
}

function publish(state: GameState, flush: boolean, commit = false) {
  if (!flush) return;
  const worldMapChanged = state.worldMap !== lastWorldMap;
  lastWorldMap = state.worldMap;
  const tileDeltas = worldMapChanged
    ? (clearTileDeltas(), null)
    : drainTileDeltasBudgeted(SNOW_DELTA_BUDGET_PER_FLUSH);
  const bSig = buildingsVisualSig(state.buildings);
  const cWM = state.worldMap !== prevWM;
  const cDelta = tileDeltas !== null && tileDeltas.some((d) => d.kind === 'terrain');
  const cSnow = tileDeltas !== null && tileDeltas.some((d) => d.kind === 'snow');
  const cBSig = bSig !== prevBuildingsSig;
  const cZone = state.zoneTiles !== prevZoneTiles;
  if (cWM || cDelta || cBSig) {
    terrainRev++;
    prevWM = state.worldMap;
    prevBuildingsSig = bSig;
    if (cWM) _trigWM++;
    if (cDelta) _trigDelta++;
    if (cBSig) _trigBSig++;
  }
  if (cWM || cSnow) snowRev++;
  if (state.designations !== prevDesignations || cZone) {
    designationRev++;
    if (state.designations !== prevDesignations) {
      prevDesignations = state.designations;
      _trigDesig++;
    }
    if (cZone) {
      prevZoneTiles = state.zoneTiles;
      _trigZone++;
    }
  }
  const delta: Record<string, unknown> = {};
  const src = state as unknown as Record<string, unknown>;
  for (const k in state) {
    if (SECTIONAL_SKIP.has(k)) continue;
    const v = src[k];
    if (v !== lastSent[k]) {
      delta[k] = v;
      lastSent[k] = v;
    }
  }
  delta._terrainRev = terrainRev;
  delta._snowRev = snowRev;
  delta._designationRev = designationRev;

  const drops = syncDrops(state.droppedItems ?? []);
  if (state.droppedItems !== lastDropsArrRef) {
    lastDropsArrRef = state.droppedItems;
    delta._carcassCondition = carcassConditionByType(state.droppedItems);
  }

  flushSeq++;
  const pawns = syncEntities(state.pawns, lastPawnIds, PAWN_COLD, lastPawnCold);
  if (gameLogger.isEnabled && 'upserts' in pawns) {
    for (const u of pawns.upserts) {
      if (u && 'inventory' in u) {
        const inv = (u as { inventory?: { items?: Record<string, number> } }).inventory;
        gameLogger.log(
          state.turn,
          'ITEM-DBG',
          `SYNC→main: shipped inventory for ${u.id} = ${JSON.stringify(inv?.items ?? {})}`
        );
      }
    }
  }
  const mobs = syncEntities(state.mobs ?? [], lastMobIds, MOB_COLD, lastMobCold, MOB_VOLATILE);
  const wmDelta = tileDeltas
    ? tileDeltas.map((d) =>
        d.kind === 'snow'
          ? { y: d.y, x: d.x, tile: slimTile(d.tile), k: 1 as const }
          : { y: d.y, x: d.x, tile: slimTile(d.tile) }
      )
    : undefined;

  if (SNAP_SIZE_LOG && flushSeq % 30 === 0) {
    const sz = (x: unknown) => {
      try {
        return x === undefined ? 0 : JSON.stringify(x).length;
      } catch {
        return -1;
      }
    };
    const topFields = Object.keys(delta)
      .map((k) => [k, sz(delta[k])] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}=${(v / 1000).toFixed(1)}k`)
      .join(' ');
    // eslint-disable-next-line no-console -- gated snapshot-size probe
    console.info(
      `[SNAP] state=${(sz(delta) / 1000).toFixed(1)}k pawns=${(sz(pawns) / 1000).toFixed(1)}k ` +
        `mobs=${(sz(mobs) / 1000).toFixed(1)}k wmDelta=${(sz(wmDelta) / 1000).toFixed(1)}k ` +
        `| top state fields: ${topFields}`
    );
    const sp = ('upserts' in pawns ? pawns.upserts[0] : pawns.full?.[0]) as
      | Record<string, unknown>
      | undefined;
    if (sp) {
      const pf = Object.keys(sp)
        .map((k) => [k, sz(sp[k])] as [string, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      // eslint-disable-next-line no-console -- gated snapshot-size probe
      console.info(`[SNAP-PAWN] one slim pawn = ${sz(sp)}B · fields(bytes): ${pf}`);
    }
    // eslint-disable-next-line no-console -- gated snapshot-size probe
    console.info(
      `[TRIG] terrain bumps/30flush: worldMapDelta=${_trigDelta} worldMapRef=${_trigWM} ` +
        `buildings=${_trigBSig} zones=${_trigZone} | designations(decoupled)=${_trigDesig}`
    );
    _trigWM = _trigDelta = _trigBSig = _trigZone = _trigDesig = 0;
  }

  post({
    kind: 'snapshot',
    state: delta,
    pawns,
    mobs,
    drops,
    worldMap: worldMapChanged ? state.worldMap : undefined,
    worldMapDelta: wmDelta,
    flush,
    commit
  });
}

function batch() {
  if (paused) {
    accMs = 0;
    lastBatch = performance.now();
    return;
  }
  const now = performance.now();
  const dt = lastBatch ? now - lastBatch : 0;
  lastBatch = now;
  accMs += Math.min(dt, 250) * speed;
  const start = now;
  let steps = 0;
  while (accMs >= TICK_MS && steps < MAX_STEPS_PER_BATCH) {
    const r = gameEngine.processGameTurn();
    if (!r.success) {
      accMs = 0;
      post({ kind: 'error', error: 'tick failed: ' + (r.errors ?? []).join('; ') });
      return;
    }
    accMs -= TICK_MS;
    steps++;
    if (performance.now() - start >= BATCH_BUDGET_MS) break;
  }
  if (accMs > MAX_BACKLOG_MS) accMs = MAX_BACKLOG_MS;

  perfTicksAccum += steps;
  if (perfWindowStart === 0) perfWindowStart = now;
  const perfElapsed = now - perfWindowStart;
  if (perfElapsed >= 1000) {
    if (perfElapsed < 3000 && perfTicksAccum > 0) {
      const tps = Math.round((perfTicksAccum * 1000) / perfElapsed);
      const gs = gameEngine.getGameState();
      simLog.logEvent({
        category: 'perf',
        turn: gs.turn,
        message: `tps=${tps} speed=${speed}x pawns=${gs.pawns.length} mobs=${(gs.mobs ?? []).length}`
      });
    }
    perfTicksAccum = 0;
    perfWindowStart = now;
  }

  flushLog();
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  switch (msg?.kind) {
    case 'wasm-check': {
      let ready = false;
      let error: string | undefined;
      try {
        await pathfinderService.init();
        ready = pathfinderService.isReady();
      } catch (err) {
        error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      }
      post({ type: 'wasm-result', browser: isClientRuntime, ready, error });
      break;
    }
    case 'init': {
      rng.reseed(msg.seed ?? 0);
      resetUnreachableJobs();
      installForwardingLogSink();
      setVerboseLogging(!!msg.verbose);
      gameEngine.setGameStateManager(new GameStateManager(msg.state));
      gameEngine.setPreviewMode(!!msg.preview);
      gameEngine.setOutputSink(publish);
      gameEngine.setCommitSink((s) => publish(s, true, true));
      await pathfinderService.init();
      lastWorldMap = (msg.state as GameState).worldMap;
      lastSent = {};
      flushSeq = 0;
      lastPawnIds = new Set();
      lastMobIds = new Set();
      lastPawnCold.clear();
      lastMobCold.clear();
      lastDropRefs.clear();
      lastDropIds = new Set();
      lastDropsArrRef = undefined;
      lastBatch = performance.now();
      if (!loop) loop = setInterval(batch, 16);
      post({ kind: 'ready' });
      publish(msg.state, true, true);
      break;
    }
    case 'command':
      gameEngine.applyCommand((s) => applySimCommand(s, msg.cmd), msg.cmd.save ?? false);
      flushLog();
      break;
    case 'setSpeed':
      speed = msg.speed;
      break;
    case 'setVerbose':
      setVerboseLogging(!!msg.on);
      {
        let turn = 0;
        try {
          turn = gameEngine.getGameState().turn;
        } catch {}
        simLog.logEvent({
          category: 'system',
          turn,
          message: `verbose sim tracing ${msg.on ? 'ON' : 'OFF'} (worker)`
        });
        flushLog();
      }
      break;
    case 'setPaused':
      paused = msg.paused;
      if (!paused) lastBatch = performance.now();
      else publish(gameEngine.getGameState(), true, true);
      break;
    case 'requestSave':
      post({ kind: 'fullState', state: gameEngine.getGameState() });
      break;
  }
};
