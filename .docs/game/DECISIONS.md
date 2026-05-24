<!-- LOC cap: 200 (created: 2026-05-25) -->

# DECISIONS [GAME]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DESIGN](DESIGN.md) · [PHILOSOPHY](PHILOSOPHY.md)

ADR-001 [GAME]: Layered Architecture with Singleton Services (2026-05-25, Accepted)
ADR-002 [GAME]: GameStateManager as Only Mutation Surface (2026-05-25, Accepted)
ADR-003 [GAME]: ModifierSystem for All Stat Calculations (2026-05-25, Accepted)
ADR-004 [GAME]: AI Generation Server-Side Only (2026-05-25, Accepted)
ADR-005 [GAME]: LocalStorage Persistence via Store (2026-05-25, Accepted)
ADR-006 [GAME]: Data Files Contain Definitions, Not Logic (2026-05-25, Accepted)

---

### ADR-001 [GAME]: Layered Architecture with Singleton Services

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

Early versions had business logic scattered across Svelte components and static data files, making the codebase hard to test or extend.

#### Decision

Strict five-layer architecture (UI → Stores → GameEngine → Services → Core). Each service implements an interface and exports a singleton (`export const fooService = new FooServiceImpl()`). No layer may import from a layer above it.

#### Consequences

All game logic is testable in isolation. Components stay thin. Adding a new system means adding a service, not modifying existing components.

---

### ADR-002 [GAME]: GameStateManager as Only Mutation Surface

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

Direct field assignment to `GameState` objects produced hard-to-trace bugs and inconsistent derived state.

#### Decision

`GameStateManager` (in `core/GameState.ts`) is the sole mutation point. It uses spread-operator updates (`{ ...state, ...patch }`) to produce new state objects. Services and the engine call its methods; nothing else writes to state.

#### Consequences

State transitions are predictable and traceable. Enables future undo/redo or time-travel debugging.

---

### ADR-003 [GAME]: ModifierSystem for All Stat Calculations

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

Work efficiency and pawn ability bonuses were being computed ad-hoc in multiple files with no audit trail.

#### Decision

All bonus/penalty calculations go through `ModifierSystem`. Every result includes `sources[]` — an array of `{ description, value }` objects explaining each contribution. UI can display the full breakdown.

#### Consequences

No manual flat-sum arithmetic for stats. Bonus sources are inspectable by the UI. Adding a new bonus source is a one-line change in the modifier method.

---

### ADR-004 [GAME]: AI Generation Server-Side Only

- **Date**: 2026-05-25
- **Status**: Accepted

#### Decision

Gemini API calls (`@google/generative-ai`) live exclusively in `src/routes/api/`. Client-side code calls the SvelteKit API route via `fetch`. This keeps API keys out of the browser bundle and centralises prompt logic.

---

### ADR-005 [GAME]: LocalStorage Persistence via Store

- **Date**: 2026-05-25
- **Status**: Accepted

#### Decision

The Svelte `gameState` store in `src/lib/stores/gameState.ts` handles serialisation/deserialisation to `localStorage['fantasia4x-save']`. No other code reads or writes this key.

---

### ADR-006 [GAME]: Data Files Contain Definitions, Not Logic

- **Date**: 2026-05-25
- **Status**: Accepted

#### Context

`Items.ts` and `Buildings.ts` grew to 2000+ lines by mixing item definitions with helper functions (`getCraftableItems`, `getTotalCraftingTime`, etc.), blocking testability and modding.

#### Decision

`core/` files export only static definition arrays/objects. All computation on those definitions belongs in the corresponding service. No new logic functions may be added to data files.

#### Consequences

Data files stay scannable for balancing. Logic is testable independently. Modders can replace data files without touching service code.
