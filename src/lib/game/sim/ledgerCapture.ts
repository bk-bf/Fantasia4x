import type { GameState } from '../core/types';

export type LedgerReason = 'session' | 'manual' | 'periodic';

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
  reason: LedgerReason;
  at: string;
  ms: number;
  turn: number;
  seed: number;
  map: string;
  pawns: number;
  mobs: number;
  speed: number;
  save: string | null;
  scenario: string | null;
  generatedBy: string | null;
  savedBy: string | null;
}

export interface LedgerReceipt {
  captureId: string;
  entry: string;
}

export interface LedgerDeps {
  state: () => GameState;
  speed: () => number;
  now: () => number;
  clock: () => Date;
  savedBy: string | null;
  log: (turn: number, message: string) => void;
  post: (body: Blob, meta: LedgerCaptureMeta) => Promise<LedgerReceipt>;
}

export const LEDGER_ENDPOINT = '/api/ledger/save';
export const LEDGER_META_HEADER = 'x-f4x-ledger';

export function serializeSave(state: GameState): Blob {
  const { worldMap, ...dynamic } = state;
  const parts = ['{"v":1,"dynamic":', JSON.stringify(dynamic), ',"world":['];
  for (let y = 0; y < worldMap.length; y++) {
    if (y) parts.push(',');
    parts.push(JSON.stringify(worldMap[y]));
  }
  parts.push(']}');
  return new Blob(parts, { type: 'application/json' });
}

export async function postLedgerSave(body: Blob, meta: LedgerCaptureMeta): Promise<LedgerReceipt> {
  const res = await fetch(LEDGER_ENDPOINT, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      [LEDGER_META_HEADER]: encodeURIComponent(JSON.stringify(meta))
    }
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as LedgerReceipt;
}

function mapSize(state: GameState): string {
  return `${state.worldMap?.[0]?.length ?? 0}x${state.worldMap?.length ?? 0}`;
}

const OFF: LedgerSettings = { on: false, intervalMs: 0, save: null, scenario: null, session: '' };

export class LedgerCapturer {
  private settings = OFF;
  private runMs = 0;
  private seq = 0;

  constructor(private deps: LedgerDeps) {}

  configure(settings: LedgerSettings): void {
    this.settings = settings;
    this.runMs = 0;
    this.seq = 0;
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
    const body = serializeSave(state);
    const ms = Math.round(this.deps.now() - start);
    const { session } = this.settings;
    const meta: LedgerCaptureMeta = {
      captureId: `${session}-${this.seq++}`,
      session,
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
      `ledger save cap=${meta.captureId} reason=${reason} turn=${state.turn} at=${at} ms=${ms} speed=${meta.speed}x bytes=${body.size}`
    );
    return this.deps.post(body, meta).then(
      () => {},
      (err: unknown) => {
        const why = err instanceof Error ? err.message : String(err);
        this.deps.log(
          state.turn,
          `ledger failed cap=${meta.captureId} error="${why.replace(/"/g, "'")}"`
        );
      }
    );
  }
}
