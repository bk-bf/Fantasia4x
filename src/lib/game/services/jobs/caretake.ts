import type { GameState, Job, Pawn } from '../../core/types';
import { pawnStatService } from '../PawnStatService';
import { socialService } from '../SocialService';
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import { isRoofedTile } from '../EnvironmentService';
import { consumeFromStockpiles } from '../../core/state/stockpile';
import { CARE_CONFIG, isTended, isUncareable } from '../../core/defs/wounds';
import { rng } from '../../core/util/rng';
import { PAWN_STATE } from '../../systems/pawn/pawnStates';

export const TEND_WORK = 18;

const SEVERITY_RANK: Record<string, number> = { minor: 1, serious: 2, critical: 3, destroyed: 4 };
const OFF_SHELTER_TEND_MUL = 0.3;

const TEND_SKILL_SCALE = 0.35;

export function hasUntendedWound(patient: Pawn, turn: number): boolean {
  return (patient.limbs ?? []).some((l) =>
    (l.parts ?? []).some((p) =>
      p.injuries.some(
        (w) => !isUncareable(w) && !isTended(w, turn) && (w.bleeding > 0 || w.severity !== 'minor')
      )
    )
  );
}

export function hasActiveInfection(patient: Pawn): boolean {
  return (patient.conditions ?? []).some((c) => c.id === 'infection' && c.severity > 0);
}

function needsTending(patient: Pawn, turn: number): boolean {
  if (patient.isAlive === false || !patient.position || patient.carriedBy) return false;
  const resting =
    patient.currentState === PAWN_STATE.SLEEPING || patient.currentState === PAWN_STATE.COLLAPSED;
  if (!resting) return false;
  return hasUntendedWound(patient, turn) || hasActiveInfection(patient);
}

function bestMedicine(gs: GameState, patient: Pawn): { id: string; quality: number } | null {
  const cap = patient.medicineTierCap;
  let best: { id: string; quality: number } | null = null;
  for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
    if (amount <= 0) continue;
    const def = itemService.getItemById(id);
    const q = def?.medicineQuality;
    if (!q || q <= 0) continue;
    if (def?.curesConditions?.length || def?.mendsWounds?.length) continue;
    if (cap != null && (def?.tier ?? 0) > cap) continue;
    if (!best || q > best.quality) best = { id, quality: q };
  }
  return best;
}

function shelterTendFactor(gs: GameState, x: number, y: number): number {
  const here = (gs.buildings ?? []).find((b) => b.x === x && b.y === y && b.status === 'complete');
  const bonus = here
    ? (buildingService.getBuildingById(here.type)?.effects?.treatmentBonus ?? 0)
    : 0;
  if (bonus > 0) return 1 + bonus;
  if (isRoofedTile(x, y)) return 1;
  return OFF_SHELTER_TEND_MUL;
}

export function tendPatient(patient: Pawn, medic: Pawn, gs: GameState): GameState {
  const turn = gs.turn;
  const limbs = patient.limbs;
  if (!limbs || !patient.position) return gs;

  let target: { li: number; pi: number; wi: number; bleeding: number; rank: number } | null = null;
  for (let li = 0; li < limbs.length; li++) {
    const parts = limbs[li].parts ?? [];
    for (let pi = 0; pi < parts.length; pi++) {
      const injuries = parts[pi].injuries;
      for (let wi = 0; wi < injuries.length; wi++) {
        const w = injuries[wi];
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
  if (!target && !infected) return gs;

  const skill = pawnStatService.evaluateStat('caretaking_quality', medic) * TEND_SKILL_SCALE;
  const mood = medic.state?.mood ?? 50;
  const moodFactor = Math.max(0.3, Math.min(1.2, 0.6 + (mood / 100) * 0.6));
  const med = bestMedicine(gs, patient);
  const shelter = shelterTendFactor(gs, patient.position.x, patient.position.y);
  const skillRoll = skill * moodFactor * (0.6 + rng.random() * 0.4);
  const quality = Math.max(0, Math.min(1, (skillRoll + (med?.quality ?? 0)) * shelter));
  if (quality < CARE_CONFIG.minTendQuality) return gs;

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
  if (med) next = consumeFromStockpiles(next, { [med.id]: 1 });
  next = socialService.onTend(next, medic, patient);
  return next;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  const turn = gs.turn;
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
