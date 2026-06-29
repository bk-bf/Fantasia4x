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
  setGrid(grid: GameGrid, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.core.setGrid(grid, dirtyTiles);
  }

  /**
   * Inject (or clear) the entity-overlay grid (pawns/mobs). Rendered as a
   * glyph-only, alpha-blended pass on top of the terrain grid.
   */
  setOverlayGrid(grid: GameGrid | null): void {
    this.core.setOverlayGrid(grid);
  }

  /**
   * Inject (or clear) the item-overlay grid. Rendered as a glyph-only,
   * alpha-blended pass between the terrain and the entity overlay, so a pawn
   * standing on a dropped item composites over it instead of hiding it.
   */
  setItemOverlayGrid(grid: GameGrid | null): void {
    this.core.setItemOverlayGrid(grid);
  }

  /**
   * Inject (or clear) the building-overlay grid. Rendered as a glyph-only,
   * alpha-blended pass between the terrain and the item overlay, so a completed
   * building composites over the floor/ground beneath it (its transparent pixels
   * reveal the floor) instead of erasing it the way a baked terrain cell would.
   */
  setBuildingOverlayGrid(grid: GameGrid | null): void {
    this.core.setBuildingOverlayGrid(grid);
  }

  /**
   * Inject (or clear) the resource-overlay grid (trees/grass/bushes/ore). Rendered first in the
   * glyph-only overlay group so plants composite over the terrain ground sprite beneath.
   */
  setResourceOverlayGrid(grid: GameGrid | null): void {
    this.core.setResourceOverlayGrid(grid);
  }

  /** Tall resources (trees) — rendered after entities so they occlude pawns standing behind them. */
  setResourceTallOverlayGrid(grid: GameGrid | null): void {
    this.core.setResourceTallOverlayGrid(grid);
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
   * Declare whether flickering point lights (campfires) are currently lit so the
   * terrain cache knows whether baked point light needs animating.
   */
  setDynamicLight(active: boolean): void {
    this.core.setDynamicLight(active);
  }

  /**
   * Set the emitter-set version so the terrain buffer rebakes its static point
   * light exactly once per change (campfire lit/extinguished/moved).
   */
  setLightVersion(version: number): void {
    this.core.setLightVersion(version);
  }

  /**
   * Set the bounding box enclosing all lit emitters so the bake only samples
   * point light for tiles within reach (cost scales with the lit area).
   */
  setLightBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number } | null): void {
    this.core.setLightBounds(bounds);
  }

  /**
   * Provide the per-tile light sampler (Phase A2). The grid renderer bakes its
   * result into the a_light vertex attribute each frame.
   */
  setLightSampler(
    sampler: ((wx: number, wy: number, time: number) => [number, number, number]) | null
  ): void {
    this.core.setLightSampler(sampler);
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
