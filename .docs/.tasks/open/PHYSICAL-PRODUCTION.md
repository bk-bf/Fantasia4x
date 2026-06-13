<!-- LOC cap: 300 (created: 2026-06-13) -->

# PHYSICAL PRODUCTION — reserve-and-fetch crafting

> **Related:** [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-016) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ROADMAP](ROADMAP.md)

## Problem

The colony has two halves and only one is physical. **Gathering** is physical (harvest →
loose `DroppedItem` on a tile → haul into a pawn's inventory → `stored` drop on a stockpile
tile). **Consumption is an ethereal shared pocket**: crafting / building / eating / butchery
all reach into the aggregate `gameState.stockpile` (or the dead-end `gameState.item` array)
from anywhere, at queue time, with no pawn holding or carrying the material. Symptoms:

- `craftItem` consumes inputs the instant the player clicks; the craft job targets `(0,0)`, so the pawn crafts wherever it stands and never visits the workshop.
- Craft **output** lands in `gameState.item`, invisible to every material/cost/fuel consumer → the fire_bricks→advanced_kiln tier is uncompletable (review R1).
- Butchery consumes the **whole carcass stack** but yields one carcass (review R3).
- ADR-009 tool gating (R4) and the carry-weight budget (R5) are meaningless because no pawn ever physically holds inputs.

## Principle

**Items are always physical objects occupying a location** — a tile (loose or `stored`
`DroppedItem`) or a pawn's inventory. There is no global item pool. To produce an item by
any means, a pawn must have held the input items, carried them to the production location
(usually a workstation tile), and the output is created **at that location**.

## Model (Pass 1 — active crafting)

1. **Reserve, don't consume.** A craft order locks matching `stored` drops via
   `DroppedItem.reservedFor = orderId` (splitting a stack if only part is needed). Reserved
   stock is physically present but excluded from "available" — so a second order can't
   double-spend it. Nothing is deleted at queue time.
2. **Fetch.** JobService emits one `fetch` job per reserved drop not yet on the station:
   source = the reserved drop, dest = the chosen station tile (nearest complete building of
   the recipe's `station` type with free tile capacity). A pawn carries it (reusing the haul
   machinery) and stages it as a `stored reservedFor` drop **on** the station.
3. **Craft.** Once every reserved drop sits on the station tile, the `craft` job becomes
   claimable, targeted at the station tile. The pawn walks there and spends
   `recipe.workAmount × quantity` work points (same model as construction).
4. **Produce.** On completion the staged inputs are destroyed and the outputs spawn as drops
   **on the station tile** (absorbed if the tile is also a stockpile, else they wait to be
   hauled). Quality from `pawnStatService.getWorkModifiers(...).quality`; tool/mold wear kept.

`gameState.item` is removed entirely; its readers (craft output, eating, equip pool, events,
blueprint cost, craft-cancel refund) move to physical stock.

**Butchery is NOT folded in this pass.** It uses a multi-yield model (one carcass → meat +
hide + bone via `item.yields`, scaled by intactness/tools/building) that the single-output
recipe registry can't express, so folding it into reserve-and-fetch would regress content and
need a UI rewrite. It stays a dedicated instant transform (`ItemService.processButchery`,
requires a butcher station) — but the R3 stack-consumption bug is fixed: **one carcass per
action**. Full fold-in (multi-yield reconciliation + station hauling) is a follow-up.

## Out of scope (follow-up passes)

- **Passive furnaces** — bloomery / kiln / charcoal / smelting: load inputs + fuel, produce
  passively over time gated by fuel/heat. Until then furnace-station recipes run as **active**
  (a pawn works them) so the full recipe set keeps functioning. Adds `Recipe.passive`.
- **Building-material hauling** — construction still consumes from `stockpile` at placement;
  making builds physically fetch materials to the site is a later pass.
- **Butchery fold-in** — make butchery a physical haul-to-`butcher_spot` action and reconcile
  its multi-yield/intactness model with the recipe registry (this pass only fixes R3).
- **ADR-009 tool gating (R4)** and **carry-budget enforcement (R5)** become tractable once
  pawns physically hold inputs; sequenced after this.

## Verification

- Reserve→fetch→craft round trip; double-spend guard; butchery consumes exactly 1 carcass;
  `fire_bricks` craftable → spendable on `advanced_kiln`; food eaten from stockpile; no
  `gs.item` references remain.
- Gates: `pnpm check` · `pnpm test` · `pnpm lint` · `pnpm build`.
