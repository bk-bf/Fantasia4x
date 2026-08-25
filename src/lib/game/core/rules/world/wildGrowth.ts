import type { WorldTile } from '../../types';

export const RESOURCE_VISIBLE_GROWTH = 20;

const regrowing = new Set<string>();

export function addWildGrowth(x: number, y: number): void {
  regrowing.add(y + ',' + x);
}

export function removeWildGrowth(x: number, y: number): void {
  regrowing.delete(y + ',' + x);
}

export function wildGrowthSize(): number {
  return regrowing.size;
}

export function wildGrowthEntries(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const key of regrowing) {
    const ci = key.indexOf(',');
    out.push({ y: +key.slice(0, ci), x: +key.slice(ci + 1) });
  }
  return out;
}

export function clearWildGrowth(): void {
  regrowing.clear();
}

export function rebuildWildGrowth(
  worldMap: WorldTile[][],
  isRegrowsFromZero: (resourceId: string) => boolean
): void {
  regrowing.clear();
  for (let y = 0; y < worldMap.length; y++) {
    const row = worldMap[y];
    for (let x = 0; x < row.length; x++) {
      const growth = row[x].growth;
      if (!growth) continue;
      for (const id in growth) {
        if (growth[id] >= 100) continue;
        if ((row[x].resources?.[id] ?? 0) > 0) continue;
        if (isRegrowsFromZero(id)) {
          regrowing.add(y + ',' + x);
          break;
        }
      }
    }
  }
}
