<!-- LOC cap: 250 (created: 2026-05-25) -->

# DESIGN [GAME]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DECISIONS](DECISIONS.md) · [PHILOSOPHY](PHILOSOPHY.md) · [ROADMAP](../.tasks/open/ROADMAP.md) · [PRODUCTION-CHAINS](../.tasks/open/PRODUCTION-CHAINS.md)

## Core Gameplay Loop

```
Generate race (stat ranges + racial traits)
    ↓
Forage/scavenge primitives (no tools: twigs, flint shards, plant fiber)
    ↓
Craft Tier 0 tools (Flint Knife, Stone Chopper) at ground knapping surface
    ↓
Fell trees / quarry stone (tool-gated) → build workshop buildings
    ↓
Assign work → harvest resources → construct buildings → craft items → research techs
    ↓
Manage pawn needs (hunger / fatigue / sleep) — pawns auto-path to food/rest; unmet needs cause death
    ↓
Explore locations → discover loot, lore items, events
    ↓
Repeat per turn (auto-turn supported)
```

## Production Chain Philosophy

Fantasia4x targets **peak production chain complexity** — the design reference is RimWorld: HardCore SK, not vanilla RimWorld or Dwarf Fortress. Every step in the economic ladder requires completing the previous one; there is no "free" resource shortcut.

**Core principles:**
- **Tool-gated gathering**: woodcutting requires at least a Stone Axe; mining requires a Stone Pick; hunting requires a Stone Spear. Without the tool, the job cannot be claimed — the forest stays whole.
- **Bootstrapping chain**: the starting colony has *nothing*. Survival begins with hand-gathered primitives (twigs, surface flint, plant fiber, wild berries). These enable Tier 0 tools. Tier 0 tools enable woodcutting. Wood enables workshop buildings. Workshops enable Tier 1 tools and processed materials.
- **No free lunches**: building costs use real crafted materials. A `lean_to` shelter costs `pine_wood`, which requires the axe, which requires the knapping stone, which requires finding surface flint. Every shortcut eliminated is a failure state to navigate.
- **Workshop chaining**: every non-trivial crafted item requires a specific workshop (`workshopType` on `Item`). Advanced materials require mid-tier workshops. Advanced workshops require mid-tier materials. The chain is deliberate.
- **Needs create urgency**: hunger and fatigue are not background timers. When a pawn is hungry they stop working and path to food. If food doesn't exist, they starve. This creates pressure to maintain food supply at every tier of the tech tree.

See ADR-009 in [DECISIONS](DECISIONS.md) for the locked-in enforcement rules.

## Race Generation

- Each stat gets a base range (8–15) with 30% chance of specialisation per stat (+2/+3 or -2 penalty)
- 2–4 racial traits chosen from 25+ options; conflict prevention enforced (e.g. Flame Touched ≠ Frost Born)
- Physical traits (size, height, weight) rolled within race ranges
- Cultural flavour generated for lore (food customs, combat practices, diplomatic methods)

**Race archetypes that emerge naturally:**
- Specialist: extreme stat ranges, strong in one domain
- Balanced: consistent 10–13 across all stats
- Trait-driven: average stats, powerful racial passives
- Adaptive: moderate stats, flexible trait combinations

## Pawn System

Each pawn tracks:
- **Stats**: strength, dexterity, intelligence, wisdom, charisma, constitution (rolled from race ranges)
- **Needs**: hunger, fatigue, sleep (decay each turn; auto-satisfied when resources/buildings allow)
- **State**: mood, health, current activity flags
- **Equipment**: weapon, armor, tool, accessory (durability affects bonus magnitude)
- **Skills**: learned work bonuses
- **50+ abilities** calculated from stats + traits + equipment via `ModifierSystem`

Pawn lifecycle: spawn → work assignment → needs decay → auto-eat/sleep → repeat.

### Need Priority System

Pawns manage hunger and fatigue via a **dynamic proximity + urgency formula**, not flat thresholds. This means a pawn's decision to interrupt work for food considers three things simultaneously:

**1. Urgency** — how far past the trigger threshold the need has climbed (quadratic curve):
```
urgency = (need − threshold)² / (100 − threshold)²
```
Low urgency = only detour if food is very close. High urgency = accept a large detour. At 100% = always seek food.

**2. Proximity** — distance to nearest food source vs distance to current job:
```
maxDetour = max(distToJob, 5) × (1 + urgency × 14)
eat if distToFood ≤ maxDetour
```
A pawn 2 tiles from a campfire will eat even at 71% hunger. A pawn 40 tiles from food needs ~87% hunger before it's worth the trip.

**3. Work priority + queue lookahead** — two threshold adjustments modify when the formula kicks in:
- **Labor level 4** (critical work): effective threshold shifts to ~78 — pawn resists interruption longer.
- **Labor level 1** (low priority): threshold shifts to ~66 — pawn is quicker to seek food.
- **Job queue pressure**: if the pawn's next 4 soft-queued jobs are all far from food, the threshold drops by up to 5 pts — the system nudges the pawn to eat before it runs out of opportunity.

The pawn's `jobQueue` field (up to 4 upcoming job IDs) is populated whenever the pawn picks work from Idle. The queue is a *soft preview* — jobs are not claimed, and the queue becomes stale if another pawn grabs a job. The need formula degrades gracefully when queue entries are missing.

Both `Working` and `MovingToResource` re-evaluate the formula every turn so mid-journey need changes are caught immediately. Fatigue/sleep uses the same formula with distance to the nearest shelter.

**Key thresholds (calibrated to 1 day = 300 turns):**

| Constant                         | Value       | Meaning                                                  |
| -------------------------------- | ----------- | -------------------------------------------------------- |
| `HUNGER_THRESHOLD`               | 70          | Need formula activates from Idle / Working               |
| `FATIGUE_THRESHOLD`              | 72          | Same for fatigue                                         |
| `NEED_DETOUR_MAX_FACTOR`         | 15          | At 100% hunger, willing to detour up to 15× job distance |
| `WORK_PRIORITY_THRESHOLD_SHIFT`  | 4 pts/level | Per labor level shift on effective threshold             |
| `QUEUE_FOOD_THRESHOLD_REDUCTION` | 5 pts       | Max threshold drop when no queue job is near food        |

See ADR-010 in [DECISIONS](DECISIONS.md) for the full design rationale and numeric examples.

## Work System

Work categories define: primary stat, secondary stat, base efficiency, required buildings. Building bonuses stack multiplicatively through `buildingService.calculateBuildingWorkBonus()`. Multiple buildings of the same type provide cumulative bonuses.

## Research System (Three-Tier, Planned)

See `.tasks/open/RESEARCH-ENHANCEMENT.md` for full spec.

| Tier           | Unlock Mechanism                                                           |
| -------------- | -------------------------------------------------------------------------- |
| 1 — Knowledge  | Accumulated automatically by scholar work; unlocks at knowledge thresholds |
| 2 — Lore Items | Exploration rewards; bypass knowledge prerequisites for specific techs     |
| 3 — Stat-Gated | Race's average stat ranges unlock unique specialisation paths              |

## Combat System (Planned)

Battle Brothers–inspired tactical combat with ASCII/text graphics.

**Key mechanics:**
- Turn order by initiative: `Base + Equipment mod + Status mod + 1d20`
- Action Point system: `AP = 6 + (Speed/20) + Equipment mods`; standard actions cost 1–5 AP
- Positioning and formation matter (flanking, cover bonuses)
- Equipment-driven abilities — abilities tied to equipped items, not flat stat tables
- Permadeath consequences: injuries and PTSD affect the colony workforce
- Scale: 20–50 combat-capable pawns; squad-based hierarchy for large battles

**Design constraints:**
- Must integrate with existing item system for equipment-driven abilities
- Must use `ModifierSystem` for all stat calculations
- Injuries feed back into pawn needs system (health decay)
