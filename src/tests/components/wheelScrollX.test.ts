import { describe, expect, it, vi } from 'vitest';
import { wheelScrollX } from '$lib/actions/wheelScrollX';

type Listener = (e: WheelEvent) => void;

function strip(scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  let listener: Listener | null = null;
  const node = {
    scrollWidth,
    clientWidth,
    scrollLeft,
    addEventListener: (_: string, fn: Listener) => (listener = fn),
    removeEventListener: () => (listener = null)
  } as unknown as HTMLElement;
  const stop = wheelScrollX(node);
  const wheel = (deltaY: number, more: Partial<WheelEvent> = {}) => {
    const preventDefault = vi.fn();
    listener?.({
      deltaX: 0,
      deltaY,
      deltaMode: 0,
      ctrlKey: false,
      target: node,
      preventDefault,
      ...more
    } as unknown as WheelEvent);
    return preventDefault;
  };
  return { node, wheel, stop, attached: () => listener !== null };
}

describe('wheel on a horizontal strip', () => {
  it('turns a vertical wheel into a sideways scroll', () => {
    const s = strip(1000, 400);
    const prevent = s.wheel(120);
    expect(s.node.scrollLeft).toBe(120);
    expect(prevent).toHaveBeenCalled();
  });

  it('stops at either end and lets the page have the wheel', () => {
    const s = strip(1000, 400, 590);
    s.wheel(120);
    expect(s.node.scrollLeft).toBe(600);
    expect(s.wheel(120)).not.toHaveBeenCalled();
    s.node.scrollLeft = 0;
    expect(s.wheel(-120)).not.toHaveBeenCalled();
  });

  it('scales line-mode deltas', () => {
    const s = strip(1000, 400);
    s.wheel(3, { deltaMode: 1 });
    expect(s.node.scrollLeft).toBe(48);
  });

  it('leaves a strip that fits, a sideways wheel and a zoom alone', () => {
    expect(strip(400, 400).wheel(120)).not.toHaveBeenCalled();
    const s = strip(1000, 400);
    expect(s.wheel(10, { deltaX: 40 })).not.toHaveBeenCalled();
    expect(s.wheel(120, { ctrlKey: true })).not.toHaveBeenCalled();
    expect(s.node.scrollLeft).toBe(0);
  });

  it('detaches its listener', () => {
    const s = strip(1000, 400);
    s.stop();
    expect(s.attached()).toBe(false);
  });
});
