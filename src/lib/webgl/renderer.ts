import { WebGLRendererCore, type RenderStats, type RendererOptions } from './renderer-core.js';
import type { ShaderManager } from './shaders.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { GameGrid } from './game-grid.js';
import type { FontAtlas } from './types.js';

export type { RenderStats, RendererOptions };

export class WebGLRenderer {
  private core: WebGLRendererCore;

  constructor(options: RendererOptions) {
    this.core = new WebGLRendererCore(options);
  }

  async waitForInitialization(): Promise<boolean> {
    return this.core.waitForInitialization();
  }

  setGrid(grid: GameGrid, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.core.setGrid(grid, dirtyTiles);
  }

  setSnowGrid(grid: GameGrid | null, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.core.setSnowGrid(grid, dirtyTiles);
  }

  setOverlayGrid(grid: GameGrid | null): void {
    this.core.setOverlayGrid(grid);
  }

  setItemOverlayGrid(grid: GameGrid | null): void {
    this.core.setItemOverlayGrid(grid);
  }

  setBuildingOverlayGrid(grid: GameGrid | null): void {
    this.core.setBuildingOverlayGrid(grid);
  }

  setResourceOverlayGrid(grid: GameGrid | null): void {
    this.core.setResourceOverlayGrid(grid);
  }

  setResourceTallOverlayGrid(grid: GameGrid | null): void {
    this.core.setResourceTallOverlayGrid(grid);
  }

  setViewTileOffset(x: number, y: number): void {
    this.core.setViewTileOffset(x, y);
  }

  setTileSize(w: number, h: number): void {
    this.core.setTileSize(w, h);
  }

  resize(width: number, height: number): void {
    this.core.resize(width, height);
  }

  beginFrame(): void {
    this.core.beginFrame();
  }

  endFrame(): void {
    this.core.endFrame();
  }

  getStats(): RenderStats {
    return this.core.getStats();
  }

  getContext(): WebGL2RenderingContext | null {
    return this.core.getContext();
  }

  getProjectionMatrix(): Float32Array {
    return this.core.getProjectionMatrix();
  }

  getShaderManager(): ShaderManager | null {
    return this.core.getShaderManager();
  }

  getCharacterRenderer(): CharacterRenderer | null {
    return this.core.getCharacterRenderer();
  }

  getFontAtlas(): FontAtlas | null {
    return this.core.getFontAtlas();
  }

  setAmbient(light: number, tint: [number, number, number]): void {
    this.core.setAmbient(light, tint);
  }

  setDynamicLight(active: boolean): void {
    this.core.setDynamicLight(active);
  }

  setLightVersion(version: number): void {
    this.core.setLightVersion(version);
  }

  setLightBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number } | null): void {
    this.core.setLightBounds(bounds);
  }

  setLightSampler(
    sampler: ((wx: number, wy: number, time: number) => [number, number, number]) | null
  ): void {
    this.core.setLightSampler(sampler);
  }

  isReady(): boolean {
    return this.core.isReady();
  }

  dispose(): void {
    this.core.dispose();
  }
}
