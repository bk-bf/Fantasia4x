import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALPHA_BLEND,
  BufferUsage,
  ShaderStage,
  TextureUsage,
  type BindGroupLayoutEntry,
  type GpuBindGroupLayout,
  type RenderPipelineDescriptor
} from '../../lib/gpu/device.js';
import { WebgpuDevice } from '../../lib/gpu/webgpu/device.js';

type Call = [string, ...unknown[]];

const LIMITS = {
  maxVertexAttributes: 16,
  maxTextureDimension2D: 8192,
  maxSampledTexturesPerShaderStage: 16,
  minUniformBufferOffsetAlignment: 256,
  maxBindGroups: 4,
  maxBindingsPerBindGroup: 8,
  maxUniformBuffersPerShaderStage: 12
};

function fake(options: { pipelines?: 'resolve' | 'reject'; limits?: Partial<typeof LIMITS> } = {}) {
  const calls: Call[] = [];
  const record =
    (name: string, made: (...a: never[]) => unknown = () => ({ name })) =>
    (...a: unknown[]) => {
      calls.push([name, ...a]);
      return (made as (...a: unknown[]) => unknown)(...a);
    };
  const texture = (desc: { width: number; height: number }) => {
    const t = {
      ...desc,
      createView: () => ({ viewOf: t }),
      destroy: () => {}
    };
    return t;
  };
  const canvasTexture = texture({ width: 64, height: 32 });
  const device = {
    limits: { ...LIMITS, ...options.limits },
    queue: {
      writeBuffer: record('writeBuffer'),
      writeTexture: record('writeTexture'),
      submit: record('submit')
    },
    createBuffer: record('createBuffer', (d: object) => ({ ...d, destroy: () => {} })),
    createTexture: record('createTexture', (d: { size: { width: number; height: number } }) =>
      texture(d.size)
    ),
    createSampler: record('createSampler', (d: object) => ({ sampler: d })),
    createBindGroupLayout: record('createBindGroupLayout', (d: object) => ({ layout: d })),
    createBindGroup: record('createBindGroup', (d: object) => ({ group: d })),
    createShaderModule: record('createShaderModule', () => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] })
    })),
    createPipelineLayout: record('createPipelineLayout', (d: object) => ({ pipelineLayout: d })),
    createRenderPipelineAsync: record('createRenderPipelineAsync', (d: object) =>
      options.pipelines === 'reject'
        ? Promise.reject(new Error('the fragment stage does not compile'))
        : Promise.resolve({ pipeline: d })
    ),
    createCommandEncoder: record('createCommandEncoder', () => ({
      beginRenderPass: record('beginRenderPass', () => ({
        setPipeline: record('setPipeline'),
        setBindGroup: record('setBindGroup'),
        setVertexBuffer: record('setVertexBuffer'),
        setStencilReference: record('setStencilReference'),
        draw: record('draw'),
        end: record('end')
      })),
      finish: record('finish', () => ({ commands: true }))
    })),
    destroy: record('destroy')
  };
  const gpu = new WebgpuDevice(
    device as unknown as GPUDevice,
    {
      canvas: { width: 64, height: 32 },
      context: () => ({ getCurrentTexture: () => canvasTexture }) as unknown as GPUCanvasContext,
      format: 'bgra8unorm',
      depthFormat: 'depth24plus-stencil8'
    },
    { validate: true }
  );
  const named = (name: string) => calls.filter((c) => c[0] === name).map((c) => c.slice(1));
  return { gpu, calls, named, canvasTexture };
}

const STAGES = ShaderStage.VERTEX | ShaderStage.FRAGMENT;

function pipelineDesc(layout: GpuBindGroupLayout[], wgsl = true): RenderPipelineDescriptor {
  return {
    label: 'p',
    layout,
    glsl: { vertex: '', fragment: '', attributes: {} },
    ...(wgsl ? { wgsl: { code: '@vertex fn vs() {} @fragment fn fs() {}' } } : {}),
    vertex: {
      buffers: [
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
        },
        {
          arrayStride: 16,
          stepMode: 'instance',
          attributes: [{ shaderLocation: 1, offset: 4, format: 'float32x4' }]
        }
      ]
    },
    primitive: { topology: 'triangle-strip' },
    fragment: { targets: [{ format: 'bgra8unorm', blend: ALPHA_BLEND }] },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthCompare: 'less-equal',
      depthWriteEnabled: true,
      stencilFront: { compare: 'not-equal', passOp: 'replace' },
      stencilBack: { compare: 'not-equal', passOp: 'replace' }
    }
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('GPUBufferUsage', { COPY_DST: 8, VERTEX: 32, UNIFORM: 64 });
  vi.stubGlobal('GPUTextureUsage', { COPY_DST: 2, TEXTURE_BINDING: 4, RENDER_ATTACHMENT: 16 });
  vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 });
});

afterEach(() => vi.unstubAllGlobals());

describe('the WebGPU device maps', () => {
  it('buffers and textures to WebGPU usage flags, buffers rounded to whole words', () => {
    const { gpu, named } = fake();
    gpu.createBuffer({ size: 6, usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST });
    gpu.createTexture({
      format: 'rgba16float',
      width: 4,
      height: 2,
      usage: TextureUsage.TEXTURE_BINDING | TextureUsage.RENDER_ATTACHMENT
    });
    expect(named('createBuffer')[0][0]).toMatchObject({ size: 8, usage: 64 | 8 });
    expect(named('createTexture')[0][0]).toMatchObject({
      format: 'rgba16float',
      size: { width: 4, height: 2 },
      usage: 4 | 16
    });
  });

  it('layout entries with their stages, dynamic offsets, sample types and sampler types', () => {
    const { gpu, named } = fake();
    gpu.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: STAGES, buffer: { hasDynamicOffset: true, minBindingSize: 32 } },
        { binding: 1, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
        { binding: 2, visibility: ShaderStage.VERTEX, sampler: { type: 'non-filtering' } }
      ]
    });
    expect((named('createBindGroupLayout')[0][0] as { entries: unknown }).entries).toEqual([
      {
        binding: 0,
        visibility: 3,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 32 }
      },
      { binding: 1, visibility: 2, texture: { sampleType: 'uint' } },
      { binding: 2, visibility: 1, sampler: { type: 'non-filtering' } }
    ]);
  });

  it('a pipeline to vs and fs of one module with its blend, stencil, topology and vertex layout', async () => {
    const { gpu, named } = fake();
    const made = gpu.createRenderPipeline(pipelineDesc([]));
    expect(made.ok).toBe(true);
    await settle();
    const desc = named('createRenderPipelineAsync')[0][0] as GPURenderPipelineDescriptor;
    expect(desc.vertex.entryPoint).toBe('vs');
    expect(desc.fragment?.entryPoint).toBe('fs');
    expect(desc.fragment?.module).toBe(desc.vertex.module);
    expect(desc.primitive).toEqual({ topology: 'triangle-strip' });
    expect(desc.vertex.buffers).toEqual([
      {
        arrayStride: 8,
        stepMode: 'vertex',
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
      },
      {
        arrayStride: 16,
        stepMode: 'instance',
        attributes: [{ shaderLocation: 1, offset: 4, format: 'float32x4' }]
      }
    ]);
    expect(desc.fragment?.targets).toEqual([
      {
        format: 'bgra8unorm',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
      }
    ]);
    const face = { compare: 'not-equal', passOp: 'replace', failOp: 'keep', depthFailOp: 'keep' };
    expect(desc.depthStencil).toEqual({
      format: 'depth24plus-stencil8',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
      stencilFront: face,
      stencilBack: face,
      stencilReadMask: 0xff,
      stencilWriteMask: 0xff
    });
  });

  it('a canvas pass to the current texture with its clear colour, and stencil kept by default', () => {
    const { gpu, named, canvasTexture } = fake();
    const pass = gpu.createCommandEncoder().beginRenderPass({
      colorAttachments: [
        {
          view: gpu.canvas.getCurrentTexture(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0.1, 0.2, 0.3, 1]
        }
      ],
      depthStencilAttachment: {
        view: gpu.canvas.getDepthTexture()!,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
        depthClearValue: 0.5
      }
    });
    pass.end();
    const desc = named('beginRenderPass')[0][0] as GPURenderPassDescriptor;
    const [color] = [...desc.colorAttachments] as GPURenderPassColorAttachment[];
    expect(color).toEqual({
      view: { viewOf: canvasTexture },
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1 }
    });
    expect(desc.depthStencilAttachment).toMatchObject({
      depthLoadOp: 'clear',
      depthStoreOp: 'discard',
      depthClearValue: 0.5,
      stencilLoadOp: 'load',
      stencilStoreOp: 'store',
      stencilClearValue: 0
    });
  });
});

function drawn(options?: Parameters<typeof fake>[0]) {
  const f = fake(options);
  const { gpu } = f;
  const slice: BindGroupLayoutEntry = {
    binding: 0,
    visibility: STAGES,
    buffer: { hasDynamicOffset: true, minBindingSize: 64 }
  };
  const layout = gpu.createBindGroupLayout({
    entries: [slice, { binding: 1, visibility: STAGES, texture: { sampleType: 'float' } }]
  });
  const uniforms = gpu.createBuffer({ size: 1024, usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST });
  const vertices = gpu.createBuffer({ size: 1024, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  const texture = gpu.createTexture({
    format: 'rgba8unorm',
    width: 2,
    height: 2,
    usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST
  });
  const group = gpu.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniforms, size: 64 } },
      { binding: 1, resource: texture }
    ]
  });
  const made = gpu.createRenderPipeline(pipelineDesc([layout]));
  if (!made.ok) throw new Error(made.error);
  const draw = () => {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
    });
    pass.setPipeline(made.pipeline);
    pass.setBindGroup(0, group, [gpu.limits().minUniformBufferOffsetAlignment]);
    pass.setVertexBuffer(0, vertices, 0);
    pass.setVertexBuffer(1, vertices, 512);
    pass.draw(4, 2);
    pass.end();
    return encoder.finish();
  };
  return { ...f, uniforms, vertices, texture, draw };
}

describe('a draw on the WebGPU device', () => {
  it('passes the dynamic offset a slice sits at, one alignment stride per slice', async () => {
    const { gpu, named, draw } = drawn();
    await settle();
    draw();
    expect(gpu.limits().minUniformBufferOffsetAlignment).toBe(256);
    expect(named('setBindGroup')[0].slice(0, 1)).toEqual([0]);
    expect(named('setBindGroup')[0][2]).toEqual([256]);
    expect(named('draw')).toEqual([[4, 2, 0, 0]]);
  });

  it('encodes nothing until the pipeline is built, and never once it failed', async () => {
    const pending = drawn();
    pending.draw();
    expect(pending.named('draw')).toEqual([]);
    expect(pending.named('setPipeline')).toEqual([]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = drawn({ pipelines: 'reject' });
    await settle();
    failed.draw();
    expect(failed.named('draw')).toEqual([]);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('the fragment stage does not compile'));
  });
});

describe('the WebGPU write-after-use validator', () => {
  it('refuses a write over a uniform slice a draw of the same submit reads', async () => {
    const { gpu, uniforms, draw } = drawn();
    await settle();
    const commands = draw();
    const words = new Float32Array(4);
    expect(() => gpu.queue.writeBuffer(uniforms, 0, words)).not.toThrow();
    expect(() => gpu.queue.writeBuffer(uniforms, 256 + 16, words)).toThrow(/read by a draw/);
    gpu.queue.submit([commands]);
    expect(() => gpu.queue.writeBuffer(uniforms, 256 + 16, words)).not.toThrow();
  });

  it('refuses a write over vertices or instances the draw reads, and a texture it samples', async () => {
    const { gpu, vertices, texture, draw } = drawn();
    await settle();
    draw();
    expect(() => gpu.queue.writeBuffer(vertices, 24, new Float32Array(2))).toThrow(/read by a draw/);
    expect(() => gpu.queue.writeBuffer(vertices, 512 + 16, new Float32Array(4))).toThrow(
      /read by a draw/
    );
    expect(() => gpu.queue.writeBuffer(vertices, 512 + 32, new Float32Array(4))).not.toThrow();
    expect(() =>
      gpu.queue.writeTexture({ texture }, new Uint8Array(16), { bytesPerRow: 8 }, {
        width: 2,
        height: 2
      })
    ).toThrow(/samples this texture/);
  });

  it('keeps reads across a second encoder until the queue submits', async () => {
    const { gpu, uniforms, draw } = drawn();
    await settle();
    draw();
    gpu.createCommandEncoder();
    expect(() => gpu.queue.writeBuffer(uniforms, 256, new Float32Array(4))).toThrow(/read by a draw/);
  });

  it('refuses a write that is not whole 4-byte words', () => {
    const { gpu, uniforms } = drawn();
    expect(() => gpu.queue.writeBuffer(uniforms, 2, new Float32Array(1))).toThrow(/4-byte/);
    expect(() => gpu.queue.writeBuffer(uniforms, 0, new Uint8Array(6))).toThrow(/4-byte/);
    expect(() => gpu.queue.writeBuffer(uniforms, 0, new Uint8Array(8), 2, 4)).not.toThrow();
  });
});

describe('the WebGPU device limits', () => {
  it('reports the binding limits of the device', () => {
    const { gpu } = fake();
    expect(gpu.limits()).toMatchObject({
      maxBindGroups: 4,
      maxBindingsPerBindGroup: 8,
      maxSampledTexturesPerShaderStage: 16,
      maxUniformBuffersPerShaderStage: 12
    });
  });

  it('refuses a binding index past the bindings per group', () => {
    const { gpu } = fake();
    expect(() =>
      gpu.createBindGroupLayout({
        entries: [{ binding: 8, visibility: STAGES, texture: { sampleType: 'float' } }]
      })
    ).toThrow(/binding 8 is past/);
    const layout = gpu.createBindGroupLayout({ entries: [] });
    const texture = gpu.createTexture({
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      usage: TextureUsage.TEXTURE_BINDING
    });
    expect(() => gpu.createBindGroup({ layout, entries: [{ binding: 9, resource: texture }] })).toThrow(
      /binding 9 is past/
    );
  });

  it('refuses a pipeline with more groups, textures or uniform buffers than the device allows', () => {
    const { gpu } = fake({
      limits: { maxBindGroups: 2, maxSampledTexturesPerShaderStage: 2, maxUniformBuffersPerShaderStage: 1 }
    });
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const refused = (layout: GpuBindGroupLayout[]) => {
      const made = gpu.createRenderPipeline(pipelineDesc(layout));
      return made.ok ? null : made.error;
    };
    expect(refused([empty, empty, empty])).toMatch(/3 bind groups are past this device's 2/);
    const textures = gpu.createBindGroupLayout({
      entries: [0, 1, 2].map((binding) => ({
        binding,
        visibility: ShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const }
      }))
    });
    expect(refused([textures])).toMatch(/3 sampled textures in the fragment stage/);
    const block = (binding: number): BindGroupLayoutEntry => ({
      binding,
      visibility: ShaderStage.VERTEX,
      buffer: { minBindingSize: 16 }
    });
    const uniforms = gpu.createBindGroupLayout({ entries: [block(0)] });
    expect(refused([uniforms, gpu.createBindGroupLayout({ entries: [block(0)] })])).toMatch(
      /2 uniform buffers in the vertex stage/
    );
    expect(refused([uniforms])).toBeNull();
  });

  it('refuses a pipeline without WGSL', () => {
    const { gpu } = fake();
    expect(gpu.createRenderPipeline(pipelineDesc([], false))).toMatchObject({
      ok: false,
      error: 'p carries no WGSL'
    });
  });
});
