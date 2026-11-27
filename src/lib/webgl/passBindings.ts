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
  type GpuTexture,
  type WgslSources
} from '../gpu/device.js';
import {
  UniformBlock,
  withBlocks,
  withWgslBlock,
  type UniformLayout
} from '../gpu/uniforms.js';
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

const WGSL_TEXTURE = {
  float: 'texture_2d<f32>',
  'unfilterable-float': 'texture_2d<f32>',
  uint: 'texture_2d<u32>'
} as const;

export function wgslTexture(t: PassTexture, binding: number): string {
  return `@group(${PASS_GROUP}) @binding(${binding}) var ${t.name}: ${WGSL_TEXTURE[t.sampleType]};\n`;
}

export interface GroupBindings {
  readonly layout: GpuBindGroupLayout;
  glsl(sources: GlslSources): GlslSources;
  wgsl(sources: WgslSources): WgslSources;
}

interface Block {
  block: UniformBlock;
  buffer: GpuBuffer;
}

export class PassBindings implements GroupBindings {
  readonly layout: GpuBindGroupLayout;
  private readonly blocks: Block[];
  private readonly owner = new Map<string, UniformBlock>();
  private bound: readonly GpuTexture[] = [];
  private made: GpuBindGroup | null = null;

  constructor(
    private readonly gpu: GpuDevice,
    private readonly label: string,
    uniforms: readonly UniformLayout[],
    private readonly textures: readonly PassTexture[] = []
  ) {
    const entries: BindGroupLayoutEntry[] = uniforms.map((u, binding) => ({
      binding,
      visibility: STAGES,
      buffer: { minBindingSize: u.size }
    }));
    textures.forEach((t, i) =>
      entries.push({
        binding: uniforms.length + i,
        visibility: STAGES,
        texture: { sampleType: t.sampleType }
      })
    );
    this.layout = gpu.createBindGroupLayout({ label, entries });
    this.blocks = uniforms.map((u) => ({
      block: new UniformBlock(u),
      buffer: gpu.createBuffer({
        label: `${label}.${u.name}`,
        size: u.size,
        usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
      })
    }));
    for (const { block } of this.blocks)
      for (const m of block.layout.members) {
        if (this.owner.has(m.name)) throw new Error(`${label}: ${m.name} is in two blocks`);
        this.owner.set(m.name, block);
      }
  }

  glsl(sources: GlslSources): GlslSources {
    const withBlocks = this.blocks.reduce(
      (s, { block }, binding) => blockSources(s, block.layout, [PASS_GROUP, binding]),
      sources
    );
    const first = this.blocks.length;
    return {
      ...withBlocks,
      textures: {
        ...sources.textures,
        ...Object.fromEntries(this.textures.map((t, i) => [t.name, textureBinding(t, first + i)]))
      }
    };
  }

  wgsl(sources: WgslSources): WgslSources {
    const withBlocks = this.blocks.reduce(
      (s, { block }, binding) => withWgslBlock(s, block.layout, [PASS_GROUP, binding]),
      sources
    );
    const first = this.blocks.length;
    const textures = this.textures.map((t, i) => wgslTexture(t, first + i)).join('');
    return { code: textures + withBlocks.code };
  }

  set(name: string, value: number | ArrayLike<number>): void {
    const block = this.owner.get(name);
    if (!block) throw new Error(`${this.label} has no uniform ${name}`);
    block.set(name, value);
  }

  upload(prefix: Readonly<Record<string, number>> = {}): void {
    for (const { block, buffer } of this.blocks)
      block.upload(this.gpu.queue, buffer, 0, prefix[block.layout.name]);
  }

  group(textures: readonly GpuTexture[] = []): GpuBindGroup {
    if (textures.length !== this.textures.length)
      throw new Error(`${this.label}: ${textures.length} textures for ${this.textures.length}`);
    if (this.made && textures.every((t, i) => t === this.bound[i])) return this.made;
    const entries: BindGroupDescriptor['entries'] = this.blocks.map(({ block, buffer }, i) => ({
      binding: i,
      resource: { buffer, size: block.layout.size }
    }));
    textures.forEach((t, i) => entries.push({ binding: this.blocks.length + i, resource: t }));
    this.made = this.gpu.createBindGroup({ label: this.label, layout: this.layout, entries });
    this.bound = [...textures];
    return this.made;
  }

  destroy(): void {
    for (const { buffer } of this.blocks) this.gpu.destroyBuffer(buffer);
  }
}
