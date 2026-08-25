import type { Pawn, WorkAssignment } from '$lib/game/core/types';
import { stateLabel as stateDefLabel } from '$lib/game/core/defs/states';
import { resourceObjectDefById } from '$lib/game/core/defs/resourceObjects';

export function getPawnLaborLevel(
  a: WorkAssignment | undefined,
  workId: string
): 0 | 1 | 2 | 3 | 4 {
  const ls = a?.laborSettings;
  if (ls && workId in ls) return ls[workId] as 0 | 1 | 2 | 3 | 4;
  const pri = a?.workPriorities?.[workId] ?? 0;
  if (pri === 0) return 0;
  if (pri <= 3) return 1;
  if (pri <= 6) return 2;
  if (pri <= 9) return 3;
  return 4;
}

export const LABOR_LABELS: Record<number, string> = {
  0: '—',
  1: 'LOW',
  2: 'NRM',
  3: 'HI',
  4: 'URG'
};
export const LABOR_COLORS: Record<number, string> = {
  0: '#555',
  1: '#4a9',
  2: '#8bc',
  3: '#fa0',
  4: '#f44'
};
export const LVL_NAMES = ['Off', 'Low', 'Normal', 'High', 'Urgent'] as const;

export const NON_SKILL_TASKS: Record<string, { label: string; statId: string }[]> = {
  hunting: [
    { label: 'Hit chance', statId: 'hit_chance' },
    { label: 'Attack speed', statId: 'attack_speed' },
    { label: 'Aim accuracy', statId: 'aim_accuracy' },
    { label: 'Aim speed', statId: 'aim_speed' },
    { label: 'Precision', statId: 'hit_precision' },
    { label: 'Movement', statId: 'movement_speed' }
  ],
  hauling: [
    { label: 'Carry weight', statId: 'carry_weight' },
    { label: 'Carry volume', statId: 'carry_volume' },
    { label: 'Movement', statId: 'movement_speed' }
  ]
};

export const ABBR: Record<string, string> = {
  foraging: 'FRG',
  woodcutting: 'WOD',
  mining: 'MNE',
  hunting: 'HNT',
  fishing: 'FSH',
  crafting: 'CRF',
  metalworking: 'MTL',
  woodworking: 'WWK',
  tailoring: 'TLR',
  leatherworking: 'LTH',
  stoneworking: 'STN',
  pottery: 'POT',
  digging: 'DIG',
  research: 'RSH',
  construction: 'BLD',
  alchemy: 'ALH',
  cooking: 'COK'
};

export function stateColor(pawn: Pick<Pawn, 'currentState'>): string {
  switch (pawn.currentState) {
    case 'Working':
      return '#4a9';
    case 'Hungry':
    case 'Eating':
      return '#f44';
    case 'Tired':
    case 'Sleeping':
      return '#fa0';
    default:
      return '#555';
  }
}

export function stateLabel(pawn: Pick<Pawn, 'currentState' | 'activeJob'>): string {
  const s = pawn.currentState ?? 'Idle';
  if (s === 'Working' && pawn.activeJob) {
    if (pawn.activeJob.type === 'harvest') {
      const rid = pawn.activeJob.resourceId;
      const name = rid ? (resourceObjectDefById(rid)?.displayName ?? rid) : 'Harvesting';
      return name.toUpperCase();
    }
    if (pawn.activeJob.type === 'construct') return 'BUILDING';
    if (pawn.activeJob.type === 'craft') return 'CRAFTING';
  }
  return stateDefLabel(s).toUpperCase();
}

export function needBar(val: number): string {
  const f = Math.round(val / 10);
  return '█'.repeat(f) + '░'.repeat(10 - f);
}

export const STAR_MARK = '★';
export const STAR_COLORS = ['#ffd24a', '#cbd2d8', '#cd7f32'];
export const STAR_TIERS = ['Best job', '2nd best', '3rd best'] as const;

export const WORST_MARK = '▾';
export const WORST_COLORS = ['#e0533d', '#8a4038'];
export const WORST_TIERS = ['Weakest job', '2nd weakest'] as const;

export interface CellRank {
  best: number;
  worst: number;
}

export function rankWorkCells(effByWork: Record<string, number>): Record<string, CellRank> {
  const ids = Object.keys(effByWork);
  const result: Record<string, CellRank> = {};
  for (const id of ids) result[id] = { best: -1, worst: -1 };

  const byDesc = [...ids].sort((a, b) => effByWork[b] - effByWork[a]);
  const byAsc = [...ids].sort((a, b) => effByWork[a] - effByWork[b]);

  byDesc.slice(0, 3).forEach((id, i) => {
    result[id].best = i;
  });
  byAsc.slice(0, 2).forEach((id, i) => {
    if (result[id].best === -1) result[id].worst = i;
  });
  return result;
}
