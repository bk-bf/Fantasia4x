// Dialog assembly + outcome rolls (SOCIAL-LAYER §3). Reads the flavor-line banks + per-category
// relationship effects in database/dialog.jsonc and turns a pawn pair + their relationship into a
// short assembled exchange (opener → reply → closer), a positive/negative outcome, and the score
// delta to apply. The orchestration (who talks to whom, proximity, cooldowns, logging) lives in
// SocialService.processDialogTick.

import type { EventMemory, Pawn, PawnRelationship, RelationStage, Season } from '../../core/types';
import { effectiveMood } from '../../core/Social';
import { rng } from '../../core/rng';
import { TICKS_PER_SECOND } from '../../core/time';
import { TURNS_PER_DAY } from '../EnvironmentService';
import dialogData from '../../database/dialog.jsonc';
import memoriesData from '../../database/memories.jsonc';

// A callback opener only carries the thread on if the pair spoke RECENTLY — beyond this the thread
// has gone cold and a fresh exchange fits better.
const CALLBACK_MAX_TICKS = 6 * TURNS_PER_DAY * TICKS_PER_SECOND;
const CALLBACK_CHANCE = 0.45; // chance a recent thread is picked up rather than starting cold
const CHAIN_CHANCE = 0.3; // chance a warm exchange flows into a follow-on beat (the `next` graph)

export type ConversationCategory =
  | 'small_talk'
  | 'banter'
  | 'deep_talk'
  | 'flirt'
  | 'comfort'
  | 'argue'
  | 'insult'
  | 'battle_talk';

export interface ConversationLine {
  pawnId: string;
  name: string;
  text: string;
}

export interface ConversationOutcome {
  category: ConversationCategory;
  positive: boolean;
  /** Score delta for the pair (signed). */
  delta: number;
  /** MOOD-REWORK — the mood "thought" this exchange leaves on BOTH participants (a warm chat lifts,
   *  an insult/rebuffed advance stings). Authored per category in dialog.jsonc (`moodGood`/`moodBad`);
   *  0 when the category has no mood bearing. SocialService applies it as a faded thought. */
  moodDelta: number;
  lines: ConversationLine[];
  /** Chronicle `result` phrase ("warmed to each other" / "it turned into an argument"). */
  resultText: string;
  /** What they talked about (the filled subject phrase) — surfaced in the relationship breakdown. */
  subject: string;
}

/** One coherent little exchange: an opener (A) with matched good/bad { reply (B), close (A) }, so the
 *  three lines always fit together. `next` optionally links a warm exchange into a follow-on beat. */
interface Beat {
  id: string;
  open: string;
  /** Present on every conversational beat; absent for argue/insult (which never resolve positive). */
  good?: { reply: string; close: string };
  bad: { reply: string; close: string };
  /** Refs a warm exchange may flow into: "category" (random beat) or "category:beatId". */
  next?: { good?: string[] };
}

interface CategoryBank {
  /** Relationship effect (authored in dialog.jsonc). */
  goodDelta: number;
  badDelta: number;
  goodChance: number;
  /** MOOD-REWORK — the mood thought a warm / soured exchange leaves on each participant. */
  moodGood?: number;
  moodBad?: number;
  beats: Beat[];
  /** Opener lines used when the pair spoke recently — they reference `{subject}` to carry the thread. */
  callbacks?: string[];
}

const DATA = dialogData as unknown as {
  subjects: string[];
  categories: Record<ConversationCategory, CategoryBank>;
};

/** PAWN-MEMORY — recall line banks, keyed by MemoryKind (memories.jsonc). `category` says which base
 *  category's deltas/tone the recall borrows (banter for a botch, deep_talk for a death…). Lines fill
 *  `{subject}` (who it's about), `{detail}` (the item/foe/affliction), `{ago}` (how long ago), `{name}`
 *  (the listener). */
interface MemoryBank {
  category: ConversationCategory;
  lines: { openers: string[]; replies_good: string[]; replies_bad: string[]; closers: string[] };
}
const MEMORIES = memoriesData as unknown as { kinds: Record<string, MemoryBank> };

const RESULT_GOOD: Record<ConversationCategory, string> = {
  small_talk: 'passed the time together',
  banter: 'traded jokes and warmed to each other',
  deep_talk: 'shared something true',
  comfort: 'found a little comfort',
  flirt: 'sparks kindled between them',
  battle_talk: 'steeled each other for the fight',
  argue: '',
  insult: ''
};

const RESULT_BAD: Record<ConversationCategory, string> = {
  small_talk: 'it fell flat and soured',
  banter: 'the joke landed wrong',
  deep_talk: 'it cut too close and turned into an argument',
  comfort: 'the comfort was not wanted',
  flirt: 'the advance was rebuffed',
  battle_talk: 'the nerves frayed between them',
  argue: 'it turned into a shouting match',
  insult: 'cruel words were said'
};

// Spoken word for a weather type (fallback keeps unknown data-driven weather safe).
const WEATHER_WORD: Record<string, string> = {
  clear: 'clear sky',
  rain: 'rain',
  heavy_rain: 'downpour',
  storm: 'storm',
  snow: 'snowfall',
  blizzard: 'blizzard',
  heat_wave: 'heat',
  fog: 'fog'
};

function hasTrait(p: Pawn, id: string): boolean {
  return p.traits?.some((t) => t.id === id) ?? false;
}

function firstName(p: Pawn): string {
  return p.name.split(' ')[0];
}

/**
 * Pick what the pair would talk about, from stage + circumstance. `flirtEligible` and
 * `targetGrieving` are decided by the caller (SocialService owns the gates).
 */
export function chooseCategory(
  rel: PawnRelationship,
  opts: { flirtEligible: boolean; targetGrieving: boolean; battleContext: boolean }
): ConversationCategory {
  const stage: RelationStage = rel.stage;
  // Under arms, the talk turns to the fight (unless they actively loathe each other).
  if (opts.battleContext && stage !== 'enemies') return 'battle_talk';
  if (opts.targetGrieving && rel.score >= 15 && rng.random() < 0.6) return 'comfort';
  if (opts.flirtEligible && rng.random() < 0.35) return 'flirt';
  if (stage === 'enemies') return rng.random() < 0.6 ? 'insult' : 'argue';
  if (stage === 'rivals') {
    const r = rng.random();
    return r < 0.55 ? 'argue' : r < 0.8 ? 'insult' : 'small_talk';
  }
  if (stage === 'friends' || stage === 'best_friends') {
    const r = rng.random();
    return r < 0.45 ? 'banter' : r < 0.75 ? 'deep_talk' : 'small_talk';
  }
  // strangers / acquaintances
  const r = rng.random();
  return r < 0.65 ? 'small_talk' : r < 0.85 ? 'banter' : 'deep_talk';
}

function fill(
  template: string,
  other: Pawn,
  subject: string,
  weatherWord: string,
  season: Season | undefined,
  detail = '',
  ago = ''
): string {
  return template
    .replace(/\{name\}/g, firstName(other))
    .replace(/\{subject\}/g, subject)
    .replace(/\{detail\}/g, detail)
    .replace(/\{ago\}/g, ago)
    .replace(/\{weather\}/g, weatherWord)
    .replace(/\{season\}/g, season ?? 'autumn');
}

/** Outcome roll: the data-authored base chance, tilted by charm, temperament, mood, and closeness. */
function computePGood(
  a: Pawn,
  b: Pawn,
  rel: PawnRelationship,
  goodChance: number,
  turn: number
): number {
  let pGood = goodChance;
  if (pGood <= 0) return 0;
  pGood += ((a.stats?.charisma ?? 10) - 10) * 0.01;
  for (const p of [a, b]) {
    if (hasTrait(p, 'gregarious')) pGood += 0.08;
    if (hasTrait(p, 'ill-tempered')) pGood -= 0.1;
    if (hasTrait(p, 'hot-headed')) pGood -= 0.05;
    if (hasTrait(p, 'loner')) pGood -= 0.05;
    if (effectiveMood(p, turn) < 30) pGood -= 0.1;
  }
  if (rel.stage === 'friends' || rel.stage === 'best_friends') pGood += 0.1;
  return Math.max(0.05, Math.min(0.95, pGood));
}

/** Resolve a `next` ref — "category" (random beat) or "category:beatId" — to a concrete beat. */
function resolveBeatRef(ref: string): { category: ConversationCategory; beat: Beat } | null {
  const [catStr, beatId] = ref.split(':');
  const category = catStr as ConversationCategory;
  const bank = DATA.categories[category];
  if (!bank?.beats?.length) return null;
  const beat = beatId ? bank.beats.find((x) => x.id === beatId) : rng.pick(bank.beats);
  return beat ? { category, beat } : null;
}

/**
 * Assemble and resolve one conversation between initiator `a` and partner `b`. Pure over the
 * shared seeded rng; applies NO state — the caller applies `delta` and logs.
 */
export function runConversation(
  a: Pawn,
  b: Pawn,
  rel: PawnRelationship,
  ctx: { turn: number; weatherType?: string; season?: Season },
  opts: {
    flirtEligible: boolean;
    targetGrieving: boolean;
    battleContext: boolean;
    /** PAWN-MEMORY: a witnessed event `a` recalls, built into the exchange instead of a generic beat. */
    recall?: { memory: EventMemory; ago: string };
  }
): ConversationOutcome {
  // PAWN-MEMORY recall: reminisce about a remembered event instead of drawing a generic beat.
  if (opts.recall) return recallConversation(a, b, rel, ctx, opts.recall);

  const category = chooseCategory(rel, opts);
  const bank = DATA.categories[category];
  const positive = rng.random() < computePGood(a, b, rel, bank.goodChance, ctx.turn);

  // Assemble from ONE beat so opener → reply → closer fit together (speakers A → B → A).
  const weatherWord = WEATHER_WORD[ctx.weatherType ?? ''] ?? 'sky';

  // Memory: if the pair spoke recently, pick the thread back up — a callback opener that references
  // the SAME subject — rather than starting a fresh, unrelated exchange.
  const mem = rel.lastTalk;
  const carryOn =
    !!mem &&
    !!bank.callbacks?.length &&
    ctx.turn - mem.turn <= CALLBACK_MAX_TICKS &&
    rng.random() < CALLBACK_CHANCE;
  const subject = carryOn
    ? mem!.subject
    : fill(rng.pick(DATA.subjects), b, '', weatherWord, ctx.season);

  const beat = rng.pick(bank.beats);
  const branch = (positive && beat.good) || beat.bad;
  const openerRaw = carryOn ? rng.pick(bank.callbacks!) : beat.open;

  const lines: ConversationLine[] = [
    { pawnId: a.id, name: firstName(a), text: fill(openerRaw, b, subject, weatherWord, ctx.season) },
    { pawnId: b.id, name: firstName(b), text: fill(branch.reply, a, subject, weatherWord, ctx.season) }
  ];

  // Graph: a warm exchange can flow into a follow-on beat (a deeper turn) before the closer.
  if (positive && beat.next?.good?.length && rng.random() < CHAIN_CHANCE) {
    const nxt = resolveBeatRef(rng.pick(beat.next.good));
    if (nxt?.beat.good) {
      lines.push({
        pawnId: a.id,
        name: firstName(a),
        text: fill(nxt.beat.open, b, subject, weatherWord, ctx.season)
      });
      lines.push({
        pawnId: b.id,
        name: firstName(b),
        text: fill(nxt.beat.good.reply, a, subject, weatherWord, ctx.season)
      });
    }
  }

  lines.push({
    pawnId: a.id,
    name: firstName(a),
    text: fill(branch.close, b, subject, weatherWord, ctx.season)
  });

  return {
    category,
    positive,
    delta: positive ? bank.goodDelta : bank.badDelta,
    moodDelta: positive ? (bank.moodGood ?? 0) : (bank.moodBad ?? 0),
    lines,
    resultText: positive ? RESULT_GOOD[category] : RESULT_BAD[category],
    subject
  };
}

/**
 * PAWN-MEMORY — assemble an exchange that RECALLS a witnessed event: `a` brings up the memory (naming
 * its subject, the item/foe, and how long ago), `b` reacts, `a` closes. Borrows the tone + deltas of
 * the memory kind's mapped category (banter for a botch, deep_talk for a death). Pure; the caller logs.
 */
function recallConversation(
  a: Pawn,
  b: Pawn,
  rel: PawnRelationship,
  ctx: { turn: number; weatherType?: string; season?: Season },
  recall: { memory: EventMemory; ago: string }
): ConversationOutcome {
  const { memory, ago } = recall;
  const memBank = MEMORIES.kinds[memory.kind];
  const category = memBank.category;
  const catBank = DATA.categories[category];
  const positive = rng.random() < computePGood(a, b, rel, catBank.goodChance, ctx.turn);

  const weatherWord = WEATHER_WORD[ctx.weatherType ?? ''] ?? 'sky';
  const who = memory.subjectName ?? 'someone';
  const detail = memory.detail ?? '';
  const f = (tpl: string, other: Pawn) => fill(tpl, other, who, weatherWord, ctx.season, detail, ago);
  const L = memBank.lines;
  const replyPool = positive ? L.replies_good : L.replies_bad;

  const lines: ConversationLine[] = [
    { pawnId: a.id, name: firstName(a), text: f(rng.pick(L.openers), b) },
    { pawnId: b.id, name: firstName(b), text: f(rng.pick(replyPool), a) },
    { pawnId: a.id, name: firstName(a), text: f(rng.pick(L.closers), b) }
  ];

  return {
    category,
    positive,
    delta: positive ? catBank.goodDelta : catBank.badDelta,
    moodDelta: positive ? (catBank.moodGood ?? 0) : (catBank.moodBad ?? 0),
    lines,
    resultText: positive ? RESULT_GOOD[category] : RESULT_BAD[category],
    subject: detail ? `${who} and ${detail}` : who
  };
}
