import type { Mob, LimbState } from '$lib/game/core/types';
import { limbLabel } from '$lib/components/util/bodyLabels';

export function bloodPct(m: Mob): number {
  if (!m.maxBloodVolume || m.maxBloodVolume <= 0) return 100;
  return Math.round(((m.bloodVolume ?? m.maxBloodVolume) / m.maxBloodVolume) * 100);
}

export function painPct(m: Mob): number {
  if (!m.maxHealth || m.maxHealth <= 0) return 0;
  return Math.round(((m.maxHealth - m.health) / m.maxHealth) * 100);
}

export function worstLimb(m: Mob): { name: string; health: number } | null {
  if (!m.limbs || m.limbs.length === 0) return null;
  let worst: LimbState | null = null;
  for (const l of m.limbs) {
    if (l.isMissing) return { name: limbLabel(l.id), health: 0 };
    if (!worst || l.health < worst.health) worst = l;
  }
  return worst ? { name: limbLabel(worst.id), health: worst.health } : null;
}

export function bloodTone(v: number): string {
  if (v >= 80) return 'var(--pos)';
  if (v >= 60) return 'var(--text-dim)';
  if (v >= 40) return 'var(--accent-hi)';
  return 'var(--neg)';
}

export function healthTone(h: number): string {
  if (h < 25) return 'var(--neg)';
  if (h < 50) return 'var(--accent-hi)';
  if (h < 75) return 'var(--text-dim)';
  return 'var(--pos)';
}

export function painTone(v: number): string {
  if (v >= 80) return 'var(--neg)';
  if (v >= 55) return 'var(--accent-hi)';
  if (v >= 30) return 'var(--text-dim)';
  return 'var(--pos)';
}
