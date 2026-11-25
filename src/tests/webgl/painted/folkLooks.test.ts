import { beforeEach, describe, expect, it } from 'vitest';
import { drawFolk, FACES, mirrored, type FolkPawn } from '$lib/webgl/painted/folkArt';
import {
  PAWN_BAND_H,
  assemblePawn,
  assemblePawns,
  lookKey,
  pawnBandLook,
  setPawnBand,
  takePawnUploads
} from '$lib/webgl/painted/pawnBand';

const BAND = { tile: 32, w: 4096, top: 2000, h: 2000 + PAWN_BAND_H };

const pawn = (over: Partial<FolkPawn> = {}): FolkPawn => ({
  id: 'pawn-0',
  sex: 'male',
  age: 30,
  physicalTraits: { height: 175, weight: 70 },
  traits: [],
  look: { skin: 'tan', hair: 'black', eyes: 'blue', oddEye: null, style: 'short', beard: 'full' },
  ...over
});

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('folk looks drawn from the synced art', () => {
  it('draws front, side and back standing on the folk foot of the tile', async () => {
    const drawn = await drawFolk(pawn(), FACES);
    expect(drawn).not.toBeNull();
    for (const face of FACES) {
      const s = drawn![face];
      expect(s.w * s.h * 4).toBe(s.px.length);
      expect(s.oy + s.h).toBeGreaterThanOrEqual(27);
      expect(s.oy + s.h).toBeLessThanOrEqual(31);
    }
  });

  it('a visible trait changes the drawn pawn and its key', async () => {
    const plain = pawn();
    const horned = pawn({ traits: [{ id: 'great-horns', rarity: 'epic' }] });
    expect(lookKey(horned)).not.toBe(lookKey(plain));
    const [a, b] = await Promise.all([drawFolk(plain, ['f']), drawFolk(horned, ['f'])]);
    expect(same(a!.f.px, b!.f.px)).toBe(false);
  });

  it('feathers put plumes where the hair would be', async () => {
    const feathered = await drawFolk(pawn({ traits: [{ id: 'feathered', rarity: 'rare' }] }), ['f']);
    const plumed = await drawFolk(
      pawn({
        traits: [{ id: 'feathered', rarity: 'rare' }],
        look: { ...pawn().look!, style: 'long' }
      }),
      ['f']
    );
    expect(same(feathered!.f.px, plumed!.f.px)).toBe(true);
  });

  it('the side facing the other way is the side drawing mirrored about the foot', async () => {
    const s = (await drawFolk(pawn(), ['s']))!.s;
    const w = mirrored(s);
    expect(w.ox + w.w + s.ox).toBe(32);
    expect([...w.px.subarray(0, 4)]).toEqual([...s.px.subarray((s.w - 1) * 4, s.w * 4)]);
  });
});

describe('the pawn band', () => {
  beforeEach(() => setPawnBand(BAND));

  it('places a pawn in the band below the baked atlas, four facings wide', async () => {
    await assemblePawn(pawn());
    const uploads = takePawnUploads();
    expect(uploads).toHaveLength(4);
    for (const u of uploads) {
      expect(u.y).toBeGreaterThanOrEqual(BAND.top);
      expect(u.y + u.sprite.h).toBeLessThanOrEqual(BAND.h);
    }
    const front = pawnBandLook(pawn(), 'f')!.entity.painted;
    expect(front.v1).toBeCloseTo(BAND.top / BAND.h);
    expect(front.w).toBeCloseTo(uploads[0].sprite.w / 32);
  });

  it('assembles once, and again only when a visible trait is gained', async () => {
    const p = pawn();
    await assemblePawns([p]);
    takePawnUploads();
    pawnBandLook(p, 'f');
    await assemblePawn(p);
    expect(takePawnUploads()).toHaveLength(0);
    p.traits = [...p.traits, { id: 'one-eyed', rarity: 'negative' }];
    pawnBandLook(p, 'f');
    await assemblePawn(p);
    expect(takePawnUploads()).toHaveLength(4);
  });
});
