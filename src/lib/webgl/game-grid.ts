/* filepath: src/lib/game/grid.ts */
/**
 * Game Grid System - Efficient tile storage and viewport culling
 * Implements sparse grid storage with fast lookups and batch operations
 */

import type { TileData, RGB, Vec2, Viewport } from './tile-types.js';
import { GridCoords, TileFactory, TilePerformance } from './tile-types.js';

// Grid update event for reactive UI
export interface GridUpdateEvent {
	type: 'single' | 'batch' | 'clear';
	tiles: TileData[];
	viewport?: Viewport;
}

// Batch update for performance optimization
export interface BatchUpdate {
	x: number;
	y: number;
	char?: string;
	foreground?: RGB;
	background?: RGB;
	animationOffset?: Vec2;
}

// Grid statistics for performance monitoring
export interface GridStats {
	totalTiles: number;
	visibleTiles: number;
	dirtyTiles: number;
	memoryUsageMB: number;
	lastUpdateTime: number;
	operationsPerSecond: number;
}

/**
 * High-performance game grid with sparse storage and viewport culling
 */
export class GameGrid {
	private tiles: Map<string, TileData> = new Map();
	private dirtyTiles: Set<string> = new Set();
	private lastUpdateTime = 0;
	private operationCount = 0;
	private operationStartTime = Date.now();

	// Grid dimensions (for bounds checking)
	private bounds: { min: Vec2; max: Vec2 } | null = null;

	// Event listeners for reactive updates
	private listeners: ((event: GridUpdateEvent) => void)[] = [];

	constructor() {
		console.log('🎯 GameGrid initialized with sparse storage');
	}

	/**
	 * Set a tile at the given coordinates
	 * Efficient single-tile updates with dirty tracking
	 */
	setTile(x: number, y: number, tile: TileData): void {
		const key = GridCoords.toKey(x, y);

		// Ensure position matches coordinates
		tile.position = { x, y };
		tile.dirty = true;
		tile.lastUpdated = Date.now();

		// Store tile and mark as dirty
		this.tiles.set(key, tile);
		this.dirtyTiles.add(key);

		// Update bounds
		this.updateBounds(x, y);

		// Track performance
		TilePerformance.recordUpdate();
		this.recordOperation();

		// Notify listeners
		this.notifyListeners({
			type: 'single',
			tiles: [tile]
		});
	}

	/**
	 * Get a tile at the given coordinates
	 * Returns undefined for empty tiles (sparse storage)
	 */
	getTile(x: number, y: number): TileData | undefined {
		const key = GridCoords.toKey(x, y);
		return this.tiles.get(key);
	}

	/**
	 * Check if a tile exists at the given coordinates
	 */
	hasTile(x: number, y: number): boolean {
		const key = GridCoords.toKey(x, y);
		return this.tiles.has(key);
	}

	/**
	 * Remove a tile at the given coordinates
	 */
	removeTile(x: number, y: number): boolean {
		const key = GridCoords.toKey(x, y);
		const removed = this.tiles.delete(key);

		if (removed) {
			this.dirtyTiles.delete(key);
			this.recalculateBounds();
			this.recordOperation();
		}

		return removed;
	}

	/**
	 * Get all tiles visible within the specified viewport
	 * Implements efficient viewport culling for rendering
	 */
	getVisibleTiles(viewport: Viewport): TileData[] {
		const visibleTiles: TileData[] = [];

		// Only check tiles within viewport bounds
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

	/**
	 * Get all dirty tiles that need re-rendering
	 * Used for efficient incremental updates
	 */
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

	/**
	 * Clear all dirty flags after rendering
	 */
	clearDirtyFlags(): void {
		for (const key of this.dirtyTiles) {
			const tile = this.tiles.get(key);
			if (tile) {
				tile.dirty = false;
			}
		}
		this.dirtyTiles.clear();
	}

	/**
	 * Batch update multiple tiles for performance
	 * More efficient than multiple setTile calls
	 */
	batchUpdate(updates: BatchUpdate[]): void {
		const updatedTiles: TileData[] = [];

		for (const update of updates) {
			const key = GridCoords.toKey(update.x, update.y);
			let tile = this.tiles.get(key);

			// Create new tile if it doesn't exist
			if (!tile) {
				tile = TileFactory.createEmpty(update.x, update.y);
				TilePerformance.recordCreation();
			}

			// Apply updates
			if (update.char !== undefined) tile.char = update.char;
			if (update.foreground) tile.foreground = update.foreground;
			if (update.background) tile.background = update.background;
			if (update.animationOffset) tile.animationOffset = update.animationOffset;

			// Mark as updated
			tile.dirty = true;
			tile.lastUpdated = Date.now();

			// Store and track
			this.tiles.set(key, tile);
			this.dirtyTiles.add(key);
			updatedTiles.push(tile);

			// Update bounds
			this.updateBounds(update.x, update.y);
		}

		this.recordOperation();

		// Single notification for all updates
		this.notifyListeners({
			type: 'batch',
			tiles: updatedTiles
		});

		console.log(`📦 Batch updated ${updates.length} tiles`);
	}

	/**
	 * Fill a rectangular area with the same tile
	 */
	fillArea(
		x: number, y: number,
		width: number, height: number,
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

	/**
	 * Clear all tiles from the grid
	 */
	clear(): void {
		// The per-frame pawn overlay grid calls this every animation frame and has
		// no listeners, so skip the tile-array copy + notify unless someone is
		// actually listening. (No console log here — it ran 60+×/sec as spam.)
		const hasListeners = this.listeners.length > 0;
		const clearedTiles = hasListeners ? Array.from(this.tiles.values()) : [];

		this.tiles.clear();
		this.dirtyTiles.clear();
		this.bounds = null;
		this.recordOperation();

		if (hasListeners) {
			this.notifyListeners({
				type: 'clear',
				tiles: clearedTiles
			});
		}
	}

	/**
	 * Get grid boundaries (min/max coordinates with tiles)
	 */
	getBounds(): { min: Vec2; max: Vec2 } | null {
		return this.bounds ? { ...this.bounds } : null;
	}

	/**
	 * Get all tiles in the grid
	 * Warning: Can be expensive for large grids
	 */
	getAllTiles(): TileData[] {
		return Array.from(this.tiles.values());
	}

	/**
	 * Get tiles in a specific region
	 */
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

	/**
	 * Get performance statistics
	 */
	getStats(): GridStats {
		const now = Date.now();
		const timeSinceStart = (now - this.operationStartTime) / 1000;

		return {
			totalTiles: this.tiles.size,
			visibleTiles: 0, // Updated by getVisibleTiles()
			dirtyTiles: this.dirtyTiles.size,
			memoryUsageMB: this.estimateMemoryUsage(),
			lastUpdateTime: this.lastUpdateTime,
			operationsPerSecond: timeSinceStart > 0 ? this.operationCount / timeSinceStart : 0
		};
	}

	/**
	 * Subscribe to grid update events
	 */
	subscribe(listener: (event: GridUpdateEvent) => void): () => void {
		this.listeners.push(listener);

		// Return unsubscribe function
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index >= 0) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/**
	 * Create a test grid pattern showing all CP437 characters for development
	 */
	createTestPattern(width: number = 80, height: number = 50): void {
		console.log(`🎨 Creating ${width}x${height} test pattern with all CP437 characters...`);

		// Generate all CP437 characters (256 total)
		const allChars: string[] = [];
		for (let i = 0; i < 256; i++) {
			if (i === 0) {
				allChars.push(' '); // Null character as space
			} else if (i < 32) {
				// Control characters - use their CP437 graphic representations
				const controlChars = [
					' ', '☺', '☻', '♥', '♦', '♣', '♠', '•', '◘', '○', '◙', '♂', '♀', '♪', '♫', '☼',
					'►', '◄', '↕', '‼', '¶', '§', '▬', '↨', '↑', '→', '↓', '←', '∟', '↔', '▲', '▼'
				];
				allChars.push(controlChars[i] || String.fromCharCode(i));
			} else {
				allChars.push(String.fromCharCode(i));
			}
		}

		// Rich color palette for visual variety
		const colors = [
			{ r: 1.0, g: 1.0, b: 1.0 }, // White
			{ r: 1.0, g: 0.0, b: 0.0 }, // Red
			{ r: 0.0, g: 1.0, b: 0.0 }, // Green  
			{ r: 0.0, g: 0.0, b: 1.0 }, // Blue
			{ r: 1.0, g: 1.0, b: 0.0 }, // Yellow
			{ r: 1.0, g: 0.0, b: 1.0 }, // Magenta
			{ r: 0.0, g: 1.0, b: 1.0 }, // Cyan
			{ r: 1.0, g: 0.5, b: 0.0 }, // Orange
			{ r: 0.5, g: 0.0, b: 1.0 }, // Purple
			{ r: 0.0, g: 0.5, b: 0.0 }, // Dark Green
			{ r: 0.5, g: 0.5, b: 0.5 }, // Gray
			{ r: 1.0, g: 0.5, b: 0.5 }, // Light Red
			{ r: 0.5, g: 1.0, b: 0.5 }, // Light Green
			{ r: 0.5, g: 0.5, b: 1.0 }, // Light Blue
			{ r: 1.0, g: 1.0, b: 0.5 }, // Light Yellow
			{ r: 0.8, g: 0.8, b: 0.8 }, // Light Gray
		];

		const updates: BatchUpdate[] = [];
		let charIndex = 0;

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				// Cycle through all CP437 characters sequentially
				const char = allChars[charIndex % allChars.length];

				// Change colors every 16 characters to create visual blocks
				const colorIndex = Math.floor(charIndex / 16) % colors.length;

				updates.push({
					x,
					y,
					char: char,
					foreground: colors[colorIndex],
					background: { r: 0, g: 0, b: 0 } // Transparent background
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

	// Private helper methods

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
		// Rough estimate: 200 bytes per tile (includes object overhead)
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
