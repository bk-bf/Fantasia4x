import type { LedgerSettings } from '$lib/game/sim/ledgerCapture';

export const LEDGER_SWITCH = 'fantasia4x-ledger';
export const LEDGER_INTERVAL_SWITCH = 'fantasia4x-ledger-interval';
export const DEFAULT_LEDGER_INTERVAL_S = 120;
export const MIN_LEDGER_INTERVAL_S = 60;

type Reader = { getItem(key: string): string | null };

function read(storage: Reader | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function readLedgerSettings(
  storage: Reader | null,
  automated: boolean,
  save: string | null,
  scenario: string | null,
  session: string
): LedgerSettings {
  const mode = read(storage, LEDGER_SWITCH);
  const raw = read(storage, LEDGER_INTERVAL_SWITCH);
  const seconds = raw === null ? NaN : Number(raw);
  const valid = Number.isFinite(seconds) && seconds >= 0;
  const intervalS = !valid
    ? DEFAULT_LEDGER_INTERVAL_S
    : seconds === 0
      ? 0
      : Math.max(MIN_LEDGER_INTERVAL_S, seconds);
  return {
    on: mode === 'on' || (mode !== 'off' && !automated),
    intervalMs: intervalS * 1000,
    save,
    scenario,
    session
  };
}

export function newLedgerSession(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ledgerSettingsLine(settings: LedgerSettings): string {
  return `ledger capture=${settings.on ? 'on' : 'off'} interval=${settings.intervalMs / 1000}s session=${settings.session}`;
}
