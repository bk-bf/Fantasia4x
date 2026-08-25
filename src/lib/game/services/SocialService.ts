import type {
  EventMemory,
  GameState,
  ItemInstance,
  Mob,
  MoodModifier,
  Pawn,
  PawnRelationship,
  RelationEventKind,
  RelationTag
} from '../core/types';
import { computePrestige } from '../core/rules/social/prestige';
import {
  activeMoodModifiers,
  effectiveMood,
  findRelationship,
  relKey,
  seedScore,
  sortedPair,
  stageForScore
} from '../core/rules/social/social';
import { rng } from '../core/util/rng';
import { moodEffect } from '../core/defs/moods';
import { memoryService } from './MemoryService';
import { simLog } from '../core/util/logSink';
import { TICKS_PER_SECOND } from '../core/util/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { nearGatheringPlace } from '../core/defs/amenities';
import { pawnStatService } from './PawnStatService';
import {
  combatBark as pickBark,
  runConversation,
  type CombatBarkKind,
  type ConversationCategory,
  type ConversationOutcome
} from './social/conversations';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;
const days = (n: number) => Math.round(n * TICKS_PER_DAY);
const REL_LOG_CAP = 12;

const WORKED_TOGETHER_DELTA = 0.5;
const TRAIT_AFFINITY_DELTA = 0.5;
const IDLE_RIVAL_DELTA = -1;
const WORK_CLUSTER_RADIUS = 6;
const IDLE_ADJ_RADIUS = 2;
const MEET_RADIUS = 12;
const RESCUE_DELTA = 18;
const TEND_DELTA = 8;
const FOUGHT_ALONGSIDE_DELTA = 4;
const WITNESS_DEATH_DELTA = 6;
const FRIENDLY_FIRE_DELTA = -20;
const FOUGHT_ALONGSIDE_RADIUS = 6;
const WITNESS_RADIUS = 10;
const DIALOG_RANGE = 2;
const DIALOG_CHANCE = 0.6;
const DIALOG_PAIR_COOLDOWN_S = 25;
const DIALOG_PAWN_COOLDOWN_S = 6;
const DIALOG_DANGER_RADIUS = 8;
const DIALOG_SPACING_RADIUS = 10;
const DIALOG_HOLD_S = 5;
const DIALOG_MOOD_FADE_DAYS = 0.5;
const RECALL_CHANCE = 0.5;
const BARK_COOLDOWN = 3 * TICKS_PER_SECOND;
const BARK_CHANCE: Record<CombatBarkKind, number> = { hit: 0.3, miss: 0.25, hurt: 0.5, kill: 0.75 };
const ATTRACTION_MIN_BEAUTY = 0.75;
const ROMANCE_MIN_AGE = 18;
const FLIRT_MIN_SCORE = 40;
const ROMANCE_AGE_GAP_FREE = 5;
const ROMANCE_AGE_GAP_SPAN = 20;
const FLIRTS_TO_INTEREST = 3;
const FLIRTS_TO_COURT = 6;
const FLIRTS_TO_PARTNER = 10;
const PARTNER_MIN_SCORE = 45;
const AFFAIR_CHANCE = 0.1;
const BREAK_MOOD = 20;
const CRISIS_GLOOM_DAYS = 2;
const PRESTIGE_FINE_THRESHOLD = 20;

const TRAIT_CLASHES: [string, string][] = [
  ['industrious', 'lazy'],
  ['meticulous', 'slapdash'],
  ['curious', 'incurious'],
  ['gregarious', 'loner'],
  ['hot-headed', 'hot-headed'],
  ['ill-tempered', 'ill-tempered']
];
const TRAIT_MATCHES = ['industrious', 'meticulous', 'curious', 'gregarious', 'loner'];

const _battleBondDay = new Map<string, number>();
const _lastPairDialog = new Map<string, number>();
const _lastPawnDialog = new Map<string, number>();
const _activeDialogs: { x: number; y: number; until: number }[] = [];
const _lastBark = new Map<string, number>();

export function resetSocialTransients(): void {
  _battleBondDay.clear();
  _lastPairDialog.clear();
  _lastPawnDialog.clear();
  _activeDialogs.length = 0;
  _lastBark.clear();
}
function barkHash(id: string, turn: number, salt: number): number {
  let h = (salt ^ turn) | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}
const BARK_CHANCE_SALT: Record<CombatBarkKind, number> = { hit: 1, miss: 2, hurt: 3, kill: 4 };
const BARK_LINE_SALT = 97;

function hasTrait(p: Pawn, id: string): boolean {
  return p.traits?.some((t) => t.id === id) ?? false;
}

function firstName(p: Pawn): string {
  return p.name.split(' ')[0];
}

function dist(a: Pawn, b: Pawn): number {
  if (!a.position || !b.position) return Infinity;
  return Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y));
}

class SocialServiceImpl {
  getPrestige(entity: Pawn | Mob): number {
    return computePrestige(entity);
  }

  getBeauty(pawn: Pawn): number {
    return pawnStatService.evaluateStat('beauty', pawn);
  }

  getEffectiveMood(pawn: Pawn, turn: number): number {
    return effectiveMood(pawn, turn);
  }

  addMoodModifier(
    pawn: Pawn,
    id: string,
    label: string,
    value: number,
    durationTicks: number,
    turn: number
  ): void {
    const next = (pawn.moodModifiers ?? []).filter((m) => m.id !== id);
    next.push({
      id,
      label,
      value,
      expiresAt: durationTicks > 0 ? turn + durationTicks : 0,
      startedAt: turn
    });
    pawn.moodModifiers = next;
  }

  removeMoodModifier(pawn: Pawn, id: string): void {
    const mods = pawn.moodModifiers;
    if (!mods || !mods.some((m) => m.id === id)) return;
    pawn.moodModifiers = mods.filter((m) => m.id !== id);
  }

  private ensureRel(
    working: PawnRelationship[],
    a: Pawn,
    b: Pawn,
    state: GameState
  ): PawnRelationship {
    const [idA, idB] = sortedPair(a.id, b.id);
    let rel = working.find((r) => r.pawnA === idA && r.pawnB === idB);
    if (rel) return rel;
    const seed = seedScore(a, b, state.cultureRelations ?? []);
    const kinTie = a.kin?.find((k) => k.pawnId === b.id);
    const kinFromA =
      kinTie &&
      (a.id === idA
        ? kinTie.kind
        : kinTie.kind === 'parent'
          ? 'child'
          : kinTie.kind === 'child'
            ? 'parent'
            : kinTie.kind);
    rel = {
      pawnA: idA,
      pawnB: idB,
      score: seed,
      stage: stageForScore(seed),
      tags: [],
      points: { history: 0 },
      ...(kinFromA ? { kin: kinFromA } : {})
    };
    if (seed !== 0) {
      rel.log = [
        {
          turn: state.turn,
          delta: seed,
          label: kinFromA
            ? 'Family ties'
            : seed > 0
              ? 'A familiar people'
              : 'Old grudges between peoples',
          kind: 'seed'
        }
      ];
    }
    working.push(rel);
    return rel;
  }

  private applyDelta(
    rel: PawnRelationship,
    delta: number,
    opts?: {
      tags?: RelationTag[];
      turn?: number;
      label?: string;
      kind?: RelationEventKind;
      lines?: { name: string; text: string }[];
      coalesce?: boolean;
    }
  ): void {
    rel.score = Math.max(-100, Math.min(100, rel.score + delta));
    rel.points.history += Math.abs(delta);
    rel.stage = stageForScore(rel.score, rel.stage);
    if (opts?.tags) {
      for (const t of opts.tags) if (!rel.tags.includes(t)) rel.tags.push(t);
    }
    if (opts?.turn != null && opts.label && opts.kind && delta !== 0) {
      this.recordEvent(
        rel,
        { turn: opts.turn, delta, label: opts.label, kind: opts.kind, lines: opts.lines },
        opts.coalesce ?? false
      );
    }
  }

  private recordEvent(
    rel: PawnRelationship,
    ev: {
      turn: number;
      delta: number;
      label: string;
      kind: RelationEventKind;
      lines?: { name: string; text: string }[];
    },
    coalesce: boolean
  ): void {
    const delta = Math.round(ev.delta * 10) / 10;
    const log = rel.log ? rel.log.slice() : [];
    if (coalesce) {
      const idx = log.findIndex((e) => e.kind === ev.kind && e.label === ev.label);
      if (idx >= 0) {
        log[idx] = {
          ...log[idx],
          delta: Math.round((log[idx].delta + delta) * 10) / 10,
          turn: ev.turn
        };
        rel.log = log;
        return;
      }
    }
    log.push({
      turn: ev.turn,
      delta,
      label: ev.label,
      kind: ev.kind,
      ...(ev.lines ? { lines: ev.lines } : {})
    });
    while (log.length > REL_LOG_CAP) {
      const i = log.findIndex((e) => e.kind !== 'time' && e.kind !== 'seed');
      log.splice(i >= 0 ? i : 0, 1);
    }
    rel.log = log;
  }

  meetColony(state: GameState): GameState {
    const alive = state.pawns.filter((p) => p.isAlive !== false);
    let working: PawnRelationship[] | null = null;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const [idA, idB] = sortedPair(alive[i].id, alive[j].id);
        const exists = (working ?? state.relationships ?? []).some(
          (r) => r.pawnA === idA && r.pawnB === idB
        );
        if (exists) continue;
        working ??= state.relationships ? [...state.relationships] : [];
        this.ensureRel(working, alive[i], alive[j], state);
      }
    }
    return working ? { ...state, relationships: working } : state;
  }

  seedFamilyRelationships(state: GameState): GameState {
    const lookup = new Map<string, Pawn>();
    for (const p of state.pawns) lookup.set(p.id, p);
    for (const p of state.worldPawns ?? []) lookup.set(p.id, p);
    let working: PawnRelationship[] | null = null;
    for (const p of state.pawns) {
      for (const tie of p.kin ?? []) {
        const other = lookup.get(tie.pawnId);
        if (!other) continue;
        if (findRelationship(working ?? state.relationships, p.id, other.id)) continue;
        working ??= state.relationships ? [...state.relationships] : [];
        this.ensureRel(working, p, other, state);
      }
    }
    return working ? { ...state, relationships: working } : state;
  }

  adjustRelation(
    state: GameState,
    a: Pawn,
    b: Pawn,
    delta: number,
    opts?: { tags?: RelationTag[]; label?: string; kind?: RelationEventKind; coalesce?: boolean }
  ): GameState {
    if (a.id === b.id) return state;
    const working = state.relationships ? [...state.relationships] : [];
    const rel = this.ensureRel(working, a, b, state);
    this.applyDelta(rel, delta, { turn: state.turn, ...opts });
    return { ...state, relationships: working };
  }

  onRescue(state: GameState, rescuer: Pawn, rescued: Pawn): GameState {
    this.addMoodModifier(
      rescued,
      `rescued:${rescuer.id}`,
      `Carried to safety by ${firstName(rescuer)}`,
      6,
      days(3),
      state.turn
    );
    return this.adjustRelation(state, rescuer, rescued, RESCUE_DELTA, {
      tags: ['rescued_by', 'battle_forged'],
      label: `Carried out of danger by ${firstName(rescuer)}`,
      kind: 'rescue'
    });
  }

  onTend(state: GameState, medic: Pawn, patient: Pawn): GameState {
    return this.adjustRelation(state, medic, patient, TEND_DELTA, {
      label: `${firstName(medic)} tended their wounds`,
      kind: 'tend'
    });
  }

  onFriendlyFire(state: GameState, attacker: Pawn, victim: Pawn): GameState {
    return this.adjustRelation(state, attacker, victim, FRIENDLY_FIRE_DELTA, {
      label: `${firstName(attacker)} drew their blood`,
      kind: 'strife'
    });
  }

  onFoughtTogether(state: GameState, killer: Pawn, x: number, y: number): GameState {
    if (!killer.position) return state;
    const day = Math.floor(state.turn / TICKS_PER_DAY);
    const near = state.pawns.filter(
      (p) =>
        p.isAlive !== false &&
        p.position &&
        Math.max(Math.abs(p.position.x - x), Math.abs(p.position.y - y)) <= FOUGHT_ALONGSIDE_RADIUS
    );
    if (near.length < 2) return state;
    let working: PawnRelationship[] | null = null;
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const key = `${sortedPair(near[i].id, near[j].id).join('|')}`;
        if (_battleBondDay.get(key) === day) continue;
        _battleBondDay.set(key, day);
        working ??= state.relationships ? [...state.relationships] : [];
        const rel = this.ensureRel(working, near[i], near[j], state);
        this.applyDelta(rel, FOUGHT_ALONGSIDE_DELTA, {
          tags: ['battle_forged'],
          turn: state.turn,
          label: 'Fought side by side',
          kind: 'battle',
          coalesce: true
        });
      }
    }
    return working ? { ...state, relationships: working } : state;
  }

  private deathMemorability(witness: Pawn, dead: Pawn, rels: PawnRelationship[]): number {
    const kin = witness.kin?.some((k) => k.pawnId === dead.id);
    const rel = findRelationship(rels, witness.id, dead.id);
    if (kin || rel?.romance?.stage === 'partners' || rel?.stage === 'best_friends') return 0.96;
    if (rel?.stage === 'friends') return 0.72;
    if (rel?.stage === 'rivals' || rel?.stage === 'enemies') return 0.55;
    if (rel?.stage === 'acquaintances') return 0.48;
    return 0.4;
  }

  onPawnDeath(state: GameState, dead: Pawn): GameState {
    const turn = state.turn;
    const rels = state.relationships ?? [];
    const byId = new Map(state.pawns.map((p) => [p.id, p]));
    for (const rel of rels) {
      if (rel.pawnA !== dead.id && rel.pawnB !== dead.id) continue;
      const other = byId.get(rel.pawnA === dead.id ? rel.pawnB : rel.pawnA);
      if (!other || other.isAlive === false) continue;
      const partner = rel.romance?.stage === 'partners' || rel.romance?.stage === 'courting';
      let value = 0;
      let daysHeld = 0;
      if (partner || rel.stage === 'best_friends') {
        value = -25;
        daysHeld = 10;
      } else if (rel.kin) {
        value = -20;
        daysHeld = 10;
      } else if (rel.stage === 'friends') {
        value = -12;
        daysHeld = 5;
      }
      if (value !== 0) {
        this.addMoodModifier(
          other,
          `grief:${dead.id}`,
          `Grieving ${firstName(dead)}`,
          value,
          days(daysHeld),
          turn
        );
      }
    }
    for (const tie of dead.kin ?? []) {
      const other = byId.get(tie.pawnId);
      if (!other || other.isAlive === false) continue;
      if (!other.moodModifiers?.some((m) => m.id === `grief:${dead.id}`)) {
        this.addMoodModifier(
          other,
          `grief:${dead.id}`,
          `Grieving ${firstName(dead)}`,
          -20,
          days(10),
          turn
        );
      }
    }
    let working = rels.filter((r) => r.pawnA !== dead.id && r.pawnB !== dead.id);
    if (dead.position) {
      const witnesses = state.pawns.filter(
        (p) =>
          p.id !== dead.id && p.isAlive !== false && p.position && dist(p, dead) <= WITNESS_RADIUS
      );
      const deadName = firstName(dead);
      for (const w of witnesses) {
        memoryService.record(w, {
          kind: 'death',
          turn,
          subjectId: dead.id,
          subjectName: deadName,
          memorability: this.deathMemorability(w, dead, rels)
        });
      }
      for (let i = 0; i < witnesses.length; i++) {
        for (let j = i + 1; j < witnesses.length; j++) {
          const rel = this.ensureRel(working, witnesses[i], witnesses[j], state);
          this.applyDelta(rel, WITNESS_DEATH_DELTA, {
            tags: ['grief_bond'],
            turn,
            label: `Grieved ${firstName(dead)} together`,
            kind: 'grief'
          });
        }
      }
    }
    return { ...state, relationships: working };
  }

  onAteHotMeal(pawn: Pawn, turn: number): void {
    this.addMoodModifier(pawn, 'hot-meal', 'Ate a hot meal', 8, days(1), turn);
  }

  onSleptInBed(pawn: Pawn, turn: number): void {
    this.addMoodModifier(pawn, 'slept-bed', 'Slept in a bed', 5, days(1), turn);
  }

  onSharedMeal(state: GameState, a: Pawn, b: Pawn): GameState {
    return this.adjustRelation(state, a, b, 1, {
      label: 'Time spent together',
      kind: 'time',
      coalesce: true
    });
  }

  processSocialTurn(state: GameState): GameState {
    const turn = state.turn;
    const alive = state.pawns.filter((p) => p.isAlive !== false);
    if (alive.length === 0) return state;

    let relsChanged = false;
    const working: PawnRelationship[] = state.relationships ? [...state.relationships] : [];
    const touch = (a: Pawn, b: Pawn): PawnRelationship => {
      relsChanged = true;
      return this.ensureRel(working, a, b, state);
    };

    for (const p of alive) {
      if (p.moodModifiers && p.moodModifiers.length > 0) {
        const live = activeMoodModifiers(p, turn);
        if (live.length !== p.moodModifiers.length) p.moodModifiers = live;
      }
      memoryService.prune(p, turn);
      const prestige = this.getPrestige(p);
      const dressed = p.equipment && Object.values(p.equipment).some((i) => i);
      if (prestige >= PRESTIGE_FINE_THRESHOLD) {
        this.addMoodModifier(p, 'prestige-band', 'Finely arrayed', 5, 0, turn);
      } else if (!dressed) {
        this.addMoodModifier(p, 'prestige-band', 'Dressed in rags', -5, 0, turn);
      } else {
        this.removeMoodModifier(p, 'prestige-band');
      }
      const beauty = this.getBeauty(p);
      if (beauty >= 1.25) {
        this.addMoodModifier(p, 'beauty-band', 'Turns heads', 3, 0, turn);
      } else if (beauty <= 0.7) {
        this.addMoodModifier(p, 'beauty-band', 'Hard to look at', -4, 0, turn);
      } else {
        this.removeMoodModifier(p, 'beauty-band');
      }
      const deeds = (p.deeds ??= {});
      if (p.currentState === 'Idle' && !p.activeJob) {
        deeds.idleDays = (deeds.idleDays ?? 0) + 1;
      } else {
        deeds.idleDays = 0;
      }
      if ((deeds.idleDays ?? 0) >= 3) {
        this.addMoodModifier(p, 'idle', 'Nothing to do for days', -8, 0, turn);
        if (deeds.idleDays === 3 && p.position) {
          memoryService.recordAroundKind(state, p.position.x, p.position.y, p.id, 'idled', {
            subjectName: firstName(p)
          });
        }
      } else {
        this.removeMoodModifier(p, 'idle');
      }
    }

    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      let nearFriend = false;
      let nearRival = false;
      for (let j = 0; j < alive.length; j++) {
        if (i === j) continue;
        const b = alive[j];
        const d = dist(a, b);
        if (j > i) {
          if (d <= MEET_RADIUS && !findRelationship(working, a.id, b.id)) touch(a, b);
          if (d <= WORK_CLUSTER_RADIUS && a.state?.isWorking && b.state?.isWorking) {
            this.applyDelta(touch(a, b), WORKED_TOGETHER_DELTA, {
              turn,
              label: 'Time spent together',
              kind: 'time',
              coalesce: true
            });
          }
          const rel = findRelationship(working, a.id, b.id);
          if (rel) {
            let affinity = 0;
            for (const [t1, t2] of TRAIT_CLASHES) {
              if ((hasTrait(a, t1) && hasTrait(b, t2)) || (hasTrait(a, t2) && hasTrait(b, t1))) {
                affinity -= TRAIT_AFFINITY_DELTA;
                break;
              }
            }
            for (const t of TRAIT_MATCHES) {
              if (hasTrait(a, t) && hasTrait(b, t)) {
                affinity += TRAIT_AFFINITY_DELTA;
                break;
              }
            }
            if (affinity !== 0) {
              relsChanged = true;
              this.applyDelta(rel, affinity, {
                turn,
                label: affinity > 0 ? 'Kindred temperaments' : 'Grating temperaments',
                kind: 'time',
                coalesce: true
              });
            }
            if (
              d <= IDLE_ADJ_RADIUS &&
              a.currentState === 'Idle' &&
              b.currentState === 'Idle' &&
              (rel.stage === 'rivals' || rel.stage === 'enemies')
            ) {
              relsChanged = true;
              this.applyDelta(rel, IDLE_RIVAL_DELTA, {
                turn,
                label: 'Festering resentment',
                kind: 'time',
                coalesce: true
              });
            }
          }
        }
        if (d <= WORK_CLUSTER_RADIUS) {
          const rel = findRelationship(working, a.id, b.id);
          if (rel) {
            if (a.state?.isWorking && (rel.stage === 'friends' || rel.stage === 'best_friends'))
              nearFriend = true;
            if (rel.stage === 'rivals' || rel.stage === 'enemies') nearRival = true;
          }
        }
      }
      if (nearFriend) this.addMoodModifier(a, 'near-friend', 'Working among friends', 3, 0, turn);
      else this.removeMoodModifier(a, 'near-friend');
      if (nearRival) this.addMoodModifier(a, 'near-rival', 'A rival close by', -5, 0, turn);
      else this.removeMoodModifier(a, 'near-rival');
    }

    for (const rel of working) {
      const stage = rel.romance?.stage;
      if ((stage === 'partners' || stage === 'courting') && rel.score < 0) {
        relsChanged = true;
        rel.romance = { stage: 'ex', since: turn };
        const before = rel.score;
        rel.score = Math.min(rel.score, -25);
        rel.stage = stageForScore(rel.score, rel.stage);
        this.recordEvent(
          rel,
          { turn, delta: rel.score - before, label: 'Parted ways', kind: 'romance' },
          false
        );
        const a = alive.find((p) => p.id === rel.pawnA);
        const b = alive.find((p) => p.id === rel.pawnB);
        for (const p of [a, b]) {
          if (p) {
            const ex = p === a ? b : a;
            this.addMoodModifier(
              p,
              `breakup:${rel.pawnA}|${rel.pawnB}`,
              ex ? `Parted ways with ${firstName(ex)}` : 'A parting of ways',
              -15,
              days(5),
              turn
            );
          }
        }
        if (a && b) {
          simLog.logActivity({
            turn,
            type: 'social',
            actor: a.name,
            target: b.name,
            action: 'A parting',
            result: `${firstName(a)} and ${firstName(b)} have parted ways`,
            severity: 'warning',
            entityIds: [a.id, b.id]
          });
        }
      }
    }

    for (const p of alive) {
      if (p.socialBreak && turn >= p.socialBreak.until) p.socialBreak = undefined;
      const em = effectiveMood(p, turn);
      const deeds = (p.deeds ??= {});
      if (em <= 2) deeds.gloomDays = (deeds.gloomDays ?? 0) + 1;
      else deeds.gloomDays = 0;
      if (!p.socialBreak) {
        if ((deeds.gloomDays ?? 0) >= CRISIS_GLOOM_DAYS) {
          p.socialBreak = { kind: 'crisis', until: turn + days(1) };
          simLog.logActivity({
            turn,
            type: 'social',
            actor: p.name,
            action: 'Crisis',
            result: `${firstName(p)} has stopped answering to anyone`,
            severity: 'critical',
            entityIds: [p.id],
            focusX: p.position?.x,
            focusY: p.position?.y,
            pulse: true
          });
        } else if (em < BREAK_MOOD) {
          p.socialBreak = { kind: 'break', until: turn + rng.int(days(0.3), days(1)) };
          simLog.logActivity({
            turn,
            type: 'social',
            actor: p.name,
            action: 'Break',
            result: `${firstName(p)} is refusing to work`,
            severity: 'warning',
            entityIds: [p.id],
            focusX: p.position?.x,
            focusY: p.position?.y
          });
        }
      }
    }

    return relsChanged ? { ...state, relationships: working } : state;
  }

  combatBark(pawn: Pawn, kind: CombatBarkKind, foeName: string | undefined, turn: number): void {
    if (pawn.isAlive === false || !pawn.position) return;
    if (turn - (_lastBark.get(pawn.id) ?? -Infinity) < BARK_COOLDOWN) return;
    if (barkHash(pawn.id, turn, BARK_CHANCE_SALT[kind]) >= BARK_CHANCE[kind]) return;
    _lastBark.set(pawn.id, turn);
    const text = pickBark(kind, foeName, barkHash(pawn.id, turn, BARK_LINE_SALT));
    if (!text) return;
    simLog.pushCombatText({
      worldX: pawn.position.x,
      worldY: pawn.position.y,
      text,
      kind: 'social',
      dy: -12
    });
  }

  processDialogTick(state: GameState): GameState {
    const turn = state.turn;
    const pairCd = DIALOG_PAIR_COOLDOWN_S * TICKS_PER_SECOND;
    const pawnCd = DIALOG_PAWN_COOLDOWN_S * TICKS_PER_SECOND;
    const danger: { x: number; y: number }[] = [];
    for (const p of state.pawns)
      if (p.isAlive !== false && p.currentState === 'Fighting' && p.position)
        danger.push(p.position);
    for (const m of state.mobs ?? [])
      if (m.state === 'Attacking' || m.state === 'Alerted') danger.push({ x: m.x, y: m.y });
    const nearDanger = (p: Pawn) =>
      !!p.position &&
      danger.some(
        (d) =>
          Math.max(Math.abs(d.x - p.position!.x), Math.abs(d.y - p.position!.y)) <=
          DIALOG_DANGER_RADIUS
      );
    const sociable = (p: Pawn) =>
      p.currentState === 'Idle' ||
      (!!p.position && nearGatheringPlace(state.buildings, p.position.x, p.position.y));
    const canTalk = (p: Pawn) =>
      p.isAlive !== false &&
      p.position &&
      p.currentState !== 'Sleeping' &&
      p.currentState !== 'Fighting' &&
      p.currentState !== 'Fleeing' &&
      !nearDanger(p) &&
      sociable(p) &&
      turn - (_lastPawnDialog.get(p.id) ?? -Infinity) >= pawnCd;
    const talkers = state.pawns.filter(canTalk);
    if (talkers.length < 2) return state;
    for (let i = talkers.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [talkers[i], talkers[j]] = [talkers[j], talkers[i]];
    }

    let working: PawnRelationship[] | null = null;
    const busy = new Set<string>();
    for (let i = _activeDialogs.length - 1; i >= 0; i--)
      if (_activeDialogs[i].until <= turn) _activeDialogs.splice(i, 1);
    const dialogHold = DIALOG_HOLD_S * TICKS_PER_SECOND;
    const spacedClear = (x: number, y: number) =>
      !_activeDialogs.some(
        (d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) < DIALOG_SPACING_RADIUS
      );

    for (const a of talkers) {
      if (busy.has(a.id)) continue;
      let b: Pawn | undefined;
      for (const cand of talkers) {
        if (cand.id === a.id || busy.has(cand.id)) continue;
        if (dist(a, cand) > DIALOG_RANGE) continue;
        if (turn - (_lastPairDialog.get(relKey(a.id, cand.id)) ?? -Infinity) < pairCd) continue;
        b = cand;
        break;
      }
      if (!b) continue;
      const cx = Math.round((a.position!.x + b.position!.x) / 2);
      const cy = Math.round((a.position!.y + b.position!.y) / 2);
      if (!spacedClear(cx, cy)) continue;
      if (rng.random() >= DIALOG_CHANCE) continue;

      busy.add(a.id);
      busy.add(b.id);
      _activeDialogs.push({ x: cx, y: cy, until: turn + dialogHold });
      _lastPairDialog.set(relKey(a.id, b.id), turn);
      _lastPawnDialog.set(a.id, turn);
      _lastPawnDialog.set(b.id, turn);
      working ??= state.relationships ? [...state.relationships] : [];
      this.runDialogBetween(state, working, a, b, turn);
    }
    return working ? { ...state, relationships: working } : state;
  }

  private applyDialogMood(p: Pawn, other: Pawn, effectId: string, turn: number): void {
    const eff = moodEffect(effectId);
    if (!eff || eff.value == null || eff.value === 0) return;
    const label = eff.label.replace(/\{name\}/g, firstName(other));
    this.addMoodModifier(
      p,
      `talk:${other.id}`,
      label,
      eff.value,
      days(DIALOG_MOOD_FADE_DAYS),
      turn
    );
  }

  private runDialogBetween(
    state: GameState,
    working: PawnRelationship[],
    a: Pawn,
    b: Pawn,
    turn: number
  ): void {
    const rel = this.ensureRel(working, a, b, state);
    const grieving = activeMoodModifiers(b, turn).some((m) => m.id.startsWith('grief:'));
    const battleContext = a.drafted === true && b.drafted === true;
    const atGathering =
      (!!a.position && nearGatheringPlace(state.buildings, a.position.x, a.position.y)) ||
      (!!b.position && nearGatheringPlace(state.buildings, b.position.x, b.position.y));
    let recall: { memory: EventMemory; ago: string } | undefined;
    if (
      !battleContext &&
      rel.stage !== 'enemies' &&
      rng.chance(atGathering ? 0.65 : RECALL_CHANCE)
    ) {
      const memory = memoryService.recall(a, b, turn);
      if (memory) recall = { memory, ago: memoryService.agoPhrase(turn - memory.turn) };
    }
    const flirtEligible =
      !recall && this.flirtEligible(a, b, rel, working, this.getBeauty(a), this.getBeauty(b));
    const outcome = runConversation(
      a,
      b,
      rel,
      { turn, weatherType: state.weather?.type, season: state.season },
      { flirtEligible, targetGrieving: grieving, battleContext, recall, atGathering }
    );
    this.applyDelta(rel, outcome.delta, {
      turn,
      label: this.convoLogLabel(outcome),
      kind: 'talk',
      lines: outcome.lines.map((l) => ({ name: l.name, text: l.text }))
    });
    rel.lastTalk = {
      subject: outcome.subject,
      category: outcome.category,
      positive: outcome.positive,
      turn
    };
    if (outcome.moodEffect) {
      this.applyDialogMood(a, b, outcome.moodEffect, turn);
      this.applyDialogMood(b, a, outcome.moodEffect, turn);
    }
    if (outcome.category === 'flirt') {
      this.afterFlirt(state, working, a, b, rel, outcome.positive, turn);
    }
    if (a.position)
      simLog.pushCombatText({
        worldX: a.position.x,
        worldY: a.position.y,
        text: outcome.lines[0].text,
        kind: 'social'
      });
    if (b.position)
      simLog.pushCombatText({
        worldX: b.position.x,
        worldY: b.position.y,
        text: outcome.lines[1].text,
        kind: 'social'
      });
    simLog.logActivity({
      turn,
      type: 'social',
      actor: a.name,
      target: b.name,
      action: this.categoryLabel(outcome.category),
      result: `${firstName(a)} and ${firstName(b)}: ${outcome.resultText}`,
      severity: outcome.positive ? 'info' : 'warning',
      entityIds: [a.id, b.id],
      focusX: a.position?.x,
      focusY: a.position?.y,
      details: { lines: outcome.lines, category: outcome.category }
    });
  }

  private ageGapPlausible(a: Pawn, b: Pawn): boolean {
    const gap = Math.abs((a.age ?? 25) - (b.age ?? 25));
    if (gap <= ROMANCE_AGE_GAP_FREE) return true;
    const chance = 1 - (gap - ROMANCE_AGE_GAP_FREE) / ROMANCE_AGE_GAP_SPAN;
    return chance > 0 && rng.random() < chance;
  }

  private flirtEligible(
    a: Pawn,
    b: Pawn,
    rel: PawnRelationship,
    working: PawnRelationship[],
    beautyA: number,
    beautyB: number
  ): boolean {
    if ((a.age ?? 25) < ROMANCE_MIN_AGE || (b.age ?? 25) < ROMANCE_MIN_AGE) return false;
    if (!a.sex || !b.sex || a.sex === b.sex) return false;
    if (!this.ageGapPlausible(a, b)) return false;
    if (rel.kin) return false;
    if (rel.romance?.stage === 'ex') return false;
    if (rel.score < FLIRT_MIN_SCORE) return false;
    if (beautyA < ATTRACTION_MIN_BEAUTY) return false;
    if (beautyB < ATTRACTION_MIN_BEAUTY) return false;
    const partneredElsewhere = (p: Pawn) =>
      working.some(
        (r) =>
          r.romance?.stage === 'partners' &&
          (r.pawnA === p.id || r.pawnB === p.id) &&
          !(r.pawnA === rel.pawnA && r.pawnB === rel.pawnB)
      );
    if (partneredElsewhere(a) || partneredElsewhere(b)) return rng.random() < AFFAIR_CHANCE;
    return true;
  }

  private afterFlirt(
    state: GameState,
    working: PawnRelationship[],
    a: Pawn,
    b: Pawn,
    rel: PawnRelationship,
    positive: boolean,
    turn: number
  ): void {
    if (!positive) return;
    rel.flirts = (rel.flirts ?? 0) + 1;
    const flirts = rel.flirts;
    if (!rel.romance && flirts >= FLIRTS_TO_INTEREST) {
      rel.romance = { stage: 'interested', since: turn };
    } else if (rel.romance?.stage === 'interested' && flirts >= FLIRTS_TO_COURT) {
      rel.romance = { stage: 'courting', since: turn };
    } else if (
      rel.romance?.stage === 'courting' &&
      flirts >= FLIRTS_TO_PARTNER &&
      rel.score >= PARTNER_MIN_SCORE
    ) {
      rel.romance = { stage: 'partners', since: turn };
      this.recordEvent(rel, { turn, delta: 0, label: 'Became a couple', kind: 'romance' }, false);
      for (const p of [a, b]) {
        const love = p === a ? b : a;
        this.addMoodModifier(
          p,
          `new-love:${rel.pawnA}|${rel.pawnB}`,
          `Together with ${firstName(love)}`,
          8,
          days(3),
          turn
        );
      }
      simLog.logActivity({
        turn,
        type: 'social',
        actor: a.name,
        target: b.name,
        action: 'A match',
        result: `${firstName(a)} and ${firstName(b)} are now a couple`,
        severity: 'success',
        entityIds: [a.id, b.id]
      });
    }
    for (const p of [a, b]) {
      const other = p === a ? b : a;
      const partnerRel = working.find(
        (r) =>
          r.romance?.stage === 'partners' &&
          (r.pawnA === p.id || r.pawnB === p.id) &&
          !(r.pawnA === rel.pawnA && r.pawnB === rel.pawnB)
      );
      if (partnerRel) {
        const partnerId = partnerRel.pawnA === p.id ? partnerRel.pawnB : partnerRel.pawnA;
        const partner = state.pawns.find((q) => q.id === partnerId);
        if (partner && partner.isAlive !== false) {
          this.addMoodModifier(
            partner,
            `jealousy:${p.id}`,
            `${firstName(p)} has a wandering eye`,
            -8,
            days(3),
            turn
          );
          const jRel = this.ensureRel(working, partner, p, state);
          this.applyDelta(jRel, -10, {
            turn,
            label: `${firstName(p)} has a wandering eye`,
            kind: 'romance'
          });
        }
        this.applyDelta(this.ensureRel(working, p, other, state), 0);
      }
    }
  }

  private convoLogLabel(o: ConversationOutcome): string {
    switch (o.category) {
      case 'small_talk':
      case 'banter':
      case 'deep_talk':
        return o.positive ? `Talked about ${o.subject}` : `Fell out over ${o.subject}`;
      case 'comfort':
        return o.positive ? 'Shared a moment of comfort' : 'Comfort was not wanted';
      case 'flirt':
        return o.positive ? 'A warm exchange' : 'A rebuffed advance';
      case 'battle_talk':
        return o.positive ? 'Steadied each other under arms' : 'Frayed nerves before the fight';
      case 'argue':
        return `Argued over ${o.subject}`;
      case 'insult':
        return 'Traded harsh words';
    }
  }

  private categoryLabel(c: ConversationCategory): string {
    switch (c) {
      case 'small_talk':
        return 'Small talk';
      case 'banter':
        return 'Banter';
      case 'deep_talk':
        return 'A quiet talk';
      case 'flirt':
        return 'Courtship';
      case 'comfort':
        return 'Consolation';
      case 'battle_talk':
        return 'Words under arms';
      case 'argue':
        return 'An argument';
      case 'insult':
        return 'An insult';
    }
  }
}

export const socialService = new SocialServiceImpl();
