import type { ProjectileEvent } from '$lib/stores/fx/projectiles';
import { flight, flightLife, flightS, type Flight, type Struck } from '$lib/pixelArt/fx/flight';
import type { StatusKind } from '$lib/pixelArt/fx/marks';
import type { HitKind, ShotKind } from '$lib/pixelArt/fx/shots';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { figureAt, struckAt } from './figure';

const KINDS: Record<ShotKind, [HitKind, StatusKind?]> = {
  arrow: ['thud'],
  bolt: ['thud'],
  spear: ['thud'],
  stone: ['dust'],
  fireball: ['burst', 'burn'],
  frostbolt: ['shatter', 'frost'],
  spark: ['flash', 'shock']
};

interface Live {
  f: Flight;
  life: number;
  on: Struck | null;
}

const live = new Map<number, Live>();

function launch(e: ProjectileEvent, r: WebGLRenderer | null): Live {
  const kind = (e.effect in KINDS ? e.effect : 'arrow') as ShotKind;
  const [hit, status] = KINDS[kind];
  const from = figureAt(r, e.fromX, e.fromY, e.fromX, e.fromY);
  const to = figureAt(r, e.toX, e.toY, e.toX, e.toY);
  const a = [from.x + 12 * Math.sign(to.x - from.x), from.y - 22] as const;
  const b = [to.x, to.y - 14] as const;
  return { f: { kind, hit, a, b, status }, life: flightLife(a, b, !!status), on: null };
}

export function drawFlights(
  p: FxPainter,
  r: WebGLRenderer | null,
  list: readonly ProjectileEvent[],
  now: number
): void {
  const seen = new Set<number>();
  for (const e of list) {
    seen.add(e.id);
    let l = live.get(e.id);
    if (!l) {
      l = launch(e, r);
      live.set(e.id, l);
    }
    const u = (now - e.spawnTime) / 1000;
    if (u > l.life) continue;
    if (l.f.status && !l.on && u >= flightS(l.f.a, l.f.b)) {
      const to = figureAt(r, e.toX, e.toY, e.toX, e.toY);
      l.on = struckAt(r, e.toX, e.toY, to);
    }
    flight(p, l.f, u, now / 1000, l.on);
  }
  for (const id of live.keys()) if (!seen.has(id)) live.delete(id);
}

export function flying(list: readonly ProjectileEvent[], now: number): boolean {
  return list.some((e) => (now - e.spawnTime) / 1000 <= (live.get(e.id)?.life ?? 4));
}
