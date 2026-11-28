'use strict';
(() => {
  const X = DBX, ANCHOR = [16, 27];
  function sprite(icon) {
    const s = new Spr(icon.w, icon.h, ANCHOR[0], ANCHOR[1]);
    for (let y = 0; y < icon.h; y++) for (let x = 0; x < icon.w; x++) {
      const i = (y * icon.w + x) * 4;
      if (icon.rgba[i + 3]) s.set(x, y, [icon.rgba[i], icon.rgba[i + 1], icon.rgba[i + 2]]);
    }
    return s;
  }
  const carried = e => { const { id, cat, dbId, variant, make, baked, out, ...rest } = e; return rest; };
  const oldName = variant => variant === '0' ? 'old' : 'old-' + variant;
  function adopt(icon) {
    const before = X.of('item', icon.id).slice();
    if (before.some(e => e.pixel)) return;
    X.drop('item', icon.id);
    X.reg('item', icon.id, '0', () => sprite(PX.icon(icon.draw())), { pixel: true });
    for (const e of before) X.reg('item', icon.id, oldName(e.variant), e.make, carried(e));
  }
  const prev = X.fromData;
  X.fromData = objects => {
    prev.call(X, objects);
    const known = new Set(objects.filter(o => o.cat === 'item').map(o => o.id));
    for (const icon of PIXEL_ICONS) { if (known.has(icon.id)) adopt(icon); else console.error('pixel icon for an item the database does not have: ' + icon.id); }
  };
})();
