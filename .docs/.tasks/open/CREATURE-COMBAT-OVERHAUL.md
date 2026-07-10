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

- [ ] **Throat/neck** on `quadruped`, `quadruped_hooved`, `amphibian`, `avian`, `serpentine` plans (humanoid/winged_humanoid already have `neck`). Proposed stats mirroring the humanoid neck: `size ~18–20, bleedRatio 0.06, hitWeight 2, armor 0`, in the `head` limb group, sitting over the airway (carotid/trachea → hard bleed).
- [ ] **Groin/femoral** on `humanoid` + `winged_humanoid`: `size ~15, bleedRatio 0.05, hitWeight 1.5, armor 0.1`, in the `torso` (or a `pelvis`) group — the femoral-artery weak point beneath armour coverage gaps.
- [ ] Route these through `bodyLabels.ts` so no snake_case id leaks into the health panel.
- **Open:** should throat/groin hits carry an organ-penetration route (carotid/femoral = fast bleed-out) beyond raw `bleedRatio`, // A: yes

### 1b. Precision directly raises organ-hit & fracture chance

Today organ-penetration ([Combat.ts](../../../src/lib/game/systems/Combat.ts) `~L930`) and fracture ([Combat.ts](../../../src/lib/game/systems/Combat.ts) `~L893`) chance scale with **force/damage** and fold precision in only via `crit`. Make `hit_precision` a **direct multiplier** so a deft fighter finds the kidney / cracks the femur.

- [ ] Multiply `organChance` and `fractureChance` by a precision factor `(1 + hit_precision × K_PRECISION)`.
- [ ] Add `K_PRECISION` constant(s) — magnitude TBD (`hit_precision` runs ~0.05 base → ~0.11 high DEX/PER; K must be sizable to matter, e.g. K≈4–6 → +20–65%). **Open:** exact K, and whether organ vs fracture get different weights.
- **Rationale:** a skilled/high-PER pawn (or a crit-prone stiletto) beats armour by *placement*, not by out-damaging it — armour stays a wall to mooks.

### 1c. Per-part `armorMods` for signature tanks (soft belly / hard shell)

Give the existing-but-unused `armorMods` its first users so aimed attacks have a real weak point on high-armour beasts.

- [ ] `mire_crocodile`, `quillback`, `owlbear`, `bear`: `armorMods: [{"target":"abdomen","defense":-N}]` (torn belly is the classic kill on armoured megafauna).
- [ ] `thornwood_spider`: hard carapace stays; optionally `+defense` on `cephalothorax`.
- **Open:** the `armorMods` schema only targets a part id / limb-group / `"all"` — there is no dedicated "back" part, so we can express **soft belly** (abdomen −N) but not "armoured back vs soft front" without new parts. Sufficient?

### 1d. Natural-hide degradation (attrition path)

The "wreck it, then it lands" loop, extended to creature hide.

- [ ] Give a mob an erodable **per-fight effective-armour pool** seeded from `naturalArmor`; blunt / high-`armorDamage` blows chip it (via the `armor_damage` stat), so a sustained fight progressively opens a tank up. // use the craftable gear durability as reference/fork
- [ ] Resets on disengage / out of combat (per-fight, not permanent maiming).
- **Open:** should hide degradation be per-part or a single creature-wide pool? Per-part is truer but heavier; creature-wide is simpler and reads clearly. // A: per part
- **Perf:** cross-check `ENGINE-PERFORMANCE.md` — this touches the combat hot path; the pool must be a scalar on the mob, mutated in place, no per-tick allocation.

**Phase 1 acceptance:**
- [ ] A high precision or damage pawn kills a bear meaningfully faster than a low precision or low damage pawn of equal STR (placement + organ routing).
- [ ] A long fight against a tank visibly "opens up" (hide degradation) rather than staying at 0-through. //yes, but crafted armor and weapon durability also deteriorates, so its a race 
- [ ] Throat/groin/belly show as human labels, never raw ids.
- [ ] `pnpm check` + combat `test:related` green; no TPS regression in `perf.log`.

---

## Phase 2 — Elite/variant ladder (hand-authored minibosses) + gear drops

### 2a. Spawn-time stat/armour ranges (elites only)

- [ ] Extend the creature def with optional `statRanges` / `naturalArmorRange` (`[min,max]`), rolled at spawn in `entitySpawning.ts` (today `def.stats` is used verbatim at `~L705`). 
- [ ] Deterministic per-spawn roll (seeded — no `Math.random`; vary by spawn index/turn per project rules).

### 2b. Hand-authored miniboss defs

Each is a `creatures.jsonc` entry: boosted base stats + a range band + `traits` (from the `traits.jsonc` combat ladder) + upgraded natural weapons + a loot pool ref. Proposed first set:

- [ ] **Dire Wolf** / **Alpha Worg** (wolf/worg line): `sabre-fangs`, +`naturalArmor`, traits ~ S2 speed/precision (`attack_speed 1.5`, `hit_precision 1.5`), pack-leader.
- [ ] **Orc Warlord** (orc_reaver line): steel-tier loadout from lootpool, S2/S3 `hit_chance`/`dodge` traits, `adrenaline`.
- [ ] **Goblin Boss** / **Kobold Chief** (humanoid low tier): bronze/iron loadout, S1–S2 traits.
- [ ] **Cave Bear / Elder Owlbear** (bear/owlbear line): `great-horns`/`dragon-claws`-class upgrade, higher hide + belly `armorMods`.
- **Open:** which creature lines get minibosses first? (proposed: wolf, worg, orc, goblin, kobold, bear — the recurring threats.)

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
- **Open:** do worn pieces roll a **quality/condition** (§Q) so drops aren't all Standard, and should a fight damage them below full durability before dropping? // A: roll a quality and condition, fight should damage them, eg wire durability up for them as well 

### 2d. Natural-gear upgrades for elites

- [ ] Map base→upgraded natural weapons per line (`claw`→`rending-claws`→`dragon-claws`; `bite`→`sabre-fangs`; `tusk`→`great-tusks`; `peck`→`rending-beak`). Elites swap via their `naturalWeapons` list (already supported).
- [ ] Consider new natural gear (Phase 2 stretch): a natural **ranged** option (spit / quill-volley — only `web-shot`/breath exist), **constrict** for serpents, **trample** for megafauna, reusable `armorMods` presets (carapace / bony-plate / blubber).

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

### 3b. Resource-gated lairs

- [ ] Bias lair placement toward **rare map resources** so a dangerous lair "guards" a reward; clearing it unlocks access.
- **Open:** lair sits **on** the resource (blocks harvest until cleared) or **adjacent** (contested but harvestable at risk)?

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
- **ADR:** the hide-degradation + precision-organ routing are non-obvious combat rules → add an **ADR** to `DECISIONS.md` and onboard it into `codegraph.config.json` `adrRules` (per AGENTS.md) when Phase 1 lands.
- **Docs to touch on completion:** `DESIGN.md` (combat mechanics), the archived `ENTITIES_SPAWNING` record + `ANIMAL-HUSBANDRY.md` (range rolls, lootpool, lair escalation), `TRAITS.md` (elite trait grants), `ROADMAP.md` (feature entry).

## Open questions (rolled up for refinement)

- [ ] Phase 1b: `K_PRECISION` magnitude, and organ vs fracture weighting.
- [ ] Phase 1a: do throat/groin get an explicit organ/artery bleed-out route, or is `bleedRatio` enough?
- [ ] Phase 1d: hide degradation per-part or creature-wide? reset timing?
- [ ] Phase 2b: which creature lines get the first minibosses?
- [ ] Phase 2c: do drops roll quality/condition; do fights degrade gear pre-drop?
- [ ] Phase 3: escalation cap (miniboss vs boss); lair-on vs lair-adjacent to resources.
