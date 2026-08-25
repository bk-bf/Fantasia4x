import { writable } from 'svelte/store';
import { animNow } from './animClock';
import type { CombatProjectileRequest } from '$lib/game/core/util/logSink';

export type { CombatProjectileRequest };

export interface ProjectileEvent extends CombatProjectileRequest {
  id: string;
  spawnTime: number;
  durationMs: number;
}

const MS_PER_TILE = 26;
const MIN_FLIGHT_MS = 120;
const MAX_FLIGHT_MS = 460;
export const PROJECTILE_IMPACT_MS = 180;

let _seq = 0;

function createProjectileStore() {
  const { subscribe, update } = writable<ProjectileEvent[]>([]);

  return {
    subscribe,
    push(req: CombatProjectileRequest) {
      const now = animNow();
      const dist = Math.hypot(req.toX - req.fromX, req.toY - req.fromY);
      const durationMs = Math.max(MIN_FLIGHT_MS, Math.min(MAX_FLIGHT_MS, dist * MS_PER_TILE));
      update((list) => {
        const live = list.filter((e) => now - e.spawnTime < e.durationMs + PROJECTILE_IMPACT_MS);
        live.push({ ...req, id: `proj-${now}-${_seq++}`, spawnTime: now, durationMs });
        return live;
      });
    },
    clear() {
      update(() => []);
    }
  };
}

export const projectiles = createProjectileStore();
