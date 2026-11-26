import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { rng } from '$lib/game/core/util/rng';
import { entityService } from '$lib/game/services/EntityService';
import { rebuildThermalField, thermalAt } from '$lib/game/services/EnvironmentService';
import type { GameState, Mob } from '$lib/game/core/types';
import { holdCreatureCount, initialState, type WorkPinScenario } from '../work-pins/scenarios';

export const ROLLING = { time: 0, iterations: 20, warmupTime: 0, warmupIterations: 4 };

export const MEASURED_TICKS = 180;

export async function warmSession(
  sc: WorkPinScenario,
  warmTicks: number
): Promise<HeadlessSession> {
  const release = sc.creatures ? holdCreatureCount() : () => {};
  const session = new HeadlessSession();
  await session.start(initialState(sc));
  for (const cmd of sc.commands ?? []) session.command(cmd);
  session.tick(warmTicks);
  release();
  return session;
}

function tickOrThrow(session: HeadlessSession, n: number): void {
  const { ticked, result } = session.tick(n);
  if (ticked !== n || !result.success) throw new Error(result.errors.join('; '));
}

export function ticks(session: HeadlessSession, n: number): () => void {
  return () => tickOrThrow(session, n);
}

export function measuredWindow(session: HeadlessSession, warmTicks: number) {
  let n = warmTicks;
  const options = {
    ...ROLLING,
    setup: (_task: unknown, mode: 'warmup' | 'run') => {
      n = mode === 'run' ? MEASURED_TICKS : warmTicks;
    }
  };
  return [() => tickOrThrow(session, n), options] as const;
}

export function phase(session: HeadlessSession, step: (state: GameState) => GameState): () => void {
  return () => {
    const state = session.getState();
    rng.reseed(state.seed);
    step(state);
  };
}

type MoveFields = Pick<Mob, 'x' | 'y' | 'path' | 'pathIndex' | 'nextCellCostLeft' | 'blockedTicks'>;

export function mobMovement(session: HeadlessSession): () => void {
  let ref: Mob[] | undefined;
  let saved: MoveFields[] = [];
  return () => {
    const state = session.getState();
    const mobs = state.mobs ?? [];
    if (mobs !== ref) {
      ref = mobs;
      saved = mobs.map(({ x, y, path, pathIndex, nextCellCostLeft, blockedTicks }) => ({
        x,
        y,
        path,
        pathIndex,
        nextCellCostLeft,
        blockedTicks
      }));
    } else {
      for (let i = 0; i < mobs.length; i++) Object.assign(mobs[i], saved[i]);
    }
    rng.reseed(state.seed);
    entityService.advanceMobMovement(state);
  };
}

export function thermalSampling(session: HeadlessSession): () => void {
  return () => {
    const state = session.getState();
    rebuildThermalField(state.buildings, state.worldMap);
    for (const p of state.pawns) if (p.position) thermalAt(p.position.x, p.position.y);
    for (const d of state.droppedItems ?? []) thermalAt(d.x, d.y);
  };
}
