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

**Ask before implementing — do NOT touch code unless explicitly asked.** Diagnosing a bug, explaining a root cause, or identifying "the right fix" is NOT permission to write it. When you find the fix, STOP at the proposal: state the cause + the change in a few lines and WAIT for an explicit go-ahead. Only edit the files the user named, doing only the scope they described — no extra helpers, refactors, "robust"/"while I'm here" additions, or UI flourishes (asked for a concise `(<value>)` readout → add exactly that, no labels/symbols/comparisons). Investigating and reading are fine without asking; editing is not. This overrides any "when you have enough info, act" instinct.

**Service singletons**: import `fooService`, never instantiate `FooServiceImpl` directly.

**State immutability** (command/structural path): for player actions and structural changes, never assign to `GameState` fields — use `GameStateManager` methods only (`addResource`, `updatePawn`, `updateState`…). **Exception — hot per-tick sim phases mutate entity fields IN PLACE** (ADR-002 amendment, ENGINE-PERFORMANCE.md): the immutable spread/`.map()` style was the dominant tick cost (~12.5×), so `processNeedsTick`, the pawn FSM updaters (`transitionTo`/`goIdle`/`mutatePawn` in `pawn/handlers/*`), and `stepHunger` mutate in place — safe behind the per-tick top-level copy + the `?simworker` snapshot clone. **Don't revert these to immutable** (reinstates the tax).

**Modifier system**: all stat/efficiency calculations go through `ModifierSystem`. Every result includes `sources[]`.

**Turn order** (do not reorder): needs → work → completions → exploration → events.

**Data files are definitions only**: `src/lib/game/core/` contains static arrays/objects. Logic belongs in services.

**Before creating, naming or re-tiering ANY item, invoke the `items` skill** (`.claude/skills/items/SKILL.md`) and walk `docs/game/ITEM-RULES.md`. It is an ordered gate list, and each gate can kill the item outright. The two rules broken most often: an item's `tier` must be **at least** the tier of the hardest creature its recipe names (an untiered item reads as tier 0 = Primitive, which is how a Cave Bear's plate ended up in the stone age), and a piece named after a species must **require** that species' material. **Generic before thematic** — a tier's plain material-named line must be complete before any creature-derived alternative for the same slot is authored; Boss tier is the sole exception and must be thematic. A third rule broken just as often, now checked by R4: an item's tier must be at least the age of the latest STATION in its whole ingredient chain (a tier-0 linen cap needed a bronze-age spinning wheel). And a chain earns its length from the ANIMAL, never from an extra processing step. `itemRules.test.ts` + `armourCoverage.test.ts` enforce the checkable part.

**New core data needs a stable id**: entries added to `Items.ts`, `Buildings.ts`, `Research.ts`, or `Work.ts` need a stable `kebab-case` string `id`. Unlock conditions reference `researchId` strings from `Research.ts`; costs reference resource `id` strings from `types.ts`.

**Never leak ids in the UI**: data ids — `Items/Buildings/Research` `kebab-case` ids, `limbmap.jsonc` limb/part keys (`front_right_leg`, `frontRightUpperLeg`, `tail`…), job types, etc. — are BACKEND REFERENCE ONLY. A panel/screen must render a human label, never the raw `id`. Use the def's `name`/`label` field; for anatomy route through `src/lib/utils/bodyLabels.ts` (`limbLabel`/`partLabel`) — the single chokepoint so a new body plan can't leak snake_case/camelCase ids into the health panels. Don't hand-roll `id.replace(...)` humanizers at the callsite (they drift — `.replace('_',' ')` only catches the first underscore).

**Never leak dev jargon into player-facing text**: the `description`/`name` string VALUES in the data files (`stats.jsonc`, `conditions.jsonc`, `items.jsonc`, `traits.jsonc`…) and any UI label/tooltip string are PLAYER-FACING. ADR numbers, spec section refs (`§F8`, `TRAIT-SYSTEM-V2`), file/field/function names, and design-note commentary belong in `//` comments beside the entry — never inside the string. And the TONE: **imply, don't instruct** — describe what the thing IS in-world ("a telling hit that finds a gap… instead of glancing off") and let the player figure out the strategic value themselves. No designer's sales pitch ("THE decisive stat"), no strategy advice ("handy against armoured foes"), no mechanics essay.

**Colony jobs are data-driven** (ADR-017): job types live in `database/jobs.jsonc` (a `JobDef` each — work-category, label, claim-gating), with behaviour bound by `id` in `JobService`'s `handlers` registry. First decide which you actually need:

- **A new way to make/process an item** (cooking, butchering, drying, smelting…) is almost always **just a recipe** in `recipes.jsonc` at a station — *not* a new job type. It's already a `craft` job. Add the recipe (+ station building, + `Work.ts` category if new); no code.
- **A genuinely new colony job *type*** (a new verb like `fetch` was) — rare. Three edits, guarded against drift by `jobRegistry.test.ts` + compile-time `JobPoolType` checks:
  1. add a `JobDef` entry to `database/jobs.jsonc`,
  2. bind `generate`/`complete` for that id in `JobService.handlers` (+ add the id to the `JobPoolType` union),
  3. add the id to the `Job['type']` union in `core/types.ts`.

  The work-category map (`_jobTypeToWorkKey`), labor prioritisation, UI display, and claim-gating all flow from the `JobDef` — never hand-write a `job.type` switch (the duplicated one in `pawnUtils` was deleted; use `jobService.getJobWorkCategory`). FSM-internal kinds (`eat`/`sleep`/`need`) are not colony jobs and have no `JobDef`.

**Selection is not commitment** (UX): a selection/marking gesture — clicking, or drawing a drag-box — must only **highlight** the targets and surface a verb button; it must **never auto-execute** the action. Drawing a box over resources highlights them and shows a HARVEST/DESIGNATE button (the player presses it to commit); it does not auto-designate. Same shape everywhere: MARK pawns/mobs → highlight → then DRAFT/MOVE/HUNT. The highlight persists until the player confirms or clears it. The only thing that should vanish on release is the transient drag *preview*. Never collapse the two steps into an immediate commit "to save a click" — losing the review step is the bug.

**Component size**: 200 line limit per component. Extract sub-components when exceeded.

**Svelte 5 runes**: use `$state`, `$derived`, `$effect` — not legacy `$:` syntax.

**Spatial services must stay behind interfaces** (ADR-008): All pathfinding, fog-of-war, and spatial query logic must be implemented as services conforming to a defined TypeScript interface (e.g. `PathfindingService`, `SpatialIndexService`). The implementations are Rust compiled to WASM via `wasm-pack` — callsites must never import from `spatial-core/` directly, only from the TypeScript interface. "Spatial" means: A\* pathfinding, nearest-entity queries, fog-of-war visibility. It does **not** mean: pawn state machine, needs system, mood, work priorities, inventory — those stay in TypeScript services. **If you are about to implement spatial logic that bypasses the service interface, or inline it into a component, store, or GameEngineImpl, stop and flag it to the user.**

## CI / Build

Develop directly on `main` (no dev branch). The desktop build (`.github/workflows/build.yml`: Linux
AppImage/deb + Windows NSIS) is **manually triggered** — run it on demand from the Actions tab
("Run workflow") or `gh workflow run "Build desktop binaries"` when you want installers, not on every
push. Grab the binaries from the run's Artifacts. CI runs **Node 22** (pnpm@11.3.0 needs ≥ 22.13);
use the same locally.

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
pnpm test                 # Vitest FULL suite (~800 tests) — only when asked or a broad hub changed
pnpm test:related <files> # only tests importing the given source files (default after an edit)
pnpm test:changed         # only tests affected by the current git diff
pnpm test:watch           # watch mode
pnpm add:wasm             # rebuild spatial-core WASM → src/lib/spatial-core-pkg/
pnpm audit:t0             # deterministic checks: ADR constants, architecture seams, ADR coverage
```

> **Scope tests after an edit — do NOT run the full ~800-test suite by default** (it taxes the
> machine). After an implementation, run `pnpm test:related <the files you just edited>` (precise;
> a handful of tests). Run the full `pnpm test` only when the user explicitly asks, or when the
> change touches a broad hub (`core/types.ts`, `ModifierSystem`, `GameStateManager`, the per-tick sim
> path). Note `pnpm test:changed` derives its set from `git diff`, so it widens as the working tree
> accumulates uncommitted changes — and editing a `forceRerunTrigger` file (`package.json`,
> `vite.config.*`, `vitest.config.*`) makes it fall back to the full suite; prefer `test:related` in
> those cases.

> **Headless/playtest/verify = drive the REAL sim → invoke the `headless` skill.** Any
> "verify / playtest / headless / end-to-end" claim must come from `HeadlessSession` (or `./dev.sh --headless` + `/api/sim/*`)
> with real pawns over real ticks, and must state the mechanism + observed delta ("N ticks, stock X→Y").
> Unit/service tests (`completeCraftOrder`, `canQueueCraft`, static reachability, `resolveHit` sampling)
> are a **supplement, never a substitute** — they prove a function, not that the pawn-driven loop works.
> If something is only unit-tested, say so plainly and mark it `[~]`, never `[x]`. Never dress a unit test
> up as a headless playtest.
>
> The `headless` skill (`.claude/skills/headless/SKILL.md`) carries the setup preflight and the
> stall-debugging order — **read it before writing a scenario.** Skipping it has already produced three
> wrong diagnoses ("passive stations are broken", "anvil needs a carried tool", "the ore chain is
> broken"), every one of them a setup mistake that looks exactly like a game bug.

## Finding your way around the code

There is no index, map or graph of this codebase to consult, deliberately: one existed, it
drifted from the code, and a stale map answers "nothing found" in the same voice as
"nothing is wrong". Read the code.

- **Where is X / who calls X** — Grep. The result is a line in a file you can read, and it
  is true at the moment you run it.
- **What breaks if I change X** — Grep for the name, read each call site, follow the ones
  that matter upward. Include string keys and re-exports; neither looks like a call.
- **Is X dead** — the same search, plus `src/tests` and the `.jsonc` data files, before you
  conclude nothing reaches it.
- **Is X tested** — Grep `src/tests` for the name, then for the scenario that would run it.
  Most of the suite drives through `buildScenario` / `HeadlessSession` and never names its
  subject, so "no direct hit" is not "untested".
- **Architecture rules that a script can decide** — `pnpm audit:t0`: constants an ADR
  declares against their real values, and the chokepoints in
  `tools/audit/seams.jsonc` against every call site that reaches them.

## Performance Profiling & Debugging

**⚠️ Cross-check `docs/tasks/open/ENGINE-PERFORMANCE.md` BEFORE changing any per-tick sim hot path,
the worker→main snapshot boundary (`sim.worker.ts` / `simWorkerClient.ts`), or the render/store flow —
and re-check `.debug/perf.log` AFTER.** Perf regressions have recurred *multiple times* from optimising
one thing while reintroducing a cost the spec already documents. Treat the spec as a pre-flight
checklist, not background reading. The recurring traps it covers:

- **No new per-tick allocation on the PEACE path** (the common case). The immutable spread/`.map()`
  style is a ~12.5× tick tax (ADR-002 amendment — hot phases mutate in place / copy-on-write). Clone
  lazily on first write, never unconditionally every tick.
- **Don't churn an array ref every tick** — ref-keyed memos (`pawnById`, terrain `_terrainRev`) silently
  invalidate and rebuild.
- **Keep the snapshot slim** — never add a field/array that ships every flush or grows unbounded
  (`droppedItems`, per-unit arrays); ship a small summary or per-id deltas (`EntitySync`), strip
  never-read fields (`entityProjection.ts`).
- **Measure the boundary, not just the sim** — `perf.log` is worker TPS only; an FPS dip with healthy
  TPS is render-side. Correlate dips with `combat.log`/`system.log` before *and* after a change.

When you land a perf-relevant change, update the spec (see "When to Update" / Doc Sync).

Diagnose runtime cost (per-tick sim hot path — see
`docs/tasks/open/ENGINE-PERFORMANCE.md`).

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

Full architecture, design decisions, philosophy, and task tracking live in `docs/`.

| Path                                        | Scope                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `docs/game/ARCHITECTURE.md`                | Layer map, service boundaries, turn order, data flow                       |
| `docs/game/DESIGN.md`                      | Core gameplay loop, race/pawn mechanics, combat system design              |
| `docs/game/DECISIONS.md`                   | ADRs — add one when a non-obvious design choice is locked in               |
| `docs/game/ITEM-RULES.md`                  | Gate list every new armour/weapon must pass; generic-before-thematic rule   |
| `docs/game/PHILOSOPHY.md`                  | Guiding development principles; edit only if a principle genuinely changes |
| `docs/ui/ARCHITECTURE.md`                  | Component breakdown, screen structure, store usage patterns                |
| `docs/ui/DESIGN.md`                        | Visual direction, retro terminal style, colour and typography rules        |
| `docs/issues/`                             | Defects — the only record; raised by the audit, gated by `ready:`           |
| `docs/pr/`                                 | Fix attempts awaiting review: a local branch and the argument for it        |
| `docs/tasks/open/ROADMAP.md`              | Planned work; keep entries actionable and brief                            |
| `docs/tasks/open/SCREEN-REFACTORING.md`   | Break down WorkScreen, ExplorationScreen, CraftingScreen                   |
| `docs/tasks/open/RESEARCH-ENHANCEMENT.md` | Three-tier research system design and requirements                         |
| `docs/tasks/archive/`                     | Completed specs, filename pattern: `FEATURE-YYYY-MM-DD.md`                 |

## When to Update

- **ARCHITECTURE**: a new service, layer, or data flow is added or removed.
- **DECISIONS**: a non-obvious design choice is made that future contributors would otherwise re-litigate. `pnpm audit:t0` lists every ADR in the doc that no T2 rule covers; if the new one states a number or names a chokepoint, it belongs in `tools/audit/seams.jsonc` where a script decides it instead.
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
| `src/lib/game/core/types.ts`                         | `docs/game/ARCHITECTURE.md` (data model section)       |
| `src/lib/game/systems/GameEngineImpl.ts`             | `docs/game/ARCHITECTURE.md` (turn order section)       |
| `src/lib/game/services/`                             | `docs/game/ARCHITECTURE.md` (services section)         |
| `src/lib/game/systems/ModifierSystem.ts`             | `docs/game/ARCHITECTURE.md`, `docs/game/DECISIONS.md` |
| `src/lib/game/core/` (Items/Buildings/Research/Work) | `docs/game/DESIGN.md`                                  |
| `src/lib/components/screens/`                        | `docs/ui/ARCHITECTURE.md`                              |
| `src/app.css`                                        | `docs/ui/DESIGN.md`                                    |
