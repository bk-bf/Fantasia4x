export const PATH_LOOKAHEAD = 2;

export function truncateSentPath(o: Record<string, unknown>): void {
  if (o.drafted && o.draftTarget) return;
  const path = o.path as unknown[] | undefined;
  if (!path || path.length === 0) return;
  const idx = (o.pathIndex as number) ?? 0;
  if (idx === 0 && path.length <= PATH_LOOKAHEAD) return;
  o.path = path.slice(idx, idx + PATH_LOOKAHEAD);
  o.pathIndex = 0;
}

const NEEDS_DROP = new Set(['lastSleep', 'lastMeal', 'lastDrink', 'lastWash', 'lastSocialise']);
const ACTIVE_JOB_DROP = new Set([
  'jobId',
  'targetX',
  'targetY',
  'droppedItemId',
  'buildingId',
  'craftQueueId',
  'timeRequired',
  'targetState',
  'turnsInState',
  'hungerToRecover',
  'depositX',
  'depositY'
]);
const STATE_DROP = new Set(['isWorking', 'isSleeping', 'isEating']);
const ENTITY_DROP = [
  'jobQueue',
  'hideWear',
  'hideWearAt',
  'naturalArmorOverride',
  'memories',
  'stealthChecks'
] as const;

function omit(src: Record<string, unknown>, drop: Set<string>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k in src) if (!drop.has(k)) o[k] = src[k];
  return o;
}

export function projectSentEntity(o: Record<string, unknown>): void {
  truncateSentPath(o);
  if (o.needs) o.needs = omit(o.needs as Record<string, unknown>, NEEDS_DROP);
  if (o.activeJob) o.activeJob = omit(o.activeJob as Record<string, unknown>, ACTIVE_JOB_DROP);
  if (o.state && typeof o.state === 'object')
    o.state = omit(o.state as Record<string, unknown>, STATE_DROP);
  for (const k of ENTITY_DROP) if (k in o) delete o[k];
}
