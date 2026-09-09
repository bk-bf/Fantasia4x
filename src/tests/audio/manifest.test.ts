import { describe, it, expect } from 'vitest';
import { resolveAmbient, COMBAT_SFX } from '$lib/audio/manifest';
import itemsData from '$lib/game/database/items/items.json';
import conditionsData from '$lib/game/database/pawns/conditions.json';

function combatAudioIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of itemsData as Array<{ audio?: string }>) {
    if (item.audio) ids.add(item.audio);
  }
  for (const condition of conditionsData as Array<{ audio?: string }>) {
    if (condition.audio) ids.add(condition.audio);
  }
  return ids;
}

describe('COMBAT_SFX covers every combat audio id in the data', () => {
  it('has an entry for every item and condition `audio` id', () => {
    const missing = [...combatAudioIds()].filter((id) => !(id in COMBAT_SFX));
    expect(missing).toEqual([]);
  });
});

describe('resolveAmbient calm fallback', () => {
  it('sets a resting forest bed for windy daytime weather with no other calm rule', () => {
    const layers = resolveAmbient({ weatherType: 'gale', isNight: false, intensity: 0 });
    expect(layers.forest).toBe(0.15);
  });

  it('takes the night-crickets branch instead of the fallback when it is night', () => {
    const layers = resolveAmbient({ weatherType: 'gale', isNight: true, intensity: 0 });
    expect(layers['night-crickets']).toBe(0.45);
    expect(layers.forest).toBeUndefined();
  });

  it('gives clear daytime weather birds and forest, not the fallback', () => {
    const layers = resolveAmbient({ weatherType: 'clear', isNight: false, intensity: 0 });
    expect(layers['birds-day']).toBe(0.4);
    expect(layers.forest).toBe(0.2);
  });
});
