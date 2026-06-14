// Body-part anatomy table + selection helpers. Extracted from systems/Combat.ts (P-4) so the
// ~520-line data table lives apart from combat orchestration. Combat.ts re-exports PART_DEF_MAP and
// createDefaultBodyParts so existing importers are unchanged.
import type { BodyPartId, LimbId, BodyPartState } from './types';
import { rng } from './rng';

export interface BodyPartDef {
  id: BodyPartId;
  parentLimb: LimbId;
  maxHp: number;
  bleedRatio: number; // 0–1 share of total body mass
  hitWeight: number; // 0 = internal only; never selected by roll
  containedIn?: BodyPartId;
  isPaired: boolean;
  isVital: boolean;
}

export const BODY_PART_DEFS: BodyPartDef[] = [
  // ── Head ──────────────────────────────────────────────────────────────────
  {
    id: 'skull',
    parentLimb: 'head',
    maxHp: 45,
    bleedRatio: 0.04,
    hitWeight: 8,
    isPaired: false,
    isVital: false
  },
  {
    id: 'jaw',
    parentLimb: 'head',
    maxHp: 25,
    bleedRatio: 0.02,
    hitWeight: 4,
    isPaired: false,
    isVital: false
  },
  {
    id: 'nose',
    parentLimb: 'head',
    maxHp: 15,
    bleedRatio: 0.01,
    hitWeight: 2,
    isPaired: false,
    isVital: false
  },
  {
    id: 'leftEye',
    parentLimb: 'head',
    maxHp: 10,
    bleedRatio: 0.01,
    hitWeight: 1,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightEye',
    parentLimb: 'head',
    maxHp: 10,
    bleedRatio: 0.01,
    hitWeight: 1,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftEar',
    parentLimb: 'head',
    maxHp: 10,
    bleedRatio: 0.005,
    hitWeight: 1,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightEar',
    parentLimb: 'head',
    maxHp: 10,
    bleedRatio: 0.005,
    hitWeight: 1,
    isPaired: true,
    isVital: false
  },
  {
    id: 'brain',
    parentLimb: 'head',
    maxHp: 30,
    bleedRatio: 0.05,
    hitWeight: 0,
    containedIn: 'skull',
    isPaired: false,
    isVital: true
  },
  // ── Torso ─────────────────────────────────────────────────────────────────
  {
    id: 'chest',
    parentLimb: 'torso',
    maxHp: 80,
    bleedRatio: 0.12,
    hitWeight: 25,
    isPaired: false,
    isVital: false
  },
  {
    id: 'abdomen',
    parentLimb: 'torso',
    maxHp: 70,
    bleedRatio: 0.1,
    hitWeight: 20,
    isPaired: false,
    isVital: false
  },
  {
    id: 'heart',
    parentLimb: 'torso',
    maxHp: 20,
    bleedRatio: 0.08,
    hitWeight: 0,
    containedIn: 'chest',
    isPaired: false,
    isVital: true
  },
  {
    id: 'leftLung',
    parentLimb: 'torso',
    maxHp: 30,
    bleedRatio: 0.06,
    hitWeight: 0,
    containedIn: 'chest',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightLung',
    parentLimb: 'torso',
    maxHp: 30,
    bleedRatio: 0.06,
    hitWeight: 0,
    containedIn: 'chest',
    isPaired: true,
    isVital: false
  },
  {
    id: 'liver',
    parentLimb: 'torso',
    maxHp: 25,
    bleedRatio: 0.05,
    hitWeight: 0,
    containedIn: 'abdomen',
    isPaired: false,
    isVital: false
  },
  {
    id: 'stomach',
    parentLimb: 'torso',
    maxHp: 20,
    bleedRatio: 0.03,
    hitWeight: 0,
    containedIn: 'abdomen',
    isPaired: false,
    isVital: false
  },
  {
    id: 'leftKidney',
    parentLimb: 'torso',
    maxHp: 15,
    bleedRatio: 0.02,
    hitWeight: 0,
    containedIn: 'abdomen',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightKidney',
    parentLimb: 'torso',
    maxHp: 15,
    bleedRatio: 0.02,
    hitWeight: 0,
    containedIn: 'abdomen',
    isPaired: true,
    isVital: false
  },
  {
    id: 'spine',
    parentLimb: 'torso',
    maxHp: 40,
    bleedRatio: 0.04,
    hitWeight: 0,
    containedIn: 'chest',
    isPaired: false,
    isVital: false
  },
  // ── Left arm ──────────────────────────────────────────────────────────────
  {
    id: 'leftShoulder',
    parentLimb: 'left_arm',
    maxHp: 40,
    bleedRatio: 0.03,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftUpperArm',
    parentLimb: 'left_arm',
    maxHp: 45,
    bleedRatio: 0.05,
    hitWeight: 6,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftForearm',
    parentLimb: 'left_arm',
    maxHp: 35,
    bleedRatio: 0.04,
    hitWeight: 5,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftHand',
    parentLimb: 'left_arm',
    maxHp: 30,
    bleedRatio: 0.05,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftThumb',
    parentLimb: 'left_arm',
    maxHp: 10,
    bleedRatio: 0.005,
    hitWeight: 1,
    containedIn: 'leftHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftIndexFinger',
    parentLimb: 'left_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'leftHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftMiddleFinger',
    parentLimb: 'left_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'leftHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftRingFinger',
    parentLimb: 'left_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'leftHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftLittleFinger',
    parentLimb: 'left_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'leftHand',
    isPaired: true,
    isVital: false
  },
  // ── Right arm ─────────────────────────────────────────────────────────────
  {
    id: 'rightShoulder',
    parentLimb: 'right_arm',
    maxHp: 40,
    bleedRatio: 0.03,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightUpperArm',
    parentLimb: 'right_arm',
    maxHp: 45,
    bleedRatio: 0.05,
    hitWeight: 6,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightForearm',
    parentLimb: 'right_arm',
    maxHp: 35,
    bleedRatio: 0.04,
    hitWeight: 5,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightHand',
    parentLimb: 'right_arm',
    maxHp: 30,
    bleedRatio: 0.05,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightThumb',
    parentLimb: 'right_arm',
    maxHp: 10,
    bleedRatio: 0.005,
    hitWeight: 1,
    containedIn: 'rightHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightIndexFinger',
    parentLimb: 'right_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'rightHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightMiddleFinger',
    parentLimb: 'right_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'rightHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightRingFinger',
    parentLimb: 'right_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'rightHand',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightLittleFinger',
    parentLimb: 'right_arm',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 1,
    containedIn: 'rightHand',
    isPaired: true,
    isVital: false
  },
  // ── Left leg ──────────────────────────────────────────────────────────────
  {
    id: 'leftHip',
    parentLimb: 'left_leg',
    maxHp: 50,
    bleedRatio: 0.04,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftUpperLeg',
    parentLimb: 'left_leg',
    maxHp: 60,
    bleedRatio: 0.08,
    hitWeight: 8,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftLowerLeg',
    parentLimb: 'left_leg',
    maxHp: 50,
    bleedRatio: 0.06,
    hitWeight: 6,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftFoot',
    parentLimb: 'left_leg',
    maxHp: 30,
    bleedRatio: 0.04,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftBigToe',
    parentLimb: 'left_leg',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 0.5,
    containedIn: 'leftFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftSecondToe',
    parentLimb: 'left_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'leftFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftMiddleToe',
    parentLimb: 'left_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'leftFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftFourthToe',
    parentLimb: 'left_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'leftFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'leftLittleToe',
    parentLimb: 'left_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'leftFoot',
    isPaired: true,
    isVital: false
  },
  // ── Right leg ─────────────────────────────────────────────────────────────
  {
    id: 'rightHip',
    parentLimb: 'right_leg',
    maxHp: 50,
    bleedRatio: 0.04,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightUpperLeg',
    parentLimb: 'right_leg',
    maxHp: 60,
    bleedRatio: 0.08,
    hitWeight: 8,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightLowerLeg',
    parentLimb: 'right_leg',
    maxHp: 50,
    bleedRatio: 0.06,
    hitWeight: 6,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightFoot',
    parentLimb: 'right_leg',
    maxHp: 30,
    bleedRatio: 0.04,
    hitWeight: 3,
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightBigToe',
    parentLimb: 'right_leg',
    maxHp: 8,
    bleedRatio: 0.003,
    hitWeight: 0.5,
    containedIn: 'rightFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightSecondToe',
    parentLimb: 'right_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'rightFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightMiddleToe',
    parentLimb: 'right_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'rightFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightFourthToe',
    parentLimb: 'right_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'rightFoot',
    isPaired: true,
    isVital: false
  },
  {
    id: 'rightLittleToe',
    parentLimb: 'right_leg',
    maxHp: 6,
    bleedRatio: 0.002,
    hitWeight: 0.5,
    containedIn: 'rightFoot',
    isPaired: true,
    isVital: false
  }
];

export const PART_DEF_MAP: Partial<Record<BodyPartId, BodyPartDef>> = Object.fromEntries(
  BODY_PART_DEFS.map((d) => [d.id, d])
);

/** Only outer parts (hitWeight > 0) are selected by random roll. */
export const OUTER_PARTS = BODY_PART_DEFS.filter((d) => d.hitWeight > 0);
export const TOTAL_HIT_WEIGHT = OUTER_PARTS.reduce((s, d) => s + d.hitWeight, 0);

/** Build the default full body-part tree for a given root limb.
 *  Used when spawning pawns / mobs so every entity carries the complete anatomy. */
export function createDefaultBodyParts(limbId: LimbId): BodyPartState[] {
  return BODY_PART_DEFS.filter((d) => d.parentLimb === limbId).map((d) => ({
    id: d.id,
    health: d.maxHp,
    maxHp: d.maxHp,
    isMissing: false,
    injuries: []
  }));
}

export function rollBodyPart(): BodyPartId {
  let r = rng.random() * TOTAL_HIT_WEIGHT;
  for (const part of OUTER_PARTS) {
    r -= part.hitWeight;
    if (r <= 0) return part.id;
  }
  return OUTER_PARTS[OUTER_PARTS.length - 1].id;
}
