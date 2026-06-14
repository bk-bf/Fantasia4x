// HUD sprite-icon Svelte action (P-4). Paints a single tileset sprite (magenta-keyed, accent-tinted)
// into a small <canvas> for HUD buttons. Reads sheets from the shared spriteSheets cache; registered
// nodes are repainted by redrawHudSpriteIcons() when a sheet finishes loading.
import {
  type HudSpriteIconRef,
  SHEET_CELL_W,
  SHEET_CELL_H,
  getSheet,
  loadSheet
} from './spriteSheets';

/** Accent tint painted over HUD icons (source-atop preserves sprite alpha). */
const HUD_ICON_TINT = { r: 232, g: 136, b: 40, a: 0.98 };

/** Mounted icon nodes, repainted on sheet load. */
const nodes = new Set<{ node: HTMLCanvasElement; icon: HudSpriteIconRef }>();

function paint(node: HTMLCanvasElement, icon: HudSpriteIconRef): void {
  node.width = SHEET_CELL_W;
  node.height = SHEET_CELL_H;
  const ctx = node.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, SHEET_CELL_W, SHEET_CELL_H);

  const sheet = getSheet(icon.sheet);
  if (!sheet) {
    loadSheet(icon.sheet);
    return;
  }

  const col = icon.id % 16;
  const row = Math.floor(icon.id / 16);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    col * SHEET_CELL_W,
    row * SHEET_CELL_H,
    SHEET_CELL_W,
    SHEET_CELL_H,
    0,
    0,
    SHEET_CELL_W,
    SHEET_CELL_H
  );

  // Tint HUD icons to the panel accent color while preserving sprite alpha.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(${HUD_ICON_TINT.r}, ${HUD_ICON_TINT.g}, ${HUD_ICON_TINT.b}, ${HUD_ICON_TINT.a})`;
  ctx.fillRect(0, 0, SHEET_CELL_W, SHEET_CELL_H);
  ctx.globalCompositeOperation = 'source-over';
}

/** Repaint every mounted HUD icon — called when a sprite sheet finishes loading. */
export function redrawHudSpriteIcons(): void {
  for (const entry of nodes) paint(entry.node, entry.icon);
}

/** Svelte action: `use:hudSpriteIconAction={iconRef}` paints (and live-updates) a HUD sprite icon. */
export function hudSpriteIconAction(node: HTMLCanvasElement, icon: HudSpriteIconRef) {
  const entry = { node, icon };
  nodes.add(entry);
  paint(node, icon);

  return {
    update(nextIcon: HudSpriteIconRef) {
      entry.icon = nextIcon;
      paint(node, nextIcon);
    },
    destroy() {
      nodes.delete(entry);
    }
  };
}
