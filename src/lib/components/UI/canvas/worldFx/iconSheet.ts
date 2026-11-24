import conditions from '$lib/game/database/pawns/conditions.json';
import { ICON_IDS, arrows, floater, icon, type IconId, type Trend } from '$lib/pixelArt/fx/icons';
import type { Spr } from '$lib/pixelArt/fx/spr';
import { conditionIcon, iconFor, iconWords } from './conditionIcons';

export interface SheetSprite {
  w: number;
  h: number;
  px: (string | null)[];
}

export interface SheetRow {
  id: string;
  name: string;
  kind: 'condition' | 'combat word' | 'severity arrow';
  icon: string;
  grade: number;
  sprite: SheetSprite;
}

export interface IconSheet {
  icons: Record<string, SheetSprite>;
  rows: SheetRow[];
}

const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');

const sheetSprite = (s: Spr): SheetSprite => ({
  w: s.w,
  h: s.h,
  px: s.c.map((c) => (c ? `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}` : null))
});

const row = (
  id: string,
  name: string,
  kind: SheetRow['kind'],
  look: IconId,
  grade: Trend = 0
): SheetRow => ({
  id,
  name,
  kind,
  icon: look,
  grade,
  sprite: sheetSprite(floater(look, null, '', grade)[0])
});

const ARROWS: [Trend, string][] = [
  [1, 'Worse'],
  [2, 'Much worse'],
  [3, 'Worst'],
  [-1, 'Easing']
];

export function conditionIconSheet(): IconSheet {
  const shown = (conditions as { id: string; name: string; hidden?: boolean }[]).filter(
    (c) => !c.hidden
  );
  const rows: SheetRow[] = shown.map((c) => {
    const look = conditionIcon(c.id)!;
    return row(c.id, c.name, 'condition', look.id, look.grade);
  });
  for (const w of iconWords()) {
    const look = iconFor({
      id: 0,
      spawnTime: 0,
      until: 0,
      worldX: 0,
      worldY: 0,
      text: w,
      kind: 'dodge'
    })!;
    rows.push(row(w, w, 'combat word', look.id));
  }
  rows.push(row('crit', 'Critical hit', 'combat word', 'crit'));
  for (const [t, name] of ARROWS)
    rows.push({
      id: `arrow${t}`,
      name,
      kind: 'severity arrow',
      icon: '',
      grade: 0,
      sprite: sheetSprite(arrows(t)!)
    });
  return { icons: Object.fromEntries(ICON_IDS.map((id) => [id, sheetSprite(icon(id)[0])])), rows };
}

export const SHEET_PREFIX = "'use strict';\nconst CONDITION_ICONS = ";

export const sheetFile = (sheet: IconSheet): string => `${SHEET_PREFIX}${JSON.stringify(sheet)};\n`;
