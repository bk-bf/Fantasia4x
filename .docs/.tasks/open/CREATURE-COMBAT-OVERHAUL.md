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
- [x] **Open (answered: yes):** throat/groin carry an explicit organ-penetration route — each holds a small, non-vital, high-`bleedRatio` artery organ (`carotidArtery` 0.12 / `femoralArtery` 0.1, hitWeight 0) reachable only by the organ roll: nicking it opens a severe bleed-out, not an instant kill.

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

## Phase 2 — Elite/variant ladder (hand-authored minibosses) + gear drops

### 2a. Spawn-time stat/armour ranges (elites only)

- [ ] Extend the creature def with optional `statRanges` / `naturalArmorRange` (`[min,max]`), rolled at spawn in `entitySpawning.ts` (today `def.stats` is used verbatim at `~L705`). 
- [ ] Deterministic per-spawn roll (seeded — no `Math.random`; vary by spawn index/turn per project rules).

**Proposed schema (2026-07-10, awaiting approval):** two optional creature-def fields; a base creature
simply doesn't author them, so "elites only" needs no flag:

```jsonc
"statRanges"       : {"str": [30, 36], "dex": [12, 14], "con": [12, 15]},  // absent stats stay fixed
"naturalArmorRange": [12, 18]                                              // overrides naturalArmor
```

Rolled once at spawn (seeded from spawn tile + turn + pack index, same convention as the existing
spawn rolls), written onto the Mob's `stats`/a per-mob `naturalArmor` override field. `pnpm threat`
annotations for range-rolled creatures use the band midpoint.

### 2b. Hand-authored miniboss defs

Each is a `creatures.jsonc` entry: boosted base stats + a range band + `traits` (from the `traits.jsonc` combat ladder) + upgraded natural weapons + a loot pool ref. Proposed first set:

- [ ] **Dire Wolf** / **Alpha Worg** (wolf/worg line): `sabre-fangs`, +`naturalArmor`, traits ~ S2 speed/precision (`attack_speed 1.5`, `hit_precision 1.5`), pack-leader.
- [ ] **Orc Warlord** (orc_reaver line): steel-tier loadout from lootpool, S2/S3 `hit_chance`/`dodge` traits, `adrenaline`.
- [ ] **Goblin Boss** / **Kobold Chief** (humanoid low tier): bronze/iron loadout, S1–S2 traits.
- [ ] **Cave Bear / Elder Owlbear** (bear/owlbear line): `great-horns`/`dragon-claws`-class upgrade, higher hide + belly `armorMods`.
- **Open:** which creature lines get minibosses first? (proposed: wolf, worg, orc, goblin, kobold, bear — the recurring threats.)

**Proposed miniboss defs (2026-07-10, awaiting approval).** Seven `creatures.jsonc` entries. Every
referenced natural weapon (`sabre-fangs`, `rending-claws`, `dragon-claws`, `rending-beak`) and trait
(`quick-striking`/`whirlwind` = S1/S2 attack-speed+precision, `sure-handed`/`killer-instinct` = S1/S2
hit+precision, `light-footed` = S1 dodge, `adrenaline`) **already exists** — no new items or traits.
Carcasses reuse the base line's carcass item (a Dire Wolf butchers like a big wolf). Sprites reuse the
line's charSpans until distinct art exists (same placeholder convention as the expansion roster).
`variantOf` is the Phase-3 escalation link (base id → its elite). threatLevel derived via `pnpm threat`
at implementation time. Stat bands ≈ base × 1.25–1.5 with the range giving ±10–15% individual spread:

| id | line (`variantOf`) | plan | scale | statRanges (str/dex/con/per) | armour range | naturalWeapons | traits | lootPool |
| -- | ----------------- | ---- | ----- | ---------------------------- | ------------ | -------------- | ------ | -------- |
| `dire_wolf` | wolf | quadruped | 1.5 | 30–36 / 12–14 / 12–15 / 10 | 12–18 | `sabre-fangs`, `claw` | `quick-striking` | — |
| `alpha_worg` | worg | quadruped | 1.6 | 26–32 / 14–17 / 13–16 / 14 | 10–16 | `sabre-fangs`, `rending-claws` | `whirlwind` | — |
| `orc_warlord` | orc_reaver | humanoid | 1.3 | 36–42 / 11–13 / 16–19 / 10 | 16–20 | `fists`, `slam` (disarmed fallback) | `killer-instinct`, `adrenaline` | `warlord_steel` |
| `goblin_boss` | goblin | humanoid | 1.1 | 26–30 / 10–12 / 10–12 / 10 | 8–12 | `fists`, `kick` | `sure-handed` | `warband_bronze` |
| `kobold_chief` | kobold_skulker | humanoid | 1.0 | 18–22 / 14–17 / 8–10 / 13 | 4–8 | `fists`, `bite` | `light-footed` | `warband_bronze` |
| `cave_bear` | bear | quadruped | 2.2 | 50–58 / 5–7 / 20–24 / 6 | 38–46 | `rending-claws`, `slam` | — | — |
| `elder_owlbear` | owlbear | quadruped | 2.4 | 46–54 / 10–12 / 19–22 / 13 | 36–42 | `dragon-claws`, `rending-beak`, `slam` | — | — |

Shared fields: `behaviour: "aggressive"`, `pack: [1,1]` (a leader spawns WITH its line's normal pack
via the Phase-3 escalation, not as its own herd), the base line's `lair`/`biomeWeights`/`diet`, belly
`armorMods` carried over where the line has one (cave_bear −14, elder_owlbear −11 — scaled with the
bigger hide). Names are player-facing: "Dire Wolf", "Alpha Worg", "Orc Warlord", "Goblin Boss",
"Kobold Chief", "Cave Bear", "Elder Owlbear".

### 2c. Humanoid gear — `database/lootpool.jsonc`

New data file: weighted pools, per-slot **draw chance** so a first-tier spawn is only partly kitted (reflects their state), a per-item **drop chance** on death (gear damaged in the fight). Drops hook into the existing `droppedItems` ground system.

Proposed structure + concrete pools (item ids exist in `items.jsonc`):

```jsonc
{
  "pools": {
    "scavenger_scraps": {              // kobold_skulker (T1)
      "mainHand": {"chance": 0.9,  "pick": [{"id":"bone_knife","w":3},{"id":"flint_handaxe","w":2},{"id":"stone_spear","w":1}]},
      "body":     {"chance": 0.35, "pick": [{"id":"wicker_vest","w":2},{"id":"raw_hide_vest","w":1}]},
      "head":     {"chance": 0.15, "pick": [{"id":"padded_cap","w":1}]},
      "dropChance": 0.5
    },
    "warband_bronze": {                // gnoll_marauder / goblin (T2)
      "mainHand": {"chance": 0.95, "pick": [{"id":"cast_bronze_hatchet","w":2},{"id":"short_seax","w":2},{"id":"framea","w":1}]},
      "body":     {"chance": 0.6,  "pick": [{"id":"raw_hide_vest","w":2},{"id":"boiled_leather_jerkin","w":1}]},
      "head":     {"chance": 0.4,  "pick": [{"id":"leather_coif","w":1}]},
      "dropChance": 0.55
    },
    "reaver_iron": {                   // orc_reaver (T3)
      "mainHand": {"chance": 1.0,  "pick": [{"id":"bearded_axe","w":2},{"id":"iron_mace","w":2},{"id":"spatha","w":1}]},
      "body":     {"chance": 0.8,  "pick": [{"id":"boiled_leather_jerkin","w":2},{"id":"scale_cuirass","w":1}]},
      "head":     {"chance": 0.6,  "pick": [{"id":"iron_nasal_helm","w":1}]},
      "dropChance": 0.6
    },
    "warlord_steel": {                 // orc warlord (miniboss)
      "mainHand": {"chance": 1.0,  "pick": [{"id":"steel_greatsword","w":1},{"id":"steel_warhammer","w":1}]},
      "body":     {"chance": 1.0,  "pick": [{"id":"mail_hauberk","w":2},{"id":"plate_cuirass","w":1}]},
      "head":     {"chance": 0.9,  "pick": [{"id":"great_helm","w":1}]},
      "dropChance": 0.8
    }
  }
}
```

- [ ] Add `lootpool.jsonc` + loader.
- [ ] Humanoid creature defs reference a pool id (`lootPool: "warband_bronze"`).
- [ ] At spawn: draw the loadout, put it in `equipment` (worn armour then feeds Phase-1 subtractive soak per part; the weapon drives `attackerProfile`).
- [ ] On death: roll `dropChance` per equipped piece → `droppedItems`.
- [x] **Open (answered):** pieces roll quality AND condition; fights damage them (durability wired for mobs too).

**Proposed quality/condition + wiring (2026-07-10, awaiting approval).** All item ids in the draft
pools above already exist in `items.jsonc` — the pools need no new items.

- **Mob equipment:** add `equipment?: PawnEquipment` to `Mob`. `attackerProfile` and
  `partArmorReduction` already branch on `'equipment' in attacker/defender`, so an armed mob swings
  its weapon and soaks through its worn armour with **zero combat-code changes** once the field exists.
- **Loader:** `core/LootPools.ts` mirroring `Creatures.ts` (parse, validate ids against ItemService,
  `getLootPoolById`).
- **Quality (§Q):** each pool carries a quality weight table; the drawn instance stamps `quality`:
  - `scavenger_scraps`: Crude 50 / Standard 50
  - `warband_bronze`: Crude 25 / Standard 65 / Fine 10
  - `reaver_iron`: Standard 70 / Fine 25 / Masterwork 5
  - `warlord_steel`: Standard 30 / Fine 50 / Masterwork 20
- **Condition:** spawn `durability` rolled at **40–85%** of the item's max (this gear has lived a hard
  life), seeded like the stat ranges. During a fight the existing `applyGearWear` extends to mob
  defenders/attackers (today `bestArmorSlot`/`decrEquipDurability` are pawn-typed) — so the piece that
  soaked the fight drops damaged, and a shattered piece (0) is simply gone before the drop roll.
- **On death:** per equipped piece, roll the pool's `dropChance` → push a `DroppedItem` carrying the
  instance's `quality` + remaining `durability` (needs `DroppedItem` to carry instance fields — today
  drops are id+qty; carcass condition already rides `_carcassCondition`, gear needs the §Q instance).

### 2d. Natural-gear upgrades for elites

- [ ] Map base→upgraded natural weapons per line (`claw`→`rending-claws`→`dragon-claws`; `bite`→`sabre-fangs`; `tusk`→`great-tusks`; `peck`→`rending-beak`). Elites swap via their `naturalWeapons` list (already supported). *All upgrade items already exist in `items.jsonc` — this is just the miniboss defs' lists (2b table).*
- [ ] Consider new natural gear (Phase 2 stretch): a natural **ranged** option (spit / quill-volley — only `web-shot`/breath exist), **constrict** for serpents, **trample** for megafauna, reusable `armorMods` presets (carapace / bony-plate / blubber).

**Proposed stretch items (2026-07-10, awaiting approval — these ARE new items, three `natural_weapon`
entries in `items.jsonc`):**

- [ ] `quill-volley` (quillback line): piercing, `reach 3` (engages like `web-shot`/breath — the
      existing natural-reach path, no ranged-circuit dependency), damage ~6, low weight so the bite
      still dominates in contact; hosted on the quadruped `tail`/back part.
- [ ] `constrict` (serpentine): blunt, damage ~8, `onHitCondition: ensnared` (existing condition,
      ~0.35 chance, resist `blunt_resistance`); hosted on `foreBody`.
- [ ] `trample` (megafauna — mammoth/aurochs elites): blunt, damage ~14, `stunChance 0.25`,
      `knockback 0.4`, heavy `armorDamage` (it CRUSHES — feeds Phase-1 hide/armour wear); hosted on
      the front-leg parts, weight low (an occasional roll, not the standard swing).
- Reusable `armorMods` presets: skip — per-creature `armorMods` entries (Phase 1c) are one line each;
  a preset indirection isn't worth the schema.

**Phase 2 acceptance:**
- [ ] Two spawns of the same miniboss differ in stats/armour (range roll).
- [ ] A geared humanoid fights with its weapon and is protected by its worn armour on the covered parts; killing it drops a subset of that gear.
- [ ] First-tier humanoids look under-equipped; warlords look kitted.

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
