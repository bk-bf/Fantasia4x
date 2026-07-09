<!-- Single source of truth for the trait system. Merged 2026-07-08 from TRAIT-SYSTEM-V2 (taxonomy,
     ADR-028), RACIAL-TRAITS-OVERHAUL (condition-backed model, ADR-023), and TRAIT-LIBRARY-EXPANSION
     (the ~300-trait library, implemented 2026-07-07). Those three docs are deleted; this replaces them. -->

# TRAITS — the trait system, single source of truth

> **Related:** [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-023 · ADR-028 · ADR-029) · [ROADMAP](ROADMAP.md) · [RACE-SYSTEM](RACE-SYSTEM.md) · [LINEAGES (done)](../archive/LINEAGES-2026-07-09.md) · [LINEAGES-II](LINEAGES-II.md) (heritage flatten + transforms)

## §0 · Traits are pure granters

**A trait GRANTS things; it never carries the granted thing's stats, procs, or effects itself.**
The granted object is defined in its own database file and is the single source of truth for
everything it does. A trait that circumvents this (stamping a proc or a resistance directly)
invalidates the data-driven flow — the same weapon would behave differently depending on which trait
granted it, and effects double-apply.

| `kind` | The trait declares | The granted object carries the effects | Defined in |
| --- | --- | --- | --- |
| `stat` | `effects: {strengthBonus…}` — flat core-stat deltas ONLY, baked at pawn-gen | *(exception: stat traits ARE the direct channel for core stats)* | `traits.jsonc` |
| `attribute` | `effects: {workSpeed/workYield/workQuality, combatMods, nightVision, healRate}` — derived-stat multipliers ONLY | *(exception: attribute traits ARE the direct channel for derived stats)* — **never a resistance** (§0a), never a core-stat rider | `traits.jsonc` → applied by `PawnStatService` |
| `bodyMod` | `bodyMods: [{target, hpMult?, weightKg?}]` + `grafts: [{limb, parts}]` | a grafted limb is a REAL limb — its parts, HP, weapons-mounting, and armor share come from the part defs | `limbmap.jsonc` |
| `naturalGear` | `naturalWeapons: [itemId]` · `naturalArmor`/`armorMods` · `blocksSlots` · `carryPenalty` · `stage`/`evolvesTo` | the WEAPON item carries damage/type/reach/crit/**onHitCondition** — the only proc source; armor magnitude distributes over the limbmap `armor` shares | `items.jsonc` (weapons) · `limbmap.jsonc` (armor shape) |
| `passive` | `selfCondition` · `aura: {condition, radius, affects}` · `triggeredCondition` | the CONDITION def carries every modifier, resistance, trigger edge, and `activateWhen` gate | `conditions.jsonc` |
| `wound` | `wounds: [{part, severity, type?}]` | the wound type's bleed/pain/heal behaviour comes from the wound def; §0b for permanency | `wounds.jsonc` |

**Forbidden on any trait:** `onHitCondition` (procs live on the weapon item / condition),
`weaponBonus`, resistance keys in `effects`, and any stat/effect rider on a granter kind
(`bodyMod`/`naturalGear`/`passive`/`wound`). One primary `kind` per trait; a legendary bundle
composes several via `subCapabilities` (each sub-cap obeys its own kind's contract).

### §0a · Open decision 1 — where natural-armor resistances live

A covering's cold/fire/physical resistance currently sits in the TRAIT's `effects` (violation).
A limbmap armor part is a single scalar (`armor: 0.4`) with no typed resistance slots, so the
granted object has nowhere to carry them yet. Options:

- [ ] (a) add typed resistance fields to limbmap armor/part defs (fur part carries `coldResistance`)
- [ ] (b) route covering resistances through a granted **condition** (`passive`-style, conditions.jsonc carries them)
- [ ] (c) something else — owner decides

### §0b · Open decision 2 — wound permanency routing

`wounds.jsonc` has no `permanent` field; permanency is hardcoded in the applier
(`applyTraitWounds` stamps `permanent: true`, damage fractions in `SPAWN_WOUND_DAMAGE_FRAC` in
`Pawns.ts`). A wound TYPE can't be inherently permanent (a `cut` is transient in combat, permanent
as an old scar), so permanency must ride the graft:

- [ ] (a) `permanent?: boolean` (+ optional damage fraction) on the trait's `wounds[]` spec, propagated into the stamped wound — recommended
- [ ] (b) distinct "scar" wound entries in `wounds.jsonc`
- [ ] owner decides, then migrate `applyTraitWounds` accordingly

### §0c · Migration ledger (violations found 2026-07-08 · §0a/§0b closed 2026-07-09)

Owner decisions: §0a resistances → a dedicated `resistances` block on the trait (NOT `effects`); §0b
permanency → distinct `*_scar` wound entries + an organic close-time scar roll (`canScar`).

- [x] **Venom double-proc** — `mild-venom`/`venomous`/`arachnid-venom`/`deathly-venom` carried a trait
      `onHitCondition` duplicating the fang weapon's proc. Removed; the weapon item is the single source.
- [x] **`flame-touched` proc dropped** — no weapon behind it; the "blows land alight" clause left the
      description too. `onHitCondition` deleted from the `Trait` type + the trait-proc loop in
      `Combat.applyOnHitEffect`. Banned by `traitRegistry` (§0 forbidden-fields test).
- [x] **`weaponBonus` folded** → `combatMods.melee_damage` (Combat's `weaponBonusDamage` now reads it);
      field deleted from the `Trait` type + banned by `traitRegistry`.
- [x] **All resistances → the `resistances` block** (30 traits: coverings, affinities, heritages) —
      read by `PawnStatService.traitResistanceBonus`; `effects.*Resistance` banned by `traitRegistry`.
      (Covering resistances stay physically on the trait per §0a decision (a), not on a condition.)
- [x] **`many-eyed` → the Spider Eyes line** — grafts arachnid eyes whose `grants` (limbmap) carry the
      nightVision (live, self-gating on eye loss) + perception (baked at gen); 3 evolving stages. No
      `effects` rider. New "part grants an effect" mechanism ([BodyParts.ts] `grants`).
- [x] **`nocturnal`/`regenerative` → `attribute` kind** (the legal home for nightVision/healRate).
- [ ] **Remaining derived/stat riders** (nightVision/healRate/work/core-stat on the OLD heritage banners +
      subcaps) → folded into the **[LINEAGES-II §4](LINEAGES-II.md) old-heritage flatten**: subcaps become
      top-level lineage traits with proper kinds; stat baselines become guaranteed `stat` traits. (The
      NEW lineages already conform — `beast-eyed` is now the attribute Beast-Eyes line, `gill-frills` is
      the amphibian gateway.) The "no rider on a granter kind" ban lands then, with the naturalGear-claw
      exception (claws keep their work effects, owner decision).
- Note: the **claw work/DEX effects** (`rending`/`ripping`/`crushing`/`burrowing`) are INTENTIONAL — the
      owner chose to keep a hand-replacement's manipulation effects on the gear trait; not a violation.

## §1 · Taxonomy rules (ADR-028)

- **Strict kind separation** — `stat` and `attribute` never mix; a granter kind carries no effects.
  Enforced by `traitRegistry.test.ts`.
- **Naming law** — a `stat`/`attribute` trait's name must be mundane + generic; only body-touching
  kinds (`bodyMod`/`naturalGear`/`passive`/`wound`) may name anatomy (claw/fang/hide/eye/joint…).
  Enforced by `ANATOMY_NAME_RE`. Descriptions and flavor lines follow the same rule for abstract kinds.
- **Scope** — `racial` (physiology, drawn from the race pool) vs `personal` (temperament, any pawn).
- **Physique gates** — `requires: {minWeightKg/maxHeightCm/minBuild…}` blocks contradictory draws
  (Gaunt never lands on a 250 kg mass).
- **Reserved kinds (Phase 2, TODO):** `behavioral`, `needs` (blood/heat meters), `transformation`
  (werewolf/mermaid trigger sets).

## §2 · Rarity budget & selection

Rarity (`rarities.jsonc` scale + `mythic` between epic and legendary) is a BUDGET on breadth:

| Rarity | Budget |
| --- | --- |
| `negative` | pure-downside FLAW — drawn as a Gaussian **count** (σ=1.25, clamp 0–4: most pawns 0–1, a 4-flaw wretch ~1/170), never race identity |
| common / uncommon | 1–2 attribute categories, trade-offs allowed |
| rare | ≤1 attribute category **or** 1 capability |
| epic | ≤2 categories or capability + proc |
| mythic / legendary | bundles (`subCapabilities`, each rolled per pawn) |

Selection: each race rolls identity (one cumulative rarity roll, rarest first: legendary 1.5% ·
mythic 1.5% · epic 3% · rare 9%) + a small mundane pool; each pawn draws ≤2 racial + ≤3 personal
at spawn. Core-stat ladders: ±1/±3/±5 = common/uncommon/rare; two-stat swings climb to epic;
all-stats +1/+3/+5 = epic/mythic/legendary (the dark mirror rides the `Blighted` heritage banner).

## §3 · Natural gear model (ADR-029)

- Gear fields live ON the trait (`naturalWeapons`/`naturalArmor`/`armorMods`), NOT behind
  `selfCondition` (that older routing is dead — a `selfCondition` now always means a dynamic/passive
  condition).
- **Weapons** are anatomy-gated for free: the item id must appear in a surviving limbmap part's
  `weapons` list (lose the jaw → lose the bite; both hands gone → thrash fallback). The ITEM is the
  single source for damage, type, reach, crit, and its `onHitCondition` proc.
- **Armor** is per-part: the plan's `armor` shares set the shape, the trait's magnitude sets the
  strength; `mode` stack/replace vs worn gear; `carryPenalty` (fraction of carry capacity, clamped
  so a bare pawn is never encumbered) is the cost.
- **Staging** — 3-stage lines linked by `stage: 1|2|3` + `evolvesTo` chains (claws, fangs, horns,
  tusks, venom, breath, talons, beaks; hide/fur/chitin/feather armor lines). Stage weapons are
  separate items so each stage's numbers live on its item.
- **Utility gear** — natural apparatus with a slot cost and a benefit instead of defense (wings →
  moveSpeed + back slot; spinnerets → web shot; gill frills…), losable with the host part.
- **Grafts (§bodyMod)** — a trait may graft limbs/parts from the global `PART_DEF_MAP` (wings, beak,
  tail) onto the humanoid tree; a grafted limb is hittable, losable, and hosts the line's weapon.
  Pawns compose bodies à la carte — there is no whole-plan "-kin" swap.

## §4 · Passive model

- `selfCondition` — a permanent or `activateWhen`-gated condition; the condition def carries ALL
  modifiers/resistances (this is the legitimate home for affinity resistances, per §0a).
- `aura: {condition, radius, affects, lingerSeconds}` — throttled (~3 s cadence) radius stamp with a
  linger tail; heritage-gated, one mutual-exclusion group (≤1 aura per pawn), finite radius always.
- `triggeredCondition` — meter-edge one-shots (pain → berserk).
- Trigger-conditioned traits (wet/cold/hot/dark/pain/bloodloss…) are pure data: the condition graph's
  `activateWhen`/`triggers` predicates (conditions.jsonc) do the work.

## §5 · Wound traits

Real permanent injuries stamped at generation (`applyTraitWounds`): scars ≤10% of the limb's maxHP
by severity, destroyed = lost part; paired parts flip sides per pawn; vital/critical parts refused
(never lethal at spawn). Scars are uncareable (`isUncareable`) — they don't trigger Rest, caretakers
ignore them, and `recomputeWound` carries `permanent` forward. Elemental variants via wound `type`
(cut/burn/frostbite/crush) read as "old ⟨type⟩ scar". §0b will move the permanency flag into data.

## §6 · Library status (implemented 2026-07-07)

~300 traits, ~65 conditions, ~19 natural-weapon items shipped in one pass (`traitExpansion.test.ts`):

- §1-style attribute combos: 2➕/2➖ per work type (18 work types), 5 combat combos on the
  `combatMods` channel (Lethality/Footwork/Ferocity/Quickdraw/Longshot), field-medicine, low-light.
- Core-stat ladders (±1/3/5 × 6 stats), trade-off pairs, two-stat swings, all-stat grand pulls.
- Staged natural-gear lines (§3) + à-la-carte grafts + utility gear.
- 11 heritage trees (Stoneblood, Echoborn, Sporeborn, Crustacean, Arachnid, Stormborn, Shadeborn,
  Colossus, Wildblooded, Farseer, Blighted) — banner + per-pawn sub-capability roll; shared lines
  (Adrenaline) cross trees; creatures can carry S1 variants (`CreatureDefinition.traits`).
- Scar/lost-limb flaw layer (§5) with elemental variants.
- Aura + trigger-conditioned traits (§4).
- Bleed-as-wound (`Injury.bloodletting`, clot-proof until dressed; the old condition retired).
- `Feasted` shared blood-feast buff (0.5 h, non-refreshing).

**Deferred:**

- [ ] `evolutionTrigger {minAgeYears}` + ritual gate — waits on the age system; walks `stage N → N+1`
      by swapping a trait for its `evolvesTo` (the player pursues a lineage; crossroads = spec moment).
- [ ] Breath `reach 3` → a proper AoE cone.
- [ ] Reserved hooks: diet flags (decomposer/carrion-fed), `sleepless`, `beast-speech`, silk
      `produces` (needs organ-aware butchery).
- [ ] Phase 2 kinds: `behavioral` / `needs` / `transformation`.
