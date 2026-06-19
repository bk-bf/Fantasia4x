// Transient ranged-projectile channel.
//
// combatService (systems layer) pushes one projectile per resolved ranged shot here, carrying
// the shooter tile, the target tile, and a particle `effect` (from the ammo/weapon). GameCanvas
// reads the in-flight projectiles every animation frame, lerps each from→to by elapsed/duration,
// and emits a screen-space ProjectileOverlay that WorldEffectsLayer renders as a travelling
// particle + impact puff. The hit is already resolved hitscan — this is purely cosmetic.
//
// Mirrors `attackLunges`/`combatFeedback` but keyed by a unique shot id (many can be in flight),
// and the travel DURATION scales with distance so projectile SPEED is roughly constant. Entries
// self-prune after their duration so the list never grows unbounded even when nothing reads it.
import { writable } from 'svelte/store';
import type { CombatProjectileRequest } from '$lib/game/core/logSink';

export type { CombatProjectileRequest };

export interface ProjectileEvent extends CombatProjectileRequest {
  id: string;
  /** Wall-clock spawn time (Date.now); drives the from→to interpolation. */
  spawnTime: number;
  /** Travel time in ms (distance-scaled, so speed is constant across short and long shots). */
  durationMs: number;
}

/** ms a projectile spends per tile of travel, clamped to a visible-but-snappy window. */
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
    /** Record a projectile in flight. */
    push(req: CombatProjectileRequest) {
      const now = Date.now();
      const dist = Math.hypot(req.toX - req.fromX, req.toY - req.fromY);
      const durationMs = Math.max(MIN_FLIGHT_MS, Math.min(MAX_FLIGHT_MS, dist * MS_PER_TILE));
      update((list) => {
        // Prune anything past its flight + impact window, then add the new shot.
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
