export const LARGE_MAP_DIM = 750;
export const LARGE_MAP_FAR_ZOOM_SHARE = 0.9;

export function farZoomShare(mapW: number, mapH: number): number {
  return Math.max(mapW, mapH) >= LARGE_MAP_DIM ? LARGE_MAP_FAR_ZOOM_SHARE : 1;
}

export function farZoomTileSize(
  canvasW: number,
  canvasH: number,
  mapW: number,
  mapH: number
): number {
  return Math.max(canvasW / mapW, canvasH / mapH) / farZoomShare(mapW, mapH);
}
