<!-- LOC cap: 260 (created: 2026-07-10) -->

# ANIMAL HUSBANDRY — Taming, Husbandry, Mounts & Animal Hauling

> **Related:** [ROADMAP](ROADMAP.md) · [ENTITIES_SPAWNING (archived — Phases A–B record)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [CREATURE-COMBAT-OVERHAUL](CREATURE-COMBAT-OVERHAUL.md) · [PRODUCTION-CHAIN-II §L logistics (archived)](../archive/PRODUCTION-CHAIN-II-2026-06-21.md#l--bulk-logistics-wheelbarrows-carts-roads) · [PRODUCTION-CHAIN-III §E (archived — carcass yields, wool source)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

## Status

**Not started — deferred content expansion (ROADMAP Phase 3 #9).** Split out of
[ENTITIES_SPAWNING](../archive/ENTITIES_SPAWNING-2026-07-10.md) on 2026-07-10: Phases A / A.5 / B
(spawn model, lairs, hunger/diet, pawn hunting + butchery) shipped and were archived. This spec holds
the remaining forward content — **taming → husbandry → mounts**, and the **animal-hauling** rungs of
the logistics progression that hard-block on husbandry. Phase E (mounts) needs combat (done). All the
shared entity infrastructure (`Mob` type, `EntityService`, `TamedAnimal`, FSM) already exists.

The neutral-animal roster, `CreatureDefinition` shape, `tameable`/`mountable` flags, and the
`Tamed`/`Foraging`/`Hunting` FSM states are all defined in the archived record — this spec references
them rather than re-stating them.

---

## Phase C — Taming

Pawn with `taming` job approaches a target animal carrying an acceptable food item. Taming chance per
turn:

```
chance = (pawn.empathy + pawn.skills.taming × 2) / 100
        × foodQualityMod
        × creature.tameResistance  // 1.0 = easy, 0.3 = hard
```

Food quality mods: `raw_meat` ×0.8, `cooked_meat` ×1.2, preferred_food ×1.5 (per creature def). Taming
consumes 1 food item per attempt. Taming fails immediately if the pawn attacks while the animal is not
Exhausted → recommend: weaken first (combat), then tame while Exhausted. On success: entity → `Tamed`,
assigned to pawn, added to `GameState.tamedAnimals[]` with owner `pawnId`.

- [ ] Add `taming` work category (`core/Work.ts`).
- [ ] `EntityService.attemptTame(pawnId, entityId, state)` — per-turn chance roll.
- [ ] Promote entity to `TamedAnimal` on success.

## Phase D — Husbandry

Tamed animals require a **Pasture** building (fenced area, 4×4 min). Animals assigned to a pasture
consume `grass`/`feed` each day.

| Animal | Product | Interval |
| --- | --- | --- |
| Mountain Goat | `milk` ×2 | 300 turns (1 day) |
| Wild Chicken | `egg` ×1 | 200 turns |
| Any breeding pair | offspring | 3000 turns (10 days) |

Pasture capacity: 1 animal per 4 pasture tiles. Breeding requires one male + one female of the same
species in the same pasture; offspring are unassigned tamed animals. New `milk`/`egg` items feed the
cooking chain (**and close the PROD-CHAIN-III §E dairy/wool-source stub — live-shear sheep + a dairy
source belong here**).

- [ ] Add `Pasture` to `core/Buildings.ts`; tile-capacity rule.
- [ ] Add `husbandry` work category (collect milk/eggs, assign breeding).
- [ ] Daily product generation in `EntityService.stepHusbandry(state)`.
- [ ] Cross-link PROD-CHAIN-III §E: a dedicated `sheep` creature with a wool `produces` (the clean
      live-shear source the leather/wool split was waiting on).

## Phase E — Riding

Tamed `mountable` animals can be assigned as a mount. While mounted: movement = max(pawn, mount)+1;
cross `shallow_water` free; melee reach → 2; **Mounted Charge** ability (move 3 in a line, attack at
end +30% dmg, 4 AP). Mount takes hits separately; injured mount slows to base pawn speed until healed
(vet work — Phase E2, deferred).

| id | Name | Speed | Terrain bonus | Notes |
| --- | --- | --- | --- | --- |
| `elk` | Elk | +2 | forest (no penalty) | Tier 1 if tamed |
| `warhorse` | Warhorse | +3 | open terrain | Tier 2; bred from wild horse (Phase 2) |

- [ ] Add `mountId` to `Pawn` (nullable).
- [ ] `ModifierSystem` checks `pawn.mountId` for movement/combat bonuses.
- [ ] Add `Mounted Charge` to `core/Abilities.ts`.

---

## Phase F — Animal hauling (the logistics backbone)

> The pawn-pushed wheelbarrow/handcart/road rungs already shipped in PRODUCTION-CHAIN-II §L. The
> **animal-hauling rungs (pack/draft)** are the natural extension of Phases C–D and hard-block on them —
> they live here.

**Core principle (the spine):** split **personal carry** from **bulk logistics**.

- _Personal carry_ (pouches → backpacks → eventually a "bag of holding"): kit, tools, small/medium
  goods. **Hard-capped low by realism** — must _never_ scale to stacks of ore/logs/hay.
- _Bulk logistics_ (carts → pack/draft animals): the **only** way to move heavy/bulky goods at
  quantity. Separate budget entirely.

| Rung | Mechanic | Role |
| --- | --- | --- |
| Worn — light | bronze/leather light pack | small cap, ~no encumbrance → scouts/skirmishers |
| Worn — heavy | iron-framed backpack | big personal cap but real move/evasion penalty; dedicated haulers |
| Bulk — near base | handcart/wheelbarrow (**shipped, §L**) | pawn-pushed; wants roads |
| Bulk — anywhere | **pack animal** (panniers) | tamed/bred draft stock, follows a hauler through terrain a cart can't |
| Bulk — long haul | **draft animal + cart** | roads, big capacity; the big-map spine (1000×1000) |
| Late / magic | bag of holding | _personal_, weightless kit only; gate hard (bind-on-use / mana upkeep) |

- [ ] Confirm the personal-carry vs bulk-logistics hard rule before any pack/cart work.
- [ ] Draft/pack animal roster + breeding for draft stock (reuse `TamedAnimal` + Phase D/E infra).
- [ ] Backpack encumbrance → movement/evasion penalty in `ModifierSystem` (enables the light-vs-heavy fork).

**Portals — deliberately deferred:** not a map-logistics shortcut. Reframed as portals to _another
dimension_ (nether-like, unknown/hostile exit) — a separate exploration/risk system, capstone-tier.
Pure speculation.

---

## Turn Order Insertion

```
1. Needs → 2. Work → 3. Completions → 4. Exploration → 5. ENTITY STEP (stepEntities + stepHusbandry) → 6. Events
```

## Open Questions

- [ ] Cart mechanic model: vehicle entity on map vs equippable cart (budget override) vs deployable
      site + batch-haul job?
- [ ] Do tamed animals persist across saves? (yes — serialise `tamedAnimals[]`)
- [ ] Vet work category for healing injured mounts? (Phase E2)
- [ ] Magic-tamed creatures (shadow familiar, etc.)? (Phase 3)
