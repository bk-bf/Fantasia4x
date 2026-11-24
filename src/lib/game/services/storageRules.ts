import type { Item } from '../core/types';
import storageData from '../database/items/storage.json';

export const PILE_CLASSES = [
  'logs',
  'planks',
  'blocks',
  'rubble',
  'heap',
  'bars',
  'sacks',
  'crates',
  'fluids',
  'baskets',
  'meat',
  'hides',
  'cloth',
  'pots',
  'bundles'
] as const;
export type PileClass = (typeof PILE_CLASSES)[number];

export const LONG_KINDS = [
  'sword',
  'bow',
  'spear',
  'staff',
  'hammer',
  'axe',
  'mace',
  'dagger',
  'pick',
  'hoe',
  'saw',
  'tongs'
] as const;
export type LongKind = (typeof LONG_KINDS)[number];

export type Tuck = 'lush' | 'low' | 'none';

export type ItemStorage =
  | { kind: 'pile'; pile: PileClass }
  | { kind: 'long'; long: LongKind; tool: boolean }
  | { kind: 'loose'; family: string; own: boolean; tuck: Tuck; stages?: readonly number[] };

export type StorableItem = Pick<Item, 'id' | 'type' | 'category'> & {
  armorProperties?: Pick<
    NonNullable<Item['armorProperties']>,
    'slot' | 'equipmentSlot' | 'armorType'
  >;
};

interface OwnStorage {
  family: string;
  tuck?: Tuck;
  stages?: number[];
  stack?: number;
}

const OWN = storageData as Record<string, OwnStorage>;

export const PILE_STACK_SIZE: Readonly<Record<PileClass, number>> = {
  logs: 30,
  planks: 40,
  blocks: 20,
  rubble: 40,
  heap: 40,
  bars: 30,
  sacks: 20,
  crates: 30,
  fluids: 40,
  baskets: 30,
  meat: 30,
  hides: 20,
  cloth: 20,
  pots: 20,
  bundles: 30
};
export const LONG_STACK_SIZE = 3;
const LOOSE_STACK_SIZE = 1;
const PILE_STAGE_SHARES = [0.25, 0.65];
const OWN_TUCK: Tuck = 'low';

const LONG_BY_ID: readonly (readonly [RegExp, LongKind])[] = [
  [/crossbow|arbalest|bow$|recurve|sling/, 'bow'],
  [/spear|javelin|pilum|pike|halberd|glaive|lance|trident|impaler/, 'spear'],
  [/staff|rod$|wand|sceptre|torch/, 'staff'],
  [/hammer|maul/, 'hammer'],
  [/axe|hatchet|cleaver|chopper|adze/, 'axe'],
  [/mace|club|flail/, 'mace'],
  [/dagger|knife|stiletto|dirk|shank|sickle|shears|seax|kit$/, 'dagger'],
  [/pick|mattock/, 'pick'],
  [/hoe|spade|shovel|rake/, 'hoe'],
  [/^saw|_saw/, 'saw'],
  [/tongs/, 'tongs']
];

type PileRule = readonly [category: RegExp, id: RegExp, pile: PileClass];

const ANY = /./;

const MATERIAL_PILES: readonly PileRule[] = [
  [/^(wood|magic_wood)$/, /log/, 'logs'],
  [/^(wood|magic_wood)$/, /plank|board|beam/, 'planks'],
  [/^(wood|magic_wood|woodwork)$/, ANY, 'bundles'],
  [/^(block|construction)$/, ANY, 'blocks'],
  [/^stone$/, ANY, 'rubble'],
  [/^ore$/, ANY, 'rubble'],
  [/^(metal|iron|steel)$/, /bar$|ingot/, 'bars'],
  [/^fuel$/, /log|firewood/, 'logs'],
  [/^(fuel|soil|clay)$/, ANY, 'heap'],
  [/^carcass$/, ANY, 'meat'],
  [/^(hide|cured_hide|leather)$/, ANY, 'hides'],
  [/^(cloth|wool)$/, ANY, 'cloth'],
  [/^fiber$/, ANY, 'bundles'],
  [/seed$/, ANY, 'sacks'],
  [/^primitive$/, /small_stone|flint/, 'rubble'],
  [/^primitive$/, /sand|salt|dirt|ash/, 'heap'],
  [/^primitive$/, /hay|fiber|branch|bark|reed|straw/, 'bundles'],
  [/^organic$/, /flour|meal$|malt/, 'sacks'],
  [/^organic$/, /cloth$/, 'cloth'],
  [/^organic$/, ANY, 'baskets']
];

const FOOD_PILES: readonly PileRule[] = [
  [/^(meat|fish)$/, ANY, 'meat'],
  [/^meal$/, ANY, 'pots'],
  [/^(grain|legume)$/, ANY, 'sacks'],
  [/^preserve$/, /meat|fish|jerky|sausage/, 'meat'],
  [/^preserve$/, ANY, 'crates'],
  [ANY, ANY, 'baskets']
];

const UNSORTED: PileClass = 'crates';

const longOf = (id: string, fallback: LongKind): LongKind =>
  LONG_BY_ID.find(([pattern]) => pattern.test(id))?.[1] ?? fallback;

const pileOf = (rules: readonly PileRule[], item: StorableItem): PileClass =>
  rules.find(([category, id]) => category.test(item.category ?? '') && id.test(item.id))?.[2] ??
  UNSORTED;

function wornFamily(item: StorableItem): string {
  if (/shield|buckler/.test(item.id)) return 'shield';
  const armor = item.armorProperties;
  const slot = String(armor?.slot ?? armor?.equipmentSlot ?? '');
  if (/head/.test(slot)) return /hood|cap$|circlet|hat/.test(item.id) ? 'roll' : 'helm';
  if (/torso/.test(slot))
    return item.category === 'metal' || armor?.armorType === 'heavy' ? 'cuirass' : 'roll';
  if (/feet/.test(slot)) return 'boots';
  return 'roll';
}

const loose = (family: string): ItemStorage => ({
  kind: 'loose',
  family,
  own: false,
  tuck: family === 'pack' ? 'low' : 'lush'
});

function storedTool(item: StorableItem): ItemStorage {
  if (/belt|sash|bandolier|harness/.test(item.id)) return loose('roll');
  if (/pack|bag|pannier|quiver|satchel|sling/.test(item.id)) return loose('pack');
  const pile = /skin|urn|jug|flask|bottle|bucket|barrel|cask|keg/.test(item.id)
    ? 'fluids'
    : /basket/.test(item.id)
      ? 'baskets'
      : UNSORTED;
  return { kind: 'pile', pile };
}

export function itemStorage(item: StorableItem): ItemStorage {
  const own = OWN[item.id];
  if (own)
    return {
      kind: 'loose',
      family: own.family,
      own: true,
      tuck: own.tuck ?? OWN_TUCK,
      ...(own.stages ? { stages: own.stages } : null)
    };
  if (item.type === 'weapon') return { kind: 'long', long: longOf(item.id, 'sword'), tool: false };
  if (item.type === 'armor') return loose(wornFamily(item));
  if (item.type === 'tool' && item.category === 'storage') return storedTool(item);
  if (item.type === 'tool') return { kind: 'long', long: longOf(item.id, 'hammer'), tool: true };
  if (item.type === 'fluid') return { kind: 'pile', pile: 'fluids' };
  if (item.type === 'food') return { kind: 'pile', pile: pileOf(FOOD_PILES, item) };
  if (item.type === 'material') return { kind: 'pile', pile: pileOf(MATERIAL_PILES, item) };
  return { kind: 'pile', pile: UNSORTED };
}

export function stackSize(item: StorableItem): number {
  const storage = itemStorage(item);
  if (storage.kind === 'pile') return PILE_STACK_SIZE[storage.pile];
  if (storage.kind === 'long') return LONG_STACK_SIZE;
  return OWN[item.id]?.stack ?? LOOSE_STACK_SIZE;
}

export function stageCount(storage: ItemStorage): number {
  if (storage.kind === 'pile') return PILE_STAGE_SHARES.length + 1;
  if (storage.kind === 'loose' && storage.stages) return storage.stages.length + 1;
  return 1;
}

export function storageStage(storage: ItemStorage, quantity: number): number {
  const bounds =
    storage.kind === 'pile'
      ? PILE_STAGE_SHARES.map((share) => PILE_STACK_SIZE[storage.pile] * share)
      : storage.kind === 'loose'
        ? (storage.stages ?? [])
        : [];
  const stage = bounds.findIndex((bound) => quantity <= bound);
  return stage < 0 ? bounds.length : stage;
}

export function ownStorageIds(): string[] {
  return Object.keys(OWN);
}
