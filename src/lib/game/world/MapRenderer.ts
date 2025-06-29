// src/lib/game/world/MapRenderer.ts
import type { WorldTile } from '../core/types';

export function renderASCIIMap(worldMap: WorldTile[][], viewX: number, viewY: number, viewWidth: number, viewHeight: number): string {
  let mapString = '';
  
  for (let y = viewY; y < viewY + viewHeight && y < worldMap.length; y++) {
    for (let x = viewX; x < viewX + viewWidth && x < worldMap[0].length; x++) {
      const tile = worldMap[y][x];
      if (tile.discovered) {
        mapString += tile.ascii;
      } else {
        mapString += ' ';
      }
    }
    mapString += '\n';
  }
  
  return mapString;
}
