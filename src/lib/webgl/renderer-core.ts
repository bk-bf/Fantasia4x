/* filepath: src/lib/webgl/renderer-core.ts */
/**
 * Core WebGL2 Renderer — generic tile-based renderer
 * Adapted from Exiled for Fantasia4x. No game-specific imports.
 * Game data is injected via setGrid() / setViewport().
 */

import { createOrthographicMatrix, PerformanceTimer } from './utils.js';
import { ShaderManager, createTileRendererShaders } from './shaders.js';
import { createSquareCellAtlas, loadBitlandsAtlas } from './font-atlas.js';
import { TextureManager } from './texture-manager.js';
import { CharacterRenderer } from './character-renderer.js';
import { GridRenderer } from './grid-renderer.js';
import { WebGLStateManager } from './webgl-state.js';
import type { GameGrid } from './game-grid.js';
import type { FontAtlas } from './types.js';

interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface RenderStats {
	fps: number;
	frameTime: number;
	drawCalls: number;
	vertexCount: number;
}

export interface RendererOptions {
	canvas: HTMLCanvasElement;
	tileWidth?: number;
	tileHeight?: number;
	debug?: boolean;
	contextAttributes?: WebGLContextAttributes;
}

export class WebGLRendererCore {
	private canvas: HTMLCanvasElement;
	private projectionMatrix: Float32Array;
	private viewport: Viewport;
	private debug: boolean;
	private timer: PerformanceTimer;
	private stats: RenderStats;

	// Tile dimensions (pixels per tile)
	private tileWidth: number;
	private tileHeight: number;

	// Viewport in tile coordinates
	private viewTileX = 0;
	private viewTileY = 0;

	// Subsystem managers
	private webglState: WebGLStateManager;
	private shaderManager: ShaderManager | null = null;
	private textureManager: TextureManager | null = null;
	private characterRenderer: CharacterRenderer | null = null;
	private gridRenderer: GridRenderer | null = null;

	// Resources
	private fontAtlas: FontAtlas | null = null;
	private fontTexture: WebGLTexture | null = null;

	// Whether a pre-baked PNG tileset is active (skip atlas regeneration on zoom)
	private tilesetLoaded = false;

	// External grid data
	private gameGrid: GameGrid | null = null;

	// Initialization promise
	private initPromise: Promise<boolean>;

	constructor(options: RendererOptions) {
		this.canvas = options.canvas;
		this.debug = options.debug ?? false;
		this.tileWidth = options.tileWidth ?? 12;
		this.tileHeight = options.tileHeight ?? 20;
		this.timer = new PerformanceTimer();
		this.stats = { fps: 0, frameTime: 0, drawCalls: 0, vertexCount: 0 };

		this.viewport = { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height };

		this.projectionMatrix = createOrthographicMatrix(
			0, this.canvas.width,
			this.canvas.height, 0
		);

		this.webglState = new WebGLStateManager({
			canvas: this.canvas,
			contextAttributes: options.contextAttributes,
			debug: this.debug
		});

		this.initPromise = this.initialize();
	}

	async waitForInitialization(): Promise<boolean> {
		return this.initPromise;
	}

	/** Inject the game grid to render. Call whenever the world changes. */
	setGrid(grid: GameGrid): void {
		this.gameGrid = grid;
	}

	/** Set the top-left viewport tile position. */
	setViewTileOffset(x: number, y: number): void {
		this.viewTileX = x;
		this.viewTileY = y;
	}

	/** Change tile pixel dimensions (used for zoom). Regenerates atlas only when the integer cell size changes (skipped for bitmap tilesets). */
	setTileSize(w: number, h: number): void {
		const prevCellSize = Math.round(this.tileWidth);
		this.tileWidth = w;
		this.tileHeight = h;
		if (!this.tilesetLoaded && Math.round(w) !== prevCellSize) {
			this.reloadAtlasForCellSize(Math.round(w));
		}
	}

	// Prevent overlapping async atlas reloads
	private atlasReloadPending = false;
	private atlasReloadQueued: number | null = null;

	/** Regenerate the font atlas at the given cell size and upload to GPU directly (no TextureManager cache). */
	private async reloadAtlasForCellSize(cellSize: number): Promise<void> {
		// If already loading, just queue the latest size — process after current finishes
		if (this.atlasReloadPending) {
			this.atlasReloadQueued = cellSize;
			return;
		}
		this.atlasReloadPending = true;

		try {
			const gl = this.webglState.getContext();
			if (!gl || !this.gridRenderer) return;

			const newAtlas = await createSquareCellAtlas(cellSize, this.debug);

			// Allocate raw GL texture — bypass TextureManager to avoid stale cache issues
			const newTexture = gl.createTexture();
			if (!newTexture) return;

			gl.bindTexture(gl.TEXTURE_2D, newTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
				newAtlas.atlasWidth, newAtlas.atlasHeight, 0,
				gl.RGBA, gl.UNSIGNED_BYTE, newAtlas.texture.data);

			// Swap in atomically
			if (this.fontTexture) gl.deleteTexture(this.fontTexture);
			this.fontTexture = newTexture;
			this.fontAtlas = newAtlas;
			this.gridRenderer.setFontAtlas(newAtlas);
		} catch (err) {
			console.warn('Atlas reload failed:', err);
		} finally {
			this.atlasReloadPending = false;
			// Process any size change that arrived while we were loading
			if (this.atlasReloadQueued !== null) {
				const next = this.atlasReloadQueued;
				this.atlasReloadQueued = null;
				this.reloadAtlasForCellSize(next);
			}
		}
	}

	private async initialize(): Promise<boolean> {
		try {
			if (this.debug) console.log('🔄 Initializing WebGL2 renderer...');

			const gl = await this.webglState.initialize();

			this.shaderManager = await createTileRendererShaders(gl, this.debug);
			if (!this.shaderManager) throw new Error('Shader init failed');

			// Load all bitlands sheets into a unified atlas
			try {
				this.fontAtlas = await loadBitlandsAtlas(12, 18, this.debug);
				this.tilesetLoaded = true;
			} catch {
				if (this.debug) console.warn('Bitlands atlas unavailable, using canvas atlas');
				this.fontAtlas = await createSquareCellAtlas(this.tileWidth, this.debug);
			}

			this.textureManager = new TextureManager(gl, this.debug);
			this.fontTexture = this.textureManager.createFontAtlasTexture(this.fontAtlas, {
				filtering: 'nearest',
				wrapping: 'clamp',
				flipY: false
			});
			if (!this.fontTexture) throw new Error('Font texture creation failed');

			this.characterRenderer = new CharacterRenderer(gl, this.shaderManager, this.fontAtlas, this.debug);
			this.gridRenderer = new GridRenderer(gl, this.shaderManager, this.characterRenderer, this.fontAtlas, this.debug);

			if (this.debug) console.log('✅ WebGL2 renderer ready');
			return true;
		} catch (error) {
			console.error('❌ WebGL init failed:', error);
			throw error;
		}
	}

	resize(width: number, height: number): void {
		this.viewport.width = width;
		this.viewport.height = height;
		this.projectionMatrix = createOrthographicMatrix(0, width, height, 0);
		this.webglState.updateViewport(width, height);
	}

	beginFrame(): void {
		this.timer.start();
		this.stats.drawCalls = 0;
		this.stats.vertexCount = 0;
		this.webglState.clear();
	}

	private render(): void {
		const gl = this.webglState.getContext();
		if (!gl || !this.shaderManager || !this.gridRenderer || !this.fontTexture || !this.gameGrid) {
			return;
		}

		if (!this.shaderManager.useProgram('tileRenderer')) return;
		this.shaderManager.setUniform('tileRenderer', 'u_projection', this.projectionMatrix);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
		this.shaderManager.setUniform('tileRenderer', 'u_fontAtlas', 0);

		const viewportTilesW = Math.ceil(this.viewport.width / this.tileWidth);
		const viewportTilesH = Math.ceil(this.viewport.height / this.tileHeight);

		const gridStats = this.gridRenderer.renderGrid(this.gameGrid, {
			tileWidth: this.tileWidth,
			tileHeight: this.tileHeight,
			viewportX: this.viewTileX,
			viewportY: this.viewTileY,
			viewportWidth: viewportTilesW,
			viewportHeight: viewportTilesH
		});

		this.stats.drawCalls++;
		this.stats.vertexCount += gridStats.tilesRendered * 6;
	}

	endFrame(): void {
		this.render();
		this.stats.frameTime = this.timer.end();
		this.stats.fps = this.timer.updateFPS();
	}

	getStats(): RenderStats { return { ...this.stats }; }
	getContext(): WebGL2RenderingContext | null { return this.webglState.getContext(); }
	getProjectionMatrix(): Float32Array { return this.projectionMatrix; }
	getShaderManager(): ShaderManager | null { return this.shaderManager; }
	getCharacterRenderer(): CharacterRenderer | null { return this.characterRenderer; }
	getGridRenderer(): GridRenderer | null { return this.gridRenderer; }

	isReady(): boolean {
		return this.webglState.isReady() && this.shaderManager !== null;
	}

	dispose(): void {
		this.gridRenderer?.dispose();
		this.characterRenderer?.dispose();
		this.shaderManager?.dispose();
		this.textureManager?.dispose();
		this.webglState.dispose();
		this.gridRenderer = null;
		this.characterRenderer = null;
		this.shaderManager = null;
		this.textureManager = null;
		this.fontAtlas = null;
		this.fontTexture = null;
		this.gameGrid = null;
	}
}
