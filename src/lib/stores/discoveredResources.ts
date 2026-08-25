import { writable, get } from 'svelte/store';
import { gameState } from './gameState';
import { uiState } from './uiState';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { WorldTile } from '$lib/game/core/types';

export interface ResourceRow {
  id: string;
  name: string;
  color: string;
  type: string;
  amount: number;
  x: number;
  y: number;
}

export const discoveredResources = writable<ResourceRow[]>([]);

function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

function buildRows(worldMap: WorldTile[][]): ResourceRow[] {
  const out: ResourceRow[] = [];
  for (const line of worldMap ?? []) {
    for (const t of line) {
      if (!t.discovered || !t.resources) continue;
      for (const id in t.resources) {
        const amount = t.resources[id];
        if (amount <= 0) continue;
        const def = resourceObjectService.getById(id);
        out.push({
          id,
          name: def?.displayName ?? id.replace(/_/g, ' '),
          color: def?.fg ? rgb(def.fg) : 'var(--text-dim)',
          type: def?.lair ? 'lair' : (def?.interaction?.workCategory ?? '—'),
          amount,
          x: t.x,
          y: t.y
        });
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.x - b.x || a.y - b.y);
  return out;
}

const REFRESH_TURNS = 15;
let builtBucket = -1;
let scheduled = false;

function scheduleIdle(fn: () => void) {
  if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(fn, { timeout: 500 });
  else if (typeof setTimeout !== 'undefined') setTimeout(fn, 0);
  else fn();
}

function rebuildNow() {
  const s = get(gameState);
  builtBucket = Math.floor((s.turn ?? 0) / REFRESH_TURNS);
  discoveredResources.set(buildRows(s.worldMap ?? []));
}

let exploreOpen = false;

function maybeScheduleRebuild(turn: number) {
  if (!exploreOpen) return;
  const bucket = Math.floor(turn / REFRESH_TURNS);
  if (bucket === builtBucket || scheduled) return;
  scheduled = true;
  scheduleIdle(() => {
    scheduled = false;
    rebuildNow();
  });
}

gameState.subscribe((s) => maybeScheduleRebuild(s.turn ?? 0));

uiState.subscribe((s) => {
  const open = s.currentScreen === 'exploration';
  if (open && !exploreOpen) {
    const bucket = Math.floor((get(gameState).turn ?? 0) / REFRESH_TURNS);
    if (bucket !== builtBucket) rebuildNow();
  }
  exploreOpen = open;
});

export function ensureDiscoveredResources(): void {
  if (builtBucket === -1) rebuildNow();
}
