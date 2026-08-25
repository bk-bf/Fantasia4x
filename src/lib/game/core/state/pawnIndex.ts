import type { Pawn } from '../types';

let cachedArr: readonly Pawn[] | null = null;
let cachedMap = new Map<string, Pawn>();

export function pawnById(pawns: readonly Pawn[], id: string): Pawn | undefined {
  if (pawns !== cachedArr) {
    cachedMap = new Map();
    for (const p of pawns) cachedMap.set(p.id, p);
    cachedArr = pawns;
  }
  return cachedMap.get(id);
}
