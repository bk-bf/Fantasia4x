'use strict';
(() => {
  const Q = new URLSearchParams(location.search), PIN = Q.has('t'), CANVAS = { day: 'mapday', dusk: 'mapdusk', night: 'mapnight' }, KEYS = Object.keys(CANVAS);
  const $ = id => document.getElementById(id), ctx = t => $(CANVAS[t]).getContext('2d');
  let T = +Q.get('t') || 0, last = 0, raf = 0, B = null, building = '';
  const M = HUD.motion = { on: false, sync };

  function draw(times) {
    const fx = HUD.windEffects();
    const items = MOTION_MAP.frame(B, { lvl: 3, smooth: false, T, clip: HUD.view.clip(), times: times.map(t => [t, ctx(t)]), wind: fx && fx.wind, post: fx && fx.post });
    const ring = $('marks').querySelector('.pawnring'), cut = items.find(it => it.S === B.C.cutter);
    if (ring && cut) { ring.style.left = rnd(cut.st.x) - 15 + 'px'; ring.style.top = rnd(cut.st.y) - 7 + 'px'; }
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? clamp((now - last) / 1000, 0, .1) : 0, hs = HUD.state;
    last = now;
    if (!PIN && !hs.paused) T += dt * hs.speed;
    if (document.hidden) return;
    const seen = HUD.ambient.seen(HUD.amb);
    draw(KEYS.filter(t => seen[t]));
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; M.on = false; }
  function start() {
    M.on = true;
    if (raf) return;
    draw(KEYS);
    last = 0; raf = requestAnimationFrame(tick);
  }
  function sync() {
    const map = HUD.map;
    if (!HUD.state.motion) {
      if (!M.on) return;
      stop();
      for (const t of KEYS) ctx(t).drawImage(map[t], 0, 0);
      return;
    }
    if (B && B.season === map.season) { start(); return; }
    stop();
    if (building === map.season) return;
    building = map.season;
    $('busy').hidden = false;
    setTimeout(() => {
      B = MOTION_MAP.build(building);
      building = '';
      $('busy').hidden = true;
      if (HUD.state.motion && HUD.map.season === B.season) start();
    }, 30);
  }
})();
