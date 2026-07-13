// Pawn-to-pawn social types (SOCIAL-LAYER). A `PawnRelationship` row exists for every colonist
// pair that has MET (seeing each other is meeting — `SocialService.meetColony` at colony gen /
// migrant join / the daily sight pass), culture-seeded at Strangers-or-so; interaction moves it.
// The platonic `score`/`stage` ladder and the romance track are separate axes: a pair can
// be Friends AND partners, or ex-partners who slid to Rivals. Mood depth rides `MoodModifier`
// entries on the pawn — event moods (grief, a hot meal, a breakup) layered over the ambient
// per-tick mood drift, so the player can read WHY a pawn feels the way it does.

/** Platonic relationship rungs, derived from `score` with hysteresis (SocialService). */
export type RelationStage =
  | 'enemies'
  | 'rivals'
  | 'strangers'
  | 'acquaintances'
  | 'friends'
  | 'best_friends';

/** Story markers stamped by big shared events; shown as badges on the Relations tab. */
export type RelationTag = 'grief_bond' | 'battle_forged' | 'mentor' | 'rescued_by';

/** Romance rungs. `ex` keeps the history visible after a breakup. */
export type RomanceStage = 'interested' | 'courting' | 'partners' | 'ex';

export interface RomanceState {
  stage: RomanceStage;
  /** Turn the current stage began. */
  since: number;
}

/** Blood-tie kinds. Colony ties are `parent`/`child`/`sibling` (starting-kin pass); the wider web
 *  (grandparent…cousin) is generated for OFF-COLONY kin who live out in the world. */
export type KinKind =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'grandparent'
  | 'grandchild'
  | 'auntuncle'
  | 'nibling' // niece / nephew
  | 'cousin';

/** What produced a relationship-log entry — drives the breakdown's icon/colour. */
export type RelationEventKind =
  | 'seed' // the cultural/kin first-impression baseline
  | 'talk' // a conversation (label carries the subject)
  | 'time' // ambient day-to-day drift (proximity, temperament) — coalesced into a rolling total
  | 'rescue'
  | 'tend'
  | 'battle' // fought side by side / witnessed a death together
  | 'grief'
  | 'strife' // friendly fire, festering resentment
  | 'romance'; // courtship milestones, breakups, jealousy

/** One line of a relationship's history — a dated, signed point change with a human label. Kept
 *  bounded per pair (`REL_LOG_CAP`); the ambient `time` drift is coalesced into a rolling total
 *  rather than one entry per day. */
export interface RelationshipEvent {
  turn: number;
  /** Signed points this event moved the score (rounded to 0.1). */
  delta: number;
  label: string;
  kind: RelationEventKind;
  /** For `talk` events: the assembled dialogue exchange (speaker + line), so the Relations tab can
   *  show WHAT was actually said, nested under the entry. Absent for non-dialog events. */
  lines?: { name: string; text: string }[];
}

/** One blood tie on a pawn: `kind` is what the OTHER pawn is to this one
 *  (`{ pawnId: X, kind: 'parent' }` on P means X is P's parent). `pawnId` may reference a colony
 *  pawn, a `DeadPawnRecord`, or an off-colony person in `GameState.worldPawns`. */
export interface KinTie {
  pawnId: string;
  kind: KinKind;
  /** The bond's starting warmth — the kin CONTRIBUTION to the relationship seed. Rolled per family
   *  tie (biased warm, but a hated brother is possible). Absent ⇒ the flat legacy kin bonus. */
  warmth?: number;
}

/**
 * A pawn pair's standing (sparse, canonical key = sorted ids). The platonic `score` moves from
 * small procedural deltas (the daily social pass) and large event-driven ones (rescue, friendly
 * fire); `stage` follows with hysteresis so a boundary pair doesn't flicker.
 */
export interface PawnRelationship {
  /** Sorted so pawnA < pawnB — the canonical pair key. */
  pawnA: string;
  pawnB: string;
  /** −100 (enemies) → +100 (best friends), platonic axis. */
  score: number;
  stage: RelationStage;
  /** Romance track layered over the platonic stage; absent for most pairs. */
  romance?: RomanceState;
  /** Blood tie, if any — what pawnA is to pawnB (stamped from the pawns' kin at creation). */
  kin?: KinKind;
  tags: RelationTag[];
  /** Running tally of all deltas ever applied — the lived-history weight behind the score. */
  points: { history: number };
  /** Successful flirt count — the courtship gate (romance needs a few before advancing). */
  flirts?: number;
  /** The last dialog this pair had — lets the NEXT one carry on the thread (a callback opener that
   *  references the same subject) instead of a fresh, unrelated exchange. Slim on purpose (it ships
   *  with the relationships array); `category` is the ConversationCategory string. */
  lastTalk?: { subject: string; category: string; positive: boolean; turn: number };
  /** Recent history — what happened between them and the points each moment gave, newest last.
   *  Bounded (`REL_LOG_CAP`); surfaced as the toggleable breakdown on the Relations tab. */
  log?: RelationshipEvent[];
}

/**
 * One readable mood source (SOCIAL-LAYER §7 / MOOD-REWORK). A signed point contribution to the mood
 * TARGET the pawn eases toward (PawnService.computeMoodTarget); NOT added at read time. `expiresAt` is
 * an absolute tick; an expiring thought FADES linearly to 0 over [`startedAt`, `expiresAt`]. 0 = a
 * standing band (full value, re-evaluated each daily social pass; never fades). REPLACE the pawn's
 * array on change, never push in place — the snapshot cold-field diff ships it by ref.
 */
export interface MoodModifier {
  id: string;
  label: string;
  value: number;
  expiresAt: number;
  /** MOOD-REWORK — the tick the thought landed. An expiring thought's contribution FADES linearly
   *  from `value` (at `startedAt`) to 0 (at `expiresAt`), so a memory lifts over time rather than
   *  snapping off. Absent ⇒ full value until it expires (standing bands, `expiresAt: 0`, never fade). */
  startedAt?: number;
}

/** A mental break (SOCIAL-LAYER §7): the pawn refuses work until the given tick. `crisis` is the
 *  deeper rung, reached after sustained rock-bottom mood. */
export interface SocialBreak {
  kind: 'break' | 'crisis';
  until: number;
}

// ── PAWN-MEMORY (dialog recall) ─────────────────────────────────────────────────────────────────
// A pawn records the notable things it witnesses (a comrade's death, a fight, a masterwork, a botched
// job, a loafer) and later RECALLS them in dialog — on the spot, at the campfire later, or both. The
// store is worker-only (stripped by ENTITY_DROP; never ships to the renderer) and bounded per pawn.

/** What kind of event a memory is — drives its base memorability and which dialog category recalls it. */
export type MemoryKind =
  | 'combat' // witnessed a kill in a fight
  | 'death' // witnessed a colonist die
  | 'masterwork' // saw someone finish an exceptional item
  | 'botch' // saw someone turn out shoddy work ("fucked up")
  | 'idled'; // saw someone loafing for days

/**
 * One thing a pawn witnessed and can bring up later. `memorability` (0–1) sets how long it stays
 * recallable (trivial fades in days, `historic` never) and how strongly it's weighted; `told` counts
 * how often it's been retold so the same story wears out. `subjectName`/`detail` are cached at record
 * time (the subject may be dead or gone) so the dialog line can name them without a lookup.
 */
export interface EventMemory {
  kind: MemoryKind;
  /** Tick it happened (recency + expiry are measured from here). */
  turn: number;
  /** The pawn/entity the memory is ABOUT (who died, who fumbled, who fought). */
  subjectId?: string;
  subjectName?: string;
  /** 0–1: retention window + recall weight. ≥0.9 = historic (never pruned). */
  memorability: number;
  /** Extra colour for the line — the item made, the foe fought. */
  detail?: string;
  /** Times recalled in dialog; each retelling lowers the weight so it isn't repeated to death. */
  told?: number;
}
