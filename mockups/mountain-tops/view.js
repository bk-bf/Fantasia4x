'use strict';
(() => {
  const TILE = 32;
  const MAP = { w: 96 * TILE, h: 64 * TILE };
  const PLACES = { range: [21, 26], massif: [70, 9], arm: [39, 17], tail: [23, 52], dig: [79, 11], behind: [21, 5] };
  const SHOWN = ['all', 'today', 'a', 'b', 'c'];
  const stage = document.getElementById('stage');
  const panes = [...stage.querySelectorAll('.pane')];
  const q = new URLSearchParams(location.search);
  const centre = { x: 0, y: 0 };
  let ui = null;

  const source = (top, snow, mined) => `img/${top}${top === 'c' && mined === 'on' ? '-mined' : ''}${top !== 'today' && snow === 'on' ? '-snow' : ''}.webp`;

  function place(at) {
    const [tx, ty] = PLACES[at] ?? PLACES.range;
    centre.x = tx * TILE;
    centre.y = ty * TILE;
  }

  function draw() {
    const zoom = Number(ui.state.zoom);
    for (const pane of panes) {
      if (!pane.offsetWidth) continue;
      const w = pane.clientWidth, h = pane.clientHeight;
      const fit = (c, size, span) => (span * zoom <= size ? (size - span * zoom) / 2 : Math.min(0, Math.max(size - span * zoom, size / 2 - c * zoom)));
      const x = Math.round(fit(centre.x, w, MAP.w)), y = Math.round(fit(centre.y, h, MAP.h));
      pane.firstElementChild.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      pane.firstElementChild.style.imageRendering = zoom < 1 ? 'auto' : 'pixelated';
    }
  }

  function apply() {
    const { show, snow, mined } = ui.state;
    stage.classList.toggle('one', show !== 'all');
    for (const pane of panes) {
      pane.classList.toggle('shown', pane.dataset.top === show);
      const img = pane.firstElementChild, src = source(pane.dataset.top, snow, mined);
      if (img.getAttribute('src') !== src) img.src = src;
    }
    draw();
  }

  function remember() {
    F4X.write({ x: (centre.x / TILE).toFixed(1), y: (centre.y / TILE).toFixed(1) });
  }

  ui = F4X.bar((state, key) => {
    if (key === 'at' && state.at !== 'free') {
      place(state.at);
      F4X.write({ x: '', y: '' });
    }
    if (key === 'mined' && state.mined === 'on' && !['dig', 'behind'].includes(state.at)) {
      ui.set('at', 'dig');
      return;
    }
    apply();
  });
  place(ui.state.at);
  if (q.get('x') !== null && q.get('y') !== null) {
    centre.x = Number(q.get('x')) * TILE;
    centre.y = Number(q.get('y')) * TILE;
    if (ui.state.at !== 'free') ui.set('at', 'free');
  }
  apply();
  addEventListener('resize', draw);

  let held = null;
  stage.addEventListener('pointerdown', (ev) => {
    held = { x: ev.clientX, y: ev.clientY, cx: centre.x, cy: centre.y };
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('held');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!held) return;
    const zoom = Number(ui.state.zoom);
    centre.x = Math.max(0, Math.min(MAP.w, held.cx - (ev.clientX - held.x) / zoom));
    centre.y = Math.max(0, Math.min(MAP.h, held.cy - (ev.clientY - held.y) / zoom));
    draw();
  });
  const release = () => {
    if (!held) return;
    const moved = held.cx !== centre.x || held.cy !== centre.y;
    held = null;
    stage.classList.remove('held');
    if (!moved) return;
    if (ui.state.at !== 'free') ui.set('at', 'free');
    remember();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  addEventListener('keydown', (ev) => {
    const n = Number(ev.key);
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !(n >= 1 && n <= SHOWN.length)) return;
    ui.set('show', SHOWN[n - 1]);
  });
})();
