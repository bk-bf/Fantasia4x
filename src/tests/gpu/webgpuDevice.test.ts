import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALPHA_BLEND,
  BufferUsage,
  PipelineBuildFailed,
  ShaderStage,
  TextureUsage,
  type BindGroupLayoutEntry,
  type GpuBindGroupLayout,
  type RenderPipelineDescriptor
} from '../../lib/gpu/device.js';
import { WebgpuDevice } from '../../lib/gpu/webgpu/device.js';
import { uniformLayout } from '../../lib/gpu/uniforms.js';
import { DrawSlices } from '../../lib/webgl/drawSlices.js';

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

const FORMAT_BYTES: Record<string, number> = {
  float32: 4,
  float32x2: 8,
  float32x3: 12,
  float32x4: 16
};

function overrun(desc: GPURenderPipelineDescriptor): string | null {
  for (const layout of desc.vertex.buffers ?? [])
    for (const a of layout?.attributes ?? [])
      if (a.offset + FORMAT_BYTES[a.format] > layout!.arrayStride)
        return `attribute ${a.shaderLocation} overruns its ${layout!.arrayStride}-byte stride`;
  return null;
}

function fake(
  options: { pipelines?: 'resolve' | 'reject' | 'hold'; limits?: Partial<typeof LIMITS> } = {}
) {
  const calls: Call[] = [];
  const held: (() => void)[] = [];
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
    createRenderPipelineAsync: record(
      'createRenderPipelineAsync',
      (d: GPURenderPipelineDescriptor) => {
        const invalid = overrun(d);
        if (invalid) return Promise.reject(new Error(invalid));
        if (options.pipelines === 'reject')
          return Promise.reject(new Error('the fragment stage does not compile'));
        if (options.pipelines === 'hold')
          return new Promise((resolve) => held.push(() => resolve({ pipeline: d })));
        return Promise.resolve({ pipeline: d });
      }
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
      context: record('context', () => ({
        getCurrentTexture: () => canvasTexture,
        unconfigure: record('unconfigure')
      })) as unknown as () => GPUCanvasContext,
      format: 'bgra8unorm',
      depthFormat: 'depth24plus-stencil8'
    },
    { validate: true }
  );
  const named = (name: string) => calls.filter((c) => c[0] === name).map((c) => c.slice(1));
  const release = () => held.splice(0).forEach((r) => r());
  return { gpu, calls, named, canvasTexture, release };
}

const STAGES = ShaderStage.VERTEX | ShaderStage.FRAGMENT;

function pipelineDesc(
  layout: GpuBindGroupLayout[],
  wgsl = true,
  instanceOffset = 0
): RenderPipelineDescriptor {
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
          attributes: [{ shaderLocation: 1, offset: instanceOffset, format: 'float32x4' }]
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
        attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }]
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

const SLICE_UNIFORMS = uniformLayout('D', [{ name: 'u_x', type: 'vec4', precision: 'highp' }]);

function drawn(options?: Parameters<typeof fake>[0]) {
  const f = fake(options);
  const { gpu } = f;
  const slices = new DrawSlices(gpu, 'd', SLICE_UNIFORMS);
  slices.stage(0, { u_x: [1, 2, 3, 4] });
  slices.stage(1, { u_x: [5, 6, 7, 8] });
  const sampled = gpu.createBindGroupLayout({
    entries: [{ binding: 0, visibility: STAGES, texture: { sampleType: 'float' } }]
  });
  const vertices = gpu.createBuffer({ size: 1024, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  const texture = gpu.createTexture({
    format: 'rgba8unorm',
    width: 2,
    height: 2,
    usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST
  });
  const group = gpu.createBindGroup({
    layout: sampled,
    entries: [{ binding: 0, resource: texture }]
  });
  const made = gpu.createRenderPipeline(pipelineDesc([slices.layout, sampled]));
  if (!made.ok) throw new Error(made.error);
  const draw = () => {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
    });
    pass.setPipeline(made.pipeline);
    pass.setBindGroup(0, slices.group, [slices.offset(1)]);
    pass.setBindGroup(1, group);
    pass.setVertexBuffer(0, vertices, 0);
    pass.setVertexBuffer(1, vertices, 512);
    pass.draw(4, 2);
    pass.end();
    return encoder.finish();
  };
  return { ...f, slices, vertices, texture, draw };
}

describe('a draw on the WebGPU device', () => {
  it('passes the dynamic offset a slice sits at, one alignment stride per slice', async () => {
    for (const alignment of [256, 512]) {
      const { named, draw } = drawn({ limits: { minUniformBufferOffsetAlignment: alignment } });
      await settle();
      draw();
      expect(named('setBindGroup')[0].slice(0, 1)).toEqual([0]);
      expect(named('setBindGroup')[0][2]).toEqual([alignment]);
      expect(named('draw')).toEqual([[4, 2, 0, 0]]);
    }
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

describe('the WebGPU pipelines are ready', () => {
  it('once every pipeline asked for so far has built, and the draws encode from then on', async () => {
    const { gpu, named, draw, release } = drawn({ pipelines: 'hold' });
    let ready = false;
    void gpu.pipelinesReady().then(() => (ready = true));
    await settle();
    expect(ready).toBe(false);
    draw();
    expect(named('draw')).toEqual([]);
    release();
    await settle();
    expect(ready).toBe(true);
    draw();
    expect(named('draw')).toEqual([[4, 2, 0, 0]]);
  });

  it('never, when a build fails: the wait rejects with the pipeline that failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gpu } = drawn({ pipelines: 'reject' });
    const ready = gpu.pipelinesReady();
    await expect(ready).rejects.toBeInstanceOf(PipelineBuildFailed);
    await expect(ready).rejects.toThrow(/the p pipeline did not build: the fragment stage/);
  });

  it('never, for an attribute that overruns its stride', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { gpu } = fake();
    gpu.createRenderPipeline(pipelineDesc([], true, 4));
    await expect(gpu.pipelinesReady()).rejects.toThrow(/attribute 1 overruns its 16-byte stride/);
  });
});

describe('the WebGPU write-after-use validator', () => {
  it('refuses a write over a uniform slice a draw of the same submit reads', async () => {
    const { gpu, slices, draw } = drawn();
    await settle();
    const commands = draw();
    expect(() => slices.upload(1)).not.toThrow();
    expect(() => slices.upload(2)).toThrow(/bytes 0-512 were read by a draw at 256-272/);
    gpu.queue.submit([commands]);
    expect(() => slices.upload(2)).not.toThrow();
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
    const { gpu, slices, draw } = drawn();
    await settle();
    draw();
    gpu.createCommandEncoder();
    expect(() => slices.upload(2)).toThrow(/read by a draw/);
  });

  it('refuses a write that is not whole 4-byte words', () => {
    const { gpu, vertices } = drawn();
    expect(() => gpu.queue.writeBuffer(vertices, 2, new Float32Array(1))).toThrow(/4-byte/);
    expect(() => gpu.queue.writeBuffer(vertices, 0, new Uint8Array(6))).toThrow(/4-byte/);
    expect(() => gpu.queue.writeBuffer(vertices, 0, new Uint8Array(8), 2, 4)).not.toThrow();
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

describe('disposing the WebGPU device', () => {
  it('unconfigures the canvas context it drew to and destroys the device', () => {
    const untouched = fake();
    untouched.gpu.destroy();
    expect(untouched.named('context')).toEqual([]);
    expect(untouched.named('destroy')).toHaveLength(1);
    const { gpu, named } = fake();
    gpu.createCommandEncoder()
      .beginRenderPass({
        colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
      })
      .end();
    gpu.destroy();
    expect(named('unconfigure')).toHaveLength(1);
    expect(named('destroy')).toHaveLength(1);
  });
});
