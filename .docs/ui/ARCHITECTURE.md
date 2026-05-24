<!-- LOC cap: 200 (created: 2026-05-25) -->

# ARCHITECTURE [UI]

> **Related:** [DESIGN](DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [ROADMAP](../.tasks/open/ROADMAP.md)

## Component Tree

```
src/routes/+page.svelte         ← root, screen router driven by uiState store
└── src/lib/components/
    ├── UI/
    │   ├── MainScreen.svelte       root layout shell
    │   ├── ResourceSidebar.svelte  persistent resource display
    │   ├── GameControls.svelte     turn controls and speed
    │   ├── ActivityLogOverlay.svelte
    │   ├── ASCIIMap.svelte
    │   ├── CurrentTask.svelte      progress indicator widget
    │   ├── TaskContainer.svelte    wraps CurrentTask items
    │   └── CancelButton.svelte
    ├── screens/
    │   ├── PawnScreen.svelte       ← refactored into pawn/ sub-components ✅
    │   ├── WorkScreen.svelte       1314 lines — needs refactoring ⚠️
    │   ├── CraftingScreen.svelte   950 lines — needs refactoring ⚠️
    │   ├── ExplorationScreen.svelte 974 lines — needs refactoring ⚠️
    │   ├── BuildingMenu.svelte
    │   ├── ResearchScreen.svelte
    │   └── RaceScreen.svelte
    └── pawn/                       ← PawnScreen sub-components
        ├── PawnSelector.svelte
        ├── PawnOverview.svelte
        ├── PawnStats.svelte
        ├── PawnNeeds.svelte
        ├── PawnTraits.svelte
        ├── PawnAbilities.svelte
        └── PawnEquipment.svelte
```

## Screen Navigation

Screens are switched via the `uiState` store — not SvelteKit router navigation:

```typescript
import { uiState } from '$lib/stores/uiState';
uiState.setScreen('pawn'); // 'building' | 'research' | 'work' | 'crafting' | 'exploration'
```

## Stores

| Store        | File                   | Purpose                                                     |
| ------------ | ---------------------- | ----------------------------------------------------------- |
| `gameState`  | `stores/gameState.ts`  | Main game state + auto-turn loop + localStorage persistence |
| `uiState`    | `stores/uiState.ts`    | Active screen and UI navigation state                       |
| `eventStore` | `stores/eventStore.ts` | Event queue shown to the player                             |
| `log`        | `stores/Log.ts`        | Activity log messages                                       |
| `worldState` | `stores/worldState.ts` | Map and world data                                          |

## Component Rules

- **200 line limit** per component. Extract sub-components when exceeded.
- **Single responsibility**: one concern per component.
- Components do not call services or `GameEngineImpl` directly — route through store actions.
- Read reactive state with `$store` prefix in templates; do not read `localStorage` directly.

## Svelte 5 Runes

Use runes syntax throughout — do not use the legacy `$:` reactive syntax:

```svelte
let count = $state(0);
let doubled = $derived(count * 2);
$effect(() => { ... });
```
