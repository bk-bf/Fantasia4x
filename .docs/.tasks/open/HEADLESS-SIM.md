<!-- HEADLESS-SIM — a headless, API-driven instance of the sim that both a human (browser GUI) and an
     agent (curl) can start from a scenario, steer with the existing command registry, tick on demand,
     and read back — reusing the fact that GameEngineImpl already runs DOM-free. Doubles as the spin-up
     layer for a non-stale invariant regression suite. Design locked with the user 2026-07-18 (ADR-033);
     NOT yet built. -->
<!-- LOC cap: 340 (created: 2026-07-18) -->

# HEADLESS-SIM — Headless, API-Driven Simulation + Scenario Spin-Up

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-033) · [ENGINE-PERFORMANCE](../archive/ENGINE-PERFORMANCE.md) · [game/DESIGN](../../game/DESIGN.md)

**Status:** Design locked (2026-07-18), unimplemented. Phase 0 is a de-risking spike; Phases 1–5 are the
core build; Phase 6 (GUI-attach) is optional. Prompted by the recurring problem that **post-stone-age
content is unreachable by ordinary play** — the developer always re-tests early game and never fast-forwards
into the large bronze/iron+ content, so bugs there are never exercised.

---

## 1. The problem & what this delivers

The game has outgrown "play it to test it." The content past the stone age is large and only reachable after
an hour+ of play, so it's chronically under-exercised. The existing `~800`-test Vitest suite asserts **exact
values**, so it goes stale on every rebalance and has never caught a real bug — it only flags that the
codebase moved on.

Two separate problems are tangled here and this spec keeps them apart:

- **Reachability** — *getting to* the state you want to exercise. Solved by a **scenario system** (start a
  bronze/iron/war colony directly) + an **expanded debug/godmode** surface (grant stats, spawn gear, unlock
  research, toggle needs).
- **Regression detection** — knowing a change broke something. Solved **not** by golden screenshots (wrong
  fit — the option space is combinatorial, not a fixed tower-defense path) but by **invariant/property tests**
  over a fast-forwarded scenario ("resources never negative", "item conservation holds", "no pawn frozen
  1000 ticks", "seed replay is identical") — assertions that stay true across rebalances.

One primitive — **a scenario-built `GameState` driven by a headless engine** — serves **three** consumers:

1. **Interactive API driver** (the headline) — a dev-only HTTP surface both the developer (`curl`, scripts)
   and an agent can hit to start a scenario, issue player commands, tick, and read state. Optionally the
   browser GUI attaches as a live viewer so the developer can *watch* an agent play (§Phase 6).
2. **In-game debug/godmode panel** — the same scenario loader + `dev*` commands exposed in `DebugMenu.svelte`.
3. **Invariant regression suite** — the same scenario builder + tick loop, asserted in Vitest (§Phase 5).

## 2. Why this is cheap — the sim is already headless

The investigation (2026-07-18) confirmed the hard part is done:

- **`GameEngineImpl.processGameTurn()`** (`systems/GameEngineImpl.ts:262`) is a pure reducer over
  `GameState` — no Svelte, no DOM, no `localStorage`, no `window`. The only "browser" API on the tick path is
  `performance.now()`, which exists in Node. Vitest already boots and ticks the **real** engine headless
  today (`src/tests/game/services/entitySim.test.ts`, `systems/wildGrowth.test.ts`).
- **The worker (`sim/sim.worker.ts`) is pure transport** around that same `gameEngine` singleton — an
  in-thread fallback already exists for non-browser runtimes (`USE_SIM_WORKER = isClientRuntime`,
  `simWorkerClient.ts:104`). Headless **bypasses the worker entirely** and calls the engine directly.
- **The command surface already exists as data.** `sim/commands.ts` exports
  `COMMANDS: Record<string, (state, payload) => GameState>` (~70 worker-safe, serializable verbs) dispatched
  by `applySimCommand(state, cmd)` (`commands.ts:1521`). This maps **1:1 onto HTTP endpoints** — we expose the
  registry, we don't design an API.
- **`dev*` godmode kernel exists** — `devSpawnItem`, `devSpawnPawns`, `devSpawnBuildingAt`, `devSpawnResourceAt`,
  `devTriggerMigrantWave`, `_devResearchGateOff`, … already wired into `DebugMenu.svelte`.
- **A scenario factory exists** — `dev/profilerScenario.ts::buildProfilerScenario()` is already a pure
  `() => GameState` (reseed → `generateWorld` → `generatePawns` → default work → seed entities).
- **`GameState` is fully JSON/structured-clone safe** — no `Map`/`Set`/class instances/functions; the only
  lossy fields are A\*/`ascii` tile scratch, already handled by `saveManager`'s `stripTile`/`hydrateTile`. So
  **scenarios are just files**.

## 3. Architecture

```
Scenario (declarative spec | JSON snapshot)          ← NEW; generalises buildProfilerScenario()
    ↓  produces a GameState
HeadlessSession  (owns one GameEngineImpl + reseeds)  ← NEW; thin driver, calls processGameTurn() directly
    ↓  IN-THREAD, SYNCHRONOUS  (NOT via the worker — so an HTTP response can read state back immediately)
HTTP API  (dev-only SvelteKit routes  /api/sim/*)     ← NEW; thin wrapper over COMMANDS + query getters
    ↕  (optional) SSE/poll
Browser GUI as a thin client                          ← OPTIONAL (Phase 6); worker sim OFF, streams server state
```

- **In-thread, not the worker.** The worker is fire-and-forget (`postMessage`, no reply). A request/response
  API needs synchronous apply-then-read, so `HeadlessSession` calls `gameEngine.applyCommand(...)` /
  `processGameTurn()` directly and reads `getGameState()` back. (Matches the existing in-thread fallback.)
- **Single active session per server process (v1).** The `rng` is a **module singleton** (`core/rng.ts`);
  interleaving two sessions would clobber the shared RNG stream and break determinism. v1 allows **one live
  session** (or serialises tick execution); multi-session is out of scope. `HeadlessSession` instantiates its
  own `new GameEngineImpl()` (the class, not the exported singleton) so it doesn't fight the browser client's
  engine if both load in the same dev process.

## 4. The one real blocker — pathfinder under Node (Phase 0)

`WasmPathfinderService.init()` early-returns when `isClientRuntime === false`, and `findPath()` then returns
`[]`. Under Node/SSR the colony would tick but **nothing would move** (no pawn navigates to a job/resource).
This must be fixed first, and it **must preserve parity with the real client** — a hand-rolled TS A\* would
diverge in tie-breaking and desync pawn movement, defeating the determinism the whole thing relies on.

- [ ] **Phase 0 spike:** get the Rust `spatial-core` loading + returning real paths server-side — a
  `wasm-pack --target nodejs`/`bundler` variant loaded when `!isClientRuntime`, or a `--target bundler` build
  Vite handles for both SSR and client. Relax the `isClientRuntime` gate for the Node path only.
- [ ] Verify a pawn navigates to a job in a pure Node tick loop (extend an `entitySim`-style test). **Go/no-go
  gate for the rest of the spec.**

## 5. Guarding (must NOT ship / must NOT auto-run)

Three stacked guards satisfy "don't package it into `build.sh`, don't run it on every `./launch.sh`":

- [ ] **Dev-only** — routes mirror the existing `/api/log` pattern (`import.meta.env.DEV` guard; 404/no-op in
  prod). They **do not exist in a packaged/adapter-static build** — nothing to strip from `build.sh`.
- [ ] **Inert until asked** — the routes merely existing boots no engine and ticks nothing. `./dev.sh` /
  `./launch.sh` behave exactly as today; the engine session is created only on `POST /api/sim/session`.
- [ ] **Opt-in flag** — behind a `--headless` flag on `dev.sh` (sets `VITE_HEADLESS=1`); without it the
  handlers 404 even in dev.

## 6. Phased build

### Phase 0 — De-risk pathfinder under Node *(gate; see §4)*

### Phase 1 — HeadlessSession runner
- [ ] `game/headless/HeadlessSession.ts`: owns `new GameEngineImpl()`; `reseed(seed)`, `loadScenario(s)`,
  `tick(n)`, `command(cmd)` (→ `applySimCommand`), `getState()`, `snapshot()`.
- [ ] Drive in-thread; never import `sim.worker.ts` / `simWorkerClient.ts`.

### Phase 2 — Scenario system
- [ ] `game/headless/Scenario.ts`: generalise `buildProfilerScenario()` into a declarative builder — see §8.
- [ ] JSON snapshot save/load (reuse `saveManager` `stripTile`/`hydrateTile` for `worldMap`).
- [ ] Built-in presets: `empty-flat-8x8`, `bronze-colony`, `iron-colony`, `war-party`, `full-tech`.

### Phase 3 — Debug / godmode expansion *(new `dev*` verbs + `DebugMenu` controls)*
- [ ] `devSetPawnStats` / `devSetPawnSkills` (grant stats & 1–50 levels), `devGrantGrowth` (fire a growth
  offer), `devEquipPawn` (mint an `ItemInstance` into a slot), `devUnlockResearch`, `devSetToolTier`.
- [ ] **Per-need toggles** (genuinely new — no `enabled` field exists): a `_needsDisabled?:
  Partial<Record<NeedKey, boolean>>` flag on `GameState` (mirrors `_devResearchGateOff`), guarded at the single
  accrual choke point in `PawnService.processNeedsTick` (`PawnService.ts:449+`) and the mob path
  (`entityLifecycle` `stepHunger`), toggled via a `devToggleNeed` command.

### Phase 4 — HTTP API *(dev-only SvelteKit routes; reuses the `/api/log` server-route pattern)* — see §7

### Phase 5 — Invariant regression suite *(the net that doesn't go stale)* — see §10

### Phase 6 (OPTIONAL) — GUI-attach / spectator mode — see §11

## 7. HTTP API surface (`src/routes/api/sim/*`, dev-only)

| Method & path | Body / query | Backed by |
|---|---|---|
| `POST /api/sim/session` | scenario name or inline spec | `new HeadlessSession()` + `Scenario` builder |
| `DELETE /api/sim/session` | — | dispose |
| `POST /api/sim/tick` | `?n=` | `HeadlessSession.tick(n)` → `processGameTurn()` |
| `POST /api/sim/command` | `{ type, payload }` | `applySimCommand` — any of ~70 verbs + `dev*` |
| `GET /api/sim/state` | `?projection=` | `getState()` (slim projection default) |
| `GET /api/sim/query/{pawns\|jobs\|recipes\|research\|buildings\|map}` | filters | service query getters (`itemService.getCraftableItems`, `researchService.getAvailableResearch`, `buildingService.getAvailableBuildings`, `jobService.getAvailableJobs`, …) |
| `POST /api/sim/save` · `POST /api/sim/load` | JSON snapshot | `snapshot()` / `loadScenario()` |

Curl-first: both the developer and an agent drive it identically. Commands apply synchronously in-thread, so
responses can return the post-command state (no worker round-trip).

## 8. Scenario format (sketch)

```ts
interface Scenario {
  seed: number;                                    // determinism anchor
  map: { w: number; h: number; preset?: 'flat' | 'generated' };  // 8×8 is already the supported min
  pawns: Array<{ count: number; stats?: Partial<EntityStats>; skills?: Record<string, number>;
                 traits?: string[]; needs?: Partial<EntityNeeds> }>;
  research?: string[];                             // researchIds marked completed
  buildings?: Array<{ id: string; x: number; y: number }>;
  items?: Record<string, number>;                 // dropped into the stockpile
  needsDisabled?: Partial<Record<NeedKey, boolean>>;
  toolTier?: number;
}
```

The builder = `buildProfilerScenario`'s generate chain (reseed → world → pawns → default work → seed
entities) followed by a sequence of `dev*` commands applied through `applySimCommand` (so setup goes through
the same sanctioned path as play). A **snapshot scenario** is just a serialized `GameState` JSON — dump a live
session, reload it later. Presets ship as data so both `curl` and `DebugMenu` pick from the same list.

## 9. Debug / godmode commands

Reuse the existing `dev*` family; add the gaps in §Phase 3. All are pure `(state, payload) => state` in
`sim/commands.ts` (worker-safe), gated behind the debug/`--headless` context, and surfaced in
`DebugMenu.svelte` so the same godmode works in the browser and over HTTP.

## 10. Invariant regression suite (Phase 5)

Fast-forward each era preset N ticks in Vitest, then assert **properties**, not exact numbers:

- [ ] No resource ever negative; **item conservation** holds (produced == reserved + fetched + stockpiled — guards the ADR-016 reserve-and-fetch path).
- [ ] No pawn stat `NaN`/`Infinity`; no pawn stuck in one FSM state for 1000 ticks (regression net for the freeze/breakdown/rally class).
- [ ] A pawn with food available never starves; a `craft` job with materials present never stalls forever.
- [ ] **Seed replay determinism** — same seed + same scenario + same command script ⇒ byte-identical end state.

These survive rebalances: numbers change constantly, but negative wood / a starving pawn beside a full granary
are never intended.

## 11. GUI-attach / spectator mode (OPTIONAL, Phase 6)

Lets the developer **watch an agent play**. Not free — by default the server session and the browser client
are two unrelated `GameState`s (the client runs its own worker sim). To sync, the browser becomes a **thin
client of the headless session**:

- [ ] A dev-only "Attach to headless session" toggle turns the client's **worker sim off** and feeds
  `simWorkerClient.ts`'s existing `onState(state)` seam from the server instead (poll or SSE). The renderer is
  unchanged — it doesn't know the source.
- [ ] **Single writer:** in attached mode the server is authoritative — GUI clicks POST to `/api/sim/command`
  (shared control), the server ticks, state streams back. The client never ticks locally (avoids RNG/writer
  conflict).
- [ ] Efficiency: reuse the worker's sectional-diff / `EntitySync` approach over the wire rather than shipping
  the full `worldMap` each poll (cross-check ENGINE-PERFORMANCE before adding any per-flush payload).

## 12. Determinism, constraints & risks

- **Determinism** is a hard requirement (seeded `rng`, no `Math.random`/wall-clock in sim logic) and is the
  premise for both replay tests and spectator sync. `Scenario.seed` pins the trajectory.
- **Single session (v1)** — shared module RNG (§3). Multi-session deferred.
- **Risk: pathfinder-under-Node (Phase 0)** — the one unknown; everything else is wrapping proven-portable
  code. If the spike is hard, the fallback is to accept non-moving pawns for a first MVP (movement-independent
  content only) while the WASM path is sorted.
- **No perf regression to the shipped path** — headless is dev-only and in-thread; it must not add per-tick
  allocation or snapshot fields to the browser/worker path. Cross-check ENGINE-PERFORMANCE before touching
  `processGameTurn`, `commands.ts`, or the snapshot boundary.

## 13. New / touched modules

- **New:** `game/headless/HeadlessSession.ts`, `game/headless/Scenario.ts`, `game/headless/scenarios/*`,
  `src/routes/api/sim/**/+server.ts`.
- **Touched:** `sim/commands.ts` (new `dev*` verbs), `PawnService.processNeedsTick` +
  `entityLifecycle.stepHunger` (per-need guard), `core/types` (`_needsDisabled` flag),
  `WasmPathfinderService.ts` (Node init path), `DebugMenu.svelte` (new controls), `dev.sh` (`--headless` flag),
  optionally `simWorkerClient.ts` (attach seam).

## 14. ADR & doc sync

- [ ] **ADR-033** (DECISIONS.md) records the decision — headless as a **dev-only, in-thread driver over the
  existing engine + command registry**, guarded, single-session, invariants-not-goldens; registered in
  `codegraph.config.json` `adrRules`.
- [ ] On completion: ARCHITECTURE.md gains the headless layer + `/api/sim` surface; ROADMAP row ticked with date.

## Acceptance criteria

- [ ] Phase 0 green: a pawn paths to a job in a pure Node tick loop.
- [ ] `POST /api/sim/session` from a preset → `POST /api/sim/tick?n=` → `GET /api/sim/state` round-trips over `curl`.
- [ ] All ~70 `COMMANDS` + the new `dev*` verbs reachable via `POST /api/sim/command`.
- [ ] Every era preset fast-forwards N ticks and passes the §10 invariants; seed replay is byte-identical.
- [ ] Routes 404 in a production build **and** in dev without `--headless`; `./launch.sh` boots nothing extra.
- [ ] `pnpm check` + `pnpm graph:check` (ADR-033 registered) green.
