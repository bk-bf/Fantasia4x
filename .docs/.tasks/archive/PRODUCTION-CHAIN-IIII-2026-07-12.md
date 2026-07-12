<!-- LOC cap: 340 (created: 2026-07-11) -->

# PRODUCTION-CHAIN-IIII — Rare materials, mystical flora & the magical drop economy

> **Related:** [ROADMAP](../open/ROADMAP.md) · [CREATURE-COMBAT-OVERHAUL](CREATURE-COMBAT-OVERHAUL-2026-07-12.md) (Phase 3b lairs-guard-rare-materials consumes this; §2h magical drops feed it) · [PRODUCTION-CHAIN-III (archived)](PRODUCTION-CHAIN-III-2026-07-10.md) (alchemy/gem-dust/§M magic foundation) · [ANIMAL-HUSBANDRY](../open/ANIMAL-HUSBANDRY.md) (foraging/crops) · [RESEARCH-ENHANCEMENT](../open/RESEARCH-ENHANCEMENT.md) · [game/DESIGN](../../game/DESIGN.md) · data: `database/resources.jsonc`, `items.jsonc`, `recipes.jsonc`

## Status

**ARCHIVED 2026-07-12 — Phases A–D done.** The rare-material families (§1a crops, §1b fungi, §1d crystals,
§1e treasure) + their items ship; the alchemy/enchant economy (4 flora potions, a crystal enchant piece,
the mana_crystal→gem-dust refine) is wired; treasure dens beside lairs (Phase C); the Phase-D tails
(§G alchemy-quality draught scaling, §I famed craft-roll stamp + display + equip-enchant flow); AND the
weapon-venom coating subsystem (§2 — `venom_coating` + `applyWeaponCoating` + the on-hit merge). Gates:
`pnpm check` 0 errors, `itemReferences`/`resourceGen`/`consumeItem`/`famedNames` + full suite green
(924/925; the 1 red — `recipeService`'s split_firewood — is pre-existing, unrelated).

**Carried forward (genuinely blocked — tracked in ROADMAP #1b):** the **arcane turret** consumer for
`mana_crystal`→gem-dust (needs a mobs-attack-buildings system) and the two **voidshard/wraith** items —
**Shadeform Philtre** + **Wraithbone Blade** (need a wraith **T5 boss** that doesn't exist; `voidshard`
itself ships). These can't be built until those systems/creatures land; the material half is all here.

Originally split out because **[CREATURE-COMBAT-OVERHAUL Phase 3b](CREATURE-COMBAT-OVERHAUL-2026-07-12.md)**
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

| id | biome | lumber | attracts | status |
| -- | ----- | ------ | -------- | ------ |
| `witchwood_grove` | deep forest | `witchwood_log` — enchant-holding wands/hafts | thornwood spiders, night things | ✅ done (~4.7/world) |
| `soulwood_grove` | ancient forest, map-rare | `soulwood_heart` — the §2h famed-haft material | a T4-5 **boss** lair (bear/owlbear line) | ✅ done (~1.1/world) |
| `frostheart_pine` | mountain (cave floor) | `frostheart_timber` — frost-tinged gear | frost beasts (winter wolves, hoarfowl) | ✅ done (~5/world) |
| `bonewood_snag` | swamp | `bonewood` — pale, light, takes venom well | goblin/bullywug dens | ✅ done (~1.5/world) |

> **§1c COMPLETE (2026-07-11).** All four rarer trees ship as `woodcut` nodes with their items
> (`magic_wood`, tier-2/3 woodcut, long regrowth): the deep-forest pair `witchwood_grove`/`soulwood_grove`
> gated to a new **`deep_forest`-only subterrain** `mossy_ground` (with a `forest_moss` ground-cover so
> the subterrain is never bare), verified to spawn ONLY in deep-forest cores; `frostheart_pine` on the
> cold mountain-interior `cave` floor (no tundra biome, so mountain is its home); `bonewood_snag` in the
> swamp bog. Prereq shipped earlier this pass: the **biome-variant system** (`parent` + distance-transform
> interior promotion) that makes `deep_forest` a nested core of a real forest. The `attracts` column
> (lairs guarding these) is CREATURE-COMBAT Phase 3b, still pending.

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
a **creature magical drop** ([CREATURE-COMBAT-OVERHAUL §2h](CREATURE-COMBAT-OVERHAUL-2026-07-12.md)) combine into
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
- [x] **§1c done** (all four trees + items, 2026-07-11).
- [x] **§1a/§1b/§1d/§1e nodes authored (2026-07-12)** — 14 new `resources.jsonc` attractors: crops
      `bloodroot`/`dreamleaf`/`mandrake`/`emberbloom` + fungi `glowcap`/`nightshade_bolete`/`witch_morel`/
      `spore_of_madness` (forage, biome-keyed, slow regrowth, `glow` on the magical ones); crystals
      `mana_crystal_vent`/`star_geode`/`voidshard_cluster` (mining, **on `cave`** — the same mountain-
      interior terrain the gem geodes use — deplete on harvest); treasure `barrow_cache`/`buried_hoard`/
      `sunken_relic` (the EXISTING `dig`/`digging` verb, one-shot). Listed early so they get first pick on
      their subterrains. `itemReferences.test.ts` + `resourceGen.test.ts` green.
- [x] `items.jsonc` (2026-07-12): the 8 flora reagents + `mana_crystal`/`star_shard`/`voidshard`
      (`magic_crystal`) — note items carry NO `value` field (weightKg/volumeL only; the KINGDOMS-TRADE
      `value` idea isn't in the item schema). Reagents don't spoil (no decaySeconds, per the Open-Q).
- [x] `1e` treasure nodes reuse the EXISTING `dig`/`digging` verb — no new interaction/job/tool.

### Phase B — Alchemy + enchanting economy
- [x] **Potion recipes (2026-07-12)** — 4 flora draughts at the `alchemy_lab` (crop/fungus + woundwort +
      glassware): `vigor_draught` (bloodroot→`vigor`), `calming_draught` (dreamleaf→`soothed`),
      `nightglow_draught` (glowcap→`moonlit`), `frenzy_draught` (spore_of_madness+mandrake→`berserk`). Each
      grants an EXISTING condition (no new conditions invented). Duration scales with the drinker's alchemy
      (§G). *Deferred:* an emberbloom fire-resist draught (no fire-resist condition exists yet) and the
      mandrake+organ trait-elixir (organs already grant traits on direct consumption).
- [x] **Enchant recipe (2026-07-12)** — `stargazer_circlet` (crystal enchant gear): `star_shard` +
      `owlbear_pineal` + `witch_morel` → a head piece granting `keen_senses` while worn (the crafted twin
      of a boss famed-drop; the existing `grantsConditions` path). Wired at `attunement_altar`.
- [x] **`mana_crystal` → refined gem-dust (2026-07-12)** — `grind_mana_crystal` (lapidary_bench, runic) →
      `gem_dust` ×4 (a richer yield than any cut gem). The **arcane-turret/rune-trap consumer stays
      deferred** (CREATURE-COMBAT §4a, blocked on mobs-attack-buildings) — but mana_crystal now has its sink.
- [~] **Voidshard/wraith-gated tails** — the weapon-venom coating shipped (below); the other two remain
      BLOCKED on a wraith **T5 boss** that doesn't exist (only `greater_wraith` is authored). `voidshard`
      (§1d) exists as a mined item now, so only the wraith source is missing:
  - [x] **Weapon-venom coating — LANDED 2026-07-12.** The new weapon-coating subsystem: a `coating?`
        field on `ItemInstance` ({`itemId`, `expiresAtTurn`}) + `coatingEffect`/`coatingDurationHours` on
        the coating item def. `venom_coating` (`venom_sac` + `nightshade_bolete` at the alchemy_lab) is
        applied to a pawn's mainHand via the `applyWeaponCoating` command (a COAT button in
        `PawnConsumables`), and `Combat.applyOnHitEffect` now applies the coating's `envenomed` proc ON TOP
        of the weapon's own while unexpired. A "☣ COATED" badge shows on the equipped weapon (EquipmentDoll).
        Time-based expiry (charge-based left as a later refinement).
  - [ ] **Shadeform Philtre** — `wraith_essence` + `voidshard` (§1d) → brief invisibility / night-move
        (ties STEALTH). Blocked on `voidshard` + a wraith T5 boss.
  - [ ] **Wraithbone Blade** — wraith bone + `voidshard` (§1d) → armour-pierce + fear-on-hit + a **curse
        condition** (persistent, spend-after-use — per the Open-Q resolution below). Blocked on `voidshard`
        + a wraith T5 boss.

### Phase C — Lair attraction (in CREATURE-COMBAT-OVERHAUL Phase 3b)
- [x] **`lairAttractors` proximity bias — LANDED 2026-07-11** (in `ResourceGeneratorService.placeLairGuardians`,
      NOT `entitySpawning` — lair TILES are placed at world-gen, not seed time). Adjacent placement ✅ (den beside
      the node, harvestable); tier-matches-tier ✅ via the lair→creature bind (predator_den←witchwood/soulwood,
      wolf_den←frostheart_pine, goblin_warren+swamp_nest←bonewood_snag). See CREATURE-COMBAT §3b for detail +
      the tier caveat (boss-guards need Phase 3a escalation).
- [x] **Treasure BESIDE the lair (2026-07-12)** — `ResourceGeneratorService.placeBuriedHoards` (Pass 4,
      after guardian placement) dens a `buried_hoard` on the nearest empty tile beside ~35% of lairs (dens
      AND the §3b guardians). The one-resource-per-tile map model can't put the hoard literally ON the den
      tile, so it sits ADJACENT — diggable under the pack's aggro or after clearing — matching the same
      "beside, not on" placement the §3b guardians use.

### Phase D — Non-combat tails (merged from PRODUCTION-CHAIN-III-TAILS, 2026-07-12)

The slim non-combat tails of the archived
[PRODUCTION-CHAIN-III](PRODUCTION-CHAIN-III-2026-07-10.md) — a potion drink-use action + the
famed craft-roll stamp/display. Both are outputs of the same alchemy/enchant economy this spec covers, so
they live here now instead of in a separate file. (The *combat* tails — traps/turrets + the boss-drop hook
— live with [CREATURE-COMBAT-OVERHAUL §4](CREATURE-COMBAT-OVERHAUL-2026-07-12.md).)

#### §G — the active drink-use action

The `alchemy_lab`, potion items (`potion_of_might`/`draught_of_vigor`/`elixir_of_grace`/
`tonic_of_fortitude`), their `grantsConditions`, `Item.conditionDurationTurns`, and `alchemy_quality`
(`stats.jsonc`) all already shipped.

- [x] **Player-triggered drink → timed condition** — LANDED via [CREATURE-COMBAT-OVERHAUL §2h](CREATURE-COMBAT-OVERHAUL-2026-07-12.md)
      (2026-07-12): `entities/Pawns.applyConsumable` stamps a potion's `grantsConditions` +
      `conditionDurationTurns` into `conditionTimers` (like a meal buff), wired through the
      `useConsumableItem` command + the `PawnConsumables.svelte` DRINK button. This also revived the four
      pre-existing attribute potions.
- [x] **Scale duration by `alchemy_quality` (2026-07-12)** — `applyConsumable` takes a `durationMult`;
      the `useConsumableItem` command computes it from the drinker's alchemy work-quality
      (`getWorkModifiers(pawn, 'alchemy', …).quality`, ~0.8–1.8) and passes it, so a trained alchemist
      draws a longer effect out of the same draught. (Scales on the DRINKER, not the brewer — potions are
      bulk with no per-instance quality; brewer-scaling would need per-instance potion quality, a later add.)
- [x] Tone: imply, don't instruct — the new potion descriptions describe the draught, not the buff math.

#### §I — famed craft-roll stamp + display

The `famed` tier, the `ItemInstance` fields (`famed`/`famedName`/`famedHistory`/`famedStatMult`/
`famedEnchants`), the `core/famedNames.ts` generator, and the roll/stat/enchant + per-hit combat scaling
math all already shipped + tested (`famedNames.test.ts`). Missing: the craft-side stamp and full display.

- [x] **Craft-roll stamp (2026-07-12)** — `jobs/craft.ts` `complete()` builds a famed-roll closure
      (`rollFamed(alchemy/craft quality axis, arcaneStation from the station's `effects.arcane`, rng)`);
      passive furnaces never roll. In `completeCraftOrder`'s quality loop each PRIMARY-output unit rolls
      the tail and, if it hits, peels out into its OWN unique drop carrying a full `ItemInstance` (name/
      history/×2–5 stat-mult/enchants) — the same instance-bearing shape as a mob's famed drop, so it never
      stack-merges and flows straight onto pickup.
- [x] **Famed identity on the item card (2026-07-12)** — `CarryItemCard.svelte` gained `famed`/
      `famedHistory`/`famedEnchants` props: a famed item shows a gold name + an italic history sub-line +
      the enchant list (humanised inline so no backend token leaks). `PawnInventory.svelte` feeds them.
- [x] **Apply `famedEnchants` while equipped (2026-07-12)** — the equip→conditions loop in
      `PawnStateMachine.ts` read only the def's `grantsConditions`; it now also pushes the instance's
      `famedEnchants` through the same transient-condition path.

> The **boss-drop** path (the other way to obtain a famed item) shipped 2026-07-12 as
> CREATURE-COMBAT-OVERHAUL §4b (spawn-with-famed-gear → `dropMobGear`).

## Open questions
- [x] Reagent stability vs spoilage — **resolved: don't spoil.** The flora reagents + crystals carry no
      `decaySeconds` (only a slow `deteriorationRate` = ordinary wear), so they keep indefinitely (2026-07-12).
- [ ] Are magical trees `roofSupport`/beauty like the existing groves (furniture use), or lumber-only? //dont understand this question
- [ ] Curse mechanics for `voidshard`/`sunken_relic` — a persistent downside condition on the wielder, or 
      a one-time event? (Ties to the §2h "powerful conditions, steep costs" theme.) // persistent, spend after use, can roll negatives, 1 positive + 1 negative or if lucky just 1 positive
- [ ] **Prestige stat home** (carried from PRODUCTION-CHAIN-III / §I): `Item.prestige` flat field vs
      derived from material+quality+enchants? Decided by SOCIAL-LAYER; capture either way.
