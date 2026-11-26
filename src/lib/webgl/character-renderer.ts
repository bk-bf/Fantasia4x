import type { FontAtlas } from './types.js';
import type { ShaderManager } from './shaders.js';
import type { GpuBuffer, GpuDevice, GpuVertexLayout } from '../gpu/device.js';

export interface CharacterRenderOptions {
  char: string;
  x: number;
  y: number;
  foregroundColor: number[];
  backgroundColor?: number[];
}

export interface MultiCharacterRenderOptions {
  text: string;
  startX: number;
  startY: number;
  colors: number[][];
}

export class CharacterRenderer {
  private gpu: GpuDevice;
  private shaderManager: ShaderManager;
  private fontAtlas: FontAtlas;
  private debug: boolean;

  private vao: GpuVertexLayout | null = null;
  private vbo: GpuBuffer | null = null;
  private vertexCount: number = 0;

  constructor(gpu: GpuDevice, shaderManager: ShaderManager, fontAtlas: FontAtlas, debug = false) {
    this.gpu = gpu;
    this.shaderManager = shaderManager;
    this.fontAtlas = fontAtlas;
    this.debug = debug;
  }

  createSingleCharacter(options: CharacterRenderOptions): boolean {
    const { char, x, y, foregroundColor, backgroundColor = [0.0, 0.0, 0.0] } = options;

    const charInfo = this.fontAtlas.characters.get(char);
    if (!charInfo) {
      console.error(`❌ Character '${char}' not found in font atlas`);
      return false;
    }

    if (this.debug) {
      console.log('📋 Creating geometry for character:', char, 'at position:', x, y);
      console.log('📋 Character info:', charInfo);
    }

    const u1 = charInfo.x / this.fontAtlas.atlasWidth;
    const v1 = charInfo.y / this.fontAtlas.atlasHeight;
    const u2 = (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth;
    const v2 = (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight;

    const x1 = x + charInfo.xOffset;
    const y1 = y + charInfo.yOffset;
    const x2 = x1 + charInfo.width;
    const y2 = y1 + charInfo.height;

    const vertices = new Float32Array([
      x1,
      y1,
      u1,
      v1,
      foregroundColor[0],
      foregroundColor[1],
      foregroundColor[2],
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],
      x2,
      y1,
      u2,
      v1,
      foregroundColor[0],
      foregroundColor[1],
      foregroundColor[2],
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],
      x1,
      y2,
      u1,
      v2,
      foregroundColor[0],
      foregroundColor[1],
      foregroundColor[2],
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],

      x2,
      y1,
      u2,
      v1,
      foregroundColor[0],
      foregroundColor[1],
      foregroundColor[2],
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],
      x2,
      y2,
      u2,
      v2,
      foregroundColor[0],
      foregroundColor[1],
      foregroundColor[2],
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2],
      x1,
      y2,
      u1,
      v2,
      foregroundColor[0],
      foregroundColor[1],
      foregroundColor[2],
      backgroundColor[0],
      backgroundColor[1],
      backgroundColor[2]
    ]);

    return this.createGeometry(vertices, 6);
  }

  createMultipleCharacters(options: MultiCharacterRenderOptions): boolean {
    const { text, startX, startY, colors } = options;

    const fontSize = 16;
    const charSpacing = fontSize * 0.6;

    if (this.debug) {
      console.log(`📋 Creating geometry for text: "${text}" with ${colors.length} colors`);
    }

    const vertexData: number[] = [];
    let currentX = startX;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const color = colors[i] || [1.0, 1.0, 1.0];

      if (char === ' ') {
        currentX += charSpacing;
        continue;
      }

      const charInfo = this.fontAtlas.characters.get(char);
      if (!charInfo) {
        console.warn(`❌ Character '${char}' not found in font atlas, skipping`);
        currentX += charSpacing;
        continue;
      }

      const u1 = charInfo.x / this.fontAtlas.atlasWidth;
      const v1 = charInfo.y / this.fontAtlas.atlasHeight;
      const u2 = (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth;
      const v2 = (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight;

      const x1 = currentX + charInfo.xOffset;
      const y1 = startY + charInfo.yOffset;
      const x2 = x1 + charInfo.width;
      const y2 = y1 + charInfo.height;

      const bg = [0.0, 0.0, 0.0];

      const charVertices = [
        x1,
        y1,
        u1,
        v1,
        color[0],
        color[1],
        color[2],
        bg[0],
        bg[1],
        bg[2],
        x2,
        y1,
        u2,
        v1,
        color[0],
        color[1],
        color[2],
        bg[0],
        bg[1],
        bg[2],
        x1,
        y2,
        u1,
        v2,
        color[0],
        color[1],
        color[2],
        bg[0],
        bg[1],
        bg[2],

        x2,
        y1,
        u2,
        v1,
        color[0],
        color[1],
        color[2],
        bg[0],
        bg[1],
        bg[2],
        x2,
        y2,
        u2,
        v2,
        color[0],
        color[1],
        color[2],
        bg[0],
        bg[1],
        bg[2],
        x1,
        y2,
        u1,
        v2,
        color[0],
        color[1],
        color[2],
        bg[0],
        bg[1],
        bg[2]
      ];

      vertexData.push(...charVertices);

      currentX += charInfo.xAdvance || charSpacing;
    }

    if (this.debug) {
      console.log(`📋 Generated ${vertexData.length / 10} vertices for ${text.length} characters`);
    }

    const vertices = new Float32Array(vertexData);
    return this.createGeometry(vertices, vertexData.length / 10);
  }

  private createGeometry(vertices: Float32Array, vertexCount: number): boolean {
    const gpu = this.gpu;

    this.dispose();

    this.vao = gpu.createVertexLayout();
    if (!this.vao) {
      console.error('❌ Failed to create vertex array object');
      return false;
    }
    gpu.setVertexLayout(this.vao);

    this.vbo = gpu.createBuffer();
    if (!this.vbo) {
      console.error('❌ Failed to create vertex buffer object');
      return false;
    }
    gpu.setVertexBuffer(this.vbo);
    gpu.writeBuffer(vertices, 'static');

    const stride = 10 * 4;

    const positionLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_position');
    if (positionLocation >= 0) {
      gpu.vertexAttribute(positionLocation, { format: 'float32x2', stride, offset: 0 });
    }

    const texCoordLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_texCoord');
    if (texCoordLocation >= 0) {
      gpu.vertexAttribute(texCoordLocation, { format: 'float32x2', stride, offset: 2 * 4 });
    }

    const foregroundLocation = this.shaderManager.getAttributeLocation(
      'tileRenderer',
      'a_foreground'
    );
    if (foregroundLocation >= 0) {
      gpu.vertexAttribute(foregroundLocation, { format: 'float32x3', stride, offset: 4 * 4 });
    }

    const backgroundLocation = this.shaderManager.getAttributeLocation(
      'tileRenderer',
      'a_background'
    );
    if (backgroundLocation >= 0) {
      gpu.vertexAttribute(backgroundLocation, { format: 'float32x3', stride, offset: 7 * 4 });
    }

    this.vertexCount = vertexCount;
    gpu.setVertexLayout(null);

    if (this.debug) {
      console.log(`✅ Character geometry setup completed with ${this.vertexCount} vertices`);
    }

    return true;
  }

  render(): void {
    if (!this.vao || this.vertexCount === 0) return;

    const gpu = this.gpu;

    gpu.setVertexLayout(this.vao);
    gpu.draw('triangle-list', this.vertexCount);
    gpu.setVertexLayout(null);

    gpu.checkError('character rendering');
  }

  getVertexCount(): number {
    return this.vertexCount;
  }

  dispose(): void {
    const gpu = this.gpu;

    if (this.vbo) {
      gpu.destroyBuffer(this.vbo);
      this.vbo = null;
    }

    if (this.vao) {
      gpu.destroyVertexLayout(this.vao);
      this.vao = null;
    }

    this.vertexCount = 0;
  }
}
