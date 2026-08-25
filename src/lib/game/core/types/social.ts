export type RelationStage =
  | 'enemies'
  | 'rivals'
  | 'strangers'
  | 'acquaintances'
  | 'friends'
  | 'best_friends';

export type RelationTag = 'grief_bond' | 'battle_forged' | 'mentor' | 'rescued_by';

export type RomanceStage = 'interested' | 'courting' | 'partners' | 'ex';

export interface RomanceState {
  stage: RomanceStage;
  since: number;
}

export type KinKind =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'grandparent'
  | 'grandchild'
  | 'auntuncle'
  | 'nibling'
  | 'cousin';

export type RelationEventKind =
  | 'seed'
  | 'talk'
  | 'time'
  | 'rescue'
  | 'tend'
  | 'battle'
  | 'grief'
  | 'strife'
  | 'romance';

export interface RelationshipEvent {
  turn: number;
  delta: number;
  label: string;
  kind: RelationEventKind;
  lines?: { name: string; text: string }[];
}

export interface KinTie {
  pawnId: string;
  kind: KinKind;
  warmth?: number;
}

export interface PawnRelationship {
  pawnA: string;
  pawnB: string;
  score: number;
  stage: RelationStage;
  romance?: RomanceState;
  kin?: KinKind;
  tags: RelationTag[];
  points: { history: number };
  flirts?: number;
  lastTalk?: { subject: string; category: string; positive: boolean; turn: number };
  log?: RelationshipEvent[];
}

export interface MoodModifier {
  id: string;
  label: string;
  value: number;
  expiresAt: number;
  startedAt?: number;
}

export interface SocialBreak {
  kind: 'break' | 'crisis';
  until: number;
}

export type MemoryKind = 'combat' | 'death' | 'masterwork' | 'botch' | 'idled' | 'affliction';

export interface EventMemory {
  kind: MemoryKind;
  turn: number;
  subjectId?: string;
  subjectName?: string;
  memorability: number;
  detail?: string;
  told?: number;
}
