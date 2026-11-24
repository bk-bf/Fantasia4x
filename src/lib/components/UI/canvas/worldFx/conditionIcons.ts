import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import type { IconId } from '$lib/pixelArt/fx/icons';

export type Grade = 1 | 2 | 3;

export interface ConditionIcon {
  id: IconId;
  grade?: Grade;
}

const plain = (id: IconId): ConditionIcon => ({ id });

export const GRADED_CHAINS: Record<string, readonly string[]> = {
  pack: ['laden', 'encumbered'],
  wing: ['budding_winged', 'winged', 'great_winged']
};

const graded = (): Record<string, ConditionIcon> =>
  Object.fromEntries(
    Object.entries(GRADED_CHAINS).flatMap(([id, chain]) =>
      chain.map((c, i) => [c, { id: id as IconId, grade: (i + 1) as Grade }])
    )
  );

const BY_CONDITION: Record<string, ConditionIcon> = {
  ...graded(),
  collapse: plain('collapsed'),
  winded: plain('winded'),
  knockdown: plain('knocked'),
  bleeding: plain('bleeding'),
  burning: plain('burning'),
  envenomed: plain('poisoned'),
  hypothermia: plain('frozen'),
  malnutrition: plain('starving'),
  tired: plain('exhausted'),
  mental_breakdown: plain('moodbreak'),
  nausea: plain('sick'),
  dysentery: plain('gut'),
  infection: plain('germs'),
  pain_shock: plain('pain'),
  hypovolemia: plain('drained'),
  heat_stroke: plain('sun'),
  wet: plain('drops'),
  filthy: plain('muck'),
  intoxicated: plain('mug'),
  blood_up: plain('tankards'),
  disoriented: plain('spiral'),
  ensnared: plain('net'),
  staggered: plain('reel'),
  concussed: plain('dazed'),
  hamstrung: plain('hamstring'),
  cowed: plain('yield'),
  splinted: plain('splint'),
  bone_ache: plain('ache'),
  bloodthirst: plain('fang'),
  berserk: plain('rage'),
  adrenal: plain('surge'),
  berserk_spent: plain('spent'),
  adrenal_spent: plain('brokenheart'),
  photosynthesis: plain('leaf'),
  light_sensitive: plain('glare'),
  feasted: plain('goblet'),
  werewolf: plain('wolf'),
  lunar_aggression: plain('fullmoon'),
  pack_fury: plain('paw'),
  hydro_vigor: plain('wave'),
  waterlogged: plain('sponge'),
  coldsurge: plain('icicles'),
  frostbrittle: plain('frostcrack'),
  sun_fueled: plain('sunflower'),
  heat_faint: plain('wilt'),
  nightbloom: plain('moonflower'),
  nyctophobic: plain('fear'),
  storm_fed: plain('storm'),
  wind_cowed: plain('benttree'),
  filth_thriving: plain('beetle'),
  fastidious_gag: plain('stench'),
  pain_maddened: plain('fist'),
  faint_hearted: plain('paleheart'),
  bloodfrenzy: plain('bloodblade'),
  anemic_shock: plain('vial'),
  feverburn: plain('fever'),
  septic_prone: plain('rot'),
  venom_adapted: plain('snake'),
  thin_veined: plain('bite'),
  emberheart: plain('salamander'),
  tinder_skin: plain('tinder'),
  camel_bodied: plain('camel'),
  ravenous_hunger: plain('drool'),
  weak_gutted: plain('badegg'),
  overmatched: plain('slab'),
  windchilled: plain('gust'),
  fractured: plain('fractured'),
  dehydration: plain('thirst'),
  comfortable: plain('pillow'),
  fouled_guard: plain('brokenshield'),
  sheltered: plain('roof'),
  darkness: plain('crescent'),
  clean: plain('soap'),
  well_rested: plain('rested'),
  well_fed: plain('wellfed'),
  rallied: plain('banner'),
  hearty_meal: plain('stew'),
  warmed_through: plain('pot'),
  stock_warmed: plain('broth'),
  banked_warmth: plain('embers'),
  cool_slaked: plain('colddrink'),
  deep_slaked: plain('hotdrink'),
  set_to_mend: plain('mendbone'),
  trail_fed: plain('sausage'),
  well_provisioned: plain('jar'),
  clear_headed: plain('pickle'),
  keen_witted: plain('owl'),
  nourished: plain('plate'),
  fortified: plain('steak'),
  refreshed: plain('apple'),
  soothed: plain('herb'),
  mood_ecstatic: plain('ecstatic'),
  mood_content: plain('content'),
  mood_sad: plain('sad'),
  mood_depressed: plain('depressed'),
  feathered: plain('feather'),
  gilled: plain('fish'),
  moist_skinned: plain('frog'),
  stone_boned: plain('stonebone'),
  prehensile_tailed: plain('tail'),
  gliding_membrane: plain('membrane'),
  gill_frilled: plain('frills'),
  bounding_gait: plain('hare'),
  restless_under_roof: plain('restless'),
  cold_torpor: plain('snail'),
  parched_skin: plain('drought'),
  toxin_immune: plain('mushroom'),
  tremor_sense: plain('tremor'),
  echo_sighted: plain('echo'),
  ironclad_mind: plain('helm'),
  lightning_warded: plain('earthing'),
  might: plain('biceps'),
  insight: plain('book'),
  vigor: plain('redheart'),
  quickness: plain('wingedboot'),
  keen_senses: plain('target'),
  charm: plain('rose'),
  moonlit: plain('star'),
  grace: plain('swan'),
  fortitude: plain('anvil')
};

const BY_WORD: Record<string, ConditionIcon> = {
  'Fractured!': plain('fractured'),
  'Organ hit!': plain('organ'),
  PARRY: plain('parry'),
  BLOCK: plain('block'),
  dodge: plain('dodge'),
  bleed: plain('bleeding'),
  'No ammo': plain('quiver')
};

const CRIT = plain('crit');

export function iconFor(e: CombatTextEvent): ConditionIcon | undefined {
  if (e.kind === 'condition') return BY_CONDITION[(e.conditionId ?? '').split(':')[0]];
  if (e.kind === 'crit') return CRIT;
  return BY_WORD[e.text];
}

export const iconWords = (): readonly string[] => Object.keys(BY_WORD);

export const conditionIcon = (id: string): ConditionIcon | undefined =>
  BY_CONDITION[id.split(':')[0]];

export const iconConditions = (): readonly string[] => Object.keys(BY_CONDITION);
