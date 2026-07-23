<!-- LOC cap: 250 (created: 2026-05-25) -->

# DESIGN

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [DECISIONS](DECISIONS.md) · [ROADMAP](../tasks/open/ROADMAP.md) · [TRAITS](../tasks/archive/TRAITS-2026-07-10.md)

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

- **Items are always physical** (ADR-016): every item occupies a location — a tile (loose or `stored` `DroppedItem`) or a pawn's inventory. There is no ethereal global item pool. To produce an item by any means, a pawn must have held the inputs, carried them to the production location (usually a workstation tile), and the output is created **at that location**. A craft order _reserves_ its inputs (locks, doesn't delete), a pawn _fetches_ them to the workstation and stages them on it, the craft job spends `recipe.workAmount` work points, then the inputs are destroyed and the output spawns on the station. See [PHYSICAL-PRODUCTION](../tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md) (archived). _(Tool-gated gathering is now enforced at claim time against colony stock, and carry-weight is enforced at pickup; per-pawn-inventory + `minTier` gating is the remaining step 2.)_
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
- **Traits (ADR-023 + ADR-028, `database/traits.jsonc`).** Each race rolls an identity
  (`guaranteedTraits`) + a small mundane pool; each PAWN then draws its own set at spawn — up to
  **2 racial + 3 personal** (temperament) traits, so same-race pawns differ. Rarity is a gate
  (~85% of races are mundane-only; rare/epic capabilities ~15%; legendary bundles ~2.5%) and a
  **budget** on the `rarities.jsonc` scale. Every trait has a `kind` fixing its payload: `stat`
  (core-stat deltas) · `attribute` (derived stats, breadth gated by rarity) · `bodyMod` (reshapes the
  limbmap body — dense/brittle bone → fracture budget, thick/thin hide → wound tolerance, + body weight)
  · `naturalGear` (a condition-backed natural weapon/armor — armor carries defense + **weight →
  encumbrance** and either stacks with or replaces a slot; a natural weapon is **bound to a limb** so a
  pawn can lose its claws) · `passive` (aura/affinity/covering/proc condition) · `wound` (a real
  permanent injury at generation — one-eyed IS a destroyed eye). `stat` and `attribute` are strictly
  separated, and a **naming law** keeps abstract-stat names (Brawny, Watchful) from evoking a body
  mechanic they don't have (ADR-028). Conflict prevention enforced; every trait has a `flavorLine`.
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

### Weather & Environmental Exposure (SEASONS_WEATHER)

Weather is data-driven (`database/weather.jsonc`) and drives per-pawn pressure through the conditions
system. Three environmental loads act on a pawn standing on a tile:

- **Temperature** → `hypothermia` / `heat_stroke`. Effective temp = baked tile temp + live weather
  delta, shielded by roof insulation/weatherProtection + nearby fire warmth. Cold/heat past the
  pawn's comfort band feeds a tracked exposure meter (lags up/down) reduced by `cold_resistance` /
  `fire_resistance`; the meter drives the staged conditions.
- **Wetness** → `wet`, and amplifies cold (a soaked pawn chills far faster; can catch a chill at 100%).
- **Wind → `windchilled`** (graded). Wind has a **strength** (`ambientWind` = the stronger of the
  weather type's `windStrength` and the drifting `wind` scalar) and an 8-way **direction** (`windDir`,
  drifts day to day). The wind a pawn actually feels (`effectiveWindAt`) is the open-field strength cut
  by a roof's weatherProtection and by the **lee of an impassable tile** — a mountain/cliff/built wall
  (`tile.walkable === false`) casts a downwind shelter shadow (`windShelterAt` ray-marches upwind a few
  tiles; full shelter directly behind the wall, fading out). That felt wind drives `windchilled`
  **directly** (instantaneous like encumbrance, not accrued) across five degrees — **slightly →
  somewhat → fairly → very → extremely windy** — a nuisance debuff (DEX/move/work, fatigue ↑, never
  lethal on its own) that **also amplifies cold exposure** when it's cold (real windchill, like
  wetness). Rotating wind moves the sheltered side of a wall.

## Work System

**Single source of truth (ADR-015):** every work category's effectiveness is computed by `pawnStatService.getWorkModifiers(pawn, work, light)`, driven entirely by formulas in `database/stats.jsonc`. It returns up to three axes:

- **speed** — how fast the job advances (all jobs have it).
- **yield** — output quantity per action; only gather/extract jobs (foraging, woodcutting, mining, fishing, planting, digging, butchery).
- **quality** — output grade; only craft/build jobs (crafting, metalworking, leatherworking, alchemy, cooking, construction, butchery).

A job only carries an axis if its `*_speed`/`*_yield`/`*_quality` formula exists in `stats.jsonc` — labour jobs like hauling/research/caretaking are speed-only; `getWorkModifiers` returns `null` for absent axes. Each formula multiplies stats × **body capacities** (sight/manipulation/consciousness — so injury and darkness slow work) and then folds in explicit racial-trait multipliers (`workSpeed`/`workYield`/`workQuality`) and transient state (condition/status-effect penalties → speed). The work-priority tooltip surfaces a single efficiency = product of the present axes.

> The earlier parallel `ModifierSystem.calculateWorkEfficiency` path was **deleted** — it disagreed with the formulas and was wired inconsistently. See ADR-015 in [DECISIONS](DECISIONS.md).

Labour is assigned per pawn via a 5-level priority grid (off/low/normal/high/urgent); building work-bonuses still stack through `ModifierSystem` building effects.

## Research System (Three-Tier, Planned)

See `tasks/open/RESEARCH-ENHANCEMENT.md` for full spec.

| Tier           | Unlock Mechanism                                                           |
| -------------- | -------------------------------------------------------------------------- |
| 1 — Knowledge  | Accumulated automatically by scholar work; unlocks at knowledge thresholds |
| 2 — Lore Items | Exploration rewards; bypass knowledge prerequisites for specific techs     |
| 3 — Stat-Gated | Race's average stat ranges unlock unique specialisation paths              |

## Combat System (Implemented)

Real-time, tile-based melee resolved by `combatService.tickCombat` each tick — full spec in [tasks/archive/COMBAT-SYSTEM-2026-06-11.md](../tasks/archive/COMBAT-SYSTEM-2026-06-11.md) (ADR-012/013).

**Key mechanics:**

- **Per-part wound model** — hits land on body parts and escalate in place (merge-and-escalate), bleed, and accumulate pain. Downing is **capacity-driven**: consciousness (which folds in pain, blood loss, and organ damage) below a threshold collapses the entity — no separate pain meter (ADR-012).
- **Stances** (aggressive / defensive / flee) govern engagement; undrafted pawns auto-engage hostiles that enter aggro range, drafted pawns attack ordered targets.
- **Loadout-driven** — the `mainHand` weapon sets damage type / accuracy / crit / reach; layered armour reduces per-part damage (best defense across worn slots); unarmed pawns roll natural weapons (fists/kick).
- **Hard occupancy** (ADR-014) — one body per tile, so flanking and doorway chokepoints emerge naturally and melee can't stack.
- **Healing & caretaking** — wounds mend over time but not mid-fight; the best available medic tends untended wounds, treatment quality from `medical_skill` + medicine item.
- **Permadeath** — a slain entity drops a carcass/corpse; injuries feed back into the needs/health system.

### Anatomy & wound depth (2026-06-20, ADR-024)

A combat-depth pass built on the per-part model — see ADR-024; it partially un-defers ADR-013 (the `fracture` bone/flesh split is now real):

- **Data-driven body plans** — anatomy lives in `database/limbmap.jsonc`, not a single hardcoded humanoid table. Seven plans (humanoid · quadruped · quadruped_hooved · amphibian · avian · serpentine · arachnid · winged_humanoid · amorphous) give each creature category a fitting body (a wolf has paws + a tail, not fingers/toes). A creature picks one via `limbMap` in `creatures.jsonc` (default humanoid); `rollBodyPart` and the capacity model (`moving`/`manipulation` read the plan's legs/arms) are per-plan. Per-limb HP = **`bodyScale × default size`** (the map sets structure + default sizes only; the blood pool stays `health × bodyScale`).
- **Hypovolemic collapse** — blood loss drives `consciousness` down (faint ≈45% lost), so a bleeding pawn **collapses on the field** (a rescue window for caretaking) instead of fighting at full until dropping dead at 0.
- **Conditions crush core stats** — shock/winded/envenomed/hypothermia… multiply STR/DEX/CON/PER/INT through the whole stat engine *and* the raw combat reads, so a wounded fighter genuinely hits softer, aims worse, soaks less. Shown live in the attributes tooltip (current, not base, stats).
- **Innate resistances** — cutting/piercing/blunt/elemental resistances are no longer dimmed by being dazed; combat reads the same value the attributes tab shows (one source of truth).
- **Blunt = trauma, not blood** — crush wounds don't bleed; their payoff is raw damage that **craters limbs and blows them off** (a severed stump then gushes). Bludgeons hit much harder.
- **Bone fractures & broken limbs** — heavy/blunt hits can break the bone (a separate `fracture` wound) without severing the limb: it's crippled (gutted manipulation/moving + a **graded `fractured` condition** crushing STR/DEX — severity tracks bone-damage %, hairline→cracked→shattered, maxing when the bone hits 0), heals over weeks. A **destroyed skull = instant death**.
- **Dismemberment matters** — natural weapons are **bound to parts** (jaw→bite, paw→claw, hoof→kick…): lose the part, lose the attack. A creature stripped of every weapon-part reverts to a weak `thrash`; a pawn who loses both hands drops its weapon. Natural **armour is per-part** too — the plan sets the *shape* (armoured trunk, soft belly, exposed eyes) via an `armor` share, the creature's `naturalArmor` sets the *magnitude* (wolf 8 vs bear 32), so a bear's chest soaks 32% while its belly is the weak spot.

### Stealth & detection (2026-07-14, ADR-032)

The hit-and-run assassin build (STEALTH spec) — a filter on the existing mob vision gate, not a new
subsystem:

- **Always-on passive detection** — every pawn's `stealth` value gates whether a creature *acquires*
  it: a pawn inside vision range with line of sight must also pass a per-mob ~2 s cached detection
  roll (perception + night vision + light vs stealth, +25 % likelier adjacent than at the vision
  border). Undetected pawns are skipped by targeting entirely.
- **Stealth is two-layered** (mirrors night vision) — a `stealth` stat (`sizeFactor(weight) ×
  dexGate(zero ≤ DEX 8) × moving`; size dominant, so beasts/werewolves are poor sneakers for free)
  plus additives in `core/stealth.ts`: trait `stealth` effects (padded-prowl, chameleon-skin,
  ambush-stillness, duskshroud, soft-tread; constant-howling vetoes), living-part grants, worn
  `stealthMod` (the soot-darkened jerkin is the one positive) or a per-kg weight drag, and a
  natural-armour drag (the thick-fur pelt chain IS the beast's tanky↔stealth fork). Default pawn
  ≈ 0.2; a full specialist ≈ 1.5–2.2.
- **The undetected strike** — ×3.5 on `hit_precision` (crit + gap-aiming) for melee AND ranged via
  the shared `resolveHit` path; the blowgun/hunting-recurve are the precision-ranged class. A landed
  hit auto-reveals (self + nearby packmates) — re-stealth means breaking contact until the mob gives
  up its hunt (or ~30 s unseen).
- **Night synergy is free** — creature vision already shrinks in the dark, so stealth strengthens at
  night against diurnal animals while nocturnal predators stay dangerous.

### Hunting (work-driven)

A player marks a huntable animal (`markedForHunt`); a pawn whose hunting labour comes up chases it and **resolves the kill through the same combat system** — `handleHunting` flips the quarry into the shared prey "fight-back" state, so a boar gores the hunter and a cornered deer kicks back exactly like predator-vs-prey (reuses the `EntityService` hunt circuits + `combatService`, not a parallel code path). The kill drops a carcass → butchery → meat. Hunting is **fearless** (no auto-flee) — a colonist death is a normal consequence of picking too big a target.

## UI Design

Retro terminal aesthetic throughout — the interface reads like a monochrome CRT terminal running a
management program, tinted in the Caves-of-Qud greyscale + two-colour style.

**Rules:**

- **Monospace font only** — no proportional fonts anywhere.
- **Dark background, bright foreground**; ASCII box-drawing (`┌─┐ │ └─┘`) for panels and borders.
- **ALL-CAPS labels**, normal-case values; progress bars use ASCII fill (`█░`).
- No rounded corners, gradients, drop shadows, or icon fonts.
- Colour is for status: green = healthy/positive, amber = warning, red = critical; `var(--text-dim)` for secondary.
- Fixed resource sidebar; main content switches by active screen; activity log is an overlay.
- **Never leak backend ids or dev jargon** into any label/tooltip — human names only, tone implies rather than instructs (see AGENTS.md).
