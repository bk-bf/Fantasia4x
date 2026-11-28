import type { SpriteLight } from './manifest.js';
import type { PointLight, TileRect } from './lightGrade.js';

export interface EmitSource {
  getTile(x: number, y: number): { painted?: { emit?: SpriteLight } } | undefined;
}

export const SPRITE_LIGHT_MARGIN = 4;

function nearView(l: PointLight, view: TileRect): boolean {
  const m = l.radius + SPRITE_LIGHT_MARGIN;
  return (
    l.x >= view.x - m &&
    l.x <= view.x + view.w + m &&
    l.y >= view.y - m &&
    l.y <= view.y + view.h + m
  );
}

export function resolveSpriteLights(
  lights: readonly PointLight[],
  layers: ReadonlyArray<EmitSource | null>,
  view: TileRect
): PointLight[] {
  return lights.map((l) => {
    if (!nearView(l, view)) return l;
    let emit: SpriteLight | undefined;
    for (const g of layers) {
      emit = g?.getTile(l.x, l.y)?.painted?.emit;
      if (emit !== undefined) break;
    }
    if (!emit) return l;
    return {
      ...l,
      color: emit.col,
      flicker: emit.flicker === true,
      art: { x: emit.x, y: emit.y, rad: emit.rad, night: emit.night === true }
    };
  });
}
