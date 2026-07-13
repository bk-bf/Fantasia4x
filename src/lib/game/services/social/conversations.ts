// Conversation assembly + outcome rolls (SOCIAL-LAYER §3). Reads the fragment banks in
// database/conversations.jsonc and turns a pawn pair + their relationship into a short assembled
// exchange (opener → reply → closer), a positive/negative outcome, and the score delta to apply.
// The daily orchestration (who talks to whom, caps, logging) lives in SocialService.

import type { Pawn, PawnRelationship, RelationStage, Season } from '../../core/types';
import { effectiveMood } from '../../core/Social';
import { rng } from '../../core/rng';
import conversationData from '../../database/conversations.jsonc';

export type ConversationCategory =
  | 'small_talk'
  | 'banter'
  | 'deep_talk'
  | 'flirt'
  | 'comfort'
  | 'argue'
  | 'insult';

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
  lines: ConversationLine[];
  /** Chronicle `result` phrase ("warmed to each other" / "it turned into an argument"). */
  resultText: string;
}

interface CategoryBank {
  openers: string[];
  replies_good?: string[];
  replies_bad: string[];
  closers_good?: string[];
  closers_bad: string[];
}

const DATA = conversationData as unknown as {
  subjects: string[];
  categories: Record<ConversationCategory, CategoryBank>;
};

// Score delta per category by outcome (spec §1: positive +1…+6, negative −2…−8).
const DELTA: Record<ConversationCategory, { good: number; bad: number }> = {
  small_talk: { good: 1, bad: -2 },
  banter: { good: 2, bad: -3 },
  deep_talk: { good: 4, bad: -4 },
  comfort: { good: 5, bad: -2 },
  flirt: { good: 3, bad: -3 },
  argue: { good: 0, bad: -5 },
  insult: { good: 0, bad: -7 }
};

// Base chance the exchange lands well (argue/insult never do).
const BASE_GOOD: Record<ConversationCategory, number> = {
  small_talk: 0.75,
  banter: 0.7,
  deep_talk: 0.6,
  comfort: 0.7,
  flirt: 0.55,
  argue: 0,
  insult: 0
};

const RESULT_GOOD: Record<ConversationCategory, string> = {
  small_talk: 'passed the time together',
  banter: 'traded jokes and warmed to each other',
  deep_talk: 'shared something true',
  comfort: 'found a little comfort',
  flirt: 'sparks kindled between them',
  argue: '',
  insult: ''
};

const RESULT_BAD: Record<ConversationCategory, string> = {
  small_talk: 'it fell flat and soured',
  banter: 'the joke landed wrong',
  deep_talk: 'it cut too close and turned into an argument',
  comfort: 'the comfort was not wanted',
  flirt: 'the advance was rebuffed',
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
  opts: { flirtEligible: boolean; targetGrieving: boolean }
): ConversationCategory {
  const stage: RelationStage = rel.stage;
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
  season: Season | undefined
): string {
  return template
    .replace(/\{name\}/g, firstName(other))
    .replace(/\{subject\}/g, subject)
    .replace(/\{weather\}/g, weatherWord)
    .replace(/\{season\}/g, season ?? 'autumn');
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
  opts: { flirtEligible: boolean; targetGrieving: boolean }
): ConversationOutcome {
  const category = chooseCategory(rel, opts);
  const bank = DATA.categories[category];

  // Outcome roll: charm and temperament tilt it.
  let pGood = BASE_GOOD[category];
  if (pGood > 0) {
    pGood += ((a.stats?.charisma ?? 10) - 10) * 0.01;
    for (const p of [a, b]) {
      if (hasTrait(p, 'gregarious')) pGood += 0.08;
      if (hasTrait(p, 'ill-tempered')) pGood -= 0.1;
      if (hasTrait(p, 'hot-headed')) pGood -= 0.05;
      if (hasTrait(p, 'loner')) pGood -= 0.05;
      if (effectiveMood(p, ctx.turn) < 30) pGood -= 0.1;
    }
    if (rel.stage === 'friends' || rel.stage === 'best_friends') pGood += 0.1;
    pGood = Math.max(0.05, Math.min(0.95, pGood));
  }
  const positive = rng.random() < pGood;

  // Assemble: opener (A) → reply (B) → closer (A). {name} resolves to the OTHER speaker.
  const subjectRaw = rng.pick(DATA.subjects);
  const weatherWord = WEATHER_WORD[ctx.weatherType ?? ''] ?? 'sky';
  const subject = fill(subjectRaw, b, '', weatherWord, ctx.season);
  const opener = fill(rng.pick(bank.openers), b, subject, weatherWord, ctx.season);
  const replyPool = (positive && bank.replies_good) || bank.replies_bad;
  const reply = fill(rng.pick(replyPool), a, subject, weatherWord, ctx.season);
  const closerPool = (positive && bank.closers_good) || bank.closers_bad;
  const closer = fill(rng.pick(closerPool), b, subject, weatherWord, ctx.season);

  const lines: ConversationLine[] = [
    { pawnId: a.id, name: firstName(a), text: opener },
    { pawnId: b.id, name: firstName(b), text: reply },
    { pawnId: a.id, name: firstName(a), text: closer }
  ];

  return {
    category,
    positive,
    delta: positive ? DELTA[category].good : DELTA[category].bad,
    lines,
    resultText: positive ? RESULT_GOOD[category] : RESULT_BAD[category]
  };
}
