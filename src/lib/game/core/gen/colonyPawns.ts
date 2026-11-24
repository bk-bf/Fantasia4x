import type { Pawn, Culture, Kingdom } from '../types';
import { rollOrigin, rollBackgrounds } from '../defs/backgrounds';
import { rng } from '../util/rng';
import { buildPawnFromCulture } from './pawnBuild';
import { linkStartingKin } from './pawnKin';

export function generateColonyPawns(
  culturePool: Culture[],
  count = 5,
  opts?: { kingdoms?: Kingdom[]; founders?: boolean }
): Pawn[] {
  if (culturePool.length === 0) return [];
  const kingdoms = opts?.kingdoms;
  if (!kingdoms || kingdoms.length === 0) {
    const plain = Array.from({ length: count }, (_, i) =>
      buildPawnFromCulture(rng.pick(culturePool), i)
    );
    linkStartingKin(plain);
    return plain;
  }
  const forFounder = opts?.founders === true;
  const pawns = Array.from({ length: count }, (_, i) => {
    const { homeKingdomId, culture } = rollOrigin(culturePool, kingdoms);
    const age = rng.int(16, 45);
    const home = homeKingdomId ? kingdoms.find((k) => k.id === homeKingdomId) : undefined;
    const { childhood, adulthood } = rollBackgrounds(home, age, forFounder);
    return buildPawnFromCulture(culture, i, { homeKingdomId, age, childhood, adulthood });
  });
  linkStartingKin(pawns);
  return pawns;
}
