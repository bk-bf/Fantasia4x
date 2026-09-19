import { describe, it, expect } from 'vitest';
import { manhattan, chebyshev, euclideanSq, euclidean } from '$lib/game/core/util/distance';

describe('distance metrics', () => {
  it('chebyshev takes the max axis delta, not the sum (diagonal costs 1, not 2)', () => {
    expect(chebyshev(0, 0, 3, 4)).toBe(4);
    expect(chebyshev(0, 0, 1, 1)).toBe(1);
    expect(chebyshev(2, 5, 2, 5)).toBe(0);
    expect(chebyshev(0, 0, 3, 4)).not.toBe(manhattan(0, 0, 3, 4));
  });

  it('manhattan sums both axis deltas (diagonal costs 2)', () => {
    expect(manhattan(0, 0, 3, 4)).toBe(7);
    expect(manhattan(0, 0, 1, 1)).toBe(2);
    expect(manhattan(2, 5, 2, 5)).toBe(0);
  });

  it('euclideanSq and euclidean agree with the Pythagorean length on a diagonal', () => {
    expect(euclideanSq(0, 0, 3, 4)).toBe(25);
    expect(euclidean(0, 0, 3, 4)).toBe(5);
    expect(euclidean(0, 0, 1, 1)).toBeCloseTo(Math.SQRT2, 10);
  });

  it('every metric is symmetric in its two points', () => {
    expect(chebyshev(1, 7, 4, 2)).toBe(chebyshev(4, 2, 1, 7));
    expect(manhattan(1, 7, 4, 2)).toBe(manhattan(4, 2, 1, 7));
    expect(euclidean(1, 7, 4, 2)).toBe(euclidean(4, 2, 1, 7));
  });
});
