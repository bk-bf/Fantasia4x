import type {
  AddressMode,
  BlendFactor,
  BufferUsage,
  CompareFunction,
  FilterMode,
  PrimitiveTopology,
  TextureFormat,
  VertexFormat
} from '../device.js';

export interface GlTextureFormat {
  internalFormat: number;
  format: number;
  type: number;
}

export function textureFormat(gl: WebGL2RenderingContext, f: TextureFormat): GlTextureFormat {
  switch (f) {
    case 'rgba8unorm':
      return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    case 'rg8unorm':
      return { internalFormat: gl.RG8, format: gl.RG, type: gl.UNSIGNED_BYTE };
    case 'r8unorm':
      return { internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE };
    case 'r8uint':
      return { internalFormat: gl.R8UI, format: gl.RED_INTEGER, type: gl.UNSIGNED_BYTE };
    case 'rgba16uint':
      return { internalFormat: gl.RGBA16UI, format: gl.RGBA_INTEGER, type: gl.UNSIGNED_SHORT };
    case 'rgba16float':
      return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.FLOAT };
    case 'rgba32float':
      return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT };
    case 'legacy-rgba':
      return { internalFormat: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    case 'legacy-rgb':
      return { internalFormat: gl.RGB, format: gl.RGB, type: gl.UNSIGNED_BYTE };
    case 'legacy-luminance':
      return { internalFormat: gl.LUMINANCE, format: gl.LUMINANCE, type: gl.UNSIGNED_BYTE };
    case 'legacy-alpha':
      return { internalFormat: gl.ALPHA, format: gl.ALPHA, type: gl.UNSIGNED_BYTE };
  }
}

export function filterMode(gl: WebGL2RenderingContext, f: FilterMode): number {
  return f === 'nearest' ? gl.NEAREST : gl.LINEAR;
}

export function addressMode(gl: WebGL2RenderingContext, m: AddressMode): number {
  switch (m) {
    case 'clamp-to-edge':
      return gl.CLAMP_TO_EDGE;
    case 'repeat':
      return gl.REPEAT;
    case 'mirror-repeat':
      return gl.MIRRORED_REPEAT;
  }
}

export function blendFactor(gl: WebGL2RenderingContext, f: BlendFactor): number {
  switch (f) {
    case 'zero':
      return gl.ZERO;
    case 'one':
      return gl.ONE;
    case 'src':
      return gl.SRC_COLOR;
    case 'src-alpha':
      return gl.SRC_ALPHA;
    case 'one-minus-src-alpha':
      return gl.ONE_MINUS_SRC_ALPHA;
  }
}

export function compareFunction(gl: WebGL2RenderingContext, c: CompareFunction): number {
  return c === 'less' ? gl.LESS : gl.LEQUAL;
}

export function topology(gl: WebGL2RenderingContext, t: PrimitiveTopology): number {
  return t === 'triangle-list' ? gl.TRIANGLES : gl.TRIANGLE_STRIP;
}

export function bufferUsage(gl: WebGL2RenderingContext, u: BufferUsage): number {
  return u === 'static' ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW;
}

export function vertexComponents(f: VertexFormat): number {
  switch (f) {
    case 'float32':
      return 1;
    case 'float32x2':
      return 2;
    case 'float32x3':
      return 3;
    case 'float32x4':
      return 4;
  }
}
