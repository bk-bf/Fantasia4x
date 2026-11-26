import { describe, expect, it } from 'vitest';
import { Webgl2Device } from '../../lib/gpu/webgl2/device.js';
import {
  ALPHA_BLEND,
  BufferUsage,
  type RenderPipelineDescriptor,
  type VertexBufferLayout
} from '../../lib/gpu/device.js';

const GL = {
  BLEND: 0x0be2,
  DEPTH_TEST: 0x0b71,
  TRIANGLES: 4,
  TRIANGLE_STRIP: 5,
  FLOAT: 0x1406,
  ARRAY_BUFFER: 0x8892,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  LEQUAL: 0x0203,
  ALWAYS: 0x0207,
  LINK_STATUS: 0x8b82
};

function recording() {
  const calls: unknown[][] = [];
  let made = 0;
  const gl = new Proxy(GL, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'getProgramParameter') return args[1] === GL.LINK_STATUS ? true : 0;
        if (key === 'getContextAttributes') return { depth: true };
        return { id: ++made };
      };
    }
  });
  return { gpu: new Webgl2Device(gl as unknown as WebGL2RenderingContext), calls };
}

const layout: VertexBufferLayout = {
  arrayStride: 8,
  stepMode: 'vertex',
  attributes: [{ shaderLocation: 0, format: 'float32x2', offset: 0 }]
};

const pipeline = (over: Partial<RenderPipelineDescriptor> = {}): RenderPipelineDescriptor => ({
  label: 'p',
  glsl: { vertex: 'v', fragment: 'f', attributes: { a_position: 0 } },
  vertex: { buffers: [layout] },
  primitive: { topology: 'triangle-list' },
  fragment: { targets: [{ format: 'rgba8unorm' }] },
  ...over
});

function made(gpu: Webgl2Device, desc: RenderPipelineDescriptor) {
  const result = gpu.createRenderPipeline(desc);
  if (!result.ok) throw new Error(result.error);
  return result.pipeline;
}

describe('webgl2 pipelines', () => {
  it('links one program for pipelines that share their shaders, with the attribute locations bound first', () => {
    const { gpu, calls } = recording();
    made(gpu, pipeline());
    made(gpu, pipeline({ fragment: { targets: [{ format: 'rgba8unorm', blend: ALPHA_BLEND }] } }));
    expect(calls.filter((c) => c[0] === 'linkProgram')).toHaveLength(1);
    const names = calls.map((c) => c[0]);
    expect(names.indexOf('bindAttribLocation')).toBeLessThan(names.indexOf('linkProgram'));
    expect(calls.find((c) => c[0] === 'bindAttribLocation')?.slice(2)).toEqual([0, 'a_position']);
  });

  it('changes only the state that differs from the pipeline before it', () => {
    const { gpu, calls } = recording();
    const opaque = made(gpu, pipeline());
    const blended = made(
      gpu,
      pipeline({
        fragment: { targets: [{ format: 'rgba8unorm', blend: ALPHA_BLEND }] },
        depthStencil: { format: 'depth24plus', depthCompare: 'less-equal', depthWriteEnabled: true }
      })
    );
    calls.length = 0;
    gpu.setPipeline(opaque);
    gpu.setPipeline(blended);
    gpu.setPipeline(blended);
    gpu.setPipeline(opaque);
    expect(calls.filter((c) => c[0] !== 'useProgram')).toEqual([
      ['disable', GL.BLEND],
      ['disable', GL.DEPTH_TEST],
      ['enable', GL.BLEND],
      [
        'blendFuncSeparate',
        GL.SRC_ALPHA,
        GL.ONE_MINUS_SRC_ALPHA,
        GL.SRC_ALPHA,
        GL.ONE_MINUS_SRC_ALPHA
      ],
      ['enable', GL.DEPTH_TEST],
      ['depthFunc', GL.LEQUAL],
      ['depthMask', true],
      ['disable', GL.BLEND],
      ['disable', GL.DEPTH_TEST]
    ]);
    expect(calls.filter((c) => c[0] === 'useProgram')).toHaveLength(1);
  });

  it('builds one vertex array per buffer and offset, and drops it with its buffer', () => {
    const { gpu, calls } = recording();
    const p = made(gpu, pipeline());
    const a = gpu.createBuffer({ size: 64, usage: BufferUsage.VERTEX });
    const b = gpu.createBuffer({ size: 64, usage: BufferUsage.VERTEX });
    calls.length = 0;
    gpu.setPipeline(p);
    for (const buffer of [a, b, a]) {
      gpu.setVertexBuffer(0, buffer);
      gpu.draw(6);
    }
    gpu.setVertexBuffer(0, a, 16);
    gpu.draw(6);
    expect(calls.filter((c) => c[0] === 'createVertexArray')).toHaveLength(3);
    expect(calls.filter((c) => c[0] === 'vertexAttribPointer').map((c) => c[6])).toEqual([
      0, 0, 16
    ]);
    expect(calls.filter((c) => c[0] === 'drawArrays')).toEqual(
      Array(4).fill(['drawArrays', GL.TRIANGLES, 0, 6])
    );
    gpu.destroyBuffer(a);
    expect(calls.filter((c) => c[0] === 'deleteVertexArray')).toHaveLength(2);
  });

  it('draws instanced only when given an instance count, and refuses a base instance', () => {
    const { gpu, calls } = recording();
    const p = made(
      gpu,
      pipeline({ vertex: { buffers: [] }, primitive: { topology: 'triangle-strip' } })
    );
    gpu.setPipeline(p);
    gpu.draw(4, 9);
    expect(calls.at(-1)).toEqual(['drawArraysInstanced', GL.TRIANGLE_STRIP, 0, 4, 9]);
    expect(() => gpu.draw(4, 1, 0, 2)).toThrow(/base instance/);
  });
});
