// MemoryService — the pawn dialog-recall memory (PAWN-MEMORY). Pawns record the notable things they
// WITNESS (a comrade's death, a kill in a fight, an exceptional or shoddy piece of work, a loafer) and
// later RECALL them in dialog — on the spot, at the campfire later, or both. The store lives on
// `pawn.memories` (WORKER-ONLY: stripped by ENTITY_DROP, never shipped to the renderer) and is bounded.
//
// Recording happens on DISCRETE events (a kill, a death, a craft completion, an idle-streak crossing) —
// never per tick — so the whole subsystem sits outside the sim hot path. In-place pushes are safe: the
// field is worker-only and these events are rare. Recall is a read the dialog tick performs.

import type { EntityCondition, EventMemory, GameState, MemoryKind, Pawn } from '../core/types';
import { rng } from '../core/rng';
import { TICKS_PER_SECOND } from '../core/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { getConditionCurrentStage } from '../core/needs';
import memoriesData from '../database/pawns/memories.jsonc';

const DAY = TURNS_PER_DAY * TICKS_PER_SECOND; // ticks in one in-game day (18000)

/** One memory KIND's authored definition (memories.jsonc). */
interface MemoryDef {
  memorability: number;
  category: string;
  witnessRadius: number;
  lines: { openers: string[]; replies_good: string[]; replies_bad: string[]; closers: string[] };
}
const MEM = memoriesData as unknown as {
  kinds: Record<string, MemoryDef>;
  /** Floater-persistent condition id → the affliction memory it mints on onset. */
  fromCondition: Record<string, { detail: string; memorability: number }>;
};

/** The registry entry (memorability / category / witnessRadius / lines) for a memory kind. */
export function memoryDef(kind: MemoryKind): MemoryDef {
  return MEM.kinds[kind];
}

// Per-pawn cap on the ring buffer; the oldest NON-historic memory is dropped first, so a legendary
// moment is never crowded out by a week of loafing gossip.
const MEMORY_CAP = 30;
// Memorability ≥ this never expires and stays tellable "years" later — the colony's lore.
const HISTORIC = 0.9;

/** How long a memory stays recallable, by memorability tier. Historic uses a very long (finite) window
 *  so its recall weight only fades slowly — it can still surface long after, just less often. */
function recallWindow(memorability: number): number {
  if (memorability >= HISTORIC) return DAY * 360; // historic — fades over "years", never pruned
  if (memorability >= 0.65) return DAY * 90; // significant — about a season
  if (memorability >= 0.4) return DAY * 20; // notable — weeks
  return DAY * 4; // trivial — a few days of fresh gossip
}

class MemoryServiceImpl {
  /** Push one memory onto a pawn's store (in place), keeping it bounded — drop the oldest non-historic
   *  entry once over cap so pinned lore survives. */
  record(pawn: Pawn, mem: EventMemory): void {
    const store = (pawn.memories ??= []);
    store.push(mem);
    if (store.length > MEMORY_CAP) {
      const i = store.findIndex((m) => m.memorability < HISTORIC);
      store.splice(i >= 0 ? i : 0, 1);
    }
  }

  /**
   * Record a memory onto every living pawn who could have SEEN it — those within `radius` tiles of
   * `(x,y)`, excluding the subject themselves. `make` builds a fresh memory per witness (so `told`
   * counters stay independent). Used by the combat/craft/idle hooks; death already has its witness list.
   */
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

  /** Convenience over {@link recordAround}: record a memory of `kind` around `(x,y)`, pulling the
   *  witness radius + base memorability from the kind's def (memories.jsonc). `extra.memorability`
   *  overrides the base (e.g. a Legendary craft is historic). */
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

  /**
   * PAWN-MEMORY §3: when a dire condition (memories.jsonc `fromCondition`) ONSETS on `pawn`, nearby
   * pawns remember seeing it — an `affliction` memory. Onset is detected against `prevStages` (the
   * floater snapshot the FSM already takes this tick), so no new per-tick diffing: a condition present
   * now but absent from `prevStages` just appeared. Only mapped, floater-persistent conditions qualify.
   */
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
      if (prevStages?.has(c.id)) continue; // already present last tick — not an onset
      if (!getConditionCurrentStage(c)) continue; // not yet at a visible stage
      this.recordAroundKind(state, pawn.position.x, pawn.position.y, pawn.id, 'affliction', {
        subjectName: pawn.name.split(' ')[0],
        detail: src.detail,
        memorability: src.memorability
      });
    }
  }

  /**
   * Pick a memory `a` would bring up when talking to `b`, weighted by memorability × recency ×
   * 1/(1+told) (so the same story wears out), with a boost for memories ABOUT `b` (personal ribbing).
   * Bumps the chosen memory's `told` and returns it, or undefined if `a` has nothing worth recalling.
   * Recall has NO cooldown, so a just-witnessed event can surface on the spot or linger for later.
   */
  recall(a: Pawn, b: Pawn, turn: number): EventMemory | undefined {
    const store = a.memories;
    if (!store || store.length === 0) return undefined;

    let total = 0;
    const weights: number[] = [];
    for (const m of store) {
      const age = turn - m.turn;
      const window = recallWindow(m.memorability);
      let recency = age <= 0 ? 1 : 1 - age / window;
      if (m.memorability >= HISTORIC) recency = Math.max(0.35, recency); // lore stays tellable
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

  /** Drop expired non-historic memories (called on the daily social pass). Returns whether any changed. */
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

  /** A spoken sense of how long ago a memory happened, for the dialog line. */
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

/** Base memorability per kind, from memories.jsonc (death is further scaled per witness by their bond,
 *  SocialService.deathMemorability). Kept as a convenience for callers/tests. */
export const MEMORABILITY = Object.fromEntries(
  (Object.keys(MEM.kinds) as MemoryKind[]).map((k) => [k, MEM.kinds[k].memorability])
) as Record<MemoryKind, number>;

export const memoryService = new MemoryServiceImpl();
