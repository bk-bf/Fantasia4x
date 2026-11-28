import { describe, it, expect } from 'vitest';
import { canonicalJson, canonicalRow, snapshotBody } from '../../../../tools/ledger/canonical.mjs';

function byWalk(value: unknown, out: (chunk: string) => void): boolean {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return false;
  if (value === null || typeof value !== 'object') {
    out(JSON.stringify(value) ?? 'null');
    return true;
  }
  const json = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof json === 'function') return byWalk(json.call(value), out);
  if (Array.isArray(value)) {
    out('[');
    value.forEach((v, i) => {
      if (i) out(',');
      if (!byWalk(v, out)) out('null');
    });
    out(']');
    return true;
  }
  const record = value as Record<string, unknown>;
  out('{');
  let first = true;
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
    out(`${first ? '' : ','}${JSON.stringify(key)}:`);
    first = false;
    byWalk(v, out);
  }
  out('}');
  return true;
}

const walked = (value: unknown) => {
  let text = '';
  return byWalk(value, (c) => (text += c)) ? text : undefined;
};

class Wrapped {
  own = 1;
  get derived() {
    return 2;
  }
}

function holed<T>(...items: T[]): T[] {
  const out = [...items];
  delete out[1];
  return out;
}
const holes = holed(1, 2, 3);

const odd: Record<string, unknown> = {
  nested: { b: 1, a: { d: [1, { z: 0, y: -0 }], c: 'x' } },
  numbered: { 10: 'ten', 9: 'nine', a: 'a' },
  holes,
  when: new Date('2026-11-28T03:00:00Z'),
  skipped: { u: undefined, f: () => 1, s: Symbol('s'), kept: null },
  inArrays: [undefined, () => 1, Symbol('s'), NaN, Infinity, -0],
  instance: new Wrapped(),
  map: new Map([['a', 1]]),
  typed: new Uint8Array([3, 1, 2]),
  text: 'Hjörvarðr "ᚠ" \\ \u0007 \ud800 🜂',
  proto: JSON.parse('{"__proto__": {"x": 1}, "b": 2}')
};

describe('canonical JSON', () => {
  it('writes every value byte for byte as the key-sorting walk does', () => {
    for (const [name, value] of Object.entries(odd))
      expect(canonicalJson(value), name).toBe(walked(value));
    expect(canonicalJson(odd)).toBe(walked(odd));
    for (const v of [undefined, () => 1, 1, 'x', null, [], {}])
      expect(canonicalJson(v)).toBe(walked(v));
  });

  it('leaves the named keys off each element of a row and nowhere else', () => {
    const row = [
      { b: 1, gCost: 3, a: { gCost: 4 } },
      { gCost: 1, c: [{ gCost: 2 }] }
    ];
    const stripped = row.map(({ gCost: _g, ...rest }) => rest);
    expect(canonicalRow(row, new Set(['gCost']))).toBe(walked(stripped));
    expect(canonicalRow(holed(row[0], row[0], row[1]), new Set(['gCost']))).toBe(
      walked(holed(stripped[0], stripped[0], stripped[1]))
    );
  });

  it('writes a snapshot as the walk writes its dynamic part and world', () => {
    const snapshot = { v: 1, dynamic: odd, world: [[{ b: 1, a: 2 }], [{ a: 3 }]] };
    let text = '{';
    snapshotBody(snapshot, (c) => (text += c));
    expect(text).toBe(walked({ dynamic: snapshot.dynamic, world: snapshot.world }));
    for (const world of [undefined, null, [[1], 'row'], { rows: 1 }]) {
      let other = '{';
      snapshotBody({ dynamic: { a: 1 }, world }, (c) => (other += c));
      expect(other).toBe(walked({ dynamic: { a: 1 }, world }));
    }
  });
});
