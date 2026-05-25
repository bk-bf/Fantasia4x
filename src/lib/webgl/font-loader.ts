/* filepath: src/lib/webgl/font-loader.ts */
/**
 * Font Loading Utilities
 * Handles font loading, validation, and fallback management
 */

import type { FontAtlas } from './types.js';
import { FontAtlasGenerator, createMonospaceFontAtlas } from './font-atlas.js';

export interface FontLoadOptions {
	fontFamily: string;
	fontSize: number;
	fallbackFonts?: readonly string[];
	debug?: boolean;
}

/**
 * Font Manager - handles loading and caching of font atlases
 */
export class FontManager {
	private atlasCache = new Map<string, FontAtlas>();
	private debug: boolean;

	constructor(debug: boolean = false) {
		this.debug = debug;
	}

	/**
	 * Load a font atlas with fallback support
	 */
	async loadFontAtlas(options: FontLoadOptions): Promise<FontAtlas> {
		const cacheKey = `${options.fontFamily}-${options.fontSize}`;

		// Check cache first
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
			// Try primary font
			if (await this.isFontAvailable(options.fontFamily)) {
				atlas = await generator.generateAtlas(options.fontFamily, options.fontSize);
			} else if (this.debug) {
				console.warn(`⚠️ Primary font not available: ${options.fontFamily}`);
			}

			// Try fallback fonts
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

			// Ultimate fallback to generic monospace
			if (!atlas) {
				atlas = await generator.generateAtlas('monospace', options.fontSize);
				if (this.debug) {
					console.log(`✅ Using generic monospace fallback`);
				}
			}

			// Cache the result
			this.atlasCache.set(cacheKey, atlas);

			if (this.debug) {
				console.log(`✅ Font atlas loaded and cached: ${cacheKey}`);
			}

			return atlas;

		} finally {
			generator.dispose();
		}
	}

	/**
	 * Check if a font is available in the browser
	 */
	async isFontAvailable(fontFamily: string): Promise<boolean> {
		try {
			// Create a test canvas
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');

			if (!ctx) return false;

			// Set canvas size
			canvas.width = 100;
			canvas.height = 50;

			// Test with a reference font (monospace is always available)
			ctx.font = '20px monospace';
			const referenceWidth = ctx.measureText('mmmmm').width;

			// Test with the target font
			ctx.font = `20px ${fontFamily}, monospace`;
			const testWidth = ctx.measureText('mmmmm').width;

			// If widths are different, the font is available
			const available = Math.abs(testWidth - referenceWidth) > 1;

			if (this.debug) {
				console.log(`📋 Font availability check: ${fontFamily} = ${available ? 'available' : 'not available'}`);
			}

			return available;

		} catch (error) {
			if (this.debug) {
				console.warn(`⚠️ Error checking font availability for ${fontFamily}:`, error);
			}
			return false;
		}
	}

	/**
	 * Get character info from a loaded atlas
	 */
	getCharacterInfo(atlas: FontAtlas, char: string) {
		return atlas.characters.get(char) || atlas.characters.get(' '); // Fallback to space
	}

	/**
	 * Preload common roguelike fonts
	 */
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

		const promises = commonFonts.map(options => this.loadFontAtlas(options));
		return Promise.all(promises);
	}

	/**
	 * Clear the atlas cache
	 */
	clearCache(): void {
		this.atlasCache.clear();
		if (this.debug) {
			console.log('📋 Font atlas cache cleared');
		}
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return {
			size: this.atlasCache.size,
			entries: Array.from(this.atlasCache.keys())
		};
	}
}

// Default font configurations for different use cases
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

/**
 * Quick function to load a preset font atlas
 */
export async function loadPresetFont(preset: keyof typeof FONT_PRESETS, debug: boolean = false): Promise<FontAtlas> {
	const manager = new FontManager(debug);
	return manager.loadFontAtlas(FONT_PRESETS[preset]);
}

/**
 * Global font manager instance
 */
export const globalFontManager = new FontManager();
