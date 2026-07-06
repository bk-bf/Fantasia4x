<!-- LOC cap: 360 (created: 2026-07-06) -->

# TRAIT SYSTEM V2 — Categorised Traits + Condition Relationship Graph

> **Related:** [RACIAL-TRAITS-OVERHAUL](RACIAL-TRAITS-OVERHAUL.md) · [RACE-SYSTEM](RACE-SYSTEM.md) ·
> [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · ADR-023 in
> [game/DECISIONS](../../game/DECISIONS.md) · patterns after [`weather.jsonc`](../../../src/lib/game/database/weather.jsonc)

## Status

**PROPOSAL — supersedes the "balance overhaul" section of RACIAL-TRAITS-OVERHAUL.** Nothing built yet.
The ADR-023 data model (traits.jsonc, condition-backed supernatural traits, per-pawn draw, `evolvesTo`)
stays; this re-shapes trait *payloads* into typed categories, gates their scope by rarity, turns
natural armor into real gear, makes afflictions real wounds, and (Phase 2) turns condition interactions
into a data-driven graph like weather.

## Evaluation of the current system

The audit stands: trait payloads are an untyped `effects` bag, so nothing enforces *what kind* of thing
a trait may do or *how much*. That produced the gamification the design rejects — `iron-skin` stacking
`+2 CON` + `−1 DEX` + `+10% mining` on top of 18 armor; `frost-born` "fishing skill"; `one-eyed` as a
`−PER` number instead of a missing eye. Conditions are already the right hub (supernatural traits ARE
conditions), but every condition *interaction* (wet→hypothermia, blood/pain→shock, wound→infection) is
hardcoded in `tickConditions`, so designers can't author new ones. V2 fixes both: **typed trait
categories with rarity budgets**, and **conditions as a weather-style relationship graph**.

## 1 · Trait taxonomy — every trait has a `kind`

`kind` decides the payload shape and which validator/loader path applies. One primary kind per trait
(a bundle/legendary composes several via `subCapabilities`).

| `kind` | Payload | Meaning |
| --- | --- | --- |
| `stat` | `statMods: {strength:+2, dexterity:-1}` | flat core-stat deltas, baked at pawn-gen |
| `attribute` | `attributeMods:[{category,stat,value}]` | modifies derived stats.jsonc stats; **breadth gated by rarity** (§2) |
| `naturalGear` | `grants:{condition, mode:'replace'\|'stack', slot?}` | a natural weapon/armor condition that occupies-or-stacks a gear slot (§3) |
| `passive` | `grants:{condition}` | a permanent full-body condition — aura / affinity / proc (§3) |
| `wound` | `wounds:[{part, severity}]` | applies a real wound at generation (§4) |

**TODO kinds** (schema reserved, not built — §7): `behavioral`, `needs`, `transformation`.

- [ ] Add `kind` + the per-kind payload fields to the `Trait` type; a compile-time discriminated union
      so each kind's payload is checked. Keep `scope`/`tier`/`evolvesTo` from ADR-023.
- [ ] `traitRegistry.test.ts`: assert every trait's payload matches its `kind` and respects §2 budget.

## 2 · Rarity → scope budget

Traits adopt the **`rarities.jsonc` scale** (common → uncommon → rare → epic → legendary) as their
`tier`, replacing the coarse mundane/supernatural/legendary. Rarity is a *budget*: how many attribute
**categories** (physical · capacity · combat · resistance · work) a trait may touch, and its polarity.

| Rarity | Attribute categories | Capability (naturalGear/passive) | Notes |
| --- | --- | --- | --- |
| common | 1 (a "bad" one may **debuff 2** — the contrast layer) | — | small; the mundane pool |
| uncommon | 1–2 (net-positive with a real cost) | — | a trade-off with teeth |
| rare | ≤1 | 1 capability | the "one thing" supernatural tier |
| epic | ≤2 | 1 capability **or** a proc condition | e.g. Berserker's combat proc |
| legendary | bundle | multiple sub-capabilities, rolled per pawn | Dragon / Vampire |

- **Core-stat (`stat`) mods** are separate from the attribute budget and stay tiny (±1–2), any rarity.
- **"Really shitty" traits** = common `attribute` traits that debuff **two** categories (e.g. *Sluggard*:
  −work +−physical; *Brittle*: −resistance +−capacity). Propose ~6 of these to deepen the negative pool.
- [ ] Encode the budget as data (`rarityBudget` table) + enforce in `traitRegistry.test.ts`.

## 3 · Condition-granter model (natural gear + passive)

Both grant a permanent condition (the ADR-023 hub). Split by how they interact with equipment:

**`naturalGear`** — the condition is *gear*. It carries, beyond today's `grantsNaturalWeapon`/
`grantsNaturalArmor`: `defense` (0–100), `weight` (kg, feeds encumbrance), `slot`, `mode`.
- `mode:'replace'` → occupies + **blocks** the slot (claws→mainHand+gloves, horns→head). Renders as a
  locked gear pill; hover shows an armor/weapon breakdown like real gear.
- `mode:'stack'` → **layers** with worn gear (scaled hide under a cuirass). Adds its `defense` to the
  part soak and its `weight` to the carry load.
- **Encumbrance, not flat DEX.** A heavy hide's DEX/move cost comes from the existing `encumbered`
  condition (load ÷ STR capacity), exactly like plate — so Iron Skin is `defense 18, weight 12`, and the
  slowdown is emergent + legible, not a hand-tuned `−1 DEX`.

**`passive`** — a permanent full-body condition: resist/affinity (`ever_warm`, `frost_born`), a proc
(`berserker_blood` — active only while `flags:["combat"]` state holds, §5), or an aura (affects nearby
pawns — TODO). Carries `modifiers` + `flags`; no gear slot.

- [ ] Extend the condition schema with `defense`/`weight`/`slot`/`mode` (natural gear) + wire natural
      armor into `itemService.getCurrentCarryLoad` + `partArmorReduction` (already pawn-open).
- [ ] Gear-pill UI in `EquipmentDoll` (locked slot for `replace`, innate badge for `stack`) with an
      armor-style hover — extends what's already there.

## 4 · Wound granters — afflictions are real wounds

A `wound` trait applies an injury at `buildPawnFromRace` via the existing `Wounds`/limb system, so it
shows in the health tab and flows through the body model (capacities), not a stat hack.

- `one-eyed` → `{part:'left_eye', severity:'destroyed'}` → `sight` capacity halved (real), PER falls out
  of the model, not a `−PER` fudge. `hard-of-hearing` → an ear; `bad-back` → a spine/torso wound; `scarred`
  → a healed scar (cosmetic + small `mental_resistance`).
- [ ] `applyTraitWounds(pawn, traits)` in Pawns.ts, referencing `limbmap.jsonc` part ids +
      `WoundSeverity`. Guard: never lethal at spawn (cap severity so a wound-trait can't kill a newborn).

## 5 · Conditions as a relationship graph (weather-style)

Today's condition *interactions* are hardcoded. Mirror `weather.jsonc`'s Markov model: each condition
may **trigger other conditions** with a chance, and may **activate on an environmental trigger**.

```jsonc
// conditions.jsonc — new optional fields on any condition
{
  "id": "wet",
  "flags": ["environmental", "cold-vector"],           // tags for querying + rules
  "triggers": [                                          // weather-style transition edges
    { "to": "hypothermia", "chance": 0.02, "when": { "source": "cold", "atOrAbove": 100 } }
  ]
}
{
  "id": "bleeding",  "flags": ["combat", "bleed"],
  "triggers": [ { "to": "shock", "chance": 0.05, "when": { "stat": "bloodVolume", "atOrBelow": 40 } } ]
}
```

- **`flags: string[]`** — categorise conditions (environmental / combat / disease / mood / racial /
  magical / bleed …). Enables "is this a disease?" queries + relationship rules + UI grouping.
- **`triggers: [{ to, chance, when?, per? }]`** — a per-tick (or on-onset) roll to spawn/escalate another
  condition. `when` is an optional predicate (need level, tracked meter, stat, moon phase, ambient light).
  This is the exact shape of weather `transitions`, applied to the condition graph.
- **`activateWhen: <predicate>`** — a condition is pushed only while its environmental trigger holds
  (generalises today's `needOnset` + the photosynthesis/light_sensitive gating). Powers *mermaid* (buff
  while `wetness≥80`, debuff while dry), *earth-kin* (debuff while `wet`), *dragon* (needs heat).

**Migrate the hardcoded interactions into data**: wet→hypothermia (`WET_CHILL_*`), pain/blood→shock
(`applyShock`), untended-wound→infection, envenomed's secondary effects. `tickConditions` becomes a
generic evaluator that walks each active condition's `triggers`/`activateWhen` against the graph.

- [ ] Condition schema: `flags`, `triggers`, `activateWhen`. Predicate evaluator (need/meter/stat/env).
- [ ] `conditionGraph.ts`: evaluate transitions each tick; replace the hardcoded blocks in
      `tickConditions`. Guard against cycles + runaway chains (cap escalations/tick, like weather's
      `stormCorner` step-down).

## 6 · Re-audit — current traits mapped to kinds (the gamification purge)

| Trait | New kind | Change |
| --- | --- | --- |
| Sturdy/Stocky/Frail/Gaunt… | `stat` | keep tiny core-stat deltas |
| Frost-Loving/Thick-Skinned/Cold-Blooded | `attribute` (resistance) | resistances only; drop any work % |
| Iron Skin / Scaled Hide / Thick Fur | `naturalGear` (armor, stack) | **drop +CON, −DEX, mining%**; defense+weight→encumbrance |
| Rending Claws / Goring Horns / Fangs | `naturalGear` (weapon, replace) | **drop +STR**; the weapon is the identity |
| Ever-Warm / Regeneration / Flame-Touched / Photosynthetic | `passive` | drop tacked-on +CON / work % |
| Frost Born | `passive` + `activateWhen` cold | resistances; **drop fishing/hunting %** |
| Berserker Blood | `passive` proc | +STR/+dmg only while `flags:["combat"]`; **drop always-on stats + work %** |
| Nocturnal | `passive` + `activateWhen` night | night-only DEX/PER; **drop always-on + hunting %** |
| One-Eyed / Hard-of-Hearing / Bad Back | `wound` | real wounds (§4) |
| Strong-Backed / Feathered | `stat`/`attribute` | **drop illogical work %** |
| Vampiric / Dragon Heritage | legendary bundle | naturalGear + passive + (TODO needs: blood/heat meter) |

**Kept** (logical): amphibious→fishing, marsh-dweller→forage-yield, negative work links on real physical
limits, and personal-trait work mods (temperament *is* a work aptitude).

## 7 · TODO expansions (schema-flagged, built later)

- [ ] **`behavioral`** — grants a quirky tic via a condition: a *Lost* FSM state (wanders, can't path back
      to base/need/job) surfaced as a pill; needs pawn-FSM work.
- [ ] **`needs`** — add/remove a per-pawn need: a **blood meter** (vampiric — feed or suffer),
      a **heat requirement** (dragon). Needs the needs system to support dynamic per-race need sets.
- [ ] **`transformation`** — trigger-gated temporary condition SETS: werewolf at `moonPhase:'full'`,
      **mermaid** buffed at high `wetness` / crippled when dry, earth-kin debuffed when wet. Composes §5's
      `triggers`/`activateWhen` with a timed condition bundle.

## 8 · Phasing

- **Phase 1a — condition graph INFRASTRUCTURE (build now):** condition `flags` + `triggers` +
  `activateWhen` schema; a pure, unit-tested `conditionGraph` evaluator + predicate system; then wire it
  into `tickConditions`, migrating the hardcoded interactions to data **behaviour-identical**. The
  DETERMINISTIC certainties stay certain — shock still fires under its exact current pain/blood triggers,
  just declared in the schema (a `chance`-less / threshold edge), not probabilistically. ⚠ hot path —
  cross-check `ENGINE-PERFORMANCE.md`; the evaluator must allocate nothing per tick.
- **Phase 1b — typed traits + data:** `kind` union + rarity budget (`rarities.jsonc` scale) + registry
  test; natural-armor-as-gear (encumbrance) + gear-pill UI; wound-granters (capped non-lethal); full
  traits.jsonc re-tune (§6); ±6 new "shitty" 2-category commons.
- **Phase 2 (TODO §7):** behavioral / needs / transformation.

## Locked decisions (2026-07-06)

- [x] **Rarity scale:** traits adopt the full `rarities.jsonc` scale (common → uncommon → rare → epic →
      legendary) as `tier`.
- [x] **Condition graph:** build the infrastructure NOW, but **preserve the certainties** — deterministic
      interactions (e.g. shock from pain/blood) keep firing under their current triggers, mapped through
      the new schema as threshold (non-`chance`) edges rather than probabilistic rolls.
- [x] **Wounds at spawn:** yes — wound-granting traits apply a real wound at generation, capped so it can
      never be lethal to a newborn.

## Docs to sync on completion

ADR (new ADR if the typed-trait + condition-graph model is locked), RACE-SYSTEM, game/DESIGN, ROADMAP;
onboard the ADR into `codegraph.config.json` `adrRules`.
