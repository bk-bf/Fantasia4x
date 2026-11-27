import vertexSource from '../shaders/leaf.vert.glsl?raw';
import fragmentSource from '../shaders/leaf.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import type { AtlasTexels } from '../drawnSprites.js';
import type { PaintedSprite, TreeFx } from './manifest.js';
import { gustAt, WIND_SHAPE, type WindClock } from './wind.js';
import { BIT_FLOATS, SHAPE, TreeBits } from './treeBits.js';
import {
  ALPHA_BLEND,
  BufferUsage,
  FLOAT32_FORMATS,
  type GpuDevice,
  type GpuRenderPass,
  type GpuRenderPipeline,
  type GpuTexture,
  type VertexBufferLayout
} from '../../gpu/device.js';
import { uniformLayout } from '../../gpu/uniforms.js';
import { canvasPipeline } from '../canvasPipeline.js';
import { PASS_GROUP, PassBindings } from '../passBindings.js';

const PROGRAM = 'fallingLeaf';
const FLOATS = BIT_FLOATS;
const MAX_BITS = 1500;
const SOLID = 1;
const SHADE = 0.7;
const PICKS = 8;
const FLUTTER = 5;
const FOOT_RISE = 9;
const MARGIN = 3;
const L = WIND_SHAPE.leaves;

export interface LeafView {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LeafFrame {
  basePerArt: number;
  artTile: number;
  view: LeafView;
  season: string | undefined;
  treeAt: (x: number, y: number) => PaintedSprite | undefined;
  fxAt: (x: number, y: number) => (PaintedSprite & { fx: TreeFx }) | undefined;
  texels: AtlasTexels | null;
  light: { fieldLit: boolean; ambient: [number, number, number]; tone: [number, number] };
}

interface Leaf {
  x: number;
  gy: number;
  z: number;
  vz: number;
  ph: number;
  tx: number;
  ty: number;
  rest: number;
}

export function leafTarget(trees: number, season: string | undefined, scale: number): number {
  const per = L.perTree[season as keyof typeof L.perTree] ?? L.perTree.summer;
  return Math.min(L.max, Math.round(trees * per * Math.min(WIND_SHAPE.maxScale, scale)));
}

export function canopyTexel(
  s: PaintedSprite,
  texels: AtlasTexels | null,
  rand: () => number
): [number, number] | null {
  if (!texels) return null;
  const x0 = Math.round(s.u1 * texels.w);
  const y0 = Math.round(s.v1 * texels.h);
  const w = Math.round((s.u2 - s.u1) * texels.w);
  const h = Math.round((s.v2 - s.v1) * texels.h);
  for (let i = 0; i < PICKS; i++) {
    const x = x0 + Math.floor(w * (0.15 + 0.7 * rand()));
    const y = y0 + Math.floor(h * 0.55 * rand());
    if (texels.kinds[y * texels.w + x] === SOLID) return [x, y];
  }
  return null;
}

export class LeafField {
  leaves: Leaf[] = [];
  trees = 0;
  private census = 0;
  private t = 0;

  constructor(private readonly rand: () => number = Math.random) {}

  step(secs: number, wind: Pick<WindClock, 'dir' | 'scroll' | 'scale'>, f: LeafFrame): void {
    this.t += secs;
    const { view, artTile } = f;
    this.census -= secs;
    if (this.census <= 0) {
      this.census = L.census;
      let hits = 0;
      for (let i = 0; i < L.samples; i++)
        if (
          f.treeAt(
            view.x + Math.floor(this.rand() * view.w),
            view.y + Math.floor(this.rand() * view.h)
          )
        )
          hits++;
      this.trees = Math.round((hits / L.samples) * view.w * view.h);
    }
    const want = leafTarget(this.trees, f.season, wind.scale);
    const tries = Math.ceil(L.triesPerSecond * secs);
    for (let i = 0; this.leaves.length < want && i < tries; i++) {
      const tx = view.x + Math.floor(this.rand() * view.w);
      const ty = view.y + Math.floor(this.rand() * view.h);
      const s = f.treeAt(tx, ty);
      const at = s && canopyTexel(s, f.texels, this.rand);
      if (!s || !at) continue;
      const foot = (ty + 1) * artTile - FOOT_RISE;
      const top = foot - (ty + s.oy) * artTile;
      const high = this.leaves.length < want / 2 ? this.rand() : 1;
      this.leaves.push({
        x: (tx + 0.5) * artTile + (this.rand() - 0.5) * L.spread,
        gy: foot - 8 + this.rand() * 22,
        z: high * top * (L.canopy[0] + this.rand() * L.canopy[1]),
        vz: L.fall[0] + this.rand() * L.fall[1],
        ph: this.rand() * Math.PI * 2,
        tx: at[0],
        ty: at[1],
        rest: 0
      });
    }
    const pace = Math.max(0.3, wind.scale);
    const left = (view.x - MARGIN) * artTile;
    const right = (view.x + view.w + MARGIN) * artTile;
    const upper = (view.y - MARGIN) * artTile;
    const lower = (view.y + view.h + MARGIN) * artTile;
    const t = this.t;
    let kept = 0;
    for (const p of this.leaves) {
      const g = gustAt(p.x, p.gy, wind);
      if (p.z > 0) {
        p.z -= p.vz * secs * (0.8 + Math.sin(t * 3 + p.ph) * 0.5);
        const push = (L.drift[0] + g * L.drift[1]) * pace * secs;
        const wobble = Math.sin(t * 4 + p.ph) * 10 * secs;
        p.x += wind.dir.x * push + wobble;
        p.gy += wind.dir.y * push + Math.sin(t * 2 + p.ph) * 4 * secs;
      } else {
        p.z = 0;
        p.rest += secs;
        if (g > L.blow[0]) {
          p.x += wind.dir.x * L.blow[1] * secs;
          p.gy += wind.dir.y * L.blow[1] * secs;
        }
      }
      if (p.rest > L.settle || p.x < left || p.x > right || p.gy < upper || p.gy > lower) continue;
      this.leaves[kept++] = p;
    }
    this.leaves.length = kept;
  }

  pack(out: Float32Array): number {
    let n = 0;
    for (const p of this.leaves) {
      if ((n + 1) * FLOATS > out.length) break;
      const o = n * FLOATS;
      out[o] = Math.round(p.x);
      out[o + 1] = Math.round(p.gy - p.z);
      out[o + 2] = p.tx;
      out[o + 3] = p.ty;
      out[o + 4] = p.z > 0 && Math.floor(this.t * FLUTTER + p.ph) & 1 ? 1 : 0;
      out[o + 5] = 0;
      out[o + 6] = 0;
      out[o + 7] = 0;
      out[o + 8] = 1;
      out[o + 9] = SHAPE.leaf;
      n++;
    }
    return n;
  }
}

const LEAF_ATTRIBUTES: [string, number, number][] = [
  ['a_leaf', 4, 0],
  ['a_turn', 1, 4],
  ['a_rgb', 2, 5],
  ['a_look', 3, 7]
];

const LEAF_LAYOUT: VertexBufferLayout = {
  arrayStride: FLOATS * 4,
  stepMode: 'instance',
  attributes: LEAF_ATTRIBUTES.map(([, size, at], shaderLocation) => ({
    shaderLocation,
    format: FLOAT32_FORMATS[size - 1],
    offset: at * 4
  }))
};

const LEAF_FRAME = uniformLayout('LeafFrame', [
  { name: 'u_ambient', type: 'vec3', precision: 'highp' },
  { name: 'u_basePerArt', type: 'float', precision: 'highp' },
  { name: 'u_tone', type: 'vec2', precision: 'highp' },
  { name: 'u_fieldLit', type: 'float', precision: 'highp' },
  { name: 'u_shade', type: 'float', precision: 'highp' }
]);

export interface LeafTextures {
  atlas: GpuTexture;
  light: GpuTexture;
}

export class FallingLeaves {
  readonly field = new LeafField();
  readonly bits = new TreeBits();
  private readonly data = new Float32Array((L.max + MAX_BITS) * FLOATS);
  private count = 0;
  private textures: LeafTextures | null = null;

  static create(gpu: GpuDevice, shaders: ShaderManager): FallingLeaves | null {
    const bindings = new PassBindings(gpu, PROGRAM, LEAF_FRAME, [
      { name: 'u_paintAtlas', sampleType: 'unfilterable-float' },
      { name: 'u_lightTexture', sampleType: 'unfilterable-float' }
    ]);
    const made = shaders.createPipeline(
      PROGRAM,
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: fragmentSource,
        attributes: Object.fromEntries(LEAF_ATTRIBUTES.map(([name], i) => [name, i])),
        buffers: [LEAF_LAYOUT],
        topology: 'triangle-strip',
        blend: ALPHA_BLEND,
        bindings: [bindings]
      })
    );
    const program = made.pipeline;
    if (!made.success || !program) {
      bindings.destroy();
      console.warn('[falling leaves] off:', made.error);
      return null;
    }
    return new FallingLeaves(gpu, program, bindings);
  }

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly program: GpuRenderPipeline,
    private readonly bindings: PassBindings,
    private readonly vbo = gpu.createBuffer({
      size: (L.max + MAX_BITS) * FLOATS * 4,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
    })
  ) {
    bindings.set('u_shade', SHADE);
  }

  prepare(secs: number, wind: WindClock, f: LeafFrame, textures: LeafTextures): void {
    this.count = 0;
    this.field.step(secs, wind, f);
    this.bits.step(secs, wind, f);
    let n = this.field.pack(this.data);
    const bits = this.bits.pack(wind, f);
    this.data.set(
      bits.subarray(0, Math.min(bits.length, this.data.length - n * FLOATS)),
      n * FLOATS
    );
    n += Math.min(bits.length, this.data.length - n * FLOATS) / FLOATS;
    if (n === 0) return;
    this.gpu.queue.writeBuffer(this.vbo, 0, this.data, 0, n * FLOATS);
    this.bindings.set('u_basePerArt', f.basePerArt);
    this.bindings.set('u_fieldLit', f.light.fieldLit ? 1 : 0);
    this.bindings.set('u_ambient', f.light.ambient);
    this.bindings.set('u_tone', f.light.tone);
    this.bindings.upload();
    this.textures = textures;
    this.count = n;
  }

  encode(pass: GpuRenderPass): number {
    if (this.count === 0 || !this.textures) return 0;
    pass.setPipeline(this.program);
    pass.setVertexBuffer(0, this.vbo);
    pass.setBindGroup(PASS_GROUP, this.bindings.group([this.textures.atlas, this.textures.light]));
    pass.draw(4, this.count);
    return 1;
  }

  dispose(): void {
    this.gpu.destroyBuffer(this.vbo);
    this.bindings.destroy();
  }
}
