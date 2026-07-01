# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [game/BUGS](game/BUGS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [ENGINE-PERFORMANCE (archive)](.tasks/archive/ENGINE-PERFORMANCE.md) · [ENGINE-PERFORMANCE-II (archive)](.tasks/archive/ENGINE-PERFORMANCE-II.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. The resolved half is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md): R1–R12, the PawnStateMachine
decomposition, the **2026-06-14/16 second wave** (P-2/P-2b/P-3/P-4b, the done P-4 god-file splits, INV-1/LIGHT-1/FLEE-1/MOVE-1,
Tier 0, P-5 + D9/D-perf), and the playtest N-2..N-5. Runtime **defects** now live in
[game/BUGS.md](game/BUGS.md) (root-caused log; all entries there are FIXED as of this pass) — this file
tracks architecture debt + whatever the gates flag.

**Since the last update (2026-06-16 → 2026-07-01, ~790 commits)** the big arcs shipped and were archived:
[ENGINE-PERFORMANCE-II](.tasks/archive/ENGINE-PERFORMANCE-II.md) (victory 2026-06-22 — 500² map at 120 FPS / 60 TPS @1×,
~120 TPS @4×, via the entity complexity bubble + ADR-026 incremental-only terrain),
[SEASONS_WEATHER](.tasks/archive/SEASONS_WEATHER-2026-06-17.md), [PRODUCTION-CHAIN-II](.tasks/archive/PRODUCTION-CHAIN-II-2026-06-21.md),
[RANGED-COMBAT](.tasks/archive/RANGED-COMBAT-2026-06-21.md), [MOB-SPAWNING](.tasks/archive/MOB-SPAWNING.md), plus
ADR-018..ADR-026, the audio subsystem, main menu + app-shell hardening, the terrain/art rework (bi-colour glyphs,
trees, ore veins, ice), and the temperature/connectivity bug arcs logged in BUGS.md.

Gate at last update (2026-07-01): `check` 0 (8 svelte warnings) · `test` **820/820** (115 files) ·
`lint` **6 errors** (see G-1) · `build` ok · `graph:check` **12 errors / 43 warnings** (see A-items).

---

## Gate breakage (fix first — these are red right now)

- [ ] **G-1 · `pnpm lint` fails: 6 `no-console` errors on the sim path.** Stray `console.log`s in
  `sim/sim.worker.ts` (458, 474, 477), `sim/simWorkerClient.ts` (79, 85) and `sim-core/bench.ts` (77) —
  besides breaking the gate, unconditional console output in the worker hot path is a perf smell
  (ENGINE-PERFORMANCE: log sinks must be debug-gated). Route through the gated logger or delete.
  Plus 5 `unused eslint-disable` warnings (`--fix`-able).

## graph:check (2026-07-01 run — 12 errors, 43 warnings)

Graph: 262 files · 1,983 functions · 2,971 edges. `adr-coverage` ✓ (all ADRs through 026 registered).

- [ ] **A-1 · ADR-008 ×10 — direct `wasmPathfinderService` imports bypass the `PathfinderService` interface.**
  Landed during the pathfinding-perf arc (per-call `max_iter` cap, connectivity work):
  `services/draftMovePath.ts:46`, `services/entity/entityHelpers.ts` (`nearestPredatorMap`:178, `pathTo`:769),
  `systems/GameEngineImpl.ts` (`debugLogPawns`, `_processDraftOrders`, `walkTo`), and — worse, components —
  `GameCanvas.svelte` + `GameControls.svelte`. Decide per callsite: route through the interface singleton, or
  (if the new WASM-only params are the point) widen the TS interface and amend the rule's allowlist. The two
  component callsites should go through a service regardless.
- [ ] **A-2 · Dependency cycles ×2.** (1) a 6-module service cycle
  `PawnStatService → ResourceObjectService → LightingService → EnvironmentService → ItemService → core/PawnEquipment → …`;
  (2) `JobService ↔ jobs/craft` — the ADR-017 registry was designed to point one way (JobService binds
  handlers by id); craft importing JobService back closes a loop. Break with a shared leaf module or
  callback param.
- [ ] **A-3 · Layer-direction warnings ×15.** Headline: **`core/PawnEquipment` → `services/ItemService`
  (9 call sites)** — core data reaching *up* into services (also the seam that closes the A-2 cycle).
  The rest are 1–3-callsite leaks (`utils/itemInfo`→4 services, `utils/conditionInfo`→2,
  `webgl/fantasia-world`→ResourceObjectService/BuildingService, `entities/Pawns`→ModifierSystem,
  `services/jobs/harvest`→regrowthQueue, entityHelpers/entityAI→rangedCombat/MovementSystem,
  `utils/pawnUtils`→JobService). Chip opportunistically when touching each file.
- [ ] **A-4 · God-modules ×10 (>40 functions).** The P-4 wave split the old set; growth minted a new one:

  | Module | fns | LOC | Note |
  | ------ | --- | --- | ---- |
  | `sim/commands` | 88 | 1,275 | command registry — may just need a higher per-registry threshold |
  | `services/EnvironmentService` | 77 | 1,546 | grew through seasons/weather/temperature/ice arcs — best split candidate (temperature bake vs weather vs season/daylight) |
  | `stores/gameState` | 70 | 1,569 | boot/menu/save gate logic accreted (see BUGS temp-bake entry) |
  | `stores/saveManager` | 49 | 672 | |
  | `services/BuildingService` | 48 | 924 | |
  | `services/ItemService` | 46 | 1,120 | |
  | `systems/Combat` | 43 | 1,995 | data table already split out 06-16; logic grew back via ranged/finesse/stamina work |
  | `systems/pawn/pawnHelpers` | 43 | 999 | was "no longer a god-module" on 06-16 — regressed |
  | `systems/GameEngineImpl` | 43 | 1,482 | |
  | `core/GameState` | 42 | 594 | |

- [ ] **A-5 · Orphans ×14 — triage dead code vs extractor blind spots.** Likely real dead code:
  `core/Terrains` `TR`/`PR`/`hexToRgb01` (leftovers of the hex-string colour migration), `core/Creatures.toDefinition`,
  `pawnHauling.acceptTest`, `itemCategoryTree.sortNode`, `actions/autohideScroll.onScroll`, `audio/manifest`
  `clips`/`workClips`/`combatClips`. Likely **false positives** (worker message-handler closures the extractor
  can't see): `sim.worker` `installForwardingLogSink`/`logActivity`/`publish`/`batch` — if so, fix
  `../codegraph` extract.mjs rather than suppressing.
- [ ] **A-6 · Duplicate definitions ×4.** `hexToRgb01` ×3 (core/Terrains, ResourceObjectService,
  webgl/fantasia-world), `itemMatchesCostCategory` ×2 (BuildingService, ItemService), `logActivity` ×2
  (stores/Log, sim.worker), `clear` ×2 (name collision, probably fine). Consolidate the first two.
- [ ] **A-7 · Graph snapshot baseline is stale** (~429 new edges since it was taken). Re-run
  `pnpm graph:snapshot` once A-1/A-2 triage lands, so `graph:diff` becomes signal again.

## From playtest

- [ ] **N-1 · Can't place buildings under `--profiler`.** Still no recorded fix — but the whole boot path
  was reworked since (main menu + `--play` flag + runtime debug toggle, `b23e6fff`; menu-preview map,
  profiler sandbox auto-boot). **Retest before debugging** — the 06-16 diagnosis (divergence in how
  `--debug` vs `--profiler` drive the sim/worker, not in BuildingService) may simply be moot now.
- [ ] **N-6 · Blueprint drag preview lags far behind the cursor** during placement
  ([game/NOTES.md](game/NOTES.md)) — render-side; correlate with the ADR-026 incremental paint path.
- [ ] **N-7 · Wall-blueprint drawing feel** ([game/NOTES.md](game/NOTES.md)) — the fill-rectangle switch
  (`9cbc9500`) landed; remaining polish is UX feel, tune with N-6.

## Structural debt (deferred by design — no big-bang)

- [ ] **P-4 · God files (remaining).** Done rows are in the archive. Still open:

  | File | LOC | Decomposition status |
  | ---- | --- | -------------------- |
  | `components/UI/GameCanvas.svelte` | ~5,444 | **Doubled since 06-16 (2,720 → 5,444) — the pause rationale has lapsed.** It was paused *until the overlay/ambient path was feature-complete (weather + fog)*; SEASONS_WEATHER shipped and is archived, so the render/input core refactor is unblocked by the original decision's own terms. ~20 leaf modules already extracted to `gameCanvas/` (panels as components: fuel/repair/storage/info/health/mood/stockpile/food-filter; `terrainPaint.ts` (the ADR-026 seam), `mainTileDeltas.ts`, `selectionCard.ts` (30k), `overlay.ts`…) — yet the core keeps outgrowing the extractions. Remaining shape unchanged: per-frame painters → stateful `OverlayRenderer`; camera → `camera.svelte.ts`; pointer/keyboard drag state-machines. Not mechanical. |
  | `components/UI/WorldEffectsLayer.svelte` | ~1,041 | New heavy (weather/ambient arc). Sits beside GameCanvas on the same render path — split along the same overlay seams when the GameCanvas refactor happens. |
  | `components/screens/CraftingScreen.svelte` | ~960 | Regrew (484 → 960) through the item-category/queue-lane rework. `SCREEN-REFACTORING` seams still apply. |

  Component 200-line cap: **41 components over** (was ~21 on 06-16). Next heaviest: BuildingMenu 661,
  ZonePanel 660, `+page.svelte` 614, ResourceSidebar 583, ActivityLogOverlay 573, CustomMapMenu 570,
  SelectedEntityCard 557, WeatherCanvas 520, AudioController 512. Split along existing seams opportunistically.

- [ ] **SC-1 · `sim-core/` leftover spike.** The rejected Rust-SoA evaluation (R1, 2026-06-15) still ships
  `bench.ts` + `simWorldView.ts` + the `sim-core-pkg` WASM artefacts in `src/lib` (and contributes a G-1 lint
  error). Decide: delete, or move out of `src/lib` into `desktop-spike/`-style quarantine.

## NT backlog (deferred — not Tier 0)

- [ ] **MOOD spec — death/kill mood effects.** The mood *infrastructure* shipped since 06-16 (mood
  conditions in `conditions.jsonc`, the amenity system `48196d02`, MOOD panel on the pawn card `9e8add2e`) —
  but there is still no grief/thrill-of-victory: companion death → strong negative mood; defeating a hostile →
  positive. Now likely just new entries in `conditions.jsonc` + two triggers. *Content/feature — defer per
  skateboard model.*
- [x] **Hit-accuracy rebalance** — resolved: melee accuracy now weighted 2× in hit rolls (`faad6cf0`),
  alongside the three-stat ranged rework (PER precision / DEX speed, `b5a07ee3`/`f81a0755`) and finesse
  weapons (`c65cb6c3`). Tuned together with the NT-3 speed change as intended.

_All carried-forward deferred items (D9.7/ADR-022, ADR-009 step 2, R11) and the physical-production follow-ups
shipped 2026-06-16 — see the [resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)._
