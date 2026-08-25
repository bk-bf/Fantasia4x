import type { FontAtlas } from './types.js';

export interface TextureOptions {
  filtering?: 'nearest' | 'linear';
  wrapping?: 'clamp' | 'repeat' | 'mirror';
  format?: 'rgba' | 'rgb' | 'luminance' | 'alpha';
  flipY?: boolean;
  generateMipmap?: boolean;
}

export interface TextureInfo {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number;
  type: number;
  id: string;
  memoryUsage: number;
}

export class TextureManager {
  private gl: WebGL2RenderingContext;
  private textures = new Map<string, TextureInfo>();
  private totalMemoryUsage = 0;
  private debug: boolean;

  constructor(gl: WebGL2RenderingContext, debug: boolean = false) {
    this.gl = gl;
    this.debug = debug;

    if (this.debug) {
      console.log('🎨 TextureManager initialized');
    }
  }

  createFontAtlasTexture(atlas: FontAtlas, options: TextureOptions = {}): WebGLTexture | null {
    const textureId = `font-atlas-${atlas.fontFamily}-${atlas.fontSize}`;

    if (this.debug) {
      console.log(`🔄 Creating font atlas texture: ${textureId}`);
    }

    if (this.textures.has(textureId)) {
      if (this.debug) {
        console.log(`📋 Using cached font atlas texture: ${textureId}`);
      }
      return this.textures.get(textureId)!.texture;
    }

    const gl = this.gl;
    const texture = gl.createTexture();

    if (!texture) {
      console.error('❌ Failed to create WebGL texture');
      return null;
    }

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);

      const filtering = options.filtering || 'nearest';
      const wrapping = options.wrapping || 'clamp';

      const minFilter = filtering === 'nearest' ? gl.NEAREST : gl.LINEAR;
      const magFilter = filtering === 'nearest' ? gl.NEAREST : gl.LINEAR;

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

      const wrapMode = this.getWrapMode(wrapping);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);

      const format = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;

      const textureData = this.convertImageDataToRGBA(atlas.texture);

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        format,
        atlas.atlasWidth,
        atlas.atlasHeight,
        0,
        format,
        type,
        textureData
      );

      const bytesPerPixel = 4;
      const memoryUsage = atlas.atlasWidth * atlas.atlasHeight * bytesPerPixel;

      const textureInfo: TextureInfo = {
        texture,
        width: atlas.atlasWidth,
        height: atlas.atlasHeight,
        format,
        type,
        id: textureId,
        memoryUsage
      };

      this.textures.set(textureId, textureInfo);
      this.totalMemoryUsage += memoryUsage;

      gl.bindTexture(gl.TEXTURE_2D, null);

      if (this.debug) {
        console.log(`✅ Font atlas texture created: ${textureId}`, {
          dimensions: `${atlas.atlasWidth}x${atlas.atlasHeight}`,
          memory: `${(memoryUsage / 1024).toFixed(1)}KB`,
          filtering,
          wrapping
        });
      }

      return texture;
    } catch (error) {
      console.error('❌ Failed to create font atlas texture:', error);
      gl.deleteTexture(texture);
      return null;
    }
  }

  createTextureFromImageData(
    data: ImageData | Uint8Array,
    width: number,
    height: number,
    options: TextureOptions = {},
    textureId?: string
  ): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();

    if (!texture) {
      console.error('❌ Failed to create WebGL texture');
      return null;
    }

    const id = textureId || `texture-${Date.now()}`;

    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);

      this.configureTextureParameters(options);

      const { format, internalFormat, type } = this.getTextureFormat(options.format || 'rgba');

      const textureData = data instanceof ImageData ? data.data : data;

      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, textureData);

      if (options.generateMipmap) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }

      const bytesPerPixel = this.getBytesPerPixel(options.format || 'rgba');
      const memoryUsage = width * height * bytesPerPixel;

      const textureInfo: TextureInfo = {
        texture,
        width,
        height,
        format,
        type,
        id,
        memoryUsage
      };

      this.textures.set(id, textureInfo);
      this.totalMemoryUsage += memoryUsage;

      gl.bindTexture(gl.TEXTURE_2D, null);

      if (this.debug) {
        console.log(`✅ Texture created: ${id}`, {
          dimensions: `${width}x${height}`,
          memory: `${(memoryUsage / 1024).toFixed(1)}KB`,
          format: options.format || 'rgba'
        });
      }

      return texture;
    } catch (error) {
      console.error(`❌ Failed to create texture ${id}:`, error);
      gl.deleteTexture(texture);
      return null;
    }
  }

  bindTexture(textureId: string, unit: number = 0): boolean {
    const textureInfo = this.textures.get(textureId);
    if (!textureInfo) {
      console.error(`❌ Texture not found: ${textureId}`);
      return false;
    }

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
    return true;
  }

  getTextureInfo(textureId: string): TextureInfo | undefined {
    return this.textures.get(textureId);
  }

  deleteTexture(textureId: string): boolean {
    const textureInfo = this.textures.get(textureId);
    if (!textureInfo) {
      console.warn(`⚠️ Texture not found for deletion: ${textureId}`);
      return false;
    }

    this.gl.deleteTexture(textureInfo.texture);
    this.totalMemoryUsage -= textureInfo.memoryUsage;
    this.textures.delete(textureId);

    if (this.debug) {
      console.log(`🗑️ Texture deleted: ${textureId}`);
    }

    return true;
  }

  getMemoryStats() {
    return {
      totalTextures: this.textures.size,
      totalMemoryUsage: this.totalMemoryUsage,
      totalMemoryMB: (this.totalMemoryUsage / (1024 * 1024)).toFixed(2),
      textures: Array.from(this.textures.values()).map((info) => ({
        id: info.id,
        dimensions: `${info.width}x${info.height}`,
        memoryKB: (info.memoryUsage / 1024).toFixed(1)
      }))
    };
  }

  dispose(): void {
    const gl = this.gl;

    for (const textureInfo of this.textures.values()) {
      gl.deleteTexture(textureInfo.texture);
    }

    this.textures.clear();
    this.totalMemoryUsage = 0;

    if (this.debug) {
      console.log('🧹 TextureManager disposed');
    }
  }

  private getWrapMode(wrapping: string): number {
    const gl = this.gl;
    switch (wrapping) {
      case 'repeat':
        return gl.REPEAT;
      case 'mirror':
        return gl.MIRRORED_REPEAT;
      case 'clamp':
      default:
        return gl.CLAMP_TO_EDGE;
    }
  }

  private configureTextureParameters(options: TextureOptions): void {
    const gl = this.gl;

    const filtering = options.filtering || 'linear';
    const wrapping = options.wrapping || 'clamp';

    const minFilter = filtering === 'nearest' ? gl.NEAREST : gl.LINEAR;
    const magFilter = filtering === 'nearest' ? gl.NEAREST : gl.LINEAR;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

    const wrapMode = this.getWrapMode(wrapping);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
  }

  private getTextureFormat(format: string): {
    format: number;
    internalFormat: number;
    type: number;
  } {
    const gl = this.gl;

    switch (format) {
      case 'rgba':
        return { format: gl.RGBA, internalFormat: gl.RGBA, type: gl.UNSIGNED_BYTE };
      case 'rgb':
        return { format: gl.RGB, internalFormat: gl.RGB, type: gl.UNSIGNED_BYTE };
      case 'luminance':
        return { format: gl.LUMINANCE, internalFormat: gl.LUMINANCE, type: gl.UNSIGNED_BYTE };
      case 'alpha':
        return { format: gl.ALPHA, internalFormat: gl.ALPHA, type: gl.UNSIGNED_BYTE };
      default:
        return { format: gl.RGBA, internalFormat: gl.RGBA, type: gl.UNSIGNED_BYTE };
    }
  }

  private getBytesPerPixel(format: string): number {
    switch (format) {
      case 'rgba':
        return 4;
      case 'rgb':
        return 3;
      case 'luminance':
      case 'alpha':
        return 1;
      default:
        return 4;
    }
  }

  private convertImageDataToRGBA(imageData: ImageData): Uint8Array {
    return new Uint8Array(imageData.data);
  }
}

export function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number): number {
  return Math.pow(2, Math.ceil(Math.log2(value)));
}

export function validateTextureDimensions(
  width: number,
  height: number,
  gl: WebGL2RenderingContext
): boolean {
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  if (width > maxSize || height > maxSize) {
    console.error(`❌ Texture dimensions ${width}x${height} exceed maximum size ${maxSize}`);
    return false;
  }

  if (width <= 0 || height <= 0) {
    console.error('❌ Texture dimensions must be positive');
    return false;
  }

  return true;
}
