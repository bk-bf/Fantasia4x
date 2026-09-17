import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { rng } from '$lib/game/core/util/rng';
import type { GameState } from '$lib/game/core/types';
import { initialState, type WorkPinScenario } from '../work-pins/scenarios';

export const ROLLING = { time: 0, iterations: 20, warmupTime: 0, warmupIterations: 4 };

export const MEASURED_TICKS = 180;

export async function warmSession(sc: WorkPinScenario, warmTicks: number): Promise<HeadlessSession> {
  const session = new HeadlessSession();
  await session.start(initialState(sc));
  for (const cmd of sc.commands ?? []) session.command(cmd);
  session.tick(warmTicks);
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
