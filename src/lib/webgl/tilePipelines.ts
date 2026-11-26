import {
  ALPHA_BLEND,
  FLOAT32_FORMATS,
  type BlendState,
  type CompareFunction,
  type GlslSources,
  type RenderPipelineDescriptor,
  type TextureFormat,
  type VertexBufferLayout
} from '../gpu/device.js';
import type { ShaderCompilationResult, ShaderManager } from './shaders.js';

export const GLYPH_VERTEX_FLOATS = 24;
export const ROW_VERTEX_FLOATS = 32;

const GLYPH_ATTRIBUTES: [string, number, number][] = [
  ['a_position', 2, 0],
  ['a_texCoord', 2, 2],
  ['a_foreground', 3, 4],
  ['a_background', 4, 7],
  ['a_detail', 3, 11],
  ['a_outline', 3, 14],
  ['a_uvBounds', 4, 17],
  ['a_light', 3, 21]
];

const ROW_ATTRIBUTES: [string, number, number][] = [
  ['a_row', 1, GLYPH_VERTEX_FLOATS],
  ['a_vein', 4, GLYPH_VERTEX_FLOATS + 1],
  ['a_veinNear', 1, GLYPH_VERTEX_FLOATS + 5],
  ['a_sway', 1, GLYPH_VERTEX_FLOATS + 6],
  ['a_tree', 1, GLYPH_VERTEX_FLOATS + 7]
];

export const TILE_ATTRIBUTES: Record<string, number> = Object.fromEntries(
  [...GLYPH_ATTRIBUTES, ...ROW_ATTRIBUTES].map(([name], location) => [name, location])
);

export function tileVertexLayout(rowDepth: boolean): VertexBufferLayout {
  const attributes = rowDepth ? [...GLYPH_ATTRIBUTES, ...ROW_ATTRIBUTES] : GLYPH_ATTRIBUTES;
  return {
    arrayStride: (rowDepth ? ROW_VERTEX_FLOATS : GLYPH_VERTEX_FLOATS) * 4,
    stepMode: 'vertex',
    attributes: attributes.map(([name, size, offset]) => ({
      shaderLocation: TILE_ATTRIBUTES[name],
      format: FLOAT32_FORMATS[size - 1],
      offset: offset * 4
    }))
  };
}

export type TilePipeline = 'terrain' | 'flat' | 'overlay' | 'shadow';

export const TILE_PIPELINE: Record<TilePipeline, string> = {
  terrain: 'tileRenderer',
  flat: 'tileRenderer.flat',
  overlay: 'tileRenderer.overlay',
  shadow: 'tileRenderer.shadow'
};

const SHADOW_BLEND: BlendState = {
  color: { srcFactor: 'zero', dstFactor: 'src' },
  alpha: { srcFactor: 'zero', dstFactor: 'src' }
};

const STATES: Record<TilePipeline, [BlendState | undefined, CompareFunction, boolean]> = {
  terrain: [undefined, 'always', false],
  flat: [ALPHA_BLEND, 'always', false],
  overlay: [ALPHA_BLEND, 'less-equal', true],
  shadow: [SHADOW_BLEND, 'less', true]
};

export function tilePipelines(
  glsl: Omit<GlslSources, 'attributes'>,
  format: TextureFormat,
  rowDepth: boolean
): [string, Omit<RenderPipelineDescriptor, 'label' | 'debug'>][] {
  return (Object.keys(STATES) as TilePipeline[]).map((p) => {
    const [blend, depthCompare, depthWriteEnabled] = STATES[p];
    return [
      TILE_PIPELINE[p],
      {
        glsl: { ...glsl, attributes: TILE_ATTRIBUTES },
        vertex: { buffers: [tileVertexLayout(rowDepth)] },
        primitive: { topology: 'triangle-list' },
        fragment: { targets: [{ format, blend }] },
        ...(rowDepth
          ? { depthStencil: { format: 'depth24plus', depthCompare, depthWriteEnabled } }
          : {})
      }
    ];
  });
}

export function addTilePipelines(
  shaders: ShaderManager,
  glsl: Omit<GlslSources, 'attributes'>,
  format: TextureFormat,
  rowDepth: boolean
): ShaderCompilationResult {
  for (const [name, desc] of tilePipelines(glsl, format, rowDepth)) {
    const made = shaders.createPipeline(name, desc);
    if (!made.success) return made;
  }
  return { success: true };
}
