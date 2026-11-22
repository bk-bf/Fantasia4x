import { pathfinderService } from '$lib/game/services/PathfinderService';

type Searcher = (...args: never[]) => { x: number; y: number }[];

export function countPathSearches(): { calls: number; fails: number; restore: () => void } {
  const svc = pathfinderService as unknown as Record<'findPath' | 'findPathOnGrid', Searcher>;
  const originals = { findPath: svc.findPath, findPathOnGrid: svc.findPathOnGrid };
  const tally = {
    calls: 0,
    fails: 0,
    restore: () => Object.assign(svc, originals)
  };
  for (const name of ['findPath', 'findPathOnGrid'] as const) {
    const orig = originals[name];
    svc[name] = (...args: never[]) => {
      const path = orig.apply(pathfinderService, args);
      tally.calls++;
      if (path.length === 0) tally.fails++;
      return path;
    };
  }
  return tally;
}
