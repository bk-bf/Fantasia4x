<!-- LOC cap: 260 (created: 2026-07-10) -->

# ANIMAL HUSBANDRY — Taming, Husbandry, Mounts & Animal Hauling

> **Related:** [ROADMAP](ROADMAP.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE.md) (kingdoms own the caravans + the creatures' `kingdom` flag; hostility derives from `kingdomRelations`) · [ENTITIES_SPAWNING (archived — Phases A–B record)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [CREATURE-COMBAT-OVERHAUL](CREATURE-COMBAT-OVERHAUL.md) · [PRODUCTION-CHAIN-II §L logistics (archived)](../archive/PRODUCTION-CHAIN-II-2026-06-21.md#l--bulk-logistics-wheelbarrows-carts-roads) · [PRODUCTION-CHAIN-III §E (archived — carcass yields, wool source)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

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
- **Hostility is *derived from `kingdomRelations`*, not the hardcoded `behaviour: "aggressive"` /
  `nocturnalAggro` flags.** Whether a creature attacks a colony pawn on sight comes from the
  colony↔its-kingdom relation, so the same roster can be friend or foe per game. (The current
  `behaviour`/`nocturnalAggro` fields become the *default/fallback* disposition for unaffiliated
  wildlife — see Open Questions on how predation coexists with this.)
- **Predation stays a separate axis.** A carnivore still hunts prey to *eat* (its `diet`/`predator`/
  hunger drive), independent of political hostility — a wolf-kingdom at peace with the colony still
  eats deer, and may still get dangerous when starving. Kingdom relation governs *pawn-directed*
  aggression only.
- **Progressively more intelligent variants appear later.** A kingdom's spawn roster escalates its
  `intelligence` tier over game progress / rising contact — early `primitive` beasts, later
  `animal`- and pawn-level `sentient` members. Intelligence gates *how you win them over*: beasts are
  **tamed** (below); pawn-level members are **recruited/negotiated** via the KINGDOMS-TRADE social
  path, not fed.

### Caravans are kingdom pawns (data-wired, cross-links KINGDOMS-TRADE §3)

A trade caravan is **literally a spawned party of that kingdom's entities** — humanoid, pawn-level
`intelligence`, defined in `creatures.jsonc` like any creature (stats, natural weapons, loot pool,
abilities). Composition: a **trader/royal** lead + **strong guards** + any **pack/draft animals**
carrying the goods. The trade goods are **physically on the caravan** (real items on the entities, per
the physical-production model), not a virtual shop.

- **Arrival likelihood is relation-weighted**, highest → lowest: kingdoms whose members have standing
  **pawn-level relationships** with the colony → **friendly** kingdoms → **neutral** kingdoms.
  **Hostile kingdoms never send caravans or visitors** (they send raids — KINGDOMS-TRADE §3).
- **Caravan animals carry their caravan's `kingdom`.** They are pre-owned tamed entities wired via
  data — a `TamedAnimal` whose owner is the *kingdom*, not a colony `pawnId`. This spec's data model
  (below) must **track that kingdom-belonging flag** on caravan animals so the colony can't treat a
  visiting caravan's ox as huntable/tameable stock, and so capturing one (if the caravan is attacked)
  transfers ownership correctly.

- [ ] Add `kingdom` to `CreatureDefinition` + resolve it against the KINGDOMS-TRADE kingdom pool.
- [ ] Move pawn-directed hostility off `behaviour`/`nocturnalAggro` onto a `kingdomRelations` lookup
      (keep the flags as fallback for unaffiliated wildlife).
- [ ] `TamedAnimal.ownerKingdomId?` (nullable) alongside `ownerPawnId` — caravan stock reads the former.

---

## Phase C — Taming (feed-to-tame)

Taming is an **active feeding job**, not a passive proximity roll. A pawn on the `feed` job carries a
food item to a target creature and feeds it over repeated visits; each feeding rolls the pawn's
effective handling skill against the creature's **`wilderness`**.

- **New `wilderness` stat on `creatures.jsonc`** — how hard the creature is to win over (higher =
  wilder, harder). This is the tame-difficulty axis (see Open Questions: replace vs. augment the
  existing `tameResistance`).
- **New `feed` colony job** (`jobs.jsonc`) — new behaviour: steer a pawn to fetch an acceptable food
  item, approach the target, and feed it; repeats until tamed or the creature flees/dies.
- **Per-feeding success roll** — pawn's effective handling skill vs `creature.wilderness`. Pawn skill
  builds from:
  - base `taming` skill (+ CHA/empathy),
  - **favorite-food** match (new `favoriteFood` field per creature — the right food is a big multiplier),
  - **kingdom relationship** (friendlier toward the creature's `kingdom` → easier to tame its beasts).
- Each feeding consumes 1 food item. On success: entity → `Tamed`, `TamedAnimal` with owner `pawnId`,
  added to `GameState.tamedAnimals[]`. Pawn-level `intelligence` creatures are **not** feed-tamed —
  route them to recruitment/diplomacy (KINGDOMS-TRADE).

- [ ] Add `taming` work category (`core/Work.ts`) + `feed` job (`jobs.jsonc` + `JobService` handler +
      `Job['type']`).
- [ ] Add `wilderness` + `favoriteFood` to `CreatureDefinition`.
- [ ] `EntityService.attemptTame(pawnId, entityId, state)` — per-feeding roll (skill vs `wilderness`,
      folding favorite-food + kingdom-relationship modifiers).
- [ ] Promote entity to `TamedAnimal` on success; gate feed-taming to non-`sentient` intelligence.

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

- [ ] **Predation vs kingdom-hostility** — how do the two aggression drives coexist? A wolf at peace
      with the colony still hunts (hunger) and may still be dangerous; a "hostile-kingdom" beast
      attacks pawns on sight. Is predation a hunger-gated override on top of the relation lookup, or
      does relation only suppress *unprovoked* pawn aggression while hunting/defence always fire?
- [ ] **`wilderness` vs existing `tameResistance`** — is `wilderness` a rename/replacement of the
      current `tameResistance` (0.3–0.9) field, or a second, separate axis (e.g. difficulty vs.
      flight-risk)?
- [ ] **Intelligence gate** — where's the line between feed-tameable "beast" and
      recruit/negotiate-only "pawn-level"? By `intelligence` tier exactly, or a per-creature
      `tameable` flag as today?
- [ ] **Capturing caravan animals** — if the player attacks a caravan, do its `ownerKingdomId` animals
      become huntable/tameable stock, or do they flee/despawn with the routed caravan?
- [ ] **`favoriteFood` source** — new explicit field, or derived from `diet`/`eats` (e.g. first
      preferred entry)?
- [ ] Cart mechanic model: vehicle entity on map vs equippable cart (budget override) vs deployable
      site + batch-haul job?
- [ ] Do tamed animals persist across saves? (yes — serialise `tamedAnimals[]`)
- [ ] Vet work category for healing injured mounts? (Phase E2)
- [ ] Magic-tamed creatures (shadow familiar, etc.)? (Phase 3)
