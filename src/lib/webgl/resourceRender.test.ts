import { describe, it, expect } from 'vitest';
import { buildResourceOverlay } from './fantasia-world';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return { x: 0, y: 0, walkable: true, subType: 'grass', resources: {} as Record<string, number>, ...over } as WorldTile;
}

describe('crop growth-stage rendering', () => {
  const wheat = resourceObjectService.getById('crop_wheat')!;
  it('crop_wheat resolves to the 4 generic growth stages', () => {
    expect(wheat.growthChars?.length).toBe(4);
  });
  it('young crop → seed stage, ripe crop → harvest stage', () => {
    const seedG = buildResourceOverlay([[tile({ resources: { crop_wheat: 0 }, growth: { crop_wheat: 5 } })]]);
    expect(seedG.getTile(0, 0)!.char).toBe(wheat.growthChars![0]); // seed
    const ripeG = buildResourceOverlay([[tile({ resources: { crop_wheat: 0 }, growth: { crop_wheat: 95 } })]]);
    expect(ripeG.getTile(0, 0)!.char).toBe(wheat.growthChars![3]); // harvest
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
    expect(flowers.seasonChars!.winter).toContain(g.getTile(0, 0)!.char);
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
    expect(ember.chars).toContain(summer.getTile(0, 0)!.char);
    expect(summer.getTile(0, 0)!.char).toBe(winter.getTile(0, 0)!.char);
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
    expect(berry.seasonChars!.summer).toContain(ripe.getTile(0, 0)!.char);
    const foraged = buildResourceOverlay(
      [[tile({ resources: { berry_bush: 1 }, resourceCooldowns: { 'berry_bush:berries': 9999 } })]],
      undefined,
      'summer'
    );
    expect(berry.harvestedChars).toContain(foraged.getTile(0, 0)!.char);
  });
});
