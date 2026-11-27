import type { Webgl2Pipeline } from './pipeline.js';

type Range = readonly [number, number];

export interface DrawnSlot {
  buffer: WebGLBuffer;
  offset: number;
}

export class Webgl2Validator {
  private readonly read = new Map<WebGLBuffer, Range[]>();

  reset(): void {
    this.read.clear();
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
      const range: Range = [
        slot.offset + first * layout.arrayStride,
        slot.offset + end * layout.arrayStride
      ];
      const ranges = this.read.get(slot.buffer);
      if (ranges) ranges.push(range);
      else this.read.set(slot.buffer, [range]);
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
