import type { DroppedItem } from '../../types/jobs';

export const FRESH_CONDITION = 100;

export function normalizeConditions(conds: number[] | undefined, quantity: number): number[] {
  const out = (conds ?? []).slice(0, Math.max(0, quantity));
  while (out.length < quantity) out.push(FRESH_CONDITION);
  return out;
}

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

export function mergeConditions(
  a: number[] | undefined,
  aQty: number,
  b: number[] | undefined,
  bQty: number
): number[] {
  return [...normalizeConditions(a, aQty), ...normalizeConditions(b, bQty)];
}

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
