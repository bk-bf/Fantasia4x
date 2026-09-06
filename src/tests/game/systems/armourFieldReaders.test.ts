import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allItemDefs } from '$lib/game/core/defs/items';

const SIM_ROOT = 'src/lib/game';
const MITIGATION_PATH = 'src/lib/game/systems/Combat.ts';
const NOT_BEHAVIOUR = new Set(['database', 'dev', 'types']);
const NO_SIM_READER = new Set([
  'armorLayer',
  'armorSet',
  'intimidation',
  'magicResistance',
  'visionProtection'
]);
const DAMAGE_TYPE_RESISTANCES = ['slashResistance', 'pierceResistance', 'crushResistance'];

function simSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (NOT_BEHAVIOUR.has(entry.name)) continue;
      out.push(...simSources(join(dir, entry.name)));
    } else if (entry.name.endsWith('.ts')) {
      out.push(readFileSync(join(dir, entry.name), 'utf-8'));
    }
  }
  return out;
}

function authoredArmourFields(): Set<string> {
  const fields = new Set<string>();
  for (const item of allItemDefs())
    for (const field of Object.keys(item.armorProperties ?? {})) fields.add(field);
  return fields;
}

describe('armorProperties fields reach the sim', () => {
  it('every field authored on an armour item is named by code that runs the sim', () => {
    const sim = simSources(SIM_ROOT).join('\n');
    const unread = [...authoredArmourFields()]
      .filter((f) => !NO_SIM_READER.has(f) && !sim.includes(f))
      .sort();

    expect(
      unread,
      `authored on armour and read by nothing that runs — wire it up, or strip it from items.jsonc, the tooltip and the type: ${unread.join(', ')}`
    ).toEqual([]);
  });

  it('each damage-type resistance is read by the mitigation path itself', () => {
    const authored = authoredArmourFields();
    const mitigation = readFileSync(MITIGATION_PATH, 'utf-8');
    const missing = DAMAGE_TYPE_RESISTANCES.filter(
      (f) => authored.has(f) && !mitigation.includes(f)
    );

    expect(
      missing,
      `authored on armour but absent from ${MITIGATION_PATH}, so it cannot change what a hit takes off: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('the exempted fields are still authored, so the list stays honest', () => {
    const authored = authoredArmourFields();
    const stale = [...NO_SIM_READER].filter((f) => !authored.has(f)).sort();
    expect(stale, `exempted but no longer authored anywhere — drop it from the list`).toEqual([]);
  });
});
