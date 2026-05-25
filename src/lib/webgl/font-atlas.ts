/* filepath: src/lib/webgl/font-atlas.ts */
/**
 * Font Atlas Generation System
 * Creates texture atlases from monospace fonts for efficient WebGL rendering
 */

import type { FontAtlas, CharacterInfo, FontMetrics } from './types.js';

/**
 * Extended character set for roguelikes
 * Includes ASCII printable characters (32-126) plus extended characters
 */
const CP437_CHARS = [
	// Basic ASCII printable characters (32-126)
	' !"#$%&\'()*+,-./0123456789:;<=>?',
	'@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_',
	'`abcdefghijklmnopqrstuvwxyz{|}~',
	// Extended CP437 characters commonly used in roguelikes
	'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ',
	'áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐',
	'└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀',
	'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
	// Card suits and other symbols used in terrain generation
	'♠♥♦♣☺☻♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼'
].join('');

export class FontAtlasGenerator {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private debug: boolean;

	constructor(debug: boolean = false) {
		this.debug = debug;

		// Create canvas for font rendering
		this.canvas = document.createElement('canvas');
		const ctx = this.canvas.getContext('2d', {
			willReadFrequently: true
		});

		if (!ctx) {
			throw new Error('Failed to create 2D canvas context for font atlas generation');
		}

		this.ctx = ctx;
	}

	/**
	 * Generate a font atlas from a monospace font
	 */
	async generateAtlas(fontFamily: string, fontSize: number): Promise<FontAtlas> {
		if (this.debug) {
			console.log(`🔄 Generating font atlas for ${fontFamily} at ${fontSize}px...`);
		}

		// Get font metrics
		const metrics = this.measureFont(fontFamily, fontSize);

		// Calculate atlas dimensions
		const { atlasWidth, atlasHeight, layout } = this.calculateAtlasLayout(metrics, CP437_CHARS.length);

		// Set up canvas
		this.canvas.width = atlasWidth;
		this.canvas.height = atlasHeight;
		this.ctx.fillStyle = 'black';
		this.ctx.fillRect(0, 0, atlasWidth, atlasHeight);

		// Configure font rendering
		this.ctx.font = `${fontSize}px ${fontFamily}`;
		this.ctx.fillStyle = 'white';
		this.ctx.textAlign = 'left';
		this.ctx.textBaseline = 'top';

		// Disable anti-aliasing for crisp pixel-perfect rendering
		this.ctx.imageSmoothingEnabled = false;

		const characters = new Map<string, CharacterInfo>();

		// Render each character
		for (let i = 0; i < CP437_CHARS.length; i++) {
			const char = CP437_CHARS[i];
			const { x, y } = layout[i];

			// Clear character cell
			this.ctx.fillStyle = 'black';
			this.ctx.fillRect(x, y, metrics.width, metrics.height);

			// Render character
			this.ctx.fillStyle = 'white';
			this.ctx.fillText(char, x, y + metrics.baseline - metrics.ascent);

			// Store character info
			characters.set(char, {
				char,
				x,
				y,
				width: metrics.width,
				height: metrics.height,
				xAdvance: metrics.width, // Monospace: all characters have same advance
				xOffset: 0,
				yOffset: 0
			});
		}

		// Get texture data
		const imageData = this.ctx.getImageData(0, 0, atlasWidth, atlasHeight);

		if (this.debug) {
			console.log(`✅ Font atlas generated: ${atlasWidth}x${atlasHeight}, ${characters.size} characters`);
			this.debugAtlas(imageData, atlasWidth, atlasHeight);
		}

		return {
			texture: imageData,
			characters,
			fontFamily,
			fontSize,
			atlasWidth,
			atlasHeight,
			lineHeight: metrics.height,
			baseline: metrics.baseline
		};
	}

	/**
	 * Measure font metrics for precise character placement
	 */
	private measureFont(fontFamily: string, fontSize: number): FontMetrics {
		// Set up measurement context
		this.ctx.font = `${fontSize}px ${fontFamily}`;
		this.ctx.textAlign = 'left';
		this.ctx.textBaseline = 'alphabetic';

		// Measure a representative character (typically 'M' or 'W' for width)
		const metrics = this.ctx.measureText('M');

		// For monospace fonts, all characters should have the same width
		const width = Math.ceil(metrics.width);

		// Calculate height from font metrics
		const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize * 0.8);
		const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * 0.2);
		const height = ascent + descent;
		const baseline = ascent;

		if (this.debug) {
			console.log(`📏 Font metrics: ${width}x${height}, baseline: ${baseline}, ascent: ${ascent}, descent: ${descent}`);
		}

		return {
			width,
			height,
			baseline,
			ascent,
			descent
		};
	}

	/**
	 * Calculate optimal atlas layout for character packing
	 */
	private calculateAtlasLayout(metrics: FontMetrics, charCount: number): {
		atlasWidth: number;
		atlasHeight: number;
		layout: Array<{ x: number; y: number }>;
	} {
		const charWidth = metrics.width;
		const charHeight = metrics.height;

		// Calculate grid dimensions
		// Aim for roughly square atlas, prefer powers of 2 for GPU efficiency
		const charsPerRow = Math.ceil(Math.sqrt(charCount));
		const rows = Math.ceil(charCount / charsPerRow);

		// Round up to next power of 2 for GPU efficiency
		const atlasWidth = this.nextPowerOf2(charsPerRow * charWidth);
		const atlasHeight = this.nextPowerOf2(rows * charHeight);

		// Generate character positions
		const layout: Array<{ x: number; y: number }> = [];
		for (let i = 0; i < charCount; i++) {
			const row = Math.floor(i / charsPerRow);
			const col = i % charsPerRow;
			layout.push({
				x: col * charWidth,
				y: row * charHeight
			});
		}

		if (this.debug) {
			console.log(`📐 Atlas layout: ${atlasWidth}x${atlasHeight} (${charsPerRow}x${rows} grid, ${charWidth}x${charHeight} cells)`);
		}

		return {
			atlasWidth,
			atlasHeight,
			layout
		};
	}

	/**
	 * Find next power of 2 (for GPU texture efficiency)
	 */
	private nextPowerOf2(n: number): number {
		return Math.pow(2, Math.ceil(Math.log2(n)));
	}

	/**
	 * Debug visualization of the generated atlas
	 */
	private debugAtlas(imageData: ImageData, width: number, height: number): void {
		// Create a debug canvas to visualize the atlas
		const debugCanvas = document.createElement('canvas');
		debugCanvas.width = width;
		debugCanvas.height = height;
		debugCanvas.style.position = 'fixed';
		debugCanvas.style.top = '10px';
		debugCanvas.style.right = '10px';
		debugCanvas.style.border = '2px solid #00ff00';
		debugCanvas.style.zIndex = '10000';
		debugCanvas.style.backgroundColor = 'black';
		debugCanvas.title = 'Font Atlas Debug View';

		const debugCtx = debugCanvas.getContext('2d');
		if (debugCtx) {
			debugCtx.putImageData(imageData, 0, 0);
			document.body.appendChild(debugCanvas);

			// Remove after 10 seconds
			setTimeout(() => {
				document.body.removeChild(debugCanvas);
			}, 10000);
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		// Canvas will be garbage collected
	}
}

/**
 * Convenience function to generate a default monospace font atlas
 */
export async function createMonospaceFontAtlas(debug: boolean = false): Promise<FontAtlas> {
	const generator = new FontAtlasGenerator(debug);

	try {
		// Try DejaVu Sans Mono first (good roguelike font)
		return await generator.generateAtlas('DejaVu Sans Mono', 16);
	} catch {
		console.warn('DejaVu Sans Mono not available, falling back to Courier New');

		try {
			// Fallback to Courier New (widely available)
			return await generator.generateAtlas('Courier New', 16);
		} catch {
			console.warn('Courier New not available, falling back to monospace');

			// Final fallback to generic monospace
			return await generator.generateAtlas('monospace', 16);
		}
	} finally {
		generator.dispose();
	}
}

/**
 * Generate a square-cell CP437 atlas.
 *
 * Each glyph is rendered as a **white character on a transparent background**
 * so the fragment shader can use sprite.a as glyph coverage and apply the
 * 3-colour tint (background → foreground → detail) per-tile at runtime.
 *
 * Characters are laid out in 16 columns (standard CP437 grid order) so that
 * UV coordinates can be computed with the fixed formula:
 *   u = (charIndex % 16) / 16
 *   v = floor(charIndex / 16) / 16
 *
 * @param cellSize  Width and height of each glyph cell in pixels (default 16).
 * @param debug     Emit debug log messages.
 */
export async function createSquareCellAtlas(cellSize = 16, debug = false): Promise<FontAtlas> {
	const COLS = 16;
	const chars = CP437_CHARS;
	const rows = Math.ceil(chars.length / COLS);

	// Atlas dimensions — power-of-2 for GPU efficiency
	const nextPow2 = (n: number) => Math.pow(2, Math.ceil(Math.log2(Math.max(n, 1))));
	const atlasWidth = nextPow2(COLS * cellSize);
	const atlasHeight = nextPow2(rows * cellSize);

	// Offscreen canvas — willReadFrequently for getImageData
	const canvas = document.createElement('canvas');
	canvas.width = atlasWidth;
	canvas.height = atlasHeight;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Could not create 2D context for square-cell atlas');

	// Transparent background
	ctx.clearRect(0, 0, atlasWidth, atlasHeight);

	// Font size: fill as much of the cell as possible for crisp rendering.
	// 90 % leaves a small margin so ascenders/descenders don't clip.
	const fontSize = Math.round(cellSize * 0.90);

	// Try bitmap-style monospace fonts first
	const fontStack = [
		'DejaVu Sans Mono',
		'"Courier New"',
		'Courier',
		'monospace'
	].join(', ');

	ctx.font = `${fontSize}px ${fontStack}`;
	ctx.fillStyle = 'white';
	ctx.textAlign = 'center';  // horizontal centre
	ctx.textBaseline = 'middle';  // vertical centre
	ctx.imageSmoothingEnabled = false;

	const characters = new Map<string, import('./types.js').CharacterInfo>();

	for (let i = 0; i < chars.length; i++) {
		const char = chars[i];
		const col = i % COLS;
		const row = Math.floor(i / COLS);
		const cellX = col * cellSize;
		const cellY = row * cellSize;

		// Render glyph centred in the cell (textAlign=center, textBaseline=middle)
		ctx.fillText(char, cellX + cellSize / 2, cellY + cellSize / 2);

		characters.set(char, {
			char,
			x: cellX,
			y: cellY,
			width: cellSize,
			height: cellSize,
			xAdvance: cellSize,
			xOffset: 0,
			yOffset: 0
		});
	}

	const imageData = ctx.getImageData(0, 0, atlasWidth, atlasHeight);

	if (debug) {
		console.log(`✅ Square-cell atlas: ${atlasWidth}×${atlasHeight}, ${cellSize}×${cellSize} cells, ${chars.length} glyphs`);
	}

	return {
		texture: imageData,
		characters,
		fontFamily: fontStack,
		fontSize,
		atlasWidth,
		atlasHeight,
		lineHeight: cellSize,
		baseline: Math.floor(cellSize / 2)
	};
}
