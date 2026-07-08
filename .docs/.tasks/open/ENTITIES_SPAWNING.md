<!-- LOC cap: 320 (created: 2026-06-03) -->

# ENTITY SPAWNING (Mobs, Animals, Taming & Husbandry)

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) (archived) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (archived) · [PRODUCTION-CHAIN-II](../archive/PRODUCTION-CHAIN-II-2026-06-21.md) (§L logistics) · [PRODUCTION-CHAIN-III](PRODUCTION-CHAIN-III.md) (§E carcass yields, beast hides, wool/leather split) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [SEASONS_WEATHER](../archive/SEASONS_WEATHER-2026-06-17.md) (archived) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

## Status

**Phases A and A.5 complete.** `Mob` type, `EntityService`, `Creatures.ts`, rendering, click/hover HUD cards, ENTITIES tab, hunger/diet/starvation/eatProgress — all done.
Phases B–E not started. Two entity classes share the infrastructure: hostile mobs (threat)
and neutral animals (food/taming/mounts).

**Spawn model REVISED → lair / territory system (implemented).** The original "DF-like edge
spawner, no territory" plan (the superseded MOB-SPAWNING stub, doc deleted) was
replaced: hostile packs now live in **lairs** — rare `lair: true` resource tiles they are bound to
and leashed within — while only **free-roaming wildlife** (prey/neutral) is seeded across the open
map. See "Spawn Model" below; this is the part the lair switch rewrote.

---

## Entity Classes

| Class              | Disposition               | Phases                                                                      |
| ------------------ | ------------------------- | --------------------------------------------------------------------------- |
| **Hostile mob**    | Attacks pawns; may steal  | Phase A–E (combat blocker)                                                  |
| **Neutral animal** | Flees; huntable; tameable | Phase A (spawn/flee), B (hunt/butcher), C (tame), D (husbandry), E (riding) |

Both use the same `Mob` type and FSM infrastructure. Class is determined by
`behaviour` field and `tameable` flag on `CreatureDefinition`.

---

## Spawn Model (IMPLEMENTED — lair / territory)

The map carries **two distinct populations**, seeded and maintained separately
(`services/entity/entitySpawning.ts`). This replaced the original "DF-like edge spawner, no
territory" design — the superseded MOB-SPAWNING stub (doc deleted).

### 1. Free-roaming wildlife (prey + neutral roamers)

Creatures with **no `lair`** are scattered across the open map.

| Parameter                | Value                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| Initial seed             | area-scaled (`targetEntityCount`, ~325 on a 500×500 map), roster cycled for variety |
| Periodic top-up          | `spawnEntities` rolls on a 20 s cadence (`SPAWN_CHECK_INTERVAL`)        |
| Night weight multiplier  | ×3 (`NIGHT_SPAWN_MULT`) when `ambientLight < 0.3`                       |
| Spawn edge buffer        | 8 tiles from map edge (`EDGE_BUFFER`)                                   |
| Min pawn distance        | 12 tiles — never spawn a pack on the colony (`MIN_PAWN_DISTANCE`)       |
| Caps                     | area-scaled `populationCaps` (profiler path uses flat `MAX_HOSTILE`/`MAX_NEUTRAL` 40) |

Tile choice is biome-weighted (`findSpawnTile`): only walkable forest/plains/swamp land (never
water/mountain unless `spawnsInMountain`), accepted probabilistically by `biomeWeights`. `nightOnly`
creatures (e.g. the wraith) come **only** from the periodic spawner at night.

### 2. Laired hostiles (bound packs) — the territory system

Dangerous packs do **not** free-roam. A creature with a **`lair`** field is bound to a matching
**`lair: true` resource tile** (`resources.jsonc`): `wolf_den`, `predator_den`, `goblin_warren`,
`swamp_nest`, `harpy_roost`. These are **rare landmark tiles** scattered at world-gen on
biome-appropriate subterrains (tiny spawn probabilities, listed first so each gets a fair roll).

- **Seeding** (`seedLairs`): every lair tile seeds **one bound pack** of a creature whose `lair`
  matches the tile's resource id. Each member is anchored with a stable `lairId` + `lairX/lairY` +
  `lairRange`. Lair tiles are the **sole source** of laired hostiles — they never come from the
  periodic spawner or the wildlife seed.
- **Territory leash** (`entityAI.stepHostile`): a laired mob only wanders/aggros within `lairRange`
  (Chebyshev) of its anchor. Stray beyond it (drifted or over-chased) → it abandons the action and
  heads home; it only **engages a pawn that is inside its territory** (pawns passing outside are seen
  but ignored, so the player can travel safely between lairs). `Fleeing`/`Exhausted` are exempt —
  survival overrides territory. A mob **never adopts another lair**.
- **Slow metabolism** (`hungerRate < 1`, `foodOverflow`): a leashed pack isn't on a starvation clock —
  it idles its territory and hunts opportunistically rather than starving and roaming.
- **Lifecycle** (`tickLairs`, once per in-game day, `LAIR_TICK_INTERVAL`):
  - **Repopulate** — an emptied (pack wiped) but un-destroyed lair re-occupies after ~weeks
    (`LAIR_REPOP_CHANCE` 0.08/day).
  - **Grow** — while below the world cap (`maxLairCount`), a new lair grows on a random eligible tile
    after ~weeks (`LAIR_GROW_CHANCE` 0.06/day), never on an occupied tile.
  - **Destroy** — the lair tile is destructible via the DESTROY designation (`foraging` work,
    `workAmount` 80); razing it stops both repopulation and growth. *(TODO in data: drop loot on
    destroy — a cleared den should reward the player.)*

**Design intent:** keep the map from being a churning mass of free-hunting hostiles. Threat is
**place-based** — the player learns where the dens are, routes around them, and can choose to clear
one. Each lair type carries an ambient particle "tell" (smoke / bloodmist / miasma / flies / feathers)
so a den reads as dangerous from a distance.

### Creature definition (shape)

```typescript
interface CreatureDefinition {
  id: string;
  name: string;
  glyph: string;
  color: string;
  entityClass: 'mob' | 'animal';
  diet: 'herbivore' | 'carnivore' | 'omnivore'; // drives feeding FSM
  stats: { health: number; strength: number; speed: number; visionRange: number };
  behaviour: 'passive' | 'neutral' | 'aggressive';
  tameable: boolean;
  mountable: boolean; // eligible as riding mount (Phase E)
  biomeWeights: Partial<Record<TerrainType, number>>;
  lootTable: Array<{ itemId: string; chance: number; qty: [number, number] }>;
  xpValue: number;
  // ── Lair / territory binding (omitted = free roamer) ─────────────────────
  lair?: string;        // matching `lair: true` resource id; bound + leashed to it
  lairRange?: number;   // leash radius in tiles (tight for dangerous packs, wide ~80–100 far-rangers)
  hungerRate?: number;  // <1 = slow metabolism so a leashed pack doesn't starve/roam
  foodOverflow?: number;// laired predators hunt opportunistically before fully hungry
}
```

---

## Hostile Mob Roster (Phase 1)

| id              | Name          | Behaviour                     | Biomes              | Notes                         |
| --------------- | ------------- | ----------------------------- | ------------------- | ----------------------------- |
| `wolf`          | Wolf          | neutral → aggressive at night | forest, deep_forest | spawns in pack 1–3            |
| `bear`          | Cave Bear     | neutral                       | mountains, forest   | high HP + damage              |
| `goblin`        | Goblin        | aggressive                    | deep_forest, swamp  | can steal items               |
| `giant_rat`     | Giant Rat     | passive                       | grass, dirt, swamp  | intro-level threat            |
| `shadow_wraith` | Shadow Wraith | aggressive                    | any (night only)    | requires `ambientLight < 0.3` |

---

## Neutral Animal Roster (Phase 1)

| id              | Name          | Biomes            | Loot                                   | Tameable | Mountable | Notes                     |
| --------------- | ------------- | ----------------- | -------------------------------------- | -------- | --------- | ------------------------- |
| `deer`          | Deer          | forest, grass     | raw_meat ×3, animal_hide ×2            | hard     | no        | herds of 2–5              |
| `rabbit`        | Rabbit        | grass, forest     | raw_meat ×1                            | no       | no        | plentiful; easy hunt      |
| `boar`          | Wild Boar     | forest, swamp     | raw_meat ×4, bone ×2, tusk ×1          | medium   | no        | charges if health < 40%   |
| `elk`           | Elk           | forest, mountains | raw_meat ×6, animal_hide ×3, antler ×2 | hard     | yes       | Phase E mount             |
| `mountain_goat` | Mountain Goat | mountains         | raw_meat ×2, animal_hide ×1            | easy     | no        | milk when tamed (Phase D) |
| `wild_chicken`  | Wild Chicken  | grass, dirt       | raw_meat ×1                            | easy     | no        | eggs when tamed (Phase D) |

---

## Entity FSM (shared)

### Hostile mob states

1. **Wander** — random tile drift 0–2 tiles/turn, new target every 5–10 turns
2. **Alerted** — pawn in `visionRange`; move toward nearest pawn
3. **Attacking** — adjacent to pawn; trigger combat (COMBAT-SYSTEM)
4. **Fleeing** — HP < 20%; move away from all pawns

### Neutral animal states

1. **Grazing** — slow drift within home range (10-tile radius); like Wander
2. **Startled** — pawn within `visionRange`; freeze 1 turn then transition to Fleeing
3. **Fleeing** — sprint away from threat at +1 tile/turn bonus
4. **Exhausted** — after 20 turns of Fleeing; slows to normal speed (huntable)
5. **Tamed** (persistent) — follows assigned pawn; no longer flees; see Phase C
6. **Foraging** (Phase A.5) — herbivore/omnivore moving toward a grass tile to eat
7. **Hunting** (Phase A.5) — carnivore/omnivore pursuing nearest non-tamed animal or Corpse

FSM transitions for neutral animals:

- Grazing → Startled: pawn within `visionRange`
- Startled → Fleeing: any move or attack
- Fleeing → Grazing: no pawn in `visionRange × 1.5` for 15 turns
- Fleeing → Exhausted: 20 turns in Fleeing state
- Any → Tamed: taming action succeeds (Phase C)
- Any → Foraging: `hunger >= 60` AND not threatened AND `diet` is herbivore/omnivore
- Any → Hunting: `hunger >= 60` AND not threatened AND `diet` is carnivore/omnivore
- Foraging/Hunting → previous state: `hunger <= 10` (sated)

---

## Phase A.5 — Entity Hunger & Diet

> Prerequisite for Phases B (hunting) and D (husbandry). Can be implemented
> independently of combat. Adds a simulation heartbeat to the entity layer.

### Data model

Entities reuse the same `EntityNeeds`, `EntityCondition[]`, and `EntityStats` types as
pawns — no dumbed-down duplicates. Abilities are **never** computed for entities.

```typescript
// Fields added to Mob (implemented in types.ts)
interface Mob {
  needs: EntityNeeds; // same type as Pawn.needs; sleep fields set to defaults
  conditions?: EntityCondition[]; // progressive conditions (malnutrition, wounds, etc.)
  stats: EntityStats; // mapped from CreatureDefinition.stats at spawn
  eatProgress?: number; // 0–1 progress through current eat action
  huntTargetId?: string; // id of target Mob when in Hunting state
}

// EntityStats mapping from CreatureDefinition.stats:
// strength     → strength   (direct)
// speed        → dexterity  (×1.5 rounded)
// visionRange  → wisdom     (perception)
// health       → constitution (10 + (health - 30) / 5)
// entityClass  → intelligence (animal=4, mob=8)
// charisma     = 5 (default)
```

The shared condition helper `conditionNeedMultipliers()` lives in
`core/needs.ts` — used by both `PawnService` and `EntityService`.

### Hunger accrual

| Diet      | Base rate (×SECONDS_PER_TICK) | Notes                   |
| --------- | ----------------------------- | ----------------------- |
| herbivore | 0.5 / s                       | slow — always near food |
| carnivore | 1.0 / s                       | faster — must hunt      |
| omnivore  | 0.7 / s                       | middle ground           |

Condition stage multipliers from `EntityCondition[]` are applied on top via
`conditionNeedMultipliers()` (shared with `PawnService`).

Starvation (`hunger >= 100`): entity loses 1 HP / second until it eats or dies.

### Feeding mechanics

**Herbivore / omnivore — Foraging state:**

1. Entity transitions to `Foraging` when `hunger >= 60` and not threatened.
2. Pathfinds toward nearest tile with `resources.grass > 0` within 15-tile radius.
3. On arrival: plays `eatProgress` 0 → 1 over 5 ticks. Consumes 1 `grass` from tile.
4. On completion: `hunger -= 40`; back to `Grazing`/`Wander`.
5. If no grass found within radius: wanders toward map-center home range.

**Carnivore / omnivore — Hunting state:**

1. Entity transitions to `Hunting` when `hunger >= 60` and not threatened.
2. Targets: nearest `Corpse` first (free food); else nearest non-Tamed `animal`.
3. Pursues target via same `moveToward` as Alerted state; sets `huntTargetId`.
4. Adjacent to Corpse: begins `eatProgress` 0 → 1 over 8 ticks; then `hunger -= 50`.
5. Adjacent to live animal: triggers a mini-combat roll (STR vs STR); on kill —
   entity enters step 4 on the resulting Corpse.
6. If target dies/decays before arrival: clear `huntTargetId`, re-evaluate.

### Progress bar rendering

When `eatProgress > 0`, `GameCanvas` should render a progress bar overlay on the
entity tile (same `worldEffects` pipeline used for pawn tasks). The existing
`SelectedEntityCard.progressBar` field surfaces it in the HUD info card too.

### Relationship to pawn hunger

Entities deliberately do **not** call `calculatePawnAbilities()` — that system
is pawn-only. They share the **type** layer (`EntityNeeds`, `EntityCondition[]`,
`EntityStats`) and the condition-multiplier helper, but skip abilities entirely.

### Entity vs Pawn systems — intentional boundaries

| System     | Pawns                          | Entities                                    |
| ---------- | ------------------------------ | ------------------------------------------- |
| Health     | `pawn.state.health` + ModSys   | `mob.health` / `mob.maxHealth` (simple HP)  |
| Stats      | Race traits + ModifierSystem   | `mob.stats: EntityStats` (no modifier calc) |
| Needs      | `EntityNeeds` (hunger/fatigue) | **Shared** `EntityNeeds` type — same fields |
| Conditions | `EntityCondition[]`            | **Shared** `EntityCondition[]` type         |
| Abilities  | calculatePawnAbilities()       | **Not called** for entities                 |
| FSM        | `PawnState` + job queue        | `MobState` autonomous                       |
| Movement   | PathfindingService (WASM)      | EntityService simple `moveToward`           |
| Rendering  | `pawnRenderPos` smooth interp  | `mobRenderPos` smooth interp (fixed)        |

---

## Phase B — Hunting & Butchering

### Hunting work category

Pawn with `hunting` job designation pursues the nearest non-tamed `animal`
entity using the WASM pathfinder. Attack resolved with existing weapon stats
minus a range penalty for moving targets.

| Property       | Value                                                 |
| -------------- | ----------------------------------------------------- |
| Primary stat   | Dexterity                                             |
| Secondary stat | Perception                                            |
| Required tool  | Any weapon (ranged preferred for +20% hit on Fleeing) |
| Skill gain     | `hunting` skill (separate from `combat`)              |

Hit chance while target is Fleeing: `(dex - 10) × 2 + weaponAccuracy - 20`.
Hit chance while target is Exhausted or Grazing: no penalty.

On kill: entity health → 0, entity state → `Corpse`. Corpse tile-entity persists
for 200 turns before degrading to nothing (losing all loot).

### Butchering work category

Pawn walks to Corpse tile, performs `butchering` job.

| Property       | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Primary stat   | Strength                                                  |
| Tool bonus     | Butcher's Cleaver (Tier 1 tool, Stone Forge) → +50% yield |
| Work amount    | `creature.stats.health × 0.3` turns                       |
| Building bonus | Butcher's Block building → +1 quality yield tier          |

Yield is drawn from `lootTable`. Without cleaver: 60% of listed qty. With
cleaver: 100%. Butcher's Block: 100% + bonus bone/fat chance.

---

## Phase C — Taming

Pawn with `taming` job approaches target animal carrying an acceptable food
item in inventory. Taming chance per turn:

```
chance = (pawn.empathy + pawn.skills.taming × 2) / 100
        × foodQualityMod
        × creature.tameResistance  // 1.0 = easy, 0.3 = hard
```

Food quality mods: raw_meat × 0.8, cooked_meat × 1.2, preferred_food × 1.5
(per creature definition). Taming consumes 1 food item per attempt.

Taming fails immediately if pawn attacks while animal is not Exhausted.
Recommend: weaken first (combat), then tame while Exhausted.

On success: entity gains state `Tamed`, assigned to pawn, added to
`GameState.tamedAnimals[]` with owner pawnId.

---

## Phase D — Husbandry

Tamed animals require a **Pasture** building (fenced area, 4×4 minimum).
Animals assigned to a pasture consume `grass` or `feed` each day.

| Animal            | Product   | Interval             |
| ----------------- | --------- | -------------------- |
| Mountain Goat     | `milk` ×2 | 300 turns (1 day)    |
| Wild Chicken      | `egg` ×1  | 200 turns            |
| Any breeding pair | offspring | 3000 turns (10 days) |

Pasture capacity: 1 animal per 4 pasture tiles.
Breeding requires one male + one female of the same species in the same pasture.
Offspring are unassigned tamed animals.

New `milk` and `egg` items feed into the cooking chain (cooking service).

---

## Phase E — Riding

Tamed `mountable` animals can be assigned as a mount to a pawn.

```typescript
interface Pawn {
  // ...existing...
  mountId: string | null; // TamedAnimal id
}
```

While mounted:

- Movement speed: pawn speed + mount.speed (not added — takes higher value + 1)
- Can cross `shallow_water` without penalty
- Melee attack range extends to 2 (charge reach)
- New ability: **Mounted Charge** — move 3 tiles in a line, attack at end with +30% damage; costs 4 AP

Mount can be injured in combat (takes hits separately from pawn). Injured mount
slows to base pawn speed until healed (vet work category, Phase E2 — deferred).

### Mount roster (Phase 1)

| id         | Name     | Speed | Terrain bonus       | Notes                                  |
| ---------- | -------- | ----- | ------------------- | -------------------------------------- |
| `elk`      | Elk      | +2    | forest (no penalty) | available Tier 1 if tamed              |
| `warhorse` | Warhorse | +3    | open terrain        | Tier 2; bred from wild horse (Phase 2) |

---

## Implementation Plan

- [x] **Phase A — Shared entity layer**
  - [x] Add `Mob` interface to `core/types.ts` (id, creatureId, x, y, health, state, entityClass)
  - [x] Add `mobs: Mob[]`, `tamedAnimals: TamedAnimal[]` to `GameState`
  - [x] Add `core/Creatures.ts` with all hostile + neutral definitions
  - [x] `EntityService` singleton (renamed from `MobService`): `spawnEntities()`, `stepEntities()`, `removeDead()`
  - [x] Rendering: draw all `mobs[]` via existing glyph pipeline in `GameCanvas.svelte`
  - [x] Click-to-select mob with locked HUD info card
  - [x] Hover mob shows dim HUD info card (parity with pawns)
  - [x] ENTITIES tab (F9) listing live mobs with focus-on-map
- [x] **Lair / territory spawn model** (replaced the DF-like edge spawner — see "Spawn Model")
  - [x] `lair: true` resource tiles (`wolf_den`/`predator_den`/`goblin_warren`/`swamp_nest`/`harpy_roost`) scattered at world-gen; ambient particle "tells"
  - [x] `seedLairs` binds one pack per lair tile (`lairId`/`lairX/Y`/`lairRange`); `seedInitialEntities` seeds only free-roaming wildlife (area-scaled)
  - [x] Territory leash in `entityAI.stepHostile`: laired mobs wander/aggro/engage only within `lairRange`; stray → return home; `Fleeing`/`Exhausted` exempt
  - [x] Slow metabolism (`hungerRate < 1`, `foodOverflow`) so leashed packs idle instead of starving/roaming
  - [x] `tickLairs` daily lifecycle: repopulate emptied lairs, grow toward `maxLairCount`, DESTROY designation razes a den (stops both)
- [x] **Phase A.5 — Entity Hunger & Diet**
  - [x] Add `EntityService.stepHunger(state)` — accrues `mob.hunger` each tick; triggers `Foraging`/`Hunting` FSM transitions
  - [x] Herbivore foraging: pathfind to nearest grass tile, consume via `eatProgress` timer
  - [x] Carnivore hunting: pursue nearest `Corpse` or live animal via existing `moveToward`; mini-combat roll on contact
  - [x] Starvation damage: `hunger >= 100` → −1 HP / tick
  - [x] Render `eatProgress` as world-effect progress bar overlay (reuse pawn task bar pipeline)
- [ ] **Phase B — Hunting & Butchering**
  - [x] Add `hunting`, `butchery` work categories to `core/Work.ts` (note: id is `butchery`, not `butchering`)
  - [ ] Pawn hunting: `JobService` / `WorkService` — pathfind pawn to nearest non-tamed animal, attack roll on arrival
  - [x] Corpse tile-entity: dead mobs remain in `mobs[]` with `state: 'Corpse'`; `diedAt` + `CORPSE_DECAY_TICKS` already in `EntityService` (no separate `Corpse[]` array needed)
  - [x] Add `bone_cleaver` (Tier 1 butchery tool, `makers_bench`) — crafted from `large_bones` + flint + cordage; +25% carcass yield
  - [x] Add `dressing_stone` (Tier 1 butchery building) — flat stone slab + log stakes; unlocks at tool tier 1; +25% carcass yield stacks with `bone_cleaver`
- [ ] **Phase C — Taming**
  - [ ] Add `taming` work category
  - [ ] `EntityService.attemptTame(pawnId, entityId, state)` — chance roll per turn
  - [ ] Promote entity to `TamedAnimal` on success
- [ ] **Phase D — Husbandry**
  - [ ] Add `Pasture` to `core/Buildings.ts`; tile capacity rule
  - [ ] Add `husbandry` work category (collect milk/eggs, assign breeding)
  - [ ] Daily product generation in `EntityService.stepHusbandry(state)`
- [ ] **Phase E — Riding**
  - [ ] Add `mountId` to `Pawn` (nullable)
  - [ ] Modifier: `ModifierSystem` checks `pawn.mountId` for movement/combat bonuses
- Add `Mounted Charge` to `core/Abilities.ts`

---

## Turn Order Insertion

```
1. Needs
2. Work processing
3. Completions
4. Exploration
5. → ENTITY STEP ← (stepEntities + stepHusbandry)
6. Events
```

---

## Future — Hauling & Logistics Progression (capture only; unspecced, do not build yet)

> Parked ideas from a 2026-06-17 design chat. **Now spec'd** in
> [PRODUCTION-CHAIN-II §L](../archive/PRODUCTION-CHAIN-II-2026-06-21.md#l--bulk-logistics-wheelbarrows-carts-roads):
> the pawn-pushed wheelbarrow/handcart/road rungs ship there independently; the **animal-hauling
> rungs (pack/draft)** remain the natural extension of Phases C–D below and hard-block on them.
> The notes below are retained as the originating design rationale.

**Core principle (the spine):** split **personal carry** from **bulk logistics**.

- _Personal carry_ (worn: pouches → backpacks → eventually a "bag of holding"): kit,
  tools, small/medium goods, a day's foraging. **Hard-capped low by realism** — must
  _never_ scale to stacks of ore/logs/hay no matter how late-game the pack is.
- _Bulk logistics_ (carts → pack/draft animals → ?): the **only** way to move heavy /
  bulky goods (ore, logs, hay, stone, field goods) at quantity. Separate budget entirely.

This rule makes every later item self-answering: a bag of holding is still _personal_,
so it just makes your kit weightless — bulk always routes through the logistics layer.

| Rung | Mechanic | Role / notes |
| ---- | -------- | ------------ |
| Worn — light | bronze/leather light pack | small cap, ~no encumbrance → scouts / dodge / skirmisher builds |
| Worn — heavy | iron-framed backpack | big personal cap **but real movement/evasion penalty** (loaded pawn is slower); dedicated haulers |
| Bulk — near base | handcart / wheelbarrow | pawn-pushed; wants roads/cleared terrain; first bulk hauler |
| Bulk — anywhere | pack animal (panniers) | tamed/bred draft stock, follows a hauler pawn through forest/mountain a cart can't; medium bulk |
| Bulk — long haul | draft animal + cart | roads, big capacity; makes far-corner mining/forestry viable; **the big-map spine** |
| Late / magic | bag of holding | _personal_, weightless kit only; gate hard (bind-on-use / mana upkeep / hard cap) so a rich colony can't kit everyone |

**Why animals are the backbone:** target map is **1000×1000 (maybe effectively
infinite via chunking)**. Even the best cart+road system has a natural tedium ceiling —
roads only reach so far before round-trips dominate play. Animal pack-trains/caravans
are the distinctive answer (few colony sims use draft animals for player logistics),
and they make husbandry (Phase D) _matter_ — you breed draft stock, not just milk goats.
Backpacks need an encumbrance cost or the light-vs-heavy fork isn't a real choice
(small modifier-path change, big design payoff).

**Portals — reframed, deliberately deferred:** a node↔base on-map portal would
trivialise the whole cart/animal ladder, so drop that framing. Instead: **portals to
_another dimension_** (nether-like) — you build one and _don't know where you come out_
(could open into a hostile realm). Not a map-logistics shortcut at all; a separate
exploration/risk system. Capstone-tier, costly, dangerous. Pure speculation for now.

---

## Open Questions

- [ ] Personal-carry vs bulk-logistics split — confirm as a hard design rule before any pack/cart work
- [ ] Cart mechanic model: vehicle entity on map vs equippable cart (budget override) vs deployable site + batch-haul job
- [ ] Draft/pack animals — new tameable roster + breeding for draft stock; reuse `TamedAnimal` + riding-assignment infra (Phase D/E)
- [ ] Backpack encumbrance → movement/evasion penalty in `ModifierSystem` (enables light-vs-heavy fork)
- [ ] Dimensional portals — separate exploration system, not logistics; capstone, far future
- [ ] Do tamed animals persist across saves? (yes — serialise `tamedAnimals[]`)
- [ ] Can mobs attack buildings? (deferred — Phase 2)
- [ ] Mob-vs-animal combat? (wolf eats deer — deferred, emergent fun)
- [ ] Vet work category for healing injured mounts? (Phase E2 — deferred)
- [ ] Magic-tamed creatures (shadow familiar, etc.)? (Phase 3)
