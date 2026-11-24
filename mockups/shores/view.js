'use strict';
(async () => {
  const cfg = await (await fetch('places.json')).json();
  const TILE = cfg.tile;
  const VIEWS = ['both', 'today', 'proposed'];
  const RULES = [2, 5, 10, 20, 50, 100];
  const stage = document.getElementById('stage');
  const panes = [...stage.querySelectorAll('.pane')];
  const q = new URLSearchParams(location.search);
  const drift = { x: Number(q.get('dx')) || 0, y: Number(q.get('dy')) || 0 };
  let ui = null;

  const place = () => cfg.places[ui.state.at];
  const region = () => cfg.regions[place().region];
  const source = (view) => `img/${place().region}-${view === 'today' ? 'today' : ui.state.with}.webp`;
  const scaleOf = () => Number(ui.state.zoom);

  function draw() {
    const [ax, ay] = place().at.map((t) => t * TILE);
    for (const pane of panes) {
      if (!pane.offsetWidth) continue;
      const img = pane.firstElementChild,
        scale = scaleOf();
      const w = pane.clientWidth,
        h = pane.clientHeight,
        iw = img.naturalWidth || region().w * TILE,
        ih = img.naturalHeight || region().h * TILE;
      const fit = (c, size, length) => (length * scale <= size ? (size - length * scale) / 2 : Math.min(0, Math.max(size - length * scale, size / 2 - c * scale)));
      img.style.transform = `translate(${Math.round(fit(ax + drift.x, w, iw))}px, ${Math.round(fit(ay + drift.y, h, ih))}px) scale(${scale})`;
      img.style.imageRendering = scale < 1 ? 'auto' : 'pixelated';
      const perMetre = (scale * TILE) / cfg.metres;
      const metres = RULES.find((m) => m * perMetre >= 70) ?? RULES[RULES.length - 1];
      pane.querySelector('.rule i').style.width = `${Math.round(metres * perMetre)}px`;
      pane.querySelector('.rule b').textContent = `${metres} m · ${Math.round(metres / cfg.metres)} tiles`;
    }
  }

  function apply() {
    stage.classList.toggle('one', ui.state.show !== 'both');
    for (const pane of panes) {
      pane.classList.toggle('shown', pane.dataset.view === ui.state.show);
      const img = pane.firstElementChild,
        src = source(pane.dataset.view);
      if (img.getAttribute('src') !== src) img.src = src;
    }
    draw();
  }

  const remember = () => F4X.write({ dx: Math.round(drift.x) || '', dy: Math.round(drift.y) || '' });

  ui = F4X.bar((state, key) => {
    if (key === 'at') {
      drift.x = 0;
      drift.y = 0;
      remember();
    }
    apply();
  });
  for (const pane of panes) pane.firstElementChild.addEventListener('load', draw);
  apply();
  addEventListener('resize', draw);

  let held = null;
  stage.addEventListener('pointerdown', (ev) => {
    held = { x: ev.clientX, y: ev.clientY, dx: drift.x, dy: drift.y, scale: scaleOf() };
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('held');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!held) return;
    const reach = region().w * TILE;
    drift.x = Math.max(-reach, Math.min(reach, held.dx - (ev.clientX - held.x) / held.scale));
    drift.y = Math.max(-reach, Math.min(reach, held.dy - (ev.clientY - held.y) / held.scale));
    draw();
  });
  const release = () => {
    if (!held) return;
    held = null;
    stage.classList.remove('held');
    remember();
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  addEventListener('keydown', (ev) => {
    const n = Number(ev.key);
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !(n >= 1 && n <= VIEWS.length)) return;
    ui.set('show', VIEWS[n - 1]);
  });
})();
