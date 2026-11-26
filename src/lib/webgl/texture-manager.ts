import type { FontAtlas } from './types.js';
import type { AddressMode, GpuDevice, GpuTexture, TextureFormat } from '../gpu/device.js';

export interface TextureOptions {
  filtering?: 'nearest' | 'linear';
  wrapping?: 'clamp' | 'repeat' | 'mirror';
  format?: 'rgba' | 'rgb' | 'luminance' | 'alpha';
  flipY?: boolean;
  generateMipmap?: boolean;
}

export interface TextureInfo {
  texture: GpuTexture;
  width: number;
  height: number;
  format: TextureFormat;
  id: string;
  memoryUsage: number;
}

export class TextureManager {
  private gpu: GpuDevice;
  private textures = new Map<string, TextureInfo>();
  private totalMemoryUsage = 0;
  private debug: boolean;

  constructor(gpu: GpuDevice, debug: boolean = false) {
    this.gpu = gpu;
    this.debug = debug;

    if (this.debug) {
      console.log('🎨 TextureManager initialized');
    }
  }

  createFontAtlasTexture(atlas: FontAtlas, options: TextureOptions = {}): GpuTexture | null {
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

    const gpu = this.gpu;
    const texture = gpu.createTexture();

    if (!texture) {
      console.error('❌ Failed to create WebGL texture');
      return null;
    }

    try {
      gpu.bindTexture(texture);

      const filtering = options.filtering || 'nearest';
      const wrapping = options.wrapping || 'clamp';

      const wrapMode = this.getWrapMode(wrapping);
      gpu.setSampler({
        minFilter: filtering,
        magFilter: filtering,
        addressModeU: wrapMode,
        addressModeV: wrapMode
      });

      const format: TextureFormat = 'legacy-rgba';

      const textureData = this.convertImageDataToRGBA(atlas.texture);

      gpu.writeTexture({ format, width: atlas.atlasWidth, height: atlas.atlasHeight }, textureData);

      const bytesPerPixel = 4;
      const memoryUsage = atlas.atlasWidth * atlas.atlasHeight * bytesPerPixel;

      const textureInfo: TextureInfo = {
        texture,
        width: atlas.atlasWidth,
        height: atlas.atlasHeight,
        format,
        id: textureId,
        memoryUsage
      };

      this.textures.set(textureId, textureInfo);
      this.totalMemoryUsage += memoryUsage;

      gpu.bindTexture(null);

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
      gpu.destroyTexture(texture);
      return null;
    }
  }

  createTextureFromImageData(
    data: ImageData | Uint8Array,
    width: number,
    height: number,
    options: TextureOptions = {},
    textureId?: string
  ): GpuTexture | null {
    const gpu = this.gpu;
    const texture = gpu.createTexture();

    if (!texture) {
      console.error('❌ Failed to create WebGL texture');
      return null;
    }

    const id = textureId || `texture-${Date.now()}`;

    try {
      gpu.bindTexture(texture);

      this.configureTextureParameters(options);

      const format = this.getTextureFormat(options.format || 'rgba');

      const textureData = data instanceof ImageData ? data.data : data;

      gpu.writeTexture({ format, width, height }, textureData);

      if (options.generateMipmap) {
        gpu.generateMipmaps();
      }

      const bytesPerPixel = this.getBytesPerPixel(options.format || 'rgba');
      const memoryUsage = width * height * bytesPerPixel;

      const textureInfo: TextureInfo = {
        texture,
        width,
        height,
        format,
        id,
        memoryUsage
      };

      this.textures.set(id, textureInfo);
      this.totalMemoryUsage += memoryUsage;

      gpu.bindTexture(null);

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
      gpu.destroyTexture(texture);
      return null;
    }
  }

  bindTexture(textureId: string, unit: number = 0): boolean {
    const textureInfo = this.textures.get(textureId);
    if (!textureInfo) {
      console.error(`❌ Texture not found: ${textureId}`);
      return false;
    }

    const gpu = this.gpu;
    gpu.setTextureSlot(unit);
    gpu.bindTexture(textureInfo.texture);
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

    this.gpu.destroyTexture(textureInfo.texture);
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
    const gpu = this.gpu;

    for (const textureInfo of this.textures.values()) {
      gpu.destroyTexture(textureInfo.texture);
    }

    this.textures.clear();
    this.totalMemoryUsage = 0;

    if (this.debug) {
      console.log('🧹 TextureManager disposed');
    }
  }

  private getWrapMode(wrapping: string): AddressMode {
    switch (wrapping) {
      case 'repeat':
        return 'repeat';
      case 'mirror':
        return 'mirror-repeat';
      case 'clamp':
      default:
        return 'clamp-to-edge';
    }
  }

  private configureTextureParameters(options: TextureOptions): void {
    const gpu = this.gpu;

    const filtering = options.filtering || 'linear';
    const wrapping = options.wrapping || 'clamp';

    const wrapMode = this.getWrapMode(wrapping);
    gpu.setSampler({
      minFilter: filtering,
      magFilter: filtering,
      addressModeU: wrapMode,
      addressModeV: wrapMode
    });
  }

  private getTextureFormat(format: string): TextureFormat {
    switch (format) {
      case 'rgba':
        return 'legacy-rgba';
      case 'rgb':
        return 'legacy-rgb';
      case 'luminance':
        return 'legacy-luminance';
      case 'alpha':
        return 'legacy-alpha';
      default:
        return 'legacy-rgba';
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

export function validateTextureDimensions(width: number, height: number, gpu: GpuDevice): boolean {
  const maxSize = gpu.maxTextureSize();

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
