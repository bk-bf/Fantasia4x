import type { Mob, LimbState } from '$lib/game/core/types';
import { limbLabel, limbName } from '$lib/components/util/bodyLabels';

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

const PAIRINGS = [
  ['left', 'right'],
  ['front', 'hind']
];

interface LimbGroup {
  key: string;
  size: number;
  plural: boolean;
}

const strip = (key: string, words: string[]) =>
  key
    .split('_')
    .filter((w) => !words.includes(w))
    .join('_');

function mergePairs(groups: LimbGroup[], body: string[], words: string[]): LimbGroup[] {
  const total = new Map<string, number>();
  for (const id of body) {
    const k = strip(id, words);
    total.set(k, (total.get(k) ?? 0) + 1);
  }
  const merged = new Map<string, LimbGroup[]>();
  for (const g of groups) {
    const k = strip(g.key, words);
    merged.set(k, [...(merged.get(k) ?? []), g]);
  }
  return [...merged].flatMap(([k, members]) => {
    const size = members.reduce((s, m) => s + m.size, 0);
    return size > 1 && size === total.get(k) ? [{ key: k, size, plural: true }] : members;
  });
}

export function wholeLimbsLine(limbs: LimbState[], hurt: Set<string>): string | null {
  const body = limbs.map((l) => l.id);
  let groups: LimbGroup[] = body
    .filter((id) => !hurt.has(id))
    .map((key) => ({ key, size: 1, plural: false }));
  if (groups.length === 0) return null;
  const seen: string[] = [];
  for (const words of PAIRINGS) {
    seen.push(...words);
    groups = mergePairs(groups, body, seen);
  }
  const names = groups.map((g) => limbName(g.key) + (g.plural ? 's' : ''));
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const many = names.length > 1 || groups[0].plural || names[0].endsWith('s');
  return `${list[0].toUpperCase()}${list.slice(1)} ${many ? 'are' : 'is'} whole.`;
}
