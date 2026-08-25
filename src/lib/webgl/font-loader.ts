import type { FontAtlas } from './types.js';
import { FontAtlasGenerator, createMonospaceFontAtlas } from './font-atlas.js';

export interface FontLoadOptions {
  fontFamily: string;
  fontSize: number;
  fallbackFonts?: readonly string[];
  debug?: boolean;
}

export class FontManager {
  private atlasCache = new Map<string, FontAtlas>();
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  async loadFontAtlas(options: FontLoadOptions): Promise<FontAtlas> {
    const cacheKey = `${options.fontFamily}-${options.fontSize}`;

    if (this.atlasCache.has(cacheKey)) {
      if (this.debug) {
        console.log(`📋 Using cached font atlas: ${cacheKey}`);
      }
      return this.atlasCache.get(cacheKey)!;
    }

    if (this.debug) {
      console.log(`🔄 Loading font atlas: ${cacheKey}`);
    }

    const generator = new FontAtlasGenerator(this.debug);
    let atlas: FontAtlas | null = null;

    try {
      if (await this.isFontAvailable(options.fontFamily)) {
        atlas = await generator.generateAtlas(options.fontFamily, options.fontSize);
      } else if (this.debug) {
        console.warn(`⚠️ Primary font not available: ${options.fontFamily}`);
      }

      if (!atlas && options.fallbackFonts) {
        for (const fallbackFont of options.fallbackFonts) {
          if (await this.isFontAvailable(fallbackFont)) {
            atlas = await generator.generateAtlas(fallbackFont, options.fontSize);
            if (this.debug) {
              console.log(`✅ Using fallback font: ${fallbackFont}`);
            }
            break;
          }
        }
      }

      if (!atlas) {
        atlas = await generator.generateAtlas('monospace', options.fontSize);
        if (this.debug) {
          console.log(`✅ Using generic monospace fallback`);
        }
      }

      this.atlasCache.set(cacheKey, atlas);

      if (this.debug) {
        console.log(`✅ Font atlas loaded and cached: ${cacheKey}`);
      }

      return atlas;
    } finally {
      generator.dispose();
    }
  }

  async isFontAvailable(fontFamily: string): Promise<boolean> {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) return false;

      canvas.width = 100;
      canvas.height = 50;

      ctx.font = '20px monospace';
      const referenceWidth = ctx.measureText('mmmmm').width;

      ctx.font = `20px ${fontFamily}, monospace`;
      const testWidth = ctx.measureText('mmmmm').width;

      const available = Math.abs(testWidth - referenceWidth) > 1;

      if (this.debug) {
        console.log(
          `📋 Font availability check: ${fontFamily} = ${available ? 'available' : 'not available'}`
        );
      }

      return available;
    } catch (error) {
      if (this.debug) {
        console.warn(`⚠️ Error checking font availability for ${fontFamily}:`, error);
      }
      return false;
    }
  }

  getCharacterInfo(atlas: FontAtlas, char: string) {
    return atlas.characters.get(char) || atlas.characters.get(' ');
  }

  async preloadRoguelikeFonts(): Promise<FontAtlas[]> {
    const commonFonts: FontLoadOptions[] = [
      {
        fontFamily: 'DejaVu Sans Mono',
        fontSize: 16,
        fallbackFonts: ['Courier New', 'monospace']
      },
      {
        fontFamily: 'Consolas',
        fontSize: 16,
        fallbackFonts: ['DejaVu Sans Mono', 'Courier New', 'monospace']
      },
      {
        fontFamily: 'Fira Code',
        fontSize: 16,
        fallbackFonts: ['DejaVu Sans Mono', 'Courier New', 'monospace']
      }
    ];

    const promises = commonFonts.map((options) => this.loadFontAtlas(options));
    return Promise.all(promises);
  }

  clearCache(): void {
    this.atlasCache.clear();
    if (this.debug) {
      console.log('📋 Font atlas cache cleared');
    }
  }

  getCacheStats() {
    return {
      size: this.atlasCache.size,
      entries: Array.from(this.atlasCache.keys())
    };
  }
}

export const FONT_PRESETS = {
  ROGUELIKE_CLASSIC: {
    fontFamily: 'DejaVu Sans Mono',
    fontSize: 16,
    fallbackFonts: ['Courier New', 'monospace']
  },
  ROGUELIKE_MODERN: {
    fontFamily: 'Fira Code',
    fontSize: 16,
    fallbackFonts: ['Consolas', 'DejaVu Sans Mono', 'monospace']
  },
  TERMINAL_STYLE: {
    fontFamily: 'Consolas',
    fontSize: 14,
    fallbackFonts: ['DejaVu Sans Mono', 'Courier New', 'monospace']
  }
} as const;

export async function loadPresetFont(
  preset: keyof typeof FONT_PRESETS,
  debug: boolean = false
): Promise<FontAtlas> {
  const manager = new FontManager(debug);
  return manager.loadFontAtlas(FONT_PRESETS[preset]);
}

export const globalFontManager = new FontManager();
