import {
  BufferUsage,
  ShaderStage,
  TextureUsage,
  type BindGroupLayoutEntry,
  type BlendState,
  type DepthStencilState,
  type StencilFaceState,
  type VertexBufferLayout
} from '../device.js';

const flags = (usage: number, map: readonly (readonly [number, number])[]): number =>
  map.reduce((out, [ours, theirs]) => ((usage & ours) !== 0 ? out | theirs : out), 0);

export function bufferUsage(usage: number): number {
  return flags(usage, [
    [BufferUsage.VERTEX, GPUBufferUsage.VERTEX],
    [BufferUsage.UNIFORM, GPUBufferUsage.UNIFORM],
    [BufferUsage.COPY_DST, GPUBufferUsage.COPY_DST]
  ]);
}

export function textureUsage(usage: number): number {
  return flags(usage, [
    [TextureUsage.TEXTURE_BINDING, GPUTextureUsage.TEXTURE_BINDING],
    [TextureUsage.COPY_DST, GPUTextureUsage.COPY_DST],
    [TextureUsage.RENDER_ATTACHMENT, GPUTextureUsage.RENDER_ATTACHMENT]
  ]);
}

function stages(visibility: number): number {
  return flags(visibility, [
    [ShaderStage.VERTEX, GPUShaderStage.VERTEX],
    [ShaderStage.FRAGMENT, GPUShaderStage.FRAGMENT]
  ]);
}

export function layoutEntry(e: BindGroupLayoutEntry): GPUBindGroupLayoutEntry {
  const visibility = stages(e.visibility);
  if ('buffer' in e)
    return {
      binding: e.binding,
      visibility,
      buffer: {
        type: 'uniform',
        hasDynamicOffset: e.buffer.hasDynamicOffset ?? false,
        minBindingSize: e.buffer.minBindingSize
      }
    };
  if ('texture' in e)
    return { binding: e.binding, visibility, texture: { sampleType: e.texture.sampleType } };
  return { binding: e.binding, visibility, sampler: { type: e.sampler.type } };
}

export function blendState(blend: BlendState | undefined): GPUBlendState | undefined {
  if (!blend) return undefined;
  return {
    color: { ...blend.color, operation: 'add' },
    alpha: { ...blend.alpha, operation: 'add' }
  };
}

const STENCIL_MASK = 0xff;

function stencilFace(face: StencilFaceState | undefined): GPUStencilFaceState {
  return face
    ? { compare: face.compare, passOp: face.passOp, failOp: 'keep', depthFailOp: 'keep' }
    : {};
}

export function depthStencilState(
  ds: DepthStencilState | undefined
): GPUDepthStencilState | undefined {
  if (!ds) return undefined;
  return {
    format: ds.format,
    depthWriteEnabled: ds.depthWriteEnabled,
    depthCompare: ds.depthCompare,
    stencilFront: stencilFace(ds.stencilFront),
    stencilBack: stencilFace(ds.stencilBack),
    stencilReadMask: STENCIL_MASK,
    stencilWriteMask: STENCIL_MASK
  };
}

export function vertexBuffers(buffers: VertexBufferLayout[]): GPUVertexBufferLayout[] {
  return buffers.map((b) => ({
    arrayStride: b.arrayStride,
    stepMode: b.stepMode,
    attributes: b.attributes.map((a) => ({ ...a }))
  }));
}
