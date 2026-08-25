import type { FontAtlas } from './types.js';
import type { ShaderManager } from './shaders.js';
import { checkWebGLError } from './utils.js';

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
  private gl: WebGL2RenderingContext;
  private shaderManager: ShaderManager;
  private fontAtlas: FontAtlas;
  private debug: boolean;

  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private vertexCount: number = 0;

  constructor(
    gl: WebGL2RenderingContext,
    shaderManager: ShaderManager,
    fontAtlas: FontAtlas,
    debug = false
  ) {
    this.gl = gl;
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
    const gl = this.gl;

    this.dispose();

    this.vao = gl.createVertexArray();
    if (!this.vao) {
      console.error('❌ Failed to create vertex array object');
      return false;
    }
    gl.bindVertexArray(this.vao);

    this.vbo = gl.createBuffer();
    if (!this.vbo) {
      console.error('❌ Failed to create vertex buffer object');
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const stride = 10 * 4;

    const positionLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_position');
    if (positionLocation >= 0) {
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
    }

    const texCoordLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_texCoord');
    if (texCoordLocation >= 0) {
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * 4);
    }

    const foregroundLocation = this.shaderManager.getAttributeLocation(
      'tileRenderer',
      'a_foreground'
    );
    if (foregroundLocation >= 0) {
      gl.enableVertexAttribArray(foregroundLocation);
      gl.vertexAttribPointer(foregroundLocation, 3, gl.FLOAT, false, stride, 4 * 4);
    }

    const backgroundLocation = this.shaderManager.getAttributeLocation(
      'tileRenderer',
      'a_background'
    );
    if (backgroundLocation >= 0) {
      gl.enableVertexAttribArray(backgroundLocation);
      gl.vertexAttribPointer(backgroundLocation, 3, gl.FLOAT, false, stride, 7 * 4);
    }

    this.vertexCount = vertexCount;
    gl.bindVertexArray(null);

    if (this.debug) {
      console.log(`✅ Character geometry setup completed with ${this.vertexCount} vertices`);
    }

    return true;
  }

  render(): void {
    if (!this.vao || this.vertexCount === 0) return;

    const gl = this.gl;

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindVertexArray(null);

    checkWebGLError(gl, 'character rendering');
  }

  getVertexCount(): number {
    return this.vertexCount;
  }

  dispose(): void {
    const gl = this.gl;

    if (this.vbo) {
      gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    this.vertexCount = 0;
  }
}
