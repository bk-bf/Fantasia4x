import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import type { IconId, IconMark } from '$lib/pixelArt/fx/icons';

export interface ConditionIcon {
  id: IconId;
  mark?: IconMark;
}

const up = (id: IconId): ConditionIcon => ({ id, mark: 'up' });
const down = (id: IconId): ConditionIcon => ({ id, mark: 'down' });
const plain = (id: IconId): ConditionIcon => ({ id });

const BY_CONDITION: Record<string, ConditionIcon> = {
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
  dysentery: plain('sick'),
  infection: plain('sick'),
  pain_shock: plain('pain'),
  hypovolemia: plain('drained'),
  heat_stroke: plain('sun'),
  wet: plain('drops'),
  filthy: plain('muck'),
  intoxicated: plain('mug'),
  blood_up: up('mug'),
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
  adrenal: up('surge'),
  berserk_spent: down('rage'),
  adrenal_spent: down('surge'),
  photosynthesis: up('leaf'),
  light_sensitive: down('glare'),
  feasted: up('fang'),
  werewolf: plain('wolf'),
  lunar_aggression: plain('fullmoon'),
  pack_fury: up('paw'),
  hydro_vigor: up('drops'),
  waterlogged: down('drops'),
  coldsurge: up('frozen'),
  frostbrittle: down('frozen'),
  sun_fueled: up('sun'),
  heat_faint: down('sun'),
  nightbloom: up('crescent'),
  nyctophobic: down('crescent'),
  storm_fed: up('storm'),
  wind_cowed: down('gust'),
  filth_thriving: up('muck'),
  fastidious_gag: down('muck'),
  pain_maddened: up('pain'),
  faint_hearted: down('heart'),
  bloodfrenzy: up('drained'),
  anemic_shock: down('drained'),
  feverburn: plain('fever'),
  septic_prone: down('rot'),
  venom_adapted: up('poisoned'),
  thin_veined: down('poisoned'),
  emberheart: up('burning'),
  tinder_skin: down('burning'),
  camel_bodied: up('starving'),
  ravenous_hunger: down('starving'),
  weak_gutted: down('sick'),
  laden: plain('pack'),
  encumbered: down('pack'),
  overmatched: plain('yield'),
  windchilled: down('gust'),
  fractured: plain('fractured'),
  dehydration: down('drops'),
  comfortable: plain('rested'),
  fouled_guard: down('block'),
  sheltered: up('rested'),
  darkness: plain('crescent'),
  clean: up('drops'),
  well_rested: plain('rested'),
  well_fed: plain('wellfed'),
  rallied: up('surge'),
  hearty_meal: plain('wellfed'),
  warmed_through: up('sun'),
  stock_warmed: up('sun'),
  banked_warmth: up('sun'),
  cool_slaked: up('mug'),
  deep_slaked: up('mug'),
  set_to_mend: plain('splint'),
  trail_fed: plain('wellfed'),
  well_provisioned: plain('wellfed'),
  clear_headed: up('dazed'),
  keen_witted: up('glare'),
  nourished: plain('wellfed'),
  fortified: up('block'),
  refreshed: up('rested'),
  soothed: up('heart'),
  mood_ecstatic: up('heart'),
  mood_content: plain('heart'),
  mood_sad: down('heart'),
  mood_depressed: plain('moodbreak'),
  feathered: up('gust'),
  gilled: up('drops'),
  moist_skinned: up('drops'),
  stone_boned: up('splint'),
  budding_winged: up('gust'),
  winged: up('gust'),
  great_winged: up('gust'),
  prehensile_tailed: plain('paw'),
  gliding_membrane: up('gust'),
  gill_frilled: up('drops'),
  bounding_gait: up('dodge'),
  restless_under_roof: down('rested'),
  cold_torpor: down('frozen'),
  parched_skin: down('sun'),
  toxin_immune: up('poisoned'),
  tremor_sense: up('ache'),
  echo_sighted: up('glare'),
  ironclad_mind: up('block'),
  lightning_warded: up('storm'),
  might: up('rage'),
  insight: up('glare'),
  vigor: up('heart'),
  quickness: up('dodge'),
  keen_senses: up('glare'),
  charm: up('heart'),
  moonlit: plain('fullmoon'),
  grace: up('leaf'),
  fortitude: up('block')
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
