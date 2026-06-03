<!-- LOC cap: 250 (created: 2026-06-03) -->

# PRODUCTION CHAIN EXPANSION — Phase 2

> **Related:** [ROADMAP](ROADMAP.md) · [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [game/DESIGN](../../game/DESIGN.md) · archived: [PRODUCTION-CHAINS-2026-05-28](../archive/PRODUCTION-CHAINS-2026-05-28.md)

## Status

Not started. Phase 1 (primitives through Maker's Bench) is archived.
This spec covers the Tier 1 → Tier 2 equipment ladder: smelting, smithing, and
the mid-tier workshops that produce iron and copper goods.

---

## Goal

Extend the existing bootstrapping chain (twigs → craft spot → Maker's Bench)
upward to cover smelting and smithing. The new chain must gate Tier 1 and Tier 2
equipment (see EQUIPMENT-EXPANSION) and create meaningful production decisions
— ore must be mined, smelted, then smithed before any iron item exists.

---

## New Raw Materials

| id            | Name        | Source                      | Tool required | Notes                            |
| ------------- | ----------- | --------------------------- | ------------- | -------------------------------- |
| `copper_ore`  | Copper Ore  | `rocky`, `mountains`        | Stone Pick    | gatherable; common               |
| `iron_ore`    | Iron Ore    | `mountains`, `cave`         | Iron Pick     | rare surface; common underground |
| `coal`        | Coal        | `mountains`, `cave`         | Stone Pick    | fuel for forge; fuelValue: 40    |
| `animal_hide` | Animal Hide | mob loot (wolf, bear)       | —             | drops on kill                    |
| `bone`        | Bone        | mob loot (any)              | —             | crafting component               |
| `animal_fat`  | Animal Fat  | mob loot; cooking byproduct | —             | lamp fuel; fuelValue: 15         |

---

## New Workshops

All workshops follow the existing `BuildingDefinition` pattern with `workshopType`, `workAmount`, `buildingCost`, and `workBonus`.

| id               | Name             | Unlocks                          | Prerequisites                                   | Build cost                                      |
| ---------------- | ---------------- | -------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `stone_forge`    | Stone Forge      | Copper smelting, Tier 1 smithing | Maker's Bench built                             | 20× surface_stone + 5× pine_wood + 2× rope      |
| `tanning_rack`   | Tanning Rack     | Leather working, hide → leather  | None (primitive)                                | 6× pine_wood + 4× rope                          |
| `iron_forge`     | Iron Forge       | Iron smelting, Tier 2 smithing   | Stone Forge built + Basic Metallurgy researched | 30× fired_brick + 10× iron_ingot + 5× pine_wood |
| `pottery_kiln`   | Pottery Kiln     | Fired brick, ceramic items       | Stone Forge built                               | 25× clay_lump + 10× surface_stone               |
| `fletcher_bench` | Fletcher's Bench | Bows, arrows, bolts              | Maker's Bench built                             | 10× pine_wood + 3× rope                         |

---

## New Intermediate Materials

| id             | Name               | Crafted at       | From                                         |
| -------------- | ------------------ | ---------------- | -------------------------------------------- |
| `copper_ingot` | Copper Ingot       | Stone Forge      | 3× copper_ore + 1× coal (fuel consumed)      |
| `iron_ingot`   | Iron Ingot         | Iron Forge       | 4× iron_ore + 2× coal (fuel consumed)        |
| `leather`      | Leather Strip      | Tanning Rack     | 2× animal_hide + 1× salt (or ash)            |
| `fired_brick`  | Fired Brick        | Pottery Kiln     | 3× clay_lump (fuel: 1× coal or 2× pine_wood) |
| `arrow_bundle` | Arrow Bundle (×10) | Fletcher's Bench | 5× twig + 2× flint_shard + 1× plant_fiber    |

---

## Extended Dependency Chain

```
[Phase 1 end] Maker's Bench
    ↓
Pottery Kiln  →  fired_brick
    ↓
Tanning Rack  →  leather  →  leather_armor, hide_wrap
Stone Forge   →  copper_ingot  →  Tier 1 weapons / tools
                                    ↓
                            Basic Metallurgy (research)
                                    ↓
                            Iron Forge  →  iron_ingot
                                    ↓
                            Tier 2 weapons / tools / armor
                                    ↓
                            Advanced Metallurgy (research)
                                    ↓
                            [Phase 3 — steel / enchanted — deferred]
```

---

## Forge Fuel Model

The Stone Forge and Iron Forge consume fuel items each turn they are active (same
mechanism as the existing campfire). Coal is the efficient fuel; pine_wood works
but at half efficiency.

```typescript
// In BuildingDefinition
fuelConsumptionRate: number;  // fuel units per turn when active
acceptedFuels: string[];      // item ids
```

This creates the coal supply chain: mine → smelt → smith. Running out of coal
mid-batch pauses the forge and loses accumulated progress for that item.

---

## Mining Work Category

A new `mining` work category enables ore gathering.

| Property                  | Value                                                     |
| ------------------------- | --------------------------------------------------------- |
| Primary stat              | Strength                                                  |
| Secondary stat            | Constitution                                              |
| Required tool             | Stone Pick (Tier 0) or Iron Pick (Tier 1)                 |
| Required building (bonus) | None required; Stone Forge bonus applies to smelting only |

Stone Pick crafted at Maker's Bench: 3× flint_shard + 4× twig + 2× rope.
Iron Pick crafted at Iron Forge: 1× iron_ingot + 3× pine_wood.

---

## Healthcare & Cooking Jobs

These Phase 2 work types are tracked here since both require production
infrastructure (campfire/kitchen for cooking; healing station for healthcare).

### Cooking

| Property          | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Work category     | `cooking`                                             |
| Primary stat      | Intelligence                                          |
| Required building | Campfire (existing) → Kitchen (new)                   |
| Inputs            | `raw_meat` + optional ingredient (herb, salt, fat)    |
| Output            | `cooked_meal` — nutrition +40%; mood +8 for 300 turns |

Kitchen building: 8× pine_wood + 4× surface_stone. Enables batch cooking (4
meals per job vs 1 at campfire) and recipe variety.

### Healthcare

| Property       | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| Work category  | `healing`                                                        |
| Primary stat   | Intelligence                                                     |
| Secondary stat | Empathy                                                          |
| Required tool  | `herbal_kit` (Maker's Bench: 5× herb + 2× rope)                  |
| Building bonus | Healer's Tent → +30% recovery rate                               |
| Effect         | Restores injured pawn HP: `(pawn.intelligence / 10 + 2)` HP/turn |

Healer's Tent: 6× pine_wood + 4× rope. One healer per patient; healer cannot
take other work while tending.

Add `cooking` and `healing` to `core/Work.ts` in Phase A.

---

## Implementation Plan

### Phase A — Data

- Add new `Item` entries to `core/Items.ts` (raw materials, ingots, intermediates)
- Add new `Building` entries to `core/Buildings.ts` (Stone Forge, Tanning Rack, Pottery Kiln, Iron Forge, Fletcher's Bench)
- Add `mining` entry to `core/Work.ts`

### Phase B — Resource generation

- Add `copper_ore` and `iron_ore` spawns to `resourceGeneratorService` biome tables
- `coal` spawns alongside ore nodes at lower frequency

### Phase C — WorkService + BuildingService

- `BuildingService` handles forge fuel consumption (extends existing campfire pattern)
- `WorkService` adds `mining` job type to the claim/progress flow

---

## Open Questions

- [ ] Can forges overheat / explode? (Phase 3 — hazard system)
- [ ] Copper vs iron quality: separate item IDs or quality field? (separate IDs, simpler)
