import { describe, it, expect } from 'vitest';
import { buildResourceOverlay } from '$lib/webgl/fantasia-world';
import { GROWTH_STAGES, RESOURCE_VISIBLE_GROWTH } from '$lib/game/core/rules/world/growthStages';
import type { WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    subType: 'grass',
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

function spriteFor(over: Partial<WorldTile>) {
  const { short, tall } = buildResourceOverlay([[tile(over)]]);
  const s = short.getTile(0, 0);
  const t = tall.getTile(0, 0);
  const drawn = s && s.char !== ' ' ? s : t && t.char !== ' ' ? t : undefined;
  return drawn ? { char: drawn.char, scale: drawn.scale ?? 1 } : undefined;
}

describe('a regrowing plant is drawn at its growth stage', () => {
  it('draws nothing at all below the first stage', () => {
    expect(
      spriteFor({
        resources: { grass_patch: 0 },
        growth: { grass_patch: RESOURCE_VISIBLE_GROWTH - 1 }
      })
    ).toBeUndefined();
  });

  it('steps through the three sizes as it grows', () => {
    const at = (growth: number) =>
      spriteFor({ resources: { grass_patch: 3 }, growth: { grass_patch: growth } })?.scale;
    expect(at(30)).toBe(GROWTH_STAGES[0].scale);
    expect(at(60)).toBe(GROWTH_STAGES[1].scale);
    expect(at(90)).toBe(GROWTH_STAGES[2].scale);
    expect(at(100)).toBe(1);
  });

  it('never shrinks a tree or a bush, however stripped it is', () => {
    const stripped = spriteFor({
      subType: 'forest',
      resources: { pine_tree: 3 },
      growth: { pine_tree: 35 }
    });
    const grown = spriteFor({
      subType: 'forest',
      resources: { pine_tree: 3 },
      growth: { pine_tree: 100 }
    });
    expect(stripped?.scale).toBe(1);
    expect(grown?.scale).toBe(1);

    const bush = (growth: number) =>
      spriteFor({ subType: 'bush', resources: { berry_bush: 3 }, growth: { berry_bush: growth } })
        ?.scale;
    expect(bush(35)).toBe(1);
    expect(bush(100)).toBe(1);
  });

  it('keeps a def render scale and multiplies the stage into it', () => {
    const dug = spriteFor({ subType: 'dirt', resources: { barrow_cache: 1 } });
    expect(dug?.scale).toBe(0.6);
  });
});
