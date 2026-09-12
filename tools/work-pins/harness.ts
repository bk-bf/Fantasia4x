import { vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize } from 'node:v8';
import { Session } from 'node:inspector/promises';
import type { Profiler } from 'node:inspector';
import { buildScenario, type ScenarioSpec } from '$lib/game/headless/Scenario';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import type { SimCommand } from '$lib/game/sim/simProtocol';

const FRAME_MS = 16;
const SOURCE_ROOT = '/src/lib/';
const MODULE_WRAPPER = 'async (__vite_ssr_import__';
const EXPORTS_OBJECT = '__vite_ssr_exports__';
const INLINE_MAP =
  /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)/g;

export interface WorkPinScenario {
  name: string;
  spec: ScenarioSpec;
  ticks: number;
  commands?: SimCommand[];
}

interface MessageTally {
  count: number;
  bytes: number;
}

interface FunctionPin {
  file: string;
  line: number;
  name: string;
  count: number;
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

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function position(starts: number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, column: offset - starts[lo] };
}

function inlineSourceMap(source: string): SourceMap | null {
  const found = [...source.matchAll(INLINE_MAP)].pop();
  if (!found) return null;
  return new SourceMap(JSON.parse(Buffer.from(found[1], 'base64').toString('utf8')));
}

function sourceLineResolver(source: string): (offset: number) => number {
  const starts = lineStarts(source);
  const map = inlineSourceMap(source);
  return (offset) => {
    const pos = position(starts, offset);
    const entry = map?.findEntry(pos.line, pos.column);
    return entry && 'originalLine' in entry ? entry.originalLine + 1 : pos.line + 1;
  };
}

interface Span {
  name: string;
  start: number;
  end: number;
  count: number;
}

function spansOf(fns: Profiler.FunctionCoverage[]): Span[] {
  return fns
    .map((f) => ({
      name: f.functionName || '(anonymous)',
      start: f.ranges[0].startOffset,
      end: f.ranges[0].endOffset,
      count: f.ranges[0].count
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

function isTransformArtifact(source: string, s: Span): boolean {
  if (s.start === 0 || source.startsWith(MODULE_WRAPPER, s.start)) return true;
  if (s.name !== 'get') return false;
  const before = source.slice(Math.max(0, s.start - 300), s.start);
  const statement = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1);
  return statement.includes(EXPORTS_OBJECT);
}

function nestedKeys(spans: Span[]): Array<Span & { key: string }> {
  const stack: Array<{ end: number; key: string; seen: Map<string, number> }> = [];
  const top = new Map<string, number>();
  const out: Array<Span & { key: string }> = [];
  for (const s of spans) {
    while (stack.length && s.start >= stack[stack.length - 1].end) stack.pop();
    const parent = stack[stack.length - 1];
    const seen = parent ? parent.seen : top;
    const nth = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, nth);
    const own = nth > 1 ? `${s.name}#${nth}` : s.name;
    const key = parent ? `${parent.key} > ${own}` : own;
    stack.push({ end: s.end, key, seen: new Map() });
    out.push({ ...s, key });
  }
  return out;
}

async function functionPins(
  session: Session,
  coverage: Profiler.ScriptCoverage[]
): Promise<Record<string, FunctionPin>> {
  await session.post('Debugger.enable');
  const pins: Record<string, FunctionPin> = {};
  for (const script of coverage) {
    const at = script.url.indexOf(SOURCE_ROOT);
    if (at < 0 || !script.functions.some((f) => f.ranges[0].count > 0)) continue;
    const file = script.url.slice(at + 1).replace(/\?.*$/, '');
    const { scriptSource } = await session.post('Debugger.getScriptSource', {
      scriptId: script.scriptId
    });
    const spans = spansOf(script.functions).filter((s) => !isTransformArtifact(scriptSource, s));
    const lineOf = sourceLineResolver(scriptSource);
    for (const s of nestedKeys(spans))
      if (s.count > 0)
        pins[`${file} :: ${s.key}`] = { file, line: lineOf(s.start), name: s.key, count: s.count };
  }
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
  const state = buildScenario(sc.spec);
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
    const functions = await functionPins(session, coverage);
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
