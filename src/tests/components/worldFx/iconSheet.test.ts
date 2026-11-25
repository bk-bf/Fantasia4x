import { describe, expect, it } from 'vitest';
import { conditionIconSheet } from '$lib/components/UI/canvas/worldFx/iconSheet';

describe('the tileset mockup conditions table', () => {
  it('lists every condition, combat word and severity arrow', () => {
    const kinds = new Set(conditionIconSheet().rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['combat word', 'condition', 'severity arrow']);
  });
});
