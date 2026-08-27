# Containers & Fluids

> **Related:** [../../game/ITEM-RULES.md](../../game/ITEM-RULES.md) · [../../game/ARCHITECTURE.md](../../game/ARCHITECTURE.md) · [../../game/DECISIONS.md](../../game/DECISIONS.md) (ADR-034) · [ROADMAP.md](ROADMAP.md) · [ARMOUR-PASS.md](ARMOUR-PASS.md)

Today every "container" in the game is a lie told with one number. A wicker frame, a hide scrip and a
linen snapsack all do exactly one thing — add to `inventoryBonus.weightKg/volumeL` — and a clay jug
does not even do that. Nothing in the game can hold a thing inside another thing, which is why there
is no water to carry, no oil, no brine you can move, and no reason a jug exists.

This splits that into three separate concepts and adds the one item type the game has never had.

## The three things a "container" can be

| kind | what it is | example | model |
| --- | --- | --- | --- |
| **carry aid** | worn gear that raises what a pawn can shoulder | wicker frame, snapsack, belt pouch | today's `inventoryBonus` — unchanged |
| **vessel** | an ITEM that holds other items and is itself carried, hauled and stored | jug, waterskin, barrel, quiver | **new** — nested inventory |
| **fixture** | a placed building that stores | chest, rack, stockpile | already exists as a building |

The bug worth naming: `back2` carries a wicker frame *and* a quiver, and a quiver is a vessel wearing
a carry aid's clothes. Splitting the concepts is what lets a quiver be a real container when it is set
down — while staying a carry aid on the back, which is what the ranged draw-speed model reads.

## 1 — Vessels: an item that holds items

- [x] `Item.container?: { capacityL: number; capacityKg?: number; accepts?: string[]; sealed?: boolean }` —
      `accepts` matches an item **id**, a **category**, or the bare word `fluid`; empty/omitted = anything.
      `capacityKg` is an optional second ceiling for a vessel whose walls give out before its volume does.
- [x] `ItemInstance.contents?: VesselContent[]` — the nesting lives on the INSTANCE, because two jugs
      are not interchangeable once one has water in it.
- [x] **Weight and volume are the vessel plus what is in it**, everywhere a pawn's load is summed
      (`PawnEquipment` carry maths, hauling, stockpile totals). A full jug is not a jug.
- [x] **One level of nesting only.** A jug in a crate is fine; a jug in a crate in a cart is a
      recursion nobody can debug and a save-size problem. Enforce it in the service, not by convention.
- [x] Emptying, filling and pouring are **jobs**, not free actions — they take a pawn and real ticks.
- [x] A vessel is destroyed with its contents. **A dropped jug does NOT spill** — contents survive
      being dropped and being stored; only a fluid something tries to place *loose* is lost.

## 2 — Fluids: a type that cannot exist loose

- [x] New item `type: 'fluid'` (not merely a category — the sim must be able to refuse it structurally).
- [x] **A fluid may only exist inside a vessel whose `accepts` includes it.** Not in a stockpile tile,
      not in a pawn's hands, not as a `DroppedItem`. Anything that would place one loose spills it.
- [x] Measured in **litres**, so `capacityL` is the only unit the vessel needs.
- [x] First fluids — **78 items**: `water`, `tanning_brine`, `beast_brine`, every `drink` (ale, wine,
      cider, tea and all 50-odd potions/draughts/tonics/elixirs), every weapon coating and oil, `dye`,
      and the liquid reagents (`alpha_ichor`, both biles, `distilled_spirit`).
      **`animal_fat` is NOT among them** — rendered fat is a block of set tallow, not something you
      pour. It was renamed `tallow` to stop the name inviting the mistake again, and stays a solid
      through all 24 of its recipes.
- [x] `water` stops being a stockpile integer. **This is the risky one** — thirst, wells, cooking and
      the brine chain all read it today, so it needs its own migration pass and a headless run per
      consumer.

## 3 — What changes for existing items

- [x] `clay_jug`, `wooden_bucket`, `wooden_barrel`, `waterskin`, `flask` become vessels with real
      capacities. They stop being flavour.
- [x] Quivers become vessels — but they accept **anything**, and the `quiver` field STAYS. Restricting
      a quiver to arrows was rejected before as unrealistic, and `quiver.drawSpeed` is the mechanic the
      ranged model actually reads. Worn, a quiver's contents move into the pawn's pack and it grants
      `inventoryBonus` exactly as it does today; set down, it is a real container.
- [x] Packs and frames stay carry aids. **They do not gain nesting** — a rucksack that holds tracked
      item instances is a second inventory system and a UI nobody asked for.

## 4 — Rules this adds to ITEM-RULES

- [x] A vessel states `capacityL` and what it `accepts`; a name that says "jug" and holds nothing is
      the same lie as armour that claims a material it does not use.
- [x] A fluid **never** appears as a recipe output that is not captured into a vessel.
- [x] Carry aid, vessel and fixture are three different things and an item is exactly one of them.

## Open questions — decided

- [x] **A vessel's contents survive a stockpile.** Storing a full barrel stores a full barrel; the
      colony ledger counts what is inside it, so nothing goes missing by being put away.
- [x] **No evaporation, no spoilage by default.** Water, brine and oil keep. Only a fluid that already
      carries `decaySeconds` decays, and `sealed: true` halts it the way `stored` halts a stack. The
      same rule now governs SOLIDS in a vessel: berries in an open bucket rot exactly as fast as
      berries on the ground, and only a sealed vessel holds the clock. Being in a jar was otherwise a
      loophole that made food immortal.
- [x] **Carried first, then walk.** A pawn with a filled skin drinks where it stands; empty-handed it
      walks to a drink zone or a well. The colony water integer is gone — `processAutoDrink` no longer
      sips a barrel three screens away, which was the last of the ethereal stockpile.
- [x] **No density field.** A fluid's `volumeL` is one MEASURE and `weightKg / volumeL` is its density,
      so a litre of oil already weighs what its def says without a second number to keep in sync.

## 5 — Storage: buildings and container items are different things

The word "container" collided one more time than the spec's table admitted: `storage_chest` was a
BUILDING sitting next to a `wooden_chest` ITEM, `salting_barrel` next to `wooden_barrel`,
`wicker_basket` next to `woven_basket`. "Put it in the chest" meant two different things depending on
which panel you were looking at.

- [x] **Portable stores became items; fitted ones stayed buildings.** Gone as buildings and folded onto
      the item that already played their part: `wicker_basket` → the new `basket`, `storage_chest` →
      `wooden_chest`, `clay_storage_jars` → `water_urn`, `salting_barrel` → `wooden_barrel`. Still
      buildings, because you cannot pick them up: Larder Cupboard, Meat Hooks, Drying Rack, Hay Rack,
      Rope-Hung Granary, Root Clamp.
- [x] **An item takes the bare vessel noun; a building takes a fitted place-name.** Bucket, Barrel,
      Bin, Crate, Basket, Chest, Jug, Urn, Flask, Phial, Waterskin — against Larder Cupboard, Meat
      Hooks, Rope-Hung Granary. No noun appears on both sides, and **R11** fails the build if one does.
      The worn carrying basket became a **Carry-Basket**, which is plainly what it is, so
      the bare noun was free for the thing you set down.
- [x] **The vessel ladder runs across three woodworking ages**, no new stations: **Basket** from withies
      and cordage at a craft spot (primitive); **Bucket** and **Barrel** stave-built at the Sawpit once
      there are sawn planks (bronze — and the barrel is bound with cordage hoops, not iron nails, which
      is what actually held a cask together); **Bin**, **Crate** and **Chest** joined at the Carpenter's
      Bench (iron).
- [x] **Goods go INTO the bin, DF-style.** A pile hauled onto a tile where a vessel's own allow-list
      names it is packed inside rather than laid beside it, so a bin is what makes a tile dense — no
      building needed underneath. What is inside still counts as colony stock exactly where it stands.
- [x] **A vessel set down in a filtered stockpile inherits that stockpile's list.** Telling a zone
      "firewood only" tells its bins the same thing; the two vocabularies (a zone filters by category, a
      vessel by id) are reconciled once, at the moment the vessel lands.
- [x] **`ZoneInstance.containerBudget`** — DF's max-bins, as a pure cap so one stockpile cannot hoard
      every barrel the colony owns. Unset means no cap: the control only ever takes capacity away, and
      a LOADED vessel is goods rather than furniture, so it always has a home to go to.

## 6 — A vessel is not a loophole in the world

There are exactly three per-stack processes that act on idle goods, and a container had to be honest
about all three or it would have become the place you put things to stop time.

- [x] **Spoilage** reaches nested contents. An open bucket gives none, a sealed chest halts the clock.
- [x] **Drying** reaches nested contents by the same rule: fibre cures into hay inside a slatted crate
      exactly as fast as in the yard, and not at all inside a bunged one — you cannot season timber in
      a sealed cask, and now the sim agrees.
- [x] **Weather wear** needs nothing new. A loose vessel is destroyed whole when its durability runs
      out, so what was inside goes with it — the same holds for a shattered worn one and a broken
      carried one, all three of which remove the vessel object outright.
- [x] Fermentation is untouched, and correctly so: it is a passive CRAFT at a station, not something
      that happens to an idle stack.
- [x] **A carcass is never packed into a bin.** Its freshness is per-unit (`unitConditions`) and a
      nested entry has nowhere to put that, so packing one would flatten a half-spoiled deer to fresh.
      It keeps its own pile — which is also the only sane place for a deer.

- [x] **A carried vessel's contents are visible and usable from the pawn's inventory.** A phial on a
      belt is no use if the only way to drink it is to haul it back to the stockpile first, so the
      IN VESSELS panel lists what each carried vessel holds and offers the same DRINK / USE / COAT
      actions the colony-stock list does, spending the dose out of that vessel. Water is deliberately
      the exception: drinking is a NEED, so it routes through the FSM as a drink order and the pawn
      stops what it is doing to take a drink.
- [x] **`/gear-db` files the three concepts as three branches**, beside Armour and Weapons because a
      player choosing a loadout is choosing between them: **Carry aids** (worn, filed by the slot they
      occupy, read by what they GRANT), **Vessels** (not worn, fluid vs general goods, read by what
      they HOLD), and **Fluids** (which cannot exist outside either).

## What this grew beyond the original spec

Three things the spec did not have, decided during the build because the sim needs them to work:

- **Every vessel carries its own allow-list** (`ItemInstance.filter`) and it starts EMPTY. A vessel
  nobody has configured is inert — no hauler fills it. Allowing an item is the whole trigger for
  filling, and a list can be promoted to `GameState.vesselFilterDefaults` so every future vessel of
  that kind is born with it. A vessel that arrives from outside (loot, caravan) is stamped with what
  it is already carrying and ignores the colony default, so nobody tips out somebody else's wine.
  The UI is `VesselFilterPanel`, built on the same `ItemFilterChecklist` the fuel panel uses.
- **Filling is a `fill` job on the hauling line** (`services/jobs/fill.ts`), self-sequencing in two
  legs: fetch the vessel, then walk to the source and pour. Its sources are the world (a well or a
  drink zone), a station's own body, and any vessel holding something its own list no longer allows —
  deliberately NOT vessel-to-vessel top-ups, which would slosh forever. Beside the player's lists, a
  queued craft order's unmet fluid input makes an EMPTY vessel volunteer, so a colony cannot deadlock
  waiting for someone to tick a box before it can brew.
- **Stations that ARE vessels hold their own fluid** (`Building.fluidCapacityL` →
  `PlacedBuilding.fluidContents`): the fermenter, the brewing barrel, both tanning buckets, the
  alchemy lab, the apothecary, the flensing table, the sanguinary altar, the butcher spot and the
  campfire's pot. A fluid recipe pours straight into the station, that fluid counts as colony stock
  where it stands, and pawns draw it out into carried vessels with the same `fill` job. **R10** fails
  the build if a fluid recipe is ever authored at a station with nowhere to pour.

**A fluid says what MATERIAL may hold it.** `accepts` only ever ran vessel→fluid, so a leather
waterskin with `accepts: ['fluid']` would take a 1085C melt and a basket with no list took anything at
all. Every vessel now states `container.material` (wood, leather, hide, clay, fireclay, porcelain,
glass, wicker, stone, metal) and a fluid states `heldBy`; omitted means ordinary and every fluid vessel
takes it. Materials rather than an invented tag, so the entry reads as the physical fact — a waterskin
is refused because leather is not on the list, not because of a word someone made up.
The six melts are `["fireclay"]`: ordinary earthenware, wood, glass and leather all fail at those
temperatures, and no vessel is fireclay yet, so a melt cannot leave the furnace it was made in. That is
both realistic and what keeps melt-and-cast at one hearth, and a Fireclay Crucible would simply work
when one is wanted. Enforced at the single chokepoint, `vesselAccepts`, so the fill job, vessel filters
and capacity maths all inherit it. **R15** guards the data.

**A station's own fluid is staged where it stands.** A melt sits in the crucible it was made in, and the
mould is at that same hearth — nobody ladles molten copper into a bucket and back into the furnace to
pour it. So a craft order whose fluid input is already held by *its own* station counts that as supplied
(`staging.stagedQty`), skips reserving it (`craft.reservePendingOrders` — a hauler cannot carry it off
anyway), and drains it from the station body on completion (`craft.drainStationFluidInputs`), spending
any staged vessel's contents first. Without this a melt-then-cast pair deadlocks at `pending` forever:
the metal exists, the ledger counts it, and the order can never see it. The same shape covers a vat
fermenting its own wort and a pit tanning in its own brine.

**Overfilling spills.** A station at its `fluidCapacityL` takes nothing more; the craft tries a vessel
staged on the tile next, and what still will not fit is lost, with a warning naming the station. Keep
butchering into a full catch basin and you lose the bile — the station does not silently grow a bigger
belly. **Destruction takes the contents with it**: a vessel weathered apart on the ground, shattered in
a fight or broken in a pack is removed whole, and what was inside goes with it.

**The four items that carried a "preservation aura" lost it.** `preservationBonus` on an ITEM meant a
clay jug lying on a stockpile tile kept the unrelated meat beside it fresh, and its `isContainer` /
`storageCapacity` were read by no code at all. All three fields are deleted from the item type so
nobody re-authors them. Keeping food fresher on a TILE is a storage BUILDING's `effects.preservation`,
which is untouched; what a vessel preserves is what is inside it.

Nothing pours a vessel out to make room. Re-filtering a jug full of honey to water moves the honey
only once a jug that allows honey has room for it; otherwise the jug stays exactly as it is. Tipping a
vessel onto the ground destroys what is in it and is therefore a deliberate order — `emptyVessel`, off
the right-click menu and the vessel panel.

## Acceptance

- [x] `pnpm check` clean; `itemRules` (+ new R9/R10) + `armourCoverage` + `armourChain` green.
- [x] A **headless** run — `vesselChain.test.ts`. Two waterskins sit inert until the player allows
      water on them; pawns then walk to the well and fill them (**0 → 6 L in vessels, colony water
      0 → 6**), and a parched pawn drinks from a carried skin (**thirst 95 → 32.3**). The brine half
      is proved by `leatherChainE2E` (**barrel 20 → 19 units** drawn out at the tanning bucket, barrel
      survives) and the station half by `alchemyChain` (**bile 2 → caustic_coating 3**, drawn out of
      the butchery's catch into glassware by a pawn).
- [x] A run proving a fluid **cannot** be created loose: a stored stack of water put through the
      drops chokepoint spills and leaves the ledger at 0, while a deliberate credit of 4 water arrives
      inside a minted vessel and counts as 4.
- [x] `/gear-db` shows **Vessels** (fluid / general) and **Fluids** as their own branches, with
      `holds N L` and `N L per measure` on the row.
