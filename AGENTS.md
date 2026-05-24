# AGENTS.md — Fantasia4x

## Project Overview

Turn-based civilization management sim. Players generate a race, manage pawns (characters), assign work, construct buildings, craft items, and research technologies. Built with SvelteKit 5 + TypeScript.

## Architecture

Strict layered architecture — do not skip layers:

```
Svelte Components (src/lib/components/, src/routes/)
    ↓
Svelte Stores (src/lib/stores/)        ← reactive, auto-saves to localStorage
    ↓
GameEngineImpl (src/lib/game/systems/GameEngineImpl.ts)   ← turn coordinator only
    ↓
Services (src/lib/game/services/)      ← business logic singletons
    ↓
Core data (src/lib/game/core/)         ← types, static databases, GameStateManager
```

## Key Rules

**Service singletons**: import `fooService`, never instantiate `FooServiceImpl` directly.

**State immutability**: never assign to `GameState` fields. Use `GameStateManager` methods only (`addResource`, `updatePawn`, `updateState`…).

**Modifier system**: all stat/efficiency calculations go through `ModifierSystem`. Every result includes `sources[]`.

**Turn order** (do not reorder): needs → work → completions → exploration → events.

**AI is server-only**: `@google/generative-ai` lives exclusively in `src/routes/api/`. Client code calls the route via `fetch`.

**Data files are definitions only**: `src/lib/game/core/` contains static arrays/objects. Logic belongs in services.

**Component size**: 200 line limit per component. Extract sub-components when exceeded.

**Svelte 5 runes**: use `$state`, `$derived`, `$effect` — not legacy `$:` syntax.

## Build Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run check      # TypeScript + Svelte type check
npm run lint       # ESLint
```

## Documentation

Full architecture, design decisions, philosophy, and task tracking live in `.docs/`.

| Path | Scope |
| ---- | ----- |
| `.docs/game/ARCHITECTURE.md` | Layer map, service boundaries, turn order, data flow |
| `.docs/game/DESIGN.md` | Core gameplay loop, race/pawn mechanics, combat system design |
| `.docs/game/DECISIONS.md` | ADRs — add one when a non-obvious design choice is locked in |
| `.docs/game/PHILOSOPHY.md` | Guiding development principles; edit only if a principle genuinely changes |
| `.docs/ui/ARCHITECTURE.md` | Component breakdown, screen structure, store usage patterns |
| `.docs/ui/DESIGN.md` | Visual direction, retro terminal style, colour and typography rules |
| `.docs/.tasks/open/ROADMAP.md` | Planned work; keep entries actionable and brief |
| `.docs/.tasks/open/SCREEN-REFACTORING.md` | Break down WorkScreen, ExplorationScreen, CraftingScreen |
| `.docs/.tasks/open/RESEARCH-ENHANCEMENT.md` | Three-tier research system design and requirements |
| `.docs/.tasks/archive/` | Completed specs, filename pattern: `FEATURE-YYYY-MM-DD.md` |

## When to Update

- **ARCHITECTURE**: a new service, layer, or data flow is added or removed.
- **DECISIONS**: a non-obvious design choice is made that future contributors would otherwise re-litigate.
- **DESIGN**: a gameplay mechanic, visual token, or layout rule is established or changed.
- **ROADMAP**: a feature is planned, started, or completed.

## Doc Sync

Do **not** speculatively update docs on every prompt. Update docs only when explicitly asked to sync.

**Backlink integrity**: every doc file carries a `> **Related:**` line immediately after its `#` heading. When adding or moving a doc, update nav lines in files that reference it.

**Code → doc mapping:**

| Code path changed | Check these docs |
| ---- | ---- |
| `src/lib/game/core/types.ts` | `.docs/game/ARCHITECTURE.md` (data model section) |
| `src/lib/game/systems/GameEngineImpl.ts` | `.docs/game/ARCHITECTURE.md` (turn order section) |
| `src/lib/game/services/` | `.docs/game/ARCHITECTURE.md` (services section) |
| `src/lib/game/systems/ModifierSystem.ts` | `.docs/game/ARCHITECTURE.md`, `.docs/game/DECISIONS.md` |
| `src/lib/game/core/` (Items/Buildings/Research/Work) | `.docs/game/DESIGN.md` |
| `src/lib/components/screens/` | `.docs/ui/ARCHITECTURE.md` |
| `src/app.css` | `.docs/ui/DESIGN.md` |
