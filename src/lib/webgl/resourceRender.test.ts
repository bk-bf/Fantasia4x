import { describe, it, expect } from 'vitest';
import { buildResourceOverlay } from './fantasia-world';
import type { GameGrid } from './game-grid';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return { x: 0, y: 0, walkable: true, subType: 'grass', resources: {} as Record<string, number>, ...over } as WorldTile;
}

// buildResourceOverlay now splits into a short (beneath entities) and tall (trees, above entities)
// grid. Tests don't care which layer a resource lands in — just resolve from whichever has the cell.
function painted(grids: { short: GameGrid; tall: GameGrid }, x = 0, y = 0) {
  const s = grids.short.getTile(x, y)?.char;
  if (s && s !== ' ') return s;
  return grids.tall.getTile(x, y)?.char;
}

describe('crop growth-stage rendering', () => {
  const wheat = resourceObjectService.getById('crop_wheat')!;
  it('crop_wheat resolves to the 4 generic growth stages', () => {
    expect(wheat.growthChars?.length).toBe(4);
  });
  it('young crop → seed stage, ripe crop → harvest stage', () => {
    const seedG = buildResourceOverlay([[tile({ resources: { crop_wheat: 0 }, growth: { crop_wheat: 5 } })]]);
    expect(painted(seedG)).toBe(wheat.growthChars![0]); // seed
    const ripeG = buildResourceOverlay([[tile({ resources: { crop_wheat: 0 }, growth: { crop_wheat: 95 } })]]);
    expect(painted(ripeG)).toBe(wheat.growthChars![3]); // harvest
  });
});

describe('seasonal plant rendering', () => {
  const flowers = resourceObjectService.getById('wildflower_patch')!;
  it('wildflower_patch has per-season pools', () => {
    expect(flowers.seasonChars?.summer?.length).toBeGreaterThan(0);
    expect(flowers.seasonChars?.winter?.length).toBeGreaterThan(0);
  });
  it('renders from the current season pool', () => {
    const g = buildResourceOverlay([[tile({ resources: { wildflower_patch: 1 } })]], undefined, 'winter');
    expect(flowers.seasonChars!.winter).toContain(painted(g));
  });
});

describe('magic groves (glow) are season-independent', () => {
  const ember = resourceObjectService.getById('emberwood_grove')!;
  it('emberwood ignores season pools (glow) and keeps its ember tiles', () => {
    expect(ember.seasonChars).toBeUndefined();
    expect(ember.chars.length).toBeGreaterThan(0);
  });
  it('renders the same ember tiles in summer as in winter (not blanked)', () => {
    const summer = buildResourceOverlay([[tile({ resources: { emberwood_grove: 1 } })]], undefined, 'summer');
    const winter = buildResourceOverlay([[tile({ resources: { emberwood_grove: 1 } })]], undefined, 'winter');
    expect(ember.chars).toContain(painted(summer));
    expect(painted(summer)).toBe(painted(winter));
  });
});

describe('berry bush harvested + seasonal', () => {
  const berry = resourceObjectService.getById('berry_bush')!;
  it('has season pools AND a harvested pool', () => {
    expect(berry.seasonChars?.summer?.length).toBeGreaterThan(0);
    expect(berry.harvestedChars?.length).toBeGreaterThan(0);
  });
  it('ripe bush → season pool; foraged (on cooldown) bush → harvested sprite', () => {
    const ripe = buildResourceOverlay([[tile({ resources: { berry_bush: 1 } })]], undefined, 'summer');
    expect(berry.seasonChars!.summer).toContain(painted(ripe));
    const foraged = buildResourceOverlay(
      [[tile({ resources: { berry_bush: 1 }, resourceCooldowns: { 'berry_bush:berries': 9999 } })]],
      undefined,
      'summer'
    );
    expect(berry.harvestedChars).toContain(painted(foraged));
  });
});
