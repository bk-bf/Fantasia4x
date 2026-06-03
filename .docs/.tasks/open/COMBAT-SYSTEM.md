<!-- LOC cap: 300 (created: 2026-06-03) -->

# COMBAT SYSTEM

> **Related:** [ROADMAP](ROADMAP.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. Blocked on ENTITIES_SPAWNING Phase A (live targets) and
MAGIC-SKILLS (skill framework — combat is built on top of it, not alongside it).

---

## Goal

RimWorld-style automatic combat where pawns engage enemies without player
micromanagement, governed by the MAGIC-SKILLS skill framework. Physical abilities
and spells share one `Skill` interface — there is no separate combat tree.
Depth comes from Stoneshard's body-part injury model: bleeding, fractures, and
pain accumulation mean wounds compound across fights. A pawn walking into their
second encounter already bleeding is a tactical problem.

Injuries persist. A dead pawn is a material loss and a colony-wide mood event.

---

## Core Mechanics

### Automatic engagement (RimWorld model)

When a hostile enters a pawn's `aggroRange`, the pawn halts its current job and
auto-attacks at `attackSpeed` interval. Player can override target or issue a
Flee order at any time.

```typescript
attackCooldown = 1000 / attackSpeed    // ms; decrements each sim tick
attackSpeed    = 1.0 + pawn.stats.dexterity / 100 + weaponMod
aggroRange     = 8 + floor(pawn.stats.perception / 20)  // tiles
```

**Drafted mode**: player picks target and queues skills manually; pawn continues
auto-attacking between skill triggers.

### Skill bar (governed by MAGIC-SKILLS)

Each pawn equips up to 4 active skills from the MAGIC-SKILLS skill tree.
Physical abilities (Power Strike, Shield Bash) and spells (Firebolt, Ice Lance)
occupy the same slots. `manaCost` is 0 for physical skills.

```typescript
interface Skill {
  id: string;
  cooldown: number;         // turns before skill can fire again
  manaCost: number;         // 0 for physical
  range: number;            // tiles; 0 = melee
  targetType: 'single' | 'aoe' | 'self';
  statScaling: Partial<Record<StatName, number>>;
  effect: SkillEffect;
}
```

Skills fire automatically when cooldown reaches 0 during combat, or the player
queues them in drafted mode.

### Hit resolution

```
hitChance   = (attacker.dex × 3 + weaponAccuracy) − (defender.dex × 2 + coverBonus)
damage      = roll(weapon.damMin, weapon.damMax) + floor(attacker.str / 5)
finalDamage = damage × (1 − targetPart.armorReduction)
```

Positioning: flanking +15% hit; cover (wall/tree adjacent) −20% ranged hit;
3+ allies on same target +5% hit each (max +15%).

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
  | 'skull' | 'jaw' | 'nose'
  | 'leftEye'  | 'rightEye'
  | 'leftEar'  | 'rightEar'
  // internal (only reachable via skull hit)
  | 'brain'
  // ── Torso ─────────────────────────────────────────────────────────────────
  | 'chest' | 'abdomen'
  // internal (only reachable via torso hit)
  | 'heart' | 'leftLung' | 'rightLung'
  | 'liver' | 'stomach' | 'leftKidney' | 'rightKidney'
  | 'spine'
  // ── Left arm ──────────────────────────────────────────────────────────────
  | 'leftShoulder' | 'leftUpperArm' | 'leftForearm' | 'leftHand'
  | 'leftThumb' | 'leftIndexFinger' | 'leftMiddleFinger' | 'leftRingFinger' | 'leftLittleFinger'
  // ── Right arm ─────────────────────────────────────────────────────────────
  | 'rightShoulder' | 'rightUpperArm' | 'rightForearm' | 'rightHand'
  | 'rightThumb' | 'rightIndexFinger' | 'rightMiddleFinger' | 'rightRingFinger' | 'rightLittleFinger'
  // ── Left leg ──────────────────────────────────────────────────────────────
  | 'leftHip' | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'leftBigToe' | 'leftSecondToe' | 'leftMiddleToe' | 'leftFourthToe' | 'leftLittleToe'
  // ── Right leg ─────────────────────────────────────────────────────────────
  | 'rightHip' | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot'
  | 'rightBigToe' | 'rightSecondToe' | 'rightMiddleToe' | 'rightFourthToe' | 'rightLittleToe';

interface BodyPartDef {
  id: BodyPartId;
  hitWeight: number;          // relative probability of being struck; 0 = internal only
  containedIn?: BodyPartId;   // internal organs are hit via parent with penetration roll
  isPaired: boolean;          // losing both = full loss of that function
  isVital: boolean;           // destruction causes immediate collapse → bleedout
}

interface Injury {
  bodyPart: BodyPartId;
  type: 'cut' | 'blunt' | 'fracture' | 'puncture' | 'burn' | 'crush';
  severity: 'minor' | 'serious' | 'critical' | 'destroyed';
  bleeding: number;           // HP/turn lost; clots below 2 naturally, or via herbal_kit
  painContribution: number;   // adds to pawn.pain total
  infected: boolean;          // set after 20+ turns untreated; doubles pain + bleeding
  treatedAt?: number;         // turn number when a Healer applied care
}
```

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
3. On hit: roll hitChance → damage → random body part → generate Injury
4. Skills fire on cooldown (auto) or player queues them (drafted)
5. Pawn exits Combat mode when enemy dies, flees, or moves > aggroRange
6. Post-combat: apply injury mood modifiers, drop loot, resume queued job
```

---

## Implementation Plan

### Phase A — Data layer

- Add `injuries: Injury[]`, `pain: number`, `attackCooldown: number`, `aggroRange: number`, `skillBar: string[]` to `Pawn`
- Add `core/Skills.ts` (shared with MAGIC-SKILLS — same file, unified interface)
- Extend `Item` with `weaponStats`, `grantedSkills: string[]`

### Phase B — CombatService

New `combatService` singleton:
- `tickCombat(state, dtMs)` — advances all active combats each simulation tick
- `resolveHit(attacker, defender, state)` → `HitResult` (body part, damage, injury)
- `triggerSkill(pawnId, skillId, targetId, state)` — auto or player-queued
- `applyInjury(pawnId, injury, state)` — mutates via `GameStateManager`

### Phase C — GameEngine wiring

- `combatService.tickCombat()` called from `GameEngineImpl` after Entity Step
- Mob FSM `Attacking` state delegates to `combatService` rather than resolving itself

### Phase D — HUD feedback

- Health bars on mob and pawn tiles in `GameCanvas.svelte`
- Pain / injury badge on pawn cards (PawnScreen)
- Drafted mode skill bar (Phase 2 UI)

---

## Open Questions

- [ ] Auto-retreat when pain exceeds 80? (yes, draft-overridable)
- [ ] Friendly fire on AoE spells? (yes — positioning matters)
- [ ] Ranged attack range cap? (8 tiles base; Perception scales it)
- [ ] Squad assignment UI for drafted mode? (Phase 2)
