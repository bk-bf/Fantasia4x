import { describe, it, expect } from 'vitest';
import { buildingLight, lightingService, FIRE_INTENSITY } from '$lib/game/services/LightingService';
import { computeTileLightLevel } from '$lib/game/services/EnvironmentService';

// Light is data-driven: any building with a `lightRadius` in buildings.jsonc emits, fuelled ones
// only while lit. The hearth used to be dark (only `campfire` was hardcoded); now it throws light.

const fire = (type: string, lit: boolean, x = 0, y = 0) =>
  ({ id: `${type}-${x}-${y}`, type, status: 'complete', lit, x, y }) as any;

describe('data-driven building light', () => {
  it('campfire keeps its original glow (radius 6, default fire intensity)', () => {
    const light = buildingLight(fire('campfire', true));
    expect(light).not.toBeNull();
    expect(light!.radius).toBe(6);
    expect(light!.intensity).toBe(FIRE_INTENSITY);
  });

  it('the stone hearth now emits light (regression — was previously dark)', () => {
    const lit = buildingLight(fire('hearth', true));
    expect(lit).not.toBeNull();
    expect(lit!.radius).toBe(7);
    expect(lit!.intensity).toBeCloseTo(1.25, 5);
  });

  it('a fuelled fire only glows while lit', () => {
    expect(buildingLight(fire('hearth', false))).toBeNull();
    expect(buildingLight(fire('campfire', false))).toBeNull();
  });

  it('a non-light building never emits', () => {
    expect(buildingLight(fire('craft_spot', true))).toBeNull();
    expect(buildingLight(fire('branch_wall', true))).toBeNull();
  });

  it('only completed buildings emit', () => {
    expect(buildingLight({ type: 'hearth', status: 'under_construction', lit: true } as any)).toBeNull();
  });

  it('collectEmitters returns one emitter per lit light-building', () => {
    const emitters = lightingService.collectEmitters([
      fire('hearth', true, 5, 5),
      fire('campfire', false, 9, 9), // unlit → excluded
      fire('craft_spot', true, 1, 1) // no light → excluded
    ]);
    expect(emitters).toHaveLength(1);
    expect(emitters[0]).toMatchObject({ x: 5, y: 5, radius: 7 });
  });

  it('the gameplay/UI tile-light readout sees the hearth too', () => {
    const buildings = [fire('hearth', true, 10, 10)];
    const atSource = computeTileLightLevel(0, buildings, 10, 10);
    const farAway = computeTileLightLevel(0, buildings, 30, 30);
    expect(atSource).toBeGreaterThan(farAway);
  });
});
