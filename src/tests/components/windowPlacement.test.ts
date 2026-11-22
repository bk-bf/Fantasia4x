import { describe, expect, it } from 'vitest';
import {
  centreWindow,
  dragTo,
  placeWindow,
  resizeTo,
  type Area
} from '$lib/components/UI/window/windowPlacement';

const area: Area = { left: 180, right: 220, top: 84, width: 1440, height: 900 };

describe('window placement', () => {
  it('puts the first window at the top left of the free map', () => {
    expect(placeWindow([], 400, 300, area)).toEqual({ x: 188, y: 84 });
  });

  it('places a second window beside the first without overlap', () => {
    const p = placeWindow([{ x: 188, y: 84, w: 400, h: 300 }], 300, 300, area);
    expect(p).toEqual({ x: 596, y: 84 });
  });

  it('stacks below when there is no room beside', () => {
    const p = placeWindow([{ x: 188, y: 84, w: 900, h: 300 }], 400, 300, area);
    expect(p).toEqual({ x: 188, y: 392 });
  });

  it('centres a window wider than the free map', () => {
    expect(placeWindow([], 1180, 500, area).x).toBe(130);
  });

  it('centres a modal over the screen', () => {
    expect(centreWindow(280, 220, area)).toEqual({ x: 580, y: 283 });
  });

  it('keeps a dragged window reachable', () => {
    expect(dragTo({ x: -900, y: -50 }, 400, area)).toEqual({ x: -360, y: 0 });
    expect(dragTo({ x: 5000, y: 5000 }, 400, area)).toEqual({ x: 1400, y: 872 });
  });

  it('resizes a window within the screen and above a floor', () => {
    expect(resizeTo({ x: 200, y: 100 }, 500.4, 320.6, area)).toEqual({ w: 500, h: 321 });
    expect(resizeTo({ x: 200, y: 100 }, 20, 10, area)).toEqual({ w: 260, h: 160 });
    expect(resizeTo({ x: 200, y: 100 }, 5000, 5000, area)).toEqual({ w: 1234, h: 794 });
  });
});
