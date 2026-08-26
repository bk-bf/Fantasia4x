<!-- LOC cap: 240 (created: 2026-08-26) -->

# MECHANICAL POWER — Draft Animals, Water Wheels & Windmills

> **Related:** [ROADMAP](ROADMAP.md) · [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md) (taming and draft
> animals are a hard dependency of the animal mill) · [game/DESIGN](../../game/DESIGN.md) ·
> [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

## Status

**Not started — deferred.** Split out of the 2026-08-26 workstation-ladder pass. That pass renamed
and re-gated every station that is genuinely a *workstation* — a thing a pawn stands at and works.
Three members of the `milling` family are not workstations and were deliberately left behind:

| id | age | current rung | what it should be |
|---|---|---|---|
| `donkey_mill` | copper:2 | milling 1 | a beast walking a circular track, turning a stone |
| `watermill` | iron:1 | milling 2 | a wheel in moving water, driving an axle |
| `windmill` | steel:1 | milling 3 | sails on a tower, driving an axle |

Today all three are plain `workstation: true` entries with a `craftingBonus` — a pawn walks up and
grinds flour faster, for no reason the player can see. Nothing about them is a mill. The animal is
not real, the water is not real, the wind is not real.

`quern` (milling 0) **stays a workstation** and is unaffected by this spec. A hand quern is exactly
a thing a pawn kneels at and turns. It was renamed **Hand Quern** in the same pass, and the "hand"
is what this spec eventually contrasts against.

---

## The shape to build

The reference points are Vintage Story's windmill/gearing and Dwarf Fortress's water wheels and
axles. The common idea in both: **power is produced somewhere, transmitted, and consumed
somewhere else.** The mill stops being a bench and becomes the *consumer* end of a chain the player
has to lay out on the map.

That gives three new concepts, in dependency order.

### 1. Placement constraints on buildings

**This does not exist at all today.** `buildings.jsonc` has no `requiresTerrain`, no `adjacentTo`,
no placement predicate of any kind — grep returns nothing. Every building can be placed on any
buildable tile. A water wheel that can be built in a bedroom is not a water wheel.

Needed on the building definition:

- `requiresTerrain` — the tile the building occupies must be one of a set. The terrain ids already
  exist: `water`, `shallow_water`, `riverbank`.
- `requiresAdjacent` — at least N neighbouring tiles must match a set. A water wheel wants
  `shallow_water` or `water` adjacent; it does not stand *in* deep water.
- `requiresClearance` — no blocking building or wall within a radius. The windmill's sails need it;
  so does the animal mill's walking circle.

The validator belongs beside whatever already answers "can I build here", and the placement UI must
show *why* a tile is refused, not merely grey it out.

### 2. A power value, produced and consumed

A new pair of effect fields:

- `powerOutput` — units of mechanical power a producer generates, per tick.
- `powerRequired` — units a consumer needs before its recipes run at all.

A consumer with unmet `powerRequired` is **idle, not slow**. This is the distinction that separates
this spec from the `craftingBonus` it replaces: a hand quern is slow, a stopped watermill produces
nothing. That is what earns the build cost.

Production is **conditional and variable**, which is the whole reason the terrain constraints come
first:

- **Water wheel** — output from the adjacent water. Constant if the map has flowing water; zero if
  the river is frozen (if seasons ever freeze water) or the tile is stagnant.
- **Windmill** — output varies with weather. Needs a wind concept; **none exists** (grep for
  `elevation` and `windExposure` in `src/lib/game` returns nothing). Either wind arrives with a
  weather system or the windmill is gated behind one.
- **Animal mill** — output only while a **tamed draft animal is assigned and fed**. This is a hard
  dependency on [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md): `TamedAnimal` exists in
  `core/types/entities.ts` and `tameable` exists in `creatures.jsonc`, but assignment-to-a-job does
  not. The animal must be able to starve, tire and stop, and the mill stops with it.

### 3. Transmission

The minimum viable version is **adjacency**: a consumer touching a producer draws its power. Ship
that first; it needs no new placement thinking beyond §1.

The fuller version is an **axle** — a placeable that carries power along a run of tiles, with a
length limit and a loss per tile, so the player lays out a line from the river to the workshop.
Axles turn the mill from a building into a layout problem, which is the point of the reference
games. Gearing (trading speed for torque) is explicitly **out of scope** until axles exist and are
proven to be worth the interface cost.

---

## What the mills then do

Once power exists, milling stops being one recipe made faster and becomes a throughput tier:

- **Hand Quern** (workstation, no power) — flour one small batch at a time, a pawn stood there the
  whole while. The fallback that always works.
- **Animal Mill** — runs without a pawn present once the beast is assigned. The player trades a
  tamed animal and its feed for freeing a colonist.
- **Watermill** — highest steady throughput, but only where the map gives you water, and the
  building has to go where the water is rather than where the colony is. Distance is the cost.
- **Windmill** — highest peak throughput, intermittent with weather, wants clearance and height.

Bulk grain into flour is the anchor load. Once an axle exists, the same power should drive other
consumers rather than staying a flour-only mechanic — a powered saw, a powered trip hammer at the
smithing chain, a powered bellows at a furnace. Design those as consumers of the same
`powerRequired` field, not as bespoke buildings.

---

## Acceptance criteria

- [ ] `requiresTerrain` / `requiresAdjacent` / `requiresClearance` exist on building definitions,
      are enforced at placement, and refuse with a player-readable reason.
- [ ] `powerOutput` / `powerRequired` exist; a consumer with unmet power is idle, not merely slower.
- [ ] A water wheel can only be built against `water` / `shallow_water` / `riverbank`.
- [ ] An animal mill produces nothing without an assigned, fed draft animal.
- [ ] Windmill output varies with a real weather input, or the windmill stays unbuildable until one
      exists.
- [ ] Adjacency transmission works before any axle work begins.
- [ ] A headless run shows flour stock rising with the mill powered and flat with it unpowered,
      over the same tick count.

## Blocked on

- **Weather** — no wind input exists. The windmill cannot be honest until it does.
- **[ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md)** — draft-animal assignment, feeding and fatigue.
- **Placement constraints** — §1 is a prerequisite for all three and has no current implementation.

Until this ships, `donkey_mill`, `watermill` and `windmill` remain as they are: `milling` rungs 1–3
holding no recipes of their own. They are **not** to be given recipes or speed bonuses to look
busy — that is the exact defect this spec exists to correct.
