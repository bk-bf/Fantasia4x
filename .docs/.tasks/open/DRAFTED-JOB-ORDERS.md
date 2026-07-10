<!-- DRAFTED-JOB-ORDERS — expand the drafted-pawn world right-click menu so the player can force a single
     colony job (harvest/craft/build/demolish/repair…) or a need (consume/drink) on the clicked tile.
     Design locked with the user 2026-07-10; NOT yet built. -->

# DRAFTED-JOB-ORDERS — Force a Job or Need from the Draft Right-Click Menu

> **Related:** [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-017 jobs, ADR-016 physical production) · [ROADMAP](ROADMAP.md) · [ui/ARCHITECTURE](../../ui/ARCHITECTURE.md)

**Status:** Design locked (2026-07-10), unimplemented. Single phase, all verbs at once.

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
