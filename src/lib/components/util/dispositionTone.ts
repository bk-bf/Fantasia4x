import type { KingdomRelation } from '$lib/game/core/types';

export const DISPOSITION_TONE: Record<KingdomRelation['disposition'], string> = {
  allied: 'var(--pos)',
  friendly: 'var(--pos)',
  neutral: 'var(--text-dim)',
  wary: 'var(--accent-hi)',
  hostile: 'var(--neg)'
};
