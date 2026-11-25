import { describe, expect, it } from 'vitest';
import { RightPress, releaseClicks } from '$lib/components/UI/canvas/rightPress';

type Step = 'down-aim' | 'down' | 'menu' | 'up';

function play(steps: Step[]): boolean[] {
  const r = new RightPress();
  const menus: boolean[] = [];
  for (const s of steps) {
    if (s === 'down-aim') {
      r.down();
      r.aim();
    } else if (s === 'down') r.down();
    else if (s === 'menu') menus.push(!r.swallowsMenu());
  }
  return menus;
}

describe('right-click with drafted pawns', () => {
  it('attacks on the click after a move when the menu fires on mouse down', () => {
    expect(play(['down-aim', 'menu', 'up', 'down', 'menu', 'up'])).toEqual([false, true]);
  });

  it('attacks on the click after a move when the menu fires after mouse up', () => {
    expect(play(['down-aim', 'up', 'menu', 'down', 'up', 'menu'])).toEqual([false, true]);
  });

  it('attacks on every click when no move came before', () => {
    expect(play(['down', 'menu', 'up', 'down', 'menu', 'up'])).toEqual([true, true]);
  });

  it('selects on a left release only, so a right-click leaves the drafted pawns selected', () => {
    expect([0, 1, 2].map(releaseClicks)).toEqual([true, false, false]);
  });
});
