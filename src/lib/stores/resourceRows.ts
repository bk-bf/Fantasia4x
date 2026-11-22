import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { WorldTile } from '$lib/game/core/types';

export interface ResourceRow {
  id: string;
  name: string;
  color: string;
  type: string;
  amount: number;
  x: number;
  y: number;
}

type RowLook = Pick<ResourceRow, 'name' | 'color' | 'type'>;

function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

function lookOf(id: string): RowLook {
  const def = resourceObjectService.getById(id);
  return {
    name: def?.displayName ?? id.replace(/_/g, ' '),
    color: def?.fg ? rgb(def.fg) : 'var(--text-dim)',
    type: def?.lair ? 'lair' : (def?.interaction?.workCategory ?? '—')
  };
}

const byPosition = (a: ResourceRow, b: ResourceRow) => a.x - b.x || a.y - b.y;

export function buildResourceRows(worldMap: WorldTile[][]): ResourceRow[] {
  const looks = new Map<string, RowLook>();
  const byName = new Map<string, ResourceRow[]>();
  for (const line of worldMap ?? []) {
    for (const t of line) {
      if (!t.discovered || !t.resources) continue;
      for (const id in t.resources) {
        const amount = t.resources[id];
        if (amount <= 0) continue;
        let look = looks.get(id);
        if (!look) looks.set(id, (look = lookOf(id)));
        let group = byName.get(look.name);
        if (!group) byName.set(look.name, (group = []));
        group.push({
          id,
          name: look.name,
          color: look.color,
          type: look.type,
          amount,
          x: t.x,
          y: t.y
        });
      }
    }
  }
  const out: ResourceRow[] = [];
  for (const name of [...byName.keys()].sort((a, b) => a.localeCompare(b))) {
    const group = byName.get(name)!;
    group.sort(byPosition);
    for (const row of group) out.push(row);
  }
  return out;
}
