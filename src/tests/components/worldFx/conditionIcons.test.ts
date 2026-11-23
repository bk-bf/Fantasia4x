import { describe, expect, it } from 'vitest';
import { iconConditions, iconFor } from '$lib/components/UI/canvas/worldFx/conditionIcons';
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
});
