<!-- SUPERSEDED: see ENTITIES_SPAWNING.md -->

# MOB SPAWNING (moved)

This spec has been expanded into [ENTITIES_SPAWNING.md](ENTITIES_SPAWNING.md),
which covers hostile mobs, neutral animals, hunting, butchering, taming,
husbandry, and riding.

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [LIVING-WORLD](LIVING-WORLD.md) · [game/DESIGN](../../game/DESIGN.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md)

## Status

Not started. No territory system — DF-like biome-weighted spawning only.

---

## Goal

Put threatening entities on the map so that the colony has something to react to.
Night already increases danger weight (Living World Phase A); mobs make that real.
No territory ownership, no faction AI — just creatures that exist, wander, and
attack when provoked or hungry.

---

## Design: DF-Like Spawning

Creatures spawn at map edges or in biome-appropriate tiles at the start of each
in-game day and during night turns. No territory state. No patrol routes. Just
wandering entities with simple threat behaviour.

### Spawn model

| Parameter               | Value                                         |
| ----------------------- | --------------------------------------------- |
| Base spawns per day     | 1–3 (scales with colony size milestone)       |
| Night weight multiplier | ×2–4 (from EnvironmentService `ambientLight`) |
| Spawn edge buffer       | 8 tiles from map edge                         |
| Max active mobs         | 20 (hard cap, prevents performance spiral)    |

### Biome weights

Each `terrainType` has a `mobWeight` entry in the creature definition.
Higher weight = more likely in that biome. Zero = never spawns there.

```typescript
interface CreatureDefinition {
  id: string;
  name: string;
  glyph: string;         // single char, rendered via existing sprite system
  color: string;         // CSS hex
  stats: {
    health: number;
    strength: number;
    speed: number;       // tiles/turn
    visionRange: number; // tiles
  };
  behaviour: 'passive' | 'neutral' | 'aggressive';
  biomeWeights: Partial<Record<TerrainType, number>>;
  lootTable: Array<{ itemId: string; chance: number; qty: [number, number] }>;
  xpValue: number;
}
```

### Behaviour states (simple FSM)

1. **Wander** — move 0–2 tiles/turn toward a random target, pick new target every 5–10 turns
2. **Alerted** — a pawn entered `visionRange`; move toward nearest pawn
3. **Attacking** — adjacent to a pawn; resolve combat (see COMBAT-SYSTEM)
4. **Fleeing** — health < 20%; move away from all pawns

Transition rules:
- Wander → Alerted: any pawn in `visionRange`
- Alerted → Attacking: adjacent tile occupied by a pawn
- Any → Fleeing: health drops below 20%
- Alerted → Wander: no pawn in `visionRange` for 10 turns

### Starter creature set (Phase 1)

| id              | Name          | Behaviour                     | Biomes              | Notes                         |
| --------------- | ------------- | ----------------------------- | ------------------- | ----------------------------- |
| `wolf`          | Wolf          | neutral (aggressive at night) | forest, deep_forest | pack of 1–3                   |
| `bear`          | Cave Bear     | neutral                       | mountains, forest   | high HP, high damage          |
| `goblin`        | Goblin        | aggressive                    | deep_forest, swamp  | can steal items               |
| `giant_rat`     | Giant Rat     | passive                       | grass, dirt, swamp  | low threat; good intro combat |
| `shadow_wraith` | Shadow Wraith | aggressive                    | any (night only)    | ambientLight < 0.3 required   |

---

## Implementation Plan

### Phase A — Entity layer

- Add `Mob` interface to `core/types.ts` (id, creatureId, x, y, health, state, target)
- Add `mobs: Mob[]` to `GameState`
- Add `CreatureDefinition[]` to `core/Creatures.ts` (static data only)
- Add `MobService` singleton: `spawnMobs()`, `stepMobs()`, `removeDead()`

### Phase B — Spawning

- `MobService.spawnMobs(state)` called once per in-game day from `GameEngineImpl`
- Select biome-eligible spawn points 8+ tiles from colony centroid
- Weight by biome + night multiplier; enforce `MAX_ACTIVE_MOBS` cap
- Insert new `Mob` entries via `GameStateManager.updateState`

### Phase C — Wandering AI

- `MobService.stepMobs(state)` called every turn from `GameEngineImpl` (after Work, before Events)
- Each mob advances FSM; mobs move via WASM pathfinder (returns `[]` when unavailable — graceful)
- Alerted/Attacking mobs find nearest pawn via `SpatialIndexService` (ADR-008)

### Phase D — Rendering

- `GameCanvas.svelte` draws mobs from `$gameState.mobs` using existing glyph renderer
- Mob glyph rendered at correct tile in creature's `color`
- No additional render pass needed — same pipeline as pawns

### Phase E — Loot on death

- When mob health ≤ 0: remove from `mobs[]`, spawn `DroppedItem[]` from `lootTable` at mob position
- Existing hauler AI picks up dropped items automatically

---

## Turn Order Insertion

Add between Work completions and Events:

```
1. Needs
2. Work processing
3. Completions
4. Exploration
5. → MOB STEP ← (new)
6. Events
```

---

## Open Questions

- [ ] Do mobs persist across saves? (yes — serialise `mobs[]` in `GameState`)
- [ ] Can mobs attack buildings? (defer — Phase 2)
- [ ] Mob-vs-mob combat? (defer)
