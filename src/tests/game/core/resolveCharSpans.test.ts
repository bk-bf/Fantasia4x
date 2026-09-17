import { describe, it, expect, vi } from 'vitest';
import { resolveCharSpans } from '$lib/game/core/defs/terrains';

describe('resolveCharSpans', () => {
  it('expands a from/to sheet range into ascending code points', () => {
    const chars = resolveCharSpans([{ sheet: 'plants', from: 3, to: 6 }]);
    expect(chars).toEqual([
      String.fromCodePoint(0xe003),
      String.fromCodePoint(0xe004),
      String.fromCodePoint(0xe005),
      String.fromCodePoint(0xe006)
    ]);
  });

  it('falls back to ? and warns on an unknown sheet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chars = resolveCharSpans([{ sheet: 'stars' as never, id: 1 }]);
    expect(chars).toEqual(['?']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('prefers a literal over id and sheet', () => {
    const chars = resolveCharSpans([{ literal: '#', sheet: 'stars' as never, id: 1 }]);
    expect(chars).toEqual(['#']);
  });

  it('yields an empty array for a span with no literal, id, from or to', () => {
    const chars = resolveCharSpans([{ sheet: 'plants' }]);
    expect(chars).toEqual([]);
  });
});
