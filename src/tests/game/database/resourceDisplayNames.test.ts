import { describe, it, expect } from 'vitest';
import resourcesData from '$lib/game/database/world/resources.json';

describe('resource display names', () => {
  it('every resource carries a displayName the HUD can render', () => {
    const missing = resourcesData
      .filter((r) => !('displayName' in r) || !String(r.displayName).trim())
      .map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('no displayName is a raw snake_case id', () => {
    const raw = resourcesData
      .filter((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(String(r.displayName)))
      .map((r) => r.id);
    expect(raw).toEqual([]);
  });
});
