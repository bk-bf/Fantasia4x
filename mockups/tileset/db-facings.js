'use strict';
(() => {
  const X = DBX, MIRRORED = { s: false, e: false, n: true, w: true };
  const prev = X.fromData;
  X.fromData = objects => {
    for (const o of objects) {
      if (o.cat !== 'building' || o.group !== 'Production') continue;
      const es = X.of('building', o.id).slice();
      if (!es.length || es.some(e => e.kind === 'world' || e.variant === 'e')) continue;
      const faced = es.some(e => e.variant === 's');
      X.drop('building', o.id);
      for (const dir in MIRRORED) for (const e of es) X.reg('building', o.id, dir + (faced ? e.variant.slice(1) : e.variant === '0' ? '' : '-' + e.variant), MIRRORED[dir] ? () => X.built(e).flip() : () => X.built(e), { at: e.at, origin: e.origin });
    }
    prev(objects);
  };
})();
