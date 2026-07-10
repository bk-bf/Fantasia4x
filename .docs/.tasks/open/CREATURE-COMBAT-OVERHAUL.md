# CREATURE-COMBAT-OVERHAUL

> **Related:** [ENTITIES_SPAWNING (archived — spawn/lair record)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [ANIMAL-HUSBANDRY](./ANIMAL-HUSBANDRY.md) · [PRODUCTION-CHAIN-III-TAILS](./PRODUCTION-CHAIN-III-TAILS.md) (§I crafted-famed path) · [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) · [ROADMAP.md](./ROADMAP.md) · [../../game/DECISIONS.md](../../game/DECISIONS.md) (ADR-029 layered subtractive armour) · data: `database/limbmap.jsonc`, `database/creatures.jsonc`, `database/traits.jsonc`, `database/items.jsonc`

Rebalance + expansion of creature combat. Fixes the armour **invincible↔trivial binary** (keeping armour subtractive), gives aimed attacks real targets, and adds an elite/variant ladder, humanoid gear, and lair-driven escalation so combat has cross-creature progression.

## Problem statement

Under ADR-029 subtractive armour, a creature's `naturalArmor` scalar is the per-part soak (chest share 1.0 → soak = scalar). Because it is a **flat, permanent** wall:

- A weak weapon does **0** through a bear's 32 / mammoth's 55 hide; a strong weapon + `armorPen` does near-full. Nothing in between, and no way to *earn* a kill through a tank.
- The only reliably-soft aimed target on a beast is the **eyes** (share 0.1, hitWeight 0.2 — almost never rolled). Quadruped/amphibian/avian/serpentine plans have **no throat**; nothing has a **groin**. "Aim for the gap" (ADR-029) has nowhere to land.
- `armorMods` (per-part hard-shell / soft-belly) is **unused on all 31 creatures**.
- Creature hide can't be **worn down** — the "wreck the armour, then blows land clean" loop exists for worn armour (`armor_damage`/durability) but not natural hide.

Decision (locked): armour **stays subtractive**. We dissolve the binary by adding *counters* (placement, attrition) and *variance*, not by making armour percentage-based, and not by simply shaving the scalars (that just trades "invincible" for "trivial").

## Design decisions (locked)

- [x] Keep armour subtractive; **do not** lower base tank scalars — keep them high, add counters. (Supersedes the earlier "quillback 50→34 / croc 45→38" proposal.)
- [x] **Drop** power-through penetration (raw≫armour bonus armorPen) — not in scope.
- [x] Per-spawn stat/armour **ranges apply to elite tiers only** (minibosses), giving intra-tier variance (weaker/stronger individual elites). Base creatures stay fixed.
- [x] Elites are **hand-authored minibosses** (not fully procedural), each still range-rolled at spawn.
- [x] Humanoid gear is drawn from a new **`database/lootpool.jsonc`** (weighted, per-slot draw chance so first-tier spawns are only partly geared), and drops on death. Weapons **and** armour, scaled to the creature's tier.
- [x] Higher variants draw combat **traits** from `traits.jsonc` (mobs already carry `traits` — `orc_reaver` uses `["adrenaline"]`) and upgraded natural weapons (`claw`→`rending-claws`→`dragon-claws`, `bite`→`sabre-fangs`, `tusk`→`great-tusks`…).

---

## Phase 1 — Dissolve the armour binary + add crit points

The mechanics fix. Three interlocking levers, all keeping subtraction.

### 1a. New soft target parts (the "gap")

Add low-armour, high-bleed parts over vital structures so precision has somewhere to land on beasts and humanoids.

- [x] **Throat/neck** on `quadruped`, `quadruped_hooved`, `amphibian`, `avian`, `serpentine` plans (humanoid/winged_humanoid already have `neck`) — done 2026-07-10 by adding the SHARED `neck` part (size 20, bleedRatio 0.06, hitWeight 2, armor 0) to each plan's `head` limb.
- [x] **Groin/femoral** on `humanoid` + `winged_humanoid`: `size 15, bleedRatio 0.05, hitWeight 1.5, armor 0.1`, in the `torso` group — done 2026-07-10.
- [x] Route these through `bodyLabels.ts` so no snake_case id leaks into the health panel — `partLabel`'s humanizer covers the new ids ("Neck", "Groin", "Carotid Artery"); no new mapping needed.
- [x] **Open (answered: yes):** throat/groin carry an explicit organ-penetration route — each holds a small, non-vital, high-`bleedRatio` artery organ (`carotidArtery` 0.12 / `femoralArtery` 0.1, hitWeight 0, flagged `artery`) reachable only by the organ roll. Nicking it opens an **unclottable** bleed (`bloodletting` — flows until dressed, never self-clots), so a slit throat is a slow bleed-out kill, not an instant one (2026-07-10; `artery` flag on the part def, `PART_DEF_MAP[chosen.id].artery` → `organInjury.bloodletting = true` in `resolveHit`; carried through `recomputeWound` on merge). Guarded by bodyPlans.test.ts.

### 1b. Precision directly raises organ-hit & fracture chance

Today organ-penetration ([Combat.ts](../../../src/lib/game/systems/Combat.ts) `~L930`) and fracture ([Combat.ts](../../../src/lib/game/systems/Combat.ts) `~L893`) chance scale with **force/damage** and fold precision in only via `crit`. Make `hit_precision` a **direct multiplier** so a deft fighter finds the kidney / cracks the femur.

- [x] Multiply `organChance` and `fractureChance` by a precision factor — done 2026-07-10; the factor uses the attacker's full `critChance` (`hit_precision` stat + weapon `critMod`), so a crit-prone stiletto finds organs more often, matching the crit/gap-aiming input. Existing caps still bound both rolls.
- [x] `K_PRECISION` constants added (Combat.ts): **`K_PRECISION_ORGAN = 6`, `K_PRECISION_FRACTURE = 4`** — organs weigh heavier than bone (precision is a guided blade more than driven force); ~+30–65% organ / +20–45% fracture at high DEX/PER.
- **Rationale:** a skilled/high-PER pawn (or a crit-prone stiletto) beats armour by *placement*, not by out-damaging it — armour stays a wall to mooks.

### 1c. Per-part `armorMods` for signature tanks (soft belly / hard shell)

Give the existing-but-unused `armorMods` its first users so aimed attacks have a real weak point on high-armour beasts.

- [x] `mire_crocodile`, `quillback`, `owlbear`, `bear`: `armorMods: [{"target":"abdomen","defense":-N}]` — done 2026-07-10 (belly soak: bear 16→6, owlbear 15→6, croc 22.5→8.5, quillback 25→8). `pnpm threat:check` still green.
- [x] `thornwood_spider`: `+6 defense` on `cephalothorax` (22→28); the opisthosoma stays the soft spot.
- **Open:** the `armorMods` schema only targets a part id / limb-group / `"all"` — there is no dedicated "back" part, so we can express **soft belly** (abdomen −N) but not "armoured back vs soft front" without new parts. Sufficient?

### 1d. Natural-hide degradation (attrition path)

The "wreck it, then it lands" loop, extended to creature hide.

- [x] Erodable per-fight armour pool — done 2026-07-10: every landed hit chips `Mob.hideWear[struckPart]` by the SAME wear worn gear takes (`weapon.armorDamage × armor_damage` stat — the gear-durability model, as directed), capped at the part's full soak; `naturalArmorPoints` subtracts live wear.
- [x] Resets out of combat: wear expires `HIDE_WEAR_RESET_TICKS` (750, ~an in-game hour, mirroring the mob clot cadence) after the last chip — per-fight, not permanent maiming.
- [x] **Open (answered): per part** — `hideWear` is keyed by struck part id.
- [x] **Perf:** cross-checked `ENGINE-PERFORMANCE.md` — all new work is event-rate (landed hits only), routed through `spliceEntity` (copy-on-write); a peace tick allocates nothing; `hideWear`/`hideWearAt` dropped from the snapshot (`entityProjection.ts`).

**Phase 1 acceptance:**
- [ ] A high precision or damage pawn kills a bear meaningfully faster than a low precision or low damage pawn of equal STR (placement + organ routing). *(needs a playtest)*
- [ ] A long fight against a tank visibly "opens up" (hide degradation) rather than staying at 0-through — and crafted armour/weapon durability deteriorates too (already shipped via ADR-029 gear wear), so it's a race. *(mechanics landed; needs a playtest)*
- [x] Throat/groin/belly show as human labels, never raw ids (`partLabel` humanizer).
- [x] `pnpm check` + combat `test:related` green (0 errors / 736 tests, 2026-07-10); *TPS: no per-tick work added (event-rate chips only) — re-check `perf.log` on the next live run.*

---

## Phase 2 — Species variant ladder (5 tiers × 3 variants) + gear drops

**What "the ladder" IS (answering the confusion).** An elite is **not a flag on the base creature** —
it is a **whole new `creatures.jsonc` entry** with its own name, vibe, stat band, natural/worn gear and
spawn weight. Every **species** (wolf, worg, bear, orc…) becomes a **ladder of 5 TIERS**, and each tier
holds **3 sibling VARIANTS** (15 creature entries per species). Tiers are power rungs; the base creature
you have today sits at **T2** (the "standard adult"). **T1** is chaff (young/lean/lone — spawns most),
**T3–T4** are the "minibosses" (veterans, pack-leaders, apex individuals), **T5** is a rare authored
**boss** (the Phase-4b famed-drop source). The three variants within a tier are flavour siblings (coat,
temperament, tactics) that each roll their own `statRanges` band, so no two are identical.

Every creature carries a `statRanges` band centred on its tier's baseline, with siblings offset **±~5
core stats** stronger/weaker so an individual encounter varies. The base creatures gain a `statRanges`
too (centred on their CURRENT values — those become the T2 midpoint).

Ladder metadata on each entry: `species` (groups the whole ladder), `tier` (1–5), `variantOf` (→ the
base id, for Phase-3 escalation lookups).

### 2a–2d Engine work — ✅ LANDED (2026-07-10; DATA left empty per the brief)

The schema + logic are built and green (`pnpm check` 0 errors, 96 files/730 tests, +`lootPools.test.ts`
+ artery wiring tests, `threat:check`/`graph:check` ✓). **Only the DATA (creature entries, item entries,
lootpool contents) is left to author** — see the concept ladders below.

- [x] **§2a per-spawn stat spread.** `CreatureDefinition.statRanges` (`{str/dex/con/per: [min,max]}`) +
  `naturalArmorRange` (`[min,max]`). Rolled once at spawn in `makeMob` (seeded `rng`), else the fixed
  `stats`/`naturalArmor`. The health/blood pool now tracks the ROLLED con. `naturalArmorOverride` is
  written on the Mob and read by combat (`entityNaturalArmor`/`naturalArmorPoints`), dropped from the
  snapshot. Base creatures with no band behave exactly as before.
- [x] **§2b ladder metadata.** `species`/`tier`/`variantOf` fields on `CreatureDefinition` (schema +
  loader passthrough; consumed by Phase-3 escalation + spawn weighting).
- [x] **§2c gear system.** New `database/lootpool.jsonc` (**pools EMPTY** — schema documented in-file) +
  `core/LootPools.ts` loader with a PURE, unit-tested `drawLoadout` (per-slot chance gate → weighted
  pick → quality-table roll) + `rollCondition`. `Mob.equipment?: PawnEquipment` added; `makeMob` draws
  the loadout, rolls each piece's **quality** (weighted table) + **condition** (`conditionRange` × item
  max durability) into `ItemInstance`s. Combat already treats a geared mob like a pawn (`'equipment' in
  entity` — weapon → `attackerProfile`, worn armour → `partArmorReduction`). `applyGearWear` /
  `bestArmorSlot` / `decrEquipDurability` generalised to `Pawn | Mob` (routed through the CoW
  `spliceEntity`), so a mob's gear wears down and **shatters** in a fight. On death, `dropCarcass` →
  `dropMobGear` rolls each surviving piece's `dropChance` → a `DroppedItem` carrying its `instance`
  (quality + worn durability). Item-id typos fail loud at load (`validateLootItemIds`); slot typos fail
  in the loader. `equipment` added to `MOB_COLD` (ships on change to the entity card).
- [x] **§2d natural-gear upgrades** are just data on the variant entries' `naturalWeapons` list — every
  ladder rung below references only weapons that already exist in `items.jsonc` unless flagged **(NEW)**.

**Remaining engine TODO (small, deferred until data exists):**
- [ ] **Spawn weighting by tier** — the spawner (`pickSpawnCreature`/`findSpawnTile`) currently weights
  by `biomeWeights` only. Add a per-tier rarity multiplier (T1 common → T5 boss ≈ never from the plain
  spawner; T5 arrives via Phase-3 escalation) so higher tiers are appropriately rare. One weighting hook.
- [ ] **`pnpm threat` coverage** — the threat model reads fixed `stats`; teach it to use the
  `statRanges` midpoint for ranged creatures (else `threat:check` will flag every new variant). One
  reader change (`scripts/threat-model.mjs`).
- [ ] Add an **ADR** (precision + hide-degradation is ADR-031; the variant-gear system — mob equipment,
  lootpool loader, per-spawn stat rolls — should get its own ADR when the data lands and the design locks).

---

### 2e. Concept ladders (DnD / Battle-Brothers inspired) — fill these into data

**Legend.** Tier role → spawn frequency: **T1** very common · **T2** common (≈ today's base) · **T3**
uncommon · **T4** rare · **T5** boss (escalation-only). Natural-weapon rungs use existing `items.jsonc`
ids unless **(NEW)**. Humanoid tiers reference a **lootpool** (below); beasts upgrade natural weapons +
`naturalArmorRange` instead. Stat bands: centre on the tier baseline (T2 = the current base values),
each sibling offset ±~5 on its signature stat.

#### Lootpool ladder (humanoid tiers) — `database/lootpool.jsonc`

Five pools mirror the material tech ladder; slot keys are real `EquipmentSlot` ids; `quality` /
`conditionRange` / `dropChance` documented in-file. All item ids exist in `items.jsonc` unless **(NEW)**.

| pool | tier | quality mix | mainHand pool | bodyOuter | headOuter | dropChance |
| ---- | ---- | ----------- | ------------- | --------- | --------- | ---------- |
| `scavenger_scraps` | T1 | Crude 50 / Std 50 | `bone_knife`, `flint_handaxe`, `stone_spear` | `wicker_vest`, `raw_hide_vest` | `padded_cap` | 0.45 |
| `warband_bronze` | T2 | Crude 25 / Std 65 / Fine 10 | `cast_bronze_hatchet`, `short_seax`, `framea` | `raw_hide_vest`, `boiled_leather_jerkin` | `leather_coif` | 0.5 |
| `warband_iron` | T3 | Std 70 / Fine 25 / Mw 5 | `bearded_axe`, `iron_mace`, `spatha` | `boiled_leather_jerkin`, `scale_cuirass` | `iron_nasal_helm` | 0.55 |
| `champion_steel` | T4 | Std 30 / Fine 50 / Mw 20 | `steel_greatsword`, `steel_warhammer` | `mail_hauberk`, `plate_cuirass` | `great_helm` | 0.7 |
| `warlord_regalia` | T5 | Fine 40 / Mw 60 | `steel_greatsword`, `steel_warhammer` + **(NEW)** a named signature weapon | `plate_cuirass` | `great_helm` | 0.85 + a **famed** roll (Phase-4b) |

`conditionRange` widens down-ladder (scavengers ≈ [0.35,0.7]; champions ≈ [0.6,0.95]). Each humanoid
variant's def just sets `"lootPool": "<pool>"`.

#### Wolf — `species: "wolf"` (quadruped · forest/plains · beast, no lootpool)

Natural-weapon rungs: `bite`+`claw` → `sabre-fangs` (T3+) → `rending-claws` (T4) → `dragon-claws` (T5).
`naturalArmorRange` climbs 4–8 (T1) → 20–30 (T5). DnD dire-wolf / winter-wolf lineage.

| tier | variants (name · vibe) |
| ---- | ---------------------- |
| T1 | **Wolf Pup** (half-grown, trails the pack) · **Scrawny Wolf** (lean starving-season straggler) · **Grey Yearling** (untested, first winter) |
| T2 | **Grey Wolf** (the base) · **Timber Wolf** (bigger northern coat, +CON) · **Moor Runner** (lean plains-courser, +DEX) |
| T3 | **Pack Alpha** (leads & steadies the pack; `sabre-fangs`) · **Scarred Hunter** (one-eyed, vicious; +STR) · **Dire Wolf** (oversized DnD dire; bodyScale↑) |
| T4 | **Bloodmoon Alpha** (nocturnal terror, `rending-claws`) · **Direwolf Matriarch** (runs a full pack) · **Frost-Fang** (winter-wolf, minor `frost` resist) |
| T5 | **Old Fang, the Grey King** — a lone legendary dire wolf, last of a broken pack; `dragon-claws`-class bite, thick hide, **famed** fang/hide drop |

*Extends to:* **worg** (darker, `nocturnalAggro`, goblin-allied — swap names to Worg/War-Worg/Winter
Warg/Shadowmane), **jackal** (smaller, pack-heavy, cap at T3).

#### Bear — `species: "bear"` (quadruped · mountain/forest · beast)

Rungs: `claw`+`slam` → `rending-claws` (T3) → `dragon-claws` (T4-5); keep the belly `armorMods` and grow
it with the hide. `naturalArmorRange` 20–28 → 45–55. Owlbear + sabretooth reuse this shape.

| tier | variants |
| ---- | -------- |
| T1 | **Bear Cub** (rare, only with a mother) · **Yearling Bear** (lean, spring-thin) · **Sun Bear** (smaller forest bruin) |
| T2 | **Brown Bear** (the base) · **Black Bear** (forest, +DEX) · **Grizzly** (bigger, +STR/CON) |
| T3 | **Cave Bear** (huge Pleistocene bruiser; `rending-claws`) · **Scarred Grizzly** (old, mean, +STR) · **Ridgeback** (thick-hided, +armour) |
| T4 | **Elder Cave Bear** (apex; `dragon-claws`) · **Ironhide Bruin** (armour band top) · **Bloodclaw** (berserk, `feral-adrenaline`) |
| T5 | **Ursa Magna, the Mountain's Weight** — a titanic cave bear that dens in a peak; famed hide/claw drop |

*Extends to:* **owlbear** (add `rending-beak`, aggressive, cap the ladder one rung meaner), **sabretooth**
(feline: `sabre-fangs` line, glass-cannon lean — high DEX/DPS, lower hide).

#### Boar / megafauna — `species: "boar"` (quadruped_hooved · beast)

Rungs: `boar_tusk`+`boar_charge` → `great-tusks` (T3+) → `trample` **(NEW)** at T4-5. Ungulate ladder;
the same shape scales up through aurochs → mammoth as their own species' T-high rungs.

| tier | variants |
| ---- | -------- |
| T1 | **Piglet Sounder** (weak, numerous) · **Scrub Boar** (lean) · **Young Tusker** |
| T2 | **Wild Boar** (base) · **Razorback** (+DEX charge) · **Bristleback** (+CON) |
| T3 | **Elder Tusker** (`great-tusks`, `chargesWhenWounded`) · **Irontusk** (+armour) · **Grey Sow-Mother** (leads a big sounder) |
| T4 | **Direboar** (huge, `trample` **(NEW)**) · **Blackmane Tusker** (apex charger) · **Bog Colossus** (swamp, tanky) |
| T5 | **Old Gouge, the Field-Ruiner** — a legendary direboar; famed tusk drop |

*Extends to:* **aurochs**/**elk** (T-high herd bruisers — `charge`/`antler`, `trample` at the top),
**woolly_mammoth** (its own species; base sits at T4, a **Tuskfather** boss at T5).

#### Goblin — `species: "goblin"` (humanoid · geared · goblinoid)

Gear-driven ladder — natural weapons stay `fists`/`kick`; power comes from the **lootpool** rung + traits
(`sure-handed`, `light-footed`, `adrenaline`, `killer-instinct` — all exist). DnD/BB goblin warband feel.

| tier | variants · lootpool · trait |
| ---- | -------------------------- |
| T1 | **Goblin Sneak** · `scavenger_scraps` · — · **Goblin Whelp** · `scavenger_scraps` · — · **Cave Goblin** · `scavenger_scraps` · `light-footed` |
| T2 | **Goblin Raider** (base) · `warband_bronze` · — · **Goblin Cutter** · `warband_bronze` · `sure-handed` · **Goblin Skirmisher** · `warband_bronze` · `light-footed` |
| T3 | **Goblin Bloodrager** · `warband_iron` · `adrenaline` · **Goblin Slinker** · `warband_iron` · `light-footed` · **Goblin Boss** · `warband_iron` · `sure-handed` |
| T4 | **Goblin Warchief** · `champion_steel` · `killer-instinct` · **Hobgoblin Champion** · `champion_steel` · `sure-handed` · **Goblin Shaman-Guard** · `champion_steel` · `adrenaline` |
| T5 | **Grukk the Skull-Throne** — a warlord atop a warren; `warlord_regalia`, famed drop |

*Extends to:* **kobold_skulker** (smaller/faster, `scavenger_scraps`→`warband_bronze`, cap at T3–T4,
`canSteal`), and the humanoid-plan raiders generally.

#### Orc — `species: "orc"` (humanoid · geared · orc)

The heavy-humanoid ladder: high STR/CON, steel-tier lootpool at the top. `orc_reaver` (base) sits at T2.

| tier | variants · lootpool · trait |
| ---- | -------------------------- |
| T1 | **Orc Whelp** · `warband_bronze` · — · **Orc Grunt** · `warband_bronze` · — · **Orc Scavenger** · `scavenger_scraps` · — |
| T2 | **Orc Reaver** (base) · `warband_iron` · `adrenaline` · **Orc Marauder** · `warband_iron` · — · **Orc Berserker** · `warband_iron` · `feral-adrenaline` |
| T3 | **Orc Veteran** · `champion_steel` · `killer-instinct` · **Orc Ironhide** · `champion_steel` · `iron-skin` · **Orc Slayer** · `champion_steel` · `whirlwind` |
| T4 | **Orc Warlord** · `champion_steel` · `killer-instinct`+`adrenaline` · **Orc Blackguard** · `champion_steel` · `sure-handed` · **Orc Chosen** · `warlord_regalia` · `iron-skin` |
| T5 | **Gorthag the Iron Tide** — a warlord who leads warband raids on the colony; `warlord_regalia`, famed drop, the marquee Phase-3 escalation threat |

*Extends to:* **gnoll_marauder** (canine-humanoid: keep `claw`/`bite` natural weapons ALONGSIDE a lighter
lootpool — a gnoll fights with teeth AND a looted axe; cap at T4, pack-heavy, `feral-adrenaline`).

#### Thornwood Spider — `species: "thornwood_spider"` (arachnid · beast)

Rungs: `venom_bite` → a stronger venom proc (higher `onHitCondition` chance/duration) at T3+; keep the
hardened `cephalothorax` `armorMods`, grow it. Web-caster identity via the existing `web-shot`.

| tier | variants |
| ---- | -------- |
| T1 | **Spiderling** (swarm, weak) · **Web-Scuttler** · **Thorn Hatchling** |
| T2 | **Thornwood Spider** (base) · **Ambush Weaver** (+DEX) · **Bristle Spider** (+armour) |
| T3 | **Broodmother** (spawns spiderlings on the field — new AI, or just a big pack) · **Venomfang Stalker** (stronger venom) · **Carapace Lurker** (armour band top) |
| T4 | **Great Weaver** (huge, `web-shot` + strong venom) · **Dread Broodmother** · **Chitin Horror** (near-immune belly excepted) |
| T5 | **Ma'akthil, the Deep Weaver** — a colossal spider queen in a web-choked lair; famed silk/chitin drop |

#### The remaining roster (extend by archetype)

Each remaining base creature adopts the ladder of its **archetype** (same rung shape, re-skinned names +
tuned bands). Author the full 5×3 only for the ones you want as recurring threats; harmless prey can stay
1–2 tiers.

| base creature | archetype ladder | boss (T5) concept |
| ------------- | ---------------- | ----------------- |
| worg, jackal | Wolf | Worg: **Skoll, the Sun-Chaser** |
| owlbear, sabretooth | Bear (feline lean for cat) | Owlbear: **The Hooting Death** |
| aurochs, elk | Boar/megafauna | Aurochs: **Grand-Horn** |
| woolly_mammoth | Boar/megafauna (starts T4) | **The Tuskfather** |
| kobold_skulker | Goblin (light) | **Meepo's Heir** |
| gnoll_marauder | Orc (with natural weapons) | **Hyaenghar the Laughing** |
| mire_crocodile | Bear (amphibian, ambush) | **The Mere-Wyrm** |
| marsh_viper | Serpentine (venom + `constrict` **(NEW)** at T4) | **The Fen-Coil** |
| harpy, hippogriff | Avian (`rending-beak`/`raptor-talons` rungs) | Harpy: **The Shrieking Matron** |
| bullywug, grimeling | swamp skirmisher (light) | cap at T3–T4 |
| shadow_wraith | Amorphous (fire-vuln; `spectral_strike`→stronger) | **The Hollow King** |
| quillback | tank (add `quill-volley` **(NEW)** at T3+) | cap at T3 |
| deer, rabbit, goat, chicken, hoarfowl, stirge, olm | prey — 1–2 tiers only, no boss | — |

### 2f. New items to author (flagged **(NEW)** above)

Small, concrete additions — everything else reuses existing `items.jsonc` ids:

- [ ] **Natural weapons** (`natural_weapon` category): `trample` (megafauna T4-5 — blunt ~14,
      `stunChance 0.25`, `knockback 0.4`, high `armorDamage`, front-leg hosted), `constrict` (serpentine
      T4 — blunt ~8, `onHitCondition: ensnared` ~0.35, `foreBody` hosted), `quill-volley` (quillback T3+
      — piercing ~6, `reach 3` via the existing natural-reach path, tail hosted). A "stronger venom"
      proc for spider/viper T3+ can reuse `venom_bite` with a bumped `onHitCondition` on a variant weapon
      id (`greater-venom-bite`).
- [ ] **Crafted (lootpool) gear:** the ladder above uses only existing item ids EXCEPT the T5
      `warlord_regalia` "signature weapon" — one authored named weapon per boss line (or defer to the
      Phase-4b famed roll, which needs no new base item). Author 0–2 as desired.

**Phase 2 acceptance:**
- [x] Engine: two spawns of the same range-rolled creature differ in stats/armour (statRanges + naturalArmorRange). *(mechanism tested; visible once bands are authored)*
- [x] Engine: a geared humanoid fights with its weapon + worn armour and drops a subset on death (drawLoadout → equip → dropMobGear; combat reads `equipment` unchanged). *(mechanism tested; visible once pools are filled)*
- [ ] Data: the ladders above are authored into `creatures.jsonc` + `lootpool.jsonc`; first-tier humanoids look under-equipped, warlords kitted; `pnpm threat:check` green (needs the statRanges-midpoint reader).

---

## Phase 3 — Lair evolution + resource gating

### 3a. Lair-age escalation

- [ ] A lair left alive (and "fed" — kills/decay accrued) rolls a chance over time to spawn a **next-tier** variant (base → elite → miniboss), capped by biome tier.
- [ ] Clearing / damaging the lair resets or lowers its escalation clock.
- **Open:** cap escalation at miniboss, or allow a rare authored **boss** at the top? Does clearing fully reset, or leave a "scarred" faster-regrow lair?

**Proposed mechanics (2026-07-10, awaiting approval):** the ladder is DATA — each miniboss def
carries `variantOf: "<base id>"` (2b table), so escalation is a lookup, no hand-written switch. Lair
state (wherever the lair record lives — the tile resource + spawn bookkeeping from ENTITIES_SPAWNING)
gains `escalation: number` (0 = base). It accrues from AGE (slow drip per in-game day alive) and
FEEDING (a kill by the lair's pack bumps it); past a threshold, the NEXT respawn from that lair
replaces one base spawn with the `variantOf`-matched elite and resets the accumulator. Killing the
lair's pack knocks the accumulator down; destroying the lair deletes it outright.
**Recommendations on the opens:** cap at miniboss for now (an authored boss is the Phase-4 famed-drop
source — add it as a second `variants` rung when 4b lands); clearing fully resets (a "scarred"
faster-regrow lair is a nice later wrinkle, not worth the extra state now).

### 3b. Resource-gated lairs

- [ ] Bias lair placement toward **rare map resources** so a dangerous lair "guards" a reward; clearing it unlocks access.
- **Open:** lair sits **on** the resource (blocks harvest until cleared) or **adjacent** (contested but harvestable at risk)? *Recommendation: **adjacent** — a blocked node is a binary gate (clear or nothing); an adjacent lair lets a bold player risk-harvest under the pack's aggro range, which is the more interesting decision and needs no new blocking rule.*

**Phase 3 acceptance:**
- [ ] An ignored lair demonstrably escalates its spawns over time.
- [ ] Rare-resource nodes tend to be guarded; clearing the guardian opens the node.

---

## Phase 4 — Defence structures & famed boss-drops (migrated from PRODUCTION-CHAIN-III)

Combat tails carried over from the archived [PRODUCTION-CHAIN-III](../archive/PRODUCTION-CHAIN-III-2026-07-10.md)
because they need combat code that doesn't exist yet — they belong with this overhaul, not the items pass.

### 4a. Combat traps + auto-fire turrets (PROD-CHAIN-III §H)

The item/building data already ships (fortification `palisade`/`barricade`/`gatehouse` done); what's
missing is the **damage** behaviour. Today's `trapEnabled`/`catchChance` mechanic *catches food animals*
— it does not damage hostiles, and buildings can't be attacked.

- [ ] **Trap-damages-mob path** (new combat code): spike pit, caltrops, bear-trap, and **rune trap**
      (gem-dust glyph → pushes a `disoriented`/`ensnared` debuff on trigger, reusing the on-hit effect
      pipeline). Gated behind **mobs-attack-buildings** (below).
- [ ] **Stationary auto-fire weapons** — `ballista`/`scorpion`/`springald` (draw bolt ammo) + `arcane_turret`
      (draws `gem_dust`, elemental bolt via §M + the ranged circuit): a "fire at nearest hostile in range,
      consume ammo" turret behaviour that doesn't exist yet. Lean: auto-fire, unmanned, with a range/cadence cap.
- [ ] **Barricade cover** already reuses the ranged `rangedCoverPenalty` seam (no new math) — done in data.
- **Hard blocker:** all of 4a gates on **mobs-attack-buildings** (a mob AI + combat target-selection change,
  not yet built). Ties into Phase 3's lair-raid loop.

**Proposed building shapes (2026-07-10, awaiting approval — none of these defs exist yet; blocked on
mobs-attack-buildings regardless, so this is the shape to build toward, not a build order):**

- **Traps** (one-shot / rearmable floor buildings, trigger on a hostile entering the tile):
  - `spike_pit` — piercing hit ~18 dmg to a rolled leg part, then needs re-digging (consumed).
  - `caltrops` — light piercing ~6 + `staggered`; degrades per trigger (3 charges).
  - `bear_trap` — piercing ~14 + `ensnared` (holds the mob in place); rearmable by a pawn; reuses the
    existing trapping seam (`trapEnabled`/`catchChance` catches food animals — hostile damage is the
    new branch).
  - `rune_trap` — no damage; pushes `disoriented` (existing on-hit condition pipeline), consumes
    `gem_dust` per trigger.
  - Trigger data: `combatTrap: {damage, damageType, condition?, charges, rearmable}` on the building def.
- **Turrets** (auto-fire, unmanned, "loose at nearest hostile in range on a cadence, consume ammo"):
  - `ballista` — bolt ammo, range ~14, slow cadence (~1 shot / 4 s), heavy piercing (~30, armorPen 0.3).
  - `scorpion` — bolt ammo, range ~10, mid cadence, ~16 dmg (cheaper, earlier tier).
  - `arcane_turret` — consumes `gem_dust`, elemental bolt via the §M ranged circuit, range ~8.
  - Turret data: `turret: {range, intervalTicks, ammoCategory | consumesItem, projectile}`; the shot
    itself reuses `tryRangedShot`'s profile→`performAttack` path with a building as the shooter.
  - `springald` from the original §H list: fold into `scorpion` (two mid-tier bolt-throwers is one too
    many at this roster size).

### 4b. Famed boss-drop hook (PROD-CHAIN-III §I)

The `famed` tier, instance fields, name/history generator, and stat/enchant math all ship; the crafted
path (craft-roll stamp + display) lives in [PRODUCTION-CHAIN-III-TAILS](PRODUCTION-CHAIN-III-TAILS.md).
The **boss-drop** path is the combat half:

- [ ] Very high-level mobs (Phase 2 minibosses → a rare authored **boss**) can drop a **famed** item on
      death — roll `rollFamed` (identity + stat-mult + enchants) and place it in `droppedItems`. The only
      way to obtain a famed item without a master crafter, and the reward for clearing a hard lair/boss.
- **Depends on:** Phase 2 elite/miniboss ladder (the drop source) + the Phase 2c drop-on-death hook.

**Phase 4 acceptance:**
- [ ] A trap/turret damages a hostile mob (once mobs-attack-buildings lands); an auto-fire ballista looses
      at an in-range hostile and consumes a bolt.
- [ ] A cleared boss/miniboss can drop a named famed item to the ground.

---

## Sequencing & cross-cutting

- **Order:** Phase 1 (mechanics — unblocks everything) → Phase 2 (content ladder + gear) → Phase 3 (world loop). Each phase is independently shippable.
- **ADR:** ~~add when Phase 1 lands~~ → **ADR-031** added to `DECISIONS.md` + onboarded into `codegraph.config.json` `adrRules` (2026-07-10, `graph:check` adr-coverage ✓).
- **Docs to touch on completion:** `DESIGN.md` (combat mechanics), the archived `ENTITIES_SPAWNING` record + `ANIMAL-HUSBANDRY.md` (range rolls, lootpool, lair escalation), `TRAITS.md` (elite trait grants), `ROADMAP.md` (feature entry).

## Open questions (rolled up for refinement)

- [x] Phase 1b: `K_PRECISION` magnitude, and organ vs fracture weighting → **organ 6 / fracture 4**, input = full critChance (stat + weapon critMod).
- [x] Phase 1a: explicit artery route → **yes** — `carotidArtery`/`femoralArtery` organs, found by the organ-penetration roll, bleed-out not instant kill.
- [x] Phase 1d: **per-part**; reset = wear expires ~an in-game hour (750 ticks) after the last chip.
- [ ] Phase 2b: which creature lines get the first minibosses?
- [ ] Phase 2c: do drops roll quality/condition; do fights degrade gear pre-drop?
- [ ] Phase 3: escalation cap (miniboss vs boss); lair-on vs lair-adjacent to resources.
