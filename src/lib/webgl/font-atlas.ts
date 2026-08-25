import type { FontAtlas, CharacterInfo, FontMetrics } from './types.js';
import { CP437_TO_UNICODE } from '$lib/game/core/util/cp437.js';

const CP437_CHARS = [
  ' !"#$%&\'()*+,-./0123456789:;<=>?',
  '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_',
  '`abcdefghijklmnopqrstuvwxyz{|}~',
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒ',
  'áíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐',
  '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀',
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
  '♠♥♦♣☺☻♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼'
].join('');

export class FontAtlasGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;

    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', {
      willReadFrequently: true
    });

    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for font atlas generation');
    }

    this.ctx = ctx;
  }

  async generateAtlas(fontFamily: string, fontSize: number): Promise<FontAtlas> {
    if (this.debug) {
      console.log(`🔄 Generating font atlas for ${fontFamily} at ${fontSize}px...`);
    }

    const metrics = this.measureFont(fontFamily, fontSize);

    const { atlasWidth, atlasHeight, layout } = this.calculateAtlasLayout(
      metrics,
      CP437_CHARS.length
    );

    this.canvas.width = atlasWidth;
    this.canvas.height = atlasHeight;
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, atlasWidth, atlasHeight);

    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.fillStyle = 'white';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    this.ctx.imageSmoothingEnabled = false;

    const characters = new Map<string, CharacterInfo>();

    for (let i = 0; i < CP437_CHARS.length; i++) {
      const char = CP437_CHARS[i];
      const { x, y } = layout[i];

      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(x, y, metrics.width, metrics.height);

      this.ctx.fillStyle = 'white';
      this.ctx.fillText(char, x, y + metrics.baseline - metrics.ascent);

      characters.set(char, {
        char,
        x,
        y,
        width: metrics.width,
        height: metrics.height,
        xAdvance: metrics.width,
        xOffset: 0,
        yOffset: 0
      });
    }

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

  private measureFont(fontFamily: string, fontSize: number): FontMetrics {
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'alphabetic';

    const metrics = this.ctx.measureText('M');

    const width = Math.ceil(metrics.width);

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

    const charsPerRow = Math.ceil(Math.sqrt(charCount));
    const rows = Math.ceil(charCount / charsPerRow);

    const atlasWidth = this.nextPowerOf2(charsPerRow * charWidth);
    const atlasHeight = this.nextPowerOf2(rows * charHeight);

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

  private nextPowerOf2(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  private debugAtlas(imageData: ImageData, width: number, height: number): void {
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

      setTimeout(() => {
        document.body.removeChild(debugCanvas);
      }, 10000);
    }
  }

  dispose(): void {}
}

export async function createMonospaceFontAtlas(debug: boolean = false): Promise<FontAtlas> {
  const generator = new FontAtlasGenerator(debug);

  try {
    return await generator.generateAtlas('DejaVu Sans Mono', 16);
  } catch {
    console.warn('DejaVu Sans Mono not available, falling back to Courier New');

    try {
      return await generator.generateAtlas('Courier New', 16);
    } catch {
      console.warn('Courier New not available, falling back to monospace');

      return await generator.generateAtlas('monospace', 16);
    }
  } finally {
    generator.dispose();
  }
}

export async function createSquareCellAtlas(cellSize = 16, debug = false): Promise<FontAtlas> {
  const COLS = 16;
  const chars = CP437_CHARS;
  const rows = Math.ceil(chars.length / COLS);

  const nextPow2 = (n: number) => Math.pow(2, Math.ceil(Math.log2(Math.max(n, 1))));
  const atlasWidth = nextPow2(COLS * cellSize);
  const atlasHeight = nextPow2(rows * cellSize);

  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D context for square-cell atlas');

  ctx.clearRect(0, 0, atlasWidth, atlasHeight);

  const fontSize = Math.round(cellSize * 0.9);

  const fontStack = ['DejaVu Sans Mono', '"Courier New"', 'Courier', 'monospace'].join(', ');

  ctx.font = `${fontSize}px ${fontStack}`;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.imageSmoothingEnabled = false;

  const characters = new Map<string, import('./types.js').CharacterInfo>();

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cellX = col * cellSize;
    const cellY = row * cellSize;

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

  const sheetH = img.height / 2;
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

  for (let cp = 0; cp < 256; cp++) {
    const uchar = String.fromCodePoint(0xe000 + cp);
    const col = cp % 16;
    const row = Math.floor(cp / 16);
    characters.set(uchar, {
      char: uchar,
      x: col * tileW,
      y: sheetH + row * tileH,
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
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load tileset: ${url}`));
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D context for tileset atlas');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  const unicodeToCP437 = new Map<string, number>();
  for (let i = 0; i < CP437_TO_UNICODE.length; i++) {
    unicodeToCP437.set(CP437_TO_UNICODE[i], i);
  }

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

  const newCanvas = document.createElement('canvas');
  newCanvas.width = newW;
  newCanvas.height = newH;
  const ctx = newCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D context for atlas extension');

  const prevCanvas = document.createElement('canvas');
  prevCanvas.width = atlas.atlasWidth;
  prevCanvas.height = atlas.atlasHeight;
  const prevCtx = prevCanvas.getContext('2d');
  if (!prevCtx) throw new Error('Could not create 2D context for atlas copy');
  prevCtx.putImageData(atlas.texture, 0, 0);
  ctx.drawImage(prevCanvas, 0, 0);

  ctx.drawImage(img, 0, atlas.atlasHeight);

  const newImageData = ctx.getImageData(0, 0, newW, newH);

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

export async function loadBitlandsAtlas(tileW = 12, tileH = 18, debug = false): Promise<FontAtlas> {
  const sheets: Array<{ url: string; puaBase: number | null }> = [
    { url: '/tilesets/bitlands_tiles.bmp', puaBase: null },
    { url: '/tilesets/bitlands_plants.bmp', puaBase: 0xe000 },
    { url: '/tilesets/bitlands_map.bmp', puaBase: 0xe200 },
    { url: '/tilesets/bitlands_font.bmp', puaBase: 0xe300 },
    { url: '/tilesets/bitlands_buildings.bmp', puaBase: 0xe400 },
    { url: '/tilesets/bitlands_items.bmp', puaBase: 0xe500 },
    { url: '/tilesets/bitlands_workshops.bmp', puaBase: 0xe600 },
    { url: '/tilesets/bitlands_crops.bmp', puaBase: 0xe700 },
    { url: '/tilesets/creatures.bmp', puaBase: 0xe800 },
    { url: '/tilesets/races.bmp', puaBase: 0xe900 }
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

  const imgs: (HTMLImageElement | null)[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    if (debug) console.warn(`loadBitlandsAtlas: skipping missing sheet ${sheets[i].url}`);
    return null;
  });

  const firstLoaded = imgs.find((img) => img !== null) as HTMLImageElement;
  if (!firstLoaded) throw new Error('loadBitlandsAtlas: no tilesheets loaded');
  const sheetH = firstLoaded.height;
  const atlasW = firstLoaded.width;
  const atlasH = sheetH * sheets.length;

  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('loadBitlandsAtlas: could not get 2D context');

  const characters = new Map<string, import('./types.js').CharacterInfo>();

  for (let s = 0; s < sheets.length; s++) {
    const img = imgs[s];
    if (!img) continue;

    const yOffset = s * sheetH;
    ctx.drawImage(img, 0, yOffset);

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
      const uchar = puaBase === null ? CP437_TO_UNICODE[cp] : String.fromCodePoint(puaBase + cp);
      const info = {
        char: uchar,
        x: col * tileW,
        y: yOffset + row * tileH,
        width: tileW,
        height: tileH,
        xAdvance: tileW,
        xOffset: 0,
        yOffset: 0
      };
      characters.set(uchar, info);
      if (puaBase === null && cp === 32) {
        const alias = String.fromCodePoint(0xea00);
        characters.set(alias, { ...info, char: alias });
      }
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
