import { describe, it, expect, vi } from 'vitest';
import { settle, stubBrowser } from './browserStubs';
import type { LedgerSettings } from '$lib/game/sim/ledgerCapture';

vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test'
}));

stubBrowser(new Map<string, unknown>([['debug-log', []]]));

describe('ledger sessions in the dev build', () => {
  it('give the world the player plays one session capture, and RESTART a session of its own', async () => {
    const { gameState } = await import('$lib/stores/gameState');
    const { simWorkerBridge } = await import('$lib/game/sim/simWorkerClient');
    const sessions: LedgerSettings[] = [];
    const captures: string[] = [];
    vi.spyOn(simWorkerBridge, 'ledger').mockImplementation((s) => void sessions.push(s));
    vi.spyOn(simWorkerBridge, 'ledgerCapture').mockImplementation((r) => void captures.push(r));

    gameState.startGame('new');
    gameState.startAutoTurns();
    await settle();
    expect(captures).toEqual([]);

    gameState.setMapSize(48, 48);
    gameState.regenWorld(1234);
    await settle();
    expect(captures).toEqual(['session']);
    expect(sessions).toHaveLength(1);

    gameState.resetGame();
    await settle();
    gameState.stopAutoTurns();
    expect(captures).toEqual(['session', 'session']);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].session).not.toBe(sessions[0].session);
    expect(sessions.map((s) => s.session)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{8}$/)])
    );
  }, 120_000);
});
