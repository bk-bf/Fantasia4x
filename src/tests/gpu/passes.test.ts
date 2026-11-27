import { describe, expect, it } from 'vitest';
import { Webgl2Device } from '../../lib/gpu/webgl2/device.js';
import { TextureUsage, type LoadOp, type StoreOp } from '../../lib/gpu/device.js';

const GL = {
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x0100,
  STENCIL_BUFFER_BIT: 0x0400,
  FRAMEBUFFER: 0x8d40,
  COLOR_ATTACHMENT0: 0x8ce0,
  COLOR: 0x1800,
  DEPTH: 0x1801,
  STENCIL: 0x1802,
  TEXTURE_2D: 0x0de1,
  RGBA8: 0x8058,
  drawingBufferWidth: 320,
  drawingBufferHeight: 200
};

function recording(depth = true, stencil = false) {
  const calls: unknown[][] = [];
  let made = 0;
  const gl = new Proxy(GL, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'getContextAttributes') return { depth, stencil };
        if (key === 'getParameter') return 16;
        return { id: ++made };
      };
    }
  });
  const gpu = new Webgl2Device(gl as unknown as WebGL2RenderingContext);
  return { gpu, calls };
}

function canvasPass(
  gpu: Webgl2Device,
  color: LoadOp,
  depth: LoadOp | null,
  depthStore: StoreOp = 'store'
) {
  const depthView = gpu.canvas.getDepthTexture();
  return gpu.createCommandEncoder().beginRenderPass({
    colorAttachments: [
      {
        view: gpu.canvas.getCurrentTexture(),
        loadOp: color,
        storeOp: 'store',
        clearValue: [0.25, 0.5, 0.75, 1]
      }
    ],
    ...(depth && depthView
      ? {
          depthStencilAttachment: {
            view: depthView,
            depthLoadOp: depth,
            depthStoreOp: depthStore,
            depthClearValue: 1
          }
        }
      : {})
  });
}

const clears = (calls: unknown[][]) => calls.filter((c) => c[0] === 'clear');

describe('webgl2 render passes', () => {
  it('clears colour alone when only the colour attachment loads by clearing', () => {
    const { gpu, calls } = recording();
    canvasPass(gpu, 'clear', 'load').end();
    expect(clears(calls)).toEqual([['clear', GL.COLOR_BUFFER_BIT]]);
    expect(calls).toContainEqual(['clearColor', 0.25, 0.5, 0.75, 1]);
    expect(calls.some((c) => c[0] === 'clearDepth' || c[0] === 'depthMask')).toBe(false);
  });

  it('clears depth alone, with depth writes on, when only the depth attachment loads by clearing', () => {
    const { gpu, calls } = recording();
    canvasPass(gpu, 'load', 'clear').end();
    expect(clears(calls)).toEqual([['clear', GL.DEPTH_BUFFER_BIT]]);
    expect(calls).toContainEqual(['depthMask', true]);
    expect(calls.some((c) => c[0] === 'clearColor')).toBe(false);
  });

  it('clears both in one call, and nothing when both load', () => {
    const { gpu, calls } = recording();
    canvasPass(gpu, 'clear', 'clear').end();
    canvasPass(gpu, 'load', 'load').end();
    expect(clears(calls)).toEqual([['clear', GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT]]);
  });

  it('sets the clear colour and viewport only when they change', () => {
    const { gpu, calls } = recording();
    for (let i = 0; i < 3; i++) canvasPass(gpu, 'clear', 'clear').end();
    expect(calls.filter((c) => c[0] === 'clearColor')).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'viewport')).toEqual([['viewport', 0, 0, 320, 200]]);
  });

  it('invalidates the canvas depth when the pass discards it', () => {
    const { gpu, calls } = recording();
    canvasPass(gpu, 'clear', 'clear', 'discard').end();
    expect(calls.filter((c) => c[0] === 'invalidateFramebuffer')).toEqual([
      ['invalidateFramebuffer', GL.FRAMEBUFFER, [GL.DEPTH]]
    ]);
  });

  it('clears and discards the stencil with depth when the canvas has one', () => {
    const { gpu, calls } = recording(true, true);
    expect(gpu.canvas.depthFormat).toBe('depth24plus-stencil8');
    const view = gpu.canvas.getDepthTexture()!;
    const stencilPass = () =>
      gpu
        .createCommandEncoder()
        .beginRenderPass({
          colorAttachments: [
            { view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }
          ],
          depthStencilAttachment: {
            view,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
            stencilLoadOp: 'clear',
            stencilClearValue: 0,
            stencilStoreOp: 'discard'
          }
        })
        .end();
    stencilPass();
    stencilPass();
    expect(clears(calls)).toEqual([
      ['clear', GL.DEPTH_BUFFER_BIT | GL.STENCIL_BUFFER_BIT],
      ['clear', GL.DEPTH_BUFFER_BIT | GL.STENCIL_BUFFER_BIT]
    ]);
    expect(calls.filter((c) => c[0] === 'clearStencil')).toEqual([['clearStencil', 0]]);
    expect(calls.filter((c) => c[0] === 'invalidateFramebuffer')[0]).toEqual([
      'invalidateFramebuffer',
      GL.FRAMEBUFFER,
      [GL.DEPTH, GL.STENCIL]
    ]);
  });

  it('draws a texture pass into its own framebuffer, sized to the texture, and returns to the canvas', () => {
    const { gpu, calls } = recording();
    const field = gpu.createTexture({
      format: 'rgba8unorm',
      width: 64,
      height: 32,
      usage: TextureUsage.TEXTURE_BINDING | TextureUsage.RENDER_ATTACHMENT
    });
    calls.length = 0;
    const encoder = gpu.createCommandEncoder();
    encoder
      .beginRenderPass({ colorAttachments: [{ view: field, loadOp: 'load', storeOp: 'store' }] })
      .end();
    encoder
      .beginRenderPass({
        colorAttachments: [
          { view: gpu.canvas.getCurrentTexture(), loadOp: 'clear', storeOp: 'store' }
        ]
      })
      .end();
    const binds = calls.filter((c) => c[0] === 'bindFramebuffer');
    expect(binds).toHaveLength(2);
    expect(binds[1]).toEqual(['bindFramebuffer', GL.FRAMEBUFFER, null]);
    expect(calls).toContainEqual(['viewport', 0, 0, 64, 32]);
    expect(clears(calls)).toEqual([['clear', GL.COLOR_BUFFER_BIT]]);
  });

  it('refuses a second open pass, a depth attachment on a texture, and a pass used after end', () => {
    const { gpu } = recording();
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
    });
    expect(() =>
      encoder.beginRenderPass({
        colorAttachments: [
          { view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }
        ]
      })
    ).toThrow(/open pass/);
    expect(() => encoder.finish()).toThrow(/still open/);
    pass.end();
    expect(() => pass.draw(3)).toThrow(/after end/);
    const field = gpu.createTexture({
      format: 'rgba8unorm',
      width: 4,
      height: 4,
      usage: TextureUsage.RENDER_ATTACHMENT
    });
    expect(() =>
      gpu.createCommandEncoder().beginRenderPass({
        colorAttachments: [{ view: field, loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: {
          view: gpu.canvas.getDepthTexture()!,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard'
        }
      })
    ).toThrow(/only the canvas/);
  });
});
