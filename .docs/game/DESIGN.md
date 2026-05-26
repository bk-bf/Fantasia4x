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
