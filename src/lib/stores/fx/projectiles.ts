import { animNow } from './animClock';
import type { CombatProjectileRequest } from '$lib/game/core/util/logSink';

export type { CombatProjectileRequest };

export interface ProjectileEvent extends CombatProjectileRequest {
  id: number;
  spawnTime: number;
}

const MAX_LIFE_MS = 4000;
const MAX_ACTIVE = 80;

function createProjectiles() {
  let list: ProjectileEvent[] = [];
  let seq = 0;

  return {
    push(req: CombatProjectileRequest): void {
      const now = animNow();
      list = list.filter((e) => now - e.spawnTime < MAX_LIFE_MS);
      list.push({ ...req, id: seq++, spawnTime: now });
      if (list.length > MAX_ACTIVE) list = list.slice(list.length - MAX_ACTIVE);
    },
    live(now: number): readonly ProjectileEvent[] {
      if (list.length && now - list[0].spawnTime >= MAX_LIFE_MS)
        list = list.filter((e) => now - e.spawnTime < MAX_LIFE_MS);
      return list;
    },
    clear(): void {
      list = [];
    }
  };
}

export const projectiles = createProjectiles();
