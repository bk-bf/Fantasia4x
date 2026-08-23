# Containers & Fluids

> **Related:** [../../game/ITEM-RULES.md](../../game/ITEM-RULES.md) · [../../game/ARCHITECTURE.md](../../game/ARCHITECTURE.md) · [../../game/DECISIONS.md](../../game/DECISIONS.md) · [ARMOUR-PASS.md](ARMOUR-PASS.md)

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
a carry aid's clothes. Splitting the concepts is what lets a quiver hold arrows rather than grant
abstract capacity.

## 1 — Vessels: an item that holds items

- [ ] `Item.container?: { capacityL: number; accepts: string[]; sealed?: boolean }` — `accepts` lists
      item **categories** (`fluid`, `arrow`, `grain`), empty = anything.
- [ ] `ItemInstance.contents?: ItemInstance[]` — the nesting lives on the INSTANCE, because two jugs
      are not interchangeable once one has water in it.
- [ ] **Weight and volume are the vessel plus what is in it**, everywhere a pawn's load is summed
      (`PawnEquipment` carry maths, hauling, stockpile totals). A full jug is not a jug.
- [ ] **One level of nesting only.** A jug in a crate is fine; a jug in a crate in a cart is a
      recursion nobody can debug and a save-size problem. Enforce it in the service, not by convention.
- [ ] Emptying, filling and pouring are **jobs**, not free actions — they take a pawn and real ticks.
- [ ] A vessel is destroyed with its contents. Decide and write down what happens on drop: does a
      dropped jug spill?

## 2 — Fluids: a type that cannot exist loose

- [ ] New item `type: 'fluid'` (not merely a category — the sim must be able to refuse it structurally).
- [ ] **A fluid may only exist inside a vessel whose `accepts` includes it.** Not in a stockpile tile,
      not in a pawn's hands, not as a `DroppedItem`. Anything that would place one loose spills it.
- [ ] Measured in **litres**, so `capacityL` is the only unit the vessel needs.
- [ ] First fluids, all of which already exist as fake solids or as nothing at all: `water`,
      `tanning_brine`, `beast_brine`, `animal_fat`/oil, ale and the brews.
- [ ] `water` stops being a stockpile integer. **This is the risky one** — thirst, wells, cooking and
      the brine chain all read it today, so it needs its own migration pass and a headless run per
      consumer.

## 3 — What changes for existing items

- [ ] `clay_jug`, `wooden_bucket`, `wooden_barrel`, `waterskin`, `flask` become vessels with real
      capacities. They stop being flavour.
- [ ] Quivers (`hide_arrow_sheath`, `leather_back_quiver`, …) become vessels that accept `arrow`, and
      the `quiver` field on the item def is folded into `container.accepts`.
- [ ] Packs and frames stay carry aids. **They do not gain nesting** — a rucksack that holds tracked
      item instances is a second inventory system and a UI nobody asked for.

## 4 — Rules this adds to ITEM-RULES

- [ ] A vessel states `capacityL` and what it `accepts`; a name that says "jug" and holds nothing is
      the same lie as armour that claims a material it does not use.
- [ ] A fluid **never** appears as a recipe output that is not captured into a vessel.
- [ ] Carry aid, vessel and fixture are three different things and an item is exactly one of them.

## Open questions — decide before building

- [ ] Does a vessel's content survive being put in a stockpile, or does the stockpile flatten it?
- [ ] Do fluids evaporate/spoil (they have `decaySeconds` machinery available), or is that noise?
- [ ] Does a pawn drink from a carried waterskin directly, or must they stand at a source? The needs
      system currently reads a stockpile integer and would need the answer either way.
- [ ] Is `capacityL` per vessel enough, or does a fluid need a density so a litre of oil is not a
      litre of water?

## Acceptance

- [ ] `pnpm check` clean; `itemRules` + `armourCoverage` + `armourChain` green.
- [ ] A **headless** run: a pawn crafts a jug, fills it at a river, hauls it to a stockpile, and
      another pawn drinks from it — stated as a delta, not asserted from unit tests.
- [ ] A headless run proving a fluid **cannot** be created loose: the attempt spills instead.
- [ ] `/gear-db` shows vessels and fluids as their own branches, with capacity on the row.
