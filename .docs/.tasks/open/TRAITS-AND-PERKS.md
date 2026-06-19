<!-- LOC cap: 300 (created: 2026-06-18) -->

# TRAITS & PERKS — Unified Trait System

> **Related:** [ROADMAP](ROADMAP.md) · [RACE-SYSTEM](RACE-SYSTEM.md) · [RANGED-COMBAT](RANGED-COMBAT.md) (the combat axes perks tune) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

**SPEC — not started (shelved by the user during the combat-build-variety work).** The combat
*mechanics* perks would tune already landed (grips, encumbrance, the four ranged stats, stun,
durability — see RANGED-COMBAT Parts IV–VI). This spec is the **soft-class layer** on top: decouple
"racial trait" from "trait", so the same data model carries both innate race traits AND Battle-
Brothers-style per-pawn **perks**, then make perks *selectable* (a rolled list / tree per pawn).

---

## Goals

1. **One trait model, two sources.** Merge the per-pawn perk concept into the existing trait data so
   there is a single `Trait` type, one loader, one effect-application path — not a parallel system.
2. **Racial vs. acquired.** Racial traits are innate (rolled at race generation, fixed). Perks are
   **acquired per pawn** (chosen from a rolled list as the pawn develops).
3. **Drive build variety** (the whole point): perks deepen the BB-style identities the combat systems
   already express via stats + gear — Nimble dodge-tank, Battle-Forged armour-tank, Duelist, Shield
   specialist, Deadeye sniper, Quick-Hands skirmisher, Brawny thrower — without new core mechanics.
4. **No engine churn.** Perk effects reuse the existing trait-effect channel + the combat hooks
   already in place; a perk is *data*, not code, wherever possible.

---

## Part I — Data unification (the cheap, mechanical half)

- [ ] **Rename** `database/racial-traits.jsonc` → `database/traits.jsonc` (update the loader in
  `core/Race.ts` / wherever `RacialTrait` is read, and the `RacialTrait` type → `Trait`).
- [ ] **Add `racial: boolean`** to each entry. Every existing entry becomes `"racial": true` (a sed
  pass). New perks are `"racial": false`.
- [ ] Keep the existing `effects` schema (statBonus/Penalty, workSpeed/Yield/Quality, the resistances,
  `damageReduction`, `blunt/cutting/piercing_resistance`) — racial traits are unchanged.
- [ ] A pawn carries **two trait lists**: innate `racialTraits` (today's field) + new `perks: Trait[]`
  (acquired). Both flow through the SAME effect application (stat bonuses at generation for racial;
  perks re-applied/recomputed when acquired). Combat already reads `racialTraits` for resistances —
  extend those reads to `[...racialTraits, ...perks]`.

---

## Part II — Perk effects (extend the effect channel)

Perks need a few combat-build effect keys beyond the current race set. Add to the effect schema +
the combat hooks (the hooks already exist from the build-variety work — perks just feed them):

- [ ] `dodgeBonus` — flat add/mult to the `dodge` used in `resolveHit` (Nimble).
- [ ] `encumbranceReduction` — 0–1, cuts `armorEncumbrance` before the dodge/stamina penalty
  (Battle-Forged: "ignore armour fatigue").
- [ ] `gripBonus` — per-grip offense tweak folded into `applyMeleeGrip` (Duelist perk stacks with the
  duelist *grip*; Shield-Expert raises `SHIELD_DODGE_MULT` for this pawn).
- [ ] `aimBonus` — flat add to the ranged `aim_accuracy`/`aim_speed`/`aim_range` used in Combat (Deadeye,
  Quick-Hands) — same shape as the gear `aimBonuses`, read from the pawn's perks.
- [ ] `stunResistBonus` / `critBonus` / `armorPenBonus` — small combat scalars.
- [ ] **Capture-point:** combat reads perks via one helper `perkMods(pawn)` (mirrors `sumAimBonuses`)
  so the per-tick hot path stays a couple of cheap lookups, not an array rebuild (ENGINE-PERFORMANCE).

### Starter perk set (data, `racial:false`) — one per build pillar

| Perk | Effect | Build |
| ---- | ------ | ----- |
| **Nimble** | `dodgeBonus`, but a malus if armour load > X | light-armour dodge-tank |
| **Battle-Forged** | `encumbranceReduction` ~0.6 | heavy-armour tank |
| **Duelist** | `gripBonus` (duelist) +dmg/crit | 1H no-shield |
| **Shield-Expert** | higher shield dodge + knockdown resist | sword-and-board |
| **Berserker** | +dmg/+attack_speed as HP drops | 2H bruiser |
| **Deadeye** | `aimBonus.accuracy` + crit at range | PER sniper |
| **Quick-Hands** | `aimBonus.speed` + reload | DEX skirmisher/crossbow |
| **Brawny** | +thrown damage + carry | STR throw-hybrid |

---

## Part III — Selection: roll + tree (the feature half)

- [ ] **Acquisition trigger** — pawns gain a perk pick at milestones (level/XP, or a tenure/quest gate;
  decide with the progression system). On a pick, **roll a small list** (e.g. 3) of *eligible* perks;
  the player chooses one. (RimWorld trait-at-gen meets BB level-up perk pick.)
- [ ] **Tree / prerequisites** — perks declare `tier` + optional `requires: [perkId]`, so advanced
  perks (Master Duelist) gate behind their base. The roll only offers perks whose prereqs are met and
  that the pawn doesn't already have. A pawn's identity emerges from its pick history.
- [ ] **Eligibility weighting** — bias the roll toward the pawn's stat lean (a PER pawn rolls Deadeye
  more often) so rolls *feel* characterful, while leaving room for off-build picks.
- [ ] **UI** — a perk-pick modal (reuse the selection-card / chip components); show the rolled options
  with effect summaries; the pawn's acquired perks render as chips next to racial traits.

---

## Acceptance criteria

- [ ] `traits.jsonc` exists; every old racial trait carries `racial:true`; the loader/type renamed; no
  behaviour change for races (regression: existing race-gen tests green).
- [ ] Pawns carry + apply an acquired `perks` list; combat/work reads `racial ∪ perks`.
- [ ] The 8 starter perks exist and visibly change a fight (a Nimble pawn dodges more; a Battle-Forged
  pawn shrugs off plate fatigue; a Deadeye out-hits at range).
- [ ] Perk picks roll a list, respect tree prereqs, and persist on the pawn (save/load).
- [ ] Per-tick combat reads perks via one cheap `perkMods` accessor — no new hot-loop array work.

---

## Open questions

- [ ] **Progression spine** — what grants a perk pick? (XP/level, age/tenure, quests, a one-time
  character-creation budget?) Blocked on whether a pawn-progression system exists/lands.
- [ ] **Negative perks / flaws** (BB has them: Fearful, Dastard) — roll the occasional malus for
  texture + a stronger positive? Deferred.
- [ ] **Respec** — can a perk be dropped/retrained, or is identity permanent? Lean permanent (BB).
- [ ] **Racial perks** — should some races *start* with a perk (not just stat traits)? Natural once the
  model is unified (a race entry can list starting perk ids).
- [ ] **Magic overlap** — MAGIC-SKILLS skill trees vs. perk trees: one system or two? Reconcile before
  building the tree UI so they don't fork.
