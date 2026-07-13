// Transient ranged-projectile channel: combatService pushes one entry per resolved shot; GameCanvas
// lerps it from→to for WorldEffectsLayer. The hit is already resolved hitscan — purely cosmetic.
// Entries self-prune after their duration even when nothing reads them.
import { writable } from 'svelte/store';
import { animNow } from './animClock';
import type { CombatProjectileRequest } from '$lib/game/core/logSink';

export type { CombatProjectileRequest };

export interface ProjectileEvent extends CombatProjectileRequest {
  id: string;
  spawnTime: number;
  /** Travel time in ms — distance-scaled so projectile speed is roughly constant. */
  durationMs: number;
}

/** ms per tile of travel, clamped to a visible-but-snappy window. */
const MS_PER_TILE = 26;
const MIN_FLIGHT_MS = 120;
const MAX_FLIGHT_MS = 460;
/** Extra hang time after arrival so the impact puff is visible before the entry prunes. */
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
