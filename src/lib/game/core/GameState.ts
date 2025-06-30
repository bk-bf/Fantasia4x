// src/lib/game/core/GameState.ts
import type { GameState } from './types.ts';

export class GameStateManager {
  private state: GameState;

  constructor(initialState: GameState) {
    this.state = initialState;
  }

  getState(): GameState {
    return { ...this.state };
  }

  updateState(updates: Partial<GameState>): void {
    this.state = { ...this.state, ...updates };
  }

  advanceTurn(): void {
    this.state.turn += 1;
    this.generateKnowledge();
    this.processResources();
  }

  private generateKnowledge(): void {
    const { intelligence, wisdom } = this.state.race.baseStats;
    const knowledgeGain = Math.floor((intelligence + wisdom) / 10);
    this.state.knowledge += knowledgeGain;
  }

  private processResources(): void {
    // Basic resource generation logic
    const foodProduction = this.state.race.population * 2;
    this.addResource('food', foodProduction);
  }

  addResource(resourceId: string, amount: number): void {
    const resource = this.state.item.find(r => r.id === resourceId);
    if (resource) {
      resource.amount += amount;
    }
  }
}
