import { CONFLICT_GROUPS } from '../../defs/traitConflicts';

export function createTraitBan() {
  const banned = new Set<string>();
  const ban = (id: string) => {
    banned.add(id);
    for (const g of CONFLICT_GROUPS) if (g.includes(id)) g.forEach((x) => banned.add(x));
  };
  return { banned, ban };
}
