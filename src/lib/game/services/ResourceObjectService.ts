import type { DesignationType, Pawn } from '../core/types';
import { resolveCharSpans, type CharSpan } from '../core/Terrains';
import resourceObjectsData from '../database/resources.jsonc';
import { pawnStatService } from './PawnStatService';
import { rng } from '../core/rng';
import { gameLogger } from '../dev/gameLogger';
import { isGameDebug } from '../core/log';

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

/** Parse a `#RRGGBB` hex colour into a normalised RGB (0–1) triple; falls back to `fallback`. */
function hexToRgb01(
  hex: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (typeof hex !== 'string') return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

const WORK_STAT_FALLBACK: Record<string, keyof Pawn['stats']> = {
  foraging: 'perception',
  woodcutting: 'strength',
  mining: 'strength'
};

class ResourceObjectServiceImpl {
  private readonly defs: ResourceObjectDef[];
  private readonly byId: Map<string, ResourceObjectDef>;

  constructor() {
    this.defs = (resourceObjectsData as unknown as Array<Record<string, unknown>>).map((raw) => ({
      ...(raw as Omit<ResourceObjectDef, 'chars' | 'fg' | 'bg' | 'detail'>),
      chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[]),
      fg: hexToRgb01(raw.fg, [0.87, 0.62, 0.12]),
      bg: hexToRgb01(raw.bg, [0.06, 0.04, 0.01]),
      detail: raw.detail ? hexToRgb01(raw.detail, [1, 1, 1]) : undefined
    }));
    this.byId = new Map(this.defs.map((d) => [d.id, d]));
  }

  getAll(): ResourceObjectDef[] {
    return this.defs;
  }

  getById(resourceId: string): ResourceObjectDef | undefined {
    return this.byId.get(resourceId);
  }

  /** Lazily-built map: item id → the cultivated crop it belongs to, as its SEED or harvested PRODUCE. */
  private cropByItem: Map<string, { def: ResourceObjectDef; role: 'seed' | 'produce' }> | null = null;

  /**
   * The cultivated crop an ITEM relates to — its SEED (`crop.seedItem`) or its harvested PRODUCE (a reap
   * yield) — so the item tooltip can surface the crop's grow window (temp/water/soil) for both. Seeds win
   * when an id is both (a crop yields its own seed). `undefined` for items that aren't tied to a crop.
   */
  getCropForItem(itemId: string): { def: ResourceObjectDef; role: 'seed' | 'produce' } | undefined {
    if (!this.cropByItem) {
      const m = new Map<string, { def: ResourceObjectDef; role: 'seed' | 'produce' }>();
      for (const def of this.defs) if (def.crop) m.set(def.crop.seedItem, { def, role: 'seed' });
      for (const def of this.defs) {
        if (!def.crop) continue;
        for (const y of def.interaction.yields ?? [])
          if (!m.has(y.itemId)) m.set(y.itemId, { def, role: 'produce' });
      }
      this.cropByItem = m;
    }
    return this.cropByItem.get(itemId);
  }

  getByDesignation(type: DesignationType): ResourceObjectDef[] {
    const HARVEST_TYPES: DesignationType[] = ['harvest', 'woodcut', 'forage', 'dig'];
    if (!HARVEST_TYPES.includes(type)) return [];
    return this.defs.filter((d) => d.designationTypes.includes(type));
  }

  getWorkAmount(resourceId: string, dtype?: DesignationType): number {
    const def = this.getById(resourceId);
    if (!def) return 15;
    const interaction = dtype
      ? (this.getInteractionByDesignationType(resourceId, dtype) ?? def.interaction)
      : def.interaction;
    // `workAmount` is the direct work-point requirement (1:1, like a building's `workAmount`) — the
    // authored value in resources.jsonc IS the work, no hidden multiplier. At BASE_WORK_RATE 1 pt/s a
    // pawn clears `workAmount` work-points in `workAmount` sim-seconds (≈ workAmount × 4.8 in-game min).
    return interaction.workAmount;
  }

  /**
   * Return the interaction matching the given designation type, or the primary
   * `interaction` as a fallback when no per-type override exists.
   */
  getInteractionByDesignationType(
    resourceId: string,
    dtype: DesignationType
  ): ResourceInteractionDef | undefined {
    const def = this.getById(resourceId);
    if (!def) return undefined;
    if (def.interactions) {
      const found = def.interactions.find((i) => i.designationType === dtype);
      if (found) return found;
    }
    return def.interaction;
  }

  /**
   * The `regrowsFromZero` interaction for this resource (carries the 0→100 `regrowthTurns` the gradual
   * growth pass advances at), or `undefined` if the node uses the binary cooldown / depletes. Checks
   * `interactions[]` first (a grass patch's cut twin), then the primary `interaction`.
   */
  getRegrowsFromZeroInteraction(resourceId: string): ResourceInteractionDef | undefined {
    const def = this.getById(resourceId);
    if (!def) return undefined;
    const found = def.interactions?.find((i) => i.regrowsFromZero);
    if (found) return found;
    return def.interaction.regrowsFromZero ? def.interaction : undefined;
  }

  /** True when any of this resource's interactions resets growth to 0 and regrows gradually. */
  isRegrowsFromZero(resourceId: string): boolean {
    return this.getRegrowsFromZeroInteraction(resourceId) !== undefined;
  }

  calculateYield(
    resourceId: string,
    pawn?: Pawn,
    availableItemIds?: Set<string>,
    dtype?: DesignationType,
    /** §F: node maturity 0–100 (tile.growth) — scales the harvest down on under-grown nodes. */
    growthPct: number = 100
  ): Record<string, number> {
    const def = this.getById(resourceId);
    if (!def) return { [resourceId]: 1 };

    const interaction = dtype
      ? (this.getInteractionByDesignationType(resourceId, dtype) ?? def.interaction)
      : def.interaction;

    const result: Record<string, number> = {};
    // Wire stats.jsonc work yield into harvest output. getWorkModifiers is the single source —
    // the `*_yield` formula already folds in racial trait workYield (see PawnStatService).
    const statYieldMult = pawn
      ? (pawnStatService.getWorkModifiers(pawn, interaction.workCategory).yield ?? 1)
      : 1;
    // §F: an under-grown node (low growth%) yields proportionally less — but never zero on a real harvest.
    const growthMult = Math.max(0, Math.min(1, growthPct / 100));
    for (const y of interaction.yields) {
      if (availableItemIds && !availableItemIds.has(y.itemId)) continue;
      const roll = this.randomInt(y.min, y.max);
      const skill = this.getSkillLevel(pawn, y.skillId, interaction.workCategory);
      const multiplier = Math.max(1, 1 + skill * y.skillMultiplier);
      // Yield multiplier produces a float (e.g. roll 3 × 1.2 = 3.6) — round UP so a bonus
      // never silently rounds away.
      const amount = Math.max(0, Math.ceil(roll * multiplier * statYieldMult * growthMult));
      // YIELD-DBG: per-item harvest breakdown (config the build sees + every multiplier). A kept
      // debug tool — gated behind gameDebug() so it's off by default but toggleable when probing
      // yields (grep YIELD-DBG .debug/pawns.log). See dev-memory: yield-dbg-debug-tool.
      // statx already includes trait workYield (folded into getWorkModifiers).
      if (isGameDebug()) {
        gameLogger.log(
          0,
          'JOB-EVT',
          () =>
            `YIELD-DBG ${resourceId}/${interaction.workCategory} ${y.itemId} cfg[${y.min}-${y.max}] roll=${roll} skillx${multiplier.toFixed(2)} statx${statYieldMult.toFixed(2)} -> ${amount}`
        );
      }
      if (amount > 0) {
        result[y.itemId] = (result[y.itemId] ?? 0) + amount;
      }
    }

    // Only fall back to a raw resource drop when no yields are defined at all
    if (Object.keys(result).length === 0 && interaction.yields.length === 0) {
      result[resourceId] = 1;
    }

    return result;
  }

  private getSkillLevel(pawn: Pawn | undefined, skillId: string, workCategory: string): number {
    if (!pawn) return 0;

    const explicit = pawn.skills?.[skillId] ?? 0;
    if (explicit > 0) return explicit;

    const statKey = WORK_STAT_FALLBACK[workCategory];
    if (!statKey) return 0;

    const statValue = pawn.stats?.[statKey] ?? 10;
    return Math.max(0, (statValue - 10) / 4);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(rng.random() * (max - min + 1)) + min;
  }
}

export const resourceObjectService = new ResourceObjectServiceImpl();
