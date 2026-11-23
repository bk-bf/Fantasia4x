import type { BiomeConfigEntry } from '$lib/game/core/defs/terrains';

export function rebalanceShares(
  biomes: BiomeConfigEntry[],
  locked: Set<string>,
  id: string,
  pct: number
): Record<string, number> {
  const lockedOthers = biomes.filter((b) => b.id !== id && locked.has(b.id));
  const freeOthers = biomes.filter((b) => b.id !== id && !locked.has(b.id));
  const lockedTotal = lockedOthers.reduce((s, b) => s + b.share, 0);
  const newShare = Math.max(0, Math.min(pct / 100, 1 - lockedTotal));
  const freeTotal = freeOthers.reduce((s, b) => s + b.share, 0);
  const remaining = Math.max(0, 1 - lockedTotal - newShare);
  const next: Record<string, number> = { [id]: newShare };
  for (const b of lockedOthers) next[b.id] = b.share;
  if (freeOthers.length === 0) {
    next[id] = newShare + remaining;
  } else if (freeTotal > 1e-6) {
    for (const b of freeOthers) next[b.id] = (b.share / freeTotal) * remaining;
  } else {
    for (const b of freeOthers) next[b.id] = remaining / freeOthers.length;
  }
  return next;
}

const MAP_SIZES = [
  { label: 'Small', dim: 250 },
  { label: 'Middling', dim: 500 },
  { label: 'Vast', dim: 750 },
  { label: 'Boundless', dim: 1000 }
];

export function mapSizes(debug: boolean): { id: number; label: string; title: string }[] {
  return (debug ? MAP_SIZES : MAP_SIZES.slice(0, 3)).map((s) => ({
    id: s.dim,
    label: s.label,
    title: `${s.dim} × ${s.dim}`
  }));
}
