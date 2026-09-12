import { WORK_PINS } from './flag';

export { WORK_PINS };

interface Tally {
  count: number;
  bytes: number;
}

interface SteppedEngine {
  processGameTurn(): { success: boolean; errors?: string[] };
  getGameState(): { turn: number };
  countPhases?(counts: Record<string, number> | null): void;
}

interface StepContext {
  engine: SteppedEngine;
  paused: () => boolean;
  tickMs: number;
  flushLog: () => void;
  fail: (error: string) => void;
}

interface WorkPinsRequest {
  op: 'step' | 'stats';
  id: number;
  ticks?: number;
}

const EPOCH_MS = 1_700_000_000_000;
const encoder = new TextEncoder();
let clockMs = 0;
let messages: Record<string, Tally> = {};
let phases: Record<string, number> = {};

if (WORK_PINS) {
  performance.now = () => clockMs;
  Date.now = () => EPOCH_MS + clockMs;
}

export function tallyMessage(msg: unknown): void {
  const m = msg as { kind?: string; type?: string };
  const t = (messages[String(m.kind ?? m.type)] ??= { count: 0, bytes: 0 });
  t.count++;
  t.bytes += encoder.encode(JSON.stringify(msg)).byteLength;
}

function step(ticks: number, ctx: StepContext): void {
  for (let i = 0; i < ticks && !ctx.paused(); i++) {
    clockMs += ctx.tickMs;
    const r = ctx.engine.processGameTurn();
    if (!r.success) {
      ctx.fail('tick failed: ' + (r.errors ?? []).join('; '));
      break;
    }
  }
  ctx.flushLog();
}

function takeStats(engine: SteppedEngine) {
  const taken = { turn: engine.getGameState().turn, phases, messages };
  phases = {};
  messages = {};
  engine.countPhases?.(phases);
  return taken;
}

export function handleWorkPins(msg: WorkPinsRequest, ctx: StepContext): void {
  if (msg.op === 'step') step(msg.ticks ?? 0, ctx);
  const reply = msg.op === 'stats' ? takeStats(ctx.engine) : { turn: ctx.engine.getGameState().turn };
  (self as unknown as Worker).postMessage({ kind: 'workPins', id: msg.id, ...reply });
}
