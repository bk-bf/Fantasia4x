import type { FontAtlas } from './types.js';
import type { AddressMode, GpuDevice, GpuTexture, TextureFormat } from '../gpu/device.js';

export interface TextureOptions {
  filtering?: 'nearest' | 'linear';
  wrapping?: 'clamp' | 'repeat' | 'mirror';
  flipY?: boolean;
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

  private convertImageDataToRGBA(imageData: ImageData): Uint8Array {
    return new Uint8Array(imageData.data);
  }
}
