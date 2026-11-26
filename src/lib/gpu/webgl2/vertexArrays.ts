import type { Webgl2Pipeline } from './pipeline.js';
import { vertexComponents } from './formats.js';

interface Slot {
  buffer: WebGLBuffer;
  offset: number;
}

export class Webgl2VertexArrays {
  private readonly slots: Slot[] = [];
  private readonly byKey = new Map<string, WebGLVertexArrayObject>();
  private readonly byBuffer = new Map<WebGLBuffer, string[]>();
  private readonly ids = new WeakMap<WebGLBuffer, number>();
  private nextId = 1;
  private empty: WebGLVertexArrayObject | null = null;
  private bound: WebGLVertexArrayObject | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  set(slot: number, buffer: WebGLBuffer, offset: number): void {
    this.slots[slot] = { buffer, offset };
  }

  bind(p: Webgl2Pipeline): void {
    const vao =
      p.buffers.length === 0
        ? (this.empty ??= this.gl.createVertexArray())
        : (this.byKey.get(this.key(p)) ?? this.build(p));
    if (vao === this.bound) return;
    this.gl.bindVertexArray(vao);
    this.bound = vao;
  }

  forget(buffer: WebGLBuffer): void {
    for (const key of this.byBuffer.get(buffer) ?? []) {
      const vao = this.byKey.get(key);
      if (!vao) continue;
      this.gl.deleteVertexArray(vao);
      this.byKey.delete(key);
      if (vao === this.bound) this.bound = null;
    }
    this.byBuffer.delete(buffer);
    this.slots.forEach((slot, i) => {
      if (slot?.buffer === buffer) delete this.slots[i];
    });
  }

  private id(buffer: WebGLBuffer): number {
    let id = this.ids.get(buffer);
    if (id === undefined) this.ids.set(buffer, (id = this.nextId++));
    return id;
  }

  private slot(i: number): Slot {
    const slot = this.slots[i];
    if (!slot) throw new Error(`draw: no vertex buffer in slot ${i}`);
    return slot;
  }

  private key(p: Webgl2Pipeline): string {
    let key = p.layoutKey;
    for (let i = 0; i < p.buffers.length; i++) {
      const slot = this.slot(i);
      key += `|${this.id(slot.buffer)}:${slot.offset}`;
    }
    return key;
  }

  private build(p: Webgl2Pipeline): WebGLVertexArrayObject {
    const gl = this.gl;
    const key = this.key(p);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.bound = vao;
    p.buffers.forEach((layout, i) => {
      const slot = this.slot(i);
      gl.bindBuffer(gl.ARRAY_BUFFER, slot.buffer);
      for (const a of layout.attributes) {
        gl.enableVertexAttribArray(a.shaderLocation);
        gl.vertexAttribPointer(
          a.shaderLocation,
          vertexComponents(a.format),
          gl.FLOAT,
          false,
          layout.arrayStride,
          slot.offset + a.offset
        );
        if (layout.stepMode === 'instance') gl.vertexAttribDivisor(a.shaderLocation, 1);
      }
      const keys = this.byBuffer.get(slot.buffer) ?? [];
      keys.push(key);
      this.byBuffer.set(slot.buffer, keys);
    });
    this.byKey.set(key, vao);
    return vao;
  }
}
