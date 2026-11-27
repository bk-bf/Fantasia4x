import { execFileSync } from 'node:child_process';
import type { GameState } from '../../src/lib/game/core/types';

const git = (...args: string[]): string => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

function branchName(): string {
  if (process.env.PROF_BRANCH) return process.env.PROF_BRANCH;
  const local = git('symbolic-ref', '--short', '-q', 'HEAD');
  if (local) return local;
  const remote = git('branch', '-r', '--points-at', 'HEAD', '--format=%(refname:lstrip=3)')
    .split('\n')
    .filter((b) => b && b !== 'HEAD');
  return remote[0] ?? 'detached';
}

export type World = { turn: number; seed: number; map: string };

export const worldOf = (state: GameState): World => ({
  turn: state.turn,
  seed: state.seed,
  map: `${state.worldMap[0]?.length ?? 0}x${state.worldMap.length}`
});

export function provenance(start: World, end: GameState) {
  return {
    commit: git('rev-parse', 'HEAD'),
    branch: branchName(),
    dirty: git('status', '--porcelain', '--untracked-files=no', '--', '.', ':!tools/tickprof') !== '',
    turn: start.turn,
    endTurn: end.turn,
    seed: start.seed,
    map: start.map,
    pawns: end.pawns.length,
    mobs: (end.mobs ?? []).length
  };
}
