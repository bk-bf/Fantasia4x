import { describe, it, expect, vi } from 'vitest';
import { settle, stubBrowser } from './browserStubs';

vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test'
}));

const OLDER = '1700000000000-aaaaa';
const DYING = '1800000000000-bbbbb';

const store = new Map<string, unknown>([
  [`save:${OLDER}`, { turn: 90000 }],
  [`world:${OLDER}`, [[]]],
  [`meta:${OLDER}`, { kind: 'manual', cultureName: 'Older colony' }],
  [`log:${OLDER}`, []],
  [`save:${DYING}`, { turn: 4000 }],
  [`meta:${DYING}`, { kind: 'auto', cultureName: 'Colony that just died' }],
  ['debug-log', []]
]);

stubBrowser(store);

describe('RESTART on the game-over screen', () => {
  it("removes the dead colony's save and keeps every other colony's", async () => {
    const sm = await import('$lib/stores/saveManager');
    const { gameState } = await import('$lib/stores/gameState');
    sm.setActiveSave(DYING);

    gameState.resetGame();
    await settle();

    expect(store.has(`save:${OLDER}`)).toBe(true);
    expect(store.has(`meta:${OLDER}`)).toBe(true);
    expect(store.has(`save:${DYING}`)).toBe(false);
    expect(store.has(`meta:${DYING}`)).toBe(false);
    expect(sm.ensureActiveSave()).not.toBe(DYING);
  }, 120_000);
});
