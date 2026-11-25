import { describe, it, expect } from 'vitest';
import { sizeFromHeight } from '$lib/game/core/rules/body/size';

describe('body size from height', () => {
  it('each size band starts at its cut height', () => {
    expect(sizeFromHeight(119)).toBe('tiny');
    expect(sizeFromHeight(120)).toBe('small');
    expect(sizeFromHeight(149)).toBe('small');
    expect(sizeFromHeight(150)).toBe('medium');
    expect(sizeFromHeight(189)).toBe('medium');
    expect(sizeFromHeight(190)).toBe('large');
    expect(sizeFromHeight(229)).toBe('large');
    expect(sizeFromHeight(230)).toBe('huge');
  });
});
