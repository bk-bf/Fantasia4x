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
core stats** stronger/weaker so an individual encounter varies. **All base creatures now use ranges**
(2026-07-11) — the current values became the symmetric band midpoints.

Ladder metadata on each entry: `species` (groups the whole ladder), `tier` (1–5), `variantOf` (→ the
base id, for Phase-3 escalation lookups).

**Gear identity (locked 2026-07-11): monster gear ≠ human gear.** Monster humanoids wield their OWN
crude/weird gear, NOT the colony's craftables. **Orc** weapons are crude, massive, crushing — huge
damage + `armorDamage`, and a **`wieldRequirement`** (raw STR) so a scrawny colonist who loots one
*flails* (worse accuracy, far heavier stamina drain, softer blows). You must field a STRONG pawn — the
loot gates on capability, not on picking it up (Battle-Brothers "heavy" weapons). **Goblin** gear is
light/weird/nasty — low damage, status procs (poison/ensnare/hook-bleed), no strength bar. The human
bronze/iron/steel pools are for **[KINGDOMS-TRADE](KINGDOMS-TRADE.md) caravan guards**, not monsters.

### 2a–2d Engine + example data — ✅ LANDED (2026-07-10 → 07-11)

Green: `pnpm check` 0 errors (732 files), the combat/spawn suites + new `lootPools.test.ts` /
`wieldRequirement.test.ts` / artery tests (700 related pass), `threat:check` + `graph:check` ✓. The
**mechanics are complete**; the full 5×3 ladder DATA is what remains (concept ladders below).

- [x] **§2a stats are RANGES — canonical.** `CreatureDefinition.statRanges` ({str/dex/con/per:[min,max]})
  is now the stat source; the def's fixed `stats` is DERIVED as the band midpoint (`creatureMidStats`)
  for display / threat model / spawn fallback. `makeMob` rolls each spawn within the band (seeded); the
  health/blood pool tracks the rolled con. **All 31 base creatures converted** (symmetric bands, midpoint
  = old value → `threat:check` unchanged). `naturalArmorRange` + per-spawn `naturalArmorOverride` (read
  by combat, dropped from snapshot) do the same for hide. `threat-model.mjs` reads the midpoint (`midStats`).
- [x] **§2b ladder metadata.** `species`/`tier`/`variantOf` fields (schema + loader passthrough).
- [x] **§2c gear system.** `database/lootpool.jsonc` + `core/LootPools.ts` (PURE, unit-tested
  `drawLoadout`/`rollCondition`); `Mob.equipment`; `makeMob` draws a loadout (quality + condition rolled
  into `ItemInstance`s); combat treats a geared mob like a pawn; gear wears/shatters (`applyGearWear`
  generalised to `Pawn|Mob` via CoW `spliceEntity`); `dropCarcass`→`dropMobGear` drops survivors with
  their instance. Id/slot typos fail loud at load. `equipment` in `MOB_COLD`.
- [x] **§2c wielding requirement (the "special pawn" gate) — wired via a CONDITION.**
  `weaponProperties.wieldRequirement: {strength}`; a pawn below the bar is driven the staged
  **`overmatched`** condition (`conditions.jsonc` — unwieldy/overmatched/flailing) each tick from the
  STR shortfall (`needs.driveWieldStrain`, called in `PawnStateMachine` beside `driveEncumbrance`). Its
  modifiers (hitChance/strength/dodge/fatigueRate) flow into combat through the SAME
  `conditionStatMultipliers`/`conditionHitMult`/`conditionNeedMultipliers` reads as encumbrance — so
  softer blows, worse aim, easier to hit, and faster fatigue (drains stamina in a fight), no inline
  combat math. **Player-visible** (a pill + floater), which also closes the legibility TODO. Clears on
  unequip / a strong enough pawn. (Mobs always meet their own bar, so only looting colonists get it.)
- [x] **§2c example CREATURE gear + pools authored** (`items.jsonc` + `lootpool.jsonc`, wired to
  `orc_reaver`/`goblin`): ORC `orc_cleaver`/`orc_maul`/`orc_serrated_axe` (heavy, `wieldRequirement`
  16–22, high `armorDamage`) + `orc_scrap_plate`; GOBLIN `goblin_shank`/`goblin_hooked_spear`/`goblin_net`
  (light, envenom/bleed/ensnare procs) + `goblin_scrap_vest`; pools `orc_warband` + `goblin_warband`.
  Wild-drop only (no recipe/research). Sprites are placeholders; **numbers want a balance pass.**
- [x] **§2d natural-gear upgrades** are data on each variant's `naturalWeapons` list.

**Remaining engine TODO (small, deferred until the full ladder data exists):**
- [ ] **Spawn weighting by tier** — the spawner weights by `biomeWeights` only. Add a per-tier rarity
  multiplier (T1 common → T5 boss = escalation-only) so higher tiers are appropriately rare. One hook.
- [ ] **Threat model sees equipment** — `threat-model.mjs` scores natural weapons only, so an armed orc
  reads weaker than it fights. Fold the lootpool's expected weapon into the estimate (or accept the
  annotation is "unarmed baseline" and note it). Low priority — the annotations are informational.
- [x] **Wield-penalty legibility** — solved by the condition move: an under-strength wielder shows the
  `overmatched` pill + floater, so the player sees *why* the pawn swings badly (assign heavy loot to
  bruisers). (Was deferred; the `conditions.jsonc` wiring gave it for free.)
- [ ] Add an **ADR** for the variant-gear system (mob equipment, lootpool loader, per-spawn stat rolls,
  wielding requirement, monster-vs-human gear split) when the data lands and the design locks.

---

### 2e. Concept ladders (DnD / Battle-Brothers inspired) — fill these into data

**Legend.** Tier role → spawn frequency: **T1** very common · **T2** common (≈ today's base) · **T3**
uncommon · **T4** rare · **T5** boss (escalation-only). Natural-weapon rungs use existing `items.jsonc`
ids unless **(NEW)**. Beasts upgrade natural weapons + `naturalArmorRange`; monster humanoids reference
a **creature-gear lootpool** (below). Stat bands: centre on the tier baseline, siblings ±~5.

#### Monster-gear lootpools — `database/lootpool.jsonc` (CREATURE gear, NOT human craftables)

Each monster line has its OWN gear identity (new `items.jsonc` entries, wild-drop only). **Orc** = crude,
massive, high-`wieldRequirement` (needs a strong pawn to loot-and-use); **goblin/kobold** = light, weird,
status procs, no bar; **gnoll** = savage bone/hide alongside its natural claws. Two example pools are
authored (`orc_warband`, `goblin_warband`); the rest follow the same shape. `quality`/`conditionRange`/
`dropChance` documented in-file. **(NEW)** = author the item.

| line | pools (by tier) | signature gear (all **(NEW)** unless authored) | wieldRequirement |
| ---- | --------------- | --------------------------------------------- | ---------------- |
| **orc** | `orc_warband` (T2-3 ✅) → `orc_warhost` (T4) → `orc_warlord` (T5) | `orc_serrated_axe`✅ / `orc_cleaver`✅ / `orc_maul`✅ → +`orc_greataxe`,`orc_iron_slab`(shield) → a named boss weapon; armour `orc_scrap_plate`✅ → `orc_warplate` | STR 16→24 (climbs with tier) |
| **goblin** | `goblin_warband` (T1-2 ✅) → `goblin_warren` (T3-4) | `goblin_shank`✅ / `goblin_hooked_spear`✅ / `goblin_net`✅ → +`goblin_poison_bow`, `goblin_firepot`(thrown) | none |
| **kobold** | `kobold_scraps` (T1) → `kobold_trappers` (T2-3) | darts/sling/`kobold_trap_spear`, hit-and-run | none |
| **gnoll** | `gnoll_pack` (T2-3) → `gnoll_reavers` (T4) | `gnoll_bone_cleaver`, `gnoll_flint_axe` ALONGSIDE `claw`/`bite` naturals | STR 14 (bone weapons are heavy, not huge) |

The `wieldRequirement` scales up-tier so higher orc gear demands an ever-stronger looter — end-game orc
weapons are only worthwhile on your dedicated bruiser, a real "who do I hand this to?" decision.

#### Caravan-guard lootpools → moved to [KINGDOMS-TRADE](KINGDOMS-TRADE.md)

The human bronze/iron/steel pools drafted earlier are **not monster gear** — they fit **kingdom caravan
guards** (well-equipped human pawns escorting a trade caravan). They belong to KINGDOMS-TRADE §3; recorded
there. For reference (author in that spec, or here once caravans exist), the five-rung human ladder:

| pool | tier | mainHand | body / head | dropChance |
| ---- | ---- | -------- | ----------- | ---------- |
| `guard_scraps` | levy | `bone_knife`, `flint_handaxe`, `stone_spear` | `wicker_vest` / `padded_cap` | 0.45 |
| `guard_bronze` | militia | `cast_bronze_hatchet`, `short_seax`, `framea` | `boiled_leather_jerkin` / `leather_coif` | 0.5 |
| `guard_iron` | soldier | `bearded_axe`, `iron_mace`, `spatha` | `scale_cuirass` / `iron_nasal_helm` | 0.55 |
| `guard_steel` | veteran | `steel_greatsword`, `steel_warhammer` | `mail_hauberk`,`plate_cuirass` / `great_helm` | 0.7 |
| `guard_royal` | royal escort | steel + a named signature | `plate_cuirass` / `great_helm` | 0.85 + **famed** roll |

These use existing human `items.jsonc` ids (all present) — no new items, and **no `wieldRequirement`**
(a colonist can use a looted human sword fine; only monster gear gates on capability).

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

Gear-driven ladder — natural weapons stay `fists`/`kick`; power comes from the **goblin gear** rung
(weird, light, status procs — never a strength bar) + traits (`sure-handed`, `light-footed`,
`adrenaline`, `killer-instinct` — all exist). DnD/BB goblin warband feel: individually pathetic,
horrible in numbers, and their kit makes fights ANNOYING (poison, nets, hooks) rather than hard-hitting.

| tier | variants · lootpool · trait |
| ---- | -------------------------- |
| T1 | **Goblin Sneak** · `goblin_warband` (shank-weighted) · — · **Goblin Whelp** · `goblin_warband` · — · **Cave Goblin** · `goblin_warband` · `light-footed` |
| T2 | **Goblin Raider** (base ✅ wired) · `goblin_warband` · — · **Goblin Cutter** · `goblin_warband` · `sure-handed` · **Goblin Netter** · `goblin_warband` (net-weighted) · `light-footed` |
| T3 | **Goblin Bloodrager** · `goblin_warren` · `adrenaline` · **Goblin Slinker** · `goblin_warren` (`goblin_poison_bow` **(NEW)**) · `light-footed` · **Goblin Boss** · `goblin_warren` · `sure-handed` |
| T4 | **Goblin Warchief** · `goblin_warren` · `killer-instinct` · **Hobgoblin Champion** (bigger frame, the one goblin that hits hard) · `goblin_warren` · `sure-handed` · **Goblin Firecaller** (`goblin_firepot` **(NEW)** thrown) · `goblin_warren` · `adrenaline` |
| T5 | **Grukk the Skull-Throne** — a warlord atop a warren; best warren kit + a named signature, famed drop |

*Extends to:* **kobold_skulker** (smaller/faster: `kobold_scraps` → `kobold_trappers` — darts, slings,
trap-spears; cap at T3–T4, `canSteal`).

#### Orc — `species: "orc"` (humanoid · geared · orc)

The heavy-humanoid ladder: high STR/CON, and the gear is the POINT — crude massive orc iron with a
climbing `wieldRequirement`, so every tier the orc gets stronger AND its dropped kit demands a stronger
colonist to be worth looting. `orc_reaver` (base ✅ wired to `orc_warband`) sits at T2.

| tier | variants · lootpool · trait |
| ---- | -------------------------- |
| T1 | **Orc Whelp** · `orc_warband` (waraxe-weighted, no plate) · — · **Orc Grunt** · `orc_warband` · — · **Orc Scavenger** · `goblin_warband` (fights with scavenged goblin junk) · — |
| T2 | **Orc Reaver** (base) · `orc_warband` · `adrenaline` · **Orc Marauder** · `orc_warband` · — · **Orc Berserker** · `orc_warband` (cleaver-weighted) · `feral-adrenaline` |
| T3 | **Orc Veteran** · `orc_warhost` · `killer-instinct` · **Orc Ironhide** · `orc_warhost` (`orc_warplate` **(NEW)**) · `iron-skin` · **Orc Slayer** · `orc_warhost` · `whirlwind` |
| T4 | **Orc Warlord** · `orc_warhost` · `killer-instinct`+`adrenaline` · **Orc Blackguard** · `orc_warhost` (`orc_iron_slab` shield **(NEW)**) · `sure-handed` · **Orc Chosen** · `orc_warlord` · `iron-skin` |
| T5 | **Gorthag the Iron Tide** — leads warband raids on the colony; `orc_warlord` pool + a named signature (`wieldRequirement` ~24 — only your strongest can ever swing it), famed drop, the marquee Phase-3 escalation threat |

*Extends to:* **gnoll_marauder** (canine-humanoid: keeps `claw`/`bite` natural weapons ALONGSIDE
`gnoll_pack`/`gnoll_reavers` bone-and-hide gear **(NEW)** — a gnoll fights with teeth AND a bone cleaver;
cap at T4, pack-heavy, `feral-adrenaline`).

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

Everything else reuses existing `items.jsonc` ids. ✅ = authored 2026-07-11.

- [x] **Orc gear** (heavy, `wieldRequirement`, wild-drop only): `orc_cleaver` (STR 20), `orc_maul`
      (STR 22), `orc_serrated_axe` (STR 16), `orc_scrap_plate`.
- [x] **Goblin gear** (light, status procs, no bar): `goblin_shank` (envenom), `goblin_hooked_spear`
      (reach 2, bleed), `goblin_net` (ensnare), `goblin_scrap_vest`.
- [ ] **Higher-tier monster gear**: `orc_greataxe` + `orc_iron_slab` (shield) + `orc_warplate`
      (`orc_warhost`), a named T5 signature per boss line (or defer to the Phase-4b famed roll);
      `goblin_poison_bow` + `goblin_firepot` (`goblin_warren`); `kobold_trap_spear` + darts/sling
      (`kobold_*`); `gnoll_bone_cleaver` + `gnoll_flint_axe` (STR 14, `gnoll_*`).
- [ ] **Natural weapons** (`natural_weapon` category): `trample` (megafauna T4-5 — blunt ~14,
      `stunChance 0.25`, `knockback 0.4`, high `armorDamage`, front-leg hosted), `constrict` (serpentine
      T4 — blunt ~8, `onHitCondition: ensnared` ~0.35, `foreBody` hosted), `quill-volley` (quillback T3+
      — piercing ~6, `reach 3` via the existing natural-reach path, tail hosted). A "stronger venom"
      proc for spider/viper T3+ can reuse `venom_bite` with a bumped `onHitCondition` on a variant weapon
      id (`greater-venom-bite`).

### 2g. Carcasses & the butchery economy (every variant → a carcass → drops)

**Engine + reference slice — ✅ LANDED 2026-07-11** (`pnpm check`/`threat:check`/`graph:check` green,
+ `haulForbidden.test.ts` dynamic-carcass case): the **dynamic-name boss carcass** hook
(`dropCarcass` sets "Old Fang's Carcass" from the slain beast when the carcass item is `dynamicName`),
a **T5 boss creature** `old_fang` (wolf line, `great_wolf_carcass` dynamic trophy), the **magical drop
items** (`alpha_ichor`/`owlbear_bile` reagents, `dire_wolf_pelt`), a **§2h magical gear** piece
(`direwolf_warcloak`, grants Might, crafted from the pelt), the boss + owlbear **butcher recipes**
(owlbear now drops `owlbear_bile` — an old creature wired into the new economy), and the **T2 butcher
building** `flensing_table` (+45% yield, tool-tier 2). The rest of the roster (below) is bulk data.


Every new creature needs a `carcassItemId`. The pattern already exists (`wolf_carcass` etc.: `category:
"carcass"`, `processingType: ["butchery"]`, `decaysTo: "rotten_carcass"`, weight/decay scaled to body
size). A butcher recipe (`station: butcher_spot`, `inputs: {carcass:1}`, `outputs: {meat, hide, bones,
sinew}`) turns it into materials; higher butcher buildings (`dressing_stone` +25%) yield more.

**Carcass-per-tier (proposal):**
- **T1–T2** reuse the LINE's base carcass (a `dire_wolf` butchers into more of the same `wolf_meat`/
  `wolf_pelt` — bigger `quantity`, not new item types). One carcass item per SPECIES, tier scales yield.
- **T3–T4 (elites)** get a **distinct carcass** (`cave_bear_carcass`) yielding a **prime hide/pelt**
  variant (`cave_bear_pelt` — a better armour material) + more meat + **the first magical drop** (§2h).
- **T5 (boss)** gets a **dynamic-name carcass** (`dynamicName: true`, like `pawn_carcass` → "Old Fang's
  Carcass") so the trophy reads as the named beast; butchers into the boss hide + **multiple §2h magical
  drops** + a **famed**-tier material.

**Butcher DROP POOLS by tier** (what a butcher run yields — author as the recipe `outputs`):

| tier | meat | hide/structural | magical (§2h) |
| ---- | ---- | --------------- | ------------- |
| T1-2 | base meat ×n, small/medium bones, sinew | base pelt/hide | — |
| T3 | prime meat ×n | **prime pelt** + bones | 1 minor reagent (a gland/ichor), low chance |
| T4 | prime meat ×n, **rich fat** | prime pelt + **great bone** (haft material) | 1–2 reagents + a chance of a trait-organ |
| T5 (boss) | trophy meat | boss hide + a **famed bone/fang** | **2–3** guaranteed magical drops incl. an enchant material |

**Butcher BUILDINGS per tier** (extend the existing `butcher_spot` T0 / `dressing_stone` T1 +25%):
- [ ] **`flensing_table`** (T2, +45% yield, tool-tier 2, some metal) — needed to fully process elite
      carcasses (a big cave-bear hide is wasted on a raw spot); gate the prime-pelt/magical yields behind it.
- [ ] **`sanguinary_altar`** (T3, magical) — the only station that extracts the **enchant materials +
      trait-organs** from a T5 boss carcass intact (a mundane butcher just gets meat + a ruined hide from
      a boss). Ties the boss reward to a mid-game building investment. Costs `mana_crystal`/`gem_dust`
      (PRODUCTION-CHAIN-IIII).

**New equipment & furniture from creature materials (new + OLD wired in):**
- [ ] **New from new creatures:** `cave_bear_pelt` → a heavy fur cloak/armour (warmth + armour);
      `direwolf_pelt` → a light fur cloak; `great_fang`/`great_bone` → bone weapons/hafts;
      **boss hides** → the §2h magical-beast gear.
- [ ] **Old creatures wired in:** many existing carcasses still have **no butcher recipe** (`bear`,
      `owlbear`, `sabretooth`, `mire_crocodile`, `orc_reaver`, `harpy`, `bullywug`… — the standing TODO in
      `recipes.jsonc`). Author them now, in the same tiered pool shape, and add the **furniture** they
      unlock: `bear_hide` → a **bear-rug** (beauty) + heavy bedroll; `mire_crocodile` → croc-leather
      (armour); antler/horn/tusk → trophy wall-mounts (beauty) + tool handles. This is the "old ones
      respect the new economy" pass — the whole roster becomes butcherable into the material web.

### 2h. T4-5 MAGICAL DROPS — the beast-magic economy (design)

T4-5 creatures drop, on butchery, **1–3 "magical-level" materials** beyond hide/meat. Three sinks (the
user's three ideas), each a distinct item category so the player learns what a drop is *for*:

**(i) Alchemical reagents** — organs/essences that are potion inputs (with a rare-material from
PRODUCTION-CHAIN-IIII):

| drop | from | potion | effect |
| ---- | ---- | ------ | ------ |
| `alpha_ichor` | dire wolf / alpha | + `bloodroot` → **Bloodrage Draught** | temporary `adrenaline`-like combat condition |
| `owlbear_bile` | owlbear / cave bear | + `emberbloom` → **Ironhide Tonic** | temporary damage-resistance condition |
| `venom_sac` | great spider / viper | + `nightshade_bolete` → **weapon venom** | coats a weapon → `envenomed` on-hit for a while |
| `wraith_essence` | wraith king | + `voidshard` → **Shadeform Philtre** | brief invisibility / night-move (ties STEALTH) |

**(ii) Trait-granters on consumption** — a rare organ eaten (or distilled + drunk) grants a PERMANENT
trait, drawing from the existing `traits.jsonc` combat/body lines. Steeply limited (one-use, rare drop,
maybe a risk of a flaw):

| drop | eat / distil → | grants |
| ---- | -------------- | ------ |
| `alpha_heart` | **Heart of the Pack** | `feral-adrenaline` (or a bespoke `pack-sense`) |
| `direwolf_hackles` | distil → **Beastblood Elixir** (+ `mandrake`) | `thick-hide` / a `nightVision` bump |
| `sabretooth_glands` | **Predator's Gift** | `killer-instinct` |
| `owlbear_pineal` | **Third Eye** (+ `witch_morel`) | `keen-senses` / a perception trait |

Grants ride the existing trait system (a `wound`/`bodyMod`-kind trait or a stat trait); the granularity
question is whether it's guaranteed or a roll, and whether it can also roll a FLAW (a Faustian bargain —
fits the tone). **Recommendation:** guaranteed grant for the *named* organ (you earned it by clearing a
boss); the risky ones (`voidshard` distillations) roll a flaw.

**(iii) Magical-beast gear** — a boss hide/bone + a PRODUCTION-CHAIN-IIII rare material (magical
lumber/crystal) crafts **late-stage gear with a powerful granted condition AND a steep `wieldRequirement`**
(§2c) — the crafted twin of the Phase-4b famed drop:

| gear | material | grants (worn) | wieldRequirement |
| ---- | -------- | ------------- | ---------------- |
| **Direwolf Warcloak** | `direwolf_pelt` + `witchwood_log` | a `moonlit-claws`-style night buff | STR — (cloak, light) |
| **Cave-Bear Plate** | boss hide + `frostheart_timber` | strong armour + a `iron-skin` condition | high (heavy) |
| **Fang-Reaver** (weapon) | `great_fang` + `soulwood_heart` | bleed-on-hit + an `adrenaline` grant | steep (STR ~22) |
| **Wraithbone Blade** | wraith bone + `voidshard` | armour-pierce + fear on-hit; **a curse condition** | steep + the curse cost |

These use the existing worn-gear condition-grant path (§M `grantsConditions`) + the `wieldRequirement`
(§2c) so a magical weapon is only usable by a bruiser — and the strongest carry a downside (`voidshard`
curse), so power has a price. **No new mechanics** — reagents are items + recipes; trait-granters reuse
the trait system's grant path; magical gear reuses `grantsConditions` + `wieldRequirement`.

**Open (magical drops):**
- [ ] Trait-grant granularity — guaranteed vs rolled, and can it roll a FLAW (Faustian)? (rec: named =
      guaranteed, `voidshard` distillations = flaw risk).
- [ ] Do reagents/organs spoil (decaySeconds) like meat, or keep as "preserved" materials? (rec: organs
      keep once extracted at the `sanguinary_altar`; raw they spoil).
- [ ] Boss drop is BUTCHERED (this §2h path) vs the Phase-4b **famed ground-drop** (`rollFamed`) — do both
      fire (a boss gives a famed item AND a butcherable magical carcass), or pick one? (rec: both — the
      famed weapon on the ground, the carcass for the crafting/alchemy economy).

**Phase 2 acceptance:**
- [x] Engine: two spawns of the same creature differ in stats/armour — ALL creatures now roll from `statRanges` bands (converted 2026-07-11; midpoints = old values, `threat:check` unchanged).
- [x] Engine: a geared humanoid fights with its weapon + worn armour and drops a subset on death (drawLoadout → equip → dropMobGear; combat reads `equipment` unchanged). Live on `goblin` (`goblin_warband`) + `orc_reaver` (`orc_warband`).
- [x] Engine: an under-strength colonist wielding looted monster gear is visibly punished via the `overmatched` condition (aim/damage/dodge/fatigue + a pill; `wieldRequirement.test.ts`), while the monster wields it freely.
- [ ] Data: the full 5×3 ladders authored into `creatures.jsonc` + `lootpool.jsonc` + remaining §2f items; a playtest confirms goblins read weird/annoying, orcs read heavy, and orc loot only pays off on a strong pawn.

---

## Phase 3 — Lair evolution + resource gating

### 3a. Lair-age escalation

- [ ] A lair left alive (and "fed" — kills/decay accrued) rolls a chance over time to spawn a **next-tier** variant (base → elite → miniboss), capped by biome tier.
- [ ] Clearing / damaging the lair resets or lowers its escalation clock.
- **Open:** cap escalation at miniboss, or allow a rare authored **boss** at the top? Does clearing fully reset, or leave a "scarred" faster-regrow lair?

**Proposed mechanics (2026-07-10, awaiting approval — updated to the 5-tier ladder):** the ladder is
DATA — every variant carries `species` + `tier` + `variantOf` (§2b), so escalation is a lookup (pick a
same-`species` entry one tier up), no hand-written switch. Lair state (wherever the lair record lives —
the tile resource + spawn bookkeeping from ENTITIES_SPAWNING) gains `escalation: number` (0 = the lair's
base tier). It accrues from AGE (slow drip per in-game day alive) and FEEDING (a kill by the lair's pack
bumps it); past a threshold, the NEXT respawn from that lair replaces one spawn with a next-tier variant
and resets the accumulator. Killing the lair's pack knocks the accumulator down; destroying the lair
deletes it outright.
**Recommendations on the opens:** escalation climbs T1→T4 organically; **T5 (the boss) only from a
long-ignored, well-fed lair** — the Phase-4b famed-drop source arriving as a world event, not a routine
spawn. Clearing fully resets (a "scarred" faster-regrow lair is a nice later wrinkle, not worth the
extra state now).

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
- [x] Phase 2b: which creature lines first → superseded by the **5-tier × 3-variant ladder for every species** (§2e); author wolf + orc + goblin ladders first (concepts ready, engine live).
- [x] Phase 2c: **yes** — drops roll quality + condition, and fights degrade mob gear pre-drop (landed 2026-07-10/11; live on goblin/orc_reaver). Monster gear is CREATURE-specific with `wieldRequirement` on orc iron; human `guard_*` pools moved to KINGDOMS-TRADE caravan guards.
- [ ] Phase 3: escalation cap (recommendation: T5 only from a long-ignored fed lair); lair-on vs lair-adjacent to resources (recommendation: adjacent).
