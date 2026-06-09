# COMBAT SYSTEM

> **Related:** [ROADMAP](ROADMAP.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started — no `combatService` (`systems/Combat.ts` is an empty stub) and pawns
take no combat damage yet. Blocked only on ENTITIES_SPAWNING Phase A (live
targets). Combat is a **self-contained physical foundation** — probability-based
hit chance against a detailed limb/organ body map, with bleeding, fractures, pain,
and knockdown. MAGIC-SKILLS is **not** a prerequisite; it layers on top later.

**Foundations already in place** (SURVIVAL-HEALTH + ENTITIES_SPAWNING):

- Pawn & Mob carry `limbs` (6-limb), `conditions`, `bloodVolume`, `isAlive`.
- `Item.weaponProperties` + `armorProperties` (resist, parry, bash, kick) exist.
- Hostile-mob FSM has a live `Attacking` state that holds position; a
  `pendingDamage` map already routes mob hunting damage to a random limb with
  bleed — reusable for pawn damage.

---

## Goal

RimWorld/Dwarf-Fortress-style automatic combat where pawns engage enemies without
player micromanagement. The foundation is purely physical: probability-based hit
chance resolved against a detailed body map of limbs and organs, with bleeding,
fractures, pain, and knockdown. No skill or magic system is required — a pawn with a body or equipment can fight.

Depth comes from Rimworld's body-part injury model: wounds compound across
fights. A pawn walking into their second encounter already bleeding is a tactical
problem. Injuries persist. A dead pawn is a material loss and a colony-wide mood
event.

Skills and spells (MAGIC-SKILLS) are flavour layered on top of this foundation
later — they slot into the optional skill bar below, but combat ships without them.

---

## Core Mechanics

### Automatic engagement (RimWorld model)

When a hostile enters a pawn's `aggroRange`, the pawn halts its current job and
auto-attacks at `attackSpeed` interval. Player can override target or issue a
Flee order at any time.

```typescript
attackCooldown = 1000 / attackSpeed; // ms; decrements each sim tick
attackSpeed = 1.0 + pawn.stats.dexterity / 100 + weaponMod;
aggroRange = 8 + floor(pawn.stats.perception / 20); // tiles
```

**Drafted mode**: player picks the target and issues move/attack/flee orders; the
pawn keeps auto-attacking. Skill queuing is added later by MAGIC-SKILLS.

### Skill bar (OPTIONAL — added later by MAGIC-SKILLS)

Combat resolves entirely through the auto-attacks and hit resolution above; the
skill bar is **not** part of this foundation. MAGIC-SKILLS later lets each pawn
equip up to 4 active skills (physical abilities and spells share the same slots
via a unified `Skill` interface defined there). Until that spec lands, pawns fight
with auto-attacks only — the foundation is fully playable without skills or magic.

### Damage types

Every strike carries one damage type, set by the weapon. Type decides bleed
behaviour and the base-damage profile — blunt trades open wounds for raw force.

| Type     | Bleed    | `bleedMod` | Profile                              | Example weapons       |
| -------- | -------- | ---------- | ------------------------------------ | --------------------- |
| cutting  | high     | 1.0        | moderate base; opens bleeding wounds | sword, axe, scimitar  |
| piercing | moderate | 0.5        | low base; +organ-penetration chance  | spear, dagger, arrow  |
| blunt    | none     | 0.0        | highest base; fractures + knockdown  | club, mace, warhammer |

Blunt does the most damage per hit but draws no blood; its threat is fractures,
pain, and knockdown (see Knockdown & stagger). Cutting bleeds hardest; piercing
sits between and is the most likely to reach internal organs.

### Hit resolution

A mob attack first rolls to-hit against the target's **dodge** (driven by Dex),
then rolls damage of the weapon's type onto a random body part.

```
dodge       = defender.dex × 2 + coverBonus
hitChance   = (attacker.dex × 3 + weapon.accuracy) − dodge       // clamped 5–95%
rawDamage   = weapon.baseDamage[type] × attacker.strength / 100 // str on 0–100 scale
finalDamage = rawDamage × (1 − targetPart.armorReduction)
targetPart.health = max(0, targetPart.health − finalDamage)
```

Positioning: flanking +15% hit; cover (wall/tree adjacent) −20% ranged hit;
3+ allies on same target +5% hit each (max +15%).

### Damage & bleed resolution

Each body part carries `maxHp` and a `bleedRatio` (its share of total body mass).
Open wounds (cutting / piercing) bleed in proportion to **how wrecked the part is**
and **how big the part is** — a half-destroyed hand bleeds far less than a
half-destroyed thigh.

```
// after finalDamage is applied to targetPart.health:
hpMissingFrac = (part.maxHp − part.health) / part.maxHp
bleedRate     = part.bleedRatio × BLEED_CONSTANT × type.bleedMod × hpMissingFrac
// blunt → bleedMod 0 → no open bleed; inflicts a fracture + pain instead
Injury { bodyPart, type, bleeding: bleedRate, painContribution, ... }
```

`bloodVolume` drains by Σ `bleedRate` of all open injuries each turn (scaled by
`dt` within a real-time combat tick). A wound clots when its `bleedRate` falls
below `CLOT_FLOOR` or a `herbal_kit` is applied. `BLEED_CONSTANT` is tuned so a
fully severed 5%-mass hand bleeds ≈2 blood/turn against a ~100-unit pool.

**Worked example** — a mob swings a sword (cutting, `baseDamage 14`) at a pawn:

1. To-hit beats the pawn's Dex dodge → lands on `leftHand` (`maxHp 30`).
2. `rawDamage = 14 × strength 107 / 100 ≈ 15` → hand.health `30 → 15` (half gone).
3. Cutting wound: `hpMissingFrac = (30 − 15) / 30 = 0.5`,
   `bleedRatio(hand) = 0.05` (hand ≈ 5% of body), `bleedMod = 1.0`.
   `bleedRate = 0.05 × BLEED_CONSTANT × 1.0 × 0.5` — exactly **half** the bleed a
   fully-severed 5%-mass part would cause.
4. The same swing with a **mace** (blunt) deals more raw damage but `bleedMod = 0`:
   no bleed; it rolls a fracture + knockdown instead.

### Knockdown & stagger

Blunt and crush hits roll for knockdown:
`knockChance = (damage − defender.constitution / 4) × bluntMod`. On success the
pawn is knocked prone for 1–3 turns (`knockdown` counter), loses its next attack,
and suffers −30% defence until it stands. Two-handed and charging attacks raise
`bluntMod`. A pawn already prone takes +20% incoming melee damage.

---

## Injury Model (RimWorld granularity + Stoneshard persistence)

Hits land on a randomised body part drawn from the weighted hit table.
Every pawn carries a full hierarchical body map — every finger, toe, and
internal organ is individually tracked. Organ failure and limb loss compound
across fights; a pawn who lost two fingers last battle grips their sword
differently this one.

### Body-part type system

```typescript
type BodyPartId =
  // ── Head region ──────────────────────────────────────────────────────────
  | 'skull'
  | 'jaw'
  | 'nose'
  | 'leftEye'
  | 'rightEye'
  | 'leftEar'
  | 'rightEar'
  // internal (only reachable via skull hit)
  | 'brain'
  // ── Torso ─────────────────────────────────────────────────────────────────
  | 'chest'
  | 'abdomen'
  // internal (only reachable via torso hit)
  | 'heart'
  | 'leftLung'
  | 'rightLung'
  | 'liver'
  | 'stomach'
  | 'leftKidney'
  | 'rightKidney'
  | 'spine'
  // ── Left arm ──────────────────────────────────────────────────────────────
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftForearm'
  | 'leftHand'
  | 'leftThumb'
  | 'leftIndexFinger'
  | 'leftMiddleFinger'
  | 'leftRingFinger'
  | 'leftLittleFinger'
  // ── Right arm ─────────────────────────────────────────────────────────────
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightForearm'
  | 'rightHand'
  | 'rightThumb'
  | 'rightIndexFinger'
  | 'rightMiddleFinger'
  | 'rightRingFinger'
  | 'rightLittleFinger'
  // ── Left leg ──────────────────────────────────────────────────────────────
  | 'leftHip'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'leftBigToe'
  | 'leftSecondToe'
  | 'leftMiddleToe'
  | 'leftFourthToe'
  | 'leftLittleToe'
  // ── Right leg ─────────────────────────────────────────────────────────────
  | 'rightHip'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'
  | 'rightBigToe'
  | 'rightSecondToe'
  | 'rightMiddleToe'
  | 'rightFourthToe'
  | 'rightLittleToe';

interface BodyPartDef {
  id: BodyPartId;
  parentLimb: LimbId; // one of the existing 6 roots; every fine part rolls up to it
  maxHp: number; // hit points before the part is destroyed (hand ≈ 30)
  bleedRatio: number; // share of total body mass (0–1); scales open-wound bleed
  hitWeight: number; // relative probability of being struck; 0 = internal only
  containedIn?: BodyPartId; // nested organs/bones hit via parent with penetration roll
  isPaired: boolean; // losing both = full loss of that function
  isVital: boolean; // destruction causes immediate collapse → bleedout
}

interface Injury {
  bodyPart: BodyPartId;
  type: 'cut' | 'blunt' | 'fracture' | 'puncture' | 'burn' | 'crush';
  severity: 'minor' | 'serious' | 'critical' | 'destroyed';
  bleeding: number; // blood/turn lost; clots below CLOT_FLOOR, or via herbal_kit
  painContribution: number; // adds to pawn.pain total
  infected: boolean; // set after 20+ turns untreated; doubles pain + bleeding
  treatedAt?: number; // turn number when a Healer applied care
}
```

**Conditions via `conditions.jsonc`:** combat-generated conditions (fracture,
infection, shock, organ failure) are defined in `src/lib/game/database/conditions.jsonc`
and applied through the existing condition system — not as bespoke fields on Pawn.
Each injury type maps to a condition entry with severity stages and modifiers
(e.g. `fracture` → `moveSpeed: 0.5`, `workEfficiency: 0.3`). The `blood_loss`
condition already ships; combat adds `fracture`, `infection`, `shock`, and
organ-specific entries.

**Root tier & progressive disclosure:** the tree is rooted at the existing 6
`LimbState` limbs. Fingers, toes, bones, and organs are children of a root limb
and stay hidden in the UI until injured — full depth without UI clutter.

### Hit weight table (abridged — outer parts only)

| Region    | Parts (weight)                                                                             |
| --------- | ------------------------------------------------------------------------------------------ |
| Head      | skull (8), jaw (4), nose (2), leftEye (1), rightEye (1), leftEar (1), rightEar (1)         |
| Torso     | chest (25), abdomen (20)                                                                   |
| Left arm  | leftShoulder (3), leftUpperArm (6), leftForearm (5), leftHand (3), fingers ×5 (1 each)     |
| Right arm | rightShoulder (3), rightUpperArm (6), rightForearm (5), rightHand (3), fingers ×5 (1 each) |
| Left leg  | leftHip (3), leftUpperLeg (8), leftLowerLeg (6), leftFoot (3), toes ×5 (0.5 each)          |
| Right leg | rightHip (3), rightUpperLeg (8), rightLowerLeg (6), rightFoot (3), toes ×5 (0.5 each)      |

**Internal organ penetration**: when a chest/abdomen/skull hit is `critical`,
roll separately against the organ hit table. Armour reduces the penetration
roll, not the initial hit.

| Skull crit → organ | Weight  |
| ------------------ | ------- |
| brain              | 60      |
| leftEye / rightEye | 20 each |

| Torso crit → organ       | Weight  |
| ------------------------ | ------- |
| heart                    | 15      |
| leftLung / rightLung     | 20 each |
| liver                    | 15      |
| stomach                  | 12      |
| leftKidney / rightKidney | 6 each  |
| spine                    | 6       |

### Pain thresholds

| Pain total | Effect                                                    |
| ---------- | --------------------------------------------------------- |
| > 30       | −10% accuracy                                             |
| > 55       | −25% accuracy, −1 movement speed                          |
| > 80       | Pawn collapses; must be carried or bleeds out in 30 turns |

Pain decays at `floor(constitution / 50)` per turn. Untreated infections halt
decay entirely.

### Body-part consequences

#### Head & sensory

| Part        | Condition | Effect                                                |
| ----------- | --------- | ----------------------------------------------------- |
| brain       | serious+  | 30% chance to attack wrong target; random job cancels |
| brain       | destroyed | Permadeath                                            |
| skull       | fracture  | +20 pain; −15% accuracy until treated                 |
| jaw         | destroyed | Cannot eat solid food (nutrition drain ×1.5)          |
| eye (one)   | destroyed | −20% ranged accuracy                                  |
| eyes (both) | destroyed | Cannot perform any work; cannot fight                 |
| ear (one)   | destroyed | No mechanical effect (cosmetic)                       |
| ears (both) | destroyed | −10 perception stat permanently                       |
| nose        | destroyed | Cosmetic; +5 mood debuff (self-image)                 |

#### Torso & organs

| Part           | Condition | Effect                                                  |
| -------------- | --------- | ------------------------------------------------------- |
| chest          | critical  | Immediate collapse regardless of pain total             |
| heart          | serious+  | Bleedout timer reduced to 10 turns; +40 pain            |
| heart          | destroyed | Permadeath within 3 turns (unsaveable)                  |
| leftLung       | destroyed | −30% movement speed; −20% work speed (paired)           |
| rightLung      | destroyed | −30% movement speed; −20% work speed (paired)           |
| lungs (both)   | destroyed | Suffocation → permadeath in 5 turns                     |
| liver          | destroyed | Infection immunity lost; all injuries infect in 5 turns |
| stomach        | destroyed | Cannot eat; nutrition falls 3×/turn                     |
| kidney (one)   | destroyed | No immediate effect (paired redundancy)                 |
| kidneys (both) | destroyed | Permadeath within 20 turns (toxin accumulation)         |
| spine          | serious+  | Paralysis below waist; cannot move or fight             |

#### Arms & hands

| Part             | Condition | Effect                                           |
| ---------------- | --------- | ------------------------------------------------ |
| shoulder         | fracture  | Arm unusable; cannot equip in that slot          |
| upperArm/forearm | fracture  | −30% attack speed; cannot use two-handed weapons |
| hand             | destroyed | Arm slot lost; permanent −30% work speed         |
| thumb            | destroyed | −15% attack speed (grip penalty)                 |
| index finger     | destroyed | −10% ranged accuracy (trigger finger)            |
| other fingers    | destroyed | −5% attack speed each                            |
| arm (whole)      | destroyed | Arm slot permanently lost; major mood event      |

#### Legs & feet

| Part              | Condition | Effect                                                |
| ----------------- | --------- | ----------------------------------------------------- |
| hip               | fracture  | Leg unusable; −3 movement speed                       |
| upperLeg/lowerLeg | fracture  | −2 movement speed per leg                             |
| foot              | destroyed | −1 movement speed; cannot equip footwear on that foot |
| bigToe            | destroyed | −0.5 movement speed (balance penalty)                 |
| other toes        | destroyed | Cosmetic only                                         |
| leg (whole)       | destroyed | Leg slot permanently lost; major mood event; −3 speed |

#### Universal

| Condition  | Effect                                                               |
| ---------- | -------------------------------------------------------------------- |
| HP = 0     | Permadeath — triggers colony-wide mood event (SOCIAL-LAYER)          |
| Bleedout   | Pawn incapacitated; allies have 30 turns to apply herbal_kit or dies |
| Near-death | Survivor buff: +5 toughness permanent; PTSD deferred to SOCIAL-LAYER |

PTSD (witnessing deaths, near-death experiences): deferred to SOCIAL-LAYER spec.

---

## Combat Resolution Flow

No separate screen in Phase 1 — combat is inline while jobs are paused.
Health bars on HUD tile overlay + event log messages provide feedback.

```
1. Enemy enters aggroRange → pawn pauses job, enters Combat mode
2. Auto-attack fires at attackSpeed interval
3. On hit: roll hitChance → damage → random body part → Injury → knockdown check
4. (Optional, post-MAGIC-SKILLS) equipped skills fire on cooldown or drafted queue
5. Pawn exits Combat mode when enemy dies, flees, or moves > aggroRange
6. Post-combat: apply injury mood modifiers, drop loot, resume queued job
```

---

## Implementation Plan

Markers: ✅ done · 🟡 partial / scaffolded · ⬜ not started.

### Phase A — Data layer (expand the body model, don't flatten it)

Treat the shipped 6-limb `LimbState[]` (head, torso, 4 limbs) as the **root tier**
of a hierarchical body tree — always present, always shown. Nesting is additive:
the existing bleed / `bloodVolume` / death loop is untouched; fine parts hang off
the roots.

- ✅ Extend `LimbState` with `parts?: BodyPartState[]` — the organs, bones, and
  sub-limbs contained in that root limb (fingers under hands, toes under feet…).
- ✅ `BodyPartState { id; health; maxHp; isMissing; injuries: Injury[] }` per fine
  part (`health` seeded from the def's `maxHp`, e.g. hand 30). Damage rolls down to
  the struck part; bleed (`bleedRatio` × type `bleedMod`) and status roll up to its root.
- ✅ Add `injuries`/`pain`/`attackCooldown`/`aggroRange`/`knockdown` to `Pawn`
  (no `skillBar` — deferred to MAGIC-SKILLS).
- ✅ Extend `Item.weaponProperties` with `damageType` (`'cutting'|'piercing'|'blunt'`),
  `baseDamage`, `accuracy`, `armorPenetration`, `bluntMod`; `grantedSkills` deferred to MAGIC-SKILLS.
- ✅ Add `fracture`, `infection`, `shock` to `conditions.jsonc` (alongside existing `blood_loss`).

### Phase B — CombatService

✅ New `combatService` singleton (`systems/Combat.ts`):

- `tickCombat(state, dtMs)` — finds mobs in `Attacking` state, fires every `ATTACK_INTERVAL_TICKS`, resolves hit against nearest adjacent pawn
- `resolveHit(attacker, defender, state)` → `HitResult` (bodyPart, damage, injury, knockdown)
- `applyInjury(pawnId, injury, state)` — updates `LimbState.parts[]`, aggregates `bleedRate` to root limb, upserts `blood_loss` condition, handles pain collapse + vital-part permadeath
- `triggerSkill(...)` — **deferred stub**; returns state unmodified until MAGIC-SKILLS wires it
- Body-part definitions exported as `PART_DEF_MAP` + `BodyPartDef` for Phase D UI and tests

### Phase C — GameEngine wiring

- ✅ `combatService.tickCombat()` called from `GameEngineImpl` after Entity Step
- ✅ Mob FSM `Attacking` (in `EntityService.stepHostile`) holds position; `combatService.tickCombat()` resolves all hits for mobs in `Attacking` state. The existing `pendingDamage` aggregation in `EntityService` handles mob-vs-mob hunting damage; `combatService` handles mob-vs-pawn combat damage.

### Phase D — HUD feedback (deepen the shipped limb/blood UI)

Limbs and blood are already rendered; this phase expands that depiction rather than
building it from scratch.

- ✅ PawnScreen health panel: 6 root limbs always visible, each expandable to reveal
  sub-parts (organs, bones, fingers). Auto-expanded when injured, collapsed when healthy.
  Healthy sub-parts dimmed (opacity 0.6). Pain total + prone state surfaced in status row.
  Vital organs marked with ★ after the name.
- ✅ EntityScreen reworked into RimWorld-style health table — one entity per row,
  columns for blood %, worst-limb status, pain, and FSM state. Row click expands full
  body tree with limb/sub-part detail.
- ✅ Health bars on mob/pawn map tiles in `GameCanvas.svelte` — reuses the existing
  `progressOverlays` / `worldEffects` overlay pipeline. Green bars for pawns, red for mobs.
- ⬜ Drafted-mode skill bar deferred to MAGIC-SKILLS.

---

## Open Questions

- [ ] Auto-retreat when pain exceeds 80? (yes, draft-overridable)
- [ ] Ranged attack range cap? (8 tiles base; Perception scales it)
- [ ] Squad assignment UI for drafted mode? (Phase 2)
