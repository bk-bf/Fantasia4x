import {
  WebGLRendererCore,
  type RenderStats,
  type RendererOptions,
  type SpriteLayer
} from './renderer-core.js';
import type { GroundRing, RingInk } from './groundRings.js';
import type { DrawnFigure, Quad } from './drawnSprites.js';
import type { ShaderManager } from './shaders.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { GameGrid } from './game-grid.js';
import type { FontAtlas } from './types.js';
import { mapWeather, type PointLight, type Rgb } from './painted/lightGrade.js';
import {
  ambientWind,
  weatherIsHeavy,
  weatherOverlayKind,
  windVector
} from '../game/services/EnvironmentService.js';
import type { WeatherState } from '../game/core/types.js';
import { heading } from './painted/wind.js';

export type { RenderStats, RendererOptions, SpriteLayer };

export class WebGLRenderer {
  private core: WebGLRendererCore;
  private weather: string | null | undefined = null;

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

  setGroundRings(list: readonly GroundRing[], ink: RingInk): void {
    this.core.setGroundRings(list, ink);
  }

  drawnAt(px: number, py: number): { layer: SpriteLayer; x: number; y: number } | null {
    return this.core.drawnAt(px, py);
  }

  drawnBounds(layer: SpriteLayer, x: number, y: number): Quad | null {
    return this.core.drawnBounds(layer, x, y);
  }

  drawnFigure(layer: SpriteLayer, x: number, y: number): DrawnFigure | null {
    return this.core.drawnFigure(layer, x, y);
  }

  atlasCell(q: Quad): Uint8ClampedArray | null {
    return this.core.atlasCell(q);
  }

  gradeWeights(): Rgb {
    return this.core.gradeWeights();
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

  setAmbient(
    light: number,
    tint: Rgb,
    baseTint?: Rgb,
    weather?: WeatherState,
    season?: string
  ): void {
    this.core.setAmbient(light, tint, baseTint);
    const { dx, dy } = windVector(weather?.windDir);
    this.core.setWind(ambientWind(weather), heading(dx, dy), season);
    const type = weather?.type;
    if (type === this.weather) return;
    this.weather = type;
    this.core.setMapWeather(mapWeather(weatherOverlayKind(type), weatherIsHeavy(type)));
  }

  setPointLights(lights: readonly PointLight[]): void {
    this.core.setPointLights(lights);
  }

  setDynamicLight(active: boolean): void {
    this.core.setDynamicLight(active);
  }

  setVignette(on: boolean): void {
    this.core.setVignette(on);
  }

  setSway(on: boolean): void {
    this.core.setSway(on);
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
