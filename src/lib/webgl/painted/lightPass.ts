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
import { uniformLayout } from '../../gpu/uniforms.js';
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
export const LIGHT_FIELD_UNIT = 6;

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
  { name: 'u_lightCount', type: 'int', precision: 'highp' },
  { name: 'u_lights', type: 'vec4', precision: 'highp', count: MAX_LIGHTS * 2 }
]);
const LIGHT_BYTES = 32;

export class PaintedLightPass {
  private readonly packed = new Float32Array(MAX_LIGHTS * 8);
  private readonly field: SizedTexture;
  private fieldSize: [number, number] = [0, 0];

  static create(gpu: GpuDevice, shaders: ShaderManager): PaintedLightPass | null {
    const bindings = new PassBindings(gpu, PROGRAM, [LIGHTS]);
    const made = shaders.createPipeline(PROGRAM, {
      glsl: bindings.glsl({ vertex: vertexSource, fragment: fragmentSource, attributes: {} }),
      layout: [bindings.layout],
      vertex: { buffers: [] },
      primitive: { topology: 'triangle-list' },
      fragment: { targets: [{ format: 'rgba8unorm' }] }
    });
    const program = made.pipeline;
    if (!made.success || !program) {
      bindings.destroy();
      console.warn('[painted light] off:', made.error);
      return null;
    }
    return new PaintedLightPass(gpu, program, bindings);
  }

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly program: GpuRenderPipeline,
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
    this.bindings.set('u_lightCount', count);
    this.bindings.set('u_lights', this.packed.subarray(0, count * 8));
    this.bindings.upload({ [LIGHTS.name]: LIGHTS.offsets.u_lights + count * LIGHT_BYTES });
  }

  encode(encoder: GpuCommandEncoder): number {
    const pass = encoder.beginRenderPass({
      label: 'light field',
      colorAttachments: [{ view: this.field.texture, loadOp: 'load', storeOp: 'store' }]
    });
    pass.setBindGroup(FRAME_GROUP, frameBindings(this.gpu).group);
    pass.setBindGroup(PASS_GROUP, this.bindings.group());
    pass.setPipeline(this.program);
    pass.draw(3);
    pass.end();
    this.gpu.setTextureSlot(LIGHT_FIELD_UNIT);
    this.gpu.bindTexture(this.field.texture);
    this.gpu.setTextureSlot(0);
    return 1;
  }

  dispose(): void {
    this.field.destroy();
    this.bindings.destroy();
    this.gpu.destroyRenderPipeline(this.program);
  }
}
