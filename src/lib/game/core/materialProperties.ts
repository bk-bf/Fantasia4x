import { allItemDefs } from './itemDefs';
import type { MaterialProperty, MaterialStatMods } from './types';

/**
 * §M material-property accessor. The chosen material for a dynamic `category:` cost slot (oak vs pine
 * plank, granite vs marble block, silk vs linen) shifts the finished building's / item's stats per the
 * material item's `Item.material` field in `items.jsonc`. `durability`/`weight` are multipliers
 * (combine by ×); `beauty`/`comfort`/`insulation` are additive (combine by +). Indexed once.
 */
let _materialProps: Record<string, MaterialProperty> | null = null;
function materialProps(): Record<string, MaterialProperty> {
  if (_materialProps) return _materialProps;
  const props: Record<string, MaterialProperty> = {};
  for (const def of allItemDefs()) {
    if (def.material) props[def.id] = def.material;
  }
  return (_materialProps = props);
}

export function getMaterialProperty(itemId: string): MaterialProperty | undefined {
  return materialProps()[itemId];
}

/** True when this item id carries material properties (i.e. is a recognised dynamic-slot material). */
export function isMaterialWithProps(itemId: string): boolean {
  return itemId in materialProps();
}

export type AggregatedMods = Required<MaterialStatMods>;
const NEUTRAL: AggregatedMods = { durability: 1, beauty: 0, comfort: 0, insulation: 0, weight: 1 };

/**
 * Combine the chosen materials' mods for a target (`building` or `item`): `durability`/`weight`
 * multiply, `beauty`/`comfort`/`insulation` sum. Unknown ids are ignored. Returns the neutral set
 * when nothing applies.
 */
export function aggregateMaterialMods(
  materialIds: Iterable<string>,
  target: 'building' | 'item'
): AggregatedMods {
  const out: AggregatedMods = { ...NEUTRAL };
  const props = materialProps();
  for (const id of materialIds) {
    const m = props[id]?.[target];
    if (!m) continue;
    if (m.durability != null) out.durability *= m.durability;
    if (m.weight != null) out.weight *= m.weight;
    out.beauty += m.beauty ?? 0;
    out.comfort += m.comfort ?? 0;
    out.insulation += m.insulation ?? 0;
  }
  return out;
}

/** Whether an aggregated mod set actually changes anything (for skipping work / hiding empty UI). */
export function modsAreNeutral(m: AggregatedMods): boolean {
  return (
    m.durability === 1 && m.weight === 1 && m.beauty === 0 && m.comfort === 0 && m.insulation === 0
  );
}
