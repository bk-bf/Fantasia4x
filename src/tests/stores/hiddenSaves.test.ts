import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installFakeIndexedDb } from './fakeIndexedDb';
import { purgeable, settleHidden, type HiddenSave } from '$lib/stores/hiddenSaves';

vi.mock('$app/environment', () => ({
  browser: true,
  dev: true,
  building: false,
  version: 'test'
}));

const blob = (c: string) => c.repeat(64);
const hiddenSave = (id: string, sent?: string): HiddenSave => ({
  id,
  meta: { hidden: { at: 1, ...(sent ? { blob: sent, entry: `entry-${id}` } : {}) } }
});

describe('which hidden saves are purged', () => {
  it('purges a hidden save only once the store has confirmed the blob it was sent as', () => {
    const saves = [
      hiddenSave('confirmed', blob('a')),
      hiddenSave('waiting', blob('b')),
      hiddenSave('never-sent'),
      { id: 'visible', meta: {} }
    ];
    expect(purgeable(saves, new Set([blob('a'), blob('c')]))).toEqual(['confirmed']);
    expect(purgeable(saves, new Set())).toEqual([]);
  });

  it('sends a hidden save that never left, and purges nothing when the dev server cannot answer', async () => {
    const purge = vi.fn(async () => {});
    const send = vi.fn();
    const saves = [hiddenSave('sent', blob('a')), hiddenSave('unsent')];
    await expect(
      settleHidden(saves, { stored: () => Promise.reject(new Error('offline')), purge, send })
    ).rejects.toThrow('offline');
    expect(purge).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('unsent');
    expect(
      await settleHidden(saves, { stored: async () => new Set([blob('a')]), purge, send })
    ).toEqual(['sent']);
    expect(purge.mock.calls).toEqual([['sent']]);
  });
});

describe('deleting a save in the game', () => {
  let data: Map<string, unknown>;
  const asked: string[][] = [];
  let confirmed = new Set<string>();

  class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    postMessage({ id }: { id: string }) {
      queueMicrotask(() =>
        this.onmessage?.({ data: { id, blob: blob(id[0]), entry: `entry-${id}` } })
      );
    }
    terminate = vi.fn();
  }

  beforeEach(() => {
    vi.resetModules();
    data = installFakeIndexedDb();
    for (const id of ['alpha', 'bravo', 'charlie']) {
      data.set(`save:${id}`, { turn: 1 });
      data.set(`world:${id}`, [[]]);
      data.set(`meta:${id}`, { cultureName: id, savedAt: id.charCodeAt(0), kind: 'manual' });
      data.set(`log:${id}`, []);
    }
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const { blobs } = JSON.parse(init.body) as { blobs: string[] };
        asked.push(blobs);
        return new Response(JSON.stringify({ stored: blobs.filter((b) => confirmed.has(b)) }));
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    asked.length = 0;
    confirmed = new Set();
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('hides it from the save list, keeps it whole and sends it to the ledger', async () => {
    const sm = await import('$lib/stores/saveManager');
    await sm.hideSaveById('alpha');
    await settle();
    expect((await sm.listSaves()).map((s) => s.id)).toEqual(['charlie', 'bravo']);
    for (const key of ['save', 'world', 'log']) expect(data.has(`${key}:alpha`)).toBe(true);
    expect(data.get('meta:alpha')).toMatchObject({
      hidden: { blob: blob('a'), entry: 'entry-alpha' }
    });
  });

  it('purges a hidden save on the next start once the store has confirmed it, and keeps the rest', async () => {
    const first = await import('$lib/stores/saveManager');
    await first.hideSaveById('alpha');
    await first.hideSaveById('bravo');
    await settle();
    confirmed = new Set([blob('a')]);

    vi.resetModules();
    const next = await import('$lib/stores/saveManager');
    expect((await next.listSaves()).map((s) => s.id)).toEqual(['charlie']);
    await settle();
    expect(asked).toEqual([[blob('a'), blob('b')]]);
    for (const key of ['save', 'world', 'meta', 'log'])
      expect(data.has(`${key}:alpha`)).toBe(false);
    for (const key of ['save', 'world', 'meta', 'log']) expect(data.has(`${key}:bravo`)).toBe(true);
    expect(data.has('save:charlie')).toBe(true);
  });
});
