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

// ---------------------------------------------------------------------------
// Bitmap tileset atlas loader (Dwarf Fortress / CP437-layout PNGs)
// ---------------------------------------------------------------------------

/**
 * CP437 byte value → Unicode character.
 * Bytes 32–126 are identical to ASCII; everything else follows the IBM PC
 * Code Page 437 specification.
 */
const CP437_TO_UNICODE: readonly string[] = [
	// 0x00–0x1F  (control codes rendered as graphics in CP437)
	'\u0000', '\u263A', '\u263B', '\u2665', '\u2666', '\u2663', '\u2660', '\u2022',
	'\u25D8', '\u25CB', '\u25D9', '\u2642', '\u2640', '\u266A', '\u266B', '\u263C',
	'\u25BA', '\u25C4', '\u2195', '\u203C', '\u00B6', '\u00A7', '\u25AC', '\u21A8',
	'\u2191', '\u2193', '\u2192', '\u2190', '\u221F', '\u2194', '\u25B2', '\u25BC',
	// 0x20–0x7E  (printable ASCII — identical to Unicode)
	' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
	'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
	'@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
	'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '^', '_',
	'`', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
	'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~',
	// 0x7F
	'\u2302',
	// 0x80–0xFF  (CP437 extended characters)
	'\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7',
	'\u00EA', '\u00EB', '\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5',
	'\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
	'\u00FF', '\u00D6', '\u00DC', '\u00A2', '\u00A3', '\u00A5', '\u20A7', '\u0192',
	'\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1', '\u00AA', '\u00BA',
	'\u00BF', '\u2310', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB',
	'\u2591', '\u2592', '\u2593', '\u2502', '\u2524', '\u2561', '\u2562', '\u2556',
	'\u2555', '\u2563', '\u2551', '\u2557', '\u255D', '\u255C', '\u255B', '\u2510',
	'\u2514', '\u2534', '\u252C', '\u251C', '\u2500', '\u253C', '\u255E', '\u255F',
	'\u255A', '\u2554', '\u2569', '\u2566', '\u2560', '\u2550', '\u256C', '\u2567',
	'\u2568', '\u2564', '\u2565', '\u2559', '\u2558', '\u2552', '\u2553', '\u256B',
	'\u256A', '\u2518', '\u250C', '\u2588', '\u2584', '\u258C', '\u2590', '\u2580',
	'\u03B1', '\u00DF', '\u0393', '\u03C0', '\u03A3', '\u03C3', '\u00B5', '\u03C4',
	'\u03A6', '\u0398', '\u03A9', '\u03B4', '\u221E', '\u03C6', '\u03B5', '\u2229',
	'\u2261', '\u00B1', '\u2265', '\u2264', '\u2320', '\u2321', '\u00F7', '\u2248',
	'\u00B0', '\u2219', '\u00B7', '\u221A', '\u207F', '\u00B2', '\u25A0', '\u00A0',
];

/**
 * Load a CP437-layout tileset PNG as a WebGL font atlas.
 *
 * The image must be pre-processed to RGBA with white glyphs and
 * alpha = luminance (transparent background).  The tile grid is always
 * 16 columns × 16 rows, so tileW = imageWidth / 16, tileH = imageHeight / 16.
 *
 * @param url    Path to the PNG (e.g. '/tilesets/bitlands_font.png').
 * @param tileW  Width of one tile in the source image (pixels).
 * @param tileH  Height of one tile in the source image (pixels).
 * @param debug  Emit debug log messages.
 */
/**
 * Load the combined terrain atlas (bitlands_combined.png, 192×576).
 *
 * Layout:
 *   Top 288 px  (rows  0-15) — bitlands_tiles.bmp  (ground/floor tiles)
 *   Bottom 288 px (rows 16-31) — bitlands_plants.bmp (plant/tree sprites)
 *
 * Character mapping:
 *   CP437 Unicode chars  → top half   (tiles sheet, positions 0-255)
 *   PUA U+E000–U+E0FF    → bottom half (plants sheet, positions 0-255)
 *
 * Terrain definitions reference tiles via normal chars (e.g. ',', '.') for
 * ground tiles and via String.fromCodePoint(0xE000 + idx) for plant sprites.
 */
export async function loadCombinedTerrainAtlas(
	url: string,
	tileW: number,
	tileH: number,
	debug = false
): Promise<FontAtlas> {
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Failed to load combined terrain atlas: ${url}`));
		image.src = url;
	});

	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Could not create 2D context for combined terrain atlas');
	ctx.drawImage(img, 0, 0);
	const imageData = ctx.getImageData(0, 0, img.width, img.height);

	const sheetH = img.height / 2; // height of each half (288 px)
	const characters = new Map<string, import('./types.js').CharacterInfo>();

	// Top half → CP437 Unicode chars (tiles sheet)
	for (let cp = 0; cp < 256; cp++) {
		const uchar = CP437_TO_UNICODE[cp];
		const col = cp % 16;
		const row = Math.floor(cp / 16);
		characters.set(uchar, {
			char: uchar,
			x: col * tileW,
			y: row * tileH,           // 0 … sheetH-tileH
			width: tileW,
			height: tileH,
			xAdvance: tileW,
			xOffset: 0,
			yOffset: 0
		});
	}

	// Bottom half → PUA chars U+E000 + cp (plants sheet)
	for (let cp = 0; cp < 256; cp++) {
		const uchar = String.fromCodePoint(0xE000 + cp);
		const col = cp % 16;
		const row = Math.floor(cp / 16);
		characters.set(uchar, {
			char: uchar,
			x: col * tileW,
			y: sheetH + row * tileH,  // sheetH … img.height-tileH
			width: tileW,
			height: tileH,
			xAdvance: tileW,
			xOffset: 0,
			yOffset: 0
		});
	}

	if (debug) {
		console.log(
			`✅ Combined terrain atlas: ${img.width}×${img.height} ` +
			`(tiles+plants, ${tileW}×${tileH} tiles, ${characters.size} entries) from ${url}`
		);
	}

	return {
		texture: imageData,
		characters,
		fontFamily: 'bitlands-combined',
		fontSize: tileH,
		atlasWidth: img.width,
		atlasHeight: img.height,
		lineHeight: tileH,
		baseline: Math.floor(tileH / 2)
	};
}

export async function loadTilesetAtlas(
	url: string,
	tileW: number,
	tileH: number,
	debug = false
): Promise<FontAtlas> {
	// Load image
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Failed to load tileset: ${url}`));
		image.src = url;
	});

	// Draw to offscreen canvas to read pixels
	const canvas = document.createElement('canvas');
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Could not create 2D context for tileset atlas');
	ctx.drawImage(img, 0, 0);

	const imageData = ctx.getImageData(0, 0, img.width, img.height);

	// Build reverse mapping: Unicode char → CP437 byte index
	const unicodeToCP437 = new Map<string, number>();
	for (let i = 0; i < CP437_TO_UNICODE.length; i++) {
		unicodeToCP437.set(CP437_TO_UNICODE[i], i);
	}

	// Map every CP437 code point to its atlas position
	const characters = new Map<string, import('./types.js').CharacterInfo>();
	for (let cp = 0; cp < 256; cp++) {
		const uchar = CP437_TO_UNICODE[cp];
		const col = cp % 16;
		const row = Math.floor(cp / 16);
		characters.set(uchar, {
			char: uchar,
			x: col * tileW,
			y: row * tileH,
			width: tileW,
			height: tileH,
			xAdvance: tileW,
			xOffset: 0,
			yOffset: 0
		});
	}

	if (debug) {
		console.log(`✅ Tileset atlas: ${img.width}×${img.height} (${tileW}×${tileH} tiles, ${characters.size} glyphs) from ${url}`);
	}

	return {
		texture: imageData,
		characters,
		fontFamily: 'bitlands',
		fontSize: tileH,
		atlasWidth: img.width,
		atlasHeight: img.height,
		lineHeight: tileH,
		baseline: Math.floor(tileH / 2)
	};
}

/**
 * Append an additional 256-sprite sheet to an existing FontAtlas.
 *
 * The sheet is drawn below the existing atlas pixels. Each sprite at
 * grid position `cp` (0–255, row-major 16 columns) is registered under
 * String.fromCodePoint(puaBase + cp), so callers can reference it via
 * e.g. String.fromCodePoint(0xF000 + 64) for the humanoid at slot 64.
 */
export async function extendAtlasWithSheet(
	atlas: FontAtlas,
	url: string,
	tileW: number,
	tileH: number,
	puaBase: number,
	debug = false
): Promise<FontAtlas> {
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Failed to load atlas sheet: ${url}`));
		image.src = url;
	});

	const newW = atlas.atlasWidth;
	const newH = atlas.atlasHeight + img.height;

	// Build new canvas: existing pixels on top, new sheet appended below
	const newCanvas = document.createElement('canvas');
	newCanvas.width = newW;
	newCanvas.height = newH;
	const ctx = newCanvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Could not create 2D context for atlas extension');

	// Re-draw existing atlas pixels via an intermediate canvas
	const prevCanvas = document.createElement('canvas');
	prevCanvas.width = atlas.atlasWidth;
	prevCanvas.height = atlas.atlasHeight;
	const prevCtx = prevCanvas.getContext('2d');
	if (!prevCtx) throw new Error('Could not create 2D context for atlas copy');
	prevCtx.putImageData(atlas.texture, 0, 0);
	ctx.drawImage(prevCanvas, 0, 0);

	// Draw the new sheet immediately below
	ctx.drawImage(img, 0, atlas.atlasHeight);

	const newImageData = ctx.getImageData(0, 0, newW, newH);

	// Clone existing character map and register new sprites
	const characters = new Map(atlas.characters);
	for (let cp = 0; cp < 256; cp++) {
		const uchar = String.fromCodePoint(puaBase + cp);
		const col = cp % 16;
		const row = Math.floor(cp / 16);
		characters.set(uchar, {
			char: uchar,
			x: col * tileW,
			y: atlas.atlasHeight + row * tileH,
			width: tileW,
			height: tileH,
			xAdvance: tileW,
			xOffset: 0,
			yOffset: 0
		});
	}

	if (debug) {
		console.log(
			`✅ Atlas extended with ${url}: ${newW}×${newH}, ` +
			`256 sprites registered at U+${puaBase.toString(16).toUpperCase()}`
		);
	}

	return {
		texture: newImageData,
		characters,
		fontFamily: atlas.fontFamily,
		fontSize: atlas.fontSize,
		atlasWidth: newW,
		atlasHeight: newH,
		lineHeight: atlas.lineHeight,
		baseline: atlas.baseline
	};
}

/**
 * Load all eight bitlands sprite sheets into a single unified WebGL atlas.
 *
 * Atlas layout (each sheet is 192×288 px — 16 columns × 16 rows of 12×18 sprites):
 *   y=0    bitlands_tiles.bmp     chars via CP437_TO_UNICODE  (terrain compat)
 *   y=288  bitlands_plants.bmp    U+E000 + index
 *   y=576  bitlands_map.bmp       U+E200 + index  ← entities / humanoids
 *   y=864  bitlands_font.bmp      U+E300 + index
 *   y=1152 bitlands_buildings.bmp U+E400 + index
 *   y=1440 bitlands_items.bmp     U+E500 + index
 *   y=1728 bitlands_workshops.bmp U+E600 + index
 *   y=2016 bitlands_crops.bmp     U+E700 + index
 *   y=2304 creatures.bmp           U+E800 + index
 *   y=2592 races.bmp               U+E900 + index
 *
 * Total texture: 192×2880 px.  All sheets use tileW=12, tileH=18.
 *
 * Reference sprites by index with the helpers in tilesets.ts:
 *   glyph(SHEET.MAP, 64)  →  humanoid at map position 64
 */
export async function loadBitlandsAtlas(tileW = 12, tileH = 18, debug = false): Promise<FontAtlas> {
	const sheets: Array<{ url: string; puaBase: number | null }> = [
		{ url: '/tilesets/bitlands_tiles.bmp', puaBase: null }, // CP437 mapping
		{ url: '/tilesets/bitlands_plants.bmp', puaBase: 0xe000 },
		{ url: '/tilesets/bitlands_map.bmp', puaBase: 0xe200 },
		{ url: '/tilesets/bitlands_font.bmp', puaBase: 0xe300 },
		{ url: '/tilesets/bitlands_buildings.bmp', puaBase: 0xe400 },
		{ url: '/tilesets/bitlands_items.bmp', puaBase: 0xe500 },
		{ url: '/tilesets/bitlands_workshops.bmp', puaBase: 0xe600 },
		{ url: '/tilesets/bitlands_crops.bmp', puaBase: 0xe700 },
		{ url: '/tilesets/creatures.bmp', puaBase: 0xe800 },
		{ url: '/tilesets/races.bmp', puaBase: 0xe900 },
	];

	const results = await Promise.allSettled(
		sheets.map(({ url }) =>
			new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => reject(new Error(`loadBitlandsAtlas: failed to load ${url}`));
				image.src = url;
			})
		)
	);

	// Use only successfully loaded sheets; skip missing ones silently
	const imgs: (HTMLImageElement | null)[] = results.map((r, i) => {
		if (r.status === 'fulfilled') return r.value;
		if (debug) console.warn(`loadBitlandsAtlas: skipping missing sheet ${sheets[i].url}`);
		return null;
	});

	const firstLoaded = imgs.find((img) => img !== null) as HTMLImageElement;
	if (!firstLoaded) throw new Error('loadBitlandsAtlas: no tilesheets loaded');
	const sheetH = firstLoaded.height; // 288
	const atlasW = firstLoaded.width;  // 192
	const atlasH = sheetH * sheets.length; // 2304

	const canvas = document.createElement('canvas');
	canvas.width = atlasW;
	canvas.height = atlasH;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('loadBitlandsAtlas: could not get 2D context');

	const characters = new Map<string, import('./types.js').CharacterInfo>();

	for (let s = 0; s < sheets.length; s++) {
		const img = imgs[s];
		if (!img) continue; // skip missing sheets

		const yOffset = s * sheetH;
		ctx.drawImage(img, 0, yOffset);

		// Strip magenta (255,0,255) background → alpha=0 so the shader's
		// mix(v_background, tinted, sprite.a) treats it as empty space.
		const rawData = ctx.getImageData(0, yOffset, atlasW, sheetH);
		const d = rawData.data;
		for (let i = 0; i < d.length; i += 4) {
			if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) {
				d[i + 3] = 0;
			}
		}
		ctx.putImageData(rawData, 0, yOffset);

		const { puaBase } = sheets[s];
		for (let cp = 0; cp < 256; cp++) {
			const col = cp % 16;
			const row = Math.floor(cp / 16);
			const uchar = puaBase === null
				? CP437_TO_UNICODE[cp]
				: String.fromCodePoint(puaBase + cp);
			characters.set(uchar, {
				char: uchar,
				x: col * tileW,
				y: yOffset + row * tileH,
				width: tileW,
				height: tileH,
				xAdvance: tileW,
				xOffset: 0,
				yOffset: 0
			});
		}
	}

	const imageData = ctx.getImageData(0, 0, atlasW, atlasH);

	if (debug) {
		console.log(
			`✅ loadBitlandsAtlas: ${atlasW}×${atlasH}, ` +
			`${characters.size} sprites across ${sheets.length} sheets`
		);
	}

	return {
		texture: imageData,
		characters,
		fontFamily: 'bitlands',
		fontSize: tileH,
		atlasWidth: atlasW,
		atlasHeight: atlasH,
		lineHeight: tileH,
		baseline: Math.floor(tileH / 2)
	};
}
