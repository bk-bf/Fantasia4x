import type {
  GpuDevice,
  GpuRenderPass,
  GpuRenderPipeline,
  GpuTexture,
  TextureFormat,
  DepthFormat
} from '../gpu/device.js';
import { uniformLayout, type Precision, type UniformMember } from '../gpu/uniforms.js';
import { DRAW_GROUP, DrawSlices } from './drawSlices.js';
import { PASS_GROUP, PassBindings, blankTexture } from './passBindings.js';
import type { ShaderManager, ShaderSource } from './shaders.js';
import { TILE_PIPELINE, tilePipelines, type TilePipeline } from './tilePipelines.js';
import { CUT_MAX } from './painted/cutaway.js';

const member =
  (precision: Precision) =>
  (name: string, type: UniformMember['type'], count?: number): UniformMember => ({
    name,
    type,
    precision,
    ...(count === undefined ? {} : { count })
  });
const high = member('highp');
const medium = member('mediump');

export const TILE_STATIC = uniformLayout('TileStatic', [
  medium('u_shade', 'vec3'),
  high('u_shadowDepth', 'float'),
  medium('u_paintTexelSize', 'vec2'),
  medium('u_texelSize', 'vec2'),
  high('u_rockRamp', 'vec2'),
  high('u_snowRamp', 'vec2'),
  medium('u_rockLift', 'float'),
  high('u_atlasScale', 'float'),
  high('u_rowPx', 'float'),
  high('u_rowDepth', 'float'),
  medium('u_alphaCut', 'float')
]);

export const TILE_FRAME = uniformLayout('TileFrame', [
  high('u_cut', 'vec4', CUT_MAX),
  high('u_wind', 'vec4'),
  high('u_swayShape', 'vec4'),
  high('u_gustShape', 'vec4'),
  high('u_gustNoise', 'vec4'),
  high('u_windPhase', 'vec4'),
  high('u_treeWind', 'vec4'),
  high('u_treeTime', 'vec4'),
  high('u_treeVeil', 'vec3'),
  high('u_basePerArt', 'float'),
  medium('u_ambient', 'vec3'),
  high('u_swayReach', 'float'),
  high('u_windDir', 'vec2'),
  medium('u_lightFlicker', 'float'),
  medium('u_fieldLit', 'float'),
  medium('u_saturation', 'float'),
  medium('u_brightness', 'float'),
  medium('u_snow', 'float'),
  medium('u_cuts', 'float')
]);

const TILE_DRAW = uniformLayout('TileDraw', [
  medium('u_glyphOnly', 'float'),
  medium('u_bgOnly', 'float'),
  medium('u_shadowPass', 'float')
]);

export type TileSlice = 'terrain' | 'wash' | 'overlay' | 'shadow';

const SLICES: readonly [TileSlice, number, number, number][] = [
  ['terrain', 0, 0, 0],
  ['wash', 1, 1, 0],
  ['overlay', 1, 0, 0],
  ['shadow', 1, 0, 1]
];

const TILE_TEXTURES = [
  { name: 'u_fontAtlas', sampleType: 'float', filter: 'nearest' },
  { name: 'u_paintAtlas', sampleType: 'float', filter: 'nearest' },
  { name: 'u_lightAtlas', sampleType: 'float', filter: 'nearest' },
  { name: 'u_lightTexture', sampleType: 'unfilterable-float' },
  { name: 'u_rockTexture', sampleType: 'unfilterable-float' },
  { name: 'u_veinTexture', sampleType: 'unfilterable-float' },
  { name: 'u_tierTileTexture', sampleType: 'uint' },
  { name: 'u_tierNoiseTexture', sampleType: 'unfilterable-float' }
] as const;

export type TileTextures = Record<(typeof TILE_TEXTURES)[number]['name'], GpuTexture | null>;

export class TileShading {
  private textures: GpuTexture[];

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly bindings: PassBindings,
    private readonly draws: DrawSlices,
    private readonly pipelines: ReadonlyMap<TilePipeline, GpuRenderPipeline>
  ) {
    SLICES.forEach(([, u_glyphOnly, u_bgOnly, u_shadowPass], i) =>
      draws.stage(i, { u_glyphOnly, u_bgOnly, u_shadowPass })
    );
    draws.upload(SLICES.length);
    this.textures = TILE_TEXTURES.map(() => blankTexture(gpu));
  }

  static create(
    gpu: GpuDevice,
    shaders: ShaderManager,
    sources: ShaderSource,
    format: TextureFormat,
    depth: DepthFormat | null
  ): TileShading | { error: string } {
    const bindings = new PassBindings(gpu, 'tile', [TILE_STATIC, TILE_FRAME], TILE_TEXTURES);
    const draws = new DrawSlices(gpu, 'tile', TILE_DRAW);
    const pipelines = new Map<TilePipeline, GpuRenderPipeline>();
    for (const [name, desc] of tilePipelines(sources, format, depth, [bindings, draws])) {
      const made = shaders.createPipeline(name, desc);
      if (!made.success || !made.pipeline) {
        bindings.destroy();
        draws.destroy();
        return { error: made.error ?? `${name} did not build` };
      }
      const key = (Object.keys(TILE_PIPELINE) as TilePipeline[]).find(
        (p) => TILE_PIPELINE[p] === name
      )!;
      pipelines.set(key, made.pipeline);
    }
    return new TileShading(gpu, bindings, draws, pipelines);
  }

  set(name: string, value: number | ArrayLike<number>): void {
    this.bindings.set(name, value);
  }

  setTextures(textures: TileTextures): void {
    const blank = blankTexture(this.gpu);
    this.textures = TILE_TEXTURES.map((t) => textures[t.name] ?? blank);
  }

  upload(): void {
    this.bindings.upload();
  }

  use(pass: GpuRenderPass, pipeline: TilePipeline, slice: TileSlice): boolean {
    const made = this.pipelines.get(pipeline);
    if (!made) return false;
    pass.setPipeline(made);
    pass.setBindGroup(PASS_GROUP, this.bindings.group(this.textures));
    pass.setBindGroup(DRAW_GROUP, this.draws.group, [
      this.draws.offset(SLICES.findIndex(([s]) => s === slice))
    ]);
    return true;
  }

  dispose(): void {
    this.bindings.destroy();
    this.draws.destroy();
  }
}
