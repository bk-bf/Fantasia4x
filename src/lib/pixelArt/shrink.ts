import { blank } from './canvas';
import { INK } from './palette';

export function halve(src: HTMLCanvasElement): HTMLCanvasElement {
  const g = src.getContext('2d', { willReadFrequently: true });
  const w = Math.ceil(src.width / 2);
  const h = Math.ceil(src.height / 2);
  const out = blank(w + 2, h + 2);
  const o = out.getContext('2d', { willReadFrequently: true });
  if (!g || !o) return src;
  const s = g.getImageData(0, 0, src.width, src.height).data;
  const img = o.createImageData(out.width, out.height);
  const d = img.data;
  const solid = new Uint8Array(out.width * out.height);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = -1;
      let bi = 0;
      let n = 0;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const sx = x * 2 + i;
          const sy = y * 2 + j;
          if (sx >= src.width || sy >= src.height) continue;
          const k = (sy * src.width + sx) * 4;
          if (s[k + 3] < 128) continue;
          n++;
          const l = s[k] + s[k + 1] + s[k + 2];
          if (l > best) {
            best = l;
            bi = k;
          }
        }
      if (n < 2) continue;
      const p = ((y + 1) * out.width + x + 1) * 4;
      d[p] = s[bi];
      d[p + 1] = s[bi + 1];
      d[p + 2] = s[bi + 2];
      d[p + 3] = 255;
      solid[(y + 1) * out.width + x + 1] = 1;
    }
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const at = y * out.width + x;
      if (solid[at]) continue;
      const near =
        (x > 0 && solid[at - 1]) ||
        (x < out.width - 1 && solid[at + 1]) ||
        (y > 0 && solid[at - out.width]) ||
        (y < out.height - 1 && solid[at + out.width]);
      if (!near) continue;
      d[at * 4] = INK[0];
      d[at * 4 + 1] = INK[1];
      d[at * 4 + 2] = INK[2];
      d[at * 4 + 3] = 255;
    }
  o.putImageData(img, 0, 0);
  return out;
}

export function fitInto(src: HTMLCanvasElement, box: number): HTMLCanvasElement {
  let art = src;
  while (Math.max(art.width, art.height) > box && Math.max(art.width, art.height) >= 8)
    art = halve(art);
  const k = Math.max(1, Math.floor(box / Math.max(art.width, art.height)));
  const out = blank(box, box);
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) return out;
  g.imageSmoothingEnabled = Math.max(art.width, art.height) > box;
  const fit = Math.min(k, box / Math.max(art.width, art.height));
  const w = Math.round(art.width * fit);
  const h = Math.round(art.height * fit);
  g.drawImage(art, Math.floor((box - w) / 2), Math.floor((box - h) / 2), w, h);
  return out;
}
