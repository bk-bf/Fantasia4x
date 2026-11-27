import type { BuildStamp, GameState } from '$lib/game/core/types';
import type { BuildInfo } from './sessionHeader';

export function stampOf(build: BuildInfo | undefined): BuildStamp | undefined {
  if (!build?.sha) return undefined;
  return {
    commit: build.sha,
    branch: build.branch && build.branch !== 'detached' ? build.branch : null,
    dirty: build.dirty
  };
}

export function currentBuild(): BuildStamp | undefined {
  return stampOf(typeof __F4X_BUILD__ === 'undefined' ? undefined : __F4X_BUILD__);
}

export function stampGenerated(state: GameState, build = currentBuild()): GameState {
  return { ...state, generatedBy: build };
}
