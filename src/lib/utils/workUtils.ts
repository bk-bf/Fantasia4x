import type { Pawn } from '$lib/game/core/types';

export const LABOR_LABELS: Record<number, string> = { 0: '—', 1: 'LOW', 2: 'NRM', 3: 'HI', 4: 'URG' };
export const LABOR_COLORS: Record<number, string> = {
    0: '#555',
    1: '#4a9',
    2: '#8bc',
    3: '#fa0',
    4: '#f44'
};
export const LVL_NAMES = ['Off', 'Low', 'Normal', 'High', 'Urgent'] as const;
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
