// itemInfo.ts — builds the shared "item card" view model shown in the floating hover panel on an
// item pill (see ItemPills.svelte). One source of truth for: a short description (items.jsonc),
// where the item is used (crafting recipes + building costs), and its base freshness / condition
// lifespans. Static-DB only → indexes computed once at module load, then O(1) per lookup.
import { itemService } from '$lib/game/services/ItemService.js';
import { recipeService } from '$lib/game/services/RecipeService.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { SOIL_TIER_NAME, type SoilTier } from '$lib/game/core/Terrains.js';
import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService.js';
import type { Item, Building } from '$lib/game/core/types.js';
import buildingsData from '$lib/game/database/world/buildings.jsonc';

type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

const BUILDINGS = buildingsData as unknown as Building[];

/** itemId / `category:<cat>` → building defs whose buildingCost references it. Built once. */
const _buildingsUsing = new Map<string, Building[]>();
for (const b of BUILDINGS) {
  for (const key of Object.keys(b.buildingCost ?? {})) {
    (_buildingsUsing.get(key) ?? _buildingsUsing.set(key, []).get(key)!).push(b);
  }
}

/** Human-readable lifespan for a `decaySeconds` value (sim-seconds → "10m", "2h 30m", "1d 4h"). */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

export interface ItemInfoView {
  id: string;
  name: string;
  color: string;
  charSpans?: CharSpan[];
  description?: string;
  /** Base freshness lifespan (e.g. "10m"), if the item spoils. */
  freshness?: string;
  /** Base max durability (condition points), if the item wears. */
  condition?: number;
  /** Product names this item is a crafting ingredient for. */
  craftedInto: string[];
  /** Building names this item is a construction cost for. */
  buildsInto: string[];
  /** When the item is a crop's seed or its harvested produce: the crop's grow requirements. */
  farming?: { crop: string; rows: { label: string; val: string }[] };
}

/** Build the hover-card view model for an item id (resource yield, dropped item, …). */
export function buildItemInfo(itemId: string): ItemInfoView {
  const def: Item | undefined = itemService.getItemById(itemId);
  const name = def?.name ?? itemId.replace(/_/g, ' ');

  // Crafting: recipes that consume this item → their primary product's display name (deduped).
  const craftedInto: string[] = [];
  const seen = new Set<string>();
  for (const r of recipeService.getRecipesUsing(itemId)) {
    const product = Object.keys(r.outputs ?? {})[0];
    if (!product || seen.has(product)) continue;
    seen.add(product);
    craftedInto.push(itemService.getItemById(product)?.name ?? product.replace(/_/g, ' '));
  }

  // Buildings: direct itemId cost, plus `category:<cat>` slots this item's category satisfies.
  const buildingDefs = [
    ...(_buildingsUsing.get(itemId) ?? []),
    ...(def?.category ? (_buildingsUsing.get(`category:${def.category}`) ?? []) : [])
  ];
  const buildsInto = [...new Set(buildingDefs.map((b) => b.name))];

  // Farming: if this item is a crop's seed or its harvested produce, surface the crop's grow window
  // (temp / water / soil / time) so the requirements read off either the seed bag or the harvest stack.
  let farming: ItemInfoView['farming'];
  const cropRel = resourceObjectService.getCropForItem(itemId);
  if (cropRel?.def.crop) {
    const cr = cropRel.def.crop;
    const days = cr.growthTurns / TURNS_PER_DAY;
    const rows = [
      { label: 'Grows', val: `${cr.minTemp} to ${cr.maxTemp}°C` },
      { label: 'Water', val: `${cr.minMoisture}–${cr.maxMoisture}%` },
      { label: 'Soil', val: `≥ ${SOIL_TIER_NAME[cr.minSoil as SoilTier] ?? cr.minSoil}` },
      { label: 'Matures', val: `${Number.isInteger(days) ? days : days.toFixed(1)} days` }
    ];
    if (cr.needsLight) rows.push({ label: 'Light', val: 'needs sun' });
    farming = { crop: cropRel.def.displayName, rows };
  }

  return {
    id: itemId,
    name,
    color: itemService.getItemColor(itemId),
    charSpans: def?.charSpans,
    description: def?.description,
    freshness:
      def?.decaySeconds && def.decaySeconds > 0 ? formatDuration(def.decaySeconds) : undefined,
    condition: def?.maxDurability,
    craftedInto,
    buildsInto,
    farming
  };
}
