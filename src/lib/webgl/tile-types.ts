/* filepath: src/lib/game/tile.ts */
/**
 * Tile data types and utilities for the game grid system
 * Defines the structure and behavior of individual tiles
 */

/**
 * Fixed pixel size each tile's geometry is baked at. Zoom is applied as a shader
 * uniform (u_zoom = actualTileSize / BASE_TILE_PX) rather than baked into vertex
 * positions, so changing zoom never rebuilds the terrain vertex buffer.
 */
export const BASE_TILE_PX = 16;

// Core color type
export interface RGB {
	r: number;
	g: number;
	b: number;
}

// 2D Vector type for positions and offsets
export interface Vec2 {
	x: number;
	y: number;
}

// Viewport definition for culling calculations
export interface Viewport {
	x: number;      // Top-left corner X
	y: number;      // Top-left corner Y  
	width: number;  // Width in tiles
	height: number; // Height in tiles
}

// Core tile data structure
export interface TileData {
	char: string;                    // Character to display (CP437 or Unicode)
	foreground: RGB;                 // Text color
	background: RGB;                 // Background color
	detail?: RGB;                    // Highlight/detail color for 3-color tint (defaults to foreground)
	outline?: RGB;                   // Outline color drawn around the glyph edges (omit = no outline)
	position: { x: number; y: number }; // Grid position
	animationOffset?: Vec2;          // Optional offset for smooth animations
	rotation?: 0 | 90 | 180 | 270;  // UV rotation in degrees (clockwise)
	dirty?: boolean;                 // Marks tile for re-rendering
	lastUpdated?: number;            // Timestamp of last modification
}

// Grid coordinate utilities
export class GridCoords {
	/**
	 * Convert grid coordinates to a string key for Map storage
	 */
	static toKey(x: number, y: number): string {
		return `${x},${y}`;
	}

	/**
	 * Parse a coordinate key back to x,y values
	 */
	static fromKey(key: string): { x: number; y: number } {
		const [x, y] = key.split(',').map(Number);
		return { x, y };
	}

	/**
	 * Check if a coordinate is within a viewport
	 */
	static isInViewport(x: number, y: number, viewport: Viewport): boolean {
		return x >= viewport.x &&
			x < viewport.x + viewport.width &&
			y >= viewport.y &&
			y < viewport.y + viewport.height;
	}

	/**
	 * Calculate the bounding box that contains all given coordinates
	 */
	static getBounds(coords: Vec2[]): { min: Vec2; max: Vec2 } | null {
		if (coords.length === 0) return null;

		let minX = coords[0].x;
		let maxX = coords[0].x;
		let minY = coords[0].y;
		let maxY = coords[0].y;

		for (const coord of coords) {
			minX = Math.min(minX, coord.x);
			maxX = Math.max(maxX, coord.x);
			minY = Math.min(minY, coord.y);
			maxY = Math.max(maxY, coord.y);
		}

		return {
			min: { x: minX, y: minY },
			max: { x: maxX, y: maxY }
		};
	}

	/**
	 * Calculate distance between two grid coordinates
	 */
	static distance(a: Vec2, b: Vec2): number {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * Calculate Manhattan distance between two grid coordinates
	 */
	static manhattanDistance(a: Vec2, b: Vec2): number {
		return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
	}
}

// Color utilities
export class ColorUtils {
	/**
	 * Create an RGB color from individual components
	 */
	static rgb(r: number, g: number, b: number): RGB {
		return {
			r: Math.max(0, Math.min(1, r)),
			g: Math.max(0, Math.min(1, g)),
			b: Math.max(0, Math.min(1, b))
		};
	}

	/**
	 * Create an RGB color from hex string
	 */
	static fromHex(hex: string): RGB {
		const clean = hex.replace('#', '');
		const r = parseInt(clean.substr(0, 2), 16) / 255;
		const g = parseInt(clean.substr(2, 2), 16) / 255;
		const b = parseInt(clean.substr(4, 2), 16) / 255;
		return { r, g, b };
	}

	/**
	 * Convert RGB to hex string
	 */
	static toHex(color: RGB): string {
		const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
		const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
		const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
		return `#${r}${g}${b}`;
	}

	/**
	 * Interpolate between two colors
	 */
	static lerp(a: RGB, b: RGB, t: number): RGB {
		const clampedT = Math.max(0, Math.min(1, t));
		return {
			r: a.r + (b.r - a.r) * clampedT,
			g: a.g + (b.g - a.g) * clampedT,
			b: a.b + (b.b - a.b) * clampedT
		};
	}

	/**
	 * Predefined color palette for common use
	 */
	static readonly PALETTE = {
		BLACK: { r: 0, g: 0, b: 0 },
		WHITE: { r: 1, g: 1, b: 1 },
		RED: { r: 1, g: 0, b: 0 },
		GREEN: { r: 0, g: 1, b: 0 },
		BLUE: { r: 0, g: 0, b: 1 },
		YELLOW: { r: 1, g: 1, b: 0 },
		CYAN: { r: 0, g: 1, b: 1 },
		MAGENTA: { r: 1, g: 0, b: 1 },
		GRAY: { r: 0.5, g: 0.5, b: 0.5 },
		ORANGE: { r: 1, g: 0.5, b: 0 },
		PURPLE: { r: 0.5, g: 0, b: 1 },
		LIME: { r: 0.5, g: 1, b: 0 },
		TRANSPARENT: { r: 0, g: 0, b: 0 } // For transparent backgrounds
	} as const;
}

// Tile factory functions for common tile types
export class TileFactory {
	/**
	 * Create a basic tile with character and colors
	 */
	static createTile(
		x: number,
		y: number,
		char: string,
		foreground: RGB = ColorUtils.PALETTE.WHITE,
		background: RGB = ColorUtils.PALETTE.TRANSPARENT
	): TileData {
		return {
			char,
			foreground,
			background,
			position: { x, y },
			dirty: true,
			lastUpdated: Date.now()
		};
	}

	/**
	 * Create a wall tile
	 */
	static createWall(x: number, y: number): TileData {
		return this.createTile(x, y, '#', ColorUtils.PALETTE.GRAY, ColorUtils.PALETTE.BLACK);
	}

	/**
	 * Create a floor tile
	 */
	static createFloor(x: number, y: number): TileData {
		return this.createTile(x, y, '.', ColorUtils.PALETTE.GRAY, ColorUtils.PALETTE.TRANSPARENT);
	}

	/**
	 * Create a player tile
	 */
	static createPlayer(x: number, y: number): TileData {
		return this.createTile(x, y, '@', ColorUtils.PALETTE.YELLOW, ColorUtils.PALETTE.TRANSPARENT);
	}

	/**
	 * Create an empty/air tile
	 */
	static createEmpty(x: number, y: number): TileData {
		return this.createTile(x, y, ' ', ColorUtils.PALETTE.TRANSPARENT, ColorUtils.PALETTE.TRANSPARENT);
	}
}

// Performance monitoring for tile operations
export class TilePerformance {
	private static tileCreations = 0;
	private static tileUpdates = 0;
	private static lastReset = Date.now();

	static recordCreation(): void {
		this.tileCreations++;
	}

	static recordUpdate(): void {
		this.tileUpdates++;
	}

	static getStats(): { creations: number; updates: number; duration: number } {
		const duration = Date.now() - this.lastReset;
		return {
			creations: this.tileCreations,
			updates: this.tileUpdates,
			duration
		};
	}

	static reset(): void {
		this.tileCreations = 0;
		this.tileUpdates = 0;
		this.lastReset = Date.now();
	}
}
