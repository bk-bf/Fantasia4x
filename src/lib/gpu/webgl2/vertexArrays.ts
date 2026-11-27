import type { Webgl2Pipeline } from './pipeline.js';
import { vertexComponents } from './formats.js';

interface Slot {
  buffer: WebGLBuffer;
  offset: number;
}

interface Cached {
  layout: number;
  slots: Slot[];
  vao: WebGLVertexArrayObject;
}

export class Webgl2VertexArrays {
  private readonly slots: Slot[] = [];
  private readonly byFirst = new Map<WebGLBuffer, Cached[]>();
  private readonly byBuffer = new Map<WebGLBuffer, Cached[]>();
  private readonly layoutIds = new Map<string, number>();
  private readonly pipelineLayouts = new WeakMap<Webgl2Pipeline, number>();
  private empty: WebGLVertexArrayObject | null = null;
  private boundArray: WebGLVertexArrayObject | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  get bound(): readonly (Slot | undefined)[] {
    return this.slots;
  }

  set(slot: number, buffer: WebGLBuffer, offset: number): void {
    const current = this.slots[slot];
    if (current) {
      current.buffer = buffer;
      current.offset = offset;
    } else this.slots[slot] = { buffer, offset };
  }

  bind(p: Webgl2Pipeline): void {
    const vao =
      p.buffers.length === 0
        ? (this.empty ??= this.gl.createVertexArray())
        : (this.find(p) ?? this.build(p));
    if (vao === this.boundArray) return;
    this.gl.bindVertexArray(vao);
    this.boundArray = vao;
  }

  forget(buffer: WebGLBuffer): void {
    for (const cached of this.byBuffer.get(buffer) ?? []) {
      this.gl.deleteVertexArray(cached.vao);
      if (cached.vao === this.boundArray) this.boundArray = null;
      for (const slot of cached.slots) {
        if (slot.buffer === buffer) continue;
        this.drop(this.byBuffer, slot.buffer, cached);
      }
      this.drop(this.byFirst, cached.slots[0].buffer, cached);
    }
    this.byBuffer.delete(buffer);
    this.byFirst.delete(buffer);
    this.slots.forEach((slot, i) => {
      if (slot?.buffer === buffer) delete this.slots[i];
    });
  }

  private drop(index: Map<WebGLBuffer, Cached[]>, buffer: WebGLBuffer, cached: Cached): void {
    const list = index.get(buffer);
    if (!list) return;
    const at = list.indexOf(cached);
    if (at >= 0) list.splice(at, 1);
    if (list.length === 0) index.delete(buffer);
  }

  private layoutId(p: Webgl2Pipeline): number {
    let id = this.pipelineLayouts.get(p);
    if (id !== undefined) return id;
    const layout = JSON.stringify(p.buffers);
    id = this.layoutIds.get(layout);
    if (id === undefined) this.layoutIds.set(layout, (id = this.layoutIds.size));
    this.pipelineLayouts.set(p, id);
    return id;
  }

  private slot(i: number): Slot {
    const slot = this.slots[i];
    if (!slot) throw new Error(`draw: no vertex buffer in slot ${i}`);
    return slot;
  }

  private find(p: Webgl2Pipeline): WebGLVertexArrayObject | null {
    const layout = this.layoutId(p);
    const candidates = this.byFirst.get(this.slot(0).buffer);
    if (!candidates) return null;
    for (const cached of candidates) {
      if (cached.layout !== layout) continue;
      if (this.matches(cached, p.buffers.length)) return cached.vao;
    }
    return null;
  }

  private matches(cached: Cached, count: number): boolean {
    for (let i = 0; i < count; i++) {
      const slot = this.slot(i);
      const held = cached.slots[i];
      if (slot.buffer !== held.buffer || slot.offset !== held.offset) return false;
    }
    return true;
  }

  private build(p: Webgl2Pipeline): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.boundArray = vao;
    const slots = p.buffers.map((_, i) => ({ ...this.slot(i) }));
    p.buffers.forEach((layout, i) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, slots[i].buffer);
      for (const a of layout.attributes) {
        gl.enableVertexAttribArray(a.shaderLocation);
        gl.vertexAttribPointer(
          a.shaderLocation,
          vertexComponents(a.format),
          gl.FLOAT,
          false,
          layout.arrayStride,
          slots[i].offset + a.offset
        );
        if (layout.stepMode === 'instance') gl.vertexAttribDivisor(a.shaderLocation, 1);
      }
    });
    const cached: Cached = { layout: this.layoutId(p), slots, vao };
    this.index(this.byFirst, slots[0].buffer, cached);
    for (const buffer of new Set(slots.map((s) => s.buffer)))
      this.index(this.byBuffer, buffer, cached);
    return vao;
  }

  private index(index: Map<WebGLBuffer, Cached[]>, buffer: WebGLBuffer, cached: Cached): void {
    const list = index.get(buffer);
    if (list) list.push(cached);
    else index.set(buffer, [cached]);
  }
}
