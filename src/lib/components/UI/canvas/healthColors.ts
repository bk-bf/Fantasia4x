const NEG = 'var(--neg)';
const HI = 'var(--accent-hi)';
const DIM = 'var(--text-dim)';
const POS = 'var(--pos)';
const DEAD = '#2a1808';
const GONE = '#661010';

export function healthPctColor(pct: number, opts?: { missing?: boolean; alive?: boolean }): string {
  if (opts?.alive === false) return DEAD;
  if (opts?.missing || pct <= 0) return GONE;
  if (pct < 25) return NEG;
  if (pct < 50) return HI;
  if (pct < 75) return DIM;
  return POS;
}

export function bloodColor(v: number): string {
  if (v >= 80) return POS;
  if (v >= 60) return DIM;
  if (v >= 40) return HI;
  return NEG;
}

export function painColor(v: number): string {
  if (v >= 80) return NEG;
  if (v >= 55) return HI;
  if (v >= 30) return DIM;
  return POS;
}
