import { describe, it, expect } from 'vitest';
import committed from '../../../static/tilesets/painted/sway.json';
import manifest from '../../../static/tilesets/painted/manifest.json';
import { swayTable } from '../../../tools/tileset/sway.mjs';

describe('the wind sway table', () => {
  it('matches what the art says about every sprite in the atlas', () => {
    expect(swayTable()).toEqual(committed);
  });

  it('sways the trees, bushes, reeds, flowers and tall crops, and leaves rocks and buildings still', () => {
    const ids = Object.keys(committed.sway);
    for (const family of [
      'tree/oak/',
      'tree/pine/',
      'plant/reeds/',
      'plant/flowers/',
      'plant/berry_bush/',
      'crop/crop_wheat/'
    ])
      expect(
        ids.some((id) => id.startsWith(family)),
        family
      ).toBe(true);
    expect(ids.some((id) => /^(rock|ore|building|site|creature|folk)\//.test(id))).toBe(false);
    expect(ids.every((id) => id in manifest.sprites)).toBe(true);
  });

  it('drops leaves only from trees in leaf', () => {
    expect(committed.leafy.length).toBeGreaterThan(0);
    expect(committed.leafy.every((id) => /^trees?\//.test(id) && !/^trees?\/dead\//.test(id))).toBe(
      true
    );
    expect(committed.leafy.some((id) => id.startsWith('trees/oak/mature/summer/'))).toBe(true);
    expect(committed.leafy.some((id) => /^trees\/(oak|ash|birch)\/\w+\/winter\//.test(id))).toBe(
      false
    );
  });
});
