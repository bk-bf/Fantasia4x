// Human-readable labels for body limb/part IDS. The raw ids (limbmap.jsonc keys — `front_right_leg`,
// `frontRightUpperLeg`, `tail`…) are BACKEND REFERENCE ONLY and must never reach the UI. Every screen
// that shows anatomy routes through here so a new body plan can't leak snake_case/camelCase ids into a
// panel. See AGENTS.md "Never leak ids in the UI".

/** snake_case OR camelCase id → "Title Case Words" (handles both delimiters + acronym-free ids). */
function humanize(id: string): string {
  return id
    .replace(/_/g, ' ') // snake_case → spaces
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase → spaces
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
