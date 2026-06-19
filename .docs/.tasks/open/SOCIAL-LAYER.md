<!-- LOC cap: 260 (created: 2026-06-03) -->

# PAWN SOCIAL LAYER & MOOD DEPTH

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) · [RACE-SYSTEM](RACE-SYSTEM.md) · [PRODUCTION-CHAIN-III](PRODUCTION-CHAIN-III.md) (§F armour / royalty outfits) · [PRODUCTION-CHAIN-II](PRODUCTION-CHAIN-II.md) (§M magic regalia) · [game/DESIGN](../../game/DESIGN.md) · [LIVING-WORLD](LIVING-WORLD.md)

## Status

Not started. Should follow combat system — social layer lands harder once there
are things for pawns to react to (injury, death, threat, victory).

---

## Goal

Transform pawns from productivity units into individuals the player cares about.
Relationships, opinions, and social events create emergent stories without
requiring scripted narrative. Draws from the Celestia Phase 6 social design,
adapted to Fantasia4x's colony-sim context.

---

## Relationship System

Every pair of pawns has a relationship score: –100 (bitter enemies) to +100
(close friends). Scores change through proximity, shared events, and work
interactions.

```typescript
interface PawnRelationship {
  pawnA: string;
  pawnB: string;
  score: number; // –100 → +100
  tags: RelationTag[]; // 'friend' | 'rival' | 'mentor' | 'grief_bond' | 'romantic'
}
```

`relationships: PawnRelationship[]` added to `GameState`.

> **Seam already in place (ADR-023, Race overhaul).** `GameState.raceRelations` holds a procedural
> symmetric disposition (`allied`…`hostile`, score −100…+100) for every pair of pool races, and
> pawns carry `raceId`. When this layer lands, **seed each `PawnRelationship.score` with the racial
> baseline** of the two pawns' races (so members of mutually `wary`/`hostile` races start disliking
> each other) before the proximity/event deltas accumulate. No mood wiring exists yet — that's this
> spec's job.

### Score deltas (per turn or per event)

| Trigger                                          | Delta           |
| ------------------------------------------------ | --------------- |
| Working adjacent (same tile cluster)             | +0.05/turn      |
| Sharing a meal at the same campfire              | +1              |
| One pawn saved the other in combat               | +15             |
| One pawn failed a job that hurt the other        | –8              |
| Witnessing ally death together                   | +5 (grief bond) |
| Pawn A caused injury to Pawn B                   | –20             |
| Personality trait clash (e.g. Stoic + Whimsical) | –0.02/turn      |
| Personality trait match                          | +0.02/turn      |

---

## Mood Depth

Current mood is a single scalar. This spec adds **mood sources** — a list of
active modifiers with decay timers — so the player can see why a pawn is
unhappy.

```typescript
interface MoodModifier {
  id: string;
  label: string; // shown in UI: "Lost a friend in battle"
  value: number; // mood delta (positive or negative)
  expiresAt: number; // turn number; 0 = permanent until resolved
}
```

`moodModifiers: MoodModifier[]` added to `Pawn`.

Final mood = base 50 + sum of all active modifier values, clamped 0–100.

### Mood event catalogue (Phase 1)

| Event                               | Mood delta | Duration (turns)    |
| ----------------------------------- | ---------- | ------------------- |
| Ate a hot meal                      | +8         | 300 (1 day)         |
| Slept in a bed (vs ground)          | +5         | 300                 |
| Friend died in combat               | –25        | 3000 (10 days)      |
| Pawn injured in combat              | –10        | 600                 |
| Witnessed ally victory              | +12        | 300                 |
| Working with a friend (score > 60)  | +3         | refreshed each turn |
| Working near a rival (score < –40)  | –5         | refreshed each turn |
| Idle for 3+ days                    | –8         | active while idle   |
| Trait: Outdoorsy + worked outside   | +5         | 300                 |
| Trait: Contemplative + worked alone | +6         | 300                 |

Mood below 20 triggers a **break** (pawn refuses all work for 2–10 turns, DF-style mental break).
Mood at 0 for 5 consecutive turns triggers a **crisis** (pawn hostile, may flee map).

---

## Pawn Traits (Social)

Traits from Celestia's trait design adapted for Fantasia4x.
Traits are assigned at pawn generation (2–3 per pawn from the social pool).

| Trait         | Effect                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| Stoic         | –30% mood impact from negative events; –10% from positive                 |
| Empathetic    | Nearby distressed pawns get +3 mood/turn from this pawn's presence        |
| Contemplative | +10% research work efficiency when alone; –5 mood near 3+ pawns           |
| Berserker     | +15% melee damage below 50% HP; mood +10 after a kill                     |
| Night Owl     | +10% work efficiency between dusk–dawn (ambientLight < 0.4)               |
| Outdoorsy     | +5 mood when working on outdoor tiles; –5 mood after 50 turns indoors     |
| Devoted       | Relationship score gains ×1.5 with friends; –15 mood if close friend dies |
| Methodical    | –10% XP gain; skill bonuses are 25% stronger once earned                  |
| Fearless      | Immune to panic in combat; –10% dodge (reduced caution)                   |

---

## Social Events (turn-driven)

`SocialService.processSocialTurn(state)` fires once per in-game day:

1. Decay all mood modifiers by 1 turn of expiry
2. Recalculate relationship deltas from proximity + events
3. Check for social events (probability-based):
   - **Argument** (score –20 to –40, 2 pawns worked adjacent): –10 relationship each
   - **Bonding** (score 40 to 60, 200 shared working turns): promote to `friend` tag, +15 relationship
   - **Mentorship** (skill gap > 20 in same work category, 500 working turns adjacent): `mentor` tag; mentee +5% XP rate
4. Trigger mood modifiers for triggered events
5. Check break/crisis thresholds; update pawn state

---

## Implementation Plan

### Phase A — Data layer

- Add `relationships: PawnRelationship[]` to `GameState`
- Add `moodModifiers: MoodModifier[]`, `traits: string[]` to `Pawn`
- Add `core/Traits.ts` — trait definitions (id, name, description, effects)

### Phase B — SocialService

New `socialService` singleton:

- `processSocialTurn(state)` — daily relationship + mood processing
- `addMoodModifier(pawnId, modifier, state)`
- `getEffectiveMood(pawn)` — sum of modifiers + base
- `checkBreakThreshold(pawn)` → `MentalBreakEvent | null`

### Phase C — GameEngine wiring

`SocialService.processSocialTurn` inserted at end of Events phase (once/day, not every tick).

### Phase D — UI

- Mood modifier list in PawnScreen (tooltip: "why is mood this value")
- Relationship badges on pawn cards: 💚 friend / ⚔️ rival / 🤝 mentor
- Mental break indicator in pawn state label

---

## Prestige & Regalia (equipment-driven status)

> Added 2026-06-20. Drives the "impressive gear" axis [PRODUCTION-CHAIN-III §F](PRODUCTION-CHAIN-III.md)
> hooks into. Prestige is a **social/mood** property, so it lives here, not in the production spec.

Every equippable item gains a **`prestige`** value (how impressive it makes the wearer look). A pawn's
total prestige = sum of worn-item prestige (× quality / Famed / material). Prestige is the deliberate
**counterpart to the encumbrance trade-off**: heavy combat plate protects but rarely impresses; a
**royal/leader outfit** impresses but barely protects — the *same* fork shape as the helmet-vs-magic-
diadem choice already shipped in [PRODUCTION-CHAIN-II §M](PRODUCTION-CHAIN-II.md) (a buff crown costs
your helmet slot).

### What prestige does (mood/social effects)

| Effect | Detail |
| ------ | ------ |
| **Wearer mood** | a well-appointed pawn gets a small standing mood modifier ("finely equipped"); a ragged one a penalty — feeds the mood-modifier list above |
| **Leadership / social weight** | high-prestige pawns get a bonus in social events (argument/bonding/mentorship rolls) and, later, as colony **leader/diplomat** (trade, faction parley) |
| **Race/faction reaction** | prestige reads into [RACE-SYSTEM](RACE-SYSTEM.md) disposition — a bedecked envoy fares better with `wary` races |

### Royalty / leader outfits

A line of **prestige-first equipment** (crown-cloak, ceremonial plate, regal robes, circlet-of-office)
that occupies armour slots but trades defence/encumbrance for **high `prestige`**. Some royal pieces
double as the §M magic-regalia slots (a `sovereign_crown` is *both* a buff crown and a prestige piece) —
so dressing a leader is a real loadout choice, not free stat-stacking. Items defined in
[PRODUCTION-CHAIN-III §F](PRODUCTION-CHAIN-III.md); their **effect** (mood + social) resolves here.

### Implementation hook

- [ ] `prestige` field on `Item.armorProperties` (set in PRODUCTION-CHAIN-III item data).
- [ ] `SocialService.getPrestige(pawn)` — sum worn prestige × quality/Famed/material multiplier.
- [ ] Standing mood modifier from prestige band (ragged → finely-equipped); feed the mood-modifier list.
- [ ] Prestige term in social-event rolls + (later) leader/diplomat selection and faction reaction.

---

## Open Questions

- [ ] Romantic relationships? (Celestia had this; deferred to Phase 2)
- [ ] Prestige: flat per-item field vs derived (material + quality + enchants)? (capture both; lean flat field tuned by data)
- [ ] Social manipulation / charisma checks in events? (Phase 2)
- [ ] Do traits conflict with each other? (yes — generation prevents Stoic + Empathetic)
