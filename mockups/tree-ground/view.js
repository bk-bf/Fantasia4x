'use strict';
(async () => {
  const TILE = TG.TILE,
    CHUNK = TG.CHUNK;
  const BUDGET_MS = 14,
    KEPT = 260;
  const PLACE_VIEW = { grounds: 'grounds' };
  const stage = document.getElementById('stage');
  const panes = [...stage.querySelectorAll('.pane')].map((el) => ({ el, name: el.dataset.pane, canvas: el.querySelector('canvas'), g: el.querySelector('canvas').getContext('2d') }));
  const q = new URLSearchParams(location.search);
  const scene = await (await fetch('scene.json')).json();
  const centre = { x: 0, y: 0 };
  const worlds = {},
    atlases = {},
    chunks = new Map();
  let ui = null,
    pending = false;

  const image = (src) =>
    new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = fail;
      img.src = src;
    });

  async function pixels(src) {
    const img = await image(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  }

  async function world(name) {
    if (!worlds[name]) {
      worlds[name] = (async () => {
        const [summer, winter, keep] = await Promise.all([pixels(`img/${name}-summer.webp`), pixels(`img/${name}-winter.webp`), pixels(`img/${name}-keep.webp`)]);
        return TG.create(scene, name, { summer, winter, keep });
      })();
    }
    return worlds[name];
  }

  const atlas = (name) => (atlases[name] ??= image(`img/trees-${name}.webp`));
  const viewOf = (at) => PLACE_VIEW[at] ?? 'map';

  function place(at) {
    const name = viewOf(at);
    const [tx, ty] = scene.views[name].places[at] ?? Object.values(scene.views[name].places)[0];
    centre.x = tx * TILE;
    centre.y = ty * TILE;
  }

  function chunk(painter, name, cx, cy, season, tree, on) {
    const key = `${name}|${season}|${on ? tree : ''}|${on ? 1 : 0}|${cx},${cy}`;
    const hit = chunks.get(key);
    if (hit) {
      chunks.delete(key);
      chunks.set(key, hit);
      return hit;
    }
    return { key, make: () => {
      const data = painter.paint(cx, cy, season, tree === 'mixed' ? null : tree, on);
      const c = document.createElement('canvas');
      c.width = data.width;
      c.height = data.height;
      c.getContext('2d').putImageData(data, 0, 0);
      chunks.set(key, c);
      if (chunks.size > KEPT) chunks.delete(chunks.keys().next().value);
      return c;
    } };
  }

  async function draw() {
    const { season, tree, surround, crowns, folk, at } = ui.state;
    const zoom = Number(ui.state.zoom);
    const name = ui.view;
    const painter = await world(name);
    const [sheet, bare] = await Promise.all([atlas(season), atlas('bare')]);
    if (name !== ui.view) return;
    const view = scene.views[name];
    const pl = painter.plan(season, tree === 'mixed' ? null : tree);
    const started = performance.now();
    let waiting = false;
    for (const pane of panes) {
      if (!pane.el.offsetWidth) continue;
      const w = Math.ceil(pane.el.clientWidth / zoom),
        h = Math.ceil(pane.el.clientHeight / zoom);
      if (pane.canvas.width !== w || pane.canvas.height !== h) {
        pane.canvas.width = w;
        pane.canvas.height = h;
      }
      pane.canvas.style.transform = `scale(${zoom})`;
      pane.canvas.style.imageRendering = zoom < 1 ? 'auto' : 'pixelated';
      const fit = (c, room, len) => (len <= room ? -Math.floor((room - len) / 2) : Math.max(0, Math.min(len - room, Math.round(c - room / 2))));
      const vx = fit(centre.x, w, painter.W),
        vy = fit(centre.y, h, painter.H);
      const g = pane.g;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, w, h);
      const on = pane.name === 'new' && surround === 'on';
      for (let cy = Math.max(0, Math.floor(vy / CHUNK)); cy * CHUNK < Math.min(painter.H, vy + h); cy++)
        for (let cx = Math.max(0, Math.floor(vx / CHUNK)); cx * CHUNK < Math.min(painter.W, vx + w); cx++) {
          let c = chunk(painter, name, cx, cy, season, tree, on);
          if (c.make) {
            if (performance.now() - started > BUDGET_MS) {
              waiting = true;
              continue;
            }
            c = c.make();
          }
          g.drawImage(c, cx * CHUNK - vx, cy * CHUNK - vy);
        }
      const items = pl.trees.map((t) => ({ y: t.fy - painter.M, x: t.fx - painter.M, s: t.sprite, img: crowns === 'on' ? sheet : bare }));
      if (folk === 'on') for (const [kind, tx, ty, flip] of view.folk) items.push({ y: ty * TILE, x: tx * TILE, s: scene.sprites[`folk-${kind}${flip ? '-flip' : ''}`], img: sheet });
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        const dx = Math.round(it.x) - it.s.ax - vx,
          dy = Math.round(it.y) - it.s.ay - vy;
        if (dx > w || dy > h || dx + it.s.w < 0 || dy + it.s.h < 0) continue;
        g.drawImage(it.img, it.s.x, it.s.y, it.s.w, it.s.h, dx, dy, it.s.w, it.s.h);
      }
    }
    document.body.dataset.ready = waiting ? '0' : '1';
    if (waiting) schedule();
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw();
    });
  }

  function apply() {
    const { show } = ui.state;
    stage.classList.toggle('one', show !== 'both');
    for (const pane of panes) pane.el.classList.toggle('shown', pane.name === show);
    schedule();
  }

  ui = F4X.bar((state, key) => {
    if (key === 'at' && state.at !== 'free') {
      ui.view = viewOf(state.at);
      place(state.at);
      F4X.write({ x: '', y: '', v: '' });
    }
    apply();
  });
  ui.view = viewOf(ui.state.at);
  place(ui.state.at);
  if (q.get('x') !== null && q.get('y') !== null) {
    ui.view = q.get('v') === 'grounds' ? 'grounds' : 'map';
    centre.x = Number(q.get('x')) * TILE;
    centre.y = Number(q.get('y')) * TILE;
    if (ui.state.at !== 'free') ui.set('at', 'free');
  }
  apply();
  addEventListener('resize', schedule);

  let held = null;
  stage.addEventListener('pointerdown', (ev) => {
    held = { x: ev.clientX, y: ev.clientY, cx: centre.x, cy: centre.y };
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('held');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!held) return;
    const zoom = Number(ui.state.zoom);
    const v = scene.views[ui.view];
    centre.x = Math.max(0, Math.min(v.w * TILE, held.cx - (ev.clientX - held.x) / zoom));
    centre.y = Math.max(0, Math.min(v.h * TILE, held.cy - (ev.clientY - held.y) / zoom));
    schedule();
  });
  const release = () => {
    if (!held) return;
    const moved = held.cx !== centre.x || held.cy !== centre.y;
    held = null;
    stage.classList.remove('held');
    if (!moved) return;
    if (ui.state.at !== 'free') ui.set('at', 'free');
    F4X.write({ x: (centre.x / TILE).toFixed(1), y: (centre.y / TILE).toFixed(1), v: ui.view === 'map' ? '' : ui.view });
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.toLowerCase() !== 's') return;
    ui.set('surround', ui.state.surround === 'on' ? 'off' : 'on');
  });
})();
