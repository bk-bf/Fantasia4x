// Parsed, render-ready resource-object definition table from resources.jsonc.
// ResourceObjectService owns the business logic; the WebGL renderer reads defs
// for glyphs/tints from here without reaching into the services layer.
import type { DesignationType, Season } from './types';
import { resolveCharSpans, type CharSpan } from './Terrains';
import resourceObjectsData from '../database/resources.jsonc';
import { hexToRgb01 } from './color';

export interface ResourceYieldDef {
  itemId: string;
  min: number;
  max: number;
  skillId: string;
  skillMultiplier: number;
  /** Per-yield regrowth timer, independent of the node's other yields (requires
   *  `persistent: true`). Cooldown key is `resourceId:itemId` in `WorldTile.resourceCooldowns`. */
  regrowthTurns?: number;
}

export interface ToolRequirement {
  workType: string;
  minTier: number;
}

export interface ResourceInteractionDef {
  /** Which designation type triggers this interaction. Required when used in `interactions[]`. */
  designationType?: DesignationType;
  action: string;
  workCategory: string;
  workAmount: number;
  toolRequirement: ToolRequirement | null;
  yields: ResourceYieldDef[];
  /** Node persists after harvesting — items deplete and a regrowth cooldown starts
   *  instead of removing the node. */
  persistent?: boolean;
  /** true = this interaction removes the node on completion (e.g. chopping);
   *  false/absent = the node persists and yields regrow via cooldowns. */
  harvestDepletes?: boolean;
  /** Turns to wait before items regrow (requires persistent: true). */
  regrowthTurns?: number;
  /** On a depleting harvest, also rewrite the tile's `subType` to this subterrain (digging
   *  grass strips it to bare dirt). Only meaningful with `harvestDepletes: true`. */
  harvestSubType?: string;
  /** Growth% SUBTRACTED from the node by this harvest (default 0 — plant stays fully grown
   *  and just regrows its yield). Depleting interactions drop the node instead. */
  harvestGrowthCost?: number;
  /** Growth resets to 0 on harvest and climbs back gradually (processWildGrowth) instead of
   *  a binary cooldown; `regrowthTurns` is the 0→100 duration. Persistent, non-depleting only. */
  regrowsFromZero?: boolean;
}

export interface ResourceObjectDef {
  id: string;
  displayName: string;
  subterrain: string;
  /** false = placing this resource sets tile.walkable = false. Defaults to true. */
  walkable?: boolean;
  /** Blocks combat line-of-sight (like a wall's `blocksSight`). When omitted the tile
   *  keeps its subterrain's flag. */
  blocksSight?: boolean;
  /** Load-bearing natural blocker (tree trunk, outcrop, cliff wall) that can hold up a roof —
   *  roofs are only buildable within MAX_ROOF_SPAN of a support. */
  roofSupport?: boolean;
  /** Overhead rock: mining it OUT leaves a natural `mountain_roof` over the cleared tile and
   *  may orphan nearby roofs that relied on it for support. */
  overheadRoof?: boolean;
  /** Resolved char array (from charSpans in JSON). */
  chars: string[];
  /** Per-season visual overrides (char-pool swap and/or fg/detail recolour). Driven purely by
   *  the CURRENT SEASON, never snow cover — a freak snowfall can't bare the trees. */
  seasonVariants?: Partial<
    Record<
      Season,
      { chars?: string[]; fg?: [number, number, number]; detail?: [number, number, number] }
    >
  >;
  /** Resolved RGB (0–1) glyph colour, parsed from the `fg` hex string in JSON. */
  fg: [number, number, number];
  /** Resolved RGB (0–1) background colour, parsed from the `bg` hex string in JSON. */
  bg: [number, number, number];
  /** Second tint for the two-colour glyph split: DARK sprite pixels take `fg`, LIGHT pixels
   *  take `detail` (tree trunk vs canopy). Omitted = single-tint. */
  detail?: [number, number, number];
  /** Visual-only render scale in TILE UNITS (default 1.0). `> 1` = anchored at the base tile's
   *  bottom, overflowing UPWARD, drawn in the tall overlay ABOVE entities (tree canopy).
   *  `< 1` = centered speck in the short overlay BENEATH entities (ore vein). */
  renderScale?: number;
  /** true = keep the subterrain ground glyph and composite this resource over it (ore veins on
   *  rock). false/omitted = the terrain pass suppresses the ground glyph for this tile. */
  showGroundBelow?: boolean;
  spawn: {
    subterrains: Record<string, number>;
  };
  nodeAmountRange: [number, number];
  /** Soft point-light overlay, baked into the tile-light field like a dim building light
   *  (LightingService.collectResourceEmitters). Colour is normalised RGB. */
  glow?: {
    color: [number, number, number];
    radius: number;
    intensity: number;
    flicker?: boolean;
  };
  /** Thermal aura: radiates heat (positive `degrees`) or chill (negative) into the environment
   *  thermal field like a fire building. °C at the centre tile, fading linearly to 0 at `radius`. */
  thermal?: { degrees: number; radius: number };
  /** Which designation types can target this resource. */
  designationTypes: DesignationType[];
  /** Grazing animals can eat this resource directly (depletes 1 unit per meal). Lets
   *  EntityService discover edible tiles without a hardcoded ID list. */
  grazing?: boolean;
  /** Lair/nest tile: at world-gen each placed lair tile seeds ONE bound pack of a creature
   *  whose `lair` matches this id. Not harvestable (designationTypes: []). */
  lair?: boolean;
  /** PRODUCTION-CHAIN-IIII §3b / CREATURE-COMBAT-OVERHAUL §3b — rare-material attractor resource ids this
   *  lair GUARDS. A world-gen post-pass (`placeLairGuardians`) dens one of these lairs ADJACENT to a
   *  placed attractor (a witchwood grove, …) so a dangerous pack guards the reward (the node stays
   *  harvestable — the den sits beside it, not on it). Only meaningful on a `lair` def. */
  lairAttractors?: string[];
  /** Ambient particle effect rendered over the tile (WorldEffectsLayer), e.g. "smoke". Visual only. */
  particleEffect?: string;
  /** Primary interaction (also used when `interactions` is absent). */
  interaction: ResourceInteractionDef;
  /** Per-designation-type interaction overrides; each entry's `designationType` identifies
   *  which designation triggers it. Absent = `interaction` serves all designations. */
  interactions?: ResourceInteractionDef[];
  /** Sown CROP (never naturally spawned; `spawn.subterrains` is empty). The plant job places
   *  it on a grow-zone tile when the zone's seed matches `seedItem` and soil tier ≥ `minSoil`;
   *  it then grows via the regrowth cooldown, scaled by fertility × wetness at plant time. */
  crop?: {
    seedItem: string;
    /** Growth only advances while ALL of the following hold. */
    minSoil: number; // 0–4 soil fertility tier required — also the plant-eligibility gate
    minMoisture: number; // 0–100 wetness window (tile.moisture)
    maxMoisture: number;
    minTemp: number; // °C window (seasonal tileTemperature)
    maxTemp: number;
    needsLight: boolean; // requires open sky (an unroofed tile)
    growthTurns: number; // base turns 0→100% under good conditions
    /** Fertility points (of 25 per soil tier) drawn from the soil per HARVESTED cycle
     *  (`tile.fertilityWear`; at 25 the soil drops a tier). A crop that DIES never charges. */
    fertilityCost: number;
  };
}

/** A resource whose nodes have a maturity (wild plants regrow; crops are sown): rolls a world-gen
 *  growth 50–100% and scales yield by it. Minerals/static nodes don't grow (growth stays 100%). */
export function isGrowableResource(def: ResourceObjectDef): boolean {
  if (def.crop) return true;
  const ints = def.interactions ?? [def.interaction];
  return ints.some((i) => i.persistent === true || i.regrowthTurns !== undefined);
}

/** Raw per-season override block as written in resources.jsonc (charSpans / fg / detail all optional). */
interface RawSeasonVariant {
  charSpans?: CharSpan[];
  fg?: string;
  detail?: string;
}

/** Resolve a def's raw `seasonVariants` JSON block into render-ready pools/colours (undefined if none). */
function resolveSeasonVariants(raw: unknown): ResourceObjectDef['seasonVariants'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<ResourceObjectDef['seasonVariants']> = {};
  for (const [season, v] of Object.entries(raw as Record<string, RawSeasonVariant>)) {
    if (!v) continue;
    out[season as Season] = {
      chars: v.charSpans ? resolveCharSpans(v.charSpans) : undefined,
      fg: v.fg ? hexToRgb01(v.fg, [0.87, 0.62, 0.12]) : undefined,
      detail: v.detail ? hexToRgb01(v.detail, [1, 1, 1]) : undefined
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The full parsed def table, in resources.jsonc order. */
export const RESOURCE_OBJECT_DEFS: ResourceObjectDef[] = (
  resourceObjectsData as unknown as Array<Record<string, unknown>>
).map((raw) => ({
  ...(raw as unknown as Omit<
    ResourceObjectDef,
    'chars' | 'seasonVariants' | 'fg' | 'bg' | 'detail'
  >),
  chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[]),
  seasonVariants: resolveSeasonVariants(raw.seasonVariants),
  fg: hexToRgb01(raw.fg, [0.87, 0.62, 0.12]),
  bg: hexToRgb01(raw.bg, [0.06, 0.04, 0.01]),
  detail: raw.detail ? hexToRgb01(raw.detail, [1, 1, 1]) : undefined
}));

const _byId: Map<string, ResourceObjectDef> = new Map(RESOURCE_OBJECT_DEFS.map((d) => [d.id, d]));

/** O(1) def lookup by resource id. */
export function resourceObjectDefById(id: string): ResourceObjectDef | undefined {
  return _byId.get(id);
}
