import type { Pawn, WorkAssignment } from '$lib/game/core/types';

/** A pawn's labor level (0–4) for a work id: a `laborSettings` override wins, else the legacy 0–12
 *  `workPriorities` value bucketed. Single source for the work tab and WorkCellTooltip. */
export function getPawnLaborLevel(a: WorkAssignment | undefined, workId: string): 0 | 1 | 2 | 3 | 4 {
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

// Work categories that are NOT learned skills — their effectiveness comes from other systems, so
// they're excluded from the "best/weakest skill" medal ranking and the cell tooltip shows their
// driving stats (not a speed/yield/quality). Hunting resolves as combat + haul; hauling is carrying.
// `stats` are the derived stats.jsonc ids surfaced in the tooltip (carry_weight/volume are special-
// cased there since they're not plain stat ids).
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
  leatherworking: 'LTH',
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
    if (pawn.activeJob.type === 'harvest')
      return pawn.activeJob.resourceId?.toUpperCase() ?? 'HARVEST';
    if (pawn.activeJob.type === 'construct') return 'BUILDING';
    if (pawn.activeJob.type === 'craft') return 'CRAFTING';
  }
  return s.toUpperCase();
}

export function needBar(val: number): string {
  const f = Math.round(val / 10);
  return '█'.repeat(f) + '░'.repeat(10 - f);
}

// Best/worst job markers: medal star on a pawn's three best jobs, chevron on the two weakest.
export const STAR_MARK = '★';
export const STAR_COLORS = ['#ffd24a', '#cbd2d8', '#cd7f32']; // gold, silver, bronze
export const STAR_TIERS = ['Best job', '2nd best', '3rd best'] as const;

export const WORST_MARK = '▾';
export const WORST_COLORS = ['#e0533d', '#8a4038']; // worst, 2nd worst
export const WORST_TIERS = ['Weakest job', '2nd weakest'] as const;

/** Per-cell medal/penalty rank: -1 means unranked, otherwise tier index. */
export interface CellRank {
  best: number; // 0=gold, 1=silver, 2=bronze, -1 none
  worst: number; // 0=worst, 1=2nd worst, -1 none
}

/** Tag the top three and bottom two work efficiencies; medals win so a cell never carries both. */
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
