import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  conditionIcon,
  iconConditions,
  iconFor,
  iconWords
} from '$lib/components/UI/canvas/worldFx/conditionIcons';
import { icon } from '$lib/pixelArt/fx/icons';
import conditions from '$lib/game/database/pawns/conditions.json';
import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';

interface Def {
  id?: string;
  floater?: boolean;
}

const floaterIds = (o: unknown): string[] =>
  Array.isArray(o)
    ? o.flatMap(floaterIds)
    : o && typeof o === 'object'
      ? [
          ...((o as Def).floater && (o as Def).id ? [(o as Def).id as string] : []),
          ...Object.values(o).flatMap(floaterIds)
        ]
      : [];

const event = (over: Partial<CombatTextEvent>): CombatTextEvent => ({
  id: 1,
  spawnTime: 0,
  until: 1,
  worldX: 0,
  worldY: 0,
  text: '',
  kind: 'condition',
  ...over
});

describe('condition icons', () => {
  it('gives every condition that raises a floater an icon', () => {
    const ids = floaterIds(conditions);
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => !iconConditions().includes(id))).toEqual([]);
  });

  it('draws every icon, with and without its mark', () => {
    for (const id of iconConditions()) {
      const found = iconFor(event({ conditionId: `${id}:moderate` }))!;
      const [s] = icon(found.id, found.mark);
      expect(s.c.some(Boolean)).toBe(true);
    }
  });

  it('gives the organ and fracture hits an icon', () => {
    expect(iconFor(event({ kind: 'fracture', text: 'Organ hit!' }))?.id).toBe('organ');
    expect(iconFor(event({ kind: 'fracture', text: 'Fractured!' }))?.id).toBe('fractured');
  });

  it('gives every word the sim floats in combat an icon, and crits too', () => {
    const src = readFileSync('src/lib/game/systems/Combat.ts', 'utf8');
    const emitted = [...src.matchAll(/emitFloat\([^;]*?'(\w+)',\s*'([^'$]+)'/g)].map((m) => ({
      kind: m[1],
      text: m[2]
    }));
    const pushed = [...src.matchAll(/text: '([^']+)',\s*kind: '(\w+)'/g)].map((m) => ({
      kind: m[2],
      text: m[1]
    }));
    const words = [...emitted, ...pushed];
    expect(words.map((w) => w.text).sort()).toEqual([...iconWords()].sort());
    for (const w of words)
      expect(
        iconFor(event({ kind: w.kind as CombatTextEvent['kind'], text: w.text }))
      ).toBeDefined();
    expect(iconFor(event({ kind: 'crit', text: '-12!' }))).toBeDefined();
    for (const w of iconWords())
      expect(icon(iconFor(event({ kind: 'dodge', text: w }))!.id)[0].w).toBeGreaterThan(4);
  });

  it('gives every condition a pawn can show an icon, so no pill falls back to a glyph', () => {
    const shown = (conditions as { id: string; hidden?: boolean }[]).filter((c) => !c.hidden);
    expect(shown.length).toBeGreaterThan(100);
    expect(shown.filter((c) => !conditionIcon(c.id)).map((c) => c.id)).toEqual([]);
    for (const c of shown) {
      const look = conditionIcon(c.id)!;
      expect(icon(look.id, look.mark)[0].w).toBeGreaterThan(4);
    }
  });
});
