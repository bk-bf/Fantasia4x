import { describe, it, expect } from 'vitest';
import { tileFragmentSource } from '$lib/webgl/shaders';

describe('tile fragment shader source', () => {
  for (const painted of [false, true]) {
    it(`splices the rock surface and tree parts in with painted ${painted}`, () => {
      const source = tileFragmentSource(painted);
      expect(source).not.toContain('#define ROCK_SURFACE_CODE');
      expect(source).not.toContain('#define TREE_PARTS_CODE');
      expect(source).toMatch(/bool snowLies\(/);
      expect(source).toMatch(/float roofWobble\(/);
    });
  }

  it('defines PAINTED only on the painted path', () => {
    expect(tileFragmentSource(false)).not.toContain('#define PAINTED');
    expect(tileFragmentSource(true)).toContain('#define PAINTED');
  });
});
