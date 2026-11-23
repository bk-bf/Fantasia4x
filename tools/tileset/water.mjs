export const WATER_SIZE = 2048;
export const WATER_IMAGE = 'water-field.png';
export const RAMP_STEPS = 5;
export const TONE_SCALE = 32;
export const TONE_OFFSET = 2;
export const OPEN_CELL = 128;
export const EDGE_LEVELS = 8;
const EDGE_FREQ = 0.06;
const EDGE_SEED = 191;

const stand = () => ({
  waterBase: (x = 0, y = 0, kind = 0) => ((x + y + kind) % 10) / 10,
  pn: (x = 0, y = 0, fx = 0, fy = 0, s = 0) => (x * fx + y * fy + s) % 1
});

export const toneByte = (t = 0) =>
  Math.max(0, Math.min(255, Math.round((t * RAMP_STEPS + TONE_OFFSET) * TONE_SCALE)));

export function waterField(A = stand()) {
  const px = new Uint8Array(WATER_SIZE * WATER_SIZE * 4);
  for (let y = 0; y < WATER_SIZE; y++)
    for (let x = 0; x < WATER_SIZE; x++) {
      const deep = A.waterBase(x, y, 2),
        open = A.waterBase(x, y, 1) < deep,
        edge = Math.min(
          EDGE_LEVELS - 1,
          Math.floor(A.pn(x, y, EDGE_FREQ, EDGE_FREQ, EDGE_SEED) * EDGE_LEVELS)
        ),
        i = (y * WATER_SIZE + x) * 4;
      px[i] = toneByte(deep);
      px[i + 1] = open ? OPEN_CELL : 0;
      px[i + 2] = edge;
      px[i + 3] = 255;
    }
  return px;
}
