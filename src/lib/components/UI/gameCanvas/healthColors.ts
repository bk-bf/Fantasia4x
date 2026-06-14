// Shared threshold colour-coding for body health, so the HEALTH HUD pop-up matches the Pawns/
// Entities tab body maps exactly (PawnHealth.svelte). Returns global CSS custom properties.
const NEG = 'var(--neg)';
const HI = 'var(--accent-hi)';
const DIM = 'var(--text-dim)';
const POS = 'var(--pos)';
const DEAD = '#2a1808';
const GONE = '#661010';

/**
 * Limb / sub-part health as a 0–100 percentage → colour. A missing part (or 0 HP) is dark red; a
 * dead entity greys out entirely. Thresholds mirror PawnHealth's limb/part maps.
 */
export function healthPctColor(pct: number, opts?: { missing?: boolean; alive?: boolean }): string {
  if (opts?.alive === false) return DEAD;
  if (opts?.missing || pct <= 0) return GONE;
  if (pct < 25) return NEG;
  if (pct < 50) return HI;
  if (pct < 75) return DIM;
  return POS;
}

/** Blood volume 0–100% → colour (high is good). Mirrors PawnHealth.bloodColor. */
export function bloodColor(v: number): string {
  if (v >= 80) return POS;
  if (v >= 60) return DIM;
  if (v >= 40) return HI;
  return NEG;
}

/** Pain 0–100 → colour (high is bad). Mirrors PawnHealth.painColor. */
export function painColor(v: number): string {
  if (v >= 80) return NEG;
  if (v >= 55) return HI;
  if (v >= 30) return DIM;
  return POS;
}
