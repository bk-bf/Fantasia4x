import type { Webgl2Pipeline } from './pipeline.js';

type Range = readonly [number, number];

export interface DrawnSlot {
  buffer: WebGLBuffer;
  offset: number;
}

export class Webgl2Validator {
  private readonly read = new Map<WebGLBuffer, Range[]>();
  private readonly sampled = new Set<unknown>();

  reset(): void {
    this.read.clear();
    this.sampled.clear();
  }

  readBuffer(buffer: WebGLBuffer, start: number, end: number): void {
    const ranges = this.read.get(buffer);
    if (ranges) ranges.push([start, end]);
    else this.read.set(buffer, [[start, end]]);
  }

  sample(texture: unknown): void {
    this.sampled.add(texture);
  }

  writeTexture(texture: unknown): void {
    if (this.sampled.has(texture))
      throw new Error('writeTexture: a draw that is not submitted yet samples this texture');
  }

  draw(
    p: Webgl2Pipeline,
    slots: readonly (DrawnSlot | undefined)[],
    vertices: Range,
    instances: Range
  ): void {
    p.buffers.forEach((layout, i) => {
      const slot = slots[i];
      if (!slot) return;
      const [first, end] = layout.stepMode === 'instance' ? instances : vertices;
      this.readBuffer(
        slot.buffer,
        slot.offset + first * layout.arrayStride,
        slot.offset + end * layout.arrayStride
      );
    });
  }

  write(buffer: WebGLBuffer, start: number, end: number): void {
    for (const [s, e] of this.read.get(buffer) ?? []) {
      if (start < e && s < end)
        throw new Error(
          `writeBuffer: bytes ${start}-${end} were read by a draw at ${s}-${e} that is not submitted yet`
        );
    }
  }
}
