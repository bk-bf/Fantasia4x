import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedLight.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import {
  MAX_LIGHTS,
  TIMES,
  packLights,
  type LightGrade,
  type PointLight,
  type TileRect
} from './lightGrade.js';
import {
  TextureUsage,
  type GpuDevice,
  type GpuPipeline,
  type GpuRenderTarget,
  type GpuUniform,
  type GpuVertexLayout
} from '../../gpu/device.js';
import { SizedTexture } from '../sizedTexture.js';

const FIELD_USAGE = TextureUsage.TEXTURE_BINDING | TextureUsage.RENDER_ATTACHMENT;

const TIME_AMBIENT = new Float32Array([
  ...TIMES.day.ambient,
  ...TIMES.dusk.ambient,
  ...TIMES.night.ambient
]);
const TIME_STRENGTH = new Float32Array([
  TIMES.day.strength,
  TIMES.dusk.strength,
  TIMES.night.strength
]);

const PROGRAM = 'paintedLight';
export const LIGHT_FIELD_UNIT = 6;

export interface LightPassFrame {
  canvas: [number, number];
  viewOffset: [number, number];
  zoom: [number, number];
  artPerBase: number;
  artTile: number;
  view: TileRect;
  grade: LightGrade;
  lights: readonly PointLight[];
  time: number;
}

export class PaintedLightPass {
  private readonly gpu: GpuDevice;
  private readonly program: GpuPipeline;
  private readonly vao: GpuVertexLayout;
  private readonly at: Record<string, GpuUniform | null>;
  private readonly packed = new Float32Array(MAX_LIGHTS * 8);
  private field: SizedTexture;
  private readonly target: GpuRenderTarget;
  private fieldSize: [number, number] = [0, 0];

  static create(gpu: GpuDevice, shaders: ShaderManager): PaintedLightPass | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[painted light] off:', made.error);
      return null;
    }
    return new PaintedLightPass(gpu, program);
  }

  private constructor(gpu: GpuDevice, program: GpuPipeline) {
    this.gpu = gpu;
    this.program = program;
    this.vao = gpu.createVertexLayout()!;
    this.field = new SizedTexture(gpu, 'rgba8unorm', 1, 1, FIELD_USAGE);
    this.target = gpu.createRenderTarget()!;
    const names = [
      'u_canvas',
      'u_viewOffset',
      'u_zoom',
      'u_artPerBase',
      'u_weights',
      'u_timeAmbient',
      'u_timeStrength',
      'u_lightCount',
      'u_lights'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gpu.uniform(program, n)]));
  }

  private sizeField(w: number, h: number): void {
    if (this.fieldSize[0] === w && this.fieldSize[1] === h) return;
    const gpu = this.gpu;
    this.field.resize(w, h);
    gpu.attachColorTexture(this.target, this.field.texture);
    this.fieldSize = [w, h];
  }

  private use(f: LightPassFrame): void {
    const gpu = this.gpu;
    gpu.setPipeline(this.program);
    gpu.setVec2fv(this.at.u_canvas, f.canvas);
    gpu.setVec2fv(this.at.u_viewOffset, f.viewOffset);
    gpu.setVec2fv(this.at.u_zoom, f.zoom);
    gpu.setF32(this.at.u_artPerBase, f.artPerBase);
    gpu.setVec3fv(this.at.u_weights, f.grade.weights);
    gpu.setVec3fv(this.at.u_timeAmbient, TIME_AMBIENT);
    gpu.setVec3fv(this.at.u_timeStrength, TIME_STRENGTH);
    gpu.setVertexLayout(this.vao);
  }

  drawField(f: LightPassFrame): number {
    const gpu = this.gpu;
    const [w, h] = [Math.max(1, Math.round(f.canvas[0])), Math.max(1, Math.round(f.canvas[1]))];
    this.sizeField(w, h);
    const count = packLights(f.lights, f.view, f.artTile, f.time, this.packed);
    this.use(f);
    gpu.setI32(this.at.u_lightCount, count);
    if (count > 0) gpu.setVec4fv(this.at.u_lights, this.packed, 0, count * 8);
    gpu.beginRenderPass(this.target);
    gpu.setBlending(false);
    gpu.draw('triangle-list', 3);
    gpu.endRenderPass();
    gpu.setVertexLayout(null);
    gpu.setTextureSlot(LIGHT_FIELD_UNIT);
    gpu.bindTexture(this.field.texture);
    gpu.setTextureSlot(0);
    return 1;
  }

  dispose(): void {
    this.gpu.destroyRenderTarget(this.target);
    this.field.destroy();
    this.gpu.destroyVertexLayout(this.vao);
    this.gpu.destroyPipeline(this.program);
  }
}
