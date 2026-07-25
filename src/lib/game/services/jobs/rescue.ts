// Rescue job handler — carrying a DOWNED (Collapsed) colonist to shelter as a proper CARETAKING colony
// job (not only the player's drafted `rescue` order). A pawn with the `caretaking` labor claims the job,
// walks to the downed colonist, lifts it (the `Rescuing` FSM state — see handlers/rescue.handleRescuing),
// carries it to the nearest rest building and lays it down. The carry itself is FSM-driven (like hauling);
// this module only GENERATES the jobs and cleans them up. `reconcileCarriedPawns` is the safety net if a
// carry is abandoned mid-way (the body is set down on the spot). Mirrors caretake.ts's generate shape.
import type { GameState, Job, Pawn } from '../../core/types';
import { PAWN_STATE } from '../../systems/pawn/pawnStates';
import { buildingService } from '../BuildingService';

/** A building TYPE that provides rest (shelter) — has a sleep/fatigue-recovery effect. Mirrors
 *  pawnHelpers.isRestBuildingType, resolved via buildingService (kept off systems/pawn to avoid a
 *  jobs → handlers → JobService import cycle). */
function isShelterType(type: string): boolean {
  const e = (buildingService.getBuildingById(type)?.effects ?? {}) as {
    sleepQuality?: number;
    fatigueRecovery?: number;
  };
  return (e.sleepQuality ?? 0) > 0 || (e.fatigueRecovery ?? 0) > 0;
}

/** Does the colony have anywhere to carry a rescued colonist? */
function hasShelter(gs: GameState): boolean {
  return (gs.buildings ?? []).some((b) => b.status === 'complete' && isShelterType(b.type));
}

/** Is this tile already a completed rest-building (shelter) tile — i.e. the colonist is already safe? */
function onShelterTile(gs: GameState, x: number, y: number): boolean {
  return (gs.buildings ?? []).some(
    (b) => b.status === 'complete' && isShelterType(b.type) && b.x === x && b.y === y
  );
}

/** A colonist that should be carried to shelter: alive, DOWN (Collapsed), on the map, not already in
 *  someone's arms, and not already lying on a shelter tile. (The colony must have a shelter at all —
 *  gated once in `generate`.) */
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
  // No shelter → nowhere to carry anyone; keep no rescue jobs.
  if (!hasShelter(gs)) return jobs.filter((j) => j.type !== 'rescue');

  // Keep a rescue job while its victim is still down OR mid-carry by its claimer; drop it once the
  // colonist has recovered, died, or been delivered to shelter.
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
      workRequired: 1, // the carry is FSM-driven, not work-accrued; this is a nominal value
      workDone: 0,
      claimedBy: null
    });
  }
  return jobs;
}

/** The carry finalises in `handleRescuing` (it removes the job on drop), so a standard work-accrual
 *  completion never runs for a rescue. Kept as an idempotent no-op to satisfy the handler registry. */
export function complete(_job: Job, gs: GameState): GameState {
  return gs;
}
