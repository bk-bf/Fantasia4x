/* filepath: src/lib/webgl/renderer.ts */
/**
 * Main WebGL2 Renderer class for tile-based graphics
 * Simplified facade over the modular rendering system
 */

import { WebGLRendererCore, type RenderStats, type RendererOptions } from './renderer-core.js';
import type { ShaderManager } from './shaders.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { GameGrid } from './game-grid.js';
import type { FontAtlas } from './types.js';

// Re-export types for easier access
export type { RenderStats, RendererOptions };

/**
 * Main WebGL2 Renderer - Simplified public API
 * This is a facade that wraps the modular rendering system for easy use
 */
export class WebGLRenderer {
	private core: WebGLRendererCore;

	constructor(options: RendererOptions) {
		this.core = new WebGLRendererCore(options);
	}

	/**
	 * Wait for initialization to complete
	 */
	async waitForInitialization(): Promise<boolean> {
		return this.core.waitForInitialization();
	}

	/**
	 * Inject (or update) the game grid to render.
	 */
	setGrid(grid: GameGrid): void {
		this.core.setGrid(grid);
	}

	/**
	 * Set the viewport tile offset (top-left corner).
	 */
	setViewTileOffset(x: number, y: number): void {
		this.core.setViewTileOffset(x, y);
	}

	/**
	 * Set tile pixel dimensions (used for zoom). Width:Height ratio should stay ~1:1.57.
	 */
	setTileSize(w: number, h: number): void {
		this.core.setTileSize(w, h);
	}

	/**
	 * Resize the renderer and update projection matrix
	 */
	resize(width: number, height: number): void {
		this.core.resize(width, height);
	}

	/**
	 * Begin a new frame
	 */
	beginFrame(): void {
		this.core.beginFrame();
	}

	/**
	 * End the current frame and update statistics
	 */
	endFrame(): void {
		this.core.endFrame();
	}

	/**
	 * Get current render statistics
	 */
	getStats(): RenderStats {
		return this.core.getStats();
	}

	/**
	 * Get the WebGL2 context
	 */
	getContext(): WebGL2RenderingContext | null {
		return this.core.getContext();
	}

	/**
	 * Get the projection matrix
	 */
	getProjectionMatrix(): Float32Array {
		return this.core.getProjectionMatrix();
	}

	/**
	 * Get the shader manager for advanced usage
	 */
	getShaderManager(): ShaderManager | null {
		return this.core.getShaderManager();
	}

	/**
	 * Get the character renderer for advanced usage
	 */
	getCharacterRenderer(): CharacterRenderer | null {
		return this.core.getCharacterRenderer();
	}

	/**
	 * Get the loaded font/sprite atlas (sprite pixels + char→rect map).
	 * Returns null until the atlas has finished loading.
	 */
	getFontAtlas(): FontAtlas | null {
		return this.core.getFontAtlas();
	}

	/**
	 * Update day/night ambient brightness and tint for the current turn.
	 * Call this whenever the game turn advances (or on initial mount).
	 */
	setAmbient(light: number, tint: [number, number, number]): void {
		this.core.setAmbient(light, tint);
	}

	/**
	 * Check if the renderer is ready for use
	 */
	isReady(): boolean {
		return this.core.isReady();
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		this.core.dispose();
	}
}