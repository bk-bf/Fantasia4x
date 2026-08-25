import type { GameState, ResearchProject, PlacedBuilding, Job } from '../types';
import { addToStockpileZone, consumeFromStockpiles } from './stockpile';

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
    console.warn(
      '[GameState] DEPRECATED: advanceTurn() called directly. Use GameEngine.processGameTurn() instead.'
    );
    this.state.turn += 1;
  }

  private addToItemArray(_itemId: string, _amount: number): void {
    // Deprecated — stockpile is the single source of truth. No-op.
  }

  addResource(resourceId: string, amount: number): void {
    this.state = addToStockpileZone(this.state, null, { [resourceId]: amount });
  }

  getItemAmount(itemId: string): number {
    return this.state.stockpile[itemId] ?? 0;
  }

  removeItemAmount(itemId: string, amount: number): boolean {
    const current = this.state.stockpile[itemId] ?? 0;
    if (current < amount) return false;
    this.state = consumeFromStockpiles(this.state, { [itemId]: amount });
    return true;
  }

  startResearch(research: ResearchProject): boolean {
    if (this.state.currentResearch) {
      return false;
    }
    this.state.currentResearch = {
      ...research,
      currentProgress: 0
    };
    return true;
  }

  // ===== STOCKPILE =====

  addToStockpile(id: string, amount: number): void {
    this.state = addToStockpileZone(this.state, null, { [id]: amount });
  }

  getStockpileAmount(id: string): number {
    return this.state.stockpile?.[id] ?? 0;
  }

  // ===== WORLD RESOURCE DEPLETION =====

  depleteWorldResource(x: number, y: number, id: string, amount: number): boolean {
    const map = this.state.worldMap;
    if (!map[y]?.[x]) return false;
    const tile = map[y][x];
    const current = tile.resources?.[id] ?? 0;
    if (current <= 0) return false;
    const newAmount = Math.max(0, current - amount);
    const newTile = { ...tile, resources: { ...tile.resources, [id]: newAmount } };
    const newMap = map.map((row, ry) =>
      ry === y ? row.map((col, rx) => (rx === x ? newTile : col)) : row
    );
    this.state.worldMap = newMap;
    return true;
  }

  // ===== PLACED BUILDINGS =====

  addBuilding(building: PlacedBuilding): void {
    this.state.buildings = [...(this.state.buildings ?? []), building];
  }

  updateBuilding(id: string, updates: Partial<PlacedBuilding>): void {
    this.state.buildings = (this.state.buildings ?? []).map((b) =>
      b.id === id ? { ...b, ...updates } : b
    );
  }

  removeBuilding(id: string): void {
    this.state.buildings = (this.state.buildings ?? []).filter((b) => b.id !== id);
  }

  getCompleteBuildingCount(type: string): number {
    return (this.state.buildings ?? []).filter((b) => b.type === type && b.status === 'complete')
      .length;
  }

  updatePawn(
    pawnId: string,
    updater: (pawn: NonNullable<GameState['pawns'][number]>) => GameState['pawns'][number]
  ): void {
    this.state.pawns = this.state.pawns.map((p) => (p.id === pawnId ? updater(p) : p));
  }

  // ===== JOB POOL =====

  addJob(job: Job): void {
    const jobs = this.state.jobs ?? [];
    if (!jobs.find((j) => j.id === job.id)) {
      this.state.jobs = [...jobs, job];
    }
  }

  updateJob(jobId: string, updates: Partial<Job>): void {
    this.state.jobs = (this.state.jobs ?? []).map((j) =>
      j.id === jobId ? { ...j, ...updates } : j
    );
  }

  removeJob(jobId: string): void {
    this.state.jobs = (this.state.jobs ?? []).filter((j) => j.id !== jobId);
  }
}
