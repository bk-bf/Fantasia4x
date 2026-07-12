<!-- LOC cap: 260 (created: 2026-07-10) -->

# ANIMAL HUSBANDRY — Taming, Husbandry, Mounts & Animal Hauling

> **Related:** [ROADMAP](ROADMAP.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE.md) (kingdoms own the caravans + the creatures' `kingdom` flag; hostility derives from `kingdomRelations`) · [ENTITIES_SPAWNING (archived — Phases A–B record)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [CREATURE-COMBAT-OVERHAUL](../archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md) · [PRODUCTION-CHAIN-II §L logistics (archived)](../archive/PRODUCTION-CHAIN-II-2026-06-21.md#l--bulk-logistics-wheelbarrows-carts-roads) · [PRODUCTION-CHAIN-III §E (archived — carcass yields, wool source)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

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

## Kingdom belonging — the unifying model (shared with [KINGDOMS-TRADE](KINGDOMS-TRADE.md))

Every entity **belongs to a kingdom**, and that single fact replaces the two mechanics that are
currently hardcoded per-creature: *who is hostile* and *who sends caravans*.

- **New `kingdom` field on every `CreatureDefinition`** (`creatures.jsonc`). A kingdom id from the
  KINGDOMS-TRADE pool — including "wilderness" polities for beasts (a wolf-pack kingdom, an orc horde,
  a goblin warren). Wolves, worgs, orcs, goblins, kobolds each belong to one.
- **Hostility toward pawns is *derived from `kingdomRelations`*, not the hardcoded
  `behaviour: "aggressive"` / `nocturnalAggro` flags.** A creature attacks a colony pawn on sight in
  exactly two cases: (a) its kingdom is **hostile** to the colony, or (b) **self-defence** — it (or a
  packmate) was attacked. Nothing else makes a creature attack a pawn.
- **Predation never targets pawns.** A carnivore hunts *other animals* to eat (its `diet`/`predator`/
  hunger drive) but does **not** attack pawns from hunger or starvation. This is deliberate: if hungry
  predators mobbed pawns, pawns would kill them in self-defence and the colony's relations would be
  punished for something it didn't start — unfair. Predation stays an animal-vs-animal axis.
- **Killing worsens relations with the victim's kingdom.** Every kill decays the colony↔that-kingdom
  score. So hunting deer and rabbits steadily sours relations with *their* kingdoms — which reads
  in-world as prey **learning to identify the colony as a dangerous predator**: they flee sooner and
  more readily the more you hunt them. Over-hunting a species makes it skittish and scarce near you.
- **Progressively more intelligent variants appear later.** A kingdom's spawn roster escalates its
  `intelligence` tier over game progress / rising contact — early `primitive` beasts, later
  `animal`- and pawn-level `sentient` members. Intelligence gates *how you win them over*: beasts are
  **tamed** (below); pawn-level members are **recruited/negotiated** via the KINGDOMS-TRADE social
  path, not fed.

### Caravans are kingdom pawns (data-wired, cross-links KINGDOMS-TRADE §3)

A trade caravan is **literally a spawned party of that kingdom's entities** — humanoid, pawn-level
`intelligence`, defined in `creatures.jsonc` like any creature (stats, natural weapons, loot pool,
abilities). Composition: a **trader/royal** lead + **strong guards** + **pack/draft animals** carrying
goods + **combat animals** (war beasts). The trade goods are **physically on the caravan** (real items
on the entities, per the physical-production model), not a virtual shop.

- **Arrival likelihood is relation-weighted**, highest → lowest: kingdoms whose members have standing
  **pawn-level relationships** with the colony → **friendly** kingdoms → **neutral** kingdoms.
  **Hostile kingdoms never send caravans or visitors** (they send raids — KINGDOMS-TRADE §3).
- **They march across the map.** A caravan spawns at a **map edge** and travels the full map to the
  colony, **fighting through whatever's in its way** — so it must be genuinely strong (well-equipped
  guards + war beasts). Reaching the colony is not guaranteed; an unlucky caravan can run into a boss
  creature or an elite pack and be wiped before it arrives.
- **Robbing is meant to be hard, and it's an act of war.** Attacking a caravan **immediately flips its
  kingdom hostile** — a massive `kingdomRelations` penalty. Under attack, caravan animals split by
  role: **pack/draft** stock flees, **combat** beasts fight. If the colony destroys **~2/3** of the
  caravan, the remainder **routes** (retreats toward the map edge). An occasional caravan-war crossing
  the map is intended content, not a failure state.
- **Caravan animals carry their caravan's `kingdom`.** They are pre-owned tamed entities wired via
  data — a `TamedAnimal` whose owner is the *kingdom*, not a colony `pawnId`. The data model (below)
  must **track that kingdom-belonging flag** so the colony can't treat a visiting caravan's ox as
  huntable/tameable stock, and so ownership resolves correctly if the caravan is broken.

- [ ] Add `kingdom` to `CreatureDefinition` + resolve it against the KINGDOMS-TRADE kingdom pool.
- [ ] Move pawn-directed hostility off `behaviour`/`nocturnalAggro` onto a `kingdomRelations` lookup;
      creatures attack pawns only on **hostile-kingdom** or **self-defence** (keep flags as fallback
      for unaffiliated wildlife). Every kill applies a relation penalty to the victim's kingdom.
- [ ] `TamedAnimal.ownerKingdomId?` (nullable) alongside `ownerPawnId` — caravan stock reads the
      former; distinguish **draft** (flees when attacked) from **combat** (fights) roles.
- [ ] Caravan as a cross-map fighting march: edge spawn/despawn, ~2/3-casualty rout, attack →
      kingdom-hostile (spec'd in KINGDOMS-TRADE §3; this spec owns the animal roles).

---

## Phase C — Taming (feed-to-tame)

Taming is an **active feeding job**, not a passive proximity roll. A pawn on the `feed` job carries a
food item to a target creature and feeds it over repeated visits; each feeding rolls the pawn's
effective handling skill against the creature's **`wilderness`**.

- **`wilderness` stat on `creatures.jsonc`** — **renames the existing `tameResistance`** into one
  tame-difficulty axis (higher = wilder, harder to win over; migrate current 0.3–0.9 values).
- **New `feed` colony job** (`jobs.jsonc`) — new behaviour: steer a pawn to fetch an acceptable food
  item, approach the target, and feed it; repeats until tamed or the creature flees/dies.
- **Per-feeding success roll** — pawn's effective handling skill vs `creature.wilderness`. Pawn skill
  builds from:
  - base `taming` skill (+ CHA/empathy),
  - **favorite-food** match — new **`favoriteTameFood`** field per creature: a **list** of item ids
    (from `items.jsonc`) that creature will accept for taming, and feeding one is a big multiplier.
    Wolves/worgs → basically all raw meats; a rabbit → a vegetable/forage item; etc. (a mis-matched
    food still works but far weaker),
  - **kingdom relationship** (friendlier toward the creature's `kingdom` → easier to tame its beasts).
- Each feeding consumes 1 food item. On success: entity → `Tamed`, `TamedAnimal` with owner `pawnId`,
  added to `GameState.tamedAnimals[]`.
- **The feed-tame gate is the `intelligence` tier** (not the old `tameable` boolean):
  `primitive`/`animal` → feed-tameable; **`sentient` (pawn-level) → recruit/negotiate only** via the
  KINGDOMS-TRADE social path. This is the same tier that escalates a kingdom's roster over time.

- [ ] Add `taming` work category (`core/Work.ts`) + `feed` job (`jobs.jsonc` + `JobService` handler +
      `Job['type']`).
- [ ] Rename `tameResistance` → `wilderness`; add `favoriteTameFood: string[]` to `CreatureDefinition`
      and populate it across `creatures.jsonc` (wolf/worg raw meats, rabbit a veggie, …).
- [ ] `EntityService.attemptTame(pawnId, entityId, state)` — per-feeding roll (skill vs `wilderness`,
      folding favorite-food + kingdom-relationship modifiers).
- [ ] Promote entity to `TamedAnimal` on success; gate feed-taming by `intelligence` tier
      (`sentient` → recruit-only).

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

## Resolved (2026-07-10)

- **Aggression:** creatures attack pawns only on **hostile-kingdom** or **self-defence** — never from
  predation/hunger. Killing decays relations with the victim's kingdom (prey learn to fear the colony).
- **`wilderness`** is a straight **rename of `tameResistance`** (one difficulty axis).
- **`favoriteTameFood`** is an explicit **per-creature list** of accepted `items.jsonc` ids (wolf/worg
  raw meats, rabbit a veggie), not derived from `diet`/`eats`.
- **Feed-tame gate** is the **`intelligence` tier** (`primitive`/`animal` tame; `sentient` recruit-only).
- **Caravans** are strong cross-map fighting marches (edge spawn/despawn); attacking → kingdom hostile
  + massive relation penalty; draft animals flee, combat animals fight; ~2/3 casualties → rout.
- **`favoriteTameFood`** is an explicit per-creature list of `items.jsonc` ids.
- **Creature `kingdom` grouping:** a shared **`beast`** kingdom (wolves, worgs, bears, and the rest of
  the wildlife), a **`goblinoid`** kingdom (orcs + goblins), and **kobolds** get their **own** kingdom.
  `beast` is a non-culture *wilderness* polity; `goblinoid`/`kobold` are culture-derived like the rest.

## Open Questions

- [ ] **Relation-decay tuning** — per-kill penalty size, and does it differ by species intelligence /
      whether the kill was self-defence vs a hunt? Does a kingdom relation ever *recover* over time?
- [ ] Cart mechanic model: vehicle entity on map vs equippable cart (budget override) vs deployable
      site + batch-haul job?
- [ ] Do tamed animals persist across saves? (yes — serialise `tamedAnimals[]`)
- [ ] Vet work category for healing injured mounts? (Phase E2)
- [ ] Magic-tamed creatures (shadow familiar, etc.)? (Phase 3)
