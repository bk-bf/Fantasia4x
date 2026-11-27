import {
  BufferUsage,
  ShaderStage,
  TextureUsage,
  type BindGroupDescriptor,
  type BindGroupLayoutEntry,
  type GlslSources,
  type GlslTexture,
  type GpuBindGroup,
  type GpuBindGroupLayout,
  type GpuBuffer,
  type GpuDevice,
  type GpuTexture
} from '../gpu/device.js';
import { UniformBlock, withBlocks, type UniformLayout } from '../gpu/uniforms.js';
import { LINEAR_SAMPLER, NEAREST_SAMPLER } from './frameBindings.js';

export const PASS_GROUP = 1;

export interface PassTexture {
  name: string;
  sampleType: 'float' | 'unfilterable-float' | 'uint';
  filter?: 'nearest' | 'linear';
}

const STAGES = ShaderStage.VERTEX | ShaderStage.FRAGMENT;

const blanks = new WeakMap<GpuDevice, GpuTexture>();

export function blankTexture(gpu: GpuDevice): GpuTexture {
  let blank = blanks.get(gpu);
  if (!blank) {
    blank = gpu.createTexture({
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      usage: TextureUsage.TEXTURE_BINDING
    });
    blanks.set(gpu, blank);
  }
  return blank;
}

export function blockSources(
  sources: GlslSources,
  layout: UniformLayout,
  slot: readonly [number, number]
): GlslSources {
  return {
    ...sources,
    vertex: withBlocks(sources.vertex, [layout]),
    fragment: withBlocks(sources.fragment, [layout]),
    blocks: { ...sources.blocks, [layout.name]: { slot, offsets: layout.offsets } }
  };
}

function textureBinding(t: PassTexture, binding: number): GlslTexture {
  const sampler =
    t.filter === 'linear' ? LINEAR_SAMPLER : t.filter === 'nearest' ? NEAREST_SAMPLER : undefined;
  return { texture: [PASS_GROUP, binding], ...(sampler ? { sampler } : {}) };
}

export interface GroupBindings {
  readonly layout: GpuBindGroupLayout;
  glsl(sources: GlslSources): GlslSources;
}

export class PassBindings implements GroupBindings {
  readonly layout: GpuBindGroupLayout;
  readonly block: UniformBlock | null;
  private readonly buffer: GpuBuffer | null;
  private bound: readonly GpuTexture[] = [];
  private made: GpuBindGroup | null = null;

  constructor(
    private readonly gpu: GpuDevice,
    private readonly label: string,
    uniforms: UniformLayout | null,
    private readonly textures: readonly PassTexture[] = []
  ) {
    const entries: BindGroupLayoutEntry[] = [];
    if (uniforms)
      entries.push({ binding: 0, visibility: STAGES, buffer: { minBindingSize: uniforms.size } });
    textures.forEach((t, i) =>
      entries.push({ binding: i + 1, visibility: STAGES, texture: { sampleType: t.sampleType } })
    );
    this.layout = gpu.createBindGroupLayout({ label, entries });
    this.block = uniforms ? new UniformBlock(uniforms) : null;
    this.buffer = uniforms
      ? gpu.createBuffer({
          label,
          size: uniforms.size,
          usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
        })
      : null;
  }

  glsl(sources: GlslSources): GlslSources {
    const withBlock = this.block
      ? blockSources(sources, this.block.layout, [PASS_GROUP, 0])
      : sources;
    return {
      ...withBlock,
      textures: {
        ...sources.textures,
        ...Object.fromEntries(this.textures.map((t, i) => [t.name, textureBinding(t, i + 1)]))
      }
    };
  }

  set(name: string, value: number | ArrayLike<number>): void {
    if (!this.block) throw new Error(`${this.label} has no uniform block`);
    this.block.set(name, value);
  }

  upload(size?: number): void {
    if (this.block && this.buffer) this.block.upload(this.gpu.queue, this.buffer, 0, size);
  }

  group(textures: readonly GpuTexture[] = []): GpuBindGroup {
    if (textures.length !== this.textures.length)
      throw new Error(`${this.label}: ${textures.length} textures for ${this.textures.length}`);
    if (this.made && textures.every((t, i) => t === this.bound[i])) return this.made;
    const entries: BindGroupDescriptor['entries'] = textures.map((t, i) => ({
      binding: i + 1,
      resource: t
    }));
    if (this.block && this.buffer)
      entries.unshift({
        binding: 0,
        resource: { buffer: this.buffer, size: this.block.layout.size }
      });
    this.made = this.gpu.createBindGroup({ label: this.label, layout: this.layout, entries });
    this.bound = [...textures];
    return this.made;
  }

  destroy(): void {
    this.gpu.destroyBuffer(this.buffer);
  }
}
