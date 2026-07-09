/**
 * Bitlands tileset sheet PUA base addresses.
 *
 * Every bitlands sheet is a 16×16 grid of 256 sprites (12×18 px each, row-major).
 * The tile index matches the source BMP exactly — row 0 col 0 is index 0,
 * row 4 col 0 is index 64, etc.
 *
 * Usage:
 *   glyph(SHEET.MAP, 64)   →  humanoid sprite at bitlands_map.bmp position 64
 *   glyph(SHEET.ITEMS, 12) →  item sprite at bitlands_items.bmp position 12
 *
 * bitlands_tiles.bmp is NOT in this table — terrain code accesses it via the
 * CP437 helpers in Terrains.ts (T(n), TR(…)) which the atlas registers directly.
 */
export const SHEET = {
  /** bitlands_plants.bmp    – plant / tree sprites        (U+E000–E0FF) */
  PLANTS: 0xe000,
  /** bitlands_map.bmp       – entity / humanoid sprites   (U+E200–E2FF) */
  MAP: 0xe200,
  /** bitlands_font.bmp      – UI / character font sprites (U+E300–E3FF) */
  FONT: 0xe300,
  /** bitlands_buildings.bmp – building sprites            (U+E400–E4FF) */
  BUILDINGS: 0xe400,
  /** bitlands_items.bmp     – item sprites                (U+E500–E5FF) */
  ITEMS: 0xe500,
  /** bitlands_workshops.bmp – workshop sprites            (U+E600–E6FF) */
  WORKSHOPS: 0xe600,
  /** bitlands_crops.bmp     – crop / farming sprites      (U+E700–E7FF) */
  CROPS: 0xe700,
  /** creatures.bmp           – creature / monster sprites  (U+E800–E8FF) */
  CREATURES: 0xe800,
  /** cultures.bmp               – playable culture sprites       (U+E900–E9FF) */
  CULTURES: 0xe900
} as const;

/**
 * Get the Unicode character for sprite `index` from the given sheet.
 * Pass one of the SHEET.* constants as `sheetBase`.
 */
export const glyph = (sheetBase: number, index: number): string =>
  String.fromCodePoint(sheetBase + index);
