'use strict';
(async () => {
  const cfg = await (await fetch('layout.json')).json();
  const stage = document.getElementById('stage');
  const pane = stage.querySelector('.pane');
  const img = pane.querySelector('img');
  const at = document.querySelector('.grp[data-k="at"]');
  const young = document.querySelector('.grp[data-k="young"]');
  const cut = document.querySelector('.grp[data-k="cut"]');
  const light = document.querySelector('.grp[data-k="light"]');
  const see = document.querySelector('.grp[data-k="see"]');
  const drift = { x: 0, y: 0 };
  let ui = null;

  const size = () => (ui.state.show === 'forest' ? cfg.forest : ui.state.show === 'magic' ? cfg.magic : cfg.sheet);
  const source = () => {
    const { show, young: y, cut: c } = ui.state;
    if (show === 'forest') return c === 'on' ? 'img/forest.webp' : 'img/forest-open.webp';
    if (show === 'magic') return ui.state.light === 'night' ? 'img/magic-night.webp' : 'img/magic.webp';
    return y === 'today' ? 'img/species-today.webp' : 'img/species.webp';
  };
  const centre = () => {
    const [w, h] = size();
    if (ui.state.show === 'trees' && cfg.at[ui.state.at]) return cfg.at[ui.state.at];
    if (ui.state.show === 'magic' && cfg.magicAt[ui.state.see]) return cfg.magicAt[ui.state.see];
    return [w / 2, h / 2];
  };

  function draw() {
    const zoom = Number(ui.state.zoom),
      [iw, ih] = size(),
      [cx, cy] = centre(),
      w = pane.clientWidth,
      h = pane.clientHeight;
    const fit = (c, room, len) => (len * zoom <= room ? (room - len * zoom) / 2 : Math.min(0, Math.max(room - len * zoom, room / 2 - c * zoom)));
    img.style.transform = `translate(${Math.round(fit(cx + drift.x, w, iw))}px, ${Math.round(fit(cy + drift.y, h, ih))}px) scale(${zoom})`;
  }

  function apply() {
    const { show } = ui.state;
    at.hidden = show !== 'trees';
    young.hidden = show !== 'trees';
    cut.hidden = show !== 'forest';
    light.hidden = show !== 'magic';
    see.hidden = show !== 'magic';
    const src = source();
    if (img.getAttribute('src') !== src) img.src = src;
    draw();
  }

  ui = F4X.bar((state, key) => {
    if (key === 'at' || key === 'see' || key === 'show') {
      drift.x = 0;
      drift.y = 0;
    }
    apply();
  });
  img.addEventListener('load', draw);
  apply();
  addEventListener('resize', draw);

  let held = null;
  stage.addEventListener('pointerdown', (ev) => {
    held = { x: ev.clientX, y: ev.clientY, dx: drift.x, dy: drift.y };
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('held');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!held) return;
    const zoom = Number(ui.state.zoom),
      [iw, ih] = size();
    drift.x = Math.max(-iw, Math.min(iw, held.dx - (ev.clientX - held.x) / zoom));
    drift.y = Math.max(-ih, Math.min(ih, held.dy - (ev.clientY - held.y) / zoom));
    draw();
  });
  const release = () => {
    held = null;
    stage.classList.remove('held');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
})();
