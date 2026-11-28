import type { GameState } from '../core/types';
import { TRANSIENT_TILE_KEYS } from '../headless/snapshot';
import { HASH_HEAD, SAVE_HEAD, snapshotBody } from '../../../../tools/ledger/canonical.mjs';

export type LedgerReason = 'session' | 'manual' | 'periodic' | 'deleted';

export interface LedgerSettings {
  on: boolean;
  intervalMs: number;
  save: string | null;
  scenario: string | null;
  session: string;
}

export interface LedgerCaptureMeta {
  captureId: string;
  session: string;
  sessionAt: string;
  reason: LedgerReason;
  at: string;
  ms: number;
  turn: number;
  seed: number;
  map: string;
  pawns: number;
  mobs: number;
  speed: number | null;
  save: string | null;
  scenario: string | null;
  generatedBy: string | null;
  savedBy: string | null;
}

export interface LedgerUploadMeta extends LedgerCaptureMeta {
  worldId: string;
  blob: string;
  bytes: number;
  packMs: number;
}

export interface LedgerReceipt {
  captureId: string;
  entry: string | null;
}

export interface LedgerDeps {
  state: () => GameState;
  speed: () => number;
  now: () => number;
  clock: () => Date;
  savedBy: string | null;
  log: (turn: number, message: string) => void;
  post: (save: Uint8Array, meta: LedgerCaptureMeta) => Promise<LedgerReceipt>;
}

export const LEDGER_ENDPOINT = '/api/ledger/save';
export const LEDGER_META_HEADER = 'x-f4x-ledger';
export const LEDGER_DROPPED = 503;

export function ledgerFailedLine(captureId: string, err: unknown): string {
  const why = err instanceof Error ? err.message : String(err);
  return `ledger failed cap=${captureId} error="${why.replace(/"/g, "'")}"`;
}

const TILE_DROP: ReadonlySet<string> = new Set(TRANSIENT_TILE_KEYS);
const encoder = new TextEncoder();
const MIN_CAPACITY = 1 << 16;

class ByteSink {
  private bytes: Uint8Array;
  private at = 0;

  constructor(hint: number) {
    this.bytes = new Uint8Array(Math.max(MIN_CAPACITY, Math.ceil(hint)));
  }

  push(text: string): void {
    let rest = text;
    for (;;) {
      const { read, written } = encoder.encodeInto(rest, this.bytes.subarray(this.at));
      this.at += written;
      if (read === rest.length) return;
      rest = rest.slice(read);
      this.grow(rest.length * 3);
    }
  }

  private grow(need: number): void {
    const next = new Uint8Array(Math.max(this.bytes.length * 2, this.at + need));
    next.set(this.bytes.subarray(0, this.at));
    this.bytes = next;
  }

  done(): Uint8Array {
    return this.bytes.subarray(0, this.at);
  }
}

export function encodeSave(dynamic: unknown, world: unknown, sizeHint = 0): Uint8Array {
  const sink = new ByteSink(sizeHint);
  sink.push(HASH_HEAD);
  snapshotBody({ dynamic, world }, (chunk) => sink.push(chunk), TILE_DROP);
  return sink.done();
}

export function encodeState(state: GameState, sizeHint = 0): Uint8Array {
  const { worldMap, ...dynamic } = state;
  return encodeSave(dynamic, worldMap, sizeHint);
}

export const saveSize = (save: Uint8Array): number =>
  save.length - HASH_HEAD.length + SAVE_HEAD.length;

export function saveBody(save: Uint8Array): Uint8Array[] {
  return [encoder.encode(SAVE_HEAD), save.subarray(HASH_HEAD.length)];
}

function mapSize(state: GameState): string {
  return `${state.worldMap?.[0]?.length ?? 0}x${state.worldMap?.length ?? 0}`;
}

const OFF: LedgerSettings = { on: false, intervalMs: 0, save: null, scenario: null, session: '' };

export class LedgerCapturer {
  private settings = OFF;
  private runMs = 0;
  private seq = 0;
  private sessionAt = '';
  private posting: Promise<void> = Promise.resolve();
  private lastSize = 0;

  constructor(private deps: LedgerDeps) {}

  configure(settings: LedgerSettings): void {
    this.settings = settings;
    this.runMs = 0;
    this.seq = 0;
    this.sessionAt = '';
  }

  reset(): void {
    this.configure(OFF);
  }

  ran(ms: number): void {
    const { on, intervalMs } = this.settings;
    if (!on || intervalMs <= 0) return;
    this.runMs += ms;
    if (this.runMs < intervalMs) return;
    this.runMs = 0;
    void this.capture('periodic');
  }

  capture(reason: LedgerReason, save?: string | null): Promise<void> {
    if (!this.settings.on) return Promise.resolve();
    const at = this.deps.clock().toISOString();
    const start = this.deps.now();
    const state = this.deps.state();
    const encoded = encodeState(state, this.lastSize * 1.05);
    const ms = Math.round(this.deps.now() - start);
    this.lastSize = encoded.length;
    const { session } = this.settings;
    if (this.seq === 0) this.sessionAt = at;
    const meta: LedgerCaptureMeta = {
      captureId: `${session}-${this.seq++}`,
      session,
      sessionAt: this.sessionAt,
      reason,
      at,
      ms,
      turn: state.turn,
      seed: state.seed,
      map: mapSize(state),
      pawns: state.pawns?.length ?? 0,
      mobs: state.mobs?.length ?? 0,
      speed: this.deps.speed(),
      save: save ?? this.settings.save,
      scenario: this.settings.scenario,
      generatedBy: state.generatedBy?.commit ?? null,
      savedBy: this.deps.savedBy
    };
    this.deps.log(
      state.turn,
      `ledger save cap=${meta.captureId} reason=${reason} turn=${state.turn} at=${at} ms=${ms} speed=${meta.speed}x bytes=${saveSize(encoded)}`
    );
    this.posting = this.posting.then(() =>
      this.deps.post(encoded, meta).then(
        () => {},
        (err: unknown) => this.deps.log(state.turn, ledgerFailedLine(meta.captureId, err))
      )
    );
    return this.posting;
  }
}
