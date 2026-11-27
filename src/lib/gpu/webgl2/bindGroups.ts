import type {
  BindGroupDescriptor,
  BindGroupLayoutDescriptor,
  BindGroupLayoutEntry,
  BindingResource,
  BufferBinding,
  GpuBindGroup,
  GpuBindGroupLayout,
  GpuSampler,
  GpuTexture
} from '../device.js';
import type { Webgl2Pipeline } from './pipeline.js';

interface LayoutRecord {
  entries: Map<number, BindGroupLayoutEntry>;
  dynamic: number[];
}

interface GroupRecord {
  layout: GpuBindGroupLayout;
  resources: Map<number, BindingResource>;
}

interface SetGroup {
  group: GroupRecord;
  offsets: readonly number[];
}

export interface BindingReads {
  buffer(buffer: WebGLBuffer, start: number, end: number): void;
  texture(texture: GpuTexture): void;
}

export class Webgl2BindGroups {
  private readonly layouts = new WeakMap<GpuBindGroupLayout, LayoutRecord>();
  private readonly groups = new WeakMap<GpuBindGroup, GroupRecord>();
  private readonly set: (SetGroup | undefined)[] = [];
  private readonly ranges = new Map<number, readonly [WebGLBuffer, number, number]>();
  private readonly units = new Map<number, GpuTexture>();
  private readonly samplers = new Map<number, GpuSampler | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly bindOn: (unit: number, texture: GpuTexture) => void,
    private readonly reads: BindingReads | null
  ) {}

  createLayout(desc: BindGroupLayoutDescriptor): GpuBindGroupLayout {
    const entries = new Map(desc.entries.map((e) => [e.binding, e]));
    const dynamic = desc.entries
      .filter((e) => 'buffer' in e && e.buffer.hasDynamicOffset)
      .map((e) => e.binding)
      .sort((a, b) => a - b);
    const handle = { label: desc.label } as unknown as GpuBindGroupLayout;
    this.layouts.set(handle, { entries, dynamic });
    return handle;
  }

  createGroup(desc: BindGroupDescriptor): GpuBindGroup {
    const layout = this.layouts.get(desc.layout);
    if (!layout) throw new Error('createBindGroup: not a layout this device created');
    const resources = new Map(desc.entries.map((e) => [e.binding, e.resource]));
    for (const binding of layout.entries.keys())
      if (!resources.has(binding))
        throw new Error(`createBindGroup ${desc.label ?? ''}: binding ${binding} has no resource`);
    const handle = { label: desc.label } as unknown as GpuBindGroup;
    this.groups.set(handle, { layout: desc.layout, resources });
    return handle;
  }

  setGroup(index: number, group: GpuBindGroup, offsets: readonly number[] = []): void {
    const record = this.groups.get(group);
    if (!record) throw new Error('setBindGroup: not a bind group this device created');
    const dynamic = this.layouts.get(record.layout)!.dynamic.length;
    if (offsets.length !== dynamic)
      throw new Error(`setBindGroup ${index}: ${offsets.length} dynamic offsets for ${dynamic}`);
    this.set[index] = { group: record, offsets };
  }

  beginPass(): void {
    this.set.length = 0;
  }

  apply(p: Webgl2Pipeline): void {
    p.layout.forEach((layout, g) => {
      if (this.set[g]?.group.layout !== layout)
        throw new Error(`draw: bind group ${g} is not set to the pipeline's layout`);
    });
    const gl = this.gl;
    for (const block of p.linked.blocks) {
      const binding = this.buffer(block.slot[0], block.slot[1]);
      const buffer = binding.buffer as unknown as WebGLBuffer;
      const start = (binding.offset ?? 0) + this.dynamicOffset(block.slot[0], block.slot[1]);
      const bound = this.ranges.get(block.point);
      if (!bound || bound[0] !== buffer || bound[1] !== start || bound[2] !== binding.size) {
        gl.bindBufferRange(gl.UNIFORM_BUFFER, block.point, buffer, start, binding.size);
        this.ranges.set(block.point, [buffer, start, binding.size]);
      }
      this.reads?.buffer(buffer, start, start + binding.size);
    }
    for (const t of p.linked.textures) {
      const texture = this.resource(t.slot[0], t.slot[1]) as GpuTexture;
      if (this.units.get(t.unit) !== texture) {
        this.bindOn(t.unit, texture);
        this.units.set(t.unit, texture);
      }
      const sampler = t.sampler ? (this.resource(t.sampler[0], t.sampler[1]) as GpuSampler) : null;
      if (this.samplers.get(t.unit) !== sampler) {
        gl.bindSampler(t.unit, sampler as unknown as WebGLSampler | null);
        this.samplers.set(t.unit, sampler);
      }
      this.reads?.texture(texture);
    }
  }

  forgetTexture(texture: GpuTexture): void {
    for (const [unit, bound] of this.units) if (bound === texture) this.units.delete(unit);
  }

  forgetBuffer(buffer: WebGLBuffer): void {
    for (const [point, bound] of this.ranges) if (bound[0] === buffer) this.ranges.delete(point);
  }

  private resource(group: number, binding: number): BindingResource {
    const resource = this.set[group]?.group.resources.get(binding);
    if (!resource) throw new Error(`draw: bind group ${group} has nothing at binding ${binding}`);
    return resource;
  }

  private buffer(group: number, binding: number): BufferBinding {
    return this.resource(group, binding) as BufferBinding;
  }

  private dynamicOffset(group: number, binding: number): number {
    const set = this.set[group]!;
    const at = this.layouts.get(set.group.layout)!.dynamic.indexOf(binding);
    return at < 0 ? 0 : set.offsets[at];
  }
}
