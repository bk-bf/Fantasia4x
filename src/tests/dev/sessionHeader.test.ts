import { describe, it, expect } from 'vitest';
import { sessionHeaderLine, type BuildInfo, type ClientInfo } from '$lib/dev/sessionHeader';
import type { GameState } from '$lib/game/core/types';

const build: BuildInfo = {
  commit: '1fa9ee31',
  sha: '1fa9ee31d5b0c6e34e2f1f6e9a6c1b0a4d3e2f10',
  branch: 'detached',
  refs: 'origin/test/look-perf',
  dirty: 0,
  serverStarted: '2026-11-22T22:00:00.000Z'
};

const client: ClientInfo = {
  shell: 'electron',
  query: '?scenario=large-wilderness',
  switches: 'ground-blend=0',
  gpu: 'ANGLE (Intel, Mesa "Arc")',
  window: '1440x900@2',
  screen: '2880x1800',
  cores: 16,
  memoryGb: 8
};

const row = (n: number) => Array.from({ length: n }, () => ({}));

const gs = {
  turn: 9865,
  worldMap: Array.from({ length: 3 }, () => row(5)),
  pawns: row(5),
  mobs: row(1227),
  buildings: row(40),
  droppedItems: row(12),
  jobs: row(7)
} as unknown as GameState;

describe('sessionHeaderLine', () => {
  const line = sessionHeaderLine(build, '0.1.0', 'debug', true, client, gs, 4);
  const fields = Object.fromEntries(
    [...line.matchAll(/(\w+)=("[^"]*"|\S+)/g)].map((m) => [m[1], m[2]])
  );

  it('opens with the session marker', () => {
    expect(line.startsWith('session ')).toBe(true);
  });

  it('names the build the session ran', () => {
    expect(fields).toMatchObject({
      build: 'detached@1fa9ee31',
      refs: 'origin/test/look-perf',
      dirty: '0',
      mode: 'debug',
      renderer: 'painted',
      query: '?scenario=large-wilderness'
    });
  });

  it('records the machine, the map and the entity counts', () => {
    expect(fields).toMatchObject({
      gpu: `"ANGLE (Intel, Mesa 'Arc')"`,
      window: '1440x900@2',
      map: '5x3',
      pawns: '5',
      mobs: '1227',
      buildings: '40',
      drops: '12',
      jobs: '7',
      turn: '9865',
      speed: '4x'
    });
  });
});
