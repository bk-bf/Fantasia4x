import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY_ART } from '../../../../tools/tileset/sources.mjs';
import { TIMES } from '$lib/webgl/painted/lightGrade';
import { vignetteAlpha, vignetteAtZoom } from '$lib/webgl/painted/vignette';

type Time = 'day' | 'dusk' | 'night';
type Mockup = {
  dith: (x: number, y: number) => number;
  clamp: (v: number, lo: number, hi: number) => number;
  TIMES: Record<Time, { vig: number }>;
};

const ART = join(process.cwd(), 'tools/tileset/art');
const mockup: Mockup = new Function(
  `'use strict';\n${REGISTRY_ART.slice(0, 3)
    .map((f) => readFileSync(join(ART, f), 'utf8').replace(/^'use strict';\n/, ''))
    .join('\n;')}\nreturn { dith, clamp, TIMES };`
)();

function drawVig(W: number, H: number, time: Time): Uint8ClampedArray {
  const { dith, clamp, TIMES } = mockup;
  const d = new Uint8ClampedArray(W * H * 4);
  const vk = TIMES[time].vig;
  const vx = (W - 1) / 2;
  const vy = (H - 1) / 2;
  for (let i = 0, y = 0; y < H; y++)
    for (let x = 0; x < W; x++, i++) {
      const v = clamp((Math.hypot((x - vx) / vx, (y - vy) / vy) - 0.62) / 0.8, 0, 1);
      const q = Math.min(4, Math.floor(v * v * (3 - 2 * v) * 4 + dith(x, y)));
      if (q) {
        d[i * 4 + 2] = 14;
        d[i * 4 + 3] = q * vk * 255;
      }
    }
  return d;
}

const STOPS = Array.from({ length: (64 - 8) / 2 + 1 }, (_, i) => 8 + i * 2);

describe('painted vignette shape', () => {
  it.each([
    [640, 360, 'night'],
    [480, 272, 'dusk'],
    [317, 211, 'day']
  ] as const)('matches the mockup drawVig at every pixel of a %ix%i %s view', (W, H, time) => {
    const theirs = drawVig(W, H, time);
    const strength = TIMES[time].vignette;
    const mine = new Uint8ClampedArray(W * H);
    for (let y = 0, i = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) mine[i] = vignetteAlpha(x, y, W, H, strength) * 255;
    const alpha = theirs.filter((_, i) => i % 4 === 3);
    expect(mine).toEqual(alpha);
    expect(alpha.some((a) => a > 0)).toBe(true);
  });

  it('leaves the middle of the view untouched', () => {
    expect(vignetteAlpha(960, 540, 1920, 1080, 0.24)).toBe(0);
  });
});

describe('painted vignette zoom fade', () => {
  it('is full at the close zooms and gone at the far ones', () => {
    for (const px of STOPS) {
      if (px >= 32) expect(vignetteAtZoom(px)).toBe(1);
      if (px <= 16) expect(vignetteAtZoom(px)).toBe(0);
    }
    expect(vignetteAtZoom(8.33)).toBe(0);
  });

  it('never grows as the view zooms out', () => {
    for (let px = 64; px > 4; px -= 0.25)
      expect(vignetteAtZoom(px - 0.25)).toBeLessThanOrEqual(vignetteAtZoom(px));
  });

  it('changes by a small amount between neighbouring zoom stops', () => {
    for (let i = 1; i < STOPS.length; i++)
      expect(Math.abs(vignetteAtZoom(STOPS[i]) - vignetteAtZoom(STOPS[i - 1]))).toBeLessThanOrEqual(
        0.2
      );
  });
});
