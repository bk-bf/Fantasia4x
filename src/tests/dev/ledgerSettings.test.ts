import { describe, it, expect } from 'vitest';
import { readLedgerSettings, ledgerSettingsLine, newLedgerSession } from '$lib/dev/ledger';

const store = (values: Record<string, string>) => ({ getItem: (k: string) => values[k] ?? null });

describe('the ledger switches', () => {
  it('capture every two minutes of running by default', () => {
    const s = readLedgerSettings(store({}), false, 'slot', null, 'cafe0123');
    expect(s).toEqual({
      on: true,
      intervalMs: 120_000,
      save: 'slot',
      scenario: null,
      session: 'cafe0123'
    });
    expect(ledgerSettingsLine(s)).toBe('ledger capture=on interval=120s session=cafe0123');
  });

  it('stay off under automation unless switched on', () => {
    expect(readLedgerSettings(store({}), true, null, null, 'cafe0123').on).toBe(false);
    expect(
      readLedgerSettings(store({ 'fantasia4x-ledger': 'on' }), true, null, null, 'cafe0123').on
    ).toBe(true);
    expect(
      readLedgerSettings(store({ 'fantasia4x-ledger': 'off' }), false, null, null, 'cafe0123').on
    ).toBe(false);
  });

  it('take the interval in seconds, never under a minute, zero for no periodic capture, and ignore nonsense', () => {
    const at = (v: string) =>
      readLedgerSettings(store({ 'fantasia4x-ledger-interval': v }), false, null, null, 'cafe0123')
        .intervalMs;
    expect(at('60')).toBe(60_000);
    expect(at('180')).toBe(180_000);
    expect(at('5')).toBe(60_000);
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
    expect(readLedgerSettings(broken, false, null, null, 'cafe0123').intervalMs).toBe(120_000);
  });

  it('name each session with a fresh token', () => {
    const tokens = new Set(Array.from({ length: 50 }, newLedgerSession));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{8}$/);
  });
});
