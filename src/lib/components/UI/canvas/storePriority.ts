import type { ZonePriority } from '$lib/game/core/types';
import { ZONE_PRIORITY_LABELS } from '$lib/game/core/types';

const PRIORITY_TITLES: Record<ZonePriority, string> = {
  low: 'Filled once the rest are full',
  normal: 'Filled alongside the others',
  preferred: 'Filled before the ordinary stores',
  urgent: 'Filled before anything else'
};

export const PRIORITY_OPTIONS = (
  Object.entries(ZONE_PRIORITY_LABELS) as [ZonePriority, string][]
).map(([id, label]) => ({ id, label, title: PRIORITY_TITLES[id] }));
