/* filepath: src/lib/webgl/font-atlas.ts */
/**
 * Font Atlas Generation System
 * Creates texture atlases from monospace fonts for efficient WebGL rendering
 */

import type { FontAtlas, CharacterInfo, FontMetrics } from './types.js';
import { CP437_TO_UNICODE } from '$lib/game/core/cp437.js';

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
    const { atlasWidth, atlasHeight, layout } = this.calculateAtlasLayout(
      metrics,
      CP437_CHARS.length
    );

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
      console.log(
        `✅ Font atlas generated: ${atlasWidth}x${atlasHeight}, ${characters.size} characters`
      );
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
      console.log(
        `📏 Font metrics: ${width}x${height}, baseline: ${baseline}, ascent: ${ascent}, descent: ${descent}`
      );
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
  private calculateAtlasLayout(
    metrics: FontMetrics,
    charCount: number
  ): {
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
      console.log(
        `📐 Atlas layout: ${atlasWidth}x${atlasHeight} (${charsPerRow}x${rows} grid, ${charWidth}x${charHeight} cells)`
      );
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
  const fontSize = Math.round(cellSize * 0.9);

  // Try bitmap-style monospace fonts first
  const fontStack = ['DejaVu Sans Mono', '"Courier New"', 'Courier', 'monospace'].join(', ');

  ctx.font = `${fontSize}px ${fontStack}`;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center'; // horizontal centre
  ctx.textBaseline = 'middle'; // vertical centre
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
    console.log(
      `✅ Square-cell atlas: ${atlasWidth}×${atlasHeight}, ${cellSize}×${cellSize} cells, ${chars.length} glyphs`
    );
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
      y: row * tileH, // 0 … sheetH-tileH
      width: tileW,
      height: tileH,
      xAdvance: tileW,
      xOffset: 0,
      yOffset: 0
    });
  }

  // Bottom half → PUA chars U+E000 + cp (plants sheet)
  for (let cp = 0; cp < 256; cp++) {
    const uchar = String.fromCodePoint(0xe000 + cp);
    const col = cp % 16;
    const row = Math.floor(cp / 16);
    characters.set(uchar, {
      char: uchar,
      x: col * tileW,
      y: sheetH + row * tileH, // sheetH … img.height-tileH
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
    console.log(
      `✅ Tileset atlas: ${img.width}×${img.height} (${tileW}×${tileH} tiles, ${characters.size} glyphs) from ${url}`
    );
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
  // Each sheet is a `cols × rows` grid of `cellW × cellH` sprites, registered at `puaBase + index`
  // (or CP437 when puaBase is null). The bitlands sheets default to a 16×16 grid of 12×18 cells; the
  // `trees` sheet carries LARGER native sprites (96×96, greyscaled CDDA trees from Fantasia4x-ultica)
  // in a 2×16 grid (31 sprites: every tree tile ultica's resources reference, incl. unused seasonal/
  // harvested variants) — they render bigger than one cell via the per-tile `scale` (see TileData.scale).
  const D = { cellW: tileW, cellH: tileH, cols: 16, rows: 16 };
  const sheets: Array<{
    url: string;
    puaBase: number | null;
    cellW?: number;
    cellH?: number;
    cols?: number;
    rows?: number;
  }> = [
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
    { url: '/tilesets/trees.png', puaBase: 0xea00, cellW: 96, cellH: 96, cols: 2, rows: 16 }
  ];

  const results = await Promise.allSettled(
    sheets.map(
      ({ url }) =>
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

  if (!imgs.some((img) => img !== null)) throw new Error('loadBitlandsAtlas: no tilesheets loaded');

  // Per-sheet slot height (rows × cellH); slots stack vertically. Layout is derived from the CONFIG
  // (not the loaded image), so a missing sheet leaves its gap and never shifts the others' coords.
  const slotW = (s: (typeof sheets)[number]) => (s.cols ?? D.cols) * (s.cellW ?? D.cellW);
  const slotH = (s: (typeof sheets)[number]) => (s.rows ?? D.rows) * (s.cellH ?? D.cellH);
  const yOffsets: number[] = [];
  let acc = 0;
  for (const s of sheets) {
    yOffsets.push(acc);
    acc += slotH(s);
  }
  const atlasW = Math.max(...sheets.map(slotW));
  const atlasH = acc;

  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('loadBitlandsAtlas: could not get 2D context');

  const characters = new Map<string, import('./types.js').CharacterInfo>();

  for (let s = 0; s < sheets.length; s++) {
    const img = imgs[s];
    if (!img) continue; // skip missing sheets

    const sheet = sheets[s];
    const cellW = sheet.cellW ?? D.cellW;
    const cellH = sheet.cellH ?? D.cellH;
    const cols = sheet.cols ?? D.cols;
    const rows = sheet.rows ?? D.rows;
    const yOffset = yOffsets[s];
    const w = cols * cellW;
    const h = rows * cellH;
    ctx.drawImage(img, 0, yOffset);

    // Strip magenta (255,0,255) background → alpha=0 so the shader's
    // mix(v_background, tinted, sprite.a) treats it as empty space.
    const rawData = ctx.getImageData(0, yOffset, w, h);
    const d = rawData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(rawData, 0, yOffset);

    const { puaBase } = sheet;
    for (let cp = 0; cp < cols * rows; cp++) {
      const col = cp % cols;
      const row = Math.floor(cp / cols);
      const uchar = puaBase === null ? CP437_TO_UNICODE[cp] : String.fromCodePoint(puaBase + cp);
      characters.set(uchar, {
        char: uchar,
        x: col * cellW,
        y: yOffset + row * cellH,
        width: cellW,
        height: cellH,
        xAdvance: cellW,
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
