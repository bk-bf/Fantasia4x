'use strict';
(() => {
  const { el, st, $ } = UI;
  const watchers = {};

  const watcher = scope => {
    if (!watchers[scope]) watchers[scope] = new IntersectionObserver(seen, { root: $(scope), rootMargin: '500px' });
    return watchers[scope];
  };
  function seen(entries, io) {
    for (const it of entries) {
      if (!it.isIntersecting) continue;
      io.unobserve(it.target);
      it.target.draw();
    }
  }

  UI.lazy = (node, scope, draw) => { node.draw = draw; watcher(scope).observe(node); };
  UI.forget = scope => { if (watchers[scope]) watchers[scope].disconnect(); };

  UI.paint = (cv, img, zoom) => {
    cv.width = img.w; cv.height = img.h;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h), 0, 0);
    cv.style.width = img.w * zoom + 'px'; cv.style.height = img.h * zoom + 'px';
    cv.classList.toggle('soft', zoom < 1);
  };

  const smallest = o => DBX.of(o.cat, o.id).find(e => e.variant === 'map') || DBX.pick(o.cat, o.id, st.season);
  const scaleInto = (img, box) => { const m = Math.max(img.w, img.h); return m <= box ? Math.max(1, Math.floor(box / m)) : box / m; };

  function drawThumb(holder, o, box) {
    try {
      const img = DBX.bake(smallest(o)), cv = el('canvas');
      UI.paint(cv, img, scaleInto(img, box));
      holder.append(cv);
    } catch (err) { holder.classList.add('bad'); holder.title = String(err); console.error(o.key, err); }
  }

  UI.thumb = (o, box, scope) => {
    const holder = el('i', 'spr');
    holder.style.width = holder.style.height = box + 'px';
    if (!o || !DBX.of(o.cat, o.id).length) {
      holder.classList.add(o && o.state === 'skip' ? 'skip' : 'none');
      if (o && o.color) holder.style.setProperty('--sw', o.color);
      return holder;
    }
    if (scope) UI.lazy(holder, scope, () => drawThumb(holder, o, box));
    else drawThumb(holder, o, box);
    return holder;
  };
})();
