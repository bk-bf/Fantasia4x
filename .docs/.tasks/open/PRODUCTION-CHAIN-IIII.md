<!-- LOC cap: 340 (created: 2026-07-11) -->

# PRODUCTION-CHAIN-IIII — Rare materials, mystical flora & the magical drop economy

> **Related:** [ROADMAP](ROADMAP.md) · [CREATURE-COMBAT-OVERHAUL](CREATURE-COMBAT-OVERHAUL.md) (Phase 3b lairs-guard-rare-materials consumes this; §2h magical drops feed it) · [PRODUCTION-CHAIN-III (archived)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) (alchemy/gem-dust/§M magic foundation) · [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md) (foraging/crops) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · data: `database/resources.jsonc`, `items.jsonc`, `recipes.jsonc`

## Status

Not started (design). Split out because **[CREATURE-COMBAT-OVERHAUL Phase 3b](CREATURE-COMBAT-OVERHAUL.md)**
wants lairs to spawn near **rare materials** so a dangerous den "guards a reward" — but the map's only
rare materials today are **ore veins, the four magical groves** (heartwood/moonwood/ironwood/emberwood),
**native gold, and gems**. That's too thin a lattice to hang lair placement on, and there's no
rare-material *sink* for the powerful magical drops the overhaul's T4-5 creatures will produce. This
spec designs the missing rare-material families + the alchemy/enchanting economy they feed.

---

## Goal

A **tier of rare, biome-flavoured "attractor" materials** that (a) give lairs somewhere to guard
(Phase 3b), (b) feed an **alchemy + enchanting economy** alongside the **§2h creature magical drops**,
and (c) reward exploration — the reason to send a party across the map is a witchwood grove, a crystal
vent, or a barrow, usually with something dangerous denned beside it.

**Design law (realism-first, [[realism-first]]):** these are *mystical naturals* — flora, fungi, mineral
formations, and buried history — not arbitrary loot. Each reads as a thing that grows/forms in-world,
with an in-world reason a beast dens near it (a predator drawn to prey drawn to the bloom; a cold-thing
nesting in a frostheart stand).

---

## What already exists (seams)

- **Rare resources** — `resources.jsonc` groves (`heartwood_grove`… — `glow`, `spawn.subterrains`
  weights, `yields[]` with `regrowthTurns`, `persistent`/`harvestDepletes`), `native_gold`, gems, and
  the `lair: true` dens. New attractors are just more entries in this file.
- **Foraging / woodcut / mining / DIG** — `designationTypes` + `interaction.workCategory` already route a
  node to the right job (`foraging`/`woodcutting`/`mining`), **including a full `dig` action** — the
  `dig` designationType + `dig` action + `digging` workCategory (with `digging_speed`/`digging_yield`
  stats + the `digging_stick` tool) already exist and are used by clay/soil nodes (`resources.jsonc`).
  So buried treasure (§1e) needs **NO new interaction** — every attractor family reuses an existing verb.
- **Alchemy foundation** — Production-Chain-III shipped alchemy + `gem_dust` + the §M magic-gear/staff
  path. Reagents plug into new potion recipes at the existing alchemy station.
- **Lair placement** — `entitySpawning.ts` seeds lairs by `spawn.subterrains` weight only today; Phase 3b
  adds a proximity bias toward these attractors (one weighting hook — see that spec).

---

## 1 · Rare-material families (the new attractors)

Five families, roughly by biome + gather-verb. Rarity/reward climbs down each list. All `spawn` weights
are ~grove-rare or rarer; the top of each family is **map-unique-ish** (a handful per world).

### 1a. Mystical crops (wild magical flora — `forage`)

Wild, un-farmed magical plants — a forage node with a slow regrowth, biome-keyed. Alchemy reagents +
food-chain oddities. Attract prey (grazers nibble the bloom) → predators → **beast lairs**.

| id | biome | reagent role | flavour |
| -- | ----- | ------------ | ------- |
| `bloodroot` | plains/forest | vitality/regen potions; a butcher-tanning mordant | a red taproot that bleeds sap when cut |
| `dreamleaf` | forest/swamp | sleep/calm draughts; the `dreaming` condition | silver-backed leaves that fold at a footstep |
| `mandrake` | forest edge | pain-kill + a **trait-granter** base (§2h) | a forked root that "screams" when pulled |
| `emberbloom` | mountain/ash | fire-resist draught; emberwood synergy | a coal-red flower that smoulders at dusk |

### 1b. Magical mushrooms (cave/damp fungi — `forage`, dark/wet-gated)

Grow in shade/damp (swamp, forest floor, later caves). Potion reagents + **trait-granters on consumption**
(§2h). Draw spore-eaters and the things that hunt them → **swamp/monster lairs**.

| id | grows | role | flavour |
| -- | ----- | ---- | ------- |
| `glowcap` | swamp/forest, dark | light-source crafting; a mild `nightVision` draught | a fungus that keeps a cold blue light |
| `nightshade_bolete` | swamp | poison/venom coating (goblin gear synergy — §2c) | purple-gilled, weeps a black bead |
| `witch_morel` | forest, damp | the enchant catalyst (below) + hallucinogen | honeycombed cap, never quite the same shape twice |
| `spore_of_madness` | deep swamp | rare — the `frenzy`/`hysteria` reagent | a puffball that bursts into drifting motes |

### 1c. Rarer magical tree variants (`woodcut`, tool-tier gated)

Beyond the four groves — even rarer, ancient magical timber. **Apex lairs den in these** (a boss guards
an ancient stand). Yield high-tier magical lumber for §2h gear + roofs/beauty furniture.

| id | biome | lumber | attracts |
| -- | ----- | ------ | -------- |
| `witchwood_grove` | deep forest | `witchwood_log` — enchant-holding wands/hafts | thornwood spiders, night things |
| `soulwood_grove` | ancient forest, map-rare | `soulwood_heart` — the §2h famed-haft material | a T4-5 **boss** lair (bear/owlbear line) |
| `frostheart_pine` | mountain/tundra | `frostheart_timber` — frost-tinged gear | frost beasts (winter wolves, hoarfowl) |
| `bonewood_snag` | swamp | `bonewood` — pale, light, takes venom well | goblin/bullywug dens |

### 1d. Crystal spawns (`mining`, mineral formations)

Mineable crystal vents/geodes — rarer than ore, the enchanting/`gem_dust`++ tier + arcane-turret fuel
(§4a). Cluster in mountain/cave; the biggest **draw earth-things and hoarders** → **mineral lairs**.

| id | where | yields | role |
| -- | ----- | ------ | ---- |
| `mana_crystal_vent` | mountain | `mana_crystal` | refined `gem_dust`++; §M staff cores, arcane turrets |
| `star_geode` | mountain/impact | `star_shard` + a gem roll | the §2h enchant material; rare |
| `voidshard_cluster` | deep mountain/cave | `voidshard` | a "cursed" reagent — powerful gear + a downside condition |

### 1e. Diggable treasure (reuse the EXISTING `dig` action)

Buried caches surfaced by the **existing `dig` designation** — the same `dig`/`digging` verb that already
digs clay + soil (`resources.jsonc`), so a treasure node is just a resource entry with
`designationTypes: ["dig"]`, `interaction.action: "dig"`, `workCategory: "digging"`, and a treasure
`yields[]`. **No new interaction, workCategory, or tool** (the `digging_stick` already gates it — a barrow
opens with a digging stick, fitting the primitive-tech feel; a later `shovel` upgrade is optional polish,
NOT required). Often placed **under/beside a lair** — the dragon-on-its-hoard: clear the guardian, then
dig the prize. One-shot (`persistent: false`), high variance.

| id | where | yields |
| -- | ----- | ------ |
| `barrow_cache` | plains/forest mound | bones, grave-goods (bronze/iron gear at rolled condition), a **famed** roll |
| `buried_hoard` | near a lair | `native_gold`, gems, `gold_ingot`, a rare reagent |
| `sunken_relic` | swamp | an ancient item / §2h enchant material; a curse risk (`voidshard`-adjacent) |

---

## 2 · The economy these feed

The point of the rare materials is a **two-input high tier**: a rare *natural* material (this spec) +
a **creature magical drop** ([CREATURE-COMBAT-OVERHAUL §2h](CREATURE-COMBAT-OVERHAUL.md)) combine into
the powerful late-game outputs. Neither alone suffices — you must both *find the grove* and *kill the
thing guarding it*.

- **Alchemy (potions).** Reagent (crop/mushroom) + a creature drop (a T4-5 gland/ichor) → a potent
  draught. E.g. `mandrake` + `alpha_heart` → a **trait-granting** elixir (§2h); `emberbloom` +
  `salamander_bile` → fire-resist tonic; `nightshade_bolete` → a venom coating for weapons.
- **Enchanting / famed gear.** A magical lumber (`soulwood_heart`) or crystal (`star_shard`) + a boss
  hide/bone → **magical beast-level gear** with a granted condition AND a steep `wieldRequirement` (§2c) —
  the payoff for clearing a boss lair. This is the crafted twin of the Phase-4b famed drop.
- **Arcane defence.** `mana_crystal` → refined gem-dust → the §4a `arcane_turret` + rune traps.

## 3 · Lair gating (feeds CREATURE-COMBAT-OVERHAUL Phase 3b)

- Lair placement gains a **proximity attraction**: a lair's spawn weight is raised on tiles within N of a
  matching attractor (a `lairAttractors: ["soulwood_grove", …]` list on the creature/lair def, or a biome
  rule). **Tier matches tier** — a `soulwood_grove` (rarest) biases a T4-5 boss lair; a `bloodroot` patch
  biases a common beast den. So the danger of the guardian reads the value of the prize.
- Placement is **adjacent, not on** (Phase 3b recommendation): the node stays harvestable, but under the
  pack's aggro — a bold player can risk-harvest a witchwood stand while the spiders are distracted, or
  clear the den first. Buried treasure (`1e`) is the exception — it sits *under* the lair (dig after clearing).

---

## Implementation Plan

### Phase A — Rare-material resources + gather
- [ ] `resources.jsonc`: the ~15 attractor nodes above (spawn weights ~grove-rare↓; biome/subterrain
      keyed; `glow` on the magical ones; `yields` + `regrowthTurns`; groves `persistent`, crops/mushrooms
      regrow, crystals/treasure deplete).
- [ ] `items.jsonc`: the material items (`bloodroot`, `witchwood_log`, `mana_crystal`, `soulwood_heart`,
      `star_shard`, `voidshard`, treasure items…) with `value` (KINGDOMS-TRADE) + category.
- [ ] `1e` treasure nodes reuse the EXISTING `dig`/`digging` verb (like clay/soil) — just author the
      resource entries with `designationTypes: ["dig"]` + a treasure `yields[]`; no new interaction/job/tool.

### Phase B — Alchemy + enchanting economy
- [ ] Potion recipes (reagent + creature drop) at the alchemy station; the granted conditions/§2h
      trait-elixirs.
- [ ] Enchant recipes: magical lumber/crystal + boss drop → §2h magical-beast gear (condition grant +
      steep `wieldRequirement`).
- [ ] `mana_crystal` → refined gem-dust → arcane turret/rune-trap fuel (ties CREATURE-COMBAT §4a).

### Phase C — Lair attraction (in CREATURE-COMBAT-OVERHAUL Phase 3b)
- [ ] `lairAttractors` proximity bias in `entitySpawning`; tier-matches-tier; adjacent placement; treasure
      under the lair.

## Open questions
- [ ] Reagent stability vs spoilage — do mystical crops/mushrooms rot (decaySeconds) like food, or keep?
- [ ] Are magical trees `roofSupport`/beauty like the existing groves (furniture use), or lumber-only?
- [ ] Curse mechanics for `voidshard`/`sunken_relic` — a persistent downside condition on the wielder, or
      a one-time event? (Ties to the §2h "powerful conditions, steep costs" theme.)
