<!-- DRAFTED-JOB-ORDERS — expand the pawn world right-click menu so the player can force a single
     colony job (harvest/craft/build/demolish/repair…) or a need (consume/drink) on the clicked tile.
     Core force-a-job/need design locked with the user 2026-07-10; NOT yet built.
     2026-07-10 expansion (§8–§11, proposed — confirm before building): the same menu on a plain
     SELECTED (undrafted) pawn, a Shift-to-queue priority queue, and adjacency-tolerant pickup/equip. -->

# DRAFTED-JOB-ORDERS — Force a Job or Need from the Pawn Right-Click Menu

> **Related:** [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-017 jobs, ADR-016 physical production) · [ROADMAP](ROADMAP.md) · [ui/ARCHITECTURE](../../ui/ARCHITECTURE.md)

**Status:** Core (§1–§7) design locked (2026-07-10), unimplemented. Expansion (§8–§11) proposed 2026-07-10, pending confirmation:

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

- [ ] **Only pre-existing jobs are forceable.** Right-clicking a resource offers "force harvest" **only if the tile already carries a matching designation** (so a `harvest` `Job` already exists in `gs.jobs`). No auto-designate-on-right-click. Same for craft (order must be queued + supplied) and build (site must exist + be supplied). This keeps `forceJob` a pure *claim-and-work-an-existing-job* mechanism — no world mutation from the menu itself.
- [ ] **One order = one job.** When the forced job **completes**, `draftTarget` clears and the pawn stays drafted and idle awaiting the next order (same lifecycle as `rescue`). No auto-chaining to the next nearby job.
- [ ] **All verbs in the first cut**, via a single generic `forceJob` arm — because every work verb is already a data-driven `Job` (ADR-017), one mechanism covers harvest/chop/mine/forage, craft, build, demolish, repair uniformly. Needs (`consume`/`drink`) are separate arms since they don't flow through the Job system.
- [ ] **Selection is not commitment** (UX rule): the menu entry only appears on right-click and only *arms* the order via the button; it does not auto-execute on hover/selection.

## 3. Architecture — one generic job arm + two need arms

Everything the player listed except *consume/drink* is already a colony **Job** ([jobs.jsonc](../../../src/lib/game/database/jobs.jsonc), 10 `JobDef`s). Jobs are generated from world state each turn and normally assigned by labor priority via `jobService.selectJobForPawn`. The force path bypasses priority: it **claims a specific, already-generated `Job` for the drafted pawn and advances it to completion inside the draft executor**.

There is deliberately **no** new "claim a job for a specific pawn on demand" API — the force case calls the existing `jobService.claimJob(pawnId, jobId, gs)` directly against a targeted `Job.id`, then drives `jobService.advanceJob` each tick (the drafted pawn does not run `handleWorking`, so the work loop lives in the draft executor — matching how every other non-combat draft case is hand-driven).

### 3.1 New `draftTarget` arms — [entities.ts:319](../../../src/lib/game/core/types/entities.ts#L319)

- [ ] `| { type: 'forceJob'; jobId: string }` — harvest/woodcut/mine/forage, craft, construct, deconstruct, repair, refuel, plant, haul (any `Job.id`).
- [ ] `| { type: 'forceConsume'; dropId: string; x: number; y: number }` — eat a specific edible dropped item.
- [ ] `| { type: 'drink'; x: number; y: number }` — drink from the colony water source.

### 3.2 Menu discovery — [`handleContextMenu`](../../../src/lib/components/UI/GameCanvas.svelte#L4935), drafted-single-pawn branch

For the clicked tile `(x,y)`, assemble entries into the existing `equipMenu` popup:

- [ ] **Jobs at tile.** Filter `gs.jobs` for entries whose target tile (`targetX/targetY`, or station tile via [`stationTileFor`](../../../src/lib/game/services/jobs/staging.ts) for `craft`) equals `(x,y)`. For each, render a button labelled by the `JobDef` (`Harvest` / `Craft` / `Build` / `Demolish` / `Repair`…) → `setPawnDraftTarget({ type: 'forceJob', jobId })`. **Label via the JobDef, never the job id** (id-leak rule).
- [ ] **Consumables at tile.** For each `gs.droppedItems` at `(x,y)` where [`isEdibleFood`](../../../src/lib/game/services/foodRules.ts#L41) is true, render "Consume *&lt;item name&gt;*" → `forceConsume`.
- [ ] **Water at tile.** If the tile is a water source, render "Drink" → `drink`.
- [ ] No matching job/consumable/water at the tile → no new entry (menu falls through to the existing equip/haul/rescue/tend behaviour).

The `setPawnDraftTarget` command ([commands.ts:190](../../../src/lib/game/sim/commands.ts#L190)) already passes any `draftTarget` through unchanged — no command-layer change needed.

### 3.3 Executor cases — [`_processDraftOrders`](../../../src/lib/game/systems/GameEngineImpl.ts#L876)

New `else if` branches on `pawn.draftTarget.type`, following the `rescue`/`tend` template (resolve target → gone? clear : walk via [`_draftWalk`](../../../src/lib/game/systems/GameEngineImpl.ts#L1247) → on adjacency, act):

- [ ] **`forceJob`** — resolve `gs.jobs` by `jobId`; if the job is gone (completed/cancelled) → clear `draftTarget`. Walk to the job's target tile with `_draftWalk` (routes to an adjacent approach tile — correct for unwalkable resource/building targets). On adjacency: `jobService.claimJob(pawn.id, jobId, gs)`, then advance via the **shared work helper** (§3.4) each tick. When `advanceJob` reports completion → **clear `draftTarget`** (one order = one job).
- [ ] **`forceConsume`** — resolve the drop by `dropId`; walk to `(x,y)` (equip template); on arrival [`grabFoodAt`](../../../src/lib/game/systems/pawn/handlers/needs.ts#L119) the item into the pack, then [`startEatingFromInventory`](../../../src/lib/game/systems/pawn/handlers/needs.ts#L70) with that single item as the meal; clear `draftTarget`.
- [ ] **`drink`** — walk to the water tile; on arrival call [`handleDrinking`](../../../src/lib/game/systems/pawn/handlers/needs.ts#L200) (consumes one unit of `gs.stockpile['water']`, spreads thirst relief); clear `draftTarget`.

### 3.4 Shared work-advance helper — [handlers/work.ts:448](../../../src/lib/game/systems/pawn/handlers/work.ts#L448)

- [ ] Extract the work-advance core from `handleWorking` — the `pawnStatService.getWorkModifiers` → `workSpeedMult` → `perTick(workPoints)` → `jobService.advanceJob(jobId, points, gs)` sequence — into a reusable helper so the drafted `forceJob` case and the normal FSM path share **one** implementation instead of duplicating work-speed math. This is the only change to the FSM work path; behaviour of the normal path must be unchanged.

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

- [ ] **Job claimed by another pawn / already completed mid-walk** — on arrival, if `claimJob` finds the job gone or claimed by someone else, clear `draftTarget` (don't steal). `claimJob` is idempotent for the same pawn.
- [ ] **Not supplied yet** — a `craft`/`construct` job only exists once `orderSupplied`/`buildingSupplied`. Because we only offer *existing* jobs, an unsupplied station simply produces no menu entry (consistent with decision §2).
- [ ] **Tool-gated jobs** (`harvest`→`harvestTool`, `craft`→`craftTool`): decide whether a forced pawn auto-detours to grab a tool (as `handleIdle`'s `toolFetch` does) or the order no-ops without the tool. Lean: no-op + surface a brief notice, since draft is a manual/immediate context.
- [ ] **Undrafting mid-job** — releasing draft must `releaseJob` any job this pawn force-claimed so it returns to the normal pool.

## 7. Acceptance criteria

- [ ] Drafting a pawn and right-clicking a **designated** resource tile offers a "Harvest/Chop/Mine/Forage" entry; pressing it walks the pawn over and fells/mines it to completion, then clears the order.
- [ ] Right-clicking a **workbench with a supplied queued craft** offers "Craft"; the pawn works that order at its station.
- [ ] Right-clicking an **unfinished, supplied construction site** offers "Build"; the pawn completes it. Demolish/repair likewise when those jobs exist.
- [ ] Right-clicking a tile with an **edible dropped item** offers "Consume *&lt;name&gt;*"; the pawn walks over, picks it up, and eats it regardless of hunger level.
- [ ] Right-clicking a **water tile** offers "Drink"; the pawn drinks.
- [ ] Every menu label is a human `JobDef`/item name — **no raw ids** leak.
- [ ] Undrafting a pawn mid-force releases its claimed job back to the pool.
- [ ] `pnpm check` clean; `pnpm test:related` on the four touched files green.

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

- [ ] **Ungate the menu.** In [`handleContextMenu`](../../../src/lib/components/UI/GameCanvas.svelte#L4884), open the force-a-task verb set for **any** selected pawn, not only a drafted one. A drafted pawn additionally keeps its move/attack-order verbs; an undrafted pawn's menu is the work/craft/build/consume/drink/equip/haul subset (no "Move here" / attack — those stay draft-only, since ordering an autonomous pawn to walk somewhere-and-then-wander is meaningless).
- [ ] **Undrafted execution lives in the FSM, not the draft executor.** The forced order is honoured inside [`handleIdle`](../../../src/lib/game/systems/pawn/handlers/work.ts#L137) at the natural priority slot: **after** `selectIdleNeed` (line 140 — a starving/exhausted/threatened pawn still eats/sleeps/flees first, then resumes the order) and **before** `selectJobForPawn` (line 191 — the manual order beats autonomous labor priority).
- [ ] **`forceJob` (undrafted)** — when the order head is a `forceJob`, `handleIdle` calls `jobService.claimJob(pawn.id, order.jobId, gs)` for that specific id (skipping `selectJobForPawn`) and falls into the existing claim→`activeJob`→MovingToResource path. The pawn walks, works, and completes it through **the normal FSM work loop** — §3.4's shared helper is a *drafted-only* need. On completion the queue drains (§9).
- [ ] **`forceConsume` / `drink` (undrafted)** — these bypass the hunger/thirst gate (the pawn may be forced to eat/drink while not needy). `handleIdle` sees the order head and routes to the **same** `grabFoodAt`+`startEatingFromInventory` / `handleDrinking` helpers the drafted arms use (§3.3), just invoked from the FSM instead of `_processDraftOrders`. So consume/drink logic is shared across the two executors; only `forceJob` diverges.
- [ ] **Interrupt semantics.** A forced order issued to a pawn that is **already working** an autonomous job must preempt it: at the top of the tick (or in `handleWorking`), a pawn whose order head doesn't match its `activeJob` releases the active job (`releaseJob`) and drops to Idle, so `handleIdle` picks up the forced order next tick. *Decision to confirm:* preempt-immediately (recommended — the player issued a manual override) vs finish-current-then-switch.
- [ ] **Clearing an undrafted order.** Since there's no undraft gesture, the menu needs a **Cancel order** entry (and/or re-issuing replaces it — §9 plain-click semantics). Clearing must `releaseJob` any force-claimed job.

## 9. Shift-to-queue — a manual priority queue

**The gap:** one manual order at a time — assign, wait for completion, assign the next. The player wants
to **Shift+pick several verbs in sequence** and have the pawn run them front-to-back.

- [ ] **Order queue field.** Add `pawn.orderQueue?: PawnOrder[]` (FIFO). `PawnOrder` is the existing `draftTarget` union (§3.1) — reuse the type; the queue holds the same arms. The **active** order stays `draftTarget` (the head); `orderQueue` is the pending tail. When the head clears (order completes/cancels), pop `orderQueue[0]` into `draftTarget`. *Alternative to weigh:* collapse to a single `pawn.orders: PawnOrder[]` where the head is `orders[0]` — cleaner semantics but a churny rename of `draftTarget` across the renderer ([GameCanvas.svelte:1911](../../../src/lib/components/UI/GameCanvas.svelte#L1911)) and executor; the head+tail split above minimises blast radius. **This queue is shared by drafted and undrafted pawns** — Shift-queuing works for both.
- [ ] **Menu gesture.** A verb clicked **without Shift** → *replace*: clear `orderQueue` and set the order as the new head. **With Shift held** → *append* to the queue tail. The `equipMenu` entry `run()` closures read the modifier (capture `e.shiftKey` at menu-open, or read a live `shiftHeld` flag) and choose replace-vs-append.
- [ ] **Command layer.** [`setPawnDraftTarget`](../../../src/lib/game/sim/commands.ts#L190) currently replaces. Add an `append?: boolean` to its payload (Shift ⇒ true): append pushes onto `orderQueue`; absent/false clears the queue and sets the head. No new command needed.
- [ ] **Drain on completion.** Every place that today clears `draftTarget` on order completion (the `clearHaul`/`clearEquip`/rescue/tend/forceJob-complete points, and the undrafted `handleIdle` job-complete) must instead **advance the queue**: pop the next `orderQueue` entry into `draftTarget`, or clear if empty. Factor this into one `advancePawnOrders(pawn, gs)` helper so no callsite forgets the tail.
- [ ] **Consistent with §2 "no auto-chaining".** The queue is *manual* — the player explicitly Shift-stacks each order. Completing one order still never *auto*-grabs a nearby job; it only advances to the next **player-queued** entry.
- [ ] **Renderer (optional first cut).** The on-map order line already draws `draftTarget` ([GameCanvas.svelte:1911](../../../src/lib/components/UI/GameCanvas.svelte#L1911)); extend it to faintly chain the queued targets (head bright, tail dimmed) so a stacked queue is visible. Not required for the mechanic.

## 10. Adjacency-tolerant pickup / equip

**The gap:** picking up or equipping a dropped item requires standing **exactly on** its tile, so the pawn
squeezes onto the item; the player wants an **adjacent** tile to suffice.

Most of the codebase already tolerates adjacency — `pickUpFromTile` grabs from the *target* tile
regardless of where the pawn stands ([pawnHauling.ts:65](../../../src/lib/game/systems/pawn/pawnHauling.ts#L65)),
and the FSM eat path already accepts `isAdjacent || same tile`
([needs.ts:331-332](../../../src/lib/game/systems/pawn/handlers/needs.ts#L331)). The exact-tile
requirement survives only in the **drafted executor's** haul/equip arms:

- [ ] **Haul pickup gate** — [GameEngineImpl.ts:1056](../../../src/lib/game/systems/GameEngineImpl.ts#L1056): `pawn.position === target` → `isAdjacent(pawn, target) || same tile`. `pickUpFromTile` already pulls from `(target.x,target.y)`, so relaxing the gate is enough (optionally pass `radius: 1` so a pawn stopped one tile off still scans the stack).
- [ ] **Equip gate** — [GameEngineImpl.ts:1077](../../../src/lib/game/systems/GameEngineImpl.ts#L1077): same relax; `equipDropToPawn`/`carryDropToInventory` act on `dropId` regardless of pawn position, so an adjacency gate suffices.
- [ ] **Stop the walk at adjacency.** The walk toward an item tile must halt on a neighbour, not route onto it. The draft equip walk currently targets the drop tile directly — reuse `_draftWalk`'s adjacent-approach routing (as `forceJob` does) so the pawn stops beside the item.
- [ ] **Audit the instant pickup command.** The menu's "Pick up N" calls [`pickUpItemFromTile`](../../../src/lib/components/UI/GameCanvas.svelte#L5092) — confirm whether it position-gates or already teleport-picks; relax if it enforces exact-tile. (The eat path needs no change — already adjacency-tolerant.)

## 11. Expansion — files touched & acceptance

| File | Change (expansion) |
| --- | --- |
| [core/types/entities.ts](../../../src/lib/game/core/types/entities.ts#L394) | `pawn.orderQueue?: PawnOrder[]`; `PawnOrder` alias for the order union |
| [components/UI/GameCanvas.svelte](../../../src/lib/components/UI/GameCanvas.svelte#L4961) | ungate the verb menu for undrafted selection; Shift ⇒ append; optional queued-order overlay |
| [sim/commands.ts](../../../src/lib/game/sim/commands.ts#L190) | `setPawnDraftTarget` payload gains `append?: boolean` |
| [systems/pawn/handlers/work.ts](../../../src/lib/game/systems/pawn/handlers/work.ts#L137) | `handleIdle`: honour the undrafted forced-order head (claim its `jobId` / route consume-drink) before `selectJobForPawn`; preempt a mismatched `activeJob` |
| [systems/pawn/handlers/needs.ts](../../../src/lib/game/systems/pawn/handlers/needs.ts#L121) | forced consume/drink bypass the hunger/thirst gate when invoked as an order |
| [systems/GameEngineImpl.ts](../../../src/lib/game/systems/GameEngineImpl.ts#L1056) | relax haul/equip pickup gates to adjacency; shared `advancePawnOrders` on completion |

**Expansion acceptance criteria:**

- [ ] Selecting an **undrafted** pawn and right-clicking a designated resource / supplied craft / build site / edible drop / water tile offers the same verbs a drafted pawn gets (minus move/attack) — **without drafting**.
- [ ] The undrafted pawn walks over and completes the forced job through the normal FSM work loop, then returns to autonomous work; a critical hunger/fatigue/threat still **interrupts** the forced order and resumes it afterwards.
- [ ] **Shift+picking** several verbs queues them; the pawn runs them in order, draining one per completion. A plain pick **replaces** the queue.
- [ ] Shift-queue works for both drafted and undrafted pawns.
- [ ] A pawn standing on **any tile adjacent to** a dropped item can pick it up / equip it — no need to stand on the item.
- [ ] Cancelling/replacing an undrafted order releases any force-claimed job back to the pool.
- [ ] `pnpm check` clean; `pnpm test:related` on the touched files green.
