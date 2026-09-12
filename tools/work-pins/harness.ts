import { vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Session } from 'node:inspector/promises';
import type { Profiler } from 'node:inspector';
import { buildScenario, type ScenarioSpec } from '$lib/game/headless/Scenario';
import { fromSnapshot } from '$lib/game/headless/snapshot';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import type { SimCommand } from '$lib/game/sim/simProtocol';
import type { GameState } from '$lib/game/core/types';
import { functionPins } from './functions.mjs';

const FRAME_MS = 16;
const SOURCE_ROOT = '/src/lib/';

export type WorkPinScenario = {
  name: string;
  ticks: number;
  commands?: SimCommand[];
} & ({ spec: ScenarioSpec } | { snapshotGz: string });

function initialState(sc: WorkPinScenario): GameState {
  if ('spec' in sc) return buildScenario(sc.spec);
  return fromSnapshot(JSON.parse(gunzipSync(readFileSync(sc.snapshotGz)).toString('utf8')));
}

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

function installWorkerScope(tally: Record<string, MessageTally>, live: () => boolean): WorkerScope {
  const scope: WorkerScope = {
    postMessage(msg) {
      if (!live()) return;
      const t = (tally[messageKind(msg)] ??= { count: 0, bytes: 0 });
      t.count++;
      t.bytes += serialize(msg).byteLength;
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

async function tickThroughWorker(
  sc: WorkPinScenario,
  scope: WorkerScope,
  countMessages: (on: boolean) => void
): Promise<{
  turn: number;
  phases: Record<string, number> | null;
  coverage: Profiler.ScriptCoverage[];
  session: Session;
}> {
  await import('$lib/game/sim/sim.worker');
  const { gameEngine } = await import('$lib/game/systems/GameEngineImpl');
  const send = (data: unknown) => scope.onmessage!({ data });
  const state = initialState(sc);
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
  return { turn: gameEngine.getGameState().turn, phases, coverage: result, session };
}

export async function runWorkPins(sc: WorkPinScenario): Promise<void> {
  await pathfinderService.init();
  const messages: Record<string, MessageTally> = {};
  let live = false;
  const scope = installWorkerScope(messages, () => live);
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    now: 0
  });
  try {
    const { turn, phases, coverage, session } = await tickThroughWorker(sc, scope, (on) => {
      live = on;
    });
    const functions = await sessionFunctionPins(session, coverage);
    session.disconnect();
    const out = process.env.WORK_PINS_OUT ?? join(tmpdir(), 'work-pins');
    mkdirSync(out, { recursive: true });
    const file = join(out, `${sc.name}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        { scenario: sc.name, ticks: sc.ticks, turn, functions, phases, messages },
        null,
        1
      )
    );
    const calls = Object.values(functions).reduce((n, f) => n + f.count, 0);
    process.stdout.write(
      `[work-pins] ${sc.name}: turn ${turn}, ${Object.keys(functions).length} functions, ${calls} calls → ${file}\n`
    );
  } finally {
    vi.useRealTimers();
  }
}
