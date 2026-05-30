<!-- LOC cap: 400 (updated: 2026-05-29) -->

# SURVIVAL & HEALTH CONSEQUENCES

> **Related:** [ROADMAP](ROADMAP.md) · [game/DESIGN](../../game/DESIGN.md) · [LIVING-WORLD](LIVING-WORLD.md)

## Goal

Unmet needs carry real consequences: malnutrition slowly kills through staged
progression; exhaustion collapses pawns; injuries cause bleeding that threatens
death if untreated. The colony lives or dies on keeping pawns fed, rested, and in
one piece.

Design mirrors RimWorld Diseases Overhauled: conditions progress from trivial to
fatal via `severity` (0→1). Each named stage has its own modifiers. At
`lethalSeverity` the pawn dies — no separate "death timer" is needed; the rate of
severity increase at the fatal stage bounds time-to-death naturally.

Enables: healthcare jobs, medicine items, surgery (combat recovery), triage UI.

---

## Phase A — Data Model

### Replace `PawnState.health` with a condition + limb system

Remove `health: number` from `PawnState` (currently only used as a UI placeholder).

Add to `Pawn` (`src/lib/game/core/types.ts`):

```typescript
conditions: PawnCondition[];   // active progressive health conditions
limbs: LimbState[];            // 6 basic limbs; initialized at pawn creation
bloodVolume: number;           // 0–100. 0 = dead. Regenerates slowly from 100.
```

New shared types:

```typescript
export interface PawnCondition {
    id: string;        // matches ConditionDef.id in conditions.jsonc
    severity: number;  // 0.0–1.0; reaches lethalSeverity → pawn dies
}

export type LimbId = 'head' | 'torso' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

export const CRITICAL_LIMBS: LimbId[] = ['head', 'torso'];

export interface LimbState {
    id: LimbId;
    health: number;      // 0–100; 0 = destroyed (critical limb → death; other → lost limb)
    isMissing: boolean;  // true after amputation (combat/surgery — future)
    bleedRate: number;   // blood points drained per turn while >0; set by wounds
}
```

`GameState` addition:
```typescript
deadPawns: DeadPawnRecord[];

export interface DeadPawnRecord {
    name: string;
    cause: 'malnutrition' | 'blood_loss' | 'critical_limb' | 'combat' | 'exhaustion_cascade';
    turn: number;
    stats: { strength: number; dexterity: number; intelligence: number; };
}
```

### Default limb initialization

Every new pawn (via `PawnService.createPawn()`) starts with:
```typescript
limbs: [
    { id: 'head',      health: 100, isMissing: false, bleedRate: 0 },
    { id: 'torso',     health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_arm',  health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
    { id: 'left_leg',  health: 100, isMissing: false, bleedRate: 0 },
    { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 },
],
bloodVolume: 100,
conditions: [],
```

---

## Phase B — Conditions Database (`src/lib/game/database/conditions.jsonc`)

New database file. A `ConditionDef` is a multi-stage progressive health condition.
Its current active stage modifiers are applied by `ModifierSystem` alongside regular
status effect modifiers.

```typescript
// src/lib/game/core/types.ts — new types
export interface ConditionStage {
    label: string;
    minSeverity: number;
    color: string;
    lifeThreatening?: boolean;
    modifiers: {
        workEfficiency?: number;   // multiplier on work output
        moveSpeed?: number;        // multiplier on movement
        hungerRate?: number;       // multiplier on hunger accrual rate
        fatigueRate?: number;      // multiplier on fatigue accrual rate
    };
}

export interface ConditionDef {
    id: string;
    name: string;
    description: string;
    lethalSeverity: number;
    stages: ConditionStage[];
}
```

### Malnutrition condition definition

```jsonc
{
    "id": "malnutrition",
    "name": "Malnutrition",
    "description": "A diet deficiency causing progressive physical deterioration. Reduces work capacity and ultimately leads to death if unchecked.",
    "lethalSeverity": 1.0,
    "stages": [
        { "label": "trivial",  "minSeverity": 0.00, "color": "#f57c00",
          "modifiers": { "workEfficiency": 0.95 } },
        { "label": "minor",    "minSeverity": 0.20, "color": "#ef6c00",
          "modifiers": { "workEfficiency": 0.85, "hungerRate": 1.1 } },
        { "label": "moderate", "minSeverity": 0.35, "color": "#e65100",
          "modifiers": { "workEfficiency": 0.70, "hungerRate": 1.2 } },
        { "label": "serious",  "minSeverity": 0.50, "color": "#bf360c",
          "modifiers": { "workEfficiency": 0.55, "hungerRate": 1.3 } },
        { "label": "severe",   "minSeverity": 0.65, "color": "#b71c1c",
          "lifeThreatening": true,
          "modifiers": { "workEfficiency": 0.40, "hungerRate": 1.4 } },
        { "label": "extreme",  "minSeverity": 0.80, "color": "#c62828",
          "lifeThreatening": true,
          "modifiers": { "workEfficiency": 0.20, "hungerRate": 1.5 } },
        { "label": "fatal",    "minSeverity": 0.95, "color": "#ff1744",
          "lifeThreatening": true,
          "modifiers": { "workEfficiency": 0.0 } }
    ]
}
```

Note: malnutrition *increases* the hunger rate as it progresses — a body
shutting down metabolises inefficiently, creating a vicious cycle. This mirrors
the RimWorld Diseases Overhauled definition.

### Blood loss condition definition

```jsonc
{
    "id": "blood_loss",
    "name": "Blood Loss",
    "description": "Insufficient blood volume impairs consciousness and movement. Extreme blood loss leads to death.",
    "lethalSeverity": 1.0,
    "stages": [
        { "label": "initial",  "minSeverity": 0.00, "color": "#c62828", "modifiers": {} },
        { "label": "minor",    "minSeverity": 0.15, "color": "#b71c1c",
          "modifiers": { "moveSpeed": 0.95 } },
        { "label": "moderate", "minSeverity": 0.30, "color": "#d50000",
          "modifiers": { "moveSpeed": 0.80, "workEfficiency": 0.90 } },
        { "label": "major",    "minSeverity": 0.45, "color": "#d50000",
          "modifiers": { "moveSpeed": 0.60, "workEfficiency": 0.75 } },
        { "label": "serious",  "minSeverity": 0.60, "color": "#ff1744",
          "lifeThreatening": true,
          "modifiers": { "moveSpeed": 0.40, "workEfficiency": 0.50 } },
        { "label": "extreme",  "minSeverity": 0.75, "color": "#ff1744",
          "lifeThreatening": true,
          "modifiers": { "moveSpeed": 0.0, "workEfficiency": 0.0 } },
        { "label": "fatal",    "minSeverity": 0.90, "color": "#ff1744",
          "lifeThreatening": true,
          "modifiers": {} }
    ]
}
```

---

## Phase C — Malnutrition Progression (in `PawnStateMachine.ts`)

Conditions are ticked every turn. Malnutrition severity changes based on hunger:

```typescript
// Constants
const MALNUTRITION_ONSET_HUNGER   = 87;   // CRITICAL_HUNGER — condition starts here
const MALNUTRITION_SAFE_HUNGER    = 40;   // below this, condition recovers
const MALNUTRITION_RATE_CRITICAL  = 0.0008; // +/turn at hunger 87–99  → lethal in ~1250t ≈ 4.2 days
const MALNUTRITION_RATE_MAX       = 0.002;  // +/turn at hunger 100    → lethal in ~500t ≈ 1.7 days
const MALNUTRITION_RECOVERY_RATE  = 0.0003; // −/turn when hunger < 40 → fully clears in ~11 days
```

Tick logic:
```
if hunger >= 100:
    increase malnutrition severity by MALNUTRITION_RATE_MAX
elif hunger >= MALNUTRITION_ONSET_HUNGER:
    increase malnutrition severity by MALNUTRITION_RATE_CRITICAL
elif hunger < MALNUTRITION_SAFE_HUNGER and condition exists:
    decrease severity by MALNUTRITION_RECOVERY_RATE
    if severity <= 0: remove condition from pawn.conditions

if condition.severity >= conditionDef.lethalSeverity: → killPawn('malnutrition')
```

When `hunger` first crosses `MALNUTRITION_ONSET_HUNGER` and no malnutrition condition
exists yet: add `{ id: 'malnutrition', severity: 0 }` to `pawn.conditions`.

---

## Phase D — Blood Loss Progression (in `PawnStateMachine.ts`)

**Bleeding source:** `limb.bleedRate > 0` (populated by combat wounds in a future phase;
for now no limbs bleed unless set programmatically for testing).

Per-turn tick:
```typescript
const totalBleedRate = pawn.limbs.reduce((sum, l) => sum + l.bleedRate, 0);
if (totalBleedRate > 0) {
    pawn.bloodVolume -= totalBleedRate;
}

// Blood loss condition severity = 1 - (bloodVolume / 100)
const bloodSeverity = 1 - (pawn.bloodVolume / 100);
// sync blood_loss condition severity same way as malnutrition

// Blood regenerates slowly when not bleeding and volume < 100
if (totalBleedRate === 0 && pawn.bloodVolume < 100) {
    pawn.bloodVolume = Math.min(100, pawn.bloodVolume + BLOOD_REGEN_PER_TURN);
}
if (pawn.bloodVolume <= 0): → killPawn('blood_loss')
```

```typescript
const BLOOD_REGEN_PER_TURN = 0.05;  // 0→100 in 2000 turns ≈ 6.7 days without bleeding
```

**Limb destruction** (future combat, but modelled now):
- If `limb.health <= 0` and `limb.id ∈ CRITICAL_LIMBS`: → `killPawn('critical_limb')`
- If `limb.health <= 0` and not critical: set `limb.isMissing = true`, apply functional penalty
  (missing arm: `workEfficiency *= 0.6`; missing leg: `moveSpeed *= 0.4`)

---

## Phase E — Exhaustion Collapse

**Trigger:** `fatigue >= 100`.

**Collapse behaviour:**
- Force `currentState = PAWN_STATE.SLEEPING`; pawn sleeps on the ground
- No job claimable until `fatigue < FATIGUE_THRESHOLD`
- If already at malnutrition `severe` or higher when collapsing: add `exhaustion_cascade` death
  cause if the pawn subsequently dies within 300 turns of the collapse

No direct HP damage from exhaustion — loss of productive turns is the consequence.

---

## Phase F — Condition Recovery

Malnutrition severity decreases at `MALNUTRITION_RECOVERY_RATE` when `hunger < 40`.
Blood regenerates at `BLOOD_REGEN_PER_TURN` when no active bleeding.
Limb health does not regenerate without medicine (future healthcare job).

---

## Phase G — Death

**Triggers:** (a) any condition reaches `lethalSeverity`, (b) critical limb destroyed,
(c) `bloodVolume <= 0`.

In `PawnStateMachine.ts` `killPawn(cause)` helper (called by all three paths):
1. Set `pawn.isAlive = false`
2. Append `DeadPawnRecord` to `gameState.deadPawns`
3. Clear `pawn.activeJob`, set `pawn.currentState = 'Dead'`
4. Fire `eventStore` entry: `"[Name] has died of [cause]."`
5. All surviving pawns `mood -= 5` (applied through existing need tick)

Dead pawns stay in `gameState.pawns` with `isAlive = false`; all processing guards
skip them. Colony history UI can display the `deadPawns` list.

---

## Phase H — ModifierSystem Integration

`ModifierSystem.getPawnModifiers(pawn)` must aggregate from:
1. Existing `status-effects.jsonc` active effects (eating, sleeping, tired, hungry)
2. **New**: active `ConditionDef` stage modifiers from each `pawn.conditions` entry
3. **New**: missing limb functional penalties

Each modifier source must include a `sources[]` entry (existing contract):
```typescript
sources: [{ label: 'Malnutrition (moderate)', value: -0.30, type: 'multiplier' }]
```

---

## Phase I — UI

### PawnNeeds.svelte
- Each active condition appears as a card in the effects row, labelled with the current
  stage name (e.g. "Malnutrition — Moderate")
- Card color matches the stage `color` field from conditions.jsonc
- `lifeThreatening: true` stages get a pulsing red border (CSS animation)

### Limb panel (`PawnOverview.svelte` or new `PawnHealth.svelte`)
- 6-limb silhouette: each limb colored by health (green→yellow→red→grey for missing)
- Blood volume shown as a small bar; only visible when `bloodVolume < 90`

### Colony overview (`GameControls.svelte`)
- Pawn list: red `[!]` indicator when any condition is `lifeThreatening`
- Dead pawn count: `†N` suffix in the top bar

---

## Acceptance Criteria

1. A pawn kept at `hunger = 100` for ~500 consecutive turns dies of malnutrition; logged.
2. A pawn re-fed after `malnutrition.severity = 0.6` eventually recovers to severity 0.
3. Malnutrition `hungerRate` modifiers compound — a severely malnourished pawn gets hungry faster.
4. A pawn with `fatigue >= 100` collapses to forced sleep immediately.
5. `bloodVolume` drains correctly from `limb.bleedRate`; `blood_loss` severity tracks `1 - vol/100`.
6. Critical limb (head/torso) at `health = 0` triggers immediate death.
7. All condition ticking lives in `PawnStateMachine.ts`; zero health logic in stores or components.
8. `ModifierSystem` sources array includes condition stage contributions.
9. New `conditions.jsonc` is the single source of truth for stage thresholds and modifiers.
