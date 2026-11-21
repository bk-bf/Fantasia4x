import type { Rgb } from './palette';

export type Painter = (x: number, y: number) => Rgb | null;

export function blank(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function paint(w: number, h: number, fn: Painter): HTMLCanvasElement {
  const c = blank(w, h);
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(c.width, c.height);
  const d = img.data;
  for (let y = 0, i = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++, i += 4) {
      const p = fn(x, y);
      if (!p) continue;
      d[i] = p[0];
      d[i + 1] = p[1];
      d[i + 2] = p[2];
      d[i + 3] = p.length > 3 ? p[3] : 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}
