/* filepath: src/lib/webgl/grid-renderer.ts */
/**
 * Grid Renderer - Bridges GameGrid with WebGL2 character rendering
 * Efficiently renders tile grids using viewport culling and batch operations
 */

import type { GameGrid } from './game-grid.js';
import type { TileData, Viewport } from './tile-types.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { ShaderManager } from './shaders.js';
import type { FontAtlas } from './types.js';
import { checkWebGLError } from './utils.js';

/** Default fully-lit value used when no light sampler is supplied. */
const ONE_LIGHT: [number, number, number] = [1, 1, 1];

export interface GridRenderOptions {
	tileWidth: number;    // Width of each tile in pixels
	tileHeight: number;   // Height of each tile in pixels
	viewportX: number;    // Camera X position in world tiles
	viewportY: number;    // Camera Y position in world tiles  
	viewportWidth: number; // Visible width in tiles
	viewportHeight: number; // Visible height in tiles
	// Per-tile dynamic lighting (Phase A2). Sampled at each tile CORNER and
	// uploaded as the a_light vertex attribute; the GPU interpolates it across
	// the quad. Returns an RGB multiplier (ambient + accumulated point light).
	// When absent, tiles render fully lit ([1,1,1]).
	lightSampler?: (wx: number, wy: number, time: number) => [number, number, number];
	lightTime?: number;   // seconds, snapshot once per frame for seamless flicker
	// When true, render every tile stored in the grid (skip viewport culling).
	// Used for the sparse entity-overlay grid which holds only a handful of tiles.
	renderAllTiles?: boolean;
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

	/** Hot-swap the font atlas (e.g. after zoom changes the cell size). */
	setFontAtlas(atlas: FontAtlas): void {
		this.fontAtlas = atlas;
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

		// Get visible tiles using efficient culling. The sparse overlay grid asks
		// for all tiles instead (it holds only entities, so culling would waste a
		// full viewport scan to find a handful of cells).
		const visibleTiles = options.renderAllTiles
			? grid.getAllTiles()
			: grid.getVisibleTiles(viewport);

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

		const vertexCount = vertexData.length / 23; // 23 components per vertex
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
		const sampler = options.lightSampler;
		const lightTime = options.lightTime ?? 0;

		for (const tile of tiles) {
			// Get character info from font atlas. For space/missing chars, render background only.
			const isSpace = !tile.char || tile.char === ' ';
			const charInfo = isSpace ? null : this.fontAtlas.characters.get(tile.char);
			if (!isSpace && !charInfo) {
				if (this.debug) {
					console.warn(`⚠️ Character '${tile.char}' not found in font atlas`);
				}
				// Fall through — render background quad with no glyph
			}

			// Calculate screen position
			const screenX = (tile.position.x - options.viewportX) * options.tileWidth;
			const screenY = (tile.position.y - options.viewportY) * options.tileHeight;

			// Apply animation offset if present
			const offsetX = tile.animationOffset?.x || 0;
			const offsetY = tile.animationOffset?.y || 0;

			// Vertex quad always fills the full screen tile regardless of atlas tile size.
			// UV coords reference the atlas tile via charInfo.{x,y,width,height}.
			const tileW = options.tileWidth;
			const tileH = options.tileHeight;
			const x1 = screenX + offsetX;
			const y1 = screenY + offsetY;
			const x2 = screenX + tileW + offsetX;
			const y2 = screenY + tileH + offsetY;

			// Calculate texture coordinates.
			// Use a UV of (0,0)→(0,0) for missing chars so sprite.a ≈ 0 → bg fills tile.
			const u1 = charInfo ? charInfo.x / this.fontAtlas.atlasWidth : 0;
			const v1 = charInfo ? charInfo.y / this.fontAtlas.atlasHeight : 0;
			const u2 = charInfo ? (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth : 0;
			const v2 = charInfo ? (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight : 0;

			// Get colors — detail defaults to foreground when not set
			const fg = [tile.foreground.r, tile.foreground.g, tile.foreground.b];
			const bg = [tile.background.r, tile.background.g, tile.background.b];
			const dt = tile.detail
				? [tile.detail.r, tile.detail.g, tile.detail.b]
				: fg;
			const ol = tile.outline
				? [tile.outline.r, tile.outline.g, tile.outline.b]
				: [0, 0, 0];
			// UV bounds for the current glyph (needed by outline edge-detection in fragment shader)
			const ub = charInfo
				? [
					charInfo.x / this.fontAtlas.atlasWidth,
					charInfo.y / this.fontAtlas.atlasHeight,
					(charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth,
					(charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight
				]
				: [0, 0, 0, 0];

			// UV corners — default (no rotation)
			let tlU = u1, tlV = v1; // top-left
			let trU = u2, trV = v1; // top-right
			let blU = u1, blV = v2; // bottom-left
			let brU = u2, brV = v2; // bottom-right

			// Rotate UV coords clockwise to spin the glyph within its quad
			if (tile.rotation === 90) {
				tlU = u1; tlV = v2;
				trU = u1; trV = v1;
				blU = u2; blV = v2;
				brU = u2; brV = v1;
			} else if (tile.rotation === 180) {
				tlU = u2; tlV = v2;
				trU = u1; trV = v2;
				blU = u2; blV = v1;
				brU = u1; brV = v1;
			} else if (tile.rotation === 270) {
				tlU = u2; tlV = v1;
				trU = u2; trV = v2;
				blU = u1; blV = v1;
				brU = u1; brV = v2;
			}

			// Per-corner dynamic light (Phase A2). Sample the light field at each
			// tile corner in WORLD coords; the GPU interpolates between them across
			// the quad, giving smooth gradients with no per-pixel cost.
			const wx = tile.position.x;
			const wy = tile.position.y;
			const Ltl = sampler ? sampler(wx, wy, lightTime) : ONE_LIGHT;          // top-left
			const Ltr = sampler ? sampler(wx + 1, wy, lightTime) : ONE_LIGHT;      // top-right
			const Lbl = sampler ? sampler(wx, wy + 1, lightTime) : ONE_LIGHT;      // bottom-left
			const Lbr = sampler ? sampler(wx + 1, wy + 1, lightTime) : ONE_LIGHT;  // bottom-right

			// Add vertex data for this character (2 triangles = 6 vertices)
			// Vertex format: x, y, u, v, fr, fg, fb, br, bg, bb, dr, dg, db, or, og, ob, u1, v1, u2, v2, lr, lg, lb (23 floats)
			const charVertices = [
				// Triangle 1
				x1, y1, tlU, tlV, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2], dt[0], dt[1], dt[2], ol[0], ol[1], ol[2], ub[0], ub[1], ub[2], ub[3], Ltl[0], Ltl[1], Ltl[2],  // Top-left
				x2, y1, trU, trV, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2], dt[0], dt[1], dt[2], ol[0], ol[1], ol[2], ub[0], ub[1], ub[2], ub[3], Ltr[0], Ltr[1], Ltr[2],  // Top-right
				x1, y2, blU, blV, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2], dt[0], dt[1], dt[2], ol[0], ol[1], ol[2], ub[0], ub[1], ub[2], ub[3], Lbl[0], Lbl[1], Lbl[2],  // Bottom-left

				// Triangle 2
				x2, y1, trU, trV, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2], dt[0], dt[1], dt[2], ol[0], ol[1], ol[2], ub[0], ub[1], ub[2], ub[3], Ltr[0], Ltr[1], Ltr[2],  // Top-right
				x2, y2, brU, brV, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2], dt[0], dt[1], dt[2], ol[0], ol[1], ol[2], ub[0], ub[1], ub[2], ub[3], Lbr[0], Lbr[1], Lbr[2],  // Bottom-right
				x1, y2, blU, blV, fg[0], fg[1], fg[2], bg[0], bg[1], bg[2], dt[0], dt[1], dt[2], ol[0], ol[1], ol[2], ub[0], ub[1], ub[2], ub[3], Lbl[0], Lbl[1], Lbl[2],  // Bottom-left
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

		const stride = 23 * 4; // 23 floats per vertex, 4 bytes per float

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

		// Detail/highlight color attribute (a_detail)
		const detailLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_detail');
		if (detailLocation >= 0) {
			gl.enableVertexAttribArray(detailLocation);
			gl.vertexAttribPointer(detailLocation, 3, gl.FLOAT, false, stride, 10 * 4);
		}

		// Outline color attribute (a_outline)
		const outlineLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_outline');
		if (outlineLocation >= 0) {
			gl.enableVertexAttribArray(outlineLocation);
			gl.vertexAttribPointer(outlineLocation, 3, gl.FLOAT, false, stride, 13 * 4);
		}

		// Glyph UV bounds attribute (a_uvBounds)
		const uvBoundsLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_uvBounds');
		if (uvBoundsLocation >= 0) {
			gl.enableVertexAttribArray(uvBoundsLocation);
			gl.vertexAttribPointer(uvBoundsLocation, 4, gl.FLOAT, false, stride, 16 * 4);
		}

		// Per-corner dynamic light attribute (a_light) — Phase A2
		const lightLocation = this.shaderManager.getAttributeLocation('tileRenderer', 'a_light');
		if (lightLocation >= 0) {
			gl.enableVertexAttribArray(lightLocation);
			gl.vertexAttribPointer(lightLocation, 3, gl.FLOAT, false, stride, 20 * 4);
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
