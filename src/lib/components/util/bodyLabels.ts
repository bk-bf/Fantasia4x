// Human-readable labels for body limb/part ids. Raw ids must never reach the UI — every screen
// that shows anatomy routes through here.

/** snake_case OR camelCase id → "Title Case Words". */
function humanize(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short canonical labels for the humanoid limbs; every other plan's limb id is humanized. */
const SHORT_LIMB: Record<string, string> = {
  head: 'Head',
  torso: 'Torso',
  left_arm: 'L.Arm',
  right_arm: 'R.Arm',
  left_leg: 'L.Leg',
  right_leg: 'R.Leg'
};

/** Display label for a limb id (`left_leg` → "L.Leg", `front_right_leg` → "Front Right Leg"). */
export function limbLabel(id: string): string {
  return SHORT_LIMB[id] ?? humanize(id);
}

/** Display label for a body-part id (`frontRightUpperLeg` → "Front Right Upper Leg"). */
export function partLabel(id: string): string {
  return humanize(id);
}
