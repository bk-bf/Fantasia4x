// SocialService — the pawn-to-pawn social layer (SOCIAL-LAYER). Owns:
//   §1 relationships  — sparse PawnRelationship rows, culture-seeded, stage ladder w/ hysteresis
//   §3 dialog         — PROXIMITY-triggered (processDialogTick): pawns chat when they pass within a
//                       couple of tiles — assembled exchange, floaters, one chronicle entry each
//   §4 romance        — interested → courting → partners over flirt successes; breakups; jealousy
//   §6 prestige       — basePrestige + worn regalia × quality/Famed (the `prestige` formula token)
//   §7 mood depth     — event MoodModifiers layered over the ambient state.mood drift; breaks/crises
// `processSocialTurn` runs ONCE PER IN-GAME DAY from GameEngineImpl's events phase (zero per-tick
// cost); the big event deltas (rescue/tend/grief/friendly fire) arrive through the on* hooks below.
// Perf contract (ENGINE-PERFORMANCE): pawn field writes REPLACE refs (cold-field diff), the
// relationships array is replaced whole on change, and unchanged days return the same state ref.

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
import { itemDefById } from '../core/itemDefs';
import { combinedQualityMultiplier } from '../core/itemQuality';
import {
  activeMoodModifiers,
  effectiveMood,
  findRelationship,
  relKey,
  seedScore,
  sortedPair,
  stageForScore
} from '../core/Social';
import { rng } from '../core/rng';
import { moodEffect } from '../core/moodEffects';
import { memoryService } from './MemoryService';
import { simLog } from '../core/logSink';
import { TICKS_PER_SECOND } from '../core/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import { nearGatheringPlace } from '../core/buildingAmenity';
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
// Per-pair history depth: keep the last N discrete events (rescues, talks, fights…). The rolled-up
// ambient `time`/`seed` entries are pinned and don't count against this, so meaningful moments show.
const REL_LOG_CAP = 12;

// ── Tunables ──────────────────────────────────────────────────────────────────────────────────
// §1 procedural daily deltas
const WORKED_TOGETHER_DELTA = 0.5; // both working within the cluster radius at the daily sample
const TRAIT_AFFINITY_DELTA = 0.5; // personality match (+) / clash (−) per day, existing pairs only
const IDLE_RIVAL_DELTA = -1; // idling next to a rival/enemy
const WORK_CLUSTER_RADIUS = 6;
const IDLE_ADJ_RADIUS = 2;
// Seeing each other is meeting: pairs within this range get their Strangers row on the daily pass.
const MEET_RADIUS = 12;
// §1 event deltas (pushed by the owning systems via the on* hooks)
const RESCUE_DELTA = 18;
const TEND_DELTA = 8;
const FOUGHT_ALONGSIDE_DELTA = 4;
const WITNESS_DEATH_DELTA = 6;
const FRIENDLY_FIRE_DELTA = -20;
const FOUGHT_ALONGSIDE_RADIUS = 6;
const WITNESS_RADIUS = 10;
// §3 dialog — PROXIMITY-triggered (pawns chat when they pass close by), on a throttled tick so the
// player sees it happen. Cooldowns keep a busy colony from flooding the chronicle.
const DIALOG_RANGE = 2; // tiles — pawns strike up a dialog within this of each other
const DIALOG_CHANCE = 0.6; // chance an eligible, off-cooldown pair actually starts talking this tick
const DIALOG_PAIR_COOLDOWN_S = 25; // in-game seconds before the SAME pair chats again
const DIALOG_PAWN_COOLDOWN_S = 6; // in-game seconds before a pawn joins ANY new dialog
const DIALOG_DANGER_RADIUS = 8; // no drawn-out dialog within this many tiles of an active fight
// Anti-clutter: two conversations too close together spam overlapping speech bubbles, so a new dialog
// can't start within DIALOG_SPACING_RADIUS tiles of one whose bubbles are still on screen — near pairs
// take turns, distant pairs (≥ this apart) may talk at once. Kept live for DIALOG_HOLD_S (≥ the 4.5s
// SOCIAL_TTL_MS bubble dwell in combatFeedback.ts) after a dialog fires.
const DIALOG_SPACING_RADIUS = 10;
const DIALOG_HOLD_S = 5;
// MOOD-REWORK: a dialog leaves a faded mood "thought" on both talkers (dialog.jsonc moodGood/moodBad).
// The magnitude carries the weight; they all fade over this window (a chat's afterglow / an insult's sting).
const DIALOG_MOOD_FADE_DAYS = 0.5;
// PAWN-MEMORY: chance an eligible dialog reminisces about a witnessed memory instead of generic chatter.
const RECALL_CHANCE = 0.5;
// COMBAT BARKS: short reactions barked mid-fight. Per-pawn spacing + a per-kind chance so they stay
// occasional (a fight is barks, not a conversation — see the Fighting/Fleeing gate in processDialogTick).
const BARK_COOLDOWN = 3 * TICKS_PER_SECOND;
const BARK_CHANCE: Record<CombatBarkKind, number> = { hit: 0.3, miss: 0.25, hurt: 0.5, kill: 0.75 };
// §4 romance
const ATTRACTION_MIN_BEAUTY = 0.75;
const ROMANCE_MIN_AGE = 18;
// Attraction only kindles once there's a real bond — friends territory, not a pair who just met.
// (Same-culture pawns SEED at ~15, so the old score>=10 gate let near-strangers flirt on sight.)
const FLIRT_MIN_SCORE = 40;
// Age-gap plausibility: gaps up to FREE years carry no penalty; attraction then falls off linearly
// to nil at FREE+SPAN (a ~20y gap is unlikely, ~30y near-impossible). Both are already adults.
const ROMANCE_AGE_GAP_FREE = 5;
const ROMANCE_AGE_GAP_SPAN = 20;
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
// Dialog cooldowns (worker-transient): last turn a PAIR talked / a PAWN last joined any dialog.
const _lastPairDialog = new Map<string, number>();
const _lastPawnDialog = new Map<string, number>();
// Conversations whose bubbles are still on screen (centre tile + expiry turn) — new dialogs keep
// DIALOG_SPACING_RADIUS clear of these so nearby talk takes turns instead of overlapping.
const _activeDialogs: { x: number; y: number; until: number }[] = [];
// Combat-bark cooldown (worker-transient): last turn a PAWN barked in a fight.
const _lastBark = new Map<string, number>();

/** Reset every worker-transient social cooldown/dedupe (fresh run / headless session start —
 *  ADR-033 replay determinism). A fresh worker gets this for free by being a new module instance;
 *  an in-process HeadlessSession must ask for it, else run A's chat history mutes run B's. */
export function resetSocialTransients(): void {
  _battleBondDay.clear();
  _lastPairDialog.clear();
  _lastPawnDialog.clear();
  _activeDialogs.length = 0;
  _lastBark.clear();
}
// Deterministic 0–1 from (id, turn, salt) — used for combat-bark chance + line selection so barks NEVER
// consume the shared combat rng (which would perturb hit/damage rolls). Replay-safe, allocation-free.
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
    next.push({
      id,
      label,
      value,
      expiresAt: durationTicks > 0 ? turn + durationTicks : 0,
      startedAt: turn // fade window start (ignored for standing bands, expiresAt: 0)
    });
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
    // Seed the history with the first-impression baseline (kin/culture) when it isn't a plain 0.
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

  /** Apply a signed delta to a working row: clamp, tally history, restage, tag, and (when the
   *  caller names the moment) record it in the pair's history log. */
  private applyDelta(
    rel: PawnRelationship,
    delta: number,
    opts?: {
      tags?: RelationTag[];
      turn?: number;
      label?: string;
      kind?: RelationEventKind;
      /** For `talk`: the assembled dialogue, stored on the event for the Relations-tab transcript. */
      lines?: { name: string; text: string }[];
      /** Fold into an existing same-kind/same-label entry (ambient day-to-day drift) instead of
       *  pushing a fresh line. */
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

  /** Append (or coalesce) one history line, keeping the log bounded. The pinned `seed`/`time`
   *  totals survive the cap so the rolling "day to day" figure is never crowded out. */
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
    // Cap the DISCRETE tail; drop the oldest non-pinned entry first (pinned = seed + ambient time).
    while (log.length > REL_LOG_CAP) {
      const i = log.findIndex((e) => e.kind !== 'time' && e.kind !== 'seed');
      log.splice(i >= 0 ? i : 0, 1);
    }
    rel.log = log;
  }

  /**
   * Everyone in the colony has MET everyone: ensure a (culture-seeded) row for every living pawn
   * pair, so the Relations tab shows at least Strangers from the first look. Called at colony gen,
   * on migrant join, and as the old-save backfill on load. Idempotent — returns the SAME state ref
   * when no pair was missing.
   */
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

  /**
   * SOCIAL-LAYER: seed a culture+warmth relationship row for every KIN tie a colony pawn holds —
   * whether the relative is another colonist OR an off-colony person in `worldPawns`. Called once
   * at colony gen (after `worldPawns` is set). Idempotent; returns the same state ref if nothing new.
   */
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

  /** One-pair event delta from an owning system (rescue/tend/friendly fire…). Returns new state
   *  (relationships array replaced) — the caller reassigns its gameState. `label`/`kind` name the
   *  moment for the history log (defaulting `turn` to the current turn). */
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
    return this.adjustRelation(state, rescuer, rescued, RESCUE_DELTA, {
      tags: ['rescued_by', 'battle_forged'],
      label: `Carried out of danger by ${firstName(rescuer)}`,
      kind: 'rescue'
    });
  }

  /** A medic dressed the patient's wounds (services/jobs/caretake.ts). */
  onTend(state: GameState, medic: Pawn, patient: Pawn): GameState {
    return this.adjustRelation(state, medic, patient, TEND_DELTA, {
      label: `${firstName(medic)} tended their wounds`,
      kind: 'tend'
    });
  }

  /** A colonist hurt a fellow colonist (brawl / stray blow — Combat.performAttack). */
  onFriendlyFire(state: GameState, attacker: Pawn, victim: Pawn): GameState {
    return this.adjustRelation(state, attacker, victim, FRIENDLY_FIRE_DELTA, {
      label: `${firstName(attacker)} drew their blood`,
      kind: 'strife'
    });
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

  /** PAWN-MEMORY: how memorable `dead`'s passing is to `witness`, by their bond. A partner/kin/best
   *  friend's death is historic (never forgotten); a rival's lingers; a stranger's fades in weeks. */
  private deathMemorability(witness: Pawn, dead: Pawn, rels: PawnRelationship[]): number {
    const kin = witness.kin?.some((k) => k.pawnId === dead.id);
    const rel = findRelationship(rels, witness.id, dead.id);
    if (kin || rel?.romance?.stage === 'partners' || rel?.stage === 'best_friends') return 0.96; // historic
    if (rel?.stage === 'friends') return 0.72; // significant — carried for a season
    if (rel?.stage === 'rivals' || rel?.stage === 'enemies') return 0.55; // you don't forget a rival's fall
    if (rel?.stage === 'acquaintances') return 0.48; // notable — weeks
    return 0.4; // a stranger's death — a pall, but it fades
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
      const deadName = firstName(dead);
      for (const w of witnesses) {
        // PAWN-MEMORY: how deeply a death is remembered depends on the bond — a loved one's passing is
        // historic (never forgotten); a stranger's fades in weeks. Read from `rels` (still holds the
        // dead's rows here, before `working` retires them).
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
    return this.adjustRelation(state, a, b, 1, {
      label: 'Time spent together',
      kind: 'time',
      coalesce: true
    });
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
    for (const p of alive) {
      // prune expired modifiers
      if (p.moodModifiers && p.moodModifiers.length > 0) {
        const live = activeMoodModifiers(p, turn);
        if (live.length !== p.moodModifiers.length) p.moodModifiers = live;
      }
      // PAWN-MEMORY: drop faded (non-historic) memories past their recall window.
      memoryService.prune(p, turn);
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
        // PAWN-MEMORY: the tick a pawn's idling crosses into "days on end", the pawns around notice a
        // loafer — a trivial memory that's banter fodder for a few days. Fires once per idle streak.
        if (deeds.idleDays === 3 && p.position) {
          memoryService.recordAroundKind(state, p.position.x, p.position.y, p.id, 'idled', {
            subjectName: firstName(p)
          });
        }
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
          // Meeting: any pair within sight of each other has at least a Strangers row (the gen/
          // join paths call meetColony, so this is the catch-all for debug spawns and stragglers).
          if (d <= MEET_RADIUS && !findRelationship(working, a.id, b.id)) touch(a, b);
          // one-directional pair work (deltas applied once per pair)
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
              this.applyDelta(rel, affinity, {
                turn,
                label: affinity > 0 ? 'Kindred temperaments' : 'Grating temperaments',
                kind: 'time',
                coalesce: true
              });
            }
            // idling next to a rival grates
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

    // Conversations no longer fire here — they're PROXIMITY-triggered in `processDialogTick`
    // (pawns chat when they pass within a couple of tiles), so the player actually sees them.
    // This daily pass keeps the ambient drift, standing moods, romance upkeep, and break checks.

    // Romance upkeep (§4): breakups when a partnership has soured.
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

  // ── combat barks ──────────────────────────────────────────────────────────────────────────────

  /**
   * A short combat reaction over a colonist's head (Combat.ts, on a landed/whiffed blow, a wound taken,
   * or a killing blow). Terse and occasional — a per-pawn cooldown + per-kind chance keep it from
   * becoming a chat. `foeName` is what they're fighting (fills `{foe}`). A white speech floater.
   */
  combatBark(pawn: Pawn, kind: CombatBarkKind, foeName: string | undefined, turn: number): void {
    if (pawn.isAlive === false || !pawn.position) return;
    if (turn - (_lastBark.get(pawn.id) ?? -Infinity) < BARK_COOLDOWN) return;
    // Deterministic gate + line pick (no combat-rng consumption — see barkHash).
    if (barkHash(pawn.id, turn, BARK_CHANCE_SALT[kind]) >= BARK_CHANCE[kind]) return;
    _lastBark.set(pawn.id, turn);
    const text = pickBark(kind, foeName, barkHash(pawn.id, turn, BARK_LINE_SALT));
    if (!text) return;
    simLog.pushCombatText({
      worldX: pawn.position.x,
      worldY: pawn.position.y,
      text,
      kind: 'social',
      dy: -12 // lift the bark above the damage numbers
    });
  }

  // ── §3 the proximity dialog tick ──────────────────────────────────────────────────────────────

  /**
   * Runs on a THROTTLED tick (every few in-game seconds, GameEngineImpl) — NOT per tick. Any two
   * awake colonists who pass within {@link DIALOG_RANGE} tiles may strike up a dialog: an assembled
   * exchange with floaters over their heads and one expandable chronicle entry, moving their
   * relationship. Cooldowns (per pair + per pawn) keep it lively but not spammy. Returns the same
   * state ref on a quiet tick (nobody in range / all on cooldown) so it never churns the snapshot.
   */
  processDialogTick(state: GameState): GameState {
    const turn = state.turn;
    const pairCd = DIALOG_PAIR_COOLDOWN_S * TICKS_PER_SECOND;
    const pawnCd = DIALOG_PAWN_COOLDOWN_S * TICKS_PER_SECOND;
    // Situational awareness: a fight nearby (a comrade trading blows, or an aggressive beast bearing in)
    // is no time for chatter — even for a bystander who isn't the one swinging. Gather the danger points
    // once, then keep any pawn within DIALOG_DANGER_RADIUS of one out of the dialog.
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
    // Activity awareness: a real conversation belongs to downtime — a pawn who is idle, or gathered at
    // a fire. Two pawns busily hauling (or just awake in the night) don't strike up a deep talk.
    const sociable = (p: Pawn) =>
      p.currentState === 'Idle' ||
      (!!p.position && nearGatheringPlace(state.buildings, p.position.x, p.position.y));
    const canTalk = (p: Pawn) =>
      p.isAlive !== false &&
      p.position &&
      p.currentState !== 'Sleeping' &&
      // No drawn-out exchanges while fighting or fleeing for your life — combat has its own barks.
      p.currentState !== 'Fighting' &&
      p.currentState !== 'Fleeing' &&
      !nearDanger(p) && // ...nor while a fight rages next to you
      sociable(p) && // ...nor mid-task at midday — save it for the lull / the fire
      turn - (_lastPawnDialog.get(p.id) ?? -Infinity) >= pawnCd;
    const talkers = state.pawns.filter(canTalk);
    if (talkers.length < 2) return state;
    // Shuffle so the same early-index pawn doesn't always initiate.
    for (let i = talkers.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [talkers[i], talkers[j]] = [talkers[j], talkers[i]];
    }

    let working: PawnRelationship[] | null = null;
    const busy = new Set<string>(); // pawns already chatting this tick
    // Drop conversations whose bubbles have faded so they stop reserving space.
    for (let i = _activeDialogs.length - 1; i >= 0; i--)
      if (_activeDialogs[i].until <= turn) _activeDialogs.splice(i, 1);
    const dialogHold = DIALOG_HOLD_S * TICKS_PER_SECOND;
    const spacedClear = (x: number, y: number) =>
      !_activeDialogs.some(
        (d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) < DIALOG_SPACING_RADIUS
      );

    for (const a of talkers) {
      if (busy.has(a.id)) continue;
      // Nearest eligible partner in range, off both cooldowns, not already chatting.
      let b: Pawn | undefined;
      for (const cand of talkers) {
        if (cand.id === a.id || busy.has(cand.id)) continue;
        if (dist(a, cand) > DIALOG_RANGE) continue;
        if (turn - (_lastPairDialog.get(relKey(a.id, cand.id)) ?? -Infinity) < pairCd) continue;
        b = cand;
        break;
      }
      if (!b) continue;
      // Keep clear of any conversation still on screen nearby — near pairs take turns.
      const cx = Math.round((a.position!.x + b.position!.x) / 2);
      const cy = Math.round((a.position!.y + b.position!.y) / 2);
      if (!spacedClear(cx, cy)) continue;
      if (rng.random() >= DIALOG_CHANCE) continue; // not every eligible pass sparks talk

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

  /** MOOD-REWORK: leave a faded mood thought on `p` from a dialog with `other`, resolving the named
   *  mood effect (mood.jsonc) — its label ({name} → the other talker) + value. No-op if unknown. */
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

  /** Assemble + resolve one dialog between `a` and `b`: move the relationship (logged), advance
   *  romance on a flirt, float each line over its speaker, and drop one expandable chronicle entry. */
  private runDialogBetween(
    state: GameState,
    working: PawnRelationship[],
    a: Pawn,
    b: Pawn,
    turn: number
  ): void {
    const rel = this.ensureRel(working, a, b, state);
    const grieving = activeMoodModifiers(b, turn).some((m) => m.id.startsWith('grief:'));
    // Battle context: both are drafted for a fight — the talk turns to the coming clash.
    const battleContext = a.drafted === true && b.drafted === true;
    // Fireside: at a gathering place the talk runs warmer + deeper, and they reminisce more.
    const atGathering =
      (!!a.position && nearGatheringPlace(state.buildings, a.position.x, a.position.y)) ||
      (!!b.position && nearGatheringPlace(state.buildings, b.position.x, b.position.y));
    // PAWN-MEMORY: outside a fight, and if they don't loathe each other, the initiator may bring up
    // something witnessed — a kill, a death, a masterwork, a botch, a loafer (on the spot or later).
    // Reminiscing runs higher by the fire (the evening's when the old stories come out).
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
      // Store the assembled exchange so the Relations tab can show WHAT was said (nested breakdown).
      lines: outcome.lines.map((l) => ({ name: l.name, text: l.text }))
    });
    // Remember the thread so their NEXT dialog can carry it on (callback opener) instead of cold.
    rel.lastTalk = {
      subject: outcome.subject,
      category: outcome.category,
      positive: outcome.positive,
      turn
    };
    // MOOD-REWORK: the exchange leaves a faded mood thought on each talker (a warm word lifts, cross
    // words sting). Keyed per-partner so it refreshes rather than stacking without bound.
    if (outcome.moodEffect) {
      this.applyDialogMood(a, b, outcome.moodEffect, turn);
      this.applyDialogMood(b, a, outcome.moodEffect, turn);
    }
    if (outcome.category === 'flirt') {
      this.afterFlirt(state, working, a, b, rel, outcome.positive, turn);
    }
    // Floaters: each speaker's line over their head (speech-bubble kind, long dwell).
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
    // One expandable chronicle entry per dialog.
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

  // ── §4 romance internals ────────────────────────────────────────────────────────────────────

  /** Chance a pair's age gap allows attraction: 1 up to FREE years, linear to 0 at FREE+SPAN. */
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
    // Opposite-sex attraction: both must have a sex and differ (sexless entities never flirt).
    if (!a.sex || !b.sex || a.sex === b.sex) return false;
    // A wide age gap rarely sparks (falls off past ROMANCE_AGE_GAP_FREE years).
    if (!this.ageGapPlausible(a, b)) return false;
    if (rel.kin) return false;
    if (rel.romance?.stage === 'ex') return false;
    if (rel.score < FLIRT_MIN_SCORE) return false; // must actually be close first, not near-strangers
    // mutual attraction: each finds the other easy to look at
    if (beautyA < ATTRACTION_MIN_BEAUTY) return false;
    if (beautyB < ATTRACTION_MIN_BEAUTY) return false;
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
          this.applyDelta(jRel, -10, {
            turn,
            label: `${firstName(p)} has a wandering eye`,
            kind: 'romance'
          });
        }
        this.applyDelta(this.ensureRel(working, p, other, state), 0); // ensure row exists for the affair
      }
    }
  }

  /** Compact "what they talked about" line for the relationship history log. */
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
