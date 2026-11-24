export const POSE_PAD = 2;
export const POSE_RANGE = 3;
const POSE_BASE = 8;
const POSE_ZERO = 4;

const clampPose = (v: number) => Math.max(-POSE_RANGE, Math.min(POSE_RANGE, Math.round(v)));

export function poseSway(lean: number, squash: number, pitch = 0): number {
  const high = (clampPose(pitch) + POSE_ZERO) * POSE_BASE + clampPose(lean) + POSE_ZERO;
  return -(1 + high * POSE_BASE + (clampPose(squash) + POSE_ZERO));
}

export function isPosed(
  lean: number | undefined,
  squash: number | undefined,
  pitch: number | undefined
): boolean {
  return !!lean || !!squash || !!pitch;
}
