// @ts-nocheck
const TO_CHECK_FROM = new Set(['', 'backlog', 'ready', 'in progress', 'manual']);
const TO_PROGRESS_FROM = new Set(['', 'backlog', 'ready', 'manual']);

export function passiveLane(lane, pull) {
  if (pull && !pull.isDraft) return TO_CHECK_FROM.has(lane) ? 'in check' : null;
  if (pull && lane === 'in check') return 'in progress';
  return TO_PROGRESS_FROM.has(lane) ? 'in progress' : null;
}
