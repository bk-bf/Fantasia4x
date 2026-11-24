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
  weak_gutted: down('sick')
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

export const iconConditions = (): readonly string[] => Object.keys(BY_CONDITION);
