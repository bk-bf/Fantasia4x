import { describe, expect, it } from 'vitest';
import { Webgl2VertexArrays } from '../../lib/gpu/webgl2/vertexArrays.js';
import type { Webgl2Pipeline } from '../../lib/gpu/webgl2/pipeline.js';

function recording() {
  const made: number[] = [];
  const deleted: unknown[] = [];
  const bound: unknown[] = [];
  let next = 0;
  const gl = {
    ARRAY_BUFFER: 0x8892,
    FLOAT: 0x1406,
    createVertexArray: () => {
      made.push(++next);
      return { vao: next };
    },
    bindVertexArray: (vao: unknown) => bound.push(vao),
    deleteVertexArray: (vao: unknown) => deleted.push(vao),
    bindBuffer: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    vertexAttribDivisor: () => {}
  };
  return {
    arrays: new Webgl2VertexArrays(gl as unknown as WebGL2RenderingContext),
    made,
    deleted,
    bound
  };
}

const pipelineWith = (slots: number, shaderLocation = 0) =>
  ({
    buffers: Array.from({ length: slots }, (_, i) => ({
      arrayStride: 8,
      attributes: [{ shaderLocation: shaderLocation + i, offset: 0, format: 'float32x2' }]
    }))
  }) as unknown as Webgl2Pipeline;

describe('webgl2 vertex arrays', () => {
  it('reuse one array per layout, buffer and offset, and build another when any of them changes', () => {
    const { arrays, made } = recording();
    const [a, b] = [{}, {}] as WebGLBuffer[];
    const p = pipelineWith(1);
    const sameLayout = pipelineWith(1);
    arrays.set(0, a, 0);
    arrays.bind(p);
    arrays.bind(sameLayout);
    arrays.set(0, b, 0);
    arrays.bind(p);
    arrays.set(0, a, 0);
    arrays.bind(p);
    arrays.set(0, a, 64);
    arrays.bind(p);
    arrays.set(0, a, 0);
    arrays.bind(pipelineWith(1, 3));
    expect(made).toEqual([1, 2, 3, 4]);
  });

  it('match every slot of a two-buffer layout, not only the first', () => {
    const { arrays, made } = recording();
    const [a, b, c] = [{}, {}, {}] as WebGLBuffer[];
    const p = pipelineWith(2);
    arrays.set(0, a, 0);
    arrays.set(1, b, 0);
    arrays.bind(p);
    arrays.set(1, c, 0);
    arrays.bind(p);
    arrays.set(1, b, 0);
    arrays.bind(p);
    expect(made).toEqual([1, 2]);
  });

  it('delete the arrays that read a forgotten buffer, wherever it sits, and keep the rest', () => {
    const { arrays, made, deleted } = recording();
    const [a, b, c] = [{}, {}, {}] as WebGLBuffer[];
    const two = pipelineWith(2);
    const one = pipelineWith(1);
    arrays.set(0, a, 0);
    arrays.set(1, b, 0);
    arrays.bind(two);
    arrays.set(0, c, 0);
    arrays.bind(one);
    arrays.forget(b);
    expect(deleted).toEqual([{ vao: 1 }]);
    arrays.set(0, a, 0);
    arrays.set(1, b, 0);
    arrays.bind(two);
    arrays.set(0, c, 0);
    arrays.bind(one);
    expect(made).toEqual([1, 2, 3]);
  });

  it('refuse a draw with an empty slot the layout reads', () => {
    const { arrays } = recording();
    expect(() => arrays.bind(pipelineWith(1))).toThrow(/no vertex buffer in slot 0/);
  });
});
