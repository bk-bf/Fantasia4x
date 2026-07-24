---
name: headless
description: Drive the Fantasia4x headless sim to playtest, audit, or verify a system with real pawns over real ticks. Use for ANY "audit / playtest / verify / does this actually work end-to-end" request about game systems (crafting chains, jobs, needs, combat, production), and whenever a headless scenario stalls with pawns sitting Idle.
---

# Headless playtesting

The headless sim (ADR-033) runs the REAL game loop with no UI: `buildScenario(spec)` →
`HeadlessSession.start/command/tick/getState`. It is the ONLY way to prove a system works.

## The rule that must not be weakened

**A unit test is never a playtest.** `completeCraftOrder`, `canQueueCraft`, static `recipeService`
reachability, `resolveHit` sampling — each proves a function in isolation, not that the pawn-driven
loop works. They are a supplement, NEVER a substitute.

- Only call something "playtested / end-to-end / headless-verified" when real pawns produced the
  result over real ticks.
- Always state the **mechanism + observed delta**: "HeadlessSession, 3600 ticks, galena 60→48,
  silver_bar 0→1". A claim without a delta is not a verification.
- If it is only unit-tested, say so plainly and mark it `[~]`, never `[x]`.

Never dress a unit test up as a playtest. This has been a repeated, explicitly-flagged failure.

## Preflight — do this BEFORE writing the scenario

Every stall so far has been one of these, and they all present **identically**: pawns sit `Idle`, the
order stays queued, its inputs stay reserved, and nothing errors.

- [ ] **Map: leave it `flat`** (the default). It is uniformly walkable, so every tile is reachable and
      the whole map is a stockpile. Pass `preset: 'generated'` ONLY when the test is *about* the world
      (worldgen, biomes, pathfinding around obstacles, wildlife, ore nodes). On a generated map a tile
      can be cut off from the pawns, and a job on an unreachable tile is **silently dropped** by
      `selectJobForPawn`'s reachability filter.
- [ ] **`workReady: true`** on any scenario where pawns must WORK. Enables all labor and stocks a
      qualifying tool for every ADR-009 `{workType, minTier}` gate. Without a tool held *or in colony
      stock*, the job is silently unclaimable.
- [ ] **`infiniteFuel: true`** unless the test is about hauling and lighting fuel.
- [ ] **Tick budget**: one craft ≈ 900+ ticks. Loop `tick(400)` until the goal — never tick once and
      conclude it is broken. Idle ≠ broken; give it time.

## Template

```ts
const s = new HeadlessSession();
await s.start(
  buildScenario({
    seed: 11,
    map: { w: 20, h: 20 },      // flat by default — every tile reachable
    researchMaxTier: 9,
    toolTier: 3,
    infiniteFuel: true,
    workReady: true,            // all labor on + a tool for every gate
    pawns: [{ count: 6, skillLevel: 20 }],
    needsDisabled: ['hunger', 'fatigue'],
    buildings: [{ id: 'stone_forge' }],
    items: { malachite: 60, clay_mold: 80 },
    seedEntities: false
  })
);
const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
s.command({ type: 'craftItem', payload: { itemId: 'copper_bar', quantity: 1 } } as never);
for (let i = 0; i < 12 && !(stk().copper_bar > 0); i++) s.tick(400);
```

Live driving instead of a test file: `./dev.sh --headless` → `/api/sim/*`. Dev verbs live in
`sim/commands.ts`.

## When it stalls

Work down this list. Do NOT start debugging game code until all of it is clean — two long sessions
were lost to mis-diagnoses ("passive stations are broken", "anvil needs a carried tool", "the ore
chain is broken") that were all setup, not defects.

1. **Read the `[scenario]` lines.** `buildScenario` announces its map and warns when a scenario
   physically cannot work (no labor enabled, no tool in stock for a gated work type).
2. **Probe the state, don't theorise.** Print: is the building `complete`? is the order queued with
   the right `inputs` and `stationBuildingId`? is the station `lit` / `fuel` / `fireHeat`? what are
   the pawn `currentState`s? A one-off `_`-prefixed probe test is the fastest tool here; delete it after.
3. **Check the recipe is reachable at all.** `getRecipeForItem` is **first-producer-wins**
   (`producedBy.get(itemId)?.[0]`), so a second recipe producing the same item is unreachable from the
   craft card. Two producers of one item is a bug, not a fallback.
4. Only then suspect the system under test.

## Other harness facts

- **Starting stock is pinned to the pawn cluster** (`addItem` takes an optional `tileKey`). Don't
  hand-place stock on a far/edge tile.
- **The sim starts at NIGHT** (`ambientLight 0.15`) so mobs don't self-aggro (vision-gated). Drive
  fights with an explicit draft attack order.
- **Founders already have all labor at level 2** (`ensureDefaultWorkAssignments`), and `laborSettings`
  is what `selectJobForPawn` reads. The per-category `setPawnLaborLevel` loop in older tests is
  redundant boilerplate — `workReady` covers it.
- **Determinism**: same spec ⇒ byte-identical state. Never introduce `Date.now()`/`Math.random()` into
  a sim path; ids must be turn-derived.

## Finishing

- Record the outcome in `docs/tasks/open/AUDIT.md` with the mechanism and delta, and tick the box only
  if it was genuinely headless-verified.
- Keep a genuinely valuable scenario as a permanent regression test (`oreChain.test.ts`,
  `steelChain.test.ts`, `leatherChainE2E.test.ts` are the precedent). Delete `_`-prefixed probes.
- Scope tests with `pnpm test:related <edited files>`, not the full suite.
