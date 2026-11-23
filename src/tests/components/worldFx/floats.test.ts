import { describe, expect, it } from 'vitest';
import { drawFloats, type FloaterMode } from '$lib/components/UI/canvas/worldFx/floats';
import { icon, worded } from '$lib/pixelArt/fx/icons';
import { tint, word } from '$lib/pixelArt/fx/glyphs';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { Spr } from '$lib/pixelArt/fx/spr';
import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';

const onset = (conditionId: string, text: string): CombatTextEvent => ({
  id: 1,
  spawnTime: 0,
  worldX: 4,
  worldY: 4,
  text,
  kind: 'condition',
  color: '#9575cd',
  entityId: 'p1',
  conditionId
});

function drawn(e: CombatTextEvent, mode: FloaterMode): Spr[] {
  const put: Spr[] = [];
  const p = { put: (s: Spr) => put.push(s) } as unknown as FxPainter;
  drawFloats(p, null, [e], 300, mode);
  return put;
}

describe('condition floaters', () => {
  const e = onset('winded', 'Winded');

  it('shows the icon and the word together when both are on', () => {
    expect(drawn(e, { icons: true, text: true })).toEqual([worded('winded', 'Winded', '#9575cd')[0]]);
  });

  it('shows the icon alone when the text is off', () => {
    expect(drawn(e, { icons: true, text: false })).toEqual([icon('winded')[0]]);
  });

  it('shows the word alone when the icons are off', () => {
    const text = word('Winded', tint('#9575cd'), { small: true, icon: 'pip' });
    expect(drawn(e, { icons: false, text: true })).toEqual([text[0]]);
  });

  it('shows nothing when both are off', () => {
    expect(drawn(e, { icons: false, text: false })).toEqual([]);
  });

  it('shows the word for a condition without an icon', () => {
    expect(drawn(onset('staggered', 'Staggered'), { icons: true, text: false })).toEqual([]);
    expect(drawn(onset('staggered', 'Staggered'), { icons: true, text: true })).toHaveLength(1);
  });
});
