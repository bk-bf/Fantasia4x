'use strict';
(async () => {
  const stage = document.getElementById('stage');
  const pane = stage.querySelector('.pane');
  const canvas = pane.querySelector('canvas');
  const g = canvas.getContext('2d');
  const groups = Object.fromEntries([...document.querySelectorAll('.grp[data-k]')].map((el) => [el.dataset.k, el]));
  const S = await BT.load();
  const R = BT.renderer(S);
  const FX = BT.fx();
  const cfg = S.cfg;
  const drift = { x: 0, y: 0 };
  const FPS = 20;
  let ui = null,
    V = null,
    image = null,
    clock = 0,
    last = null,
    shown = -1,
    wind = BT.wind('breeze');

  const centre = () => {
    const { show, at, see } = ui.state;
    if (show === 'trees' && cfg.at[at]) return cfg.at[at];
    if (show === 'magic' && cfg.magicAt[see]) return cfg.magicAt[see];
    return [V.w / 2, V.h / 2];
  };

  function size() {
    const zoom = Number(ui.state.zoom);
    const w = Math.ceil(pane.clientWidth / zoom),
      h = Math.ceil(pane.clientHeight / zoom);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      image = g.createImageData(w, h);
    }
    canvas.style.width = `${w * zoom}px`;
    canvas.style.height = `${h * zoom}px`;
  }

  function origin() {
    const [cx, cy] = centre();
    const w = canvas.width,
      h = canvas.height;
    const fit = (c, room, len) => (len <= room ? -Math.floor((room - len) / 2) : Math.max(0, Math.min(len - room, Math.round(c - room / 2))));
    return [fit(cx + drift.x, w, V.w), fit(cy + drift.y, h, V.h)];
  }

  function paint() {
    if (!V) return;
    const [vx, vy] = origin();
    const t = Math.floor(clock * FPS) / FPS;
    R.frame(V, { wind, night: ui.state.light === 'night', young: ui.state.young, cut: ui.state.cut }, t, image.data, vx, vy, canvas.width, canvas.height, FX);
    g.putImageData(image, 0, 0);
  }

  async function apply() {
    const { show } = ui.state;
    groups.at.hidden = show !== 'trees';
    groups.young.hidden = show !== 'trees';
    groups.cut.hidden = show !== 'forest';
    groups.see.hidden = show !== 'magic';
    wind = BT.wind(ui.state.wind);
    if (!V || V.name !== show) {
      V = await S.view(show);
      FX.clear();
    }
    size();
    paint();
  }

  ui = F4X.bar((state, key) => {
    if (key === 'at' || key === 'see' || key === 'show') {
      drift.x = 0;
      drift.y = 0;
    }
    apply();
  });
  await apply();
  addEventListener('resize', () => {
    size();
    paint();
  });

  function tick(now) {
    requestAnimationFrame(tick);
    const secs = last === null ? 0 : Math.min(0.25, (now - last) / 1000);
    last = now;
    if (ui.state.play === 'off' || !V) return;
    clock += secs;
    const frame = Math.floor(clock * FPS);
    if (frame === shown) return;
    FX.step((frame - (shown < 0 ? frame : shown)) / FPS, wind);
    shown = frame;
    paint();
  }
  requestAnimationFrame(tick);

  let held = null;
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('#mock')) return;
    held = { x: ev.clientX, y: ev.clientY, dx: drift.x, dy: drift.y };
    stage.setPointerCapture(ev.pointerId);
    stage.classList.add('held');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!held || !V) return;
    const zoom = Number(ui.state.zoom);
    drift.x = Math.max(-V.w, Math.min(V.w, held.dx - (ev.clientX - held.x) / zoom));
    drift.y = Math.max(-V.h, Math.min(V.h, held.dy - (ev.clientY - held.y) / zoom));
    paint();
  });
  const release = () => {
    held = null;
    stage.classList.remove('held');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
})();
