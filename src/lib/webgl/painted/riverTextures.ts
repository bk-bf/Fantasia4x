import { FLOW_RES, riverField, type RiverInput } from './riverFlow.js';

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
  private readonly gl: WebGL2RenderingContext;
  private readonly flowTex: WebGLTexture;
  private readonly streamTex: WebGLTexture;
  private key: number | null = null;
  private active: Uint8Array | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.flowTex = this.make(FLOW_UNIT, gl.LINEAR);
    this.streamTex = this.make(STREAM_UNIT, gl.NEAREST);
    this.clear();
  }

  private make(unit: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, filter);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
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
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0 + FLOW_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, flow);
    gl.activeTexture(gl.TEXTURE0 + STREAM_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.streamTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, stream);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
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
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + FLOW_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.activeTexture(gl.TEXTURE0 + STREAM_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.streamTex);
  }

  dispose(): void {
    this.gl.deleteTexture(this.flowTex);
    this.gl.deleteTexture(this.streamTex);
  }
}
