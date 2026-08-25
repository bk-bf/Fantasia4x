export function parseHexRgb01(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function hexToRgb01(
  hex: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  return parseHexRgb01(hex) ?? fallback;
}
