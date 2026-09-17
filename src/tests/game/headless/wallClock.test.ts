import { describe, it, expect, vi } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

describe('a headless session', () => {
  it('reads no wall clock while it ticks', async () => {
    const session = new HeadlessSession();
    await session.start(buildScenario({ seed: 7, map: { w: 16, h: 16 }, pawns: [{ count: 3 }] }));
    const now = vi.spyOn(performance, 'now');
    try {
      session.tick(20);
      expect(now).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });
});
