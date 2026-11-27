import type { GpuBuffer, GpuQueue } from './device.js';

export type UniformType = 'float' | 'int' | 'vec2' | 'ivec2' | 'vec3' | 'vec4' | 'ivec4' | 'mat4';
export type Precision = 'highp' | 'mediump';

export interface UniformMember {
  name: string;
  type: UniformType;
  precision: Precision;
  count?: number;
}

export interface UniformLayout {
  name: string;
  members: readonly UniformMember[];
  offsets: Readonly<Record<string, number>>;
  size: number;
}

const SHAPE: Record<UniformType, { align: number; size: number }> = {
  float: { align: 4, size: 4 },
  int: { align: 4, size: 4 },
  vec2: { align: 8, size: 8 },
  ivec2: { align: 8, size: 8 },
  vec3: { align: 16, size: 12 },
  vec4: { align: 16, size: 16 },
  ivec4: { align: 16, size: 16 },
  mat4: { align: 16, size: 64 }
};

const ARRAY_TYPES = new Set<UniformType>(['vec3', 'vec4', 'ivec4']);
const INTEGER_TYPES = new Set<UniformType>(['int', 'ivec2', 'ivec4']);

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to;

export function uniformLayout(name: string, members: readonly UniformMember[]): UniformLayout {
  const offsets: Record<string, number> = {};
  let at = 0;
  for (const m of members) {
    const shape = SHAPE[m.type];
    if (m.count !== undefined) {
      if (!ARRAY_TYPES.has(m.type))
        throw new Error(`${name}.${m.name}: a ${m.type} array has no matching WGSL layout`);
      at = roundUp(at, 16);
      offsets[m.name] = at;
      at += 16 * m.count;
    } else {
      at = roundUp(at, shape.align);
      offsets[m.name] = at;
      at += shape.size;
    }
  }
  return { name, members, offsets, size: roundUp(at, 16) };
}

export function glslBlock(layout: UniformLayout): string {
  const lines = layout.members.map(
    (m) => `  ${m.precision} ${m.type} ${m.name}${m.count !== undefined ? `[${m.count}]` : ''};`
  );
  return `layout(std140) uniform ${layout.name} {\n${lines.join('\n')}\n};\n`;
}

export function withBlocks(source: string, layouts: readonly UniformLayout[]): string {
  const text = layouts.map(glslBlock).join('');
  const version = source.match(/^#version[^\n]*\n/);
  return version ? version[0] + text + source.slice(version[0].length) : text + source;
}

export class UniformBlock {
  readonly bytes: Uint8Array;
  private readonly f32: Float32Array;
  private readonly i32: Int32Array;
  private readonly types = new Map<string, UniformMember>();
  private dirty = true;

  constructor(readonly layout: UniformLayout) {
    const data = new ArrayBuffer(layout.size);
    this.bytes = new Uint8Array(data);
    this.f32 = new Float32Array(data);
    this.i32 = new Int32Array(data);
    for (const m of layout.members) this.types.set(m.name, m);
  }

  set(name: string, value: number | ArrayLike<number>): void {
    const member = this.types.get(name);
    if (!member) throw new Error(`${this.layout.name} has no member ${name}`);
    const integer = INTEGER_TYPES.has(member.type);
    const view = integer ? this.i32 : this.f32;
    const at = this.layout.offsets[name] / 4;
    const put = (slot: number, x: number) => {
      const stored = integer ? x | 0 : Math.fround(x);
      if (!Object.is(view[slot], stored)) this.dirty = true;
      view[slot] = stored;
    };
    if (typeof value === 'number') return put(at, value);
    const width = member.type === 'vec3' ? 3 : 0;
    for (let i = 0; i < value.length; i++)
      put(width ? at + Math.floor(i / width) * 4 + (i % width) : at + i, value[i]);
  }

  upload(queue: GpuQueue, buffer: GpuBuffer, offset = 0, size = this.layout.size): void {
    if (!this.dirty) return;
    queue.writeBuffer(buffer, offset, this.bytes, 0, size);
    this.dirty = false;
  }
}
