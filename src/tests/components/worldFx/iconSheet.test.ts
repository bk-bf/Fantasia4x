import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conditionIconSheet, sheetFile } from '$lib/components/UI/canvas/worldFx/iconSheet';

describe('the tileset mockup conditions table', () => {
  it('holds exactly the icons the game draws, so the two cannot drift', () => {
    const committed = readFileSync('mockups/tileset/conditions-data.js', 'utf8');
    expect(committed).toBe(sheetFile(conditionIconSheet()));
  });

  it('lists every condition, combat word and severity arrow', () => {
    const kinds = new Set(conditionIconSheet().rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['combat word', 'condition', 'severity arrow']);
  });
});
