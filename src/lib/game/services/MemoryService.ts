import type { EntityCondition, EventMemory, GameState, MemoryKind, Pawn } from '../core/types';
import { rng } from '../core/util/rng';
import { TICKS_PER_SECOND } from '../core/util/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { getConditionCurrentStage } from '../core/rules/body/conditions';
import memoriesData from '../database/pawns/memories.jsonc';

const DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

interface MemoryDef {
  memorability: number;
  category: string;
  witnessRadius: number;
  lines: { openers: string[]; replies_good: string[]; replies_bad: string[]; closers: string[] };
}
const MEM = memoriesData as unknown as {
  kinds: Record<string, MemoryDef>;
  fromCondition: Record<string, { detail: string; memorability: number }>;
};

export function memoryDef(kind: MemoryKind): MemoryDef {
  return MEM.kinds[kind];
}

const MEMORY_CAP = 30;
const HISTORIC = 0.9;

function recallWindow(memorability: number): number {
  if (memorability >= HISTORIC) return DAY * 360;
  if (memorability >= 0.65) return DAY * 90;
  if (memorability >= 0.4) return DAY * 20;
  return DAY * 4;
}

class MemoryServiceImpl {
  record(pawn: Pawn, mem: EventMemory): void {
    const store = (pawn.memories ??= []);
    store.push(mem);
    if (store.length > MEMORY_CAP) {
      const i = store.findIndex((m) => m.memorability < HISTORIC);
      store.splice(i >= 0 ? i : 0, 1);
    }
  }

  recordAround(
    state: GameState,
    x: number,
    y: number,
    subjectId: string | undefined,
    radius: number,
    make: () => EventMemory
  ): void {
    for (const p of state.pawns) {
      if (p.isAlive === false || p.id === subjectId || !p.position) continue;
      if (Math.max(Math.abs(p.position.x - x), Math.abs(p.position.y - y)) > radius) continue;
      this.record(p, make());
    }
  }

  recordAroundKind(
    state: GameState,
    x: number,
    y: number,
    subjectId: string,
    kind: MemoryKind,
    extra: { subjectName?: string; detail?: string; memorability?: number }
  ): void {
    const def = MEM.kinds[kind];
    const memorability = extra.memorability ?? def.memorability;
    this.recordAround(state, x, y, subjectId, def.witnessRadius, () => ({
      kind,
      turn: state.turn,
      subjectId,
      subjectName: extra.subjectName,
      detail: extra.detail,
      memorability
    }));
  }

  recordConditionOnsets(
    state: GameState,
    pawn: Pawn,
    prevStages: Map<string, string> | undefined,
    conditions: EntityCondition[]
  ): void {
    if (!pawn.position || conditions.length === 0) return;
    for (const c of conditions) {
      const src = MEM.fromCondition[c.id];
      if (!src) continue;
      if (prevStages?.has(c.id)) continue;
      if (!getConditionCurrentStage(c)) continue;
      this.recordAroundKind(state, pawn.position.x, pawn.position.y, pawn.id, 'affliction', {
        subjectName: pawn.name.split(' ')[0],
        detail: src.detail,
        memorability: src.memorability
      });
    }
  }

  recall(a: Pawn, b: Pawn, turn: number): EventMemory | undefined {
    const store = a.memories;
    if (!store || store.length === 0) return undefined;

    let total = 0;
    const weights: number[] = [];
    for (const m of store) {
      const age = turn - m.turn;
      const window = recallWindow(m.memorability);
      let recency = age <= 0 ? 1 : 1 - age / window;
      if (m.memorability >= HISTORIC) recency = Math.max(0.35, recency);
      const aboutB = m.subjectId === b.id ? 1.6 : 1;
      const w = recency <= 0 ? 0 : m.memorability * recency * (1 / (1 + (m.told ?? 0))) * aboutB;
      weights.push(w);
      total += w;
    }
    if (total <= 0) return undefined;

    let roll = rng.random() * total;
    for (let i = 0; i < store.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        store[i].told = (store[i].told ?? 0) + 1;
        return store[i];
      }
    }
    return undefined;
  }

  prune(pawn: Pawn, turn: number): boolean {
    const store = pawn.memories;
    if (!store || store.length === 0) return false;
    const kept = store.filter(
      (m) => m.memorability >= HISTORIC || turn - m.turn <= recallWindow(m.memorability)
    );
    if (kept.length === store.length) return false;
    pawn.memories = kept;
    return true;
  }

  agoPhrase(ageTicks: number): string {
    if (ageTicks < DAY) return 'earlier';
    const days = ageTicks / DAY;
    if (days < 3) return 'the other day';
    if (days < 14) return 'a while back';
    if (days < 90) return 'weeks back now';
    if (days < 360) return 'a season or more ago';
    return 'years ago now';
  }
}

export const MEMORABILITY = Object.fromEntries(
  (Object.keys(MEM.kinds) as MemoryKind[]).map((k) => [k, MEM.kinds[k].memorability])
) as Record<MemoryKind, number>;

export const memoryService = new MemoryServiceImpl();
