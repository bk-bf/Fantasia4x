// Per-unit carcass condition (0–100). A carcass DroppedItem stack carries one condition value PER UNIT
// in `unitConditions` (index 0 = the "top" unit: the next one consumed or butchered). This folds the
// old `gameState.carcassIntactness` per-TYPE map onto the stack itself, so a fresh kill can sit beside a
// half-eaten one without averaging, and a carcass's remaining mass scales its butchery yield.
//
// Two forces erode condition with DIFFERENT scope (see callers):
//   • CONSUMPTION (a scavenging animal, or a butcher run) eats the TOP unit only        → consumeTop
//   • ENVIRONMENT (spoilage / weather) rots the whole pile, so it erodes EVERY unit       → decayAll

import type { DroppedItem } from './types/jobs';

/** A fully-intact unit. */
export const FRESH_CONDITION = 100;

/** Return `conds` resized to exactly `quantity` entries — pads with FRESH, truncates extras. Keeps the
 *  array length in lock-step with the stack's `quantity` (legacy carcasses with no array read as fresh). */
export function normalizeConditions(conds: number[] | undefined, quantity: number): number[] {
  const out = (conds ?? []).slice(0, Math.max(0, quantity));
  while (out.length < quantity) out.push(FRESH_CONDITION);
  return out;
}

/** Consume `amount` of condition from the TOP unit (index 0). A unit whose condition reaches 0 is
 *  stripped (removed). Returns the new array + how many whole units were stripped — the caller drops
 *  `removed` from the stack's `quantity`. Only the top unit is ever touched. */
export function consumeTop(
  conds: number[],
  amount: number
): { conditions: number[]; removed: number } {
  if (conds.length === 0 || amount <= 0) return { conditions: conds, removed: 0 };
  const next = conds.slice();
  next[0] -= amount;
  let removed = 0;
  while (next.length > 0 && next[0] <= 0) {
    next.shift();
    removed += 1;
  }
  return { conditions: next, removed };
}

/** Environmental erosion: subtract `amount` from EVERY unit (the whole stack rots together). Units that
 *  reach 0 are stripped. Returns the new array + count removed (caller drops them from `quantity`). */
export function decayAll(
  conds: number[],
  amount: number
): { conditions: number[]; removed: number } {
  if (conds.length === 0 || amount <= 0) return { conditions: conds, removed: 0 };
  const next: number[] = [];
  let removed = 0;
  for (const c of conds) {
    const v = c - amount;
    if (v <= 0) removed += 1;
    else next.push(v);
  }
  return { conditions: next, removed };
}

/** Merge two carcass stacks by CONCATENATING their per-unit conditions, so each unit keeps its own
 *  condition across a stockpile merge (missing arrays are filled with FRESH for the side's quantity). */
export function mergeConditions(
  a: number[] | undefined,
  aQty: number,
  b: number[] | undefined,
  bQty: number
): number[] {
  return [...normalizeConditions(a, aQty), ...normalizeConditions(b, bQty)];
}

/** Average condition (0–100) across a set of per-unit arrays — for the per-type readout the sidebar and
 *  butchery panel show. Empty / no units → FRESH. */
export function averageCondition(arrays: (number[] | undefined)[]): number {
  let sum = 0;
  let n = 0;
  for (const arr of arrays) {
    for (const c of arr ?? []) {
      sum += c;
      n += 1;
    }
  }
  return n === 0 ? FRESH_CONDITION : sum / n;
}

/** Per-`resourceId` average condition (0–100) across all carcass stacks' per-unit arrays — the small
 *  summary the sidebar/butchery panels read. Computed WORKER-SIDE and shipped as `_carcassCondition`
 *  so the per-unit `unitConditions` arrays never have to cross the snapshot boundary (they're stripped
 *  from the projected `droppedItems`). Empty stocks → omitted (reader defaults to FRESH). */
export function carcassConditionByType(drops: DroppedItem[] | undefined): Record<string, number> {
  const byType: Record<string, (number[] | undefined)[]> = {};
  for (const d of drops ?? []) {
    if (!d.unitConditions || (d.quantity ?? 0) <= 0) continue;
    (byType[d.resourceId] ??= []).push(d.unitConditions);
  }
  const out: Record<string, number> = {};
  for (const [id, arrs] of Object.entries(byType)) out[id] = averageCondition(arrs);
  return out;
}
