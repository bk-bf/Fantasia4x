import { it } from 'vitest';
import { TREE_ITEMS } from '$lib/dev/itemTree';
import { GEAR } from '$lib/dev/gearDb';
import resourcesData from '$lib/game/database/world/resources.jsonc';
import creaturesData from '$lib/game/database/pawns/creatures.jsonc';
/* eslint-disable @typescript-eslint/no-explicit-any */
const node = new Set<string>();
(function walk(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      k === 'itemId' && typeof v === 'string' ? node.add(v) : walk(v);
})(resourcesData);
const carcass = new Set((creaturesData as any[]).map((c) => c?.carcassItemId).filter(Boolean));
const dropped = new Set(GEAR.filter((g) => g.droppedBy.length).map((g) => g.id));
it('items the audit calls unobtainable', () => {
  const orphan = TREE_ITEMS.filter((i) => i.source === 'forage / hunt' && !dropped.has(i.id));
  const byWhy: Record<string, string[]> = { 'map node': [], butchery: [], 'TRULY NOTHING': [] };
  for (const i of orphan) {
    if (node.has(i.id)) byWhy['map node'].push(i.id);
    else if (carcass.has(i.id)) byWhy['butchery'].push(i.id);
    else byWhy['TRULY NOTHING'].push(`${i.id} [${i.path[0]}]`);
  }
  for (const [k, v] of Object.entries(byWhy)) console.log(`\n${k} (${v.length}): ${v.join(', ')}`);
});
