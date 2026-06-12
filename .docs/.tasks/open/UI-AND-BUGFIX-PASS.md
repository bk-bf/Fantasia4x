<!-- LOC cap: 200 (created: 2026-06-12) -->

# UI & BUGFIX PASS

> **Related:** [ROADMAP](ROADMAP.md) · [ui/ARCHITECTURE](../../ui/ARCHITECTURE.md) · [ui/DESIGN](../../ui/DESIGN.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [SEASONS_WEATHER](SEASONS_WEATHER.md)

## Status

**12 / 13 done** (build green, 113 tests). Worked through in a loop: implement → `pnpm check` +
`pnpm test` → check off. **Remaining: E1** (card-based crafting/building lists) — a larger UI
redesign left for the next pass. Minor follow-ups noted inline (WorkScreen reuse of
`PawnAttributes`; delete orphaned `PawnStats.svelte`).

Grouped, roughly by quick-win / dependency order. Each box is one loop iteration.

## A. Gameplay bugs

- [x] **A1 — Spawn only on walkable terrain.** ✅ Root cause: all 12 ore/coal/salt nodes were
      `walkable: true`, so mineral_deposit tiles never blocked anything (spawn already checks
      `tile.walkable`). Flipped ore veins to `walkable: false` in `resources.jsonc` — they're now
      mineable walls (mining is non-persistent → tile restores base walkability when mined out,
      like trees). Spawn now avoids them.
- [x] **A2 — Stockpile drops land on the drop tile.** ✅ `depositInventory` was picking the
      first stockpile tile in designation-iteration order (top-left) for every drop, ignoring the
      pawn's position. Now orders candidate tiles nearest-first to the pawn, and same-resource
      stacking prefers the nearest pile — items appear where the pawn dropped them.
- [x] **A3 — De-spam the chronicle/log.** ✅ Hunt-start dedup now keys on `hunter:prey` with a
      1200-tick window (a new target logs at once; a stalled re-hunt of the same prey collapses to
      one line). Removed the "is now exhausted (was fleeing)" log entirely — it's a transient,
      repeating state, not chronicle-worthy. NOTE (separate AI bug, not log): mobs re-decide to
      hunt the same unreachable prey every ~60 ticks (e.g. Wolf↔Wolf) — a stalled-hunt loop worth
      fixing later; the log fix only hides the symptom.

## B. Needs system completion (thirst / hygiene)

- [x] **B1 — Thirst + hygiene bars.** ✅ Added THIRST + HYGIENE rows to `PawnNeeds.svelte` (info
      panel) and `PopulationOverview.svelte` (work tab), plus thirst/hygiene descriptions in
      `getNeedDescription`.
- [x] **B2 — Drink + wash zones in the menu.** ✅ Added DRINK + WASH entries to `ZonePanel`
      `ZONE_DEFS`; extended `FilterableZoneType` to include them (no item filter — guarded the
      `[F]` button to filterable zones only). `designate()` is generic, so painting sets the
      `drink`/`wash` designation that the routing reads.
- [x] **B3 — Auto-drink / auto-wash + zone routing.** ✅ Verified complete — the gap was purely
      the missing zone UI (B2). `processAutoDrink`/`processAutoWash` run in the turn loop
      (GameEngineImpl 314–315); `tryRouteToWaterNeed` fires for thirst≥82 and hygiene≥threshold in
      the pawn tick; `findNearestWaterTarget` reads drink/wash designations + wells;
      `handleDrinking`/`handleWashing` relieve the need on arrival. Paint a drink zone near water →
      thirsty pawns route and drink.
- [x] **B4 — (deferred) Entity thirst/hygiene at species rates.** ✅ Spec-only — captured as a
      deferred atmospheric idea (mobs gain thirst/hygiene at per-species rates; many self-clean so
      hygiene barely applies). Reuse the `hunger_rate`-style data-driven stat pattern when built.
      Not implemented now.

## C. Item info panel

- [x] **C1 — Spoilage bar.** ✅ Item hover HUD (`GameCanvas`) now shows a **FRESH** bar
      = `1 − decayAcc/decaySeconds` for perishables (hidden for non-decaying items).
- [x] **C2 — Durability bar.** ✅ Same HUD shows a **COND** bar = `durability/maxDurability`
      (green→red via `itemBarColor`).

## D. Pawn screen / tabs

- [x] **D1 — Attributes tab as a compact table of ALL stats.jsonc stats.** ✅ New
      `PawnAttributes.svelte`: all 79 stats grouped by category in a compact auto-fill grid (+ base
      stat strip); hovering a cell shows the formula with the pawn's own numbers substituted in
      (`derivation()` via `computeCapacities`). Swapped into the attributes tab; the old 40k
      `PawnStats.svelte` is now orphaned (left in place, not deleted). **Remaining:** reuse
      `PawnAttributes` in the WorkScreen attributes overview (component is ready; wiring TBD).
- [x] **D2 — Body-list toggle order.** ✅ `PawnHealth` per-limb cycle is now
      `damaged → all → hidden`, default `injured` (show damaged sub-limbs).
- [x] **D3 — Entity-list click = camera jump only.** ✅ `EntityScreen` row click now only
      `focus()`es the camera; a separate ▸/▾ caret toggles the limb/health expansion.

## F. Round 2 (review feedback)

- [x] **F1 — Thirst + hygiene consequences.** Thirst already drives the `dehydration` condition;
      hygiene has NO consequence. Add a `filth`/poor-hygiene consequence (mood drain via a status
      effect, + hook for later disease) in `conditions.jsonc`/`status-effects.jsonc`, and confirm
      dehydration actually applies.
- [x] **F2 — Reusable bar component.** The condition bar doesn't match the needs/item bars →
      duplication. Extract ONE `<StatBar>` (label · block-bar · value · color) and reuse it for
      needs, conditions, item FRESH/COND, blood/stamina.
- [x] **F3 — Entity row click still expands.** D3 incomplete: clicking the row middle still drops
      the health panel because `focus()`→`selectMob`→ the `selectedMobId` `$effect` auto-sets
      `expandedId`. Decouple selection from expansion so only the caret expands.
- [ ] **F4 — Stats table polish.** Color-code stat values (good/neutral/bad), and replace the
      default-browser `title=` tooltip with a styled in-aesthetic hover box for the derivation.
- [ ] **F5 — Fix the stalled-hunt AI loop.** Mobs re-decide to hunt the same UNREACHABLE prey
      every ~60 ticks (Wolf↔Wolf). Make a failed/unreachable hunt blacklist that prey for a while
      (or require path reachability before committing), so it doesn't thrash.
- [x] **F6 — YIELD-DBG stays as a debug tool.** Keep it in the pipeline; gate behind
      `isGameDebug()` so it's off by default but toggleable; recorded in dev memory.
- [ ] **F7 — Work-tab attributes match the pawn-tab.** Reuse `PawnAttributes` in the WorkScreen
      attributes overview.
- [ ] **F8 — Reusable STR/DEX stat banner.** Extract the base-stat banner into a shared component
      used by both the status and attributes (abilities) tabs.

## E. Crafting / building tabs

- [ ] **E1 — Card-based crafting + building lists.** Replace the flat lists with compact but
      immersive cards (icon, name, cost, requirements).

---

## Notes / pointers (filled as discovered)

- Needs UI: `src/lib/components/pawn/PawnNeeds.svelte` (hunger/rest bars + blood/stamina).
- Spawn: pawn placement in `stores/gameState.ts` / `dev/devWorld.ts`; mobs in
  `services/EntityService.ts` (`spawnEntities`, biome-weighted accept).
- Stockpile drop: `core/GameState.ts` (`addToStockpileZone`/`absorbDropIfOnStockpileTile`) +
  `services/JobService.ts` deposit path.
- Log dedup: `stores/Log.ts` (`shouldSkipLog`), entity events emitted from `EntityService`.
- Stats table: `components/pawn/PawnStats.svelte` (40k — the big vertical list); stats data in
  `database/stats.jsonc`; eval via `services/PawnStatService.ts`.
- Body list + entity card: `components/pawn/PawnHealth.svelte`, `UI/SelectedEntityCard.svelte`.
