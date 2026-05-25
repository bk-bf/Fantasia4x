/* filepath: src/lib/webgl/grid-renderer.ts */
/**
 * Grid Renderer - Bridges GameGrid with WebGL2 character rendering
 * Efficiently renders tile grids using viewport culling and batch operations
 */

import type { GameGrid, TileData, Viewport } from './game-grid.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { ShaderManager } from './shaders.js';
import type { FontAtlas } from './types.js';
import { checkWebGLError } from './utils.js';

export interface GridRenderOptions {
	tileWidth: number;    // Width of each tile in pixels
	tileHeight: number;   // Height of each tile in pixels
	viewportX: number;    // Camera X position in world tiles
	viewportY: number;    // Camera Y position in world tiles  
	viewportWidth: number; // Visible width in tiles
	viewportHeight: number; // Visible height in tiles
}

export interface GridRenderStats {
	tilesRendered: number;
	tilesCulled: number;
	batchCount: number;
	renderTime: number;
}

/**
 * High-performance grid renderer with viewport culling
 */
export class GridRenderer {
	private gl: WebGL2RenderingContext;
	private shaderManager: ShaderManager;
	private characterRenderer: CharacterRenderer;
	private fontAtlas: FontAtlas;
	private debug: boolean;

	// Grid rendering VAO/VBO for batch rendering
	private gridVAO: WebGLVertexArrayObject | null = null;
	private gridVBO: WebGLBuffer | null = null;
	private currentVertexCount: number = 0;

	// Render statistics
	private stats: GridRenderStats = {
		tilesRendered: 0,
		tilesCulled: 0,
		batchCount: 0,
		renderTime: 0
	};

	constructor(
		gl: WebGL2RenderingContext,
		shaderManager: ShaderManager,
		characterRenderer: CharacterRenderer,
		fontAtlas: FontAtlas,
		debug = false
	) {
		this.gl = gl;
		this.shaderManager = shaderManager;
		this.characterRenderer = characterRenderer;
		this.fontAtlas = fontAtlas;
		this.debug = debug;

		this.initializeGridRendering();
	}

	/**
	 * Render a game grid with the specified options
	 */
	renderGrid(grid: GameGrid, options: GridRenderOptions): GridRenderStats {
		const startTime = performance.now();

		// Create viewport for culling
		const viewport: Viewport = {
			x: Math.floor(options.viewportX),
			y: Math.floor(options.viewportY),
			width: options.viewportWidth,
			height: options.viewportHeight
		};

		// Get visible tiles using efficient culling
		const visibleTiles = grid.getVisibleTiles(viewport);

		if (this.debug) {
			console.log(`🎯 Rendering ${visibleTiles.length} visible tiles in viewport ${viewport.width}x${viewport.height}`);
		}

		// Render tiles in batches
		if (visibleTiles.length > 0) {
			this.renderTileBatch(visibleTiles, options);
		}

		// Update statistics
		const renderTime = performance.now() - startTime;
		this.stats = {
			tilesRendered: visibleTiles.length,
			tilesCulled: this.estimateCulledTiles(grid, viewport),
			batchCount: visibleTiles.length > 0 ? 1 : 0,
			renderTime
		};

		return { ...this.stats };
	}

	/**
	 * Render a batch of tiles efficiently using instanced rendering
	 */
	private renderTileBatch(tiles: TileData[], options: GridRenderOptions): void {
		if (!this.gridVAO || !this.gridVBO) {
			console.error('❌ Grid rendering resources not initialized');
			return;
		}

		// Generate vertex data for all tiles
		const vertexData = this.generateBatchVertexData(tiles, options);
		if (vertexData.length === 0) return;

		const gl = this.gl;

		// Upload vertex data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVBO);
		gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

		// Use tile renderer shader
		if (!this.shaderManager.useProgram('tileRenderer')) {
			console.error('❌ Failed to use tile renderer shader');
			return;
		}

		// Bind VAO and render
		gl.bindVertexArray(this.gridVAO);

		const vertexCount = vertexData.length / 10; // 10 components per vertex
		gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

		gl.bindVertexArray(null);

		this.currentVertexCount = vertexCount;

		if (this.debug) {
			checkWebGLError(gl, 'grid batch rendering');
		}
	}

	/**
	 * Generate vertex data for a batch of tiles
	 */
	private generateBatchVertexData(tiles: TileData[], options: GridRenderOptions): Float32Array {
		const vertexData: number[] = [];

		for (const tile of tiles) {
			// Skip empty tiles
			if (!tile.char || tile.char === ' ') continue;

			// Get character info from font atlas
			const charInfo = this.fontAtlas.characters.get(tile.char);
			if (!charInfo) {
				if (this.debug) {
					console.warn(`⚠️ Character '${tile.char}' not found in font atlas`);
				}
				continue;
			}

			// Calculate screen position
			const screenX = (tile.position.x - options.viewportX) * options.tileWidth;
			const screenY = (tile.position.y - options.viewportY) * options.tileHeight;

			// Apply animation offset if present
			const offsetX = tile.animationOffset?.x || 0;
			const offsetY = tile.animationOffset?.y || 0;

			// Calculate character bounds with offset
			const x1 = screenX + charInfo.xOffset + offsetX;
			const y1 = screenY + charInfo.yOffset + offsetY;
			const x2 = x1 + charInfo.width;
			const y2 = y1 + charInfo.height;

			// Calculate texture coordinates
			const u1 = charInfo.x / this.fontAtlas.atlasWidth;
			const v1 = charInfo.y / this.fontAtlas.atlasHeight;
			const u2 = (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth;
			const v2 = (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight;

			// Get colors
			const fg = [tile.foreground.r, tile.foreground.g, tile.foreground.b];
			const bg = [tile.background.r, tile.background.g, tile.background.b];

			// Add vertex data for this character (2 triangles = 6 vertices)
			// Vertex format: x, y, u, v, fr, fg, fb, br, bg, bb
			const charVertices = [
				// Triangle 1
				x1, y1, u1, v1, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2],  // Top-left
				x2, y1, u2, v1, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2],  // Top-right
				x1, y2, u1, v2, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2],  // Bottom-left

				// Triangle 2
				x2, y1, u2, v1, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2],  // Top-right
				x2, y2, u2, v2, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2],  // Bottom-right
				x1, y2, u1, v2, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2],  // Bottom-left
			];

			vertexData.push(...charVertices);
		}

		return new Float32Array(vertexData);
	}

	/**
	 * Initialize grid rendering resources
	 */
	private initializeGridRendering(): void {
		const gl = this.gl;

		// Create VAO for grid rendering
		this.gridVAO = gl.createVertexArray();
		if (!this.gridVAO) {
			throw new Error('Failed to create grid VAO');
		}

		// Create VBO for grid vertices
		this.gridVBO = gl.createBuffer();
		if (!this.gridVBO) {
			throw new Error('Failed to create grid VBO');
		}

		// Set up vertex attributes (same layout as character renderer)
		gl.bindVertexArray(this.gridVAO);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVBO);

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
		const foregroundLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_foreground');
		if (foregroundLocation >= 0) {
			gl.enableVertexAttribArray(foregroundLocation);
			gl.vertexAttribPointer(foregroundLocation, 3, gl.FLOAT, false, stride, 4 * 4);
		}

		// Background color attribute (a_background)
		const backgroundLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_background');
		if (backgroundLocation >= 0) {
			gl.enableVertexAttribArray(backgroundLocation);
			gl.vertexAttribPointer(backgroundLocation, 3, gl.FLOAT, false, stride, 7 * 4);
		}

		gl.bindVertexArray(null);

		if (this.debug) {
			console.log('✅ Grid rendering resources initialized');
		}
	}

	/**
	 * Estimate how many tiles were culled for statistics
	 */
	private estimateCulledTiles(grid: GameGrid, viewport: Viewport): number {
		const totalTiles = grid.getAllTiles().length;
		const visibleArea = viewport.width * viewport.height;
		const estimatedVisible = Math.min(totalTiles, visibleArea);
		return Math.max(0, totalTiles - estimatedVisible);
	}

	/**
	 * Get current render statistics
	 */
	getStats(): GridRenderStats {
		return { ...this.stats };
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		const gl = this.gl;

		if (this.gridVBO) {
			gl.deleteBuffer(this.gridVBO);
			this.gridVBO = null;
		}

		if (this.gridVAO) {
			gl.deleteVertexArray(this.gridVAO);
			this.gridVAO = null;
		}

		if (this.debug) {
			console.log('🧹 Grid renderer disposed');
		}
	}
}
