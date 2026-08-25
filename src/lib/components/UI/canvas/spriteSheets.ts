export type SheetName = 'tiles' | 'items' | 'buildings' | 'plants' | 'map' | 'workshops' | 'crops';
export type HudSpriteIconRef = { sheet: SheetName; id: number };

export const SHEET_CELL_W = 12;
export const SHEET_CELL_H = 18;

const SHEET_URLS: Record<SheetName, string> = {
  tiles: '/tilesets/bitlands_tiles.bmp',
  items: '/tilesets/bitlands_items.bmp',
  buildings: '/tilesets/bitlands_buildings.bmp',
  plants: '/tilesets/bitlands_plants.bmp',
  map: '/tilesets/bitlands_map.bmp',
  workshops: '/tilesets/bitlands_workshops.bmp',
  crops: '/tilesets/bitlands_crops.bmp'
};

const cache = Object.fromEntries(Object.keys(SHEET_URLS).map((k) => [k, null])) as Record<
  SheetName,
  HTMLCanvasElement | null
>;
const loading = Object.fromEntries(Object.keys(SHEET_URLS).map((k) => [k, false])) as Record<
  SheetName,
  boolean
>;
let onLoadedCb: (() => void) | null = null;

export function onSheetLoaded(cb: () => void): void {
  onLoadedCb = cb;
}

export function getSheet(name: SheetName): HTMLCanvasElement | null {
  return cache[name];
}

export function loadSheet(name: SheetName): void {
  if (cache[name] || loading[name]) return;
  loading[name] = true;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) {
      loading[name] = false;
      return;
    }
    cx.drawImage(img, 0, 0);
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) d[i + 3] = 0;
    }
    cx.putImageData(id, 0, 0);
    cache[name] = c;
    loading[name] = false;
    onLoadedCb?.();
  };
  img.src = SHEET_URLS[name];
}
