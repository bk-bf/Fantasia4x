import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import type { IconId } from '$lib/pixelArt/fx/icons';

const BY_CONDITION: Record<string, IconId> = {
  collapse: 'collapsed',
  winded: 'winded',
  knockdown: 'knocked',
  bleeding: 'bleeding',
  burning: 'burning',
  envenomed: 'poisoned',
  hypothermia: 'frozen',
  malnutrition: 'starving',
  tired: 'exhausted',
  mental_breakdown: 'moodbreak',
  nausea: 'sick',
  dysentery: 'sick',
  infection: 'sick'
};

const BY_WORD: Record<string, IconId> = { 'Fractured!': 'fractured' };

export function iconFor(e: CombatTextEvent): IconId | undefined {
  if (e.kind === 'condition') return BY_CONDITION[(e.conditionId ?? '').split(':')[0]];
  if (e.kind === 'fracture') return BY_WORD[e.text];
  return undefined;
}

export const iconConditions = (): readonly string[] => Object.keys(BY_CONDITION);
