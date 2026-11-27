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
  type GpuCommandEncoder,
  type GpuDevice,
  type GpuRenderPipeline,
  type GpuTexture
} from '../../gpu/device.js';
import { afterVersion, uniformLayout } from '../../gpu/uniforms.js';
import { SizedTexture } from '../sizedTexture.js';
import { FRAME_GROUP, frameBindings } from '../frameBindings.js';
import { PASS_GROUP, PassBindings } from '../passBindings.js';

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

export interface LightPassFrame {
  canvas: [number, number];
  artPerBase: number;
  artTile: number;
  view: TileRect;
  grade: LightGrade;
  lights: readonly PointLight[];
  time: number;
}

const LIGHTS = uniformLayout('LightFrame', [
  { name: 'u_weights', type: 'vec3', precision: 'highp' },
  { name: 'u_artPerBase', type: 'float', precision: 'highp' },
  { name: 'u_timeAmbient', type: 'vec3', precision: 'highp', count: 3 },
  { name: 'u_timeStrength', type: 'vec3', precision: 'highp' },
  { name: 'u_lights', type: 'vec4', precision: 'highp', count: MAX_LIGHTS * 2 }
]);
const LIGHT_BYTES = 32;
const LIGHT_STEP = 4;
const DARK_LIGHT = new Float32Array([-1e6, -1e6, 1, 0, 0, 0, 0, 0]);

export const lightSlots = (count: number): number => Math.ceil(count / LIGHT_STEP) * LIGHT_STEP;

const withSlots = (source: string, slots: number): string =>
  afterVersion(source, `const int LIGHT_SLOTS = ${slots};\n`);

export class PaintedLightPass {
  private readonly packed = new Float32Array(MAX_LIGHTS * 8);
  private readonly field: SizedTexture;
  private fieldSize: [number, number] = [0, 0];

  static create(gpu: GpuDevice, shaders: ShaderManager): PaintedLightPass | null {
    const bindings = new PassBindings(gpu, PROGRAM, [LIGHTS]);
    const programs: GpuRenderPipeline[] = [];
    for (let slots = 0; slots <= MAX_LIGHTS; slots += LIGHT_STEP) {
      const made = shaders.createPipeline(`${PROGRAM}-${slots}`, {
        glsl: bindings.glsl({
          vertex: vertexSource,
          fragment: withSlots(fragmentSource, slots),
          attributes: {}
        }),
        layout: [bindings.layout],
        vertex: { buffers: [] },
        primitive: { topology: 'triangle-list' },
        fragment: { targets: [{ format: 'rgba8unorm' }] }
      });
      if (!made.success || !made.pipeline) {
        for (const program of programs) gpu.destroyRenderPipeline(program);
        bindings.destroy();
        console.warn('[painted light] off:', made.error);
        return null;
      }
      programs.push(made.pipeline);
    }
    return new PaintedLightPass(gpu, programs, bindings);
  }

  private slots = 0;

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly programs: readonly GpuRenderPipeline[],
    private readonly bindings: PassBindings
  ) {
    this.field = new SizedTexture(gpu, 'rgba8unorm', 1, 1, FIELD_USAGE);
    bindings.set('u_timeAmbient', TIME_AMBIENT);
    bindings.set('u_timeStrength', TIME_STRENGTH);
  }

  get fieldTexture(): GpuTexture {
    return this.field.texture;
  }

  private sizeField(w: number, h: number): void {
    if (this.fieldSize[0] === w && this.fieldSize[1] === h) return;
    this.field.resize(w, h);
    this.fieldSize = [w, h];
  }

  prepare(f: LightPassFrame): void {
    const [w, h] = [Math.max(1, Math.round(f.canvas[0])), Math.max(1, Math.round(f.canvas[1]))];
    this.sizeField(w, h);
    const count = packLights(f.lights, f.view, f.artTile, f.time, this.packed);
    this.bindings.set('u_artPerBase', f.artPerBase);
    this.bindings.set('u_weights', f.grade.weights);
    this.slots = lightSlots(count);
    for (let i = count; i < this.slots; i++) this.packed.set(DARK_LIGHT, i * 8);
    this.bindings.set('u_lights', this.packed.subarray(0, this.slots * 8));
    this.bindings.upload({ [LIGHTS.name]: LIGHTS.offsets.u_lights + this.slots * LIGHT_BYTES });
  }

  encode(encoder: GpuCommandEncoder): number {
    const pass = encoder.beginRenderPass({
      label: 'light field',
      colorAttachments: [{ view: this.field.texture, loadOp: 'load', storeOp: 'store' }]
    });
    pass.setBindGroup(FRAME_GROUP, frameBindings(this.gpu).group);
    pass.setBindGroup(PASS_GROUP, this.bindings.group());
    pass.setPipeline(this.programs[this.slots / LIGHT_STEP]);
    pass.draw(3);
    pass.end();
    return 1;
  }

  dispose(): void {
    this.field.destroy();
    this.bindings.destroy();
    for (const program of this.programs) this.gpu.destroyRenderPipeline(program);
  }
}
