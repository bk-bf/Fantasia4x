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

**State immutability** (command/structural path): for player actions and structural changes, never assign to `GameState` fields — use `GameStateManager` methods only (`addResource`, `updatePawn`, `updateState`…). **Exception — hot per-tick sim phases mutate entity fields IN PLACE** (ADR-002 amendment, ENGINE-PERFORMANCE.md): the immutable spread/`.map()` style was the dominant tick cost (~12.5×), so `processNeedsTick`, the pawn FSM updaters (`transitionTo`/`goIdle`/`mutatePawn` in `pawn/handlers/*`), and `stepHunger` mutate in place — safe behind the per-tick top-level copy + the `?simworker` snapshot clone. **Don't revert these to immutable** (reinstates the tax).

**Modifier system**: all stat/efficiency calculations go through `ModifierSystem`. Every result includes `sources[]`.

**Turn order** (do not reorder): needs → work → completions → exploration → events.

**Data files are definitions only**: `src/lib/game/core/` contains static arrays/objects. Logic belongs in services.

**New core data needs a stable id**: entries added to `Items.ts`, `Buildings.ts`, `Research.ts`, or `Work.ts` need a stable `kebab-case` string `id`. Unlock conditions reference `researchId` strings from `Research.ts`; costs reference resource `id` strings from `types.ts`.

**Colony jobs are data-driven** (ADR-017): job types live in `database/jobs.jsonc` (a `JobDef` each — work-category, label, claim-gating), with behaviour bound by `id` in `JobService`'s `handlers` registry. First decide which you actually need:

- **A new way to make/process an item** (cooking, butchering, drying, smelting…) is almost always **just a recipe** in `recipes.jsonc` at a station — *not* a new job type. It's already a `craft` job. Add the recipe (+ station building, + `Work.ts` category if new); no code.
- **A genuinely new colony job *type*** (a new verb like `fetch` was) — rare. Three edits, guarded against drift by `jobRegistry.test.ts` + compile-time `JobPoolType` checks:
  1. add a `JobDef` entry to `database/jobs.jsonc`,
  2. bind `generate`/`complete` for that id in `JobService.handlers` (+ add the id to the `JobPoolType` union),
  3. add the id to the `Job['type']` union in `core/types.ts`.

  The work-category map (`_jobTypeToWorkKey`), labor prioritisation, UI display, and claim-gating all flow from the `JobDef` — never hand-write a `job.type` switch (the duplicated one in `pawnUtils` was deleted; use `jobService.getJobWorkCategory`). FSM-internal kinds (`eat`/`sleep`/`need`) are not colony jobs and have no `JobDef`.

**Component size**: 200 line limit per component. Extract sub-components when exceeded.

**Svelte 5 runes**: use `$state`, `$derived`, `$effect` — not legacy `$:` syntax.

**Spatial services must stay behind interfaces** (ADR-008): All pathfinding, fog-of-war, and spatial query logic must be implemented as services conforming to a defined TypeScript interface (e.g. `PathfindingService`, `SpatialIndexService`). The implementations are Rust compiled to WASM via `wasm-pack` — callsites must never import from `spatial-core/` directly, only from the TypeScript interface. "Spatial" means: A\* pathfinding, nearest-entity queries, fog-of-war visibility. It does **not** mean: pawn state machine, needs system, mood, work priorities, inventory — those stay in TypeScript services. **If you are about to implement spatial logic that bypasses the service interface, or inline it into a component, store, or GameEngineImpl, stop and flag it to the user.**

## Package Manager

**Always use `pnpm`** — never `npm` or `yarn`.

- Install a package: `pnpm add <pkg>` / `pnpm add -D <pkg>`
- Install all deps: `pnpm install`

## Build Commands

**Always use `./dev.sh` to start the dev server** — never run `pnpm dev` or `npm run dev` directly. The script checks whether port 5173 is already in use and prints the existing URL instead of spawning a duplicate on a random port.

```bash
./dev.sh                  # start dev server on http://localhost:5173 (or report existing)
pnpm build                # production build
pnpm check                # TypeScript + Svelte type check (svelte-check)
pnpm lint                 # ESLint + Prettier check
pnpm format               # Prettier write
pnpm test                 # Vitest unit/regression suite (test:watch for watch mode)
pnpm add:wasm             # rebuild spatial-core WASM → src/lib/spatial-core-pkg/
pnpm graph                # (re)extract this project's graph via the standalone codegraph tool
pnpm graph:serve          # codegraph viewer + JSON query API on http://localhost:5180
pnpm graph:check          # architecture checks (ADRs/layers/cycles/god-modules/orphans)
pnpm graph:snapshot       # save the current graph as a baseline
pnpm graph:diff           # diff the graph against the saved baseline
```

> These `graph:*` scripts call the standalone codegraph CLI at `../codegraph`
> (`node ../codegraph/bin/codegraph.mjs … Fantasia4x`) — it must be checked out as a
> sibling of this repo. Override its location with `CODEGRAPH_DIR`.

## Codebase Graph (standalone `codegraph` tool)

The call-graph explorer + **JSON query API for agents** lives in its own repo at
`../codegraph` (a sibling of this one). Fantasia4x is **onboarded** as a project
via `codegraph.config.json` + `codegraph.descriptions.json` at this repo's root
(the config declares the layer map and ADR rules; pure JSON — analysing the
project never runs its code). Use the API to understand structure, find
callers/callees, trace call paths, and spot hubs instead of grepping blind.
Covers **TypeScript** (`src/lib`), **Svelte** components, and **Rust**
(`spatial-core`) in one connected graph, so a call path can cross the WASM
boundary. See `../codegraph/README.md`.

- **Start it:** `pnpm graph:serve` (or `./launch.sh --debug`) → SvelteKit viewer
  + API on http://localhost:5180. `--debug` also watches `src/lib` and
  re-extracts on change; otherwise re-extract manually with `pnpm graph`.
- **Query the API (agents).** CORS-open; `GET /api` is self-documenting. With one
  project onboarded the default is Fantasia4x; otherwise append
  `?project=Fantasia4x`. Responses are JSON.
  - `/api/function?name=<id|Class.method|method>` — description, signature,
    callers, callees. Ambiguous names return all matches.
  - `/api/search?q=` · `/api/callers?name=` · `/api/callees?name=`
  - `/api/path?from=&to=` — shortest call path (crosses the TS↔Rust boundary)
  - `/api/module?name=` · `/api/modules` · `/api/hubs` · `/api/graph` · `/api/stats`
  - Browse lists: `/api/functions` · `/api/calls` · `/api/files` (with
    `sort=`/`group=`/`q=`/`kind=`/`exported=`/`tested=`/`cross=`/`limit=`)
  - Insights: `/api/check` · `/api/recommendations` · `/api/port-candidates` ·
    `/api/orphans`
  - e.g. `curl 'localhost:5180/api/function?name=tickPawn'`
    · `curl 'localhost:5180/api/path?from=processGameTurn&to=tickPawn'`
- **Descriptions:** every function gets one (curated → JSDoc → inferred). Improve
  specific ones by editing this repo's `codegraph.descriptions.json` (keyed
  `module::Class.method` for functions, full module path for modules), then
  re-extract.
- **Guardrails:** `pnpm graph:check` enforces architecture rules (each checkable
  ADR, layer direction, cycles, god-modules, orphans; exit 1 on violations —
  CI-ready). `pnpm graph:snapshot` / `pnpm graph:diff` track structural change.

### Onboarding an ADR into the graph checker

Every ADR in `DECISIONS.md` must be registered in this repo's
`codegraph.config.json` `adrRules`; `graph:check`'s `adr-coverage` rule flags any
that isn't. When you add an ADR, add one JSON entry — either:

- a **declarative** structural rule the call graph can verify, e.g.
  `{ "adr": "ADR-0XX", "severity": "error", "title": "…", "type": "forbidden-callee-module", "module": "game/services/X", "msg": "…" }`
  (see the existing `ADR-008` entry; a new rule **type** is added once in
  `../codegraph/src/lib/core/analysis.mjs`'s `ADR_RULE_TYPES`), **or**
- an acknowledgement that it isn't graph-expressible (most are design/runtime):
  `{ "adr": "ADR-0XX", "checkable": false, "reason": "…" }`.

Checkable ADRs then appear as their own rule in `graph:check`, the API
(`/api/check`), and the viewer's Insights panel automatically — no other wiring
needed.

## Performance Profiling & Debugging

Diagnose runtime cost (per-tick sim hot path — see
`.docs/.tasks/open/ENGINE-PERFORMANCE.md`).

- **`electron-debug`** — MCP server (Chrome DevTools Protocol) for the Electron/V8
  shell in `desktop-spike/electron` (the cross-engine TPS spike): process
  start/stop/monitor, raw CDP, and `Runtime.evaluate` on the live renderer. The
  shell exposes CDP on **:9222** (`main.js` appends `--remote-debugging-port`;
  override via `ELECTRON_DEBUG_PORT`). Per-user, not committed: clone + build
  `github.com/amafjarkasi/electron-mcp-server` (not on npm), point a git-ignored
  `.mcp.json` at its `build/index.js`. Run order: `./dev.sh` →
  `cd desktop-spike/electron && pnpm start` → `curl localhost:9222/json` → `/mcp`.

Firefox/Gecko profiling (`firefox-devtools-mcp` + `pq`) is parked in the
`/firefox-profiling` skill — invoke it when you need it.

## Documentation

Full architecture, design decisions, philosophy, and task tracking live in `.docs/`.

| Path                                        | Scope                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `.docs/game/ARCHITECTURE.md`                | Layer map, service boundaries, turn order, data flow                       |
| `.docs/game/DESIGN.md`                      | Core gameplay loop, race/pawn mechanics, combat system design              |
| `.docs/game/DECISIONS.md`                   | ADRs — add one when a non-obvious design choice is locked in               |
| `.docs/game/PHILOSOPHY.md`                  | Guiding development principles; edit only if a principle genuinely changes |
| `.docs/ui/ARCHITECTURE.md`                  | Component breakdown, screen structure, store usage patterns                |
| `.docs/ui/DESIGN.md`                        | Visual direction, retro terminal style, colour and typography rules        |
| `.docs/.tasks/open/ROADMAP.md`              | Planned work; keep entries actionable and brief                            |
| `.docs/.tasks/open/SCREEN-REFACTORING.md`   | Break down WorkScreen, ExplorationScreen, CraftingScreen                   |
| `.docs/.tasks/open/RESEARCH-ENHANCEMENT.md` | Three-tier research system design and requirements                         |
| `.docs/.tasks/archive/`                     | Completed specs, filename pattern: `FEATURE-YYYY-MM-DD.md`                 |

## When to Update

- **ARCHITECTURE**: a new service, layer, or data flow is added or removed.
- **DECISIONS**: a non-obvious design choice is made that future contributors would otherwise re-litigate. **Also onboard the ADR into the graph checker** (see below) — `pnpm graph:check` fails (`adr-coverage`) until you do.
- **DESIGN**: a gameplay mechanic, visual token, or layout rule is established or changed.
- **ROADMAP**: a feature is planned, started, or completed.

## Doc Sync

Do **not** speculatively update docs on every prompt. Update docs only when explicitly asked to sync.

**Always close out the tracker after finishing a tracked task.** When a task came from a tracking file — a checkbox/row/table in `CODEBASE-REVIEW-*.md`, a `ROADMAP.md` entry, a spec's acceptance criteria, etc. — update that file as part of completing the work (tick the box / mark the row done with the date + a one-line outcome, e.g. `check`/`test` gate). This is **not** speculative doc-sync: closing the record for the thing you just did is part of the task. Leaving a finished item showing "open/Partial" is the failure mode to avoid.

**Backlink integrity**: every doc file carries a `> **Related:**` line immediately after its `#` heading. When adding or moving a doc, update nav lines in files that reference it.

**Trackable items use task-list checkboxes**: in any doc/spec, render lists of things-to-do — acceptance criteria, implementation phases/steps, open questions, validation gates, TODOs — as GitHub task-list checkboxes (`- [ ]` open, `- [x]` done), matching existing specs (e.g. DISTRIBUTION's acceptance criteria). They must be tickable for progress tracking. Reserve plain bullets for explanation/context and tables for non-trackable comparison matrices (trade-off grids, dependency matrices). ROADMAP's `[x]`/`[ ]` status cells are the same convention. Check for this before finishing a doc edit.

**Code → doc mapping:**

| Code path changed                                    | Check these docs                                        |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/game/core/types.ts`                         | `.docs/game/ARCHITECTURE.md` (data model section)       |
| `src/lib/game/systems/GameEngineImpl.ts`             | `.docs/game/ARCHITECTURE.md` (turn order section)       |
| `src/lib/game/services/`                             | `.docs/game/ARCHITECTURE.md` (services section)         |
| `src/lib/game/systems/ModifierSystem.ts`             | `.docs/game/ARCHITECTURE.md`, `.docs/game/DECISIONS.md` |
| `src/lib/game/core/` (Items/Buildings/Research/Work) | `.docs/game/DESIGN.md`                                  |
| `src/lib/components/screens/`                        | `.docs/ui/ARCHITECTURE.md`                              |
| `src/app.css`                                        | `.docs/ui/DESIGN.md`                                    |
