<!-- LOC cap: 300 (created: 2026-05-25) -->

# ARCHITECTURE [GAME]

> **Related:** [DESIGN](DESIGN.md) · [DECISIONS](DECISIONS.md) · [PHILOSOPHY](PHILOSOPHY.md) · [ui/ARCHITECTURE](../ui/ARCHITECTURE.md) · [ROADMAP](../.tasks/open/ROADMAP.md)

## Layer Map

Strict top-down dependency — lower layers never import from higher ones:

```
src/routes/ + src/lib/components/     ← Svelte UI (presentation only)
         ↓
src/lib/stores/                       ← Svelte writable stores, auto-persist to localStorage
         ↓
src/lib/game/systems/GameEngineImpl   ← Turn coordinator (calls services, no logic)
         ↓
src/lib/game/services/                ← Business logic singletons
         ↓
src/lib/game/core/                    ← Types, static databases, GameStateManager
```

## Services

Each service implements an interface and exports a singleton. Import the singleton, never instantiate the class.

| Singleton         | File                           | Responsibility                                    |
| ----------------- | ------------------------------ | ------------------------------------------------- |
| `pawnService`     | `services/PawnService.ts`      | Automatic needs, pawn state, ability calculations |
| `workService`     | `services/WorkService.ts`      | Work assignment, efficiency, sync                 |
| `buildingService` | `services/BuildingService.ts`  | Construction checks, building bonuses             |
| `itemService`     | `services/ItemService.ts`      | Crafting availability, item operations            |
| `researchService` | `services/ResearchService.ts`  | Research progression, unlock checks               |
| `locationService` | `services/LocationServices.ts` | Exploration missions, location data               |

## State Management

All game state lives in one `GameState` object. Mutation goes exclusively through `GameStateManager`:

```typescript
// ✅ only way to mutate state
gameStateManager.addResource('wood', 10);
gameStateManager.updatePawn(pawnId, { health: 80 });
gameStateManager.updateState({ turn: state.turn + 1 });
```

Persistence: `localStorage['fantasia4x-save']` — serialised by `src/lib/stores/gameState.ts`.

## Turn Order

`GameEngineImpl.processGameTurn()` must execute in this order — do not reorder:

1. **Needs** — hunger, fatigue, sleep decay (`pawnService.processAutomaticNeeds`)
2. **Work** — process assignments, accumulate progress (`workService.syncPawnWorkStates`)
3. **Completions** — finish buildings / crafting / research when progress ≥ cost
4. **Exploration** — resolve pending missions
5. **Events** — trigger random or conditional events

## Modifier System

All stat and efficiency calculations go through `ModifierSystem`. Every result exposes `sources[]`:

```typescript
const result = modifierSystem.calculateWorkEfficiency(pawn, workCategory);
// result.totalValue — final multiplier
// result.sources    — [{ description: 'Racial trait: Hardy', value: 0.1 }, ...]
```

Never compute flat bonus sums manually when a modifier system method exists.

## Static Data Files

| File                | Contents                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `core/types.ts`     | All interfaces: `GameState`, `Pawn`, `Building`, `Item`, `WorkCategory`… |
| `core/GameState.ts` | `GameStateManager` — the only mutation surface                           |
| `core/Items.ts`     | Item definitions (resources, equipment, consumables)                     |
| `core/Buildings.ts` | Building definitions and unlock conditions                               |
| `core/Research.ts`  | Research tree and unlock costs                                           |
| `core/Work.ts`      | Work category definitions                                                |
| `core/Race.ts`      | Race generation ranges and racial traits                                 |
| `core/Locations.ts` | Exploration zone definitions                                             |
| `core/Events.ts`    | Event type definitions                                                   |

## AI Generation (Server-Only)

Gemini API calls live exclusively in `src/routes/api/`. Client code calls the route; it never imports `@google/generative-ai` directly.

## Known Architectural Debt

- `Items.ts` and `Buildings.ts` historically mixed data with business logic; extraction to services is ongoing. New code must not add logic to data files.
- `WorkScreen.svelte`, `ExplorationScreen.svelte`, `CraftingScreen.svelte` remain oversized — see `.tasks/open/SCREEN-REFACTORING.md`.
