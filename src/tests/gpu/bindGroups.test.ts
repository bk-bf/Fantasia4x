import { describe, expect, it } from 'vitest';
import { Webgl2Device } from '../../lib/gpu/webgl2/device.js';
import { Webgl2BindGroups } from '../../lib/gpu/webgl2/bindGroups.js';
import type { Webgl2Pipeline } from '../../lib/gpu/webgl2/pipeline.js';
import {
  BufferUsage,
  ShaderStage,
  TextureUsage,
  type GpuBindGroupLayout,
  type RenderPipelineDescriptor
} from '../../lib/gpu/device.js';

const GL = {
  TRIANGLES: 4,
  UNIFORM_BUFFER: 0x8a11,
  ARRAY_BUFFER: 0x8892,
  TEXTURE0: 0x84c0,
  TEXTURE_2D: 0x0de1,
  UNIFORM_OFFSET: 0x8a3b,
  LINK_STATUS: 0x8b82,
  MAX_TEXTURE_IMAGE_UNITS: 0x8872,
  MAX_VERTEX_UNIFORM_BLOCKS: 0x8a2b,
  MAX_FRAGMENT_UNIFORM_BLOCKS: 0x8a2d
};

function recording(
  offsets: Record<string, number> = { u_a: 0, u_b: 16 },
  parameters: Record<number, number> = {}
) {
  const calls: unknown[][] = [];
  let made = 0;
  const gl = new Proxy(GL, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'getProgramParameter') return args[1] === GL.LINK_STATUS ? true : 0;
        if (key === 'getParameter') return parameters[args[0] as number] ?? 32;
        if (key === 'getUniformBlockIndex') return args[1] === 'B' ? 3 : 0xffffffff;
        if (key === 'getUniformIndices') return (args[1] as string[]).map((_, i) => i);
        if (key === 'getActiveUniforms') return Object.values(offsets);
        if (key === 'getUniformLocation') return args[1];
        return { id: ++made };
      };
    }
  });
  return { gpu: new Webgl2Device(gl as unknown as WebGL2RenderingContext), calls };
}

function blockLayout(gpu: Webgl2Device, dynamic = false): GpuBindGroupLayout {
  return gpu.createBindGroupLayout({
    entries: [
      {
        binding: 2,
        visibility: ShaderStage.VERTEX,
        buffer: { minBindingSize: 32, hasDynamicOffset: dynamic }
      }
    ]
  });
}

const pipeline = (
  layout: GpuBindGroupLayout[],
  glsl: Partial<RenderPipelineDescriptor['glsl']> = {}
): RenderPipelineDescriptor => ({
  label: 'p',
  layout,
  glsl: {
    vertex: 'v',
    fragment: 'f',
    attributes: {},
    blocks: { B: { slot: [1, 2], offsets: { u_a: 0, u_b: 16 } } },
    ...glsl
  },
  vertex: { buffers: [] },
  primitive: { topology: 'triangle-list' },
  fragment: { targets: [{ format: 'rgba8unorm' }] }
});

function openPass(gpu: Webgl2Device) {
  return gpu.createCommandEncoder().beginRenderPass({
    colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
  });
}

function made(gpu: Webgl2Device, desc: RenderPipelineDescriptor) {
  const result = gpu.createRenderPipeline(desc);
  if (!result.ok) throw new Error(result.error);
  return result.pipeline;
}

describe('webgl2 bind groups', () => {
  it('ties a block to the binding point of its group and binding at link time', () => {
    const { gpu, calls } = recording();
    const empty = gpu.createBindGroupLayout({ entries: [] });
    made(gpu, pipeline([empty, blockLayout(gpu)]));
    expect(calls.find((c) => c[0] === 'uniformBlockBinding')?.slice(2)).toEqual([3, 10]);
  });

  it('refuses a pipeline whose block members sit where the layout does not say', () => {
    const { gpu } = recording({ u_a: 0, u_b: 12 });
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const result = gpu.createRenderPipeline(pipeline([empty, blockLayout(gpu)]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/B\.u_b sits at 12, the layout says 16/);
  });

  it('binds the buffer range at the dynamic offset, and only again when it moves', () => {
    const { gpu, calls } = recording();
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const layout = blockLayout(gpu, true);
    const p = made(gpu, pipeline([empty, layout]));
    const buffer = gpu.createBuffer({
      size: 1024,
      usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
    });
    const none = gpu.createBindGroup({ layout: empty, entries: [] });
    const group = gpu.createBindGroup({
      layout,
      entries: [{ binding: 2, resource: { buffer, offset: 256, size: 32 } }]
    });
    const pass = openPass(gpu);
    pass.setPipeline(p);
    pass.setBindGroup(0, none);
    for (const at of [0, 0, 256]) {
      pass.setBindGroup(1, group, [at]);
      pass.draw(3);
    }
    const ranges = calls.filter((c) => c[0] === 'bindBufferRange').map((c) => c.slice(2));
    expect(ranges).toEqual([
      [10, buffer, 256, 32],
      [10, buffer, 512, 32]
    ]);
  });

  it('refuses a draw whose bind group was set from another layout, or not at all', () => {
    const { gpu } = recording();
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const p = made(gpu, pipeline([empty, blockLayout(gpu)]));
    const pass = openPass(gpu);
    pass.setPipeline(p);
    expect(() => pass.draw(3)).toThrow(/bind group 0 is not set/);
    const other = gpu.createBindGroupLayout({ entries: [] });
    pass.setBindGroup(0, gpu.createBindGroup({ layout: other, entries: [] }));
    expect(() => pass.draw(3)).toThrow(/bind group 0 is not set/);
  });

  it('refuses a dynamic offset count that does not match the layout', () => {
    const { gpu } = recording();
    const layout = blockLayout(gpu, true);
    const buffer = gpu.createBuffer({ size: 64, usage: BufferUsage.UNIFORM });
    const group = gpu.createBindGroup({
      layout,
      entries: [{ binding: 2, resource: { buffer, size: 32 } }]
    });
    expect(() => openPass(gpu).setBindGroup(0, group)).toThrow(/0 dynamic offsets for 1/);
  });

  it('refuses a bind group missing a binding its layout has', () => {
    const { gpu } = recording();
    expect(() => gpu.createBindGroup({ layout: blockLayout(gpu), entries: [] })).toThrow(
      /binding 2 has no resource/
    );
  });

  it('gives each texture its own unit and binds its sampler there', () => {
    const { gpu, calls } = recording();
    const layout = gpu.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: ShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
    const p = made(
      gpu,
      pipeline([layout], { blocks: {}, textures: { u_tex: { texture: [0, 0], sampler: [0, 1] } } })
    );
    expect(calls.find((c) => c[0] === 'uniform1i')?.slice(1)).toEqual(['u_tex', 0]);
    const texture = gpu.createTexture({
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      usage: TextureUsage.TEXTURE_BINDING
    });
    const sampler = gpu.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
    const group = gpu.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: texture },
        { binding: 1, resource: sampler }
      ]
    });
    const pass = openPass(gpu);
    pass.setPipeline(p);
    pass.setBindGroup(0, group);
    const before = calls.length;
    pass.draw(3);
    pass.draw(3);
    const drawn = calls.slice(before).map((c) => c[0]);
    expect(drawn.filter((n) => n === 'bindTexture')).toHaveLength(1);
    expect(
      calls
        .slice(before)
        .find((c) => c[0] === 'bindSampler')
        ?.slice(1)
    ).toEqual([0, sampler]);
    expect(calls.slice(before).find((c) => c[0] === 'activeTexture')?.[1]).toBe(GL.TEXTURE0);
  });
});

describe('repeated draws', () => {
  it('walk the bindings again only when the pipeline, a bind group or its offsets change', () => {
    const walked: number[] = [];
    const gl = { UNIFORM_BUFFER: GL.UNIFORM_BUFFER, bindBufferRange: () => {} };
    const groups = new Webgl2BindGroups(
      gl as unknown as WebGL2RenderingContext,
      () => {},
      { buffer: (_, start) => walked.push(start), texture: () => {} },
      {
        maxBindGroups: 4,
        maxBindingsPerBindGroup: 8,
        maxSampledTexturesPerShaderStage: 16,
        maxUniformBuffersPerShaderStage: 12
      }
    );
    const layout = groups.createLayout({
      entries: [
        {
          binding: 2,
          visibility: ShaderStage.VERTEX,
          buffer: { minBindingSize: 32, hasDynamicOffset: true }
        }
      ]
    });
    const buffer = {} as never;
    const group = groups.createGroup({
      layout,
      entries: [{ binding: 2, resource: { buffer, size: 32 } }]
    });
    const pipelineOn = () =>
      ({
        layout: [layout],
        linked: { blocks: [{ slot: [0, 2], point: 2 }], textures: [] }
      }) as unknown as Webgl2Pipeline;
    const [p, q] = [pipelineOn(), pipelineOn()];
    groups.beginPass();
    groups.setGroup(0, group, [0]);
    groups.apply(p);
    groups.apply(p);
    groups.setGroup(0, group, [0]);
    groups.apply(p);
    groups.setGroup(0, group, [256]);
    groups.apply(p);
    groups.apply(q);
    groups.apply(q);
    groups.forgetBuffer(buffer);
    groups.apply(q);
    groups.beginPass();
    groups.setGroup(0, group, [256]);
    groups.apply(q);
    expect(walked).toEqual([0, 256, 256, 256, 256]);
  });
});

describe('the dev write-after-use check over bind groups', () => {
  it('throws on a uniform write into a range a pending draw reads, and not after submit', () => {
    const { gpu } = recording();
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const layout = blockLayout(gpu);
    const p = made(gpu, pipeline([empty, layout]));
    const buffer = gpu.createBuffer({
      size: 512,
      usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
    });
    const group = gpu.createBindGroup({
      layout,
      entries: [{ binding: 2, resource: { buffer, offset: 256, size: 32 } }]
    });
    const pass = openPass(gpu);
    pass.setPipeline(p);
    pass.setBindGroup(0, gpu.createBindGroup({ layout: empty, entries: [] }));
    pass.setBindGroup(1, group);
    pass.draw(3);
    gpu.queue.writeBuffer(buffer, 0, new Uint8Array(32));
    expect(() => gpu.queue.writeBuffer(buffer, 256, new Uint8Array(32))).toThrow(/not submitted/);
    pass.end();
    gpu.queue.submit([]);
    gpu.queue.writeBuffer(buffer, 256, new Uint8Array(32));
  });

  it('throws on a texture write while a pending draw samples it', () => {
    const { gpu } = recording();
    const layout = gpu.createBindGroupLayout({
      entries: [{ binding: 0, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float' } }]
    });
    const p = made(
      gpu,
      pipeline([layout], { blocks: {}, textures: { u_tex: { texture: [0, 0] } } })
    );
    const texture = gpu.createTexture({
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST
    });
    const pass = openPass(gpu);
    pass.setPipeline(p);
    pass.setBindGroup(
      0,
      gpu.createBindGroup({ layout, entries: [{ binding: 0, resource: texture }] })
    );
    pass.draw(3);
    const write = () =>
      gpu.queue.writeTexture(
        { texture },
        new Uint8Array(4),
        { bytesPerRow: 4 },
        { width: 1, height: 1 }
      );
    expect(write).toThrow(/samples this texture/);
    pass.end();
    gpu.queue.submit([]);
    write();
  });
});

describe('webgl2 limits', () => {
  it('refuses a binding past the bindings per group it reports, in a layout or a group', () => {
    const { gpu } = recording();
    const most = gpu.limits().maxBindingsPerBindGroup;
    expect(most).toBe(1000);
    const texture = (binding: number) => ({
      binding,
      visibility: ShaderStage.FRAGMENT,
      texture: { sampleType: 'float' as const }
    });
    expect(() => gpu.createBindGroupLayout({ label: 'L', entries: [texture(most)] })).toThrow(
      /createBindGroupLayout L: binding 1000 is past this device's 1000 bindings per group/
    );
    const image = gpu.createTexture({
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      usage: TextureUsage.TEXTURE_BINDING
    });
    expect(() =>
      gpu.createBindGroup({
        label: 'G',
        layout: gpu.createBindGroupLayout({ entries: [texture(8)] }),
        entries: [
          { binding: 8, resource: image },
          { binding: most, resource: image }
        ]
      })
    ).toThrow(/createBindGroup G: binding 1000 is past this device's 1000 bindings per group/);
  });

  it('refuses a uniform buffer binding past the eight binding points of its group', () => {
    const { gpu } = recording();
    const past = { binding: 8, visibility: ShaderStage.VERTEX, buffer: { minBindingSize: 16 } };
    expect(() => gpu.createBindGroupLayout({ label: 'L', entries: [past] })).toThrow(
      /createBindGroupLayout L: uniform buffer binding 8 is past the 8 binding points a group has/
    );
  });

  it('refuses a pipeline with more groups than the binding points hold', () => {
    const { gpu } = recording();
    expect(gpu.limits().maxBindGroups).toBe(4);
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const result = gpu.createRenderPipeline(pipeline([empty, empty, empty, empty, empty]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/5 bind groups are past this device's 4/);
  });

  it('refuses a pipeline with more uniform blocks in a stage than that stage allows', () => {
    const { gpu } = recording(undefined, { [GL.MAX_VERTEX_UNIFORM_BLOCKS]: 1 });
    expect(gpu.limits().maxUniformBuffersPerShaderStage).toBe(1);
    const block = (binding: number) => ({
      binding,
      visibility: ShaderStage.VERTEX,
      buffer: { minBindingSize: 16 }
    });
    const two = gpu.createBindGroupLayout({ entries: [block(0), block(1)] });
    const result = gpu.createRenderPipeline(pipeline([two]));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatch(/2 uniform buffers in the vertex stage are past this device's 1/);
  });

  it('refuses a pipeline whose textures need units past the context has', () => {
    const { gpu, calls } = recording(undefined, { [GL.MAX_TEXTURE_IMAGE_UNITS]: 1 });
    const empty = gpu.createBindGroupLayout({ entries: [] });
    const result = gpu.createRenderPipeline(
      pipeline([empty], {
        blocks: {},
        textures: {
          u_a: { texture: [0, 0], sampler: [0, 1] },
          u_b: { texture: [0, 2], sampler: [0, 3] }
        }
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatch(/2 textures from unit 0 are past this context's 1 texture units/);
    expect(calls.some((c) => c[0] === 'uniform1i')).toBe(false);
    expect(calls.some((c) => c[0] === 'deleteProgram')).toBe(true);
  });
});
