// SocialService — the pawn-to-pawn social layer (SOCIAL-LAYER). Owns:
//   §1 relationships  — sparse PawnRelationship rows, culture-seeded, stage ladder w/ hysteresis
//   §3 conversations  — the daily heartbeat: assembled exchanges, floaters, one chronicle entry each
//   §4 romance        — interested → courting → partners over flirt successes; breakups; jealousy
//   §6 prestige       — basePrestige + worn regalia × quality/Famed (the `prestige` formula token)
//   §7 mood depth     — event MoodModifiers layered over the ambient state.mood drift; breaks/crises
// `processSocialTurn` runs ONCE PER IN-GAME DAY from GameEngineImpl's events phase (zero per-tick
// cost); the big event deltas (rescue/tend/grief/friendly fire) arrive through the on* hooks below.
// Perf contract (ENGINE-PERFORMANCE): pawn field writes REPLACE refs (cold-field diff), the
// relationships array is replaced whole on change, and unchanged days return the same state ref.

import type {
  GameState,
  ItemInstance,
  Mob,
  MoodModifier,
  Pawn,
  PawnRelationship,
  RelationTag
} from '../core/types';
import { itemDefById } from '../core/itemDefs';
import { combinedQualityMultiplier } from '../core/itemQuality';
import {
  activeMoodModifiers,
  effectiveMood,
  findRelationship,
  seedScore,
  sortedPair,
  stageForScore
} from '../core/Social';
import { rng } from '../core/rng';
import { simLog } from '../core/logSink';
import { TICKS_PER_SECOND } from '../core/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { pawnStatService } from './PawnStatService';
import { runConversation, type ConversationCategory } from './social/conversations';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;
const days = (n: number) => Math.round(n * TICKS_PER_DAY);

// ── Tunables ──────────────────────────────────────────────────────────────────────────────────
// §1 procedural daily deltas
const WORKED_TOGETHER_DELTA = 0.5; // both working within the cluster radius at the daily sample
const TRAIT_AFFINITY_DELTA = 0.5; // personality match (+) / clash (−) per day, existing pairs only
const IDLE_RIVAL_DELTA = -1; // idling next to a rival/enemy
const WORK_CLUSTER_RADIUS = 6;
const IDLE_ADJ_RADIUS = 2;
// §1 event deltas (pushed by the owning systems via the on* hooks)
const RESCUE_DELTA = 18;
const TEND_DELTA = 8;
const FOUGHT_ALONGSIDE_DELTA = 4;
const WITNESS_DEATH_DELTA = 6;
const FRIENDLY_FIRE_DELTA = -20;
const FOUGHT_ALONGSIDE_RADIUS = 6;
const WITNESS_RADIUS = 10;
// §3 conversations
const CONVO_RADIUS = 5;
const CONVO_CHANCE = 0.65;
const MAX_CONVOS_PER_PAWN = 2;
// §4 romance
const ATTRACTION_MIN_BEAUTY = 0.75;
const ROMANCE_MIN_AGE = 18;
const FLIRTS_TO_INTEREST = 3;
const FLIRTS_TO_COURT = 6;
const FLIRTS_TO_PARTNER = 10;
const PARTNER_MIN_SCORE = 45;
const AFFAIR_CHANCE = 0.1; // a partnered pawn flirting elsewhere (jealousy follows)
// §7 mood + breaks
const BREAK_MOOD = 20;
const CRISIS_GLOOM_DAYS = 2; // consecutive daily samples at rock bottom before a crisis
const PRESTIGE_FINE_THRESHOLD = 20;

// Personality pairs that grate (∓ the affinity delta per day) and kindred spirits that bond.
const TRAIT_CLASHES: [string, string][] = [
  ['industrious', 'lazy'],
  ['meticulous', 'slapdash'],
  ['curious', 'incurious'],
  ['gregarious', 'loner'],
  ['hot-headed', 'hot-headed'],
  ['ill-tempered', 'ill-tempered']
];
const TRAIT_MATCHES = ['industrious', 'meticulous', 'curious', 'gregarious', 'loner'];

// Fought-alongside dedupe (once per pair per day). Worker-transient — a reload forgetting it only
// risks one duplicate +4, not worth persisting.
const _battleBondDay = new Map<string, number>();

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
  /** Standing prestige: inherent bearing from station/upbringing (BACKGROUNDS `basePrestige`, pawns
   *  only) plus worn regalia. 0 for a plain commoner in rags. */
  getPrestige(entity: Pawn | Mob): number {
    let total = 'basePrestige' in entity ? ((entity as Pawn).basePrestige ?? 0) : 0;
    const equipment = entity.equipment;
    if (!equipment) return total;
    for (const inst of Object.values(equipment) as (ItemInstance | undefined | null)[]) {
      if (!inst || !inst.itemId) continue;
      const bonus = itemDefById(inst.itemId)?.armorProperties?.prestigeBonus;
      if (!bonus) continue;
      total += bonus * combinedQualityMultiplier(inst.quality, inst.famedStatMult);
    }
    return Math.round(total);
  }

  /** §5 beauty (the `beauty` stats.jsonc formula: CHA × intact body). */
  getBeauty(pawn: Pawn): number {
    return pawnStatService.evaluateStat('beauty', pawn);
  }

  /** §7 ambient mood + active event modifiers, clamped 0–100. */
  getEffectiveMood(pawn: Pawn, turn: number): number {
    return effectiveMood(pawn, turn);
  }

  /**
   * §7 upsert an event mood (same id replaces — a fresh grief restarts the clock). REPLACES the
   * pawn's `moodModifiers` array (snapshot cold-field contract). `durationTicks` 0 = standing.
   */
  addMoodModifier(
    pawn: Pawn,
    id: string,
    label: string,
    value: number,
    durationTicks: number,
    turn: number
  ): void {
    const next = (pawn.moodModifiers ?? []).filter((m) => m.id !== id);
    next.push({ id, label, value, expiresAt: durationTicks > 0 ? turn + durationTicks : 0 });
    pawn.moodModifiers = next;
  }

  /** Remove one modifier by id (standing bands that no longer apply). */
  removeMoodModifier(pawn: Pawn, id: string): void {
    const mods = pawn.moodModifiers;
    if (!mods || !mods.some((m) => m.id === id)) return;
    pawn.moodModifiers = mods.filter((m) => m.id !== id);
  }

  // ── §1 relationship plumbing ────────────────────────────────────────────────────────────────

  /** Find-or-create the pair's row, culture-seeded (+kin) on creation. Works on a WORKING array
   *  the caller already owns (it mutates rows in place and pushes new ones). */
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
    // kin kind is stored from pawnA's perspective
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
    working.push(rel);
    return rel;
  }

  /** Apply a signed delta to a working row: clamp, tally history, restage with hysteresis. */
  private applyDelta(rel: PawnRelationship, delta: number, tags?: RelationTag[]): void {
    rel.score = Math.max(-100, Math.min(100, rel.score + delta));
    rel.points.history += Math.abs(delta);
    rel.stage = stageForScore(rel.score, rel.stage);
    if (tags) {
      for (const t of tags) if (!rel.tags.includes(t)) rel.tags.push(t);
    }
  }

  /** One-pair event delta from an owning system (rescue/tend/friendly fire…). Returns new state
   *  (relationships array replaced) — the caller reassigns its gameState. */
  adjustRelation(
    state: GameState,
    a: Pawn,
    b: Pawn,
    delta: number,
    tags?: RelationTag[]
  ): GameState {
    if (a.id === b.id) return state;
    const working = state.relationships ? [...state.relationships] : [];
    const rel = this.ensureRel(working, a, b, state);
    this.applyDelta(rel, delta, tags);
    return { ...state, relationships: working };
  }

  // ── Event hooks (§1 event-driven table) ─────────────────────────────────────────────────────

  /** Combat rescue: one pawn picked up a collapsed ally (systems/pawn/carry.ts). */
  onRescue(state: GameState, rescuer: Pawn, rescued: Pawn): GameState {
    this.addMoodModifier(
      rescued,
      `rescued:${rescuer.id}`,
      `Carried to safety by ${firstName(rescuer)}`,
      6,
      days(3),
      state.turn
    );
    return this.adjustRelation(state, rescuer, rescued, RESCUE_DELTA, [
      'rescued_by',
      'battle_forged'
    ]);
  }

  /** A medic dressed the patient's wounds (services/jobs/caretake.ts). */
  onTend(state: GameState, medic: Pawn, patient: Pawn): GameState {
    return this.adjustRelation(state, medic, patient, TEND_DELTA);
  }

  /** A colonist hurt a fellow colonist (brawl / stray blow — Combat.performAttack). */
  onFriendlyFire(state: GameState, attacker: Pawn, victim: Pawn): GameState {
    return this.adjustRelation(state, attacker, victim, FRIENDLY_FIRE_DELTA);
  }

  /** A pawn landed a kill; every colonist near the fight shares the bond (once per pair per day). */
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
        this.applyDelta(rel, FOUGHT_ALONGSIDE_DELTA, ['battle_forged']);
      }
    }
    return working ? { ...state, relationships: working } : state;
  }

  /**
   * A pawn died (PawnStateMachine.finalizePawnDeath, before the record is built). Grief lands on
   * everyone who loved them, witnesses bond, and the dead pawn's rows are retired (the family
   * tree survives via `kin` + the DeadPawnRecord).
   */
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
    // Kin grieve even without a relationship row.
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
    // Witnesses of the death bond over it.
    let working = rels.filter((r) => r.pawnA !== dead.id && r.pawnB !== dead.id);
    if (dead.position) {
      const witnesses = state.pawns.filter(
        (p) =>
          p.id !== dead.id && p.isAlive !== false && p.position && dist(p, dead) <= WITNESS_RADIUS
      );
      for (let i = 0; i < witnesses.length; i++) {
        for (let j = i + 1; j < witnesses.length; j++) {
          const rel = this.ensureRel(working, witnesses[i], witnesses[j], state);
          this.applyDelta(rel, WITNESS_DEATH_DELTA, ['grief_bond']);
        }
      }
    }
    return { ...state, relationships: working };
  }

  /** A hot cooked meal (needs handler): a small, day-long lift. */
  onAteHotMeal(pawn: Pawn, turn: number): void {
    this.addMoodModifier(pawn, 'hot-meal', 'Ate a hot meal', 8, days(1), turn);
  }

  /** Woke from a night in a real bed (needs handler). */
  onSleptInBed(pawn: Pawn, turn: number): void {
    this.addMoodModifier(pawn, 'slept-bed', 'Slept in a bed', 5, days(1), turn);
  }

  /** Two pawns shared a meal by the fire (needs handler, eat-start adjacency). */
  onSharedMeal(state: GameState, a: Pawn, b: Pawn): GameState {
    return this.adjustRelation(state, a, b, 1);
  }

  // ── §B the daily social pass ────────────────────────────────────────────────────────────────

  /**
   * Runs once per in-game day (events phase). Prunes expired moods, re-evaluates standing bands,
   * applies proximity/trait deltas, rolls conversations, advances romance, and checks breaks.
   */
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

    // Per-pawn upkeep: prune expired moods, standing bands, idle streaks, breaks.
    const beautyOf = new Map<string, number>();
    for (const p of alive) {
      // prune expired modifiers
      if (p.moodModifiers && p.moodModifiers.length > 0) {
        const live = activeMoodModifiers(p, turn);
        if (live.length !== p.moodModifiers.length) p.moodModifiers = live;
      }
      // standing prestige band
      const prestige = this.getPrestige(p);
      const dressed = p.equipment && Object.values(p.equipment).some((i) => i);
      if (prestige >= PRESTIGE_FINE_THRESHOLD) {
        this.addMoodModifier(p, 'prestige-band', 'Finely arrayed', 5, 0, turn);
      } else if (!dressed) {
        this.addMoodModifier(p, 'prestige-band', 'Dressed in rags', -5, 0, turn);
      } else {
        this.removeMoodModifier(p, 'prestige-band');
      }
      // standing beauty band
      const beauty = this.getBeauty(p);
      beautyOf.set(p.id, beauty);
      if (beauty >= 1.25) {
        this.addMoodModifier(p, 'beauty-band', 'Turns heads', 3, 0, turn);
      } else if (beauty <= 0.7) {
        this.addMoodModifier(p, 'beauty-band', 'Hard to look at', -4, 0, turn);
      } else {
        this.removeMoodModifier(p, 'beauty-band');
      }
      // idle streak (§7: idle 3+ days)
      const deeds = (p.deeds ??= {});
      if (p.currentState === 'Idle' && !p.activeJob) {
        deeds.idleDays = (deeds.idleDays ?? 0) + 1;
      } else {
        deeds.idleDays = 0;
      }
      if ((deeds.idleDays ?? 0) >= 3) {
        this.addMoodModifier(p, 'idle', 'Nothing to do for days', -8, 0, turn);
      } else {
        this.removeMoodModifier(p, 'idle');
      }
    }

    // Pairwise procedural deltas + proximity standing moods (≤ ~1225 pairs at 50 pawns, daily).
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      let nearFriend = false;
      let nearRival = false;
      for (let j = 0; j < alive.length; j++) {
        if (i === j) continue;
        const b = alive[j];
        const d = dist(a, b);
        if (j > i) {
          // one-directional pair work (deltas applied once per pair)
          if (d <= WORK_CLUSTER_RADIUS && a.state?.isWorking && b.state?.isWorking) {
            this.applyDelta(touch(a, b), WORKED_TOGETHER_DELTA);
          }
          const rel = findRelationship(working, a.id, b.id);
          if (rel) {
            // personality clash / kindred spirits (existing pairs only — keeps the graph sparse)
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
              this.applyDelta(rel, affinity);
            }
            // idling next to a rival grates
            if (
              d <= IDLE_ADJ_RADIUS &&
              a.currentState === 'Idle' &&
              b.currentState === 'Idle' &&
              (rel.stage === 'rivals' || rel.stage === 'enemies')
            ) {
              relsChanged = true;
              this.applyDelta(rel, IDLE_RIVAL_DELTA);
            }
          }
        }
        // proximity standing moods (per pawn, from either direction)
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

    // Conversations (§3): a few a day, capped per pawn, between awake neighbours.
    const convoCount = new Map<string, number>();
    const order = [...alive];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const canTalk = (p: Pawn) =>
      p.position &&
      p.currentState !== 'Sleeping' &&
      !p.drafted &&
      (convoCount.get(p.id) ?? 0) < MAX_CONVOS_PER_PAWN;
    for (const a of order) {
      if (!canTalk(a) || (convoCount.get(a.id) ?? 0) >= 1) continue; // one initiation each
      const partners = order.filter(
        (b) => b.id !== a.id && canTalk(b) && dist(a, b) <= CONVO_RADIUS
      );
      if (partners.length === 0) continue;
      if (rng.random() >= CONVO_CHANCE) continue;
      const b = rng.pick(partners);
      relsChanged = true;
      const rel = this.ensureRel(working, a, b, state);
      const grieving = activeMoodModifiers(b, turn).some((m) => m.id.startsWith('grief:'));
      const flirtEligible = this.flirtEligible(a, b, rel, working, beautyOf);
      const outcome = runConversation(
        a,
        b,
        rel,
        { turn, weatherType: state.weather?.type, season: state.season },
        { flirtEligible, targetGrieving: grieving }
      );
      this.applyDelta(rel, outcome.delta);
      convoCount.set(a.id, (convoCount.get(a.id) ?? 0) + 1);
      convoCount.set(b.id, (convoCount.get(b.id) ?? 0) + 1);
      // romance beats ride flirt outcomes
      if (outcome.category === 'flirt') {
        this.afterFlirt(state, working, a, b, rel, outcome.positive, turn);
      }
      // floaters: each speaker's line over their head
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
          kind: 'social',
          dy: 8
        });
      // one expandable chronicle entry per conversation
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

    // Romance upkeep (§4): breakups when a partnership has soured.
    for (const rel of working) {
      const stage = rel.romance?.stage;
      if ((stage === 'partners' || stage === 'courting') && rel.score < 0) {
        relsChanged = true;
        rel.romance = { stage: 'ex', since: turn };
        rel.score = Math.min(rel.score, -25);
        rel.stage = stageForScore(rel.score, rel.stage);
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

    // Breaks & crises (§7), off the EFFECTIVE mood (drift + modifiers).
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

  // ── §4 romance internals ────────────────────────────────────────────────────────────────────

  private flirtEligible(
    a: Pawn,
    b: Pawn,
    rel: PawnRelationship,
    working: PawnRelationship[],
    beautyOf: Map<string, number>
  ): boolean {
    if ((a.age ?? 25) < ROMANCE_MIN_AGE || (b.age ?? 25) < ROMANCE_MIN_AGE) return false;
    if (rel.kin) return false;
    if (rel.romance?.stage === 'ex') return false;
    if (rel.score < 10) return false;
    // mutual attraction: each finds the other easy to look at
    if ((beautyOf.get(a.id) ?? 1) < ATTRACTION_MIN_BEAUTY) return false;
    if ((beautyOf.get(b.id) ?? 1) < ATTRACTION_MIN_BEAUTY) return false;
    // loyalty: a pawn partnered elsewhere only strays rarely (jealousy follows)
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
    // jealousy: a partner elsewhere learns of the flirt
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
          this.applyDelta(jRel, -10);
        }
        this.applyDelta(this.ensureRel(working, p, other, state), 0); // ensure row exists for the affair
      }
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
      case 'argue':
        return 'An argument';
      case 'insult':
        return 'An insult';
    }
  }
}

export const socialService = new SocialServiceImpl();
