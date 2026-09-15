import { getMaterialProperty } from '../../defs/materials';
import type { MaterialStatMods } from '../../types';

export type AggregatedMods = Required<MaterialStatMods>;
const NEUTRAL: AggregatedMods = { durability: 1, beauty: 0, comfort: 0, insulation: 0, weight: 1 };

export function aggregateMaterialMods(
  materialIds: Iterable<string>,
  target: 'building' | 'item'
): AggregatedMods {
  const out: AggregatedMods = { ...NEUTRAL };
  for (const id of materialIds) {
    const m = getMaterialProperty(id)?.[target];
    if (!m) continue;
    if (m.durability != null) out.durability *= m.durability;
    if (m.weight != null) out.weight *= m.weight;
    out.beauty += m.beauty ?? 0;
    out.comfort += m.comfort ?? 0;
    out.insulation += m.insulation ?? 0;
  }
  return out;
}

export function modsAreNeutral(m: AggregatedMods): boolean {
  return (
    m.durability === 1 && m.weight === 1 && m.beauty === 0 && m.comfort === 0 && m.insulation === 0
  );
}
