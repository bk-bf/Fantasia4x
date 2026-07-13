// Caretake job handler (ADR-017) — wound-dressing as a proper colony job. A pawn with the
// `caretaking` labor walks to a RESTING wounded patient (Sleeping/Collapsed — holding still) and
// dresses its untended wounds, stamping a treatment quality that drives faster healing + infection
// suppression (see core/Wounds.isTended, core/Wounds.healLimbs). Replaces the old passive
// teleport-tend: an untended wound now bleeds on until a medic physically reaches the patient.
//
// Dressing quality is SHELTER-GATED: a field dressing in the open is nearly worthless; a roofed
// tile (and especially a bed with a `treatmentBonus`) is what makes a tend viable.
import type { GameState, Job, Pawn } from '../../core/types';
import { pawnStatService } from '../PawnStatService';
import { socialService } from '../SocialService';
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import { isRoofedTile } from '../EnvironmentService';
import { consumeFromStockpiles } from '../../core/GameState';
import { CARE_CONFIG, isTended, isUncareable } from '../../core/Wounds';
import { rng } from '../../core/rng';
import { PAWN_STATE } from '../../systems/pawn/pawnStates';

/** Work points to dress ONE wound (a short on-site job). The auto caretake job accrues this at the
 *  medic's stat-scaled `caretaking` speed and dresses a single wound per completion, so a badly hurt
 *  patient is tended wound-by-wound over time (never an instant all-at-once heal). Exported so the
 *  drafted emergency-care order can pace its per-wound tends off the same budget. */
export const TEND_WORK = 18;

/** Order wounds worst-first: more bleeding wins, then higher severity as the tiebreak. */
const SEVERITY_RANK: Record<string, number> = { minor: 1, serious: 2, critical: 3, destroyed: 4 };
/** Dressing quality multiplier when the patient is NOT under a roof — a field dressing barely helps. */
const OFF_SHELTER_TEND_MUL = 0.3;

/** WORK-EXPERIENCE: maps the level-driven `caretaking_quality` axis (≈0.6–2.5) into the 0–1 tend
 *  band the old `medical_skill` stat produced (mid-level ≈ 1.0 × this ≈ the old baseline 0.3). */
const TEND_SKILL_SCALE = 0.35;

/** Does this pawn carry a wound worth dressing — untended AND (bleeding or serious+)? Minor
 *  non-bleeding scratches self-close, so they don't count ("only minor wounds can be risked left
 *  untreated"). Shared by the auto caretake job and the player's drafted `tend` (emergency care) order. */
export function hasUntendedWound(patient: Pawn, turn: number): boolean {
  // Skip uncareable wounds — permanent scars AND a lost (destroyed, no-longer-bleeding) limb: dressing
  // does nothing and it can't heal, so treating it as "untended" is what spun the infinite-tend loop.
  return (patient.limbs ?? []).some((l) =>
    (l.parts ?? []).some((p) =>
      p.injuries.some(
        (w) => !isUncareable(w) && !isTended(w, turn) && (w.bleeding > 0 || w.severity !== 'minor')
      )
    )
  );
}

/** Does this pawn carry an active infection worth treating? The `infection` condition is driven by
 *  untended open wounds (see PawnStateMachine); a caretaker treats it directly (tendPatient) once the
 *  festering wounds are dressed. An infected pawn is an auto-care target in its own right — so a
 *  colonist whose wounds have all closed but who is still fighting off an infection keeps pulling a
 *  medic until it clears, rather than being left to the slow passive immune recovery alone. */
export function hasActiveInfection(patient: Pawn): boolean {
  return (patient.conditions ?? []).some((c) => c.id === 'infection' && c.severity > 0);
}

/** A patient is tendable by the AUTO caretake job when it's holding still (resting/downed), not being
 *  carried, and has either a wound worth dressing OR an active infection to treat. The drafted
 *  emergency-care order skips the resting gate — a medic can be told to dress a standing colonist's
 *  wounds right now. */
function needsTending(patient: Pawn, turn: number): boolean {
  if (patient.isAlive === false || !patient.position || patient.carriedBy) return false;
  const resting =
    patient.currentState === PAWN_STATE.SLEEPING || patient.currentState === PAWN_STATE.COLLAPSED;
  if (!resting) return false;
  return hasUntendedWound(patient, turn) || hasActiveInfection(patient);
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
  const here = (gs.buildings ?? []).find((b) => b.x === x && b.y === y && b.status === 'complete');
  const bonus = here
    ? (buildingService.getBuildingById(here.type)?.effects?.treatmentBonus ?? 0)
    : 0;
  if (bonus > 0) return 1 + bonus; // on a bed / medical surface — viable regardless of roof
  if (isRoofedTile(x, y)) return 1; // under a roof — viable
  return OFF_SHELTER_TEND_MUL; // out in the open
}

/**
 * Apply ONE unit of care to `patient` using `medic`'s caretaking work skill (WORK-EXPERIENCE: the
 * level-driven `caretaking_quality` axis, which folds in sight × manipulation × consciousness)
 * × mood × variance, plus the best stockpile medicine (consumed), the whole roll scaled
 * by the patient's shelter (heavy off-roof penalty). One visit dresses the SINGLE worst untended wound
 * (most bleeding first, severity as the tiebreak) AND, if the patient is infected, cuts the `infection`
 * severity by CARE_CONFIG.infectionTreatment × quality in the SAME tend — infection care rides along
 * with dressing rather than waiting for every wound to close (the festering wound stays open for days,
 * so it never would). One wound dressed per call so a mangled patient is tended progressively rather
 * than fully healed in one pass — the caller (auto job / drafted order) repeats until nothing remains.
 * Exported for the job handler and tests. A botched roll (< minTendQuality) does nothing.
 */
export function tendPatient(patient: Pawn, medic: Pawn, gs: GameState): GameState {
  const turn = gs.turn;
  const limbs = patient.limbs;
  if (!limbs || !patient.position) return gs;

  // Pick the worst untended wound: most bleeding, then highest severity.
  let target: { li: number; pi: number; wi: number; bleeding: number; rank: number } | null = null;
  for (let li = 0; li < limbs.length; li++) {
    const parts = limbs[li].parts ?? [];
    for (let pi = 0; pi < parts.length; pi++) {
      const injuries = parts[pi].injuries;
      for (let wi = 0; wi < injuries.length; wi++) {
        const w = injuries[wi];
        // Skip scars + lost (non-bleeding destroyed) limbs — nothing to dress on either.
        if (isUncareable(w) || isTended(w, turn)) continue;
        const rank = SEVERITY_RANK[w.severity] ?? 0;
        if (
          !target ||
          w.bleeding > target.bleeding ||
          (w.bleeding === target.bleeding && rank > target.rank)
        )
          target = { li, pi, wi, bleeding: w.bleeding, rank };
      }
    }
  }
  const infected = hasActiveInfection(patient);
  if (!target && !infected) return gs; // nothing left to dress or treat

  // WORK-EXPERIENCE: the caretaking_quality axis runs ≈0.6 (novice) – ≈2.5 (finesse master);
  // TEND_SKILL_SCALE maps it back into the 0–1 tend band the old `medical_skill` stat produced
  // (competent mid-level ≈ 0.35 ≈ the old INT-10 baseline).
  const skill = pawnStatService.evaluateStat('caretaking_quality', medic) * TEND_SKILL_SCALE;
  const mood = medic.state?.mood ?? 50;
  const moodFactor = Math.max(0.3, Math.min(1.2, 0.6 + (mood / 100) * 0.6));
  const med = bestMedicine(gs);
  const shelter = shelterTendFactor(gs, patient.position.x, patient.position.y);
  const skillRoll = skill * moodFactor * (0.6 + rng.random() * 0.4);
  const quality = Math.max(0, Math.min(1, (skillRoll + (med?.quality ?? 0)) * shelter));
  if (quality < CARE_CONFIG.minTendQuality) return gs; // botched / hopeless in the field

  // Dress the worst untended wound (if any): stops its bleed and stamps the tend for faster healing.
  const newLimbs = !target
    ? limbs
    : limbs.map((limb, li) => {
        if (li !== target!.li) return limb;
        const parts = limb.parts ?? [];
        const newParts = parts.map((part, pi) =>
          pi !== target!.pi
            ? part
            : {
                ...part,
                injuries: part.injuries.map((w, wi) =>
                  // Dressing a wound STOPS its bleeding immediately (the reliable answer vs the lucky
                  // clot roll) and stamps the tend for faster healing.
                  wi === target!.wi
                    ? { ...w, treatedAt: turn, treatmentQuality: quality, bleeding: 0 }
                    : w
                )
              }
        );
        const bleedRate = newParts.reduce(
          (s, p) => s + p.injuries.reduce((ps, x) => ps + x.bleeding, 0),
          0
        );
        return { ...limb, parts: newParts, bleedRate };
      });

  // Treat the infection in the SAME visit — NOT as an either/or with wound dressing. The wound that
  // festered is open (serious+) for days and keeps re-triggering the tend, so if infection care only
  // fired once every wound was closed it would never run and the % would sit flat. Every tend cuts
  // severity by infectionTreatment × quality on top of the passive immune recovery.
  const newConditions = !infected
    ? patient.conditions
    : (patient.conditions ?? []).flatMap((c) => {
        if (c.id !== 'infection') return [c];
        const nextSev = Math.max(0, c.severity - CARE_CONFIG.infectionTreatment * quality);
        return nextSev > 0 ? [{ ...c, severity: nextSev }] : [];
      });

  let next: GameState = {
    ...gs,
    pawns: gs.pawns.map((p) =>
      p.id === patient.id ? { ...patient, limbs: newLimbs, conditions: newConditions } : p
    )
  };
  if (med) next = consumeFromStockpiles(next, { [med.id]: 1 }); // one dose per tend
  // SOCIAL-LAYER: being cared for warms the patient to the medic (+8 per real tend; the botched
  // rolls above returned early, so only genuine care bonds).
  next = socialService.onTend(next, medic, patient);
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
