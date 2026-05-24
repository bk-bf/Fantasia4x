---
description: "Use when writing or modifying game systems, services, entities, or core data in src/lib/game/. Covers service singleton pattern, state mutation, modifier system usage, and turn processing."
applyTo: "src/lib/game/**/*.ts"
---

# Game Systems Conventions

## Service Pattern

All services implement an interface and export a singleton:

```typescript
export interface FooService { ... }
export class FooServiceImpl implements FooService { ... }
export const fooService = new FooServiceImpl(); // ← always export singleton
```

Import the singleton (`fooService`), never instantiate the class directly.

## State Mutation

Never access or assign to `GameState` fields directly. Always go through `GameStateManager`:

```typescript
import { gameStateManager } from '$lib/game/core/GameState';

// ✅ correct
gameStateManager.addResource('wood', 10);
gameStateManager.updatePawn(pawnId, { health: 80 });
gameStateManager.updateState({ turn: state.turn + 1 });

// ❌ wrong
state.resources.wood += 10;
pawn.health = 80;
```

## Modifier System

All stat calculations must go through `ModifierSystem`. Every result exposes `sources[]` so the UI can explain bonuses:

```typescript
import { modifierSystem } from '$lib/game/systems/ModifierSystem';

const result = modifierSystem.calculateWorkEfficiency(pawn, workCategory);
// result.totalValue — final multiplier
// result.sources    — [{ description: 'Racial trait: Hardy', value: 0.1 }, ...]
```

Do not compute flat sums manually when a modifier system method exists.

## Turn Processing Order

`GameEngineImpl.processGameTurn()` must preserve this order:

1. **Needs** — hunger, fatigue, sleep decay
2. **Work** — process assignments, accumulate progress
3. **Completions** — finish buildings / crafting / research when progress ≥ cost
4. **Exploration** — resolve pending missions
5. **Events** — trigger random or conditional events

Adding a new phase? Insert it at the correct position and update this file.

## Adding New Core Data (Items, Buildings, Research, Work)

- Static definitions live in `src/lib/game/core/` (Items.ts, Buildings.ts, Research.ts, Work.ts).
- Every definition needs a stable string `id` — use `kebab-case`.
- Unlock conditions reference `researchId` strings from `Research.ts`.
- Costs use the same resource `id` strings defined in `types.ts`.

## AI Generation (server-only)

Never import `@google/generative-ai` outside `src/routes/api/`. Client code calls the API route:

```typescript
// ✅ client-side — call the route
const res = await fetch('/api/generate-character', { method: 'POST', ... });

// ❌ never in client code
import { GoogleGenerativeAI } from '@google/generative-ai';
```
