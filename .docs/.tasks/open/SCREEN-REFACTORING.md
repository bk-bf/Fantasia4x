<!-- LOC cap: 200 (created: 2026-05-25) -->

# SCREEN-REFACTORING

> **Related:** [ROADMAP](ROADMAP.md) · [ui/ARCHITECTURE](../../ui/ARCHITECTURE.md)

## Goal

Break down three bloated screen components into focused sub-components following the pattern established by PawnScreen refactoring.

| Screen                     | Current LOC | Target                 |
| -------------------------- | ----------- | ---------------------- |
| `WorkScreen.svelte`        | 1314        | <200 per sub-component |
| `ExplorationScreen.svelte` | 974         | <200 per sub-component |
| `CraftingScreen.svelte`    | 950         | <200 per sub-component |

## Requirements

- Each extracted component under 200 lines with single responsibility
- Use existing services (`WorkService`, `LocationService`, `ItemService`) for all data and calculations
- Extract shared formatting logic to `src/lib/utils/` not inline in components
- No change to user-facing behaviour — all existing functionality preserved

## Phase 1 — WorkScreen (Priority: blocks healthcare/cooking jobs)

- [ ] `PopulationOverview` — worker cards with stats and current job indicators
- [ ] `WorkPriorities` — per-pawn priority management with efficiency display; uses `WorkService`
- [ ] `JobQueue` — job cycling visualisation with timer and active job highlighting
- [ ] `ProductionManagement` — location-based production targets and worker assignments; uses `LocationService`
- [ ] Update `WorkScreen` — import sub-components, keep only navigation and top-level state

## Phase 2 — ExplorationScreen

- [ ] `DiscoveredLocations` — known locations with resource info; uses `LocationService`
- [ ] `ActiveMissions` — expeditions in progress with cancel/recall; uses `CurrentTask` widget
- [ ] `AvailableExplorations` — available opportunities with requirements and success chance
- [ ] Update `ExplorationScreen` — import sub-components, keep only navigation and top-level state

## Phase 3 — CraftingScreen

- [ ] `CraftingFilters` — item type and category filtering with counts
- [ ] `CraftingInventory` — current inventory display
- [ ] `CraftingQueue` — active crafting jobs with progress
- [ ] `AvailableRecipes` — craftable items with requirements; uses `ItemService`
- [ ] Update `CraftingScreen` — import sub-components, keep only navigation and top-level state

## Acceptance Criteria

1. Each component is under 200 lines
2. `WorkScreen` enables adding healthcare and cooking jobs without editing other sections
3. All service calls go through `WorkService`, `LocationService`, or `ItemService` — no direct state access
4. Utility functions shared across components are extracted to `src/lib/utils/`
