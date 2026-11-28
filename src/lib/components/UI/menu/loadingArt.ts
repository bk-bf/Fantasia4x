import { nail, timber } from '$lib/pixelArt/timber';
import { vellumPage } from '$lib/pixelArt/vellum';
import type { WallShadow } from '$lib/pixelArt/plankWall';
import type { ThemeId } from '../theme/themes';

const NAIL_SCALE = 2;
const NAIL_INSET = 13;

export const WALL_SCALE = 2;

export function loadingBoard(theme: ThemeId, w: number, h: number): HTMLCanvasElement {
  if (theme === 'vellum') return vellumPage(w, h, { rule: 5, seed: 9 });
  const board = timber(w, h, {
    dir: 'v',
    beam: 4,
    strap: 0,
    studs: false,
    seed: 8,
    base: 0.38,
    lo: 24,
    hi: 34
  });
  const g = board.getContext('2d');
  if (!g) return board;
  const head = nail();
  const size = head.width * NAIL_SCALE;
  const far = 7 * NAIL_SCALE + NAIL_INSET;
  g.imageSmoothingEnabled = false;
  for (const [x, y] of [
    [NAIL_INSET, NAIL_INSET],
    [w - far, NAIL_INSET],
    [NAIL_INSET, h - far],
    [w - far, h - far]
  ])
    g.drawImage(head, x - NAIL_SCALE, y - NAIL_SCALE, size, size);
  return board;
}

export function boardShadow(
  theme: ThemeId,
  board: { x: number; y: number; w: number; h: number }
): WallShadow | null {
  if (theme !== 'timber') return null;
  return {
    x: board.x / WALL_SCALE + 5,
    y: board.y / WALL_SCALE + 7,
    w: board.w / WALL_SCALE + 1,
    h: board.h / WALL_SCALE + 1
  };
}
