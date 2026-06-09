/* filepath: src/lib/webgl/character-renderer.ts */
/**
 * Character rendering system for WebGL2 tile renderer
 * Handles individual and multiple character geometry creation and rendering
 */

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

  // Rendering resources
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

  /**
   * Create geometry for rendering a single character
   */
  createSingleCharacter(options: CharacterRenderOptions): boolean {
    const { char, x, y, foregroundColor, backgroundColor = [0.0, 0.0, 0.0] } = options;

    // Get character info from font atlas
    const charInfo = this.fontAtlas.characters.get(char);
    if (!charInfo) {
      console.error(`❌ Character '${char}' not found in font atlas`);
      return false;
    }

    if (this.debug) {
      console.log('📋 Creating geometry for character:', char, 'at position:', x, y);
      console.log('📋 Character info:', charInfo);
    }

    // Calculate texture coordinates
    const u1 = charInfo.x / this.fontAtlas.atlasWidth;
    const v1 = charInfo.y / this.fontAtlas.atlasHeight;
    const u2 = (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth;
    const v2 = (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight;

    // Calculate character position (respecting offsets)
    const x1 = x + charInfo.xOffset;
    const y1 = y + charInfo.yOffset;
    const x2 = x1 + charInfo.width;
    const y2 = y1 + charInfo.height;

    // Create vertex data for single character
    const vertices = new Float32Array([
      // Triangle 1
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

      // Triangle 2
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

  /**
   * Create geometry for rendering multiple characters in a string
   */
  createMultipleCharacters(options: MultiCharacterRenderOptions): boolean {
    const { text, startX, startY, colors } = options;

    const fontSize = 16; // Font size used in atlas generation
    const charSpacing = fontSize * 0.6; // Standard spacing for readability

    if (this.debug) {
      console.log(`📋 Creating geometry for text: "${text}" with ${colors.length} colors`);
    }

    const vertexData: number[] = [];
    let currentX = startX;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const color = colors[i] || [1.0, 1.0, 1.0]; // Default to white if no color specified

      // Skip spaces but advance position
      if (char === ' ') {
        currentX += charSpacing;
        continue;
      }

      // Get character info from font atlas
      const charInfo = this.fontAtlas.characters.get(char);
      if (!charInfo) {
        console.warn(`❌ Character '${char}' not found in font atlas, skipping`);
        currentX += charSpacing;
        continue;
      }

      // Calculate texture coordinates
      const u1 = charInfo.x / this.fontAtlas.atlasWidth;
      const v1 = charInfo.y / this.fontAtlas.atlasHeight;
      const u2 = (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth;
      const v2 = (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight;

      // Calculate character position
      const x1 = currentX + charInfo.xOffset;
      const y1 = startY + charInfo.yOffset;
      const x2 = x1 + charInfo.width;
      const y2 = y1 + charInfo.height;

      // Background color (transparent)
      const bg = [0.0, 0.0, 0.0];

      // Add vertices for this character (2 triangles = 6 vertices)
      const charVertices = [
        // Triangle 1
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

        // Triangle 2
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

      // Advance to next character position
      currentX += charInfo.xAdvance || charSpacing;
    }

    if (this.debug) {
      console.log(`📋 Generated ${vertexData.length / 10} vertices for ${text.length} characters`);
    }

    const vertices = new Float32Array(vertexData);
    return this.createGeometry(vertices, vertexData.length / 10);
  }

  /**
   * Create WebGL geometry from vertex data
   */
  private createGeometry(vertices: Float32Array, vertexCount: number): boolean {
    const gl = this.gl;

    // Clean up existing resources
    this.dispose();

    // Create and setup VAO
    this.vao = gl.createVertexArray();
    if (!this.vao) {
      console.error('❌ Failed to create vertex array object');
      return false;
    }
    gl.bindVertexArray(this.vao);

    // Create and setup VBO
    this.vbo = gl.createBuffer();
    if (!this.vbo) {
      console.error('❌ Failed to create vertex buffer object');
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Setup vertex attributes
    const stride = 10 * 4; // 10 floats per vertex, 4 bytes per float

    // Position attribute (a_position)
    const positionLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_position');
    if (positionLocation >= 0) {
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
    }

    // Texture coordinate attribute (a_texCoord)
    const texCoordLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_texCoord');
    if (texCoordLocation >= 0) {
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * 4);
    }

    // Foreground color attribute (a_foreground)
    const foregroundLocation = this.shaderManager.getAttributeLocation(
      'tileRenderer',
      'a_foreground'
    );
    if (foregroundLocation >= 0) {
      gl.enableVertexAttribArray(foregroundLocation);
      gl.vertexAttribPointer(foregroundLocation, 3, gl.FLOAT, false, stride, 4 * 4);
    }

    // Background color attribute (a_background)
    const backgroundLocation = this.shaderManager.getAttributeLocation(
      'tileRenderer',
      'a_background'
    );
    if (backgroundLocation >= 0) {
      gl.enableVertexAttribArray(backgroundLocation);
      gl.vertexAttribPointer(backgroundLocation, 3, gl.FLOAT, false, stride, 7 * 4);
    }

    // Store vertex count and unbind VAO
    this.vertexCount = vertexCount;
    gl.bindVertexArray(null);

    if (this.debug) {
      console.log(`✅ Character geometry setup completed with ${this.vertexCount} vertices`);
    }

    return true;
  }

  /**
   * Render the current character geometry
   */
  render(): void {
    if (!this.vao || this.vertexCount === 0) return;

    const gl = this.gl;

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindVertexArray(null);

    checkWebGLError(gl, 'character rendering');
  }

  /**
   * Get the current vertex count for stats tracking
   */
  getVertexCount(): number {
    return this.vertexCount;
  }

  /**
   * Clean up WebGL resources
   */
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
