<!-- LOC cap: 250 (created: 2026-05-25) -->

# DESIGN [GAME]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DECISIONS](DECISIONS.md) · [PHILOSOPHY](PHILOSOPHY.md) · [ROADMAP](../.tasks/open/ROADMAP.md) · [PRODUCTION-CHAINS](../.tasks/open/PRODUCTION-CHAINS.md)

## Core Gameplay Loop

```
Generate race (stat ranges + racial traits)
    ↓
Forage/scavenge primitives (no tools: twigs, flint shards, plant fiber)
    ↓
Craft Tier 0 tools (Flint Knife, Stone Chopper) at ground knapping surface
    ↓
Fell trees / quarry stone (tool-gated) → build workshop buildings
    ↓
Assign work → harvest resources → construct buildings → craft items → research techs
    ↓
Manage pawn needs (hunger / fatigue / sleep) — pawns auto-path to food/rest; unmet needs cause death
    ↓
Explore locations → discover loot, lore items, events
    ↓
Repeat per turn (auto-turn supported)
```

## Production Chain Philosophy

Fantasia4x targets **peak production chain complexity** — the design reference is RimWorld: HardCore SK, not vanilla RimWorld or Dwarf Fortress. Every step in the economic ladder requires completing the previous one; there is no "free" resource shortcut.

**Core principles:**

- **Items are always physical** (ADR-016): every item occupies a location — a tile (loose or `stored` `DroppedItem`) or a pawn's inventory. There is no ethereal global item pool. To produce an item by any means, a pawn must have held the inputs, carried them to the production location (usually a workstation tile), and the output is created **at that location**. A craft order _reserves_ its inputs (locks, doesn't delete), a pawn _fetches_ them to the workstation and stages them on it, the craft job spends `recipe.workAmount` work points, then the inputs are destroyed and the output spawns on the station. See [PHYSICAL-PRODUCTION](../.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md) (archived). _(Tool-gated gathering is now enforced at claim time against colony stock, and carry-weight is enforced at pickup; per-pawn-inventory + `minTier` gating is the remaining step 2.)_
- **Tool-gated gathering**: woodcutting requires at least a Stone Axe; mining requires a Stone Pick; hunting requires a Stone Spear. Without the tool, the job cannot be claimed — the forest stays whole.
- **Bootstrapping chain**: the starting colony has _nothing_. Survival begins with hand-gathered primitives (twigs, surface flint, plant fiber, wild berries). These enable Tier 0 tools. Tier 0 tools enable woodcutting. Wood enables workshop buildings. Workshops enable Tier 1 tools and processed materials.
- **No free lunches**: building costs use real crafted materials. A `lean_to` shelter costs `pine_wood`, which requires the axe, which requires the knapping stone, which requires finding surface flint. Every shortcut eliminated is a failure state to navigate.
- **Workshop chaining**: every non-trivial crafted item requires a specific workshop (`workshopType` on `Item`). Advanced materials require mid-tier workshops. Advanced workshops require mid-tier materials. The chain is deliberate.
- **Needs create urgency**: hunger and fatigue are not background timers. When a pawn is hungry they stop working and path to food. If food doesn't exist, they starve. This creates pressure to maintain food supply at every tier of the tech tree.

See ADR-009 in [DECISIONS](DECISIONS.md) for the locked-in enforcement rules.

## Race Generation (ADR-023)

A **pool of 15–25 procedural races** is prerolled per run (`Race.generateRacePool`) and stored on
`GameState.racePool` — the canonical known-races store (the Race tab is a **pokédex** over it).
`race` remains a back-compat alias for the colony's home race (`racePool[0]`). Each race:

- Has an **archetype** (Mountain-born, Forest-kin, Deep-dwellers, Marsh-folk, Ember-kin…) that
  biases stat ranges, size, and trait selection (banks in `database/race-lore.jsonc`).
- Stat ranges: base 8–15 biased by the archetype's focus/dump stats; each pawn rolls within them.
- 2–4 racial traits (archetype-weighted) from `database/racial-traits.jsonc`; conflict prevention
  enforced (e.g. Flame Touched ≠ Frost Born). Every trait has a `flavorLine`.
- **Procedural lore** including an immersive `description` paragraph — assembled from authored trait
  `flavorLine`s + lore clause banks chosen by numeric buckets (stats/size/build): the poetry is
  authored, only the scaffolding is generated.

The **starting colony is fully mixed** — each pawn (`Pawn.raceId`/`raceName`) is drawn from a random
pool race. **Inter-race relations** (`GameState.raceRelations`) are a procedural symmetric stub shown
in the pokédex — the seam the SOCIAL-LAYER will read to seed pawn-pair baselines (no mood wiring yet).
Trait resistance effects (`coldResistance`…) feed the matching `*_resistance` stat, so race biology
flows into condition onset (cold→hypothermia) via the existing machinery.

## Pawn System

Each pawn tracks:

- **Stats**: strength, dexterity, intelligence, perception, charisma, constitution (rolled from race ranges)
- **Needs**: hunger, fatigue, thirst, hygiene (decay each turn; auto-satisfied when resources/buildings/zones allow)
- **State / health**: mood, organ/limb-based health & body capacities, conditions, current FSM state
- **Equipment**: layered loadout slots — `mainHand`/`offHand`, `headBase`/`headOuter`, `bodyBase`/`bodyMid`/`bodyOuter`, `gloves`/`boots`/`gorget`, `ring`/`belt`/`back` — each a tracked `ItemInstance` with its own durability (armour stacks by layer; best-defense per body part)
- **Inventory**: weight/volume budgeted (`weightKg`/`volumeL` vs stat-derived caps); belt/back containers raise the cap
- **Skills**: learned work bonuses
- **Abilities**: stat/trait/equipment effects calculated via `ModifierSystem` (with `sources[]`); **work** speed/yield/quality is computed separately by `pawnStatService.getWorkModifiers` (see Work System + ADR-015)

Pawn lifecycle: spawn → work assignment → needs decay → auto-eat/sleep → repeat.

### Need Priority System

Pawns manage hunger and fatigue via a **dynamic proximity + urgency formula**, not flat thresholds. This means a pawn's decision to interrupt work for food considers three things simultaneously:

**1. Urgency** — how far past the trigger threshold the need has climbed (quadratic curve):

```
urgency = (need − threshold)² / (100 − threshold)²
```

Low urgency = only detour if food is very close. High urgency = accept a large detour. At 100% = always seek food.

**2. Proximity** — distance to nearest food source vs distance to current job:

```
maxDetour = max(distToJob, 5) × (1 + urgency × 14)
eat if distToFood ≤ maxDetour
```

A pawn 2 tiles from a campfire will eat even at 71% hunger. A pawn 40 tiles from food needs ~87% hunger before it's worth the trip.

**3. Work priority + queue lookahead** — two threshold adjustments modify when the formula kicks in:

- **Labor level 4** (critical work): effective threshold shifts to ~78 — pawn resists interruption longer.
- **Labor level 1** (low priority): threshold shifts to ~66 — pawn is quicker to seek food.
- **Job queue pressure**: if the pawn's next 4 soft-queued jobs are all far from food, the threshold drops by up to 5 pts — the system nudges the pawn to eat before it runs out of opportunity.

The pawn's `jobQueue` field (up to 4 upcoming job IDs) is populated whenever the pawn picks work from Idle. The queue is a _soft preview_ — jobs are not claimed, and the queue becomes stale if another pawn grabs a job. The need formula degrades gracefully when queue entries are missing.

Both `Working` and `MovingToResource` re-evaluate the formula every turn so mid-journey need changes are caught immediately. Fatigue/sleep uses the same formula with distance to the nearest shelter.

**Key thresholds (calibrated to 1 day = 300 turns):**

| Constant                         | Value       | Meaning                                                  |
| -------------------------------- | ----------- | -------------------------------------------------------- |
| `HUNGER_THRESHOLD`               | 70          | Need formula activates from Idle / Working               |
| `FATIGUE_THRESHOLD`              | 72          | Same for fatigue                                         |
| `NEED_DETOUR_MAX_FACTOR`         | 15          | At 100% hunger, willing to detour up to 15× job distance |
| `WORK_PRIORITY_THRESHOLD_SHIFT`  | 4 pts/level | Per labor level shift on effective threshold             |
| `QUEUE_FOOD_THRESHOLD_REDUCTION` | 5 pts       | Max threshold drop when no queue job is near food        |

See ADR-010 in [DECISIONS](DECISIONS.md) for the full design rationale and numeric examples.

## Work System

**Single source of truth (ADR-015):** every work category's effectiveness is computed by `pawnStatService.getWorkModifiers(pawn, work, light)`, driven entirely by formulas in `database/stats.jsonc`. It returns up to three axes:

- **speed** — how fast the job advances (all jobs have it).
- **yield** — output quantity per action; only gather/extract jobs (foraging, woodcutting, mining, fishing, planting, digging, butchery).
- **quality** — output grade; only craft/build jobs (crafting, metalworking, leatherworking, alchemy, cooking, construction, butchery).

A job only carries an axis if its `*_speed`/`*_yield`/`*_quality` formula exists in `stats.jsonc` — labour jobs like hauling/research/caretaking are speed-only; `getWorkModifiers` returns `null` for absent axes. Each formula multiplies stats × **body capacities** (sight/manipulation/consciousness — so injury and darkness slow work) and then folds in explicit racial-trait multipliers (`workSpeed`/`workYield`/`workQuality`) and transient state (condition/status-effect penalties → speed). The work-priority tooltip surfaces a single efficiency = product of the present axes.

> The earlier parallel `ModifierSystem.calculateWorkEfficiency` path was **deleted** — it disagreed with the formulas and was wired inconsistently. See ADR-015 in [DECISIONS](DECISIONS.md).

Labour is assigned per pawn via a 5-level priority grid (off/low/normal/high/urgent); building work-bonuses still stack through `ModifierSystem` building effects.

## Research System (Three-Tier, Planned)

See `.tasks/open/RESEARCH-ENHANCEMENT.md` for full spec.

| Tier           | Unlock Mechanism                                                           |
| -------------- | -------------------------------------------------------------------------- |
| 1 — Knowledge  | Accumulated automatically by scholar work; unlocks at knowledge thresholds |
| 2 — Lore Items | Exploration rewards; bypass knowledge prerequisites for specific techs     |
| 3 — Stat-Gated | Race's average stat ranges unlock unique specialisation paths              |

## Combat System (Implemented)

Real-time, tile-based melee resolved by `combatService.tickCombat` each tick — full spec in [.tasks/open/COMBAT-SYSTEM.md](../.tasks/open/COMBAT-SYSTEM.md) (ADR-012/013).

**Key mechanics:**

- **Per-part wound model** — hits land on body parts and escalate in place (merge-and-escalate), bleed, and accumulate pain. Downing is **capacity-driven**: consciousness (which folds in pain, blood loss, and organ damage) below a threshold collapses the entity — no separate pain meter (ADR-012).
- **Stances** (aggressive / defensive / flee) govern engagement; undrafted pawns auto-engage hostiles that enter aggro range, drafted pawns attack ordered targets.
- **Loadout-driven** — the `mainHand` weapon sets damage type / accuracy / crit / reach; layered armour reduces per-part damage (best defense across worn slots); unarmed pawns roll natural weapons (fists/kick).
- **Hard occupancy** (ADR-014) — one body per tile, so flanking and doorway chokepoints emerge naturally and melee can't stack.
- **Healing & caretaking** — wounds mend over time but not mid-fight; the best available medic tends untended wounds, treatment quality from `medical_skill` + medicine item.
- **Permadeath** — a slain entity drops a carcass/corpse; injuries feed back into the needs/health system.

### Hunting (work-driven)

A player marks a huntable animal (`markedForHunt`); a pawn whose hunting labour comes up chases it and **resolves the kill through the same combat system** — `handleHunting` flips the quarry into the shared prey "fight-back" state, so a boar gores the hunter and a cornered deer kicks back exactly like predator-vs-prey (reuses the `EntityService` hunt circuits + `combatService`, not a parallel code path). The kill drops a carcass → butchery → meat. Hunting is **fearless** (no auto-flee) — a colonist death is a normal consequence of picking too big a target.
