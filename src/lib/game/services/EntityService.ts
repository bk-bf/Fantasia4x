import type { GameState } from '../core/types';
import * as spawning from './entity/entitySpawning';
import * as ai from './entity/entityAI';
import * as lifecycle from './entity/entityLifecycle';
import { advanceMobMovement } from './entity/entityHelpers';

class EntityServiceImpl {
  seedInitialEntities(
    state: GameState,
    packs?: number,
    opts?: { preyOnly?: boolean; scatter?: boolean }
  ): GameState {
    return spawning.seedInitialEntities(state, packs, opts);
  }

  tickLairs(state: GameState): GameState {
    return spawning.tickLairs(state);
  }

  spawnEntities(state: GameState, opts?: { preyOnly?: boolean }): GameState {
    return spawning.spawnEntities(state, opts);
  }

  stepEntities(state: GameState): GameState {
    return ai.stepEntities(state);
  }

  advanceMobMovement(state: GameState): GameState {
    return advanceMobMovement(state);
  }

  stepHunger(state: GameState): GameState {
    return lifecycle.stepHunger(state);
  }

  removeDead(state: GameState): GameState {
    return lifecycle.removeDead(state);
  }

  handleFreshCombatCorpses(prevState: GameState, nextState: GameState): GameState {
    return lifecycle.handleFreshCombatCorpses(prevState, nextState);
  }
}

export const entityService = new EntityServiceImpl();
