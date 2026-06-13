# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. Completed work — R1–R12, P-1/P-6/P-7,
PT-2/3/4, and the full PawnStateMachine decomposition — is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md). Gate at last update:
`check` 0 errors · `test` 153 · `lint` 0 · `build` ok.

---

## Structural debt (deferred by design — no big-bang)

- [ ] **P-2 · Engine↔store dual source of truth.** `processGameTurn` begins with
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

## Open playtest items

- [ ] **PT-1 · Hauling-to-stockpile "hang" — investigated; fix proposed, needs sign-off.**
  Pawns in `MovingToDeposit` target a stockpile **centre** tile they never stand on, then "deposit in
  place" 1–2 tiles short every run (`findNearestDepositPoint` returns the zone centre; the path ends
  short on an occupied/blocked tile; the `// Didn't quite make it` fallback fires). Reads as a stutter.
  Also a soft-queue hygiene smell (duplicate consecutive entries, stale refs). The sampled-log
  wall-clock gaps are **inconclusive** (possible compute stall, or just pause/low-speed) — no
  speculative perf fix on that alone.
  **Proposed (behavioural FSM change, needs sign-off):** `findNearestDepositPoint` returns the nearest
  **reachable, standable** stockpile/storage tile (or an adjacent free tile), not the centre; optionally
  dedupe consecutive identical soft-queue entries.

## Suggested sequencing

1. **Quick win:** PT-1 (pending sign-off) — reachable deposit tile so haulers stop depositing short.
2. **Before Living World:** P-2 (engine as sole writer) + P-3 (inject log sink) — large, no-functional-change inversions; verify in-browser (activity log / combat floaters / UI snapshot).
3. **Opportunistic (no big-bang):** P-4 god-file splits (GameCanvas, EntityService, Combat) along seams; P-4b Step 5 selection→services.
4. **Profiling-gated:** P-5 per-tick allocation — only when `__profOut` says so.
5. **Physical-production follow-ups** (ADR-016; spec archived at [PHYSICAL-PRODUCTION](.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md)): tool-gating step 2 (per-pawn inventory + `minTier` + craft-tool gating), per-stack craft quality on instances (R8), butchery multi-yield (content), passive-furnace flagging for forge/hearth.
