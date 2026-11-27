import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import type { GameState } from '$lib/game/core/types';
import type { BuildInfo } from '$lib/dev/sessionHeader';
import { stampOf, stampGenerated } from '$lib/dev/buildStamp';

const BUILD: BuildInfo = {
  commit: 'abc1234',
  sha: 'abc1234def567890abc1234def567890abc12345',
  branch: 'feat/world-maker',
  refs: '',
  dirty: 2,
  serverStarted: '2026-11-27T16:00:00.000Z'
};

afterEach(() => vi.unstubAllGlobals());

describe('the build that generated a world', () => {
  it('is stamped on a new colony with its full commit, branch and dirty count', async () => {
    vi.stubGlobal('__F4X_BUILD__', BUILD);
    const { gameState } = await import('$lib/stores/gameState');
    gameState.resetGame();
    expect((get(gameState) as GameState).generatedBy).toEqual({
      commit: BUILD.sha,
      branch: 'feat/world-maker',
      dirty: 2
    });
  }, 120_000);

  it('replaces the stamp a regenerated world carried over from the one before', () => {
    const old = { commit: 'f'.repeat(40), branch: 'dev', dirty: 0 };
    const next = stampGenerated({ generatedBy: old } as GameState, stampOf(BUILD));
    expect(next.generatedBy?.commit).toBe(BUILD.sha);
  });

  it('is left out when the build was not served from a git checkout', () => {
    expect(stampOf({ ...BUILD, sha: '', commit: 'unknown' })).toBeUndefined();
    expect(stampGenerated({} as GameState, undefined).generatedBy).toBeUndefined();
  });

  it('names no branch for a detached checkout', () => {
    expect(stampOf({ ...BUILD, branch: 'detached' })?.branch).toBeNull();
  });
});
