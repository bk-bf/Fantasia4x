import type { Pawn } from '../types';

export function isColonist(pawn: Pawn): boolean {
  return pawn.isVisitor !== true && pawn.isAlive !== false;
}

export function colonists(state: { pawns?: readonly Pawn[] } | null | undefined): Pawn[] {
  const pawns = state?.pawns;
  if (!pawns || pawns.length === 0) return [];
  const out: Pawn[] = [];
  for (const pawn of pawns) if (isColonist(pawn)) out.push(pawn);
  return out;
}

export function colonistCount(state: { pawns?: readonly Pawn[] } | null | undefined): number {
  const pawns = state?.pawns;
  if (!pawns) return 0;
  let n = 0;
  for (const pawn of pawns) if (isColonist(pawn)) n++;
  return n;
}
