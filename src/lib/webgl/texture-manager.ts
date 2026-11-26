import type { FontAtlas } from './types.js';
import {
  TextureUsage,
  type GpuDevice,
  type GpuTexture,
  type TextureFormat
} from '../gpu/device.js';

export function uploadFontAtlas(gpu: GpuDevice, atlas: FontAtlas): GpuTexture {
  const size = { width: atlas.atlasWidth, height: atlas.atlasHeight };
  const texture = gpu.createTexture({
    format: 'rgba8unorm',
    ...size,
    usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST
  });
  gpu.queue.writeTexture({ texture }, atlas.texture.data, { bytesPerRow: size.width * 4 }, size);
  return texture;
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

  createFontAtlasTexture(atlas: FontAtlas): GpuTexture | null {
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
    const format: TextureFormat = 'rgba8unorm';
    let texture: GpuTexture | null = null;

    try {
      texture = uploadFontAtlas(gpu, atlas);

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

      if (this.debug) {
        console.log(`✅ Font atlas texture created: ${textureId}`, {
          dimensions: `${atlas.atlasWidth}x${atlas.atlasHeight}`,
          memory: `${(memoryUsage / 1024).toFixed(1)}KB`
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
}
