import { vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize } from 'node:v8';
import { Session } from 'node:inspector/promises';
import type { Profiler } from 'node:inspector';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { holdCreatureCount, initialState, type WorkPinScenario } from './scenarios';
import { functionPins } from './functions.mjs';
import type { GameState } from '../../src/lib/game/core/types';

const FRAME_MS = 16;
const SOURCE_ROOT = '/src/lib/';

interface MessageTally {
  count: number;
  bytes: number;
}

interface WorkerScope {
  postMessage(msg: unknown): void;
  onmessage?: (e: { data: unknown }) => Promise<void>;
}

function messageKind(msg: unknown): string {
  const m = msg as { kind?: string; type?: string };
  return String(m.kind ?? m.type);
}

function mobUpserts(msg: unknown): number {
  const mobs = (msg as { mobs?: { upserts?: unknown[] } }).mobs;
  return mobs?.upserts?.length ?? 0;
}

function installWorkerScope(
  tally: Record<string, MessageTally>,
  counters: Record<string, number>,
  live: () => boolean
): WorkerScope {
  const scope: WorkerScope = {
    postMessage(msg) {
      if (!live()) return;
      const t = (tally[messageKind(msg)] ??= { count: 0, bytes: 0 });
      t.count++;
      t.bytes += serialize(msg).byteLength;
      counters['mob upserts'] += mobUpserts(msg);
    }
  };
  (globalThis as unknown as { self: WorkerScope }).self = scope;
  return scope;
}

function sourceFile(url: string): string | null {
  const at = url.indexOf(SOURCE_ROOT);
  return at < 0 ? null : url.slice(at + 1).replace(/\?.*$/, '');
}

async function sessionFunctionPins(session: Session, coverage: Profiler.ScriptCoverage[]) {
  await session.post('Debugger.enable');
  const pins = await functionPins(
    coverage,
    async (scriptId: string) =>
      (await session.post('Debugger.getScriptSource', { scriptId })).scriptSource,
    sourceFile
  );
  await session.post('Debugger.disable');
  return pins;
}

interface CreatureCount {
  family?: string;
  placed: number;
  added: number;
  alive: number;
}

function countCreatures(
  family: string | undefined,
  placed: Set<string>,
  end: GameState
): CreatureCount {
  const live = (end.mobs ?? []).filter((m) => m.isAlive !== false && m.state !== 'Corpse');
  return {
    ...(family && { family }),
    placed: placed.size,
    added: (end.mobs ?? []).filter((m) => !placed.has(m.id)).length,
    alive: live.length
  };
}

async function tickThroughWorker(
  sc: WorkPinScenario,
  scope: WorkerScope,
  countMessages: (on: boolean) => void
): Promise<{
  turn: number;
  phases: Record<string, number> | null;
  coverage: Profiler.ScriptCoverage[];
  session: Session;
  creatures: CreatureCount | null;
}> {
  await import('$lib/game/sim/sim.worker');
  const { gameEngine } = await import('$lib/game/systems/GameEngineImpl');
  const send = (data: unknown) => scope.onmessage!({ data });
  const state = initialState(sc);
  const placed = new Set((state.mobs ?? []).map((m) => m.id));
  await send({ kind: 'init', state, seed: state.seed });
  for (const cmd of sc.commands ?? []) await send({ kind: 'command', cmd });
  await send({ kind: 'setPaused', paused: false });

  const phases = 'countPhases' in gameEngine ? {} : null;
  if (phases) gameEngine.countPhases(phases);
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  countMessages(true);
  const end = gameEngine.getGameState().turn + sc.ticks;
  while (gameEngine.getGameState().turn < end) vi.advanceTimersByTime(FRAME_MS);
  countMessages(false);
  const { result } = await session.post('Profiler.takePreciseCoverage');
  await session.post('Profiler.stopPreciseCoverage');
  if (phases) gameEngine.countPhases(null);
  const final = gameEngine.getGameState();
  return {
    turn: final.turn,
    phases,
    coverage: result,
    session,
    creatures: sc.creatures ? countCreatures(sc.creatures.family, placed, final) : null
  };
}

export async function runWorkPins(sc: WorkPinScenario): Promise<void> {
  await pathfinderService.init();
  const messages: Record<string, MessageTally> = {};
  const counters: Record<string, number> = { 'mob upserts': 0 };
  let live = false;
  const scope = installWorkerScope(messages, counters, () => live);
  const release = sc.creatures ? holdCreatureCount() : () => {};
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    now: 0
  });
  try {
    const { turn, phases, coverage, session, creatures } = await tickThroughWorker(
      sc,
      scope,
      (on) => {
        live = on;
      }
    );
    const functions = await sessionFunctionPins(session, coverage);
    session.disconnect();
    const out = process.env.WORK_PINS_OUT ?? join(tmpdir(), 'work-pins');
    mkdirSync(out, { recursive: true });
    const file = join(out, `${sc.name}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          scenario: sc.name,
          ticks: sc.ticks,
          turn,
          functions,
          phases,
          messages,
          counters,
          ...(creatures && { creatures })
        },
        null,
        1
      )
    );
    const calls = Object.values(functions).reduce((n, f) => n + f.count, 0);
    process.stdout.write(
      `[work-pins] ${sc.name}: turn ${turn}, ${Object.keys(functions).length} functions, ${calls} calls${creatures ? `, ${creatures.placed} creatures placed` : ''} → ${file}\n`
    );
  } finally {
    release();
    vi.useRealTimers();
  }
}
