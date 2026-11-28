import type { GlyphName } from '$lib/pixelArt/glyphs';
import type { DesignationType } from '$lib/game/core/types.js';

export interface TagVerb {
  label: string;
  glyph?: GlyphName;
  quiet?: boolean;
  onClick: () => void;
}

export interface VerbTagModel {
  what: string;
  count: number;
  note?: string;
  verbs: TagVerb[];
  tiles: { x: number; y: number }[];
  onClear: () => void;
}

const VERB: Partial<Record<DesignationType, [string, GlyphName]>> = {
  woodcut: ['Cut', 'axe'],
  forage: ['Forage', 'sprout'],
  mine: ['Mine', 'hammer'],
  dig: ['Dig', 'hammer']
};

export function designationVerb(
  type: DesignationType | undefined,
  lair: boolean
): [string, GlyphName] {
  if (lair) return ['Destroy', 'sword'];
  return (type && VERB[type]) || ['Harvest', 'sprout'];
}

export function keyTiles(keys: Iterable<string>): { x: number; y: number }[] {
  return [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
}

export function tagAnchor(
  tiles: { x: number; y: number }[],
  view: { x: number; y: number; tw: number; th: number; w: number; h: number },
  tagH: number
): { left: number; top: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.y > maxY) maxY = t.y;
  }
  const left = (minX - view.x) * view.tw;
  const below = (maxY + 1 - view.y) * view.th + 6;
  const above = (minY - view.y) * view.th - 6 - tagH;
  const top = below + tagH > view.h - 8 && above >= 8 ? above : below;
  return {
    left: Math.round(Math.max(8, Math.min(left, view.w - 8))),
    top: Math.round(Math.max(8, Math.min(top, view.h - tagH - 8)))
  };
}
