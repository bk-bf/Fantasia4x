import { describe, it, expect, afterEach } from 'vitest';
import { cameraViewport, cameraTileSize } from '$lib/stores/cameraView';
import { creatureCallMix, type CallingMob } from '$lib/audio/creatureCalls';

const colony = [{ x: 50, y: 50 }];
const wolf = (x: number, y: number): CallingMob => ({
  x,
  y,
  state: 'Wander',
  creatureId: 'wolf'
});
const deer = (x: number, y: number): CallingMob => ({
  x,
  y,
  state: 'Wander',
  creatureId: 'deer'
});

function mixWithCamera(
  mobs: CallingMob[],
  vp: { x: number; y: number; w: number; h: number },
  tile: number
): Map<string, number> {
  cameraViewport.set(vp);
  cameraTileSize.set(tile);
  return creatureCallMix(mobs, colony);
}

afterEach(() => {
  cameraViewport.set({ x: 0, y: 0, w: 0, h: 0 });
  cameraTileSize.set(8);
});

describe('creature calls come from the colony surroundings, not the camera', () => {
  const mobs = [wolf(52, 51), wolf(55, 48), deer(70, 60)];

  it('gives the same mix wherever the camera looks and however far it is zoomed', () => {
    const onColonyZoomedIn = mixWithCamera(mobs, { x: 40, y: 40, w: 30, h: 20 }, 40);
    const awayZoomedOut = mixWithCamera(mobs, { x: 300, y: 300, w: 120, h: 80 }, 8);
    const noViewport = mixWithCamera(mobs, { x: 0, y: 0, w: 0, h: 0 }, 8);
    expect(onColonyZoomedIn.size).toBe(2);
    expect(awayZoomedOut).toEqual(onColonyZoomedIn);
    expect(noViewport).toEqual(onColonyZoomedIn);
  });

  it('hears a creature beside a pawn at full level while the camera looks away', () => {
    const mix = mixWithCamera([wolf(52, 51)], { x: 300, y: 300, w: 120, h: 80 }, 8);
    expect(mix.get('canine')).toBe(0);
  });

  it('does not hear a creature far from every pawn even when the camera is on it', () => {
    const mix = mixWithCamera([wolf(200, 200)], { x: 180, y: 180, w: 40, h: 40 }, 40);
    expect(mix.size).toBe(0);
  });

  it('quietens a creature with distance from the nearest pawn', () => {
    const near = creatureCallMix([wolf(55, 50)], colony).get('canine') ?? 1;
    const mid = creatureCallMix([wolf(75, 50)], colony).get('canine') ?? 1;
    const edge = creatureCallMix([wolf(89, 50)], colony).get('canine') ?? 1;
    expect(1 - near).toBeGreaterThan(1 - mid);
    expect(1 - mid).toBeGreaterThan(1 - edge);
    expect(1 - edge).toBeGreaterThan(0);
  });

  it('keeps sleeping and dead creatures silent', () => {
    const quiet: CallingMob[] = [
      { ...wolf(51, 50), state: 'Sleeping' },
      { ...wolf(51, 50), state: 'Collapsed' },
      { ...wolf(51, 50), state: 'Corpse' }
    ];
    expect(creatureCallMix(quiet, colony).size).toBe(0);
  });

  it('is silent with no pawns to hear anything', () => {
    expect(creatureCallMix([wolf(51, 50)], []).size).toBe(0);
  });
});
