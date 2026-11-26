import { FLOW_RES, riverField, type RiverInput } from './riverFlow.js';
import type { GpuDevice, GpuTexture } from '../../gpu/device.js';
import { samplersOf } from '../samplers.js';

export const FLOW_UNIT = 14;
export const STREAM_UNIT = 15;
const STILL_FLOW = Uint8Array.of(128, 128, 0, 0);
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function riverKey(input: RiverInput, active: Uint8Array | null): number {
  const { w, h, water, tiles } = input;
  const bits = new Uint32Array(tiles.slope.buffer, tiles.slope.byteOffset, tiles.slope.length);
  const spent = new Uint32Array(
    tiles.discharge.buffer,
    tiles.discharge.byteOffset,
    tiles.discharge.length
  );
  let key = FNV_OFFSET;
  const mix = (v: number) => (key = Math.imul(key ^ v, FNV_PRIME) >>> 0);
  mix(w);
  mix(h);
  mix(input.unitsPerTile);
  for (let i = 0; i < w * h; i++) {
    if (!tiles.river[i]) continue;
    mix(i);
    mix(water[i]);
    if (tiles.down[i] < 0) continue;
    mix(tiles.down[i]);
    mix(spent[i]);
    mix(bits[i]);
  }
  if (active) for (let i = 0; i < w * h; i++) if (active[i]) mix(water[i]);
  return key;
}

export class RiverTextures {
  private readonly gpu: GpuDevice;
  private readonly flowTex: GpuTexture;
  private readonly streamTex: GpuTexture;
  private key: number | null = null;
  private active: Uint8Array | null = null;

  constructor(gpu: GpuDevice) {
    this.gpu = gpu;
    this.flowTex = this.make(FLOW_UNIT);
    this.streamTex = this.make(STREAM_UNIT);
    gpu.bindSampler(FLOW_UNIT, samplersOf(gpu).linear);
    this.clear();
  }

  private make(unit: number): GpuTexture {
    const gpu = this.gpu;
    const tex = gpu.createTexture()!;
    gpu.setTextureSlot(unit);
    gpu.bindTexture(tex);
    gpu.setTextureSlot(0);
    return tex;
  }

  private upload(
    flow: Uint8Array,
    fw: number,
    fh: number,
    stream: Float32Array,
    w: number,
    h: number
  ) {
    const gpu = this.gpu;
    gpu.setUnpackAlignment(1);
    gpu.setTextureSlot(FLOW_UNIT);
    gpu.bindTexture(this.flowTex);
    gpu.writeTexture({ format: 'rgba8unorm', width: fw, height: fh }, flow);
    gpu.setTextureSlot(STREAM_UNIT);
    gpu.bindTexture(this.streamTex);
    gpu.writeTexture({ format: 'rgba32float', width: w, height: h }, stream);
    gpu.setUnpackAlignment(4);
    gpu.setTextureSlot(0);
  }

  private clear(): void {
    this.upload(STILL_FLOW, 1, 1, new Float32Array(4), 1, 1);
  }

  update(input: RiverInput): void {
    const key = riverKey(input, this.active);
    if (key === this.key) return;
    const field = riverField(input);
    this.active = field?.active ?? null;
    this.key = riverKey(input, this.active);
    if (!field) return this.clear();
    this.upload(field.flow, input.w * FLOW_RES, input.h * FLOW_RES, field.stream, input.w, input.h);
  }

  bind(): void {
    const gpu = this.gpu;
    gpu.setTextureSlot(FLOW_UNIT);
    gpu.bindTexture(this.flowTex);
    gpu.setTextureSlot(STREAM_UNIT);
    gpu.bindTexture(this.streamTex);
  }

  dispose(): void {
    this.gpu.destroyTexture(this.flowTex);
    this.gpu.destroyTexture(this.streamTex);
  }
}
