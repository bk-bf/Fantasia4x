import type { EventMemory, Pawn, PawnRelationship, RelationStage, Season } from '../../core/types';
import { effectiveMood } from '../../core/rules/social/social';
import { rng } from '../../core/util/rng';
import { TICKS_PER_SECOND } from '../../core/util/time';
import { TURNS_PER_DAY } from '../EnvironmentService';
import dialogData from '../../database/social/dialog.jsonc';
import memoriesData from '../../database/pawns/memories.jsonc';

const CALLBACK_MAX_TICKS = 6 * TURNS_PER_DAY * TICKS_PER_SECOND;
const CALLBACK_CHANCE = 0.45;
const CHAIN_CHANCE = 0.3;

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
  delta: number;
  moodEffect: string | null;
  lines: ConversationLine[];
  resultText: string;
  subject: string;
}

interface Beat {
  id: string;
  open: string;
  good?: { reply: string; close: string };
  bad: { reply: string; close: string };
  next?: { good?: string[] };
}

interface CategoryBank {
  goodDelta: number;
  badDelta: number;
  goodChance: number;
  moodGood?: string | null;
  moodBad?: string | null;
  beats: Beat[];
  callbacks?: string[];
}

const DATA = dialogData as unknown as {
  subjects: string[];
  categories: Record<ConversationCategory, CategoryBank>;
  combatBarks: Record<string, string[]>;
};

export type CombatBarkKind = 'hit' | 'miss' | 'hurt' | 'kill';

export function combatBark(kind: CombatBarkKind, foeName?: string, roll = 0): string {
  const pool = DATA.combatBarks?.[kind] ?? [];
  if (pool.length === 0) return '';
  const line = pool[Math.floor((roll - Math.floor(roll)) * pool.length)] ?? pool[0];
  return line.replace(/\{foe\}/g, foeName ?? 'it');
}

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

export function chooseCategory(
  rel: PawnRelationship,
  opts: {
    flirtEligible: boolean;
    targetGrieving: boolean;
    battleContext: boolean;
    atGathering?: boolean;
  }
): ConversationCategory {
  const stage: RelationStage = rel.stage;
  if (opts.battleContext && stage !== 'enemies') return 'battle_talk';
  if (opts.targetGrieving && rel.score >= 15 && rng.random() < 0.6) return 'comfort';
  if (opts.flirtEligible && rng.random() < 0.35) return 'flirt';
  if (stage === 'enemies') return rng.random() < 0.6 ? 'insult' : 'argue';
  if (stage === 'rivals') {
    const r = rng.random();
    return r < 0.55 ? 'argue' : r < 0.8 ? 'insult' : 'small_talk';
  }
  const fire = opts.atGathering === true;
  if (stage === 'friends' || stage === 'best_friends') {
    const r = rng.random();
    if (fire) return r < 0.4 ? 'banter' : 'deep_talk';
    return r < 0.45 ? 'banter' : r < 0.75 ? 'deep_talk' : 'small_talk';
  }
  const r = rng.random();
  if (fire) return r < 0.45 ? 'small_talk' : r < 0.8 ? 'banter' : 'deep_talk';
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

function resolveBeatRef(ref: string): { category: ConversationCategory; beat: Beat } | null {
  const [catStr, beatId] = ref.split(':');
  const category = catStr as ConversationCategory;
  const bank = DATA.categories[category];
  if (!bank?.beats?.length) return null;
  const beat = beatId ? bank.beats.find((x) => x.id === beatId) : rng.pick(bank.beats);
  return beat ? { category, beat } : null;
}

export function runConversation(
  a: Pawn,
  b: Pawn,
  rel: PawnRelationship,
  ctx: { turn: number; weatherType?: string; season?: Season },
  opts: {
    flirtEligible: boolean;
    targetGrieving: boolean;
    battleContext: boolean;
    atGathering?: boolean;
    recall?: { memory: EventMemory; ago: string };
  }
): ConversationOutcome {
  if (opts.recall) return recallConversation(a, b, rel, ctx, opts.recall);

  const category = chooseCategory(rel, opts);
  const bank = DATA.categories[category];
  const positive = rng.random() < computePGood(a, b, rel, bank.goodChance, ctx.turn);

  const weatherWord = WEATHER_WORD[ctx.weatherType ?? ''] ?? 'sky';

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
    {
      pawnId: a.id,
      name: firstName(a),
      text: fill(openerRaw, b, subject, weatherWord, ctx.season)
    },
    {
      pawnId: b.id,
      name: firstName(b),
      text: fill(branch.reply, a, subject, weatherWord, ctx.season)
    }
  ];

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
    moodEffect: (positive ? bank.moodGood : bank.moodBad) ?? null,
    lines,
    resultText: positive ? RESULT_GOOD[category] : RESULT_BAD[category],
    subject
  };
}

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
  const f = (tpl: string, other: Pawn) =>
    fill(tpl, other, who, weatherWord, ctx.season, detail, ago);
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
    moodEffect: (positive ? catBank.moodGood : catBank.moodBad) ?? null,
    lines,
    resultText: positive ? RESULT_GOOD[category] : RESULT_BAD[category],
    subject: detail ? `${who} and ${detail}` : who
  };
}
