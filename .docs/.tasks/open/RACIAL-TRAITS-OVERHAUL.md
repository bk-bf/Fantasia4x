<!-- LOC cap: 340 (created: 2026-07-06) -->

# RACIAL TRAITS OVERHAUL — Mundane Majority, Supernatural Rarity, Condition-Backed

> **Related:** [RACE-SYSTEM](RACE-SYSTEM.md) · [TRAITS-AND-PERKS](TRAITS-AND-PERKS.md) · [ROADMAP](ROADMAP.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · ADR-023 in [game/DECISIONS](../../game/DECISIONS.md)

## Status

**SPEC — not started.** Supersedes the trait payloads shipped in RACE-SYSTEM Phase 0. Full
scope agreed with the user (data + selection + combat/equip wiring); aging + true breath-cone
deferred to later phases.

## Problem

Racial traits don't matter. Diagnosis:

- **No contrast.** [`Race.ts:186`](../../../src/lib/game/core/Race.ts) rolls `rng.int(2,4)` traits,
  every one net-positive, all one tier. Every race is a bundle of 2–4 buffs with grandiose names.
  Nothing mundane, nothing negative, so a "supernatural" trait never *feels* special.
- **Payloads are noise.** Almost every trait is `+1..+3` to an attribute plus a `workSpeed` mult —
  below the floor of per-pawn variance. You never feel it, so you never look at the panel.
- **Stale stat integration.** The effect vocabulary ([`types/race.ts:25`](../../../src/lib/game/core/types/race.ts))
  predates the current [`stats.jsonc`](../../../src/lib/game/database/stats.jsonc). No trait path to
  `lightning`/`shadow`/`wetness` resistance; `damageReduction` is a flat soak that doesn't behave like armor.
- **The good mechanics are creature-only.** `onHitEffect` condition procs
  ([`Combat.ts:1256`](../../../src/lib/game/systems/Combat.ts)) and per-part `naturalArmor`
  ([`Combat.ts:543`](../../../src/lib/game/systems/Combat.ts)) exist and work, but pawns can't reach
  them — pawn natural weapons are hardcoded to `['fists','kick']` ([`Combat.ts:189`](../../../src/lib/game/systems/Combat.ts)).

## Core Idea — a supernatural trait *is a body condition*

Every supernatural/legendary trait routes through the **conditions system** so it is as legible as
everything else the player already reads. A trait keeps a **permanent self-condition** on the pawn
(shown in the health panel + gear tab); that condition carries its passive modifiers and its
equipment blocks. On top of that a trait may grant natural weapons/armor and proc conditions in
combat. One schema covers every example.

```jsonc
// racial-traits.jsonc — supernatural entry (all new keys optional)
{
  "id": "rending-claws",
  "tier": "supernatural",                 // mundane | supernatural | legendary
  "selfCondition": "clawed",              // permanent condition id → its modifiers + health/gear tell
  "blocksSlots": ["mainHand", "gloves"],  // slots the body forbids → greyed in gear tab
  "naturalWeapons": ["rending-claws"],    // unarmed-pool weapon (items.jsonc; may carry own onHitEffect)
  "onHitEffect": { ... },                 // OPTIONAL: procs on ANY melee hit (rides held weapon)
  "weaponBonus": { "damage": 0.15 },      // OPTIONAL: applies only while a weapon is equipped
  "naturalArmor": 18,                     // OPTIONAL: per-part soak, opened to pawns
  "aging": { "field": "naturalWeaponDamage", "scalesWith": "maturity" } // Phase 2
}
```

## Trait Tiers

| Tier             | Rarity (target)          | Payload                                                        |
| ---------------- | ------------------------ | ------------------------------------------------------------- |
| **mundane**      | majority (1–3 per race)  | small stat trade-offs, **incl. negatives** — the contrast layer |
| **supernatural** | rare (~30% one, ~5% two) | ONE capability: natural weapon OR armor OR on-hit proc OR passive |
| **legendary**    | very rare (~2–3%)        | a *bundle* of sub-capabilities, **each rolled independently**  |

Selection rewrite ([`generateRacialTraits`](../../../src/lib/game/core/Race.ts)): always roll
`rng.int(1,3)` mundane; then roll supernatural separately (~65% none / ~30% one / ~5% two),
archetype-weighted; then a rare legendary gate. Conflict groups still apply.

## Combat-ability wiring (trait-dependent — three distinct paths)

1. **`naturalWeapons`** — body weapon, used only when unarmed (or *forced* unarmed by `blocksSlots`).
   Its `onHitEffect` lives on the item → procs only when that weapon swings. (fangs→envenomed,
   horns→knockdown, dragon-claws→bleed.)
2. **`onHitEffect` on the trait** — procs on *any* landed melee hit regardless of held weapon; the
   "rides your steel" synergy case (Venom Glands, Flame-Touched fire-on-hit, vampire feeding). New
   per-pawn hook beside the existing weapon-side `applyOnHitEffect`.
3. **`weaponBonus`** — applies only while a weapon is equipped (Giant's Grip, Duelist's Blood).

## Conditions to add ([`conditions.jsonc`](../../../src/lib/game/database/conditions.jsonc))

- **Self/passive** (permanent while trait present, `transient:true`, pushed by `syncTransientConditions`):
  `clawed`, `furred`, `scaled`, `dragon_scaled`, `photosynthesis`, `light_sensitive`, `bloodthirst`.
- **`photosynthesis`** — driver condition that *fills hunger* while the pawn is unsheltered and tile
  `light ≥ ~0.95` (new driver shape; mirrors how `wet`/`sheltered` derive from environment).
- **New combat**: `burning` — fire DoT (needed by flame-on-hit AND dragon breath); genuinely new.
- **Reuse** existing `envenomed`, `bloodletting`, `knockdown`, `disoriented`, `staggered`,
  `concussed`, `hamstrung` for the rest.

## Example trait set (creative pass — not final numbers)

- **mundane**: Stocky (+CON/−DEX), Rangy (+DEX/−CON), Frail (−CON), Dull (−INT), Sickly (−disease
  res), Ill-tempered (−CHA), Slow (−move), Sturdy, Gaunt, Bright, Keen-eyed, Thin-skinned.
- **supernatural**: Scaled Hide (naturalArmor), Rending Claws (weapon + blocks grip), Venom Glands
  (on-hit envenomed), Thick Fur (naturalArmor + `+cold/−fire` res + blocks bodyMid), Flame-Touched
  (on-hit fire + `burning`), Photosynthetic (hunger-fill self-condition), Regeneration (real
  `heal_rate`), Ever-Warm (fire+cold immunity halts heat-stroke/hypothermia).
- **legendary** (bundle, each sub-capability rolled):
  - **Dragon Heritage** — {dragon-scales (naturalArmor + fire immunity), dragon-claws (natural
    weapon), dragon-eyes (nightVision + PER), dragon-blood (heal + fire immunity), fire-breath
    (single-target fire + `burning`)}. Two dragon-blooded pawns are never identical.
  - **Vampiric** (BG3/DnD flavor) — bloodsucking-fangs (natural weapon w/ `bloodDrain` that **heals
    the attacker**), `light_sensitive` (debuff while unsheltered in daylight), `bloodthirst` (feeds on
    blood, penalty when unfed). Most new-mechanic-heavy — feed-heals-self doesn't exist yet.

DnD/BG3 seeds: Draconic Ancestry, Lycanthrope, Tiefling (fire res + darkvision), Duergar, Githyanki —
all express in the schema above.

## Deferred / new subsystems (out of pass 1)

- **Aging natural weapons.** No pawn `age` field today. Phase 2: add a lightweight `maturity`
  (young→adult→old, ticked over time); scale `naturalWeapon` damage / `naturalArmor` by it. Old
  clawed pawn = longer, deadlier claws. Self-contained follow-on.
- **True fire-breath cone.** New AoE attack vector. Pass 1 ships breath as a *single-target* fire
  natural weapon; the cone is a later want.
- **Full vampiric feeding loop** (feed-heals-self, blood as a consumable need) — showcase later.

## Phases

### Phase 1 — Schema + Conditions + Data
- [ ] Extend `RacialTrait` in [`types/race.ts`](../../../src/lib/game/core/types/race.ts): `tier`,
      `selfCondition`, `blocksSlots`, `naturalWeapons`, `naturalArmor`, `onHitEffect`, `weaponBonus`;
      realign resistance keys with `stats.jsonc` (add lightning/shadow/wetness; drop dead keys / flat `damageReduction`).
- [ ] Add self/combat conditions to [`conditions.jsonc`](../../../src/lib/game/database/conditions.jsonc)
      (`clawed`, `furred`, `scaled`, `dragon_scaled`, `photosynthesis`, `light_sensitive`, `bloodthirst`, `burning`).
- [ ] Add natural-weapon items to [`items.jsonc`](../../../src/lib/game/database/items.jsonc)
      (rending-claws, goring-horns, serpent-fangs, dragon-claws, bloodsucking-fangs, flame-breath).
- [ ] Rewrite [`racial-traits.jsonc`](../../../src/lib/game/database/racial-traits.jsonc) into the
      three tiers; keep/repair the name-good existing ones (dragon-heritage→legendary, flame-touched,
      photosynthetic, scaled-hide, iron-skin, venomous, regenerative).

### Phase 2 — Selection
- [ ] Rewrite `generateRacialTraits` for mundane-majority + rare supernatural + very-rare legendary;
      legendary sub-capability rolls; conflict groups preserved.

### Phase 3 — Combat + Equip wiring
- [ ] Pawn natural weapons from traits (fold into the pawn branch of `attackerProfile`, [`Combat.ts:400`](../../../src/lib/game/systems/Combat.ts)).
- [ ] Pawn `naturalArmor` in `partArmorReduction` (open the `creatureId`-gated path to pawns).
- [ ] Trait-level `onHitEffect` per-pawn hook; `weaponBonus` in the equipped-weapon branch.
- [ ] `photosynthesis` + `light_sensitive` environment drivers in `syncTransientConditions`.
- [ ] `blocksSlots` equip-guard (equip action in `GameEngineImpl`) + gear-tab greyed-slot surfacing.
- [ ] `burning` DoT tick.

### Phase 4 — Deferred (separate)
- [ ] Aging / `maturity` scaling.
- [ ] Fire-breath cone AoE.
- [ ] Full vampiric feeding loop.

## Acceptance criteria

- [ ] The median generated race reads as a plain humanoid with 1–3 small (often negative) quirks.
- [ ] A supernatural pull is visibly distinct: a natural weapon, natural armor, or an on-hit proc
      that changes how the pawn fights.
- [ ] Every supernatural trait shows a legible pill in the health panel and, if it blocks gear, a
      greyed slot in the gear tab — no hidden math.
- [ ] Claws race is devastating unarmed but debuffed at the workbench; fur race trades a chest layer
      and heat resistance for cold resistance + natural armor.
- [ ] `pnpm check` + trait/combat `test:related` green; existing trait tests updated.

## Docs to sync on completion

- RACE-SYSTEM (trait-DB section), game/DESIGN (race/pawn mechanics), game/ARCHITECTURE if a new
  service/data-flow lands, DECISIONS (new ADR if the condition-backed-trait model is locked in),
  ROADMAP entry.
