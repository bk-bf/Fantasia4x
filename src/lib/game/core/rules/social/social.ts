import type {
  CultureRelation,
  KinKind,
  MoodModifier,
  Pawn,
  PawnRelationship,
  RelationStage
} from '../../types';

export const STAGE_ORDER: RelationStage[] = [
  'enemies',
  'rivals',
  'strangers',
  'acquaintances',
  'friends',
  'best_friends'
];

export const STAGE_LABEL: Record<RelationStage, string> = {
  enemies: 'Enemies',
  rivals: 'Rivals',
  strangers: 'Strangers',
  acquaintances: 'Acquaintances',
  friends: 'Friends',
  best_friends: 'Best Friends'
};

const STAGE_LOWER = [-Infinity, -60, -20, 15, 45, 75];
const HYSTERESIS = 3;

export function rawStageForScore(score: number): RelationStage {
  for (let i = STAGE_LOWER.length - 1; i >= 0; i--) {
    if (score >= STAGE_LOWER[i]) return STAGE_ORDER[i];
  }
  return 'enemies';
}

export function stageForScore(score: number, prev?: RelationStage): RelationStage {
  if (!prev) return rawStageForScore(score);
  let idx = STAGE_ORDER.indexOf(prev);
  if (idx < 0) return rawStageForScore(score);
  while (idx < STAGE_ORDER.length - 1 && score >= STAGE_LOWER[idx + 1] + HYSTERESIS) idx++;
  while (idx > 0 && score < STAGE_LOWER[idx] - HYSTERESIS) idx--;
  return STAGE_ORDER[idx];
}

const DISPOSITION_SEED: Record<CultureRelation['disposition'], number> = {
  hostile: -40,
  wary: -15,
  neutral: 0,
  friendly: 15,
  allied: 30
};

const SAME_CULTURE_SEED = 15;
export const KIN_SEED_BONUS = 50;

export function seedScore(a: Pawn, b: Pawn, cultureRelations: CultureRelation[]): number {
  const ca = a.cultureId;
  const cb = b.cultureId;
  let seed = 0;
  if (ca && cb) {
    if (ca === cb) {
      seed = SAME_CULTURE_SEED;
    } else {
      const rel = cultureRelations.find(
        (r) => (r.a === ca && r.b === cb) || (r.a === cb && r.b === ca)
      );
      if (rel) seed = DISPOSITION_SEED[rel.disposition] ?? 0;
    }
  }
  const tie = a.kin?.find((k) => k.pawnId === b.id);
  if (tie) seed += tie.warmth ?? KIN_SEED_BONUS;
  return seed;
}

export const KIN_INVERSE: Record<KinKind, KinKind> = {
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  auntuncle: 'nibling',
  nibling: 'auntuncle',
  cousin: 'cousin'
};

export const KIN_LABEL: Record<KinKind, string> = {
  parent: 'Parent',
  child: 'Child',
  sibling: 'Sibling',
  grandparent: 'Grandparent',
  grandchild: 'Grandchild',
  auntuncle: 'Aunt/Uncle',
  nibling: 'Niece/Nephew',
  cousin: 'Cousin'
};

const KIN_LABEL_SEXED: Record<KinKind, [string, string]> = {
  parent: ['Father', 'Mother'],
  child: ['Son', 'Daughter'],
  sibling: ['Brother', 'Sister'],
  grandparent: ['Grandfather', 'Grandmother'],
  grandchild: ['Grandson', 'Granddaughter'],
  auntuncle: ['Uncle', 'Aunt'],
  nibling: ['Nephew', 'Niece'],
  cousin: ['Cousin', 'Cousin']
};

export function kinLabel(kind: KinKind, sex?: 'male' | 'female'): string {
  if (sex === 'male') return KIN_LABEL_SEXED[kind][0];
  if (sex === 'female') return KIN_LABEL_SEXED[kind][1];
  return KIN_LABEL[kind];
}

export function kinRelationPhrase(kind: KinKind, ofName: string, sex?: 'male' | 'female'): string {
  return `${ofName}'s ${kinLabel(kind, sex).toLowerCase()}`;
}

export const KIN_STALE_DAYS = 30;
export function isKinStale(daysSinceSeen: number | null): boolean {
  return daysSinceSeen === null || daysSinceSeen > KIN_STALE_DAYS;
}

export function sortedPair(aId: string, bId: string): [string, string] {
  return aId < bId ? [aId, bId] : [bId, aId];
}

export function relKey(aId: string, bId: string): string {
  const [a, b] = sortedPair(aId, bId);
  return `${a}|${b}`;
}

export function findRelationship(
  relationships: PawnRelationship[] | undefined,
  aId: string,
  bId: string
): PawnRelationship | undefined {
  if (!relationships) return undefined;
  const [a, b] = sortedPair(aId, bId);
  return relationships.find((r) => r.pawnA === a && r.pawnB === b);
}

export function relationshipsOf(
  relationships: PawnRelationship[] | undefined,
  pawnId: string
): PawnRelationship[] {
  if (!relationships) return [];
  return relationships.filter((r) => r.pawnA === pawnId || r.pawnB === pawnId);
}

export function otherOf(rel: PawnRelationship, pawnId: string): string {
  return rel.pawnA === pawnId ? rel.pawnB : rel.pawnA;
}

export function activeMoodModifiers(pawn: Pawn, turn: number): MoodModifier[] {
  const mods = pawn.moodModifiers;
  if (!mods || mods.length === 0) return [];
  return mods.filter((m) => m.expiresAt === 0 || m.expiresAt > turn);
}

export function moodModifierValue(m: MoodModifier, turn: number): number {
  if (m.expiresAt === 0) return m.value;
  if (m.expiresAt <= turn) return 0;
  const start = m.startedAt ?? m.expiresAt;
  if (start >= m.expiresAt) return m.value;
  const frac = (m.expiresAt - turn) / (m.expiresAt - start);
  return m.value * (frac < 0 ? 0 : frac > 1 ? 1 : frac);
}

export function effectiveMood(pawn: Pawn, _turn?: number): number {
  const mood = pawn.state?.mood ?? 50;
  return Math.max(0, Math.min(100, mood));
}
