// EntityService — thin facade over the entity/* modules (P-4 decomposition).
//
// Owns the lifecycle of live map entities (hostile mobs + neutral animals). The implementation was
// split out of this 2,000-line class into focused free-function modules under `entity/`:
//   • entityConstants — tunables + wild-food sets
//   • entityHelpers   — shared queries / movement / foraging lookups (+ advanceMobMovement)
//   • entitySpawning  — initial seeding + periodic spawner
//   • entityAI        — per-tick FSM brain (wander/flee/hunt/forage/sleep + feeding sub-steps)
//   • entityLifecycle — hunger/blood-loss tick, death→corpse, carcass drops, corpse decay
//
// Rosters stay DB-driven (core/Creatures.ts ← database/creatures.jsonc). This facade just exposes
// the per-turn entry points GameEngineImpl (and world seeding) call.
import type { GameState } from '../core/types';
import * as spawning from './entity/entitySpawning';
import * as ai from './entity/entityAI';
import * as lifecycle from './entity/entityLifecycle';
import { advanceMobMovement } from './entity/entityHelpers';

class EntityServiceImpl {
  /** Seed a fresh/loaded world with a starting population (no-op if entities already exist).
   *  `packs` omitted ⇒ area-scaled target (normal play); explicit ⇒ fixed-pack profiler/dev path. */
  seedInitialEntities(state: GameState, packs?: number, opts?: { preyOnly?: boolean }): GameState {
    return spawning.seedInitialEntities(state, packs, opts);
  }

  /** Lair lifecycle (territory): daily-paced repopulation of emptied lairs + capped growth of new
   *  ones on grass/bush tiles. No-op except once per in-game day. */
  tickLairs(state: GameState): GameState {
    return spawning.tickLairs(state);
  }

  /** DF-style periodic spawner — biome-weighted, night-boosted, capped. `preyOnly` (menu preview)
   *  restricts the roll to non-predators so the backdrop never spawns a hunt. */
  spawnEntities(state: GameState, opts?: { preyOnly?: boolean }): GameState {
    return spawning.spawnEntities(state, opts);
  }

  /** Advance every entity's FSM one tick (movement is applied by advanceMobMovement). */
  stepEntities(state: GameState): GameState {
    return ai.stepEntities(state);
  }

  /** Advance all moving mobs along their paths via the shared MovementSystem. */
  advanceMobMovement(state: GameState): GameState {
    return advanceMobMovement(state);
  }

  /** Hunger/fatigue/blood-loss tick; converts the freshly dead to corpses + drops carcasses. */
  stepHunger(state: GameState): GameState {
    return lifecycle.stepHunger(state);
  }

  /** Clear corpses past their decay window; finalise any 0-HP entity to a corpse. */
  removeDead(state: GameState): GameState {
    return lifecycle.removeDead(state);
  }

  /** Drop carcasses for mobs the combat tick killed directly (bypassing stepHunger/removeDead). */
  handleFreshCombatCorpses(prevState: GameState, nextState: GameState): GameState {
    return lifecycle.handleFreshCombatCorpses(prevState, nextState);
  }
}

export const entityService = new EntityServiceImpl();
