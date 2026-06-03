<!-- LOC cap: 320 (created: 2026-06-03) -->

# ENTITY SPAWNING (Mobs, Animals, Taming & Husbandry)

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [PRODUCTION-CHAIN-EXPANSION](PRODUCTION-CHAIN-EXPANSION.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [LIVING-WORLD](LIVING-WORLD.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

## Status

Not started. Supersedes MOB-SPAWNING.md. Two entity classes share a spawn
model: hostile mobs (threat) and neutral animals (food/taming/mounts).

---

## Entity Classes

| Class              | Disposition               | Phases                                                                      |
| ------------------ | ------------------------- | --------------------------------------------------------------------------- |
| **Hostile mob**    | Attacks pawns; may steal  | Phase A–E (combat blocker)                                                  |
| **Neutral animal** | Flees; huntable; tameable | Phase A (spawn/flee), B (hunt/butcher), C (tame), D (husbandry), E (riding) |

Both use the same `Mob` type and FSM infrastructure. Class is determined by
`behaviour` field and `tameable` flag on `CreatureDefinition`.

---

## Shared Spawn Model

| Parameter               | Value                                   |
| ----------------------- | --------------------------------------- |
| Base spawns per day     | 1–3 (scales with colony size milestone) |
| Night weight multiplier | ×2–4 (from `ambientLight`)              |
| Spawn edge buffer       | 8 tiles from map edge                   |
| Max active entities     | 40 hard cap (20 hostile / 20 neutral)   |

```typescript
interface CreatureDefinition {
  id: string;
  name: string;
  glyph: string;
  color: string;
  entityClass: 'mob' | 'animal';
  stats: {
    health: number;
    strength: number;
    speed: number;       // tiles/turn
    visionRange: number;
  };
  behaviour: 'passive' | 'neutral' | 'aggressive';
  tameable: boolean;
  mountable: boolean;    // eligible as riding mount (Phase E)
  biomeWeights: Partial<Record<TerrainType, number>>;
  lootTable: Array<{ itemId: string; chance: number; qty: [number, number] }>;
  xpValue: number;
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

FSM transitions for neutral animals:
- Grazing → Startled: pawn within `visionRange`
- Startled → Fleeing: any move or attack
- Fleeing → Grazing: no pawn in `visionRange × 1.5` for 15 turns
- Fleeing → Exhausted: 20 turns in Fleeing state
- Any → Tamed: taming action succeeds (Phase C)

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

### Phase A — Shared entity layer

- Add `Mob` interface to `core/types.ts` (id, creatureId, x, y, health, state, entityClass)
- Add `mobs: Mob[]`, `tamedAnimals: TamedAnimal[]` to `GameState`
- Add `core/Creatures.ts` with all hostile + neutral definitions
- `EntityService` singleton (renamed from `MobService`): `spawnEntities()`, `stepEntities()`, `removeDead()`
- Rendering: draw all `mobs[]` via existing glyph pipeline in `GameCanvas.svelte`

### Phase B — Hunting & Butchering

- Add `hunting`, `butchering` work categories to `core/Work.ts`
- `EntityService.stepHunting(state)` — pathfind pawn toward target animal
- Corpse tile-entity: add `corpses: Corpse[]` to `GameState`; decay timer
- Add `Butcher's Cleaver` to `core/Items.ts`; `Butcher's Block` to `core/Buildings.ts`

### Phase C — Taming

- Add `taming` work category
- `EntityService.attemptTame(pawnId, entityId, state)` — chance roll per turn
- Promote entity to `TamedAnimal` on success

### Phase D — Husbandry

- Add `Pasture` to `core/Buildings.ts`; tile capacity rule
- Add `husbandry` work category (collect milk/eggs, assign breeding)
- Daily product generation in `EntityService.stepHusbandry(state)`

### Phase E — Riding

- Add `mountId` to `Pawn` (nullable)
- Modifier: `ModifierSystem` checks `pawn.mountId` for movement/combat bonuses
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

## Open Questions

- [ ] Do tamed animals persist across saves? (yes — serialise `tamedAnimals[]`)
- [ ] Can mobs attack buildings? (deferred — Phase 2)
- [ ] Mob-vs-animal combat? (wolf eats deer — deferred, emergent fun)
- [ ] Vet work category for healing injured mounts? (Phase E2 — deferred)
- [ ] Magic-tamed creatures (shadow familiar, etc.)? (Phase 3)
