# Fantasia4x — Project Guidelines

## Overview

Turn-based civilization management sim. Players generate a race, manage individual pawns (characters), assign work, construct buildings, craft items, and research technologies. Built with SvelteKit 5 + TypeScript.

## Architecture

Strict layered architecture — do not skip layers:

```
Svelte Components (src/lib/components/, src/routes/)
    ↓
Svelte Stores (src/lib/stores/)        ← reactive, auto-saves to localStorage
    ↓
GameEngineImpl (src/lib/game/systems/GameEngineImpl.ts)   ← turn coordinator
    ↓
Services (src/lib/game/services/)      ← business logic singletons
    ↓
Core data (src/lib/game/core/)         ← types, static databases, state manager
```

## Key Conventions

**Services are singletons**: Every service follows `export const fooService = new FooServiceImpl()` at the bottom of its file. Import the singleton, not the class.

**Immutable state**: Never mutate `GameState` directly. Use `GameStateManager` methods (`addResource`, `updatePawn`, `updateState`, etc.) from `src/lib/game/core/GameState.ts`.

**Modifier system**: All stat/efficiency calculations go through `ModifierSystem` in `src/lib/game/systems/ModifierSystem.ts`. Every modifier result includes a `sources[]` array explaining the origin of each bonus.

**Turn order** (do not reorder): needs → work processing → building/crafting/research completion → exploration → events.

**AI generation is server-only**: Gemini API calls live exclusively in `src/routes/api/`. Never import `@google/generative-ai` in client-side code.

**Persistence key**: `localStorage['fantasia4x-save']` — the store in `src/lib/stores/gameState.ts` handles serialization.

## Build & Check

```bash
npm run dev        # dev server
npm run build      # production build
npm run check      # TypeScript + Svelte type check
npm run lint       # ESLint
npm run format     # Prettier
```

## Project Layout Quick Reference

| Path | Contains |
|------|----------|
| `src/lib/game/core/types.ts` | All core interfaces (GameState, Pawn, Building, Item…) |
| `src/lib/game/core/GameState.ts` | GameStateManager — the only way to mutate state |
| `src/lib/game/services/` | One service per domain (Item, Building, Work, Research, Pawn, Location) |
| `src/lib/game/systems/GameEngineImpl.ts` | processGameTurn() — main game loop |
| `src/lib/game/systems/ModifierSystem.ts` | All bonus/penalty calculations |
| `src/lib/stores/gameState.ts` | Svelte writable store + auto-turn logic |
| `src/lib/stores/uiState.ts` | Screen navigation state |
| `src/routes/api/` | Server-side Gemini AI endpoints |
