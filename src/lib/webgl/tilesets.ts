export const SHEET = {
  PLANTS: 0xe000,
  MAP: 0xe200,
  FONT: 0xe300,
  BUILDINGS: 0xe400,
  ITEMS: 0xe500,
  WORKSHOPS: 0xe600,
  CROPS: 0xe700,
  CREATURES: 0xe800,
  CULTURES: 0xe900
} as const;

export const glyph = (sheetBase: number, index: number): string =>
  String.fromCodePoint(sheetBase + index);
