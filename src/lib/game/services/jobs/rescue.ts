import type { GameState, Job, Pawn } from '../../core/types';
import { PAWN_STATE } from '../../systems/pawn/pawnStates';
import { buildingService } from '../BuildingService';

function isShelterType(type: string): boolean {
  const e = (buildingService.getBuildingById(type)?.effects ?? {}) as {
    sleepQuality?: number;
    fatigueRecovery?: number;
  };
  return (e.sleepQuality ?? 0) > 0 || (e.fatigueRecovery ?? 0) > 0;
}

function hasShelter(gs: GameState): boolean {
  return (gs.buildings ?? []).some((b) => b.status === 'complete' && isShelterType(b.type));
}

function onShelterTile(gs: GameState, x: number, y: number): boolean {
  return (gs.buildings ?? []).some(
    (b) => b.status === 'complete' && isShelterType(b.type) && b.x === x && b.y === y
  );
}

function needsRescue(victim: Pawn, gs: GameState): boolean {
  return (
    victim.isAlive !== false &&
    victim.currentState === PAWN_STATE.COLLAPSED &&
    !victim.carriedBy &&
    !!victim.position &&
    !onShelterTile(gs, victim.position.x, victim.position.y)
  );
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  const pawns = gs.pawns ?? [];
  if (!hasShelter(gs)) return jobs.filter((j) => j.type !== 'rescue');

  jobs = jobs.filter((j) => {
    if (j.type !== 'rescue') return true;
    const victim = pawns.find((p) => p.id === j.patientId);
    if (!victim || victim.isAlive === false) return false;
    const inTransit = !!victim.carriedBy && victim.carriedBy === j.claimedBy;
    return needsRescue(victim, gs) || inTransit;
  });

  for (const victim of pawns) {
    if (!needsRescue(victim, gs)) continue;
    if (jobs.some((j) => j.type === 'rescue' && j.patientId === victim.id)) continue;
    jobs.push({
      id: `rescue-${victim.id}`,
      type: 'rescue',
      targetX: victim.position!.x,
      targetY: victim.position!.y,
      patientId: victim.id,
      workRequired: 1,
      workDone: 0,
      claimedBy: null
    });
  }
  return jobs;
}

export function complete(_job: Job, gs: GameState): GameState {
  return gs;
}
