import type { TileData, RGB, Vec2, Viewport } from './tile-types.js';
import { GridCoords, TileFactory, TilePerformance } from './tile-types.js';

export interface GridUpdateEvent {
  type: 'single' | 'batch' | 'clear';
  tiles: TileData[];
  viewport?: Viewport;
}

export interface BatchUpdate {
  x: number;
  y: number;
  char?: string;
  foreground?: RGB;
  background?: RGB;
  animationOffset?: Vec2;
}

export interface GridStats {
  totalTiles: number;
  visibleTiles: number;
  dirtyTiles: number;
  memoryUsageMB: number;
  lastUpdateTime: number;
  operationsPerSecond: number;
}

export class GameGrid {
  private tiles: Map<string, TileData> = new Map();
  private dirtyTiles: Set<string> = new Set();
  private lastUpdateTime = 0;
  private operationCount = 0;
  private operationStartTime = Date.now();

  private bounds: { min: Vec2; max: Vec2 } | null = null;
  private boundsDirty = false;

  private listeners: ((event: GridUpdateEvent) => void)[] = [];

  constructor() {}

  setTile(x: number, y: number, tile: TileData): void {
    const key = GridCoords.toKey(x, y);

    tile.position = { x, y };
    tile.dirty = true;
    tile.lastUpdated = Date.now();

    this.tiles.set(key, tile);
    this.dirtyTiles.add(key);

    this.updateBounds(x, y);

    TilePerformance.recordUpdate();
    this.recordOperation();

    this.notifyListeners({
      type: 'single',
      tiles: [tile]
    });
  }

  getTile(x: number, y: number): TileData | undefined {
    const key = GridCoords.toKey(x, y);
    return this.tiles.get(key);
  }

  hasTile(x: number, y: number): boolean {
    const key = GridCoords.toKey(x, y);
    return this.tiles.has(key);
  }

  removeTile(x: number, y: number): boolean {
    const key = GridCoords.toKey(x, y);
    const removed = this.tiles.delete(key);

    if (removed) {
      this.dirtyTiles.delete(key);
      this.boundsDirty = true;
      this.recordOperation();
    }

    return removed;
  }

  getVisibleTiles(viewport: Viewport): TileData[] {
    const visibleTiles: TileData[] = [];

    for (let y = viewport.y; y < viewport.y + viewport.height; y++) {
      for (let x = viewport.x; x < viewport.x + viewport.width; x++) {
        const tile = this.getTile(x, y);
        if (tile) {
          visibleTiles.push(tile);
        }
      }
    }

    return visibleTiles;
  }

  getDirtyTiles(): TileData[] {
    const dirty: TileData[] = [];

    for (const key of this.dirtyTiles) {
      const tile = this.tiles.get(key);
      if (tile) {
        dirty.push(tile);
      }
    }

    return dirty;
  }

  clearDirtyFlags(): void {
    for (const key of this.dirtyTiles) {
      const tile = this.tiles.get(key);
      if (tile) {
        tile.dirty = false;
      }
    }
    this.dirtyTiles.clear();
  }

  batchUpdate(updates: BatchUpdate[]): void {
    const updatedTiles: TileData[] = [];

    for (const update of updates) {
      const key = GridCoords.toKey(update.x, update.y);
      let tile = this.tiles.get(key);

      if (!tile) {
        tile = TileFactory.createEmpty(update.x, update.y);
        TilePerformance.recordCreation();
      }

      if (update.char !== undefined) tile.char = update.char;
      if (update.foreground) tile.foreground = update.foreground;
      if (update.background) tile.background = update.background;
      if (update.animationOffset) tile.animationOffset = update.animationOffset;

      tile.dirty = true;
      tile.lastUpdated = Date.now();

      this.tiles.set(key, tile);
      this.dirtyTiles.add(key);
      updatedTiles.push(tile);

      this.updateBounds(update.x, update.y);
    }

    this.recordOperation();

    this.notifyListeners({
      type: 'batch',
      tiles: updatedTiles
    });

    console.log(`📦 Batch updated ${updates.length} tiles`);
  }

  fillArea(
    x: number,
    y: number,
    width: number,
    height: number,
    char: string,
    foreground: RGB,
    background: RGB
  ): void {
    const updates: BatchUpdate[] = [];

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        updates.push({
          x: x + dx,
          y: y + dy,
          char,
          foreground,
          background
        });
      }
    }

    this.batchUpdate(updates);
    console.log(`🎨 Filled ${width}x${height} area at (${x}, ${y}) with '${char}'`);
  }

  clear(): void {
    const hasListeners = this.listeners.length > 0;
    const clearedTiles = hasListeners ? Array.from(this.tiles.values()) : [];

    this.tiles.clear();
    this.dirtyTiles.clear();
    this.bounds = null;
    this.boundsDirty = false;
    this.recordOperation();

    if (hasListeners) {
      this.notifyListeners({
        type: 'clear',
        tiles: clearedTiles
      });
    }
  }

  getBounds(): { min: Vec2; max: Vec2 } | null {
    if (this.boundsDirty) {
      this.recalculateBounds();
      this.boundsDirty = false;
    }
    return this.bounds ? { ...this.bounds } : null;
  }

  getAllTiles(): TileData[] {
    return Array.from(this.tiles.values());
  }

  getTilesInRegion(x: number, y: number, width: number, height: number): TileData[] {
    const tiles: TileData[] = [];

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const tile = this.getTile(x + dx, y + dy);
        if (tile) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  getStats(): GridStats {
    const now = Date.now();
    const timeSinceStart = (now - this.operationStartTime) / 1000;

    return {
      totalTiles: this.tiles.size,
      visibleTiles: 0,
      dirtyTiles: this.dirtyTiles.size,
      memoryUsageMB: this.estimateMemoryUsage(),
      lastUpdateTime: this.lastUpdateTime,
      operationsPerSecond: timeSinceStart > 0 ? this.operationCount / timeSinceStart : 0
    };
  }

  subscribe(listener: (event: GridUpdateEvent) => void): () => void {
    this.listeners.push(listener);

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  createTestPattern(width: number = 80, height: number = 50): void {
    console.log(`🎨 Creating ${width}x${height} test pattern with all CP437 characters...`);

    const allChars: string[] = [];
    for (let i = 0; i < 256; i++) {
      if (i === 0) {
        allChars.push(' ');
      } else if (i < 32) {
        const controlChars = [
          ' ',
          '☺',
          '☻',
          '♥',
          '♦',
          '♣',
          '♠',
          '•',
          '◘',
          '○',
          '◙',
          '♂',
          '♀',
          '♪',
          '♫',
          '☼',
          '►',
          '◄',
          '↕',
          '‼',
          '¶',
          '§',
          '▬',
          '↨',
          '↑',
          '→',
          '↓',
          '←',
          '∟',
          '↔',
          '▲',
          '▼'
        ];
        allChars.push(controlChars[i] || String.fromCharCode(i));
      } else {
        allChars.push(String.fromCharCode(i));
      }
    }

    const colors = [
      { r: 1.0, g: 1.0, b: 1.0 },
      { r: 1.0, g: 0.0, b: 0.0 },
      { r: 0.0, g: 1.0, b: 0.0 },
      { r: 0.0, g: 0.0, b: 1.0 },
      { r: 1.0, g: 1.0, b: 0.0 },
      { r: 1.0, g: 0.0, b: 1.0 },
      { r: 0.0, g: 1.0, b: 1.0 },
      { r: 1.0, g: 0.5, b: 0.0 },
      { r: 0.5, g: 0.0, b: 1.0 },
      { r: 0.0, g: 0.5, b: 0.0 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 1.0, g: 0.5, b: 0.5 },
      { r: 0.5, g: 1.0, b: 0.5 },
      { r: 0.5, g: 0.5, b: 1.0 },
      { r: 1.0, g: 1.0, b: 0.5 },
      { r: 0.8, g: 0.8, b: 0.8 }
    ];

    const updates: BatchUpdate[] = [];
    let charIndex = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = allChars[charIndex % allChars.length];

        const colorIndex = Math.floor(charIndex / 16) % colors.length;

        updates.push({
          x,
          y,
          char: char,
          foreground: colors[colorIndex],
          background: { r: 0, g: 0, b: 0 }
        });

        charIndex++;
      }
    }

    this.batchUpdate(updates);

    const totalChars = Math.min(charIndex, allChars.length);
    console.log(`✅ CP437 character test pattern created:`);
    console.log(`   📊 Grid size: ${width}x${height} = ${width * height} tiles`);
    console.log(`   🔤 Characters shown: ${totalChars} unique CP437 characters`);
    console.log(`   🎨 Color blocks: ${Math.floor(totalChars / 16)} different color regions`);
    console.log(`   💾 Memory usage: ${this.tiles.size} stored tiles`);
  }

  private updateBounds(x: number, y: number): void {
    if (!this.bounds) {
      this.bounds = {
        min: { x, y },
        max: { x, y }
      };
    } else {
      this.bounds.min.x = Math.min(this.bounds.min.x, x);
      this.bounds.min.y = Math.min(this.bounds.min.y, y);
      this.bounds.max.x = Math.max(this.bounds.max.x, x);
      this.bounds.max.y = Math.max(this.bounds.max.y, y);
    }
  }

  private recalculateBounds(): void {
    if (this.tiles.size === 0) {
      this.bounds = null;
      return;
    }

    const coords = Array.from(this.tiles.keys()).map(GridCoords.fromKey);
    this.bounds = GridCoords.getBounds(coords);
  }

  private recordOperation(): void {
    this.operationCount++;
    this.lastUpdateTime = Date.now();
  }

  private estimateMemoryUsage(): number {
    const bytesPerTile = 200;
    return (this.tiles.size * bytesPerTile) / (1024 * 1024);
  }

  private notifyListeners(event: GridUpdateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ Grid event listener error:', error);
      }
    }
  }
}
