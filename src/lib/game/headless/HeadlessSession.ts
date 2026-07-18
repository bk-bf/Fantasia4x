/**
 * HeadlessSession — the in-thread driver for a headless, API-steerable sim (HEADLESS-SIM / ADR-033).
 *
 * Owns its OWN `new GameEngineImpl()` (never the exported singleton, so it can't fight a browser
 * client's engine if both load in one dev process) and drives it synchronously — no worker, no
 * postMessage: a command applies and the very next line can read the result back. This mirrors the
 * worker's `init` bootstrap (reseed → resetUnreachableJobs → manager → pathfinder) minus the
 * transport, so a headless trajectory matches what the browser would compute for the same seed.
 *
 * ONE LIVE SESSION PER PROCESS (v1): `rng` is a module singleton — two interleaved sessions would
 * clobber each other's stream and break determinism. The API route layer enforces the singleton;
 * this class just documents it. Dev-only: nothing in the shipped browser/worker path imports this.
 */
import { GameEngineImpl } from '../systems/GameEngineImpl';
import type { TurnProcessingResult } from '../systems/GameEngine';
import { GameStateManager } from '../core/GameState';
import { applySimCommand } from '../sim/commands';
import type { SimCommand } from '../sim/simProtocol';
import { resetUnreachableJobs } from '../systems/PawnStateMachine';
import { resetSocialTransients } from '../services/SocialService';
import { pathfinderService } from '../services/PathfinderService';
import { rng } from '../core/rng';
import type { GameState } from '../core/types';
import { toSnapshot, fromSnapshot, type HeadlessSnapshot } from './snapshot';

export class HeadlessSession {
  private engine = new GameEngineImpl();
  private started = false;

  /** Boot the session from a ready GameState (a scenario build or a hydrated snapshot). */
  async start(state: GameState): Promise<void> {
    rng.reseed(state.seed);
    resetUnreachableJobs();
    // A fresh worker gets clean module state by construction; an in-process session must clear the
    // worker-transient cooldown maps itself or a previous run's history perturbs this one.
    resetSocialTransients();
    this.engine.setGameStateManager(new GameStateManager(state));
    await pathfinderService.init();
    this.started = true;
  }

  /** Advance the sim `n` ticks. Returns the LAST tick's result + the turn reached; any tick error
   *  aborts the loop (the engine already catches internally and reports via `errors`). */
  tick(n = 1): { turn: number; ticked: number; result: TurnProcessingResult } {
    this.assertStarted();
    let result: TurnProcessingResult = {
      success: true,
      turnsProcessed: 0,
      systemsUpdated: [],
      errors: []
    };
    let ticked = 0;
    for (let i = 0; i < n; i++) {
      result = this.engine.processGameTurn();
      ticked++;
      if (!result.success) break;
    }
    return { turn: this.engine.getGameState().turn, ticked, result };
  }

  /** Apply one registry command (`sim/commands.ts` COMMANDS — player verbs and `dev*` alike),
   *  synchronously, through the engine's single-writer path. */
  command(cmd: SimCommand): void {
    this.assertStarted();
    this.engine.applyCommand((s) => applySimCommand(s, cmd), false);
  }

  /** Shallow-copy snapshot of the live state (engine state is replaced wholesale per tick). */
  getState(): GameState {
    this.assertStarted();
    return this.engine.getGameState();
  }

  /** Serializable snapshot (tile scratch stripped) — dump to JSON, reload with `loadSnapshot`. */
  snapshot(): HeadlessSnapshot {
    return toSnapshot(this.getState());
  }

  /** Boot from a previously-dumped snapshot. */
  async loadSnapshot(snap: HeadlessSnapshot): Promise<void> {
    await this.start(fromSnapshot(snap));
  }

  get isStarted(): boolean {
    return this.started;
  }

  private assertStarted(): void {
    if (!this.started) throw new Error('HeadlessSession not started — call start() first');
  }
}
