export interface CreatureBaseStats {
  strength: number;
  dexterity: number;
  constitution: number;
  perception: number;
  health: number;
  speed: number;
  visionRange: number;
  fleeRange: number;
}

export interface CreatureStatRanges {
  strength?: [number, number];
  dexterity?: [number, number];
  constitution?: [number, number];
  perception?: [number, number];
}

function midStats(
  stats: Pick<CreatureBaseStats, 'strength' | 'dexterity' | 'constitution' | 'perception'> | undefined,
  statRanges: CreatureStatRanges | undefined
): Pick<CreatureBaseStats, 'strength' | 'dexterity' | 'constitution' | 'perception'> {
  if (stats) return stats;
  const mid = (r: [number, number] | undefined, fallback: number) =>
    r ? Math.round((r[0] + r[1]) / 2) : fallback;
  return {
    strength: mid(statRanges?.strength, 10),
    dexterity: mid(statRanges?.dexterity, 10),
    constitution: mid(statRanges?.constitution, 10),
    perception: mid(statRanges?.perception, 10)
  };
}

export function deriveCreatureStats(
  stats:
    | Pick<CreatureBaseStats, 'strength' | 'dexterity' | 'constitution' | 'perception'>
    | undefined,
  statRanges: CreatureStatRanges | undefined
): CreatureBaseStats {
  const rs = midStats(stats, statRanges);
  const visionRange = Math.round(4 + rs.perception * 1.3);
  return {
    strength: rs.strength,
    dexterity: rs.dexterity,
    constitution: rs.constitution,
    perception: rs.perception,
    health: rs.constitution * 5,
    speed: Math.floor(1.5 + rs.dexterity * 0.35),
    visionRange,
    fleeRange: Math.round(visionRange * 1.45)
  };
}
