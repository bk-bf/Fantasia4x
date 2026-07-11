<!-- DRAFTED-JOB-ORDERS — expand the pawn world right-click menu so the player can force a single
     colony job (harvest/craft/build/demolish/repair…) or a need (consume/drink) on the clicked tile.
     Core force-a-job/need design locked with the user 2026-07-10; NOT yet built.
     2026-07-10 expansion (§8–§11, proposed — confirm before building): the same menu on a plain
     SELECTED (undrafted) pawn, a Shift-to-queue priority queue, and adjacency-tolerant pickup/equip. -->

# DRAFTED-JOB-ORDERS — Force a Job or Need from the Pawn Right-Click Menu

> **Related:** [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-017 jobs, ADR-016 physical production) · [ROADMAP](ROADMAP.md) · [ui/ARCHITECTURE](../../ui/ARCHITECTURE.md)

**Status:** ✅ **IMPLEMENTED 2026-07-11** (core §1–§7 + expansion §8–§11). `pnpm check` clean, ESLint
clean, all related tests green (+ new `sim/manualQueue.test.ts`, 7 tests). One pre-existing,
unrelated suite failure (`recipeService.test.ts` `green_firewood` data drift) is not from this work.

**Deviations from the written design** (drafted-skip forced them, all consistent with intent):

- **`forceConsume` / `drink` are FSM-driven / undrafted-only.** A drafted pawn has its `activeJob`
  nuked every tick ([PawnStateMachine.ts:1422](../../../src/lib/game/systems/PawnStateMachine.ts#L1422))
  and skips the behavioural FSM, so EATING/DRINKING can't progress while drafted. The menu therefore
  offers Eat/Drink only for an **undrafted** pawn (they route through `handleForcedConsume`/
  `handleForcedDrink` in the FSM). §3.3's drafted consume/drink executor arms were not built.
- **Haul-to-stockpile stays drafted-only** in the menu (an undrafted pawn already auto-hauls via the
  job pool, so a manual undrafted haul verb would be redundant; the FSM drops non-work manual orders).
- **Added a "Cancel order here" menu entry** when the tile carries a designation, so the old
  right-click-to-cancel gesture survives now that the force menu owns the click.

Original notes below (design of record).

**Status (original):** Core (§1–§7) design locked (2026-07-10). Expansion (§8–§11) proposed 2026-07-10:

- **§8 Menu without draft** — the same right-click verbs on a plain *selected* pawn, so you never draft just to hand it a job/need/gear; undrafted orders route through the FSM (survival needs still preempt).
- **§9 Shift-to-queue** — Shift while picking a verb appends to a per-pawn order queue instead of replacing, so several manual orders run in sequence.
- **§10 Adjacency pickup/equip** — being on a *neighbouring* tile is enough to pick up / equip a dropped item, instead of standing exactly on it.

---

## 1. The gap

A drafted pawn ignores the behavioural FSM entirely — [PawnStateMachine.ts:1109](../../../src/lib/game/systems/pawn/PawnStateMachine.ts#L1109) skips "auto combat-engage, exhaustion collapse, eat/sleep/work." Orders reach a drafted pawn through the `draftTarget` discriminated union ([entities.ts:319](../../../src/lib/game/core/types/entities.ts#L319)), and today that union only covers `move | attack | haul | equip | rescue | tend`. So while drafted, the player **cannot**:

- force a specific work job on a tile (harvest a marked tree, work a queued craft at its station, finish a construction site, demolish/repair a building);
- tell a pawn to eat a specific dropped consumable, or drink now.

The player wants the **existing world-target right-click menu** (the one that already offers equip / carry / tend when a drafted pawn is selected — [`handleContextMenu`](../../../src/lib/components/UI/GameCanvas.svelte#L4935)) to also surface these "force this task" verbs, driven by whatever is under the clicked tile.

## 2. Locked design decisions (2026-07-10 Q&A)

- [x] **Only pre-existing jobs are forceable.** Right-clicking a resource offers "force harvest" **only if the tile already carries a matching designation** (so a `harvest` `Job` already exists in `gs.jobs`). No auto-designate-on-right-click. Same for craft (order must be queued + supplied) and build (site must exist + be supplied). This keeps `forceJob` a pure *claim-and-work-an-existing-job* mechanism — no world mutation from the menu itself.
- [x] **One order = one job.** When the forced job **completes**, the head clears (the manual queue advances) and the pawn awaits the next order. No auto-chaining to the next nearby job.
- [x] **All verbs in the first cut**, via a single generic `forceJob` arm — because every work verb is already a data-driven `Job` (ADR-017), one mechanism covers harvest/chop/mine/forage, craft, build, demolish, repair uniformly. Needs (`consume`/`drink`) are separate arms since they don't flow through the Job system.
- [x] **Selection is not commitment** (UX rule): the menu entry only appears on right-click and only *arms* the order via the button; it does not auto-execute on hover/selection.

## 3. Architecture — one generic job arm + two need arms

Everything the player listed except *consume/drink* is already a colony **Job** ([jobs.jsonc](../../../src/lib/game/database/jobs.jsonc), 10 `JobDef`s). Jobs are generated from world state each turn and normally assigned by labor priority via `jobService.selectJobForPawn`. The force path bypasses priority: it **claims a specific, already-generated `Job` for the drafted pawn and advances it to completion inside the draft executor**.

There is deliberately **no** new "claim a job for a specific pawn on demand" API — the force case calls the existing `jobService.claimJob(pawnId, jobId, gs)` directly against a targeted `Job.id`, then drives `jobService.advanceJob` each tick (the drafted pawn does not run `handleWorking`, so the work loop lives in the draft executor — matching how every other non-combat draft case is hand-driven).

### 3.1 New `draftTarget` arms — [entities.ts:319](../../../src/lib/game/core/types/entities.ts#L319)

- [x] `| { type: 'forceJob'; jobId: string }` — harvest/woodcut/mine/forage, craft, construct, deconstruct, repair, refuel, plant, haul (any `Job.id`).
- [x] `| { type: 'forceConsume'; dropId: string; x: number; y: number }` — eat a specific edible dropped item.
- [x] `| { type: 'drink'; x: number; y: number }` — drink from the colony water source.

*(The union was extracted into a named `PawnOrder` type and reused for `manualQueue` — §9.)*

### 3.2 Menu discovery — [`handleContextMenu`](../../../src/lib/components/UI/GameCanvas.svelte#L4935), drafted-single-pawn branch

For the clicked tile `(x,y)`, assemble entries into the existing `equipMenu` popup:

- [x] **Jobs at tile.** Filter `gs.jobs` for entries whose target tile (`targetX/targetY` — craft jobs already target their station tile, ADR-016, so no `stationTileFor` lookup needed) equals `(x,y)`. Each renders a button labelled by `jobService.getJobLabel(type)` (`Harvest` / `Craft` / `Build` / `Demolish` / `Repair`…) → `forceJob`. Duplicate labels collapse. **Label via the JobDef, never the job id** (id-leak rule).
- [x] **Consumables at tile.** For each dropped item where [`isEdibleFood`](../../../src/lib/game/services/foodRules.ts#L41) is true, render "Eat *&lt;item name&gt;*" → `forceConsume` *(undrafted only — see Deviations)*.
- [x] **Water at tile.** If the tile is water (`type === 'water'` / river / lake), render "Drink" → `drink` *(undrafted only)*.
- [x] No matching job/consumable/water at the tile → no new entry (menu falls through to the existing equip/haul/rescue/tend behaviour, and for an undrafted pawn to designation-cancel).

The `setPawnDraftTarget` command ([commands.ts:190](../../../src/lib/game/sim/commands.ts#L190)) already passes any `draftTarget` through unchanged — no command-layer change needed.

### 3.3 Executor cases — [`_processDraftOrders`](../../../src/lib/game/systems/GameEngineImpl.ts#L876)

New `else if` branches on `pawn.draftTarget.type`, following the `rescue`/`tend` template (resolve target → gone? clear : walk via [`_draftWalk`](../../../src/lib/game/systems/GameEngineImpl.ts#L1247) → on adjacency, act):

- [x] **`forceJob`** — resolve `gs.jobs` by `jobId`; if the job is gone (completed/cancelled) → advance the queue. Walk to the job's target tile with `_draftWalk` (routes to an adjacent approach tile — correct for unwalkable resource/building targets). On adjacency: `jobService.claimJob(pawn.id, jobId, gs)`, then advance via the **shared work helper** `advanceJobOneTick` (§3.4) each tick. When `advanceJob` reports completion → advance the queue (one order = one job).
- [~] **`forceConsume`** — **deviated: built in the FSM, not the drafted executor** ([`handleForcedConsume`](../../../src/lib/game/systems/pawn/handlers/needs.ts)). A drafted pawn can't run EATING (activeJob is cleared every tick, §Deviations), so this is undrafted-only: walk to `(x,y)`, grab the specific drop, `startEatingFromInventory`, and advance the queue.
- [~] **`drink`** — **deviated: FSM `handleForcedDrink`, undrafted-only** (same reason). Walk to the water tile; on adjacency `handleDrinking` and advance the queue.

### 3.4 Shared work-advance helper — [handlers/work.ts:448](../../../src/lib/game/systems/pawn/handlers/work.ts#L448)

- [x] Extracted the work-advance core from `handleWorking` — the `getWorkModifiers` → `workSpeedMult` → `perTick(workPoints)` → `advanceJob` sequence — into `advanceJobOneTick(pawn, job, jobId, gs)` (exported from `handlers/work.ts`), shared by the drafted `forceJob` executor and `handleWorking`. Pure refactor; the normal path's behaviour is unchanged.

## 4. Files touched

| File | Change |
| --- | --- |
| [core/types/entities.ts](../../../src/lib/game/core/types/entities.ts#L319) | 3 new `draftTarget` union arms |
| [components/UI/GameCanvas.svelte](../../../src/lib/components/UI/GameCanvas.svelte#L4935) | `handleContextMenu`: discover jobs/consumables/water at tile, add menu entries |
| [systems/GameEngineImpl.ts](../../../src/lib/game/systems/GameEngineImpl.ts#L876) | `_processDraftOrders`: `forceJob` / `forceConsume` / `drink` cases |
| [systems/pawn/handlers/work.ts](../../../src/lib/game/systems/pawn/handlers/work.ts#L448) | extract shared work-advance helper (no behaviour change to FSM path) |

No new service, no new `JobDef`, no command-layer change, no ADR (uses the existing draft-order + Job seams).

## 5. Reused machinery (no new subsystems)

| Need | Existing hook | File |
| --- | --- | --- |
| pass `draftTarget` through unchanged | `setPawnDraftTarget` command | [commands.ts:190](../../../src/lib/game/sim/commands.ts#L190) |
| walk to an adjacent approach tile then act | `_draftWalk` → `tryAssignPath` | [GameEngineImpl.ts:1247](../../../src/lib/game/systems/GameEngineImpl.ts#L1247) |
| claim a specific job for this pawn | `jobService.claimJob` / `releaseJob` | [JobService.ts:168](../../../src/lib/game/services/JobService.ts#L168) |
| advance + auto-complete a job | `jobService.advanceJob` → registered `complete` | [JobService.ts:191](../../../src/lib/game/services/JobService.ts#L191) |
| craft station tile for a queued order | `stationTileFor` | [services/jobs/staging.ts](../../../src/lib/game/services/jobs/staging.ts) |
| is an item edible (menu gate) | `isEdibleFood` | [foodRules.ts:41](../../../src/lib/game/services/foodRules.ts#L41) |
| grab a dropped food into the pack | `grabFoodAt` | [handlers/needs.ts:119](../../../src/lib/game/systems/pawn/handlers/needs.ts#L119) |
| start eating a carried meal | `startEatingFromInventory` | [handlers/needs.ts:70](../../../src/lib/game/systems/pawn/handlers/needs.ts#L70) |
| drink from colony water | `handleDrinking` | [handlers/needs.ts:200](../../../src/lib/game/systems/pawn/handlers/needs.ts#L200) |
| adjacency test | `isAdjacent` | GameEngineImpl draft cases (1139/1212) |

## 6. Open edge cases (resolve during build)

- [x] **Job claimed by another pawn / already completed mid-walk** — undrafted `handleIdle` only pins a job that is unclaimed or already this pawn's; otherwise it drops the order. Drafted `dropOrder` releases + advances. `claimJob` is idempotent for the same pawn.
- [x] **Not supplied yet** — a `craft`/`construct` job only exists once supplied. Because we only offer *existing* jobs, an unsupplied station simply produces no menu entry (consistent with decision §2).
- [x] **Tool-gated jobs** — the forced pawn **auto-detours to grab a tool** if one exists in stock (the normal `toolFetch` path runs for the pinned job); if NO tool exists anywhere, the order is dropped (no infinite claim/release loop). Undrafted resolved in `handleIdle`.
- [x] **Undrafting mid-force** — `toggleDraft`/`draftPawns` clear the manual queue; a mid-flight forced job is released back to the pool (drafted release via the state machine each tick; cancel/replace via the command; in-progress preempt via `handleWorking`).

## 7. Acceptance criteria

- [x] Drafting a pawn and right-clicking a **designated** resource tile offers a "Harvest" entry; pressing it walks the pawn over and fells/mines it to completion, then clears the order.
- [x] Right-clicking a **workbench with a supplied queued craft** offers "Craft"; the pawn works that order at its station.
- [x] Right-clicking an **unfinished, supplied construction site** offers "Build"; the pawn completes it. Demolish/repair likewise when those jobs exist.
- [x] Right-clicking a tile with an **edible dropped item** offers "Eat *&lt;name&gt;*"; the pawn walks over, picks it up, and eats it regardless of hunger level. *(Undrafted only — see Deviations.)*
- [x] Right-clicking a **water tile** offers "Drink"; the pawn drinks. *(Undrafted only.)*
- [x] Every menu label is a human `JobDef`/item name — **no raw ids** leak.
- [x] Undrafting a pawn mid-force releases its claimed job back to the pool (drafted release via the state machine; cancel/replace/undraft release via the command).
- [x] `pnpm check` clean; `pnpm test:related` on the touched files green.

---

# EXPANSION (2026-07-10) — Menu-without-draft, Shift-queue, Adjacency pickup

> Proposed 2026-07-10, **confirm before building.** Three additions the player asked for. §8 and §9 are
> intertwined (both hang off a per-pawn *order queue*); §10 is an independent localised gate relax.

## 8. Menu without draft — force a job/need/gear on a plain SELECTED pawn

**The gap this closes:** today the "force this task" verbs only appear when the selected pawn is
*drafted* — the whole equip/haul/consume/move block is gated behind `if (selectedPawn?.drafted)`
([GameCanvas.svelte:4961](../../../src/lib/components/UI/GameCanvas.svelte#L4961)). So to hand a pawn
one manual job you must draft it (which also rips it out of the autonomous FSM — no auto-eat/sleep,
combat engage, etc.). The player wants to select a pawn and assign work/task/need/gear **without
drafting**, leaving it otherwise autonomous.

### 8.1 Two execution paths, one menu

The menu is identical; **who runs the order differs by `pawn.drafted`**:

| | Drafted pawn | Selected (undrafted) pawn |
| --- | --- | --- |
| Executor | `_processDraftOrders` (hand-driven, §3.3) | the **FSM** — [`handleIdle`](../../../src/lib/game/systems/pawn/handlers/work.ts#L137) |
| Autonomy | fully suppressed (skips the behavioural state machine, [PawnStateMachine.ts:1525](../../../src/lib/game/systems/PawnStateMachine.ts#L1525)) | **preserved** — survival needs, combat interrupt, collapse still fire |
| `forceJob` mechanism | claim + drive the shared work-advance helper (§3.4) tick-by-tick | just **claim that `job.id` in `handleIdle` instead of `selectJobForPawn`** → the normal MovingToResource→Working→complete path runs it; no hand-driven loop |

- [x] **Ungate the menu.** [`handleContextMenu`](../../../src/lib/components/UI/GameCanvas.svelte) opens the force-a-task verb set for **any** selected pawn. A drafted pawn additionally keeps its move/attack/haul verbs; an undrafted pawn's menu is the forceJob/eat/drink/equip/pick-up subset (no move/attack).
- [x] **Undrafted execution lives in the FSM.** The forced order is honoured inside [`handleIdle`](../../../src/lib/game/systems/pawn/handlers/work.ts) **after** `selectIdleNeed` (survival first) and **before** `selectJobForPawn` (beats autonomous labor priority); it also overrides work-zone confinement.
- [x] **`forceJob` (undrafted)** — `handleIdle` pins the specific claimable job as `forcedJob` (skipping `selectJobForPawn`) and falls into the existing claim→`activeJob`→MovingToResource path; the **normal FSM work loop** runs and completes it, then `advancePawnOrders` drains the queue.
- [x] **`forceConsume` / `drink` (undrafted)** — bypass the hunger/thirst gate via `handleForcedConsume`/`handleForcedDrink` (walk with a `targetState: IDLE` need so arrival re-enters `handleIdle`, then grab+eat / drink). *(Undrafted-only — the drafted executor arms of §3.3 were not built; see Deviations.)*
- [x] **Interrupt semantics — preempt immediately.** In `handleWorking`, a pawn whose manual-queue head isn't the forced job it's on releases the active job and drops to Idle, so `handleIdle` picks up the order next tick. A survival need still outranks even a manual order.
- [x] **Clearing an undrafted order.** `setPawnDraftTarget` with `target: null` drops all orders, idles the pawn, and releases any force-claimed job; a "Cancel order here" menu entry cancels a tile designation.

## 9. Shift-to-queue — a manual priority queue

**The gap:** one manual order at a time — assign, wait for completion, assign the next. The player wants
to **Shift+pick several verbs in sequence** and have the pawn run them front-to-back.

- [x] **Two queues, manual over automatic** (locked 2026-07-11). Model the pawn's work intent as **two queues that reuse the existing order schema** — no new element type, no `draftTarget` head/tail split:
  - **Manual queue** — new `pawn.manualQueue?: PawnOrder[]` (FIFO), where `PawnOrder` is the existing `draftTarget` union (§3.1). Holds player-forced orders. Its **head is the active order** — `draftTarget` becomes `manualQueue[0]` (keep the `draftTarget` name as the head accessor so the renderer at [GameCanvas.svelte:1911](../../../src/lib/components/UI/GameCanvas.svelte#L1911) and the drafted executor read it unchanged).
  - **Automatic queue** — the pawn's **existing** autonomous pipeline (`selectJobForPawn` + the `pawn.jobQueue` soft-preview, [work.ts:191](../../../src/lib/game/systems/pawn/handlers/work.ts#L191)). Not a new field — this already *is* the automatic queue.
  - **Precedence:** the manual queue **always wins**. `handleIdle` runs `manualQueue[0]` if present; **only when the manual queue is empty is it skipped** and the automatic pipeline chosen. (For a *drafted* pawn the automatic queue is suppressed entirely, so only the manual queue exists — `_processDraftOrders` drives `manualQueue[0]`.) This is the same two-tier precedence for drafted and undrafted; only whether the automatic tier exists differs.
- [x] **Menu gesture.** A verb clicked **without Shift** → *replace*: clear `manualQueue`, set the head. **With Shift held** → *append* to the tail. The `run()` closures capture `e.shiftKey` at menu-open and pass `append`. (Attack/move never queue.)
- [x] **Command layer.** [`setPawnDraftTarget`](../../../src/lib/game/sim/commands.ts) payload gained `append?: boolean` (Shift ⇒ true): append pushes onto `manualQueue`; a plain set clears the queue + sets the head; `null` clears everything and releases the claim. No new command.
- [x] **Drain on completion.** One `advancePawnOrders(pawn)` helper (in `pawnHelpers`, mutates in place) for the FSM, and an immutable `popOrder(pawn)` patch for the drafted executor; every order-clear point (haul/equip/rescue/tend/move/attack + forceJob-complete + undrafted `handleWorking`) now advances the queue.
- [x] **Consistent with §2 "no auto-chaining".** The queue is *manual* — completing one order only advances to the next **player-queued** entry, never an auto-grabbed nearby job.
- [ ] **Renderer (optional, SKIPPED).** The on-map order line still draws only `draftTarget` for drafted pawns; the faint queued-tail chaining was left for later (explicitly "not required for the mechanic").

## 10. Adjacency-tolerant pickup / equip

**The gap:** picking up or equipping a dropped item requires standing **exactly on** its tile, so the pawn
squeezes onto the item; the player wants an **adjacent** tile to suffice.

Most of the codebase already tolerates adjacency — `pickUpFromTile` grabs from the *target* tile
regardless of where the pawn stands ([pawnHauling.ts:65](../../../src/lib/game/systems/pawn/pawnHauling.ts#L65)),
and the FSM eat path already accepts `isAdjacent || same tile`
([needs.ts:331-332](../../../src/lib/game/systems/pawn/handlers/needs.ts#L331)). The exact-tile
requirement survives only in the **drafted executor's** haul/equip arms:

- [x] **Haul pickup gate** — relaxed to `isAdjacent(pawn, target) || same tile`; `pickUpFromTile` pulls from the target tile (radius 0), so an adjacent pawn takes exactly that stack — no over-grab of neighbouring stacks.
- [x] **Equip gate** — same relax; `equipDropToPawn`/`carryDropToInventory` act on `dropId` regardless of pawn position.
- [x] **Stop the walk at adjacency.** Both the drafted haul and equip approaches now use `_draftWalk` (adjacent-approach routing) so the pawn halts beside the item instead of squeezing onto it.
- [x] **Audit the instant pickup command.** Confirmed [`pickUpItemFromTile`](../../../src/lib/game/sim/commands.ts) already teleport-picks from the drop tile regardless of position — no gate to relax. The FSM eat path was already adjacency-tolerant.

## 11. Expansion — files touched & acceptance

| File | Change (expansion) |
| --- | --- |
| [core/types/entities.ts](../../../src/lib/game/core/types/entities.ts#L394) | `pawn.manualQueue?: PawnOrder[]` (manual queue; head = `draftTarget`); `PawnOrder` alias for the order union |
| [components/UI/GameCanvas.svelte](../../../src/lib/components/UI/GameCanvas.svelte#L4961) | ungate the verb menu for undrafted selection; Shift ⇒ append; optional queued-order overlay |
| [sim/commands.ts](../../../src/lib/game/sim/commands.ts#L190) | `setPawnDraftTarget` payload gains `append?: boolean` |
| [systems/pawn/handlers/work.ts](../../../src/lib/game/systems/pawn/handlers/work.ts#L137) | `handleIdle`: run `manualQueue[0]` before the automatic `selectJobForPawn` tier; preempt a mismatched `activeJob` immediately |
| [systems/pawn/handlers/needs.ts](../../../src/lib/game/systems/pawn/handlers/needs.ts#L121) | forced consume/drink bypass the hunger/thirst gate when invoked as an order |
| [systems/GameEngineImpl.ts](../../../src/lib/game/systems/GameEngineImpl.ts#L1056) | relax haul/equip pickup gates to adjacency; shared `advancePawnOrders` on completion |

**Expansion acceptance criteria:**

- [x] Selecting an **undrafted** pawn and right-clicking a designated resource / supplied craft / build site / edible drop / water tile offers the same verbs a drafted pawn gets (minus move/attack) — **without drafting**.
- [x] The undrafted pawn walks over and completes the forced job through the normal FSM work loop (`handleIdle` pins the forced job before `selectJobForPawn`), then returns to autonomous work; a critical hunger/fatigue/threat still **interrupts** the forced order (survival needs sit above it) and it resumes afterwards.
- [x] **Shift+picking** several verbs queues them (`manualQueue`); the pawn runs them in order, draining one per completion (`advancePawnOrders`). A plain pick **replaces** the queue.
- [x] Shift-queue works for both drafted (executor drains via `popOrder`) and undrafted (FSM drains via `advancePawnOrders`) pawns.
- [x] A pawn standing on **any tile adjacent to** a dropped item can pick it up / equip it — the drafted haul/equip gates relax to `isAdjacent` and stop the walk at an approach tile (the FSM eat path already tolerated adjacency).
- [x] Cancelling (`target: null`) or replacing an undrafted order releases any force-claimed job back to the pool (command) — and the in-progress case is also released by `handleWorking`'s preempt.
- [x] `pnpm check` clean; ESLint clean; full suite green apart from one pre-existing, unrelated `recipeService` data-drift failure; new `sim/manualQueue.test.ts` (7 tests) green.
