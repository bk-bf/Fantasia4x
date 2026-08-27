function humanize(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SHORT_LIMB: Record<string, string> = {
  head: 'Head',
  torso: 'Torso',
  left_arm: 'L.Arm',
  right_arm: 'R.Arm',
  left_leg: 'L.Leg',
  right_leg: 'R.Leg'
};

export function limbLabel(id: string): string {
  return SHORT_LIMB[id] ?? humanize(id);
}

export function partLabel(id: string): string {
  return humanize(id);
}
