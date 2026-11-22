import { writable, get } from 'svelte/store';
import { gameState } from './gameState';
import { uiState } from './uiState';
import { buildResourceRows, type ResourceRow } from './resourceRows';
import type { GameState } from '$lib/game/core/types';

export type { ResourceRow };

export const discoveredResources = writable<ResourceRow[]>([]);

const REBUILD_GAP_FACTOR = 2;
let built = false;
let builtMap: GameState['worldMap'] | undefined;
let builtRev = 0;
let nextRebuildAt = 0;
let scheduled = false;

function resourceRev(s: GameState): number {
  return (s as { _resourceRev?: number })._resourceRev ?? 0;
}

function isStale(s: GameState): boolean {
  return !built || s.worldMap !== builtMap || resourceRev(s) !== builtRev;
}

function scheduleIdle(fn: () => void, delayMs: number) {
  const idle = () =>
    typeof requestIdleCallback !== 'undefined' ? requestIdleCallback(fn, { timeout: 500 }) : fn();
  if (typeof setTimeout !== 'undefined') setTimeout(idle, delayMs);
  else fn();
}

function rebuildNow() {
  const s = get(gameState);
  built = true;
  builtMap = s.worldMap;
  builtRev = resourceRev(s);
  const start = performance.now();
  discoveredResources.set(buildResourceRows(s.worldMap ?? []));
  const end = performance.now();
  nextRebuildAt = end + REBUILD_GAP_FACTOR * (end - start);
}

let exploreOpen = false;

function maybeScheduleRebuild(s: GameState) {
  if (!exploreOpen || scheduled || !isStale(s)) return;
  scheduled = true;
  scheduleIdle(
    () => {
      scheduled = false;
      rebuildNow();
    },
    Math.max(0, nextRebuildAt - performance.now())
  );
}

gameState.subscribe(maybeScheduleRebuild);

uiState.subscribe((s) => {
  const open = s.currentScreen === 'exploration';
  if (open && !exploreOpen) {
    if (isStale(get(gameState))) rebuildNow();
  }
  exploreOpen = open;
});

export function ensureDiscoveredResources(): void {
  if (!built) rebuildNow();
}
