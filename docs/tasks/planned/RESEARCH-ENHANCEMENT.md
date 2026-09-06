<!-- LOC cap: 150 (created: 2026-05-25) -->

# RESEARCH-ENHANCEMENT

> **Related:** [ROADMAP](ROADMAP.md) · [game/DESIGN](../../game/DESIGN.md)

## Goal

Replace the current flat research system with a three-tier system that makes progression feel logical and race-specific.

## Three-Tier Framework

| Tier           | Unlock Mechanism                                                   | Example                                    |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| 1 — Knowledge  | Scholar work generates knowledge-items; techs unlock at thresholds | Basic Metallurgy at 100 knowledge          |
| 2 — Lore Items | Exploration discoveries; bypass knowledge prerequisites            | "Ancient Forge Manual" → Master Metallurgy |
| 3 — Stat-Gated | Race average stat ranges open unique paths                         | Avg Str < 8 → Mechanical Advantage tree    |

## Requirements

### Tier 1 — Knowledge Accumulation

- Scholars generate knowledge-items proportional to their Intelligence stat
- Research buildings apply bonus multipliers via existing `buildingService` pattern
- Basic technologies unlock automatically when knowledge threshold is reached
- Knowledge generation scales with number of assigned scholars

### Tier 2 — Lore Item Discovery

- Exploration yields lore items based on location type and rarity table
- Each lore item maps to one or more technologies it unlocks immediately
- Lore-unlocked techs bypass knowledge prerequisites for that specific tech only
- Conflicting lore items (racially incompatible) are handled with alternative adaptations

### Tier 3 — Stat-Gated Specialisation

- On race generation, stat ranges are evaluated to determine available specialisation trees
- Low-stat trees compensate for weaknesses (e.g. low Str → leverage engineering)
- High-stat trees amplify strengths (e.g. high Int → parallel research slots)
- Extreme stat combinations unlock unique cross-domain trees

## Open Design Questions

- [ ] How does knowledge persist across turns — per-turn increment or bank system?
- [ ] Can a player lose lore items (e.g. burned in a raid)?
- [ ] Do stat-gated trees become unavailable if stats change via equipment/traits?

## Status

Requirements defined. Design doc pending. No implementation started.
