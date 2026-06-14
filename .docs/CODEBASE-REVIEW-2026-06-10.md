# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. Completed work — R1–R12, P-1/P-6/P-7,
PT-2/3/4, and the full PawnStateMachine decomposition — is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md). Gate at last update:
`check` 0 errors · `test` 153 · `lint` 0 · `build` ok.

---

## Structural debt (deferred by design — no big-bang)

- [x] **P-2 · Engine↔store dual source of truth.** `processGameTurn` begins with
  `this.gameState = { ...get(gameState) }` and ends with `pushFromEngine`; `getGameState()`
  deep-clones via `JSON.parse(JSON.stringify())` over a 240×160 map. The store-side throttled-notify
  is good; the read-back each tick is the inversion. Target: engine is the only writer, user actions
  become commands. Large, no functional change — do before the Living World layer adds per-tick state.
- [ ] **P-3 · Services importing Svelte stores.** `PawnStateMachine`(now `pawn/*`), `EntityService`,
  `Combat` import `stores/Log` / `stores/combatFeedback`. Inject a log/feedback sink instead. Most
  log calls live in the `combat`/`work` handlers, so the sink interface drops in cleanly.
- [ ] **P-4 · God files (remaining).** PawnStateMachine is done (see archive). Still oversized:

  | File | LOC |
  | ---- | --- |
  | `components/UI/GameCanvas.svelte` | 3,321 — 16× the 200-line cap; also drives the sim clock |
  | `services/EntityService.ts` | 2,015 — spawning + AI + movement + hunger + corpse lifecycle |
  | `systems/Combat.ts` | 1,419 |
  | `core/types.ts` | 1,387 |
  | `services/JobService.ts` | 1,152 — fuel/refuel logic could move to BuildingService |

  Plus 20 components over the 200-line cap (BuildingMenu 515, ActivityLogOverlay 525, CraftingScreen
  476…). Split along existing seams opportunistically. Optional: sub-split the 788-LOC `pawnHelpers.ts`
  (movement / finders / need-distance / hunt) — no longer a god-module, low priority.
- [ ] **P-4b · PawnStateMachine Step 5 — push selection into services.** `handleIdle` and
  `checkNeedInterrupts` still make the "what should this pawn do next" decision inline. Move job
  selection into `JobService` and need-target selection into `PawnService`, leaving the handlers to
  *apply* a decision. The deepest, still-deferred part of the hotspot decomposition.
- [ ] **P-5 · Per-tick allocation churn.** Index-once/update-once tick rewrite undone; per-pawn-per-tick
  scans added since (`findCombatThreat` over all mobs; `occupancyService.blockedTiles` rebuilt per
  pathfind; `findNearestRestBuilding` scans pawns×buildings). Profiling-gated — don't touch until
  `__profOut` says so; but no new system should add full-array `pawns.map(...)` writes for single-pawn
  updates.

## Carried-forward deferred (unchanged status)

- [ ] **D9.1 / D9.6 / D9.7** — index-once tick, deep-clone removal (tied to P-2), event-driven job generation. Profiling-gated.
- [ ] **D-perf** — cooldown index for regrowth, tick strides, incremental job board.
- [ ] **D-bills** — `productionTargets` exists in state with nothing driving it.
- [ ] **ADR-009 step 2** — per-pawn claimed-inventory tool gating (R4 was step 1).
- [ ] **R11 remainder — Events phase.** ARCHITECTURE's turn order no longer lists it, but
  `core/Events.ts` (~hundreds of lines, ADR-006) is still fully unwired — either wire it or cut it.

## Tier 0 — broken-loop bugs ✅ DONE 2026-06-14

Sourced from playtest + `game/NOTES.md`. Made the *existing* combat/survival/production slice
visibly broken; all small. Shipped 2026-06-14 — gates: `check` 0 · `test` 162 · `lint` 0 · `build` ok.

- [x] **NT-1 · Trait cards leak `Efficiency: [object Object]`.** Root cause: `PawnTraits`/`RaceScreen`
  only special-cased the literal keys `workSpeed/workYield/workQuality`; a work-mult map under any other
  key (legacy persisted `workEfficiency`) fell to the neutral branch and `formatEffectValue` stringified
  the object. Fix: both renderers now handle **any object-valued effect** generically via a shared
  `workAxisLabel(key)`, and `formatEffectValue` formats objects as a `%` list (never `[object Object]`).
- [x] **NT-2 · Death not finalised — pawn lingered in UI.** Combat killed pawns by setting
  `isAlive=false` directly, **bypassing `killPawn`** (no corpse/gear/`deadPawns`/mood). Added
  `reapDeadPawns(state)` — an end-of-turn reaper (in `processGameTurn` after combat) that finalises any
  un-flagged dead pawn (`corpseDropped` marker) and **removes all dead pawns from `pawns[]`** so they
  leave every UI list. `PawnScreen` falls back to the first living pawn when its selection is reaped.
  Corpse swap (`pawn_carcass`) was already in `killPawn` (R10). Tests in `deathDrops.test.ts`.
- [x] **NT-3 · Combat + infection too fast.** Attack interval `BASE_ATTACK_INTERVAL_TICKS` 30→60
  (+ floor 18→`MIN_ATTACK_INTERVAL_TICKS` 36) — halves all pawn/mob attack speed. Infection:
  `infectionRiskPerWound` 0.0012→0.0004 **and** a new `infectionRiskMaxPerTick` 0.0008 cap so many
  combat wounds can't stack into a near-instant lethal infection (the "died mid-combat" report).
  *(Follow-up: hit-accuracy rebalance now that swings are slower — NT backlog.)*
- [x] **NT-4 · Drafted pawn auto-engages adjacent hostile.** **Decision: auto-attack** (not
  click-to-target). A drafted pawn with no explicit `attack` order now swings at the nearest adjacent
  hostile (new `else if (pawn.drafted)` branch in the Combat pawn-attack loop) — walk a drafted pawn up
  to an enemy and it fights instead of standing inert. Test in `combatSim.test.ts`.
- [x] **PT-1 · Hauling deposited short ("hang").** `findNearestDepositPoint` now returns the nearest
  **standable** tile (walkable + unoccupied via `occupancyService.isBlocked`) — the zone tile itself for
  a stockpile, an adjacent free tile for a building — instead of the nearest-by-distance tile the pawn
  couldn't stand on. Falls back to deposit-in-place only when nothing in the tier is standable. Soft-queue
  preview deduped. Tests in `pawn/depositPoint.test.ts`.

## Tier 0 UI polish (from NOTES — cheap, opportunistic)

- [ ] **NT-U1 · Toggleable health panel** in the info panel showing only damaged limbs/wounds; "no damage"
  when all healthy.
- [ ] **NT-U2 · Info-panel buttons** moved adjacent (right) and outside the panel.
- [ ] **NT-U3 · Fixed-width info-panel skeleton** so long descriptions wrap instead of stretching the
  panel across the viewport; unify panel width across all object types.
- [x] **NT-U4 · Draft target line draws while paused** (currently only renders after unpausing).

## NT backlog (deferred — not Tier 0)

- [ ] **MOOD spec** — companion death → strong negative mood; defeating a hostile → positive mood;
  consider a `mood.jsonc` to centralise mood effects. *Content/feature — defer per skateboard model.*
- [ ] **Hit-accuracy rebalance** — after NT-3 speed halving, cross-reference combat logs vs entity stats;
  likely buff accuracy. Do *after* the speed change so they're tuned together.
- [ ] **Entity stamina / breaks** — give mobs stamina + forced rests like pawns. Needs investigation.

## Tier 1 / Tier 2 (after Tier 0)

- **Tier 1 — before Living World:** P-2 (engine as sole writer) + P-3 (inject log sink) — large,
  no-functional-change inversions; verify in-browser (activity log / combat floaters / UI snapshot).
  Gate Living World on these (it adds per-tick state).
- **Tier 2 — next feature:** Living World B–D (seasons / weather / fog) — ROADMAP Wave 6.

## Suggested sequencing

1. **Tier 0 now:** NT-1 → NT-2 → NT-3 → PT-1 → NT-4 (+ UI polish NT-U* opportunistically).
2. **Tier 1 (before Living World):** P-2 + P-3 inversions.
3. **Tier 2:** Living World B–D.
4. **Opportunistic (no big-bang):** P-4 god-file splits (GameCanvas, EntityService, Combat) along seams; P-4b Step 5 selection→services.
5. **Profiling-gated:** P-5 per-tick allocation — only when `__profOut` says so.
6. **Physical-production follow-ups** (ADR-016; spec archived at [PHYSICAL-PRODUCTION](.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md)): tool-gating step 2 (per-pawn inventory + `minTier` + craft-tool gating), per-stack craft quality on instances (R8), butchery multi-yield (content), passive-furnace flagging for forge/hearth.
