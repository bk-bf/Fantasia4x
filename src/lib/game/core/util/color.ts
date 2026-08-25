// Shared hex-colour parsing — the ONE copy (was pasted into core/Terrains,
// ResourceObjectService and webgl/fantasia-world; graph:check `duplicate` flagged it).

/** Parse a `#RRGGBB` hex colour into a normalised RGB (0–1) triple, or null if malformed/absent. */
export function parseHexRgb01(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** Parse a `#RRGGBB` hex colour into a normalised RGB (0–1) triple; falls back to `fallback`. */
export function hexToRgb01(
  hex: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  return parseHexRgb01(hex) ?? fallback;
}
