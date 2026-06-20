<!-- LOC cap: 650 (created: 2026-06-18; raised 2026-06-20 — §F grew into the soil/terrain + farming layer) -->

# PRODUCTION CHAIN II — Quality, Magic, Logistics & Farming

> **Related:** [ROADMAP](ROADMAP.md) · [PRODUCTION-CHAIN-III](PRODUCTION-CHAIN-III.md) (medieval depth, magic ages, armour, famed items — the follow-on pass) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) (logistics + husbandry) · [MAGIC-SKILLS](MAGIC-SKILLS.md) (foci materials) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) (gating) · [RANGED-COMBAT](RANGED-COMBAT.md) · archived: [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (Pass I) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) (materialBonuses) · [SEASONS_WEATHER](../archive/SEASONS_WEATHER-2026-06-17.md) (growing seasons) · [game/DESIGN](../../game/DESIGN.md)

## Status

**[~] In progress** — **§Q (Item Quality) DONE (2026-06-18)** closing R8, **§M (Magical Resources & Gear) DONE (2026-06-18)** as the MAGIC-SKILLS passive foundation, and **§L (Bulk Logistics) pawn-pushed carts DONE (2026-06-20)** (roads + draft animals deferred); **§F (Farming) spec reworked 2026-06-20** into a soil/terrain + farming layer (dirt fertility from grass subterrain · dig/reposition soil · terraform via compost · growing zones + crops + wetness gating), **not yet implemented.**
This is the **second** production/items/buildings/resources pass on top
of the completed [Pass I](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (forage → fire →
tools → metal → leather). Pass I delivered the *mundane foundation*; Pass II adds the four
depth layers that make a mature colony feel distinct: **craft quality**, **magic materials &
stat-gear**, **bulk logistics**, and a real **farming → food → drink** chain.

One combined spec, four chapters. They are largely independent and can ship in any order
(ordering rationale in [Implementation Plan](#implementation-plan)).

| Chapter                              | Theme                                                   | Headline dependency                          |
| ------------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
| **§Q — Item Quality Prefixes**       | quality tiers stamp bonus stats onto crafted items      | completes the blocked **R8**; rides EQUIPMENT `materialBonuses` |
| **§M — Magical Resources & Gear**    | ancient woods (multi-species) + crystals (normal→trade / infused→enchant) → attuned gear granting passive **magical conditions** | **MAGIC-SKILLS Phase 0** — the passive foundation its active layer builds on |
| **§L — Bulk Logistics**              | wheelbarrows, handcarts, draft-animal carts, roads      | animal carts need ENTITIES C–D (husbandry)   |
| **§F — Farming, Food & Drink**       | **soil fertility (dig/terraform)** → growing zones → crops (wetness/fertilizer-gated) → cooking/brewing | reads grass-subterrain + wetness worldgen already produces; benefits SEASONS + ENTITIES D (manure/dairy) |

---

## Design Philosophy

Continues Pass I's rule: a **medieval-fantasy steampunk ceiling**, so we get richness from
**depth inside an age**, not from more ages. Pass II's depth axes:

- **Quality** turns "I have a sword" into "I have a *Masterwork* sword" — the same item DB,
  far more spread in outcomes, and a reason to keep your best crafter on the bench.
- **Magic materials** are the first taste of the deferred [MAGIC-SKILLS](MAGIC-SKILLS.md)
  layer, delivered as **passive stat/trait gear** that needs no spell engine — so it ships now.
- **Logistics** makes the **big map** (target 1000×1000) actually playable: the
  personal-carry vs bulk-logistics split (parked in ENTITIES_SPAWNING) becomes real.
- **Farming** closes the food loop: calories stop being "hunt or forage" and become a
  planned, seasonal, variety-driven system that feeds cooking, brewing, and husbandry.

Draw production patterns from **Dwarf Fortress, Vintage Story, Clanfolk** (long chains,
intermediate goods, quality spread, fermentation timers, draft animals).

---

## Integration Seams (what already exists)

- **Quality work-axes already computed, never stamped** — `stats.jsonc` defines
  `crafting_quality`, `metalworking_quality`, `leatherworking_quality`, `cooking_quality`,
  `alchemy_quality`, `construction_quality`, `butchery_quality`. The work model *produces* a
  quality value per craft but **nothing writes it to the output and nothing reads item
  `.quality`** (ROADMAP "Other Phase 3 work" → **R8**, blocked). §Q is R8's home.
- **`materialBonuses`** (EQUIPMENT-EXPANSION, `Recipe.materialBonuses` in `core/types/items.ts`)
  already applies per-craft stat **deltas** to a product's `weaponProperties`/`armorProperties`.
  §Q quality is just **another delta layer** on the same application path.
- **Equipment slots** (`core/types/items.ts` `EquipmentSlot`): `ring` exists; `gorget` is the
  neck *armor* slot. §M adds an `amulet` slot (or reuses `ring`).
- **Condition pipeline already delivers passive effects** — `conditions.jsonc` (transient entries) +
  `PawnStateMachine.syncTransientConditions` + the `modifiers` consumers. §M's passive magical buffs
  are *just* transient conditions (+ a `magical: true` flag); the only new item field is
  `grantsConditions?: string[]`. No `statBonuses`/`grantsTraits`/`ModifierSystem` reader work.
- **Work categories exist**: `planting` (tools `digging_stick`/`stone_hoe`/`iron_hoe`),
  `cooking`, `alchemy`, `hauling`. **No crop/seed/fertilizer/brewing data exists** — §F adds it.
- **The ground already carries §F's fertility + wetness signals** — world-gen picks a grass-density
  **subterrain** per tile by detail noise (`subterrains.jsonc`: `dirt`/`grass`/`tall_grass`/`deep_grass`,
  `pickSubterrain`), stored in `tile.subType`; `tile.moisture` (0–100, distance-to-water + weather) is
  wetness (`EnvironmentService`, SEASONS_WEATHER). §F derives soil fertility from `subType` and growth
  speed from `tile.soil × moisture × fertilizer` — **no new noise**. **Designations** are a
  `DesignationType` union + `gameState.designations` map → jobs (`DesignationService` + `jobs/*.ts`);
  **zones** are `FilterableZoneType` + `ZoneInstance` + `zoneTiles`; **builds write persistent tile
  fields** on complete & restore on deconstruct (`BuildingService`, the `walkable`/movementCost path) —
  §F's `dig`, `grow` zone, and Soil-Works terraform reuse those three mechanisms wholesale.
- **Per-stack instance data** already works: `DroppedItem` carries per-stack `durability`/
  `deterioration` (tools are qty-1 stacks). §Q/§M add per-stack `quality` the same way.
- **Recipe registry** (`recipes.jsonc` + `RecipeService`) and **per-tile storage** are the
  single sources of truth — every new recipe goes in `recipes.jsonc`, items stay pure materials.

---

## §Q — Item Quality Prefixes ✅ DONE 2026-06-18

**Goal:** every crafted item is rolled to a **quality tier** at completion; the tier stamps a
**bonus/penalty delta** onto the item and shows as a **name prefix + colour**. Closes R8.

### Tiers

Discrete, DF/RimWorld-style. Stored as `quality: 0–5` on the per-stack instance; tier 1 is the
unmarked baseline (no prefix).

| Tier | Name        | Prefix      | Stat multiplier* | Roll likelihood (avg skill) |
| ---- | ----------- | ----------- | ---------------- | --------------------------- |
| 0    | Crude       | "Crude"     | ×0.80            | low skill / rushed          |
| 1    | Standard    | —           | ×1.00            | default                     |
| 2    | Fine        | "Fine"      | ×1.15            | skilled                     |
| 3    | Superior    | "Superior"  | ×1.30            | expert                      |
| 4    | Masterwork  | "Masterwork"| ×1.50            | rare, master crafter        |
| 5    | Legendary   | "Legendary" | ×1.80 + flair    | very rare                   |

\* The multiplier scales the item's **quality-relevant** properties only: weapon dam/accuracy/
crit, armor armorValue, tool `durabilityLossPerAction` (inverse — better tools last longer) +
work-speed bonus, food `nutrition`/mood, building beauty/`storageDecayMultiplier`. It does **not**
scale weight, fuel value, or recipe cost.

### Rolling quality

At craft completion the relevant `*_quality` work-axis value (already computed by the work
model, 0–1+) maps to a tier via thresholds, plus a small random jitter and a master-crafter
long-tail so Legendary is reachable but rare. Helper: `rollCraftQuality(qualityAxis, rng) → 0–5`.
Higher pawn skill/stats shift the distribution up; poor light / rushed work shifts it down.

### Stamping + consuming (the two halves R8 is missing)

- **Stamp:** `JobService` craft-completion writes `quality` onto the produced `DroppedItem`
  stack (qty-1 for equipment, like durability). Quality items don't merge with differing tiers.
- **Consume:** quality delta is applied through the **existing `materialBonuses` application
  path** so Combat (`weaponProperties`/`armorProperties` reads), `PawnStatService` (tool
  work-bonus), equip, and food (nutrition/mood) all see it with no new reader plumbing.
- **Display:** prefix prepended to the item name; tier colour reuses the existing palette
  convention (grey→green→blue→purple→gold). Reuse `StatBar`/`SelectedEntityCard`, no ad-hoc UI.

### Open design points → see [Open Questions](#open-questions)

- Does Crude (tier 0) ever appear, or is tier 1 the floor for a competent colony?
- Per-stack vs whole-recipe quality when a craft outputs a stack > 1 (food batches).

---

## §M — Magical Resources & Gear (the passive foundation of MAGIC-SKILLS)

**Goal:** §M is **MAGIC-SKILLS Phase 0** — not an independent feature. It delivers the *passive*
half of the magic layer first: rare magical materials → **attuned gear (rings, amulets, foci,
bows)** that grants a **passive magical buff while worn**. It ships **without** the spell engine,
but it is the foundation the active layer builds on: the buff-delivery plumbing it lays down (a
magical buff *is a condition*) is exactly what [MAGIC-SKILLS](MAGIC-SKILLS.md)' active spells and
skill-tree nodes reuse — they apply the *same* magical conditions, just triggered on demand and
gated by mana/research instead of by a worn item. Crafting the staff/focus first (the production
chain) stays the gate, consistent with MAGIC-SKILLS' "attunement, not classes" model.

**Key design rule (user):** a passive magical buff is **just a `conditions.jsonc` entry** — a normal
transient condition with at most a `magical: true` flag for distinction. No bespoke
`statBonuses`/`grantsTraits` item system, no new `ModifierSystem`/`PawnStatService` readers: it
rides the condition pipeline that already exists (`syncTransientConditions` → `modifiers`).

### New resources (world-gen)

Two material families, both following the **per-type material pattern** already used for wood
(`pine_log`/`oak_log`/`ash_log`/`yew_log`, all `category: "wood"`) and stone
(`granite`/`limestone`/`marble`/…, all `category: "stone"`) in `items.jsonc` — **not** a single
generic "magic log" / "crystal" item. Each variant is its own item id sharing a category, with
its own name/description/colour/tuned fields and `gatheringTypes`.

| Resource          | Node(s)                              | Yields                                            | Rarity    | Feeds                                              |
| ----------------- | ------------------------------------ | ------------------------------------------------- | --------- | -------------------------------------------------- |
| **Ancient woods** | several rare groves (one per wood)   | the matching `*_log` (`category: "magic_wood"`)   | very rare | staves, magic bows, shields, prestige furniture; affinity + top quality material bonus |
| **Crystal node**  | `crystal_node` on mountain (clusters)| a typed raw crystal — **rolled normal *or* magic-infused** | rare      | normal → cut gems = **trade goods**; infused → attuned gems = **enchanted gear** |

Groves are a rare biome feature (a handful per map, each grove grows one ancient-wood species);
crystal nodes cluster like the Pass I mineral veins (`fillResourceClusters`). Both are
**research-gated** before they can be worked (an "Arcane Lapidary" / "Attunement" unlock — light
tie to RESEARCH-ENHANCEMENT).

### Ancient woods (multiple species — follow the `*_log` wood pattern)

Distinct premium woods, each from its own rare grove and each with a niche, mirroring how
pine/birch/oak/ash/yew already differ. They share `category: "magic_wood"` so they're gated out of
mundane wood recipes but slot into the same recipe *shape* (a `*_log` shaft/handle/stock input),
and each carries a small `affinity` hook (consumed by MAGIC-SKILLS later; a cosmetic + quality
edge until then).

| Wood (`*_log`)   | Grove                       | Niche / best material bonus                          | Affinity   |
| ---------------- | --------------------------- | ---------------------------------------------------- | ---------- |
| `heartwood_log`  | ancient elder/oak grove     | structural + prestige; **staves**, fine furniture    | general    |
| `moonwood_log`   | moonlit silver-birch grove  | light & springy; **magic bows**, foci                | lunar/cold |
| `ironwood_log`   | dense darkwood grove        | hardest; **hafts, shields**, blunt durability        | earth      |
| `emberwood_log`  | sun-scorched/volcanic grove | warm; **fire foci**, braziers                        | fire       |

```jsonc
// items.jsonc — one entry PER species, same shape as oak_log/yew_log (rare premium variant).
{
  "id"               : "moonwood_log",
  "charSpans"        : [ {"sheet": "items", "id": 225} ],
  "name"             : "Moonwood Log",
  "type"             : "material",
  "category"         : "magic_wood",          // gated apart from "wood"; same recipe shape
  "description"      : "Pale, near-weightless timber from a moonlit grove. Sings under a bowyer's knife.",
  "color"            : "#C9D4E0",
  "amount"           : 0,
  "weightKg"         : 5,
  "volumeL"          : 8,
  "fuelValue"        : 12, "fuelHeat": 1,
  "deteriorationRate": 0.02,
  "maxDurability"    : 140,
  "affinity"         : "lunar",               // §M hook (forward to MAGIC-SKILLS; quality edge now)
  "gatheringTypes"   : ["woodcutting"]
}
```

### Crystals — normal (trade) vs magic-infused (enchanting), per type

`crystal_node` mining yields a **typed raw crystal**, and each unit is rolled to one of two
forms — **normal** (common) or **magic-infused** (rare). Both come in the same enumerated mineral
types (the per-type pattern, like the stone list); the form decides the downstream chain:

- **Normal crystal** (`category: "crystal"`) → cut/polished at the lapidary into a `cut_<type>`
  gem → a **trade good** (value, decorative jewellery, prestige) — *no* stat effect.
- **Magic-infused crystal** (`category: "magic_crystal"`) → attuned/cut into an `attuned_<type>`
  gem → set into a **ring/amulet** that, while worn, grants the type's **magical condition**
  (see [Passive buffs are conditions](#passive-buffs-are-conditions-not-a-new-stat-system) below).

The normal-vs-infused split is a **harvest yield roll** (e.g. ~85% normal / ~15% infused, the
infused odds nudged up by the "Attunement" research and richer nodes) — the same shape as the
existing `yields` min/max tables, just a weighted pick. Magic-infused stacks **never merge** with
normal stacks (distinct item ids).

| Mineral  | normal (trade)  | infused (enchant) | cut → enchant gem | Granted magical condition (while worn) |
| -------- | --------------- | ----------------- | ----------------- | -------------------------------------- |
| Ruby     | `ruby`          | `infused_ruby`    | `attuned_ruby`    | **Might** — melee/strength-work boost  |
| Sapphire | `sapphire`      | `infused_sapphire`| `attuned_sapphire`| **Insight** — research/craft boost     |
| Emerald  | `emerald`       | `infused_emerald` | `attuned_emerald` | **Vigor** — stamina/fatigue relief     |
| Topaz    | `topaz`         | `infused_topaz`   | `attuned_topaz`   | **Quickness** — move/attack speed, dodge |
| Amethyst | `amethyst`      | `infused_amethyst`| `attuned_amethyst`| **Keen Senses** — sight/accuracy/aggro |
| Citrine  | `citrine`       | `infused_citrine` | `attuned_citrine` | **Charm** — social/trade               |
| Moonstone| `moonstone`     | `infused_moonstone`| `attuned_moonstone`| **Moonlit** — night-sight / calm     |

```jsonc
// items.jsonc — each mineral appears as a normal AND an infused entry (same shape, different category).
{ "id": "ruby",         "name": "Ruby",            "type": "material", "category": "crystal",
  "charSpans": [ {"sheet": "items", "id": 30} ], "color": "#C81E3A", "amount": 0,
  "description": "A cut-grade gemstone. Polished and sold, or set into fine (non-magical) jewellery.",
  "weightKg": 0.2, "volumeL": 0.1, "deteriorationRate": 0, "gatheringTypes": ["mining"] },

{ "id": "infused_ruby", "name": "Infused Ruby",     "type": "material", "category": "magic_crystal",
  "charSpans": [ {"sheet": "items", "id": 31} ], "color": "#FF3355", "amount": 0,
  "description": "A ruby threaded with raw mana. Attuned and set, it lends the wearer might.",
  "weightKg": 0.2, "volumeL": 0.1, "deteriorationRate": 0, "gatheringTypes": ["mining"] }
```

> **Note:** an earlier draft listed a "+wisdom" effect — there is no `wisdom` base stat (base stats
> are STR/DEX/CON/PER/INT/CHA). The buffs are expressed as **condition `modifiers`**, not raw stat
> deltas, so they're framed by role (Might/Insight/…) rather than by stat letter; Citrine covers the
> social axis.

### New station — Lapidary / Jeweler's Bench

`lapidary_bench` (cut stone block + bronze tools) runs **two recipe families**:

1. **Trade-gem cutting** — normal `<crystal>` → `cut_<crystal>` gem (a polished trade good; also
   plain gold/silver jewellery for prestige/trade value). The mundane, always-available chain.
2. **Attunement & assembly** (gated by "Attunement" research) — magic-infused `infused_<crystal>`
   → `attuned_<crystal>` gem, then `attuned_<crystal>` + precious metal (`gold_bar`/`silver_bar`)
   → a **ring**/**amulet** whose item def lists the magical condition(s) it grants while worn.

### Passive buffs are conditions, not a new stat system

A passive magical buff **is a `conditions.jsonc` entry** — a normal **transient** condition with one
new `magical: true` flag for distinction (UI tint, lore, and a future dispel/anti-magic hook). No
`statBonuses`/`grantsTraits` item fields, no new `ModifierSystem`/`PawnStatService` readers: the buff
rides the existing condition pipeline (`PawnStateMachine.syncTransientConditions` derives active ids
each tick; `modifiers` are consumed where conditions already apply — work/move/fatigue/dodge…).

The only new wiring:

- **one item field** — `grantsConditions?: string[]` on `Item` (the attuned ring/amulet/focus lists
  the condition id(s) it grants while equipped). Far smaller than a bespoke bonus system.
- **a few lines in `syncTransientConditions`** — scan `pawn.equipment` for items whose
  `grantsConditions` apply and push those ids (they auto-clear when the gear is removed, exactly like
  every other transient condition).
- **a handful of `conditions.jsonc` entries** — `Might`/`Insight`/`Vigor`/`Quickness`/`Keen Senses`/
  `Charm`/`Moonlit`, each `"duration": "transient"`, `"magical": true`, with a `modifiers` block.
  (Combat/work buff modifier keys beyond the current set are a small, existing-shaped extension to the
  condition `modifiers` map — not a new system.)

```jsonc
// conditions.jsonc — a magical buff is an ordinary transient condition + the magical flag.
{
  "duration"   : "transient",
  "magical"    : true,
  "id"         : "might",
  "name"       : "Might",
  "description": "An attuned ruby lends the wearer raw strength.",
  "color"      : "#FF3355",
  "modifiers"  : { "workEfficiency": 1.10, "meleeDamage": 1.10 }
}
```

**Quality scaling (§Q):** the attuned cut's quality tier picks the buff strength — either a tiered
variant id (`might`/`might_fine`/`might_master`) or a per-tier modifier scale — so a Masterwork-cut
`attuned_ruby` grants a stronger Might than a Crude one. Amulets (new `amulet` slot) take a larger
gem than rings → the stronger variant.

**Why this is the foundation, not a dead end:** MAGIC-SKILLS' active spells and skill-tree passive
nodes apply the *same* magical conditions — a buff spell just pushes `might` for N turns at a mana
cost; a skill-tree node grants it passively. §M builds the condition-buff layer once; the active
layer is then "trigger + duration + mana/research gate" on top.

### New equip slot

Add `amulet` to `EquipmentSlot`. Rings use the existing `ring` slot. Cap rings (e.g. 2) so gem
gear is a real loadout choice, not a stat-stick pile-on.

### Ancient-wood gear

Each ancient wood (`heartwood_log`/`moonwood_log`/`ironwood_log`/`emberwood_log`) is a premium
`magic_wood` material giving the **best `materialBonuses`** roll for its niche (heartwood → staves &
prestige, moonwood → magic bows/foci, ironwood → hafts/shields, emberwood → fire foci) plus a small
`affinity` hook (mana/affinity bonus consumed by MAGIC-SKILLS later; a cosmetic + quality edge until
then). This is what makes a `moonwood_self_bow` or a `heartwood_staff` distinct — and gives each
grove a reason to seek out.

---

## §L — Bulk Logistics (wheelbarrows, carts, roads) — **pawn-pushed carts DONE 2026-06-20**

**Goal:** implement the **personal-carry vs bulk-logistics split** parked in
[ENTITIES_SPAWNING → Hauling & Logistics Progression](ENTITIES_SPAWNING.md). Personal carry stays
low; carts let a pawn haul far more. This chapter builds that layer.

> **Shipped model (user call — simpler than the first draft below):** a cart is **not** a separate
> "bulk budget" with `bulk`-tagged resources. It is a **two-handed `tool`**: equipping a
> `wheelbarrow`/`handcart` (a) fills the **mainHand**, so the pawn can't wield a weapon — Combat falls
> back to unarmed (you can't fight while pushing a cart) — and (b) grants a big **`inventoryBonus`**
> that raises the **same** weight/volume carry budget belts/baskets already use (reusing
> `getCarryCapacityBreakdown` + `clampPickupQuantity`, no new pool, no resource tagging). **Overloading
> isn't free:** a new **load→encumbrance** term in `PawnService.getMoveSpeed` slows a pawn by its pack
> fraction (empty ≈ ×1.0, at capacity ≈ ×0.6) — general (a sack-laden pawn without a cart slows too),
> and the cart just raises the ceiling. Carts are **manually equipped** (assigned like gear), not
> auto-fetched. Roads + draft animals remain deferred (below).

### Rungs (this chapter)

| Rung               | Item / building          | Build cost (example)              | Role                                              | Dependency            |
| ------------------ | ------------------------ | --------------------------------- | ------------------------------------------------- | --------------------- |
| Bulk — near base   | `wheelbarrow`            | planks + 1 `wheel` + iron fittings| pawn-pushed; modest bulk budget; wants cleared terrain | none (ships now) |
| Bulk — near base   | `handcart`               | planks + 2 `wheel` + cordage      | bigger budget, slower loaded; first real hauler   | none (ships now)      |
| Bulk — anywhere    | `pack_animal` (panniers) | tamed draft stock + panniers      | follows a hauler pawn off-road; medium bulk       | **ENTITIES C–D**      |
| Bulk — long haul   | `draft_cart`             | cart + draft animal + harness     | big capacity on roads; far-corner mining viable   | **ENTITIES C–D**      |

`wheel` is a new crafted intermediate (planks + iron rim) — a satisfying sub-chain.

### Mechanics

- **Separate bulk-carry budget**: when a hauling pawn is assigned a cart/wheelbarrow, the
  hauling job draws from the cart's bulk budget (large), *not* personal carry. Bulk-tagged
  resources (ore/logs/hay/stone/blocks) can **only** be moved at quantity via this budget —
  personal packs never scale to stacks of ore no matter how late-game (the spine rule).
- **Loaded movement penalty**: a loaded cart slows the pawn and is **worse off-road**; roads
  remove most of the penalty. Wheelbarrows/handcarts want cleared/road tiles; pack animals
  cross forest/mountain a cart can't.
- **Roads** (optional sub-feature): `dirt_path` (cleared) → `gravel_road` → `cobble_road`
  (uses Pass I stone blocks). Build tiles that raise cart move-speed. Cross-links §3 masonry.

### Boundary

Pawn-pushed wheelbarrow + handcart + wheel + roads **ship independently now.** Pack/draft
animals **hard-block on ENTITIES_SPAWNING Phase C–D** (taming + husbandry/breeding for draft
stock) — implement those rungs when that content lands; until then carts are pawn-pushed only.
Backpack encumbrance (the light-vs-heavy personal fork) is a small `ModifierSystem` change
noted in ENTITIES_SPAWNING; fold it in here if cheap, else leave as its open question.

---

## §F — Farming, Food & Drink

**Goal:** turn food from "hunt/forage" into a planned, **soil-and-water-driven** chain — a real
*terrain* layer (soil fertility you can dig, move, and improve) feeding **growing zones → crops →
cooking/brewing**. `planting` work category + hoe tools (`digging_stick`/`stone_hoe`/`iron_hoe`)
already exist. Drives from NOTES.md (split dirt by fertility · dig/reposition soil · terraform via
compost · growing zones + seeds + wetness).

> **Spine of this rework (user model — no `tile.soil` field):** everything is **resource objects on
> tiles**, reusing the systems that already drive trees/grass/bushes — `tile.resources` (what's on a
> tile), `interactions[]` (the harvest-vs-cut split), `tile.resourceCooldowns` + `processResourceRegrowth`
> (regrowth = growth), `designations`, and `FilterableZoneType` zones. **Dirt is broken into fertility
> versions** (resource objects); which one a tile gets is driven by the **grass-density subterrain** the
> world-gen noise already places (`dirt` < `grass` < `tall_grass` < `deep_grass`, in `tile.subType`).
> **Seeds mutate what grows on a dirt tile** (plant → swap the tile's resource to a crop); the crop
> **grows via the existing regrowth cooldown**, its *speed* scaled by fertility × wetness (`tile.moisture`)
> × fertilizer × season. **No new `tile.soil` field, no new growth tick** — fertility lives in the
> resource/subterrain on the tile, growth in the regrowth timer.

### F1 — Dirt becomes fertility resource versions (NOTES.md "split dirt by fertility")

No `tile.soil` field. Fertility is a **0–100% value depicted like wetness** (`fertility 75%`), derived
from the grass-density subterrain the world-gen noise already places. `soilFertilityPct(tile)` is the
value (5 steps); `soilTierForTile(tile)` its 0–4 bucket (= pct/25) — the single reads every gate uses:

| `subType` (grass density) | fertility | tier | Soil name      | Dig (cut) extra yield | Grows                          |
| ------------------------- | --------- | ---- | -------------- | --------------------- | ------------------------------ |
| `dirt` / `savanna` / bare | 0%        | 0 | Infertile Dirt | `dirt`         | nothing (until terraformed)    |
| `grass`                   | 25%       | 1 | Poor Soil      | `poor_soil`    | hardy crops (grain/veg/legume) |
| `tall_grass`              | 50%       | 2 | Loam           | `loam`         | + fibre/fruit/herb             |
| `deep_grass`              | 75%       | 3 | Rich Soil      | `rich_soil`    | + most crops                   |
| `terra_preta` (terraform) | 100%      | 4 | Terra Preta    | `terra_preta`  | + prize crops; fastest         |

Natural ground tops out at deep-grass (75%); **terra preta (100%) is terraform-earned** (F3, compost-
gated). New **soil items** (`dirt`/`poor_soil`/`loam`/`rich_soil`/`terra_preta`, `category: "soil"`,
heavy) in `items.jsonc` — the "different dirt types" you dig up, haul, and build with. (Carry is the
per-pawn weight/volume budget from §L; no `bulk` tag — that model was dropped.)

### F2 — Dig = the harvest-vs-cut interaction (same model as trees)

Per the user: dig is to a soil/grass tile what **`woodcut` is to a tree** — the existing
`interactions[]` split. Add a `dig` `DesignationType` and a **`dig` interaction** to the grass
patches (`grass_patch`/`tall_grass_patch`/`deep_grass_patch`) and a bare-`dirt` resource: `dig`
returns **everything the normal `harvest` does (hay/fiber) + the soil item** for its tier (the
"extra yield"), and **depletes** the node (`harvestDepletes: true`), leaving bare `dirt`. So digging
a deep-grass tile gives hay + fiber + **`terra_preta`**, and you re-lay that soil elsewhere (F3).
Reuses `jobs/harvest.ts` wholesale — `dig` is just another harvest designation + interaction.

### F3 — Terraforming = the build menu (compost gates the good soil)

Per the user: "placing different types of soil should work via the building menu." A **Soil Works**
family in the **build tab** (`lay_poor_soil`/`lay_loam`/`lay_terra_preta`) builds like a passable
building; on completion it **places the matching fertile resource + sets `subType`** (e.g. deep_grass
→ a terra-preta-bearing tile) so the tile becomes plantable, consuming the **soil item** (+ **compost**
for loam→terra preta — the gating material). Restores base on deconstruct. Mirrors how a build already
writes a persistent tile field (the `walkable`/movementCost path). This is how a dug-out (infertile)
tile is improved back up, and how you concentrate terra preta onto a farm.

### F4 — Growing zones + the `plant` job ("seeds mutate what grows on the dirt tile")

A `grow` `FilterableZoneType` (paint like `harvest`/`stockpile`; filter = the seed/crop). A new
**`plant`** JobDef (`workCategory: "planting"`) is generated for eligible tiles in a grow zone — a
tile whose `soilTierForTile` ≥ the crop's `minSoil` and that has no crop yet. On completion the pawn
**sows the seed → swaps the tile's resource to the crop** (`tile.resources[crop] = 1`, immature)
and starts its growth cooldown (F5). Reuses the zone + designation + `planting` plumbing; consumes
one seed from stock.

### F5 — Growth = the existing regrowth mechanic (no new tick)

Per the user: crops "just use the regrowth mechanic for trees and bushes already implemented." A
planted crop is a **persistent resource** that starts **cooling down** (= growing); when its
`resourceCooldowns` entry expires, `GameEngineImpl.processResourceRegrowth` refills `tile.resources`
→ the crop is **mature/harvestable**. No per-tick growth loop is added. **Growth *speed* = the
regrowth duration**, and we extend the existing duration scaler (today `seasonRegrowthMultiplier`)
into:

```
effectiveRegrowth = baseRegrowthTurns / (fertilityFactor × wetnessFactor × fertilizerFactor × seasonFactor)
```

- **fertility** — `soilTierForTile` (terra preta fastest); below `minSoil` the seed can't be planted at all (F4).
- **wetness** — a comfort band around the crop's `idealMoisture` (`tile.moisture`); too dry/too wet slows it.
- **fertilizer** — `compost` baked into terra preta (F3) is the **hard gate** for prize crops; speeds others.
- **season** — frost halts/kills immature crops (SEASONS_WEATHER hook, already in the scaler).

Harvest a mature crop → food **+ replacement seed** (self-sustaining). Perennials (berries/herbs)
persist and regrow; annuals (grain/veg) deplete to bare dirt (`harvestDepletes`) — you replant.
The info panel (F9) shows growth as the **cooldown progress %** (the "growth level" the request
asked for, read from the regrowth timer rather than a new field).

### F6 — Crops (Phase 1) — resource objects in `resources.jsonc`

Each crop is a resource object (like a berry bush) with a `plant` interaction (sow) + a `harvest`
interaction (reap), `minSoil`, `idealMoisture`, and yields = food + `*_seed`:

| Crop          | seed         | `minSoil` | grows on            | Chain                                            |
| ------------- | ------------ | --------- | ------------------- | ------------------------------------------------ |
| Wheat / Barley| `grain_seed` | 1 poor    | grass+              | grain → (quern) flour → (oven) bread; barley → malt → **ale** |
| Cabbage/Turnip/Onion | `veg_seed` | 1 poor | grass+            | cooking ingredient; meal variety                 |
| Beans/Peas    | `legume_seed`| 1 poor    | grass+              | protein; stores well                             |
| Flax / Hemp   | `fibre_seed` | 2 loam    | tall_grass+         | plant stalks → retted fibre (cordage/cloth, Pass I) |
| Berries/Orchard fruit | `fruit_seed` | 2 loam | tall_grass+    | fruit → **wine/cider**; preserves (perennial)    |
| Culinary herbs| `herb_seed`  | 2 loam    | tall_grass+         | meal flavour (mood) + medicine (perennial)       |
| Prize crops (pumpkin/grapevine) | `prize_seed` | 3 terra preta | **terra preta only** | high-value cooking/brewing; the compost payoff |

Seeds first come from **foraging** wild grain/berries (→ seed), so farming bootstraps from the
existing forage loop.

### F7 — Fertilizer workstations (the gating material)

| Station       | id            | Makes                                                  |
| ------------- | ------------- | ------------------------------------------------------ |
| Compost Bin   | `compost_bin` | rotten items (`rotten_food`/`rotten_hide`/…) + `hay` + `ash` → **`compost`** (passive timer) |
| (later) Manure| —             | husbandry animals (**ENTITIES D**) → `manure` (stronger) |

`compost` is the **core gating material**: required to terraform **terra preta** (F3) and to grow
**high-tier crops** (F5/F6). It closes a loop — rot/scraps + hay + ash become the input to your best
soil. Compost Bin is a new **passive** building (like the charcoal pit).

### F8 — Milling, baking, brewing (the food chain)

| Station        | id          | Makes                                                    |
| -------------- | ----------- | ------------------------------------------------------- |
| Quern          | `quern`     | grain → flour                                            |
| Oven           | `oven`      | flour (+ water) → bread; pies; roasts                    |
| Fermenter      | `fermenter` | malt → **ale**; fruit → **wine/cider**; honey → **mead** |

Brewing is a **passive fermentation timer** (barley → malt → mash → ale). Alcohol is a **mood good**:
a mood lift + a short `intoxicated` condition. (Deeper joy needs → SOCIAL-LAYER.)

### F9 — Info panel (make the new layers legible)

The tile/resource inspector must surface the new state (reuse `StatBar`/`SelectedEntityCard`, no
ad-hoc UI): **soil fertility** (the `soilTierForTile` level + name), **wetness %** (`tile.moisture`),
and for a growing crop its **maturity %** (from the regrowth cooldown progress) + what's gating its
speed ("slow: too dry", "needs loam to plant"). This is how the player reads why a field is or isn't
growing.

### F10 — Meal variety & immersion (the payoff)

Cooking combines crops + meat/dairy/eggs → varied **meals** with nutrition **and** mood; a
**meal-variety** signal decays a repeated dish's mood bonus and a varied diet restores it. §Q quality
applies to cooked meals (Masterwork cook → higher-mood food). Dairy/eggs from
[ENTITIES_SPAWNING Phase D](ENTITIES_SPAWNING.md) drop straight in.

---

## Cross-Chapter & Cross-Spec Dependencies

| This chapter | Hard blocker                          | Benefits from                                   | Feeds forward                          |
| ------------ | ------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| §Q Quality   | —                                     | EQUIPMENT [x] (materialBonuses path)            | every other chapter's craftables       |
| §M Magic     | — (passive; no spell engine)          | RESEARCH (gating); §Q (gem quality scales boost)| **MAGIC-SKILLS Phase 0** — the magical-condition buff layer + foci materials its active spells/skill-nodes reuse |
| §L Logistics | animal rungs: **ENTITIES C–D**        | Pass I masonry (roads); §F (hauling field goods)| big-map play; husbandry payoff         |
| §F Farming   | —                                     | SEASONS [x] (growing seasons); ENTITIES D (manure/dairy); §Q (meal quality) | cooking, brewing, husbandry feed |

---

## Implementation Plan

Suggested order: **§Q first** (small, completes a blocked mechanic, multiplies the value of all
existing craftables), then **§F** (biggest playability gain), then **§M**, then **§L** (its
best rungs wait on husbandry anyway). Each step: `pnpm check` + `pnpm test` green; new data in
`recipes.jsonc`/`items.jsonc`/`buildings.jsonc`/`resources.jsonc` (definitions only — logic in
services); new ADR if a non-obvious choice is locked.

### §Q — Item Quality ✅ **DONE 2026-06-18**

- [x] `core/types/items.ts`: `ItemQuality = 0–5` + `quality?` on `ItemInstance`; `core/types/jobs.ts`: `quality?` on the per-stack `DroppedItem`. Tier/prefix/multiplier/colour table in `core/itemQuality.ts`.
- [x] `rollCraftQuality(craftingQualityAxis, rand)` helper; thresholds + ±0.18 jitter + skill-scaled master long tail (Legendary reachable for masters, ~never for journeymen).
- [x] `JobService` craft-completion (`jobs/craft.ts`) **stamps** `quality` on the output stack — rolled from the working pawn's `crafting_quality` work-axis (stats.jsonc); equipment/tools only; no cross-tier merge (guarded in `absorbDropIfOnStockpileTile`); passive/no-pawn production → unstamped (Standard).
- [x] Quality propagated `DroppedItem.quality` → `ItemInstance.quality` on equip (`equipFromTile`), then **consumed**: Combat scales equipped weapon (`scaleWeaponQuality`) + worn armour (`scaleArmorQuality`); PawnStatService scales held-tool work boost. — closes R8 consumer side. **NB:** the EQUIPMENT `materialBonuses`/`applyMaterialBonuses` machinery was never wired into craft completion (dead code) and readers pull stats from the item *definition*, so the consumer was built as a fresh per-instance scaling layer rather than "riding" that path.
- [x] Name-prefix in `getItemDisplayName` (`qualityPrefix`); tier colour via `qualityColor` (grey→amber→green→blue→purple→gold palette).
- [x] Tests: `core/itemQuality.test.ts` (18) — seeded roll distribution + deterministic band boundaries + long tail, tier accessors, weapon/armour scaling, stamp-on-output (equipment vs bulk material vs passive), display prefix. R8 row ticked in ROADMAP. `pnpm test` green (380); `pnpm check` clean for §Q (2 pre-existing `entitySim.test.ts` errors are unrelated).
- [x] **Cooked-meal quality (nutrition) — DONE.** A FOOD recipe rolls its quality from the cook's `cooking_quality` work-axis (not `crafting_quality`) in `jobs/craft.ts`, and the tier scales the meal's **nutrition yield** (×0.8–×1.8 via `qualityMultiplier`, with an rng fractional carry so single-portion meals still benefit) at cook completion. Bulk food carries no per-unit identity, so quality lands as cook-time YIELD rather than a per-stack tier.
- [ ] **Still deferred — meal MOOD / per-portion nutrition tier:** requires cooked food to become a per-instance / quality-keyed stack (today it's a bulk `stockpile` aggregate eaten by summing each item's static `nutrition`, with no eat-time hook to read a tier). That's the §F per-instance-food rework — the dining-pleasure dimension can't ride the bulk model.
- [ ] **Deferred:** quality through the bulk-`items` tool-fetch path — tools auto-fetched from colony stock are bulk counts (no per-stack instance), so carry no quality; tools equipped from a loose drop do.

### §F — Farming, Food & Drink

Phased so each is independently shippable + testable (`pnpm check`/`pnpm test` green each). **Resource-
driven model — no `tile.soil` field, no new growth tick** (reuses `tile.resources`, `interactions[]`,
`resourceCooldowns`/`processResourceRegrowth`, designations, zones). **P1–P3 = soil/terrain foundation**;
**P4–P6 = farming loop**; **P7 = food chain**. ADR for "dirt/crops as resource versions + regrowth-as-
growth" (the non-obvious reuse decision).

**P1 — Dirt fertility versions + soil items (F1) ✅ DONE 2026-06-20** (`check`/`test` green; 4 soil tests)
- [x] `items.jsonc`: soil items `dirt`/`poor_soil`/`loam`/`rich_soil`/`terra_preta` + `compost` (`category: "soil"`, heavy, non-rotting).
- [x] `core/Terrains.ts`: **`soilFertilityPct(tile) → 0/25/50/75/100`** (depicted like wetness) from `subType`, + `soilTierForTile` 0–4 bucket + `SOIL_TIER_NAME`/`SOIL_ITEM_BY_TIER`/`SUBTYPE_BY_SOIL_TIER`. Derived, no stored field. (Also restored `terrainBlocksSight`, which a prior Terrains.ts edit had dropped.)
- [x] Info panel (F9): tile HUD shows **`fertility X%`** (tier-coloured, name in tooltip) next to wetness — replacing the soil-name readout. `core/soilFertility.test.ts`.

**P2 — Dig = cut interaction (F2)**
- [ ] `DesignationType += 'dig'`; add a `dig` interaction (`harvestDepletes: true`) to `grass_patch`/`tall_grass_patch`/`deep_grass_patch` (+ a bare `dirt` resource) yielding the normal harvest drops **+ the tier's soil item**; `resourceObjectService.getByDesignation` + `HARVEST_DTYPES` include `dig`. Reuses `jobs/harvest.ts` (no new handler). Test: dig deep_grass → hay + fiber + `terra_preta`, node depletes to dirt.

**P3 — Terraforming / Soil Works build menu (F3)**
- [ ] `buildings.jsonc`: `lay_poor_soil`/`lay_loam`/`lay_terra_preta` (passable tile-improvement builds); recipes consume the soil item (+ `compost` for loam→terra preta).
- [ ] `BuildingService`: on complete place the fertile resource + set `subType`; restore on deconstruct (mirror the `walkable`/movementCost tile-write). Test: build `lay_terra_preta` on a dirt tile → `soilTierForTile` = 3.

**P4 — Grow zone + `plant` job (F4)**
- [ ] `FilterableZoneType += 'grow'` (filter = seed/crop); zone paint + `zoneTiles` wiring.
- [ ] `jobs.jsonc` `plant` JobDef (`workCategory: "planting"`) + `Job['type']` + JobService handler; generate for eligible empty tiles in a grow zone (`soilTierForTile ≥ crop.minSoil`); completion consumes a seed + sets `tile.resources[crop]=1` (immature) and starts its growth cooldown.

**P5 — Growth via regrowth + crops (F5/F6)**
- [ ] `resources.jsonc`: crop resource objects (grain/veg/legume/fibre/fruit/herb/prize) with `plant`+`harvest` interactions, `minSoil`, `idealMoisture`, `baseRegrowthTurns`, yields = food + `*_seed`; wild grain/berry → seed forage.
- [ ] Extend the regrowth-duration scaler (where `seasonRegrowthMultiplier` is applied in `jobs/harvest.ts` / on plant) by `fertility × wetness × fertilizer`; stunt-gate at `minSoil`; frost halt (SEASONS). Info panel shows maturity % from the cooldown (F9). **No new per-tick loop.**

**P6 — Fertilizer (F7)**
- [ ] `buildings.jsonc`: `compost_bin` (passive); `recipes.jsonc`: rotten items + `hay` + `ash` → `compost` (passive timer). `compost` is a **build material** for `lay_terra_preta` (P3) — the gate for prize crops. Manure path stubbed behind ENTITIES D.

**P7 — Food chain + meals (F8/F10)**
- [ ] `items.jsonc`: crop products, flour/bread/malt/ale/wine/mead. `buildings.jsonc`: Quern, Oven, Fermenter. `recipes.jsonc`: milling, baking, fermentation (passive timer).
- [ ] Meal-variety mood signal (recent-meal memory → mood delta); alcohol mood lift + `intoxicated` condition (`conditions.jsonc`). Dairy/egg recipes stubbed for ENTITIES D.

### §M — Magical Resources & Gear (MAGIC-SKILLS Phase 0 — passive foundation) ✅ DONE 2026-06-18 (`pnpm check`/`pnpm test` green, 9 new tests)

- [x] `resources.jsonc`: a rare grove per ancient wood (`heartwood_grove`/`moonwood_grove`/`ironwood_grove`/`emberwood_grove`); 7 typed crystal nodes (`ruby_node`…+ the repurposed `crystal_formation`→amethyst) on cave/rocky/cliff, each yielding its normal crystal (1–2) + an occasional infused (0–1). Data-driven world-gen picks them up automatically. **Note:** the uniform `min/max` yield engine can't do an exact 85/15 split, so infused rarity comes from sparse node spawn + the 0-floor roll (not a weighted pick — engine left untouched).
- [x] **Grove polish (2026-06-18):** each grove carries a dim affinity-coloured `glow` (new optional `ResourceObjectDef.glow`) — a steady soft point-light (emberwood flickers) collected by `LightingService.collectResourceEmitters` and baked into the tile-light field like a campfire but dimmer (intensity ~0.4–0.5 vs fire 1.1), so groves stand out. Harvest is **tool-tier gated for balance**: heartwood/moonwood/emberwood need a tier-2 axe, ironwood a tier-3. Added the missing `iron_axe` (t2) + `steel_axe` (t3) woodcutting tools (already referenced by `Work.ts`) + anvil recipes (gated by iron_working/steel_making).
- [x] `items.jsonc` (per-type pattern, no generic item): 4 `*_log` `magic_wood` species (+ `affinity`); per mineral a normal `<crystal>` + `infused_<crystal>` + `cut_<crystal>` (trade gem) + `attuned_<crystal>` (enchant gem); 7 rings + 7 amulets (`type: armor`, `grantsConditions`).
- [x] `conditions.jsonc`: 7 magical buff conditions (`might`/`insight`/`vigor`/`quickness`/`keen_senses`/`charm`/`moonlit`), each `"duration": "transient"` + `"magical": true`. **They use the already-consumed modifier keys** (workEfficiency/moveSpeed/fatigueRate/hungerRate/dodge) so they apply with zero new consumption wiring; channels are a tunable first pass (no key-set extension was needed).
- [x] `Item.grantsConditions?: string[]` field; `syncTransientConditions` (now exported) pushes a worn item's `grantsConditions` ids each tick (auto-clear on unequip). **No** `statBonuses`/`grantsTraits`/ModifierSystem reader work — buffs ride the existing condition pipeline. `TransientConditionDef.magical?` flag added.
- [x] `EquipmentSlot` + `PawnEquipment`: added `amulet` (distinct neck slot from `gorget`). Rings cap is the single `ring` slot; with the `amulet` slot that's 2 jewellery slots total (the intended loadout cap) — no multi-ring plumbing.
- [x] `lapidary_bench` building (gated by `arcane_lapidary`) + recipes.jsonc two families: trade-gem cutting (gate `arcane_lapidary`) and attunement→assembly into rings/amulets (gate `attunement`). `research.jsonc`: added `arcane_lapidary` + `attunement` nodes.
- [x] **Foundation hook:** MAGIC-SKILLS' active spells/skill-nodes apply the *same* magical conditions on demand — the buff layer is built once here. (Also updated MAGIC-SKILLS.md to point at this as its Phase 0.)
- [ ] **Deferred:** §Q quality→buff-strength scaling — rings/amulets (armor) DO get a §Q quality tier stamped at craft, but the granted buff is currently fixed per item id (quality doesn't yet pick a stronger condition variant). Amulet "stronger than ring" is likewise deferred (both grant the same buff today; amulet's edge is the extra slot + larger gem cost). **NB:** the ancient-wood **staves** below DO consume their §Q tier (weapon → scaleWeaponQuality scales the shot).
- [x] **Ancient-wood ARCANE STAVES — DONE 2026-06-19.** The ancient woods are now consumed (each shafts a staff). Staves are **INT-scaled (`arcane`) channeled (`channeled`) ranged elemental weapons**: they fire on the existing ranged circuit (aim_accuracy/aim_speed/aim_range, distance falloff, cadence floor) but draw **no ammo** — each shot pays its `staminaCost` as **mana** (winded = out of mana) and the staff stays in hand (the no-ammo branch skips the thrown self-consume when `channeled`). Damage scales on **INT** via a new `arcane` flag mirroring the rapier's `finesse`→PER (`powerStat = arcane ? INT : finesse ? PER : STR`). **Two workbench tiers, iron→steel-style** (`buildings.jsonc`): **Runecarver's Bench** (gate `arcane_lapidary`, T1: magic-wood + a **cut** crystal) → **Attunement Altar** (gate `attunement`, costs an attuned gem to build, T2: magic-wood + an **attuned** crystal + gold, and the staff `grantsConditions` the gem's buff while wielded). 3 elements × 2 tiers = 6 staves: Ember/Pyre (ruby→fire, emberwood), Frost/Rime (sapphire→frost, moonwood), Spark/Tempest (topaz→lightning, heartwood). §Q quality is stamped (type:weapon) and auto-scales the shot. (Per the user: **no "focus" items** — gear is either passive jewelry or an offensive staff.)
- [x] **Elemental damage + resistances wired — DONE 2026-06-19.** `DamageType` extended with `fire | frost | lightning` (+ `frostbite`/`scorch` wound defs; `fire`→existing `burn`). Each elemental hit is mitigated in `Combat.physicalResistance` by its **already-existing** `stats.jsonc` resistance axis (fire/frost→CON, lightning→DEX — matching `fire_resistance`/`cold_resistance`/`lightning_resistance`), plus racial `fireResistance`/`coldResistance` traits. **Creatures now carry thematic `resistances`** (new `CreatureDefinition.resistances`, `creatures.jsonc`): shadow_wraith (frost/lightning-resistant, fire-vulnerable), woolly_mammoth/hoarfowl/giant_olm (frost-resistant), marsh_viper/mire_crocodile (cold-blooded → frost-vulnerable). Negative = vulnerability; final clamps 0–0.9. Staff bolts render with elemental FX (`fx-fireball`/`fx-frostbolt`/`fx-spark`).
- [x] **Regalia expansion — DONE 2026-06-19.** Combo & head jewelry giving the player a real "magic boosts vs metal armour" loadout fork, with a **power gradient by slot**. **4 crowns/circlets** (`scholars_circlet`/`champions_crown`/`sovereign_crown`/`wardens_circlet`) sit in the **`headOuter` (helmet) slot** — a buff crown means forgoing a helm (token defense only), the explicit head-armour trade. **4 torcs/pendants** (amulet slot) — these and the crowns are the **two-buff combos** (two attuned gems → two conditions; strong, costly). **Rings stay SINGLE-buff** (the existing 7 elemental `<gem>_ring`s) and there are now **two ring slots** (`ring`/`ring2`, occupancy-resolved in `resolveEquipSlot` so a 2nd ring fills `ring2` instead of swapping) — so a full jewelry loadout is **1 crown + 1 amulet + 2 rings**, and the weaker single buffs are *distributed onto the rings* by design (no combo rings). Two new transient magical buffs are the *defensive* magic answer to armour: **`grace`** (dodge ×1.18) and **`fortitude`** (fatigue ×0.82 + hunger ×0.90). All craft at the `lapidary_bench` (gate `attunement`). The `EquipmentDoll` gained the missing `amulet` slot + the 2nd ring. 3 new magicGear tests (17 total).
- [x] **Tests + gates:** `magicGear.test.ts` extended (14 total) — staves are arcane/channeled/ranged with the right element, T2 grants the gem buff while wielded, recipes wire to the two benches, **INT scales staff damage** (high-INT >> low-INT, like rapier→PER), and **frost resistance mitigates** (frost-resistant mammoth takes far less than frost-vulnerable viper). `pnpm test` green (427); `pnpm check` clean for this work (only the 2 pre-existing unrelated `entitySim.test.ts` errors remain).

### §L — Bulk Logistics — **pawn-pushed carts DONE 2026-06-20** (`pnpm check`/`pnpm test` green, 475; 5 new)

- [x] `wheel` intermediate (`make_wheel`: planks + iron rim, anvil/iron_working) + `wheelbarrow`/`handcart` recipes; carts are two-handed `tool`s (mainHand) with an `inventoryBonus` — equipped like gear.
- [x] **Carts expand the existing carry budget** (not a separate pool): `getCarryCapacityBreakdown` now sums `inventoryBonus` from **every** equipped slot (so a cart counts from mainHand), and `clampPickupQuantity` rides that raised budget unchanged. No `bulk` resource tag — the first-draft "separate bulk-carry budget" was dropped as over-engineered (user call).
- [x] **Melee break:** a cart fills the mainHand and has no `weaponProperties`, so `Combat.attackerProfile` falls back to unarmed — you can't fight while pushing a cart (free, no new combat wiring).
- [x] **Loaded movement penalty:** general **load→encumbrance** factor in `PawnService.getMoveSpeed` (pack fraction → ×1.0…×0.6); skipped for unladen pawns (hot-path guard), worn gear excluded (body-weight `weightFactor` already covers armour).
- [ ] **Deferred — roads** (`dirt_path`/`gravel_road`/`cobble_road` lowering tile `movementCost`); off-road-specific penalty. (Encumbrance already makes a full cart slow; roads would offset it.)
- [ ] **Deferred — pack-animal + draft-cart rungs** behind ENTITIES C–D (draft stock); harness/panniers items.
- [ ] (Optional) backpack encumbrance fork in `ModifierSystem` — **subsumed** by the general load→encumbrance term above for the move-speed half; the light-vs-heavy *carry-mode* fork stays an ENTITIES open question.

---

## Open Questions

- [ ] **Quality floor:** does Crude (tier 0) appear for a competent colony, or is tier 1 the practical floor (Crude only on injured/dark/rushed crafts)? // possible to roll on every craft, greatly increased bad skill (which injured transfers into), low sight (which also lowers crafting), rushed is not an existing mechanic
- [ ] **Batch quality:** when a recipe outputs a stack > 1 (food batches), is quality per-stack-uniform or per-unit? (Per-batch uniform is simpler; per-unit is finer but fragments stacks.) // per stack is fine
- [ ] **Magic gating:** is the "Arcane Lapidary" gate a full RESEARCH-ENHANCEMENT node, or a standalone research now and folded into the lore-tier tree later? // research as a gate is deferred, everything will be gated behind research eventually, but its just one data bool in the recipe.jsonc, not necessary to make a big thing out of it now
- [ ] **Amulet vs ring slot:** dedicated `amulet` slot (chosen) vs treating amulets as a second `ring` — confirm. // dedicated amulet slot that conflicts with specialised neck gear
- [ ] **Bulk tag:** which resources are "bulk-only" (ore/log/hay/stone/block) vs personal-carriable, and where the tag lives (item field vs category).no bulk modeling, its deprecated for per pawn/entity carry capacity
- [ ] **Road model:** build-tile road (chosen) vs derived "trampled path" from repeated pawn traffic. both can be implemented eventually, often traversed paths can over time become "packed dirt", which has a slightly lower movement cost the dirt, building cobble/brick roads will then completely remove any movement cost unlocking fast movement, but this system is not a priority at all, only an possible idea, deferred
- [ ] **Crop persistence/save:** `tile.soil` + growing crops serialise with the world (assume yes — `tile.soil` is a persisted WorldTile field like `snow`/`walkable`). there should be no "tile.soil", instead growth is tied to the specific resource tile, breaking dirt into several versions ensures the relevant ones grow something others dont, seeds just mutate what grows on the dirt tile and the growing zone instructs pawns where to put the seeds 
- [ ] **Alcohol depth:** mood-good only now vs a recreation/joy need — defer the need to SOCIAL-LAYER? mood only
- [ ] **Spoilage of produce:** crops/bread/ale reuse Pass I `decaySeconds` + storage; confirm no new decay model needed.
- [x] **§F soil source of truth → RESOLVED (user):** **no `tile.soil` field.** Fertility lives in the **dirt/grass resource version** on the tile (driven by the grass-density subterrain noise), read via `soilTierForTile`. → F1.
- [x] **§F dig vs clear → RESOLVED (user):** `dig` is the **same harvest-vs-cut model as trees** — a `dig` interaction that returns the normal harvest + extra (the soil item) and depletes the node. → F2.
- [x] **§F fertilizer → RESOLVED (user):** `compost` is a **build material** for better soil; placing soil types goes through the **building menu** (Soil Works). → F3/F7.
- [x] **§F growth → RESOLVED (user):** crops **reuse the existing tree/bush regrowth mechanic** (`resourceCooldowns` + `processResourceRegrowth`) — growth = the cooldown, speed = its duration scaled by fertility × wetness × fertilizer × season. No new tick. → F5.