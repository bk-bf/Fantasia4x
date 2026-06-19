// Caretake job handler (ADR-017) — wound-dressing as a proper colony job. A pawn with the
// `caretaking` labor walks to a RESTING wounded patient (Sleeping/Collapsed — holding still) and
// dresses its untended wounds, stamping a treatment quality that drives faster healing + infection
// suppression (see core/Wounds.isTended, PawnStateMachine.healLimbs). Replaces the old passive
// teleport-tend: an untended wound now bleeds on until a medic physically reaches the patient.
//
// Dressing quality is SHELTER-GATED: a field dressing in the open is nearly worthless; a roofed
// tile (and especially a bed with a `treatmentBonus`) is what makes a tend viable.
import type { GameState, Job, Pawn } from '../../core/types';
import { pawnStatService } from '../PawnStatService';
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import { isRoofedTile } from '../EnvironmentService';
import { consumeFromStockpiles } from '../../core/GameState';
import { CARE_CONFIG, isTended } from '../../core/Wounds';
import { rng } from '../../core/rng';
import { PAWN_STATE } from '../../systems/pawn/pawnStates';

/** Work points to dress a patient's wounds (a short on-site job). */
const TEND_WORK = 18;
/** Dressing quality multiplier when the patient is NOT under a roof — a field dressing barely helps. */
const OFF_SHELTER_TEND_MUL = 0.3;

/** A patient is tendable when it's holding still (resting/downed) and carries a wound worth dressing —
 *  untended AND (bleeding or serious+). Minor non-bleeding scratches self-close at rest, so they don't
 *  spawn a medic job ("only minor wounds can be risked left untreated"). */
function needsTending(patient: Pawn, turn: number): boolean {
  if (patient.isAlive === false || !patient.position) return false;
  const resting =
    patient.currentState === PAWN_STATE.SLEEPING ||
    patient.currentState === PAWN_STATE.COLLAPSED;
  if (!resting) return false;
  return (patient.limbs ?? []).some((l) =>
    (l.parts ?? []).some((p) =>
      p.injuries.some((w) => !isTended(w, turn) && (w.bleeding > 0 || w.severity !== 'minor'))
    )
  );
}

/** Best medicine in the stockpile (highest `medicineQuality` with stock), or null. */
function bestMedicine(gs: GameState): { id: string; quality: number } | null {
  let best: { id: string; quality: number } | null = null;
  for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
    if (amount <= 0) continue;
    const q = itemService.getItemById(id)?.medicineQuality;
    if (q && q > 0 && (!best || q > best.quality)) best = { id, quality: q };
  }
  return best;
}

/** Dressing-quality factor for the patient's tile: a bed/shelter building makes the tend viable and
 *  adds its `treatmentBonus` (best surface to dress on, roof or not); a bare roofed tile is viable
 *  (×1); open ground is a heavy penalty (a field dressing barely helps). */
function shelterTendFactor(gs: GameState, x: number, y: number): number {
  const here = (gs.buildings ?? []).find(
    (b) => b.x === x && b.y === y && b.status === 'complete'
  );
  const bonus = here ? (buildingService.getBuildingById(here.type)?.effects?.treatmentBonus ?? 0) : 0;
  if (bonus > 0) return 1 + bonus; // on a bed / medical surface — viable regardless of roof
  if (isRoofedTile(x, y)) return 1; // under a roof — viable
  return OFF_SHELTER_TEND_MUL; // out in the open
}

/**
 * Dress `patient`'s untended wounds using `medic`'s `medical_skill` (folds in sight × manipulation ×
 * consciousness) × mood × variance, plus the best stockpile medicine (consumed), the whole roll scaled
 * by the patient's shelter (heavy off-roof penalty). Stamps the rolled quality on each untended wound.
 * Exported for the job handler and tests. A botched roll (< minTendQuality) does nothing.
 */
export function tendPatient(patient: Pawn, medic: Pawn, gs: GameState): GameState {
  const turn = gs.turn;
  const limbs = patient.limbs;
  if (!limbs || !patient.position) return gs;
  const hasUntended = limbs.some((l) =>
    (l.parts ?? []).some((p) => p.injuries.some((w) => !isTended(w, turn)))
  );
  if (!hasUntended) return gs;

  const skill = pawnStatService.evaluateStat('medical_skill', medic);
  const mood = medic.state?.mood ?? 50;
  const moodFactor = Math.max(0.3, Math.min(1.2, 0.6 + (mood / 100) * 0.6));
  const med = bestMedicine(gs);
  const shelter = shelterTendFactor(gs, patient.position.x, patient.position.y);
  const skillRoll = skill * moodFactor * (0.6 + rng.random() * 0.4);
  const quality = Math.max(0, Math.min(1, (skillRoll + (med?.quality ?? 0)) * shelter));
  if (quality < CARE_CONFIG.minTendQuality) return gs; // botched / hopeless in the field

  const newLimbs = limbs.map((limb) => {
    const parts = limb.parts;
    if (!parts || !parts.some((p) => p.injuries.length > 0)) return limb;
    return {
      ...limb,
      parts: parts.map((part) =>
        part.injuries.length === 0
          ? part
          : {
              ...part,
              injuries: part.injuries.map((w) =>
                isTended(w, turn) ? w : { ...w, treatedAt: turn, treatmentQuality: quality }
              )
            }
      )
    };
  });
  let next: GameState = {
    ...gs,
    pawns: gs.pawns.map((p) => (p.id === patient.id ? { ...patient, limbs: newLimbs } : p))
  };
  if (med) next = consumeFromStockpiles(next, { [med.id]: 1 }); // one dose per tend
  return next;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  const turn = gs.turn;
  // Drop caretake jobs whose patient is gone / no longer resting / no longer needs dressing.
  const pawns = gs.pawns ?? [];
  jobs = jobs.filter((j) => {
    if (j.type !== 'caretake') return true;
    const patient = pawns.find((p) => p.id === j.patientId);
    return !!patient && needsTending(patient, turn);
  });

  for (const patient of pawns) {
    if (!needsTending(patient, turn)) continue;
    if (jobs.some((j) => j.type === 'caretake' && j.patientId === patient.id)) continue;
    jobs.push({
      id: `caretake-${patient.id}`,
      type: 'caretake',
      targetX: patient.position!.x,
      targetY: patient.position!.y,
      patientId: patient.id,
      workRequired: TEND_WORK,
      workDone: 0,
      claimedBy: null
    });
  }
  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  if (!job.patientId || !job.claimedBy) return gs;
  const patient = gs.pawns.find((p) => p.id === job.patientId);
  const medic = gs.pawns.find((p) => p.id === job.claimedBy);
  if (!patient || !medic) return gs;
  return tendPatient(patient, medic, gs);
}
