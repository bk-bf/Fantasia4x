// Resource-object DEFINITIONS — the parsed, render-ready table built from resources.jsonc, at the
// CORE layer ("data files are definitions"). ResourceObjectService (business logic: designations,
// yields, work amounts) consumes this table; the WebGL renderer reads defs for glyphs/tints without
// reaching up into the services layer (the old webgl → ResourceObjectService leak).
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
  /**
   * When set, this specific yield item has its own regrowth timer (independent of
   * other yields from the same resource). Requires `persistent: true` on the interaction.
   * Cooldown is tracked as a compound key `resourceId:itemId` in `WorldTile.resourceCooldowns`.
   */
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
  /**
   * When true the resource object persists after harvesting — items are depleted
   * and a regrowth cooldown is started instead of removing the node permanently.
   */
  persistent?: boolean;
  /**
   * When true this interaction removes the resource node on completion (e.g. chopping).
   * When false (or absent) the node persists and yields regrow via cooldowns.
   */
  harvestDepletes?: boolean;
  /** Turns to wait before items regrow (requires persistent: true). */
  regrowthTurns?: number;
  /**
   * PRODUCTION-CHAIN-II §F (dig): when this interaction depletes the node, also rewrite the tile's
   * `subType` to this subterrain. Digging a grass patch strips it to bare `dirt` (fertility → 0) after
   * yielding its soil. Only meaningful with `harvestDepletes: true`. Handled in jobs/harvest.complete.
   */
  harvestSubType?: string;
  /**
   * PRODUCTION-CHAIN-II §F: growth% SUBTRACTED from a node by THIS harvest (default 0 — the plant
   * stays fully grown and just regrows its yield). A tree/bush forage takes only branches/berries, so
   * it knocks ~20 off; the node stays standing (keeps its growth entry) and reads as a living plant.
   * Felling (woodcut), digging and mining instead DEPLETE the node (harvestDepletes) and drop it.
   */
  harvestGrowthCost?: number;
  /**
   * Wild ground cover (berry bushes, wild grain, grass) that fully resets on harvest: growth → 0% (the
   * tile shows bare soil), then climbs back 0→100 GRADUALLY via `GameEngineImpl.processWildGrowth`,
   * fading the plant back in (it reappears, dimmed, past `RESOURCE_VISIBLE_GROWTH`) and restoring the
   * node's count at maturity. Replaces the binary `regrowthTurns` cooldown for these nodes — `regrowthTurns`
   * here is still the 0→100 duration. Persistent, non-depleting only. (Trees keep per-yield cooldowns.)
   */
  regrowsFromZero?: boolean;
}

export interface ResourceObjectDef {
  id: string;
  displayName: string;
  subterrain: string;
  /**
   * Whether this resource object allows movement through its tile.
   * When false, placing this resource sets tile.walkable = false.
   * Defaults to true when absent.
   */
  walkable?: boolean;
  /**
   * Whether this resource blocks combat line-of-sight (RANGED-COMBAT Part VII) — fully data-driven,
   * exactly like a wall's `blocksSight` in buildings.jsonc. Set true on solid rock/ore/gem nodes;
   * trees and bushes leave it unset (they don't block). When omitted the tile keeps its subterrain's
   * flag (a bare `cliff` blocks; `rocky` ground doesn't).
   */
  blocksSight?: boolean;
  /**
   * ROOF-SUPPORT: this resource is a load-bearing natural blocker (a tree trunk, stone outcrop,
   * cliff/mountain wall) that can hold up a roof. A roof tile is only buildable within
   * `MAX_ROOF_SPAN` (Chebyshev) of a support — a wall building (`effects.roofSupport`) or a
   * resource flagged here. See BuildingService.makeRoofSupportLookup.
   */
  roofSupport?: boolean;
  /**
   * ROOF-SUPPORT: this is overhead rock (a mountain/cliff wall). Mining it OUT leaves a natural
   * `mountain_roof` over the cleared tile, and may orphan nearby roofs that relied on it for support
   * (see harvest.complete → BuildingService.removeUnsupportedRoofs).
   */
  overheadRoof?: boolean;
  /** Resolved char array (from charSpans in JSON). */
  chars: string[];
  /**
   * Per-season visual overrides (resolved from `seasonVariants` in JSON). A variant may swap the char
   * pool (`charSpans` → leafless winter trees) and/or override `fg`/`detail` (autumn leaf recolours).
   * Driven purely by the CURRENT SEASON — the renderer rebuilds the resource overlay on a season
   * change — never by snow cover, so a freak out-of-season snowfall can't bare the trees.
   */
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
  /**
   * Optional second tint for the two-colour glyph split (TileData.detail). The renderer blends
   * fg↔detail by sprite luminance: DARK sprite pixels take `fg`, LIGHT pixels take `detail`. Trees use
   * it for a brown trunk (dark stem pixels → `fg`) + green canopy (light pixels → `detail`). Omitted =
   * single-tint (the dark line-work is auto-shaded from `fg`).
   */
  detail?: [number, number, number];
  /**
   * Visual-only render scale in TILE UNITS (default 1.0; see TileData.scale).
   *  • `> 1` — bigger than one cell, anchored at the base tile's bottom and overflowing UPWARD (a tree
   *    canopy). These are TALL: they render in the separate tall-resource overlay drawn ABOVE entities
   *    so a pawn behind them is occluded.
   *  • `< 1` — SMALLER than one cell, CENTERED in the tile (e.g. an ore-vein speck sitting on the grey
   *    rock base). Stays in the short overlay BENEATH entities (and under the mountain fog/silhouette).
   *  • omitted/1 — a normal one-cell glyph in the short overlay (grass, bushes, crops).
   */
  renderScale?: number;
  /**
   * When true, the tile's subterrain GROUND glyph is kept and this resource composites OVER it (drawn
   * in the transparent overlay) — like a building showing the floor beneath. Used by ore veins, which
   * sit on a grey rock-wall base. When false/omitted (the default), the terrain pass SUPPRESSES the
   * ground glyph for this tile so the resource reads over the flat background (the pre-layering look —
   * keeps e.g. dirt from showing through a grass patch). See fantasia-world.applyTileToGrid.
   */
  showGroundBelow?: boolean;
  spawn: {
    subterrains: Record<string, number>;
  };
  nodeAmountRange: [number, number];
  /**
   * PRODUCTION-CHAIN-II §M — optional soft point-light overlay (a dim, campfire-style glow that
   * makes a resource stand out). Collected by `LightingService.collectResourceEmitters` and baked
   * into the tile-light field exactly like a building's light, just dimmer. Used by the ancient-wood
   * groves so their tiles read as faintly magical. Colour is normalised RGB.
   */
  glow?: {
    color: [number, number, number];
    radius: number;
    intensity: number;
    flicker?: boolean;
  };
  /**
   * §M optional thermal aura: this resource radiates heat (positive `degrees`) or chill (negative)
   * to nearby tiles, folded into the environment thermal field exactly like a fire building — e.g. an
   * emberwood grove warms its surroundings, a moonwood grove cools them. `degrees` is °C at the centre
   * tile, fading linearly to 0 at `radius` tiles. Read by EnvironmentService.rebuildThermalField.
   */
  thermal?: { degrees: number; radius: number };
  /** Which designation types can target this resource. */
  designationTypes: DesignationType[];
  /**
   * When true, grazing animals can eat this resource directly (depletes 1 unit per meal).
   * Used by EntityService to discover edible tiles without a hardcoded ID list.
   */
  grazing?: boolean;
  /**
   * Territory marker (ENTITIES_SPAWNING territory): a lair/nest tile. At world-gen, each placed lair
   * tile seeds ONE bound pack of a creature whose `lair` matches this id (entitySpawning.seedLairs).
   * Not harvestable (designationTypes: []) — a landmark to learn and avoid (or clear).
   */
  lair?: boolean;
  /**
   * Ambient particle effect rendered over the tile (WorldEffectsLayer). Effect name, e.g. "smoke"
   * (a goblin/orc warren's campfire). Visual only — purely cosmetic flavour for a tile.
   */
  particleEffect?: string;
  /** Primary interaction (backward-compat; also used when `interactions` is absent). */
  interaction: ResourceInteractionDef;
  /**
   * Per-designation-type interaction overrides.
   * When present, each entry's `designationType` field identifies which designation
   * triggers it. Resources without this field use `interaction` for all designations.
   */
  interactions?: ResourceInteractionDef[];
  /**
   * PRODUCTION-CHAIN-II §F — this resource is a sown CROP (not naturally spawned; `spawn.subterrains`
   * is empty). The `plant` job (jobs/plant.ts) places it on a grow-zone tile when the zone's seed
   * matches `seedItem` and the tile's soil tier ≥ `minSoil`. It then grows via the regrowth cooldown:
   * `growthTurns` (scaled by fertility × wetness at plant time) until it matures and becomes harvestable.
   */
  crop?: {
    seedItem: string;
    /** What the crop NEEDS to grow (tracked here per the design): growth only advances while ALL hold. */
    minSoil: number; // 0–4 soil fertility tier required (soilTierForTile) — also the plant-eligibility gate
    minMoisture: number; // 0–100 wetness window (tile.moisture)
    maxMoisture: number;
    minTemp: number; // °C window (seasonal tileTemperature)
    maxTemp: number;
    needsLight: boolean; // requires open sky (an unroofed tile)
    growthTurns: number; // base turns 0→100% under good conditions
    /**
     * Fertility points (of 25 per soil tier) this crop draws from the soil per HARVESTED cycle. The
     * tile accumulates it in `tile.fertilityWear`; at 25 the soil drops one tier (terra preta → rich →
     * loam → poor → barren dirt). Higher-tier crops cost more (deplete faster). Only harvested crops
     * deplete — a crop that DIES (frost/drought/poor soil/grazing) is reset to 1% and never charges.
     */
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
