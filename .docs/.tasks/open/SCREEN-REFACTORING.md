<!-- LOC cap: 200 (created: 2026-05-25, revised: 2026-05-28) -->

# SCREEN-REFACTORING

> **Related:** [ROADMAP](ROADMAP.md) · [ui/ARCHITECTURE](../../ui/ARCHITECTURE.md)

## Scope (revised 2026-05-28)

**WorkScreen only.** ExplorationScreen and CraftingScreen are deprioritised:
`ExplorationScreen` will be substantially reworked as part of the FOG-OF-WAR system
(the current abstract mission list will be replaced by map interaction). `CraftingScreen`
will gain a Workshop panel when production chains land. Neither is worth refactoring now.

## Goal

Break down `WorkScreen.svelte` (1314 LOC) into focused sub-components so that
healthcare and cooking jobs can be added without editing unrelated sections.

## Requirements

- Each extracted component under 200 lines with single responsibility
- Use existing services (`WorkService`, `LocationService`, `ItemService`) for all data and calculations
- Extract shared formatting logic to `src/lib/utils/` not inline in components
- No change to user-facing behaviour — all existing functionality preserved

## WorkScreen sub-components

- [ ] `PopulationOverview` — worker cards with stats and current job indicators
- [ ] `WorkPriorities` — per-pawn priority management with efficiency display; uses `WorkService`
- [ ] `JobQueue` — job cycling visualisation with timer and active job highlighting
- [ ] `ProductionManagement` — location-based production targets and worker assignments; uses `LocationService`
- [ ] Update `WorkScreen` — import sub-components, keep only navigation and top-level state

## Acceptance Criteria

1. Each component is under 200 lines
2. `WorkScreen` enables adding healthcare and cooking jobs without editing other sections
3. All service calls go through `WorkService`, `LocationService`, or `ItemService` — no direct state access
4. Utility functions shared across components are extracted to `src/lib/utils/`
