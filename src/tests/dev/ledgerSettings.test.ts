import { describe, it, expect } from 'vitest';
import { readLedgerSettings, ledgerSettingsLine } from '$lib/dev/ledger';

const store = (values: Record<string, string>) => ({ getItem: (k: string) => values[k] ?? null });

describe('the ledger switches', () => {
  it('capture every two minutes of running by default', () => {
    const s = readLedgerSettings(store({}), false, 'slot', null);
    expect(s).toEqual({ on: true, intervalMs: 120_000, save: 'slot', scenario: null });
    expect(ledgerSettingsLine(s)).toBe('ledger capture=on interval=120s');
  });

  it('stay off under automation unless switched on', () => {
    expect(readLedgerSettings(store({}), true, null, null).on).toBe(false);
    expect(readLedgerSettings(store({ 'fantasia4x-ledger': 'on' }), true, null, null).on).toBe(
      true
    );
    expect(readLedgerSettings(store({ 'fantasia4x-ledger': 'off' }), false, null, null).on).toBe(
      false
    );
  });

  it('take the interval in seconds, zero for no periodic capture, and ignore nonsense', () => {
    const at = (v: string) =>
      readLedgerSettings(store({ 'fantasia4x-ledger-interval': v }), false, null, null).intervalMs;
    expect(at('60')).toBe(60_000);
    expect(at('0')).toBe(0);
    expect(at('soon')).toBe(120_000);
    expect(at('-5')).toBe(120_000);
  });

  it('read as defaults when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      }
    };
    expect(readLedgerSettings(broken, false, null, null).intervalMs).toBe(120_000);
  });
});
