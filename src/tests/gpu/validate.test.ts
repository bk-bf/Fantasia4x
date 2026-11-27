import { describe, expect, it } from 'vitest';
import { Webgl2Device } from '../../lib/gpu/webgl2/device.js';
import { BufferUsage } from '../../lib/gpu/device.js';

function device(validate: boolean) {
  const gl = new Proxy(
    { LINK_STATUS: 0x8b82 },
    {
      get: (target, key) => {
        if (typeof key !== 'string') return undefined;
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) =>
          key === 'getProgramParameter' ? args[1] === 0x8b82 : key === 'getParameter' ? 0 : {};
      }
    }
  );
  const gpu = new Webgl2Device(gl as unknown as WebGL2RenderingContext, { validate });
  const made = gpu.createRenderPipeline({
    label: 'p',
    glsl: { vertex: 'v', fragment: 'f', attributes: { a: 0 } },
    vertex: {
      buffers: [
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 0, format: 'float32x2', offset: 0 }]
        }
      ]
    },
    primitive: { topology: 'triangle-list' },
    fragment: { targets: [{ format: 'rgba8unorm' }] }
  });
  if (!made.ok) throw new Error(made.error);
  const buffer = gpu.createBuffer({ size: 64, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  const drawn = () => {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
    });
    pass.setPipeline(made.pipeline);
    pass.setVertexBuffer(0, buffer, 16);
    pass.draw(2, undefined, 1);
    pass.end();
    return encoder;
  };
  return { gpu, buffer, drawn };
}

describe('writes after use in the same submit', () => {
  it('throws for a write over bytes a draw that is not submitted yet reads', () => {
    const { gpu, buffer, drawn } = device(true);
    drawn();
    expect(() => gpu.queue.writeBuffer(buffer, 20, new Float32Array(2))).toThrow(
      /24-40 that is not submitted/
    );
  });

  it('lets a write past the bytes the draw read through', () => {
    const { gpu, buffer, drawn } = device(true);
    drawn();
    expect(() => gpu.queue.writeBuffer(buffer, 40, new Float32Array(2))).not.toThrow();
    expect(() => gpu.queue.writeBuffer(buffer, 16, new Float32Array(2))).not.toThrow();
  });

  it('forgets what was read once the work is submitted', () => {
    const { gpu, buffer, drawn } = device(true);
    const encoder = drawn();
    gpu.queue.submit([encoder.finish()]);
    expect(() => gpu.queue.writeBuffer(buffer, 24, new Float32Array(4))).not.toThrow();
  });

  it('checks nothing with validation off', () => {
    const { gpu, buffer, drawn } = device(false);
    drawn();
    expect(() => gpu.queue.writeBuffer(buffer, 24, new Float32Array(4))).not.toThrow();
  });
});
