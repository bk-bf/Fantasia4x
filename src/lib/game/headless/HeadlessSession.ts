import { GameEngineImpl } from '../systems/GameEngineImpl';
import type { TurnProcessingResult } from '../systems/GameEngine';
import { GameStateManager } from '../core/state/GameStateManager';
import { applySimCommand } from '../sim/commands';
import type { SimCommand } from '../sim/simProtocol';
import { resetUnreachableJobs } from '../systems/PawnStateMachine';
import { resetSocialTransients } from '../services/SocialService';
import { pathfinderService } from '../services/PathfinderService';
import { rng } from '../core/util/rng';
import type { GameState } from '../core/types';
import { toSnapshot, fromSnapshot, type HeadlessSnapshot } from './snapshot';
import { setSimLogSink, setVerboseLogging, type SimLogSink } from '../core/util/logSink';
import { setEntityTrace, drainEntityTiming } from '../services/entity/entityAI';

export interface TraceLine {
  turn: number;
  category: string;
  message: string;
}

function makeCaptureSink(buf: TraceLine[], cap: number): SimLogSink {
  const noop = () => {};
  return {
    logActivity: () => '',
    logEvent: (e: { category: string; turn: number; message: string }) => {
      buf.push({ turn: e.turn, category: e.category, message: e.message });
      if (buf.length > cap) buf.splice(0, buf.length - cap);
    },
    logCombatSwing: noop,
    logCombatKill: noop,
    pushCombatText: noop,
    pushAttackLunge: noop,
    pushCombatSound: noop,
    pushProjectile: noop,
    logEntityDeath: noop,
    threatAlert: noop,
    vitalAlert: noop,
    pawnDeath: noop
  } as unknown as SimLogSink;
}

export class HeadlessSession {
  private engine = new GameEngineImpl();
  private started = false;
  private traceBuf: TraceLine[] | null = null;

  async start(state: GameState): Promise<void> {
    rng.reseed(state.seed);
    resetUnreachableJobs();
    resetSocialTransients();
    this.engine.setGameStateManager(new GameStateManager(state));
    await pathfinderService.init();
    this.started = true;
  }

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

  command(cmd: SimCommand): void {
    this.assertStarted();
    this.engine.applyCommand((s) => applySimCommand(s, cmd), false);
  }

  getState(): GameState {
    this.assertStarted();
    return this.engine.getGameState();
  }

  snapshot(): HeadlessSnapshot {
    return toSnapshot(this.getState());
  }

  async loadSnapshot(snap: HeadlessSnapshot): Promise<void> {
    await this.start(fromSnapshot(snap));
  }

  enableTrace(opts?: { creature?: string; id?: string; capacity?: number }): void {
    this.traceBuf = [];
    setSimLogSink(makeCaptureSink(this.traceBuf, opts?.capacity ?? 50_000));
    setVerboseLogging(true);
    if (opts?.creature || opts?.id) setEntityTrace({ creature: opts.creature, id: opts.id });
  }

  disableTrace(): void {
    setEntityTrace(null);
    setVerboseLogging(false);
  }

  drainLogs(opts?: { category?: string; limit?: number }): TraceLine[] {
    if (!this.traceBuf) return [];
    let lines = this.traceBuf;
    if (opts?.category) lines = lines.filter((l) => l.category === opts.category);
    if (opts?.limit && lines.length > opts.limit) lines = lines.slice(lines.length - opts.limit);
    this.traceBuf = [];
    return lines;
  }

  drainTiming(): Array<{ label: string; calls: number; ms: number }> {
    return drainEntityTiming();
  }

  get isStarted(): boolean {
    return this.started;
  }

  private assertStarted(): void {
    if (!this.started) throw new Error('HeadlessSession not started — call start() first');
  }
}
