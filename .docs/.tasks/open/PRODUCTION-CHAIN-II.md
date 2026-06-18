<!-- LOC cap: 500 (created: 2026-06-18) -->

# PRODUCTION CHAIN II — Quality, Magic, Logistics & Farming

> **Related:** [ROADMAP](ROADMAP.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) (logistics + husbandry) · [MAGIC-SKILLS](MAGIC-SKILLS.md) (foci materials) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) (gating) · [RANGED-COMBAT](RANGED-COMBAT.md) · archived: [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (Pass I) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) (materialBonuses) · [SEASONS_WEATHER](../archive/SEASONS_WEATHER-2026-06-17.md) (growing seasons) · [game/DESIGN](../../game/DESIGN.md)

## Status

**[~] In progress** — **§Q (Item Quality) is DONE (2026-06-18)**, closing R8; **§M / §L / §F not started.**
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
| **§M — Magical Resources & Gear**    | ancient trees + crystals → rings/amulets (stats/traits) | independent of MAGIC-SKILLS (passive gear)   |
| **§L — Bulk Logistics**              | wheelbarrows, handcarts, draft-animal carts, roads      | animal carts need ENTITIES C–D (husbandry)   |
| **§F — Farming, Food & Drink**       | crops, seeds, fertilizer, brewing, meal variety         | benefits SEASONS (growing seasons) + ENTITIES D (manure/dairy) |

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
- **No `statBonuses` / `grantsTraits` item fields yet** — §M adds them (read by
  `PawnStatService` / `ModifierSystem`). Trait ids come from `database/racial-traits.jsonc`.
- **Work categories exist**: `planting` (tools `digging_stick`/`stone_hoe`/`iron_hoe`),
  `cooking`, `alchemy`, `hauling`. **No crop/seed/fertilizer/brewing data exists** — §F adds it.
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

## §M — Magical Resources & Gear

**Goal:** rare magical materials feed **passive stat/trait equipment** (rings, amulets, and
better foci/bows). Ships **without** the spell engine — these are equip-time stat modifiers.
MAGIC-SKILLS later consumes the same materials for spell foci (forward hook, not a dependency).

### New resources (world-gen)

| Resource              | Node                          | Yields                    | Rarity      | Feeds                                |
| --------------------- | ----------------------------- | ------------------------- | ----------- | ------------------------------------ |
| **Ancient tree**      | `heartwood_tree` (rare grove) | `heartwood` (magic log)   | very rare   | staves, magic bows, prestige furniture, high quality+ material bonus |
| **Mana crystal (×N)** | `crystal_node` on mountain    | raw `*_crystal` (coloured)| rare        | cut gems → rings/amulets             |

Heartwood groves are a rare biome feature (a handful per map); crystal nodes cluster like the
Pass I mineral veins (`fillResourceClusters`). Both are **research-gated** before they can be
worked (an "Arcane Lapidary" / "Attunement" unlock — light tie to RESEARCH-ENHANCEMENT).

### New station — Lapidary / Jeweler's Bench

`lapidary_bench` (cut stone block + bronze tools): cuts/polishes raw crystal → `cut_<crystal>`
gems, and assembles gems + precious metal (`gold_bar`/`silver_bar`) into rings & amulets.

### New item fields (read by PawnStatService / ModifierSystem)

```typescript
// core/types/items.ts additions
statBonuses?: Partial<Record<StatId, number>>; // flat stat boost while equipped
grantsTraits?: string[];                         // trait ids granted while equipped (racial-traits.jsonc)
```

`ModifierSystem` adds equipped-item `statBonuses` to the pawn's stat roll (with `sources[]`
entries, per the modifier rule) and folds `grantsTraits` into the trait set while worn.

### Crystal → effect mapping (Phase 1)

| Crystal     | cut gem        | Effect (while equipped)                  |
| ----------- | -------------- | ---------------------------------------- |
| Ruby        | `cut_ruby`     | +strength                                |
| Sapphire    | `cut_sapphire` | +intelligence                            |
| Emerald     | `cut_emerald`  | +constitution                            |
| Topaz       | `cut_topaz`    | +dexterity                               |
| Amethyst    | `cut_amethyst` | +wisdom                                  |
| Moonstone   | `cut_moonstone`| grants a **trait** (e.g. night-sight / calm) |

Magnitude scales with **gem quality** (§Q applies to the cut — a Masterwork-cut ruby gives a
bigger boost). Amulets (new `amulet` slot) take a larger gem than rings → stronger bonus.

### New equip slot

Add `amulet` to `EquipmentSlot`. Rings use the existing `ring` slot. Cap rings (e.g. 2) so gem
gear is a real loadout choice, not a stat-stick pile-on.

### Heartwood gear

`heartwood` is a premium wood material: it gives the best `materialBonuses` shaft/handle roll
for bows/staves and a small **affinity** stat hook (mana/affinity bonus consumed by MAGIC-SKILLS
later; until then a cosmetic + quality edge). This is what makes a `heartwood_self_bow` distinct.

---

## §L — Bulk Logistics (wheelbarrows, carts, roads)

**Goal:** implement the **personal-carry vs bulk-logistics split** parked in
[ENTITIES_SPAWNING → Hauling & Logistics Progression](ENTITIES_SPAWNING.md). Personal carry
(worn packs) stays hard-capped low; **bulk goods (ore, logs, hay, stone) move only via the
logistics layer.** This chapter builds that layer.

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

**Goal:** turn food from "hunt/forage" into a planned, seasonal, **variety-driven** chain that
feeds cooking, brewing, and husbandry. `planting` work category + hoe tools already exist.

### Farm plots

A `farm_plot` designation: a pawn tills soil with a hoe → tilled tiles accept seeds. Crops grow
over in-game time and **only during growing seasons** (ties to [SEASONS_WEATHER](../archive/SEASONS_WEATHER-2026-06-17.md):
frost kills/halts immature crops; growth speed tracks temperature/season). Harvest yields food
**+ replacement seeds** (so farming is self-sustaining once started).

### Crops (Phase 1)

| Crop          | seed            | Grows → harvest                         | Chain                                            |
| ------------- | --------------- | --------------------------------------- | ------------------------------------------------ |
| Wheat / Barley| `grain_seed`    | grain                                   | grain → (quern) flour → (oven) bread; barley → malt → **ale** |
| Cabbage/Turnip/Onion | `veg_seed` | vegetables                            | cooking ingredient; meal variety                 |
| Beans/Peas    | `legume_seed`   | legumes                                 | protein; stores well                             |
| Flax / Hemp   | `fibre_seed`    | plant stalks → retted fibre             | cross-links cordage/cloth (Pass I)               |
| Berries/Orchard fruit | `fruit_seed`/sapling | fruit                       | cooking; **wine/cider**; preserves               |
| Culinary herbs| `herb_seed`     | herbs                                   | meal flavour (mood) + medicine (caretaking)      |

Seeds are first obtained by **foraging** (wild grain/berries → seed) so farming bootstraps from
the existing forage loop.

### Fertilizer

| Fertilizer | Source                                   | Effect                       |
| ---------- | ---------------------------------------- | ---------------------------- |
| `compost`  | food scraps + `ash` + time (Compost Bin) | +crop yield/growth           |
| `manure`   | husbandry animals (**ENTITIES D**)       | stronger; ties pastures→fields |

Compost ships now (uses Pass I `ash`); manure is a bonus once husbandry lands. Compost Bin is a
new passive building (like the charcoal pit).

### Milling, baking, brewing

| Station        | id              | Makes                                            |
| -------------- | --------------- | ------------------------------------------------ |
| Quern / Millstone | `quern`      | grain → flour                                    |
| Oven           | `oven`          | flour (+ water) → bread; pies; roasts            |
| Brewery / Vat  | `fermenter`     | malt → **ale**; fruit → **wine/cider**; honey → **mead** |

Brewing is a **fermentation timer** (passive, multi-day) — barley → malt → mash → ale. Alcohol
is a **mood/recreation** item: drinking gives a mood lift + a light `intoxicated` condition
(short-lived). (Deeper recreation/joy needs → SOCIAL-LAYER; here alcohol is just a mood good.)

### Meal variety & immersion (the payoff)

Cooking combines crops + meat/dairy/eggs → varied **meals** with nutrition **and** mood. Add a
**meal-variety** signal: eating the same dish repeatedly decays its mood bonus; a varied diet
restores it — so farming/cooking breadth *matters* beyond raw calories. §Q quality applies to
cooked meals (a Masterwork cook → tastier, higher-mood food). Dairy/eggs from
[ENTITIES_SPAWNING Phase D](ENTITIES_SPAWNING.md) drop straight into these recipes.

---

## Cross-Chapter & Cross-Spec Dependencies

| This chapter | Hard blocker                          | Benefits from                                   | Feeds forward                          |
| ------------ | ------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| §Q Quality   | —                                     | EQUIPMENT [x] (materialBonuses path)            | every other chapter's craftables       |
| §M Magic     | — (passive; no spell engine)          | RESEARCH (gating); §Q (gem quality scales boost)| MAGIC-SKILLS (foci/heartwood materials)|
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
- [ ] **Deferred to §F:** cooked-meal quality (cooking nutrition/mood) rides §F's cooking chain, not the `crafting` category.
- [ ] **Deferred:** quality through the bulk-`items` tool-fetch path — tools auto-fetched from colony stock are bulk counts (no per-stack instance), so carry no quality; tools equipped from a loose drop do.

### §F — Farming, Food & Drink

- [ ] `resources.jsonc`/`items.jsonc`: wild seed forageables; crop seeds; crop products; flour/bread/malt/ale/wine/mead/compost.
- [ ] `farm_plot` till-and-sow designation; crop growth tick (season-gated — SEASONS hook; frost halt/kill).
- [ ] `buildings.jsonc`: Compost Bin (passive), Quern, Oven, Fermenter.
- [ ] `recipes.jsonc`: milling, baking, fermentation (passive timer), compost.
- [ ] Meal-variety mood signal (recent-meal memory → mood delta); alcohol mood lift + `intoxicated` condition (`conditions.jsonc`).
- [ ] Manure path stub behind ENTITIES D; dairy/egg recipes stubbed for when husbandry lands.

### §M — Magical Resources & Gear

- [ ] `resources.jsonc`: `heartwood_tree` rare grove; `crystal_node` veins (clustered like minerals).
- [ ] `items.jsonc`: `heartwood`, raw crystals, `cut_<crystal>` gems, rings, amulets; `statBonuses`/`grantsTraits` fields.
- [ ] `EquipmentSlot`: add `amulet`; cap rings.
- [ ] `lapidary_bench` building + cut/assemble recipes; research gate ("Arcane Lapidary").
- [ ] `ModifierSystem`/`PawnStatService`: apply equipped `statBonuses` (with `sources[]`) + `grantsTraits` while worn.
- [ ] Gem-quality (§Q) scales bonus magnitude; heartwood `materialBonuses` + affinity hook.

### §L — Bulk Logistics

- [ ] `wheel` intermediate; `wheelbarrow` + `handcart` items; assign-to-hauler flow.
- [ ] Separate **bulk-carry budget** on the hauling job; **bulk-tagged** resources restricted to it (enforce the personal-vs-bulk spine rule).
- [ ] Loaded movement penalty + off-road penalty; roads (`dirt_path`/`gravel_road`/`cobble_road`) reduce it.
- [ ] Pack-animal + draft-cart rungs **behind ENTITIES C–D** (draft stock); harness/panniers items.
- [ ] (Optional) backpack encumbrance fork in `ModifierSystem` (else defer to ENTITIES open question).

---

## Open Questions

- [ ] **Quality floor:** does Crude (tier 0) appear for a competent colony, or is tier 1 the practical floor (Crude only on injured/dark/rushed crafts)?
- [ ] **Batch quality:** when a recipe outputs a stack > 1 (food batches), is quality per-stack-uniform or per-unit? (Per-batch uniform is simpler; per-unit is finer but fragments stacks.)
- [ ] **Magic gating:** is the "Arcane Lapidary" gate a full RESEARCH-ENHANCEMENT node, or a standalone research now and folded into the lore-tier tree later?
- [ ] **Amulet vs ring slot:** dedicated `amulet` slot (chosen) vs treating amulets as a second `ring` — confirm.
- [ ] **Bulk tag:** which resources are "bulk-only" (ore/log/hay/stone/block) vs personal-carriable, and where the tag lives (item field vs category).
- [ ] **Road model:** build-tile road (chosen) vs derived "trampled path" from repeated pawn traffic.
- [ ] **Crop persistence/save:** tilled tiles + growing crops serialise with the world (assume yes).
- [ ] **Alcohol depth:** mood-good only now vs a recreation/joy need — defer the need to SOCIAL-LAYER?
- [ ] **Spoilage of produce:** crops/bread/ale reuse Pass I `decaySeconds` + storage; confirm no new decay model needed.
