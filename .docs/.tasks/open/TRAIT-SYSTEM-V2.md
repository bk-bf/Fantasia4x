<!-- LOC cap: 360 (created: 2026-07-06) -->

# TRAIT SYSTEM V2 — Categorised Traits + Condition Relationship Graph

> **Related:** [RACIAL-TRAITS-OVERHAUL](RACIAL-TRAITS-OVERHAUL.md) · [RACE-SYSTEM](RACE-SYSTEM.md) ·
> [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · ADR-023 in
> [game/DECISIONS](../../game/DECISIONS.md) · patterns after [`weather.jsonc`](../../../src/lib/game/database/weather.jsonc)

## Status

**Phases 1a + 1b DONE (2026-07-06) — ADR-028.** Supersedes the "balance overhaul" section of
RACIAL-TRAITS-OVERHAUL. The ADR-023 data model (traits.jsonc, condition-backed supernatural traits,
per-pawn draw, `evolvesTo`) stays; this re-shaped trait *payloads* into typed `kind` categories on the
`rarities.jsonc` scale, turned natural armor into real gear (defense + weight → encumbrance;
stack/replace vs worn), made afflictions real permanent wounds, purged the gamification, added the
2-category-debuff commons, and shipped the condition relationship graph (flags/triggers/activateWhen)
with the hardcoded interactions migrated behaviour-identical. `pnpm check` 0 errors; trait/wound/
combat/encumbrance suites green (the 2 failing craft tests pre-date this work). **Phase 2 (§7
behavioral/needs/transformation) remains TODO.**

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
| `stat` | `effects: {strengthBonus:+2, …}` | flat core-stat deltas ONLY, baked at pawn-gen |
| `attribute` | `effects: {workSpeed/resistances/nightVision/healRate}` | derived stats.jsonc mods ONLY — **never a core-stat rider**; breadth gated by rarity (§2) |
| `bodyMod` | `bodyMods:[{target:'skeleton'\|'flesh'\|partId, hpMult?, weightKg?}]` | modifies the limbmap BODY at gen — bone/flesh HP + body weight (heavy bones → fractures harder; thin skin → wounds bite faster). Real mechanics, not a `blunt_resistance` fudge (§1a) |
| `naturalGear` | `selfCondition` → `{grantsNaturalArmor, weightKg, mode}` / `{grantsNaturalWeapon, hostParts}` | a natural weapon/armor condition; armor stacks-or-replaces a slot (§3), a WEAPON is bound to limbmap `hostParts` so losing the limb loses it |
| `passive` | `selfCondition` → a full-body condition | aura / affinity / covering (feathers) / proc (§3) |
| `wound` | `wounds:[{part, severity, type?}]` | applies a real permanent wound at generation (§4) |

**STRICT SEPARATION (ADR-028):** `stat` and `attribute` never mix, and a **naming law** applies — a
`stat`/`attribute` trait's NAME must be mundane + generic and MUST NOT evoke a natural weapon/armor or a
losable body part (bone/skin/hide/claw/horn/fang/eye/ear/feather…). Those names imply a body mechanic the
abstract trait doesn't have; only the body-touching kinds (`bodyMod`/`naturalGear`/`passive`/`wound`) may
carry an anatomical name. Enforced by `traitRegistry.test.ts` (`ANATOMY_NAME_RE`).

**TODO kinds** (schema reserved, not built — §7): `behavioral`, `needs`, `transformation`.

### 1a · `bodyMod` — intrinsic body-structure traits

A `bodyMod` trait post-processes the pawn's own limb tree at generation (`applyTraitBodyMods`, the
`applyTraitWounds` sibling), so the effect lives in the real body model instead of an abstract multiplier:
`skeleton` targets scale bone maxHp = the **fracture budget** (dense vs brittle bone); `flesh` targets the
soft parts' maxHp = **wound tolerance** (thick vs thin hide); `weightKg` adds body mass → the blood pool +
the `encumbered` load (so heavy bones slow the pawn emergently, not via a hand-tuned DEX penalty). Full
health is preserved (maxHp + health scale together), so capacities read normal until the part is hurt.
Members: `heavy-boned`/`brittle-boned` (skeleton), `thick-skinned`/`thin-skinned` (flesh), `stone-bones`
(epic, ×2.2 bone). Trait cards show a "bones +40%" pill; hover names the affected parts + the mechanic.

- [x] `kind` + per-kind payload fields on the `Trait` type (`wounds` incl. optional wound `type`;
      condition-side `weightKg`/`mode`). Kept `scope`/`evolvesTo`; `tier` → `rarity` (§2).
- [x] `traitRegistry.test.ts`: every trait's payload matches its `kind` + respects the §2 budget.

## 2 · Rarity → scope budget

Traits adopt the **`rarities.jsonc` scale** (common → uncommon → rare → epic → legendary) as their
`tier`, replacing the coarse mundane/supernatural/legendary. Rarity is a *budget*: how many attribute
**categories** (physical · capacity · combat · resistance · work) a trait may touch, and its polarity.

| Rarity | Attribute categories | Capability (naturalGear/passive) | Notes |
| --- | --- | --- | --- |
| **negative** | pure downside | — | a FLAW (§2a) — drawn as a bell-curve count, never race identity |
| common | 1 (trade-offs allowed) | — | small; the mundane variety pool |
| uncommon | 1–2 (net-positive with a real cost) | — | a trade-off with teeth |
| rare | ≤1 | 1 capability | the "one thing" supernatural tier |
| epic | ≤2 | 1 capability **or** a proc condition | e.g. Berserker's combat proc |
| legendary | bundle | multiple sub-capabilities, rolled per pawn | Dragon / Vampire |

- **Core-stat (`stat`) mods** are separate from the attribute budget and stay tiny (±1–2), any rarity.
- [x] Budget enforced in `traitRegistry.test.ts` (kind↔payload, rare/epic must carry a capability,
      legendary must bundle). A separate `rarityBudget` data table was skipped — the test IS the budget.

### 2a · `negative` — the FLAW tier (ADR-028)

Pure-downside traits (frail, clumsy, one-eyed, the afflictions, the "shitty" commons) carry
`rarity:"negative"` and are pulled OUT of every positive pool (race identity, variety pool, personal
draw). A pawn instead draws a **bell-curve COUNT** of flaws — `rollNegativeCount` = `round(|Gaussian(0,
σ=1.25)|)` clamped 0–4 — from the whole flaw set (racial physiology + personal temperament + afflictions),
honouring conflict groups (no dense + brittle bones). So most pawns carry none/one and a four-flaw wretch
turns up ~once per 170 pawns: **0:31% · 1:46% · 2:19% · 3:4% · 4:0.6%**. Independent of the ≤5 positive
budget (a very unlucky pawn can exceed 5 total traits). `σ` is the single tuning knob — lower for a
cleaner colony, higher for a harsher world. Card accent = dark red ("Flaw"). Guarded by
`traitRegistry.test.ts` (pure-downside + marquee flaws are `negative`) + `traitFlaws.test.ts` (bell-curve
shape, cap 4, conflict integrity, never a race-pool member).

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

**Natural WEAPONS are limb-bound (ADR-028).** A trait's natural weapon lists `hostParts` (limbmap part ids)
on its granting condition — claws→`[leftHand,rightHand]`, horns→`[head]`, fangs→`[jaw]` — exactly like a
creature's `weapons` on a limbmap part. `Combat.pawnNaturalWeaponIds` resolves the weapon only while at
least one host part survives, so a pawn whose hands are gone loses the claws (falling through to the thrash
fallback), mirroring the proven creature path (`enabledNaturalWeapons`). Natural ARMOR is already per-part
(the `armor` share distributes the magnitude; a destroyed part drops its share), so it needed no change.

**`passive`** — a permanent full-body condition: resist/affinity (`ever_warm`, `frost_born`), a covering
(`feathered` → cold insulation, no armor value), a proc (`berserker_blood`), or an aura (TODO). Carries
`modifiers` + `flags`; no gear slot.

- [x] Condition schema: `weightKg` + `mode` next to `grantsNaturalArmor` (= the defense; slot stays on
      the trait's `blocksSlots` — no duplicate that could drift). Wired into
      `itemService.getCurrentCarryLoad` (weight → `encumbered`) and `partArmorReduction`
      ('stack' ADDS to the worn soak, 'replace' competes best-of like a worn layer).
- [x] Gear-pill UI in `EquipmentDoll`: locked slot / innate badge hover the SAME `ItemStatTooltip` as
      real gear (weapon = its item def; armor = a synthesized def with defense/weight/mode).

## 4 · Wound granters — afflictions are real wounds

A `wound` trait applies an injury at `buildPawnFromRace` via the existing `Wounds`/limb system, so it
shows in the health tab and flows through the body model (capacities), not a stat hack.

- `one-eyed` → `{part:'left_eye', severity:'destroyed'}` → `sight` capacity halved (real), PER falls out
  of the model, not a `−PER` fudge. `hard-of-hearing` → an ear; `bad-back` → a spine/torso wound; `scarred`
  → a healed scar (cosmetic + small `mental_resistance`).
- [x] `applyTraitWounds(pawn)` in Pawns.ts: permanent healed-over injuries (`Injury.permanent` —
      skipped by healing/infection/caretaking, allocation-guarded), paired-side flip for variety,
      never lethal (vital/critical refused; destroyed-on-container/bone → critical). `traitWounds.test.ts`.

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

- [x] Condition schema: `flags`, `triggers`, `activateWhen`. Predicate evaluator (need/meter/stat/env).
- [x] `conditionGraph.ts`: evaluates transitions each tick; the hardcoded blocks in `tickConditions`
      migrated behaviour-identical (wet→hypothermia, envenomed→nausea; shock/infection stay `driver`
      curves — see Phase 1a notes).

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
  - [x] Schema (`ConditionPredicate`/`ConditionTrigger`/`ConditionGraphFields`) + pure allocation-free
        `conditionGraph.ts` evaluator + 8 unit tests.
  - [x] `activateWhen` wired: `photosynthesis`/`light_sensitive` env-gating now data-driven via
        `evaluatePredicate` (replaced the bespoke helpers) — behaviour-identical, generalises to future
        transformations.
  - [x] First trigger edge wired: `wet → hypothermia` (the old inline WET_CHILL) now fires through
        `fireTriggers` from `conditions.jsonc` data — behaviour-identical (same gate/predicate/chance/
        severity, RNG order preserved; 111 sim + 6 wetness tests green).
  - [x] General trigger-firing pass in `tickConditions` — evaluates every active condition's edges
        (timer-transients + persistent), handling PERSISTENT targets (severity, e.g. hypothermia) and
        TRANSIENT targets (timer, e.g. nausea). Cheap-gated by `CONDITION_IDS_WITH_TRIGGERS` (zero work +
        no alloc for pawns with no trigger-bearing condition). First new edge: `envenomed → nausea`.
  - [x] Full `flags` taxonomy pass — all 69 conditions categorised (need/combat/environmental/disease/
        racial/mood/magical/food/driver…). Data-integrity test asserts every trigger target resolves.
  - [x] shock + infection: these are CONTINUOUS meter/wound-driven SEVERITY curves (shock SETs
        `max(painSev,bloodSev)` with a pain-numbing mult; infection accrues from dynamic wound pressure),
        NOT fixed-severity transition edges — a `fireTriggers` edge would ACCRUE, changing behaviour. So
        they keep their exact functions and are flagged `driver` in the schema (graph-legible) rather
        than force-fit into an edge. A future `severityDriver` schema (meter → set-severity) could fully
        data-drive them; deferred (would risk the "preserve exactly" guarantee).
- **Phase 1b — typed traits + data:**
  - [x] `kind` union (`stat`/`attribute`/`naturalGear`/`passive`/`wound`) + `rarity` on the
        `rarities.jsonc` scale (replaced the mundane/supernatural/legendary `tier`); selection + trait-card
        UI now key on rarity; `traitRegistry.test.ts` enforces kind↔payload + rarity budget.
  - [x] Full traits.jsonc §6 re-tune — illogical work bonuses (iron-skin mining, frost-born fishing,
        strong-backed mining, feathered foraging, berserker/nocturnal hunting…) and redundant flat stats
        on rare traits (iron-skin +CON/−DEX, scaled/regen/thick-fur/gore +CON/STR) removed. Logical links
        kept (amphibious→fishing, claws→−crafting). Regression-guarded by the registry test.
  - [x] Natural-armor-as-gear (2026-07-06): conditions carry `weightKg` + `mode` ('replace' competes
        best-of like a worn layer; 'stack' ADDS to the worn soak — Combat.partArmorReduction); weight
        loads `getCurrentCarryLoad` → the staged `encumbered` condition (no hand-tuned DEX penalty).
        EquipmentDoll locked slots/badges now hover the SAME ItemStatTooltip as real gear (weapon =
        its item def; armor = a synthesized def with defense/weight/mode). `check` + tests green.
  - [x] Wound-granters applier (2026-07-06): `applyTraitWounds` in Pawns.ts stamps PERMANENT,
        healed-over injuries at gen (bleeding 0, fully clotted, `permanent: true` — skipped by
        healing/infection/caretaking, allocation-guarded so an all-permanent limb keeps its ref).
        Non-lethal cap: vital/critical parts refused; destroyed-on-container/bone → critical.
        one-eyed → a destroyed eye (sight 0.35 via organBlend), hard-of-hearing → a destroyed ear
        (hearing 0.5), bad-back → a serious spine crush (chronic ache). Stat fudges dropped.
  - [x] Six "shitty" commons (2026-07-06): sluggard, slow-mending, night-blind, thin-blooded, pox-marked,
        stiff-jointed — kind-clean negatives (re-homed to stat/attribute per the separation below).
  - [x] `bodyMod` kind + naming law + limb-bound natural weapons (2026-07-07, ADR-028): new `bodyMod`
        kind (`applyTraitBodyMods` — bone/flesh HP + weight); heavy/brittle-boned, thick/thin-skinned,
        stone-bones moved off abstract stats onto the real body; feathered → `passive` covering. STRICT
        `stat`≠`attribute` separation (core-stat riders stripped from every attribute trait: amphibious,
        marsh-dweller, adrenaline, sickly, curious, loner…; ill-tempered/gregarious/hot-headed → `stat`).
        Anatomical pure-stat names renamed to generic (strong-backed→Brawny, keen-eyed→Watchful,
        nearsighted→Oblivious, flat-footed→Graceless, short-winded→Languid, weak-stomached→Delicate,
        scarred→Stoic, warm-blooded→Heat-Hardy). Natural weapons bound to `hostParts` (claws→hands,
        horns→head, fangs→jaw) so a pawn loses its claws with its hands. bodyMod pills + hover on the
        trait card. Guarded by `traitRegistry.test.ts` (separation + `ANATOMY_NAME_RE` naming law +
        bodyMod payload) and `traitWounds.test.ts` (applier + hostParts data integrity).
- **Phase 1c — post-audit revisions (2026-07-07, ADR-028):**
  - [x] **Natural armor: `weightKg` → `carryPenalty` (fraction of carry capacity).** An absolute kg could
        exceed a weak pawn's whole budget and encumber it forever while bare. Now natural armor REDUCES
        `getCarryBudget` by a % (iron 0.15 · scaled 0.06 · fur 0.08 · dragon 0.12), clamped so capacity
        stays ≥40% of base — a bare pawn is never encumbered, it just hauls less. `getCurrentCarryLoad`
        no longer adds trait weight.
  - [x] **`mythic` rarity tier** (between epic and legendary) + **tier-weighted selection**: the per-race
        gate is one cumulative roll, rarest first (legendary 1.5% · mythic 1.5% · epic 3% · rare 9%), so a
        higher tier is genuinely rarer — **iron skin moved rare→epic** and now lands ~1.1% (rarer than a
        plain rare, "1 above rare / 2 below legendary"), its 18 armor justified by the higher tier + the
        carry cost. Cyan card accent.
  - [x] **Amphibious forked.** The old work-affinity trait → generic **`waterborn`** (common: fishing/
        forage). New **`amphibious`** is a **mythic bundle** ("dragon-heritage lite" — gilled +
        swift-swimmer + moist-skinned sub-capabilities, rolled per pawn; new `gilled`/`moist_skinned`
        conditions).
  - [x] **squeamish** dropped the nonsensical hunting penalty (hunting = combat) → `butchery 0.75 +
        caretaking 0.85` (both gore-sensible). **stiff-jointed** renamed **Maladroit** (its "joints" name
        implied a body mechanic it lacks; `joint` added to the naming-law blocklist).
  - [x] **Destroyed-wound care bug.** A DESTROYED, no-longer-bleeding part (a lost limb) can't heal or be
        dressed, yet counted as an untended wound — a medic tended it forever and it festered endlessly.
        New `Wounds.isUncareable` (permanent OR destroyed+non-bleeding) gates `hasUntendedWound`,
        `tendPatient`, and the infection loop. A still-bleeding stump is still an emergency.
  - [x] **Wound-trait hover cites the real side.** The applier flips left/right per pawn, so the trait
        card (given the pawn on the STATUS tab) resolves the pawn's ACTUAL permanent wound and shows
        "left eye"; the race view stays side-agnostic ("eye").
  - [x] **Permanent scars are bulletproof + read as scars.** `Injury.permanent` already blocked healing,
        but the immutable `recomputeWound` (combat re-hit merge) rebuilt the wound and DROPPED the flag —
        a same-type hit to a scarred part could heal it off. It now carries `permanent` forward ("once a
        scar, always a scar"). The health tab renders a permanent wound as an "old <type> scar" (no warn,
        untreatable), distinct from an active injury. Guarded by a merge test + the 500-tick heal test.
  - [x] **`hunting_speed` stat removed.** Hunting IS combat (mark → chase → fight → carcass), so its
        effectiveness comes from the COMBAT stats, not a duplicate work-speed axis; `getWorkModifiers`
        falls back to a flat 1.0 for hunting. Adrenal dropped its (now-dead) hunting mod → `mental_res`.
  - [x] **Mundane trait descriptions scrubbed of anatomy.** A `stat`/`attribute`/`negative` trait's prose
        no longer names a specific body part (Frail's "thin-boned", Brawny's "muscle", Wan's "blood in
        their bones"…) — matching the §1 naming law, which forbids only body-touching kinds to reference
        anatomy. Applies to the flavor lines too.
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

- [x] All synced 2026-07-06: **ADR-028** in game/DECISIONS + registered in `codegraph.config.json`
      `adrRules` (`checkable: false`); RACE-SYSTEM (superseded-model note), game/DESIGN (trait model
      rewrite), ROADMAP (Trait system V2 row). Phase 2 docs re-sync when §7 lands.
