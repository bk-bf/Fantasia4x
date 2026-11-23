'use strict';
(() => {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const sheet = $('sheet'), pinBtn = $('pin'), clock = $('clock'), cost = $('cost');
  const extra = { anim: q.get('anim') || 'walk-side', pin: q.has('t') };
  let T = q.has('t') ? +q.get('t') / 1000 : 0, last = performance.now(), ms = 0, shown = -500, mounted = '', ui = null;

  const state = () => ({ ...ui.state, ...extra });
  function mount() {
    const s = state(), key = 'sheet' + s.zoom;
    if (key === mounted) return;
    mounted = key;
    SHEET.mount(sheet, s, id => { extra.anim = id; F4X.write({ anim: id, frames: 1 }); ui.set('frames', '1'); sheet.scrollTo({ top: 0 }); });
  }
  function tick(now) {
    const dt = clamp((now - last) / 1000, 0, .1), s = state();
    last = now;
    if (!extra.pin) T += dt * +s.speed;
    const t0 = performance.now(), n = SHEET.frame(s, T);
    ms = ms ? ms * .9 + (performance.now() - t0) * .1 : performance.now() - t0;
    clock.textContent = (T * 1000 | 0) + ' ms';
    if (now - shown >= 500) { shown = now; cost.textContent = n ? `${n} drawn · ${ms.toFixed(1)} ms a frame` : ''; }
    requestAnimationFrame(tick);
  }
  ui = F4X.bar(() => mount());
  pinBtn.addEventListener('click', () => { extra.pin = !extra.pin; pinBtn.classList.toggle('on', extra.pin); pinBtn.textContent = extra.pin ? 'Unpin' : 'Pin this instant'; F4X.write({ t: extra.pin ? Math.round(T * 1000) : null }); });
  pinBtn.classList.toggle('on', extra.pin); if (extra.pin) pinBtn.textContent = 'Unpin';
  addEventListener('keydown', ev => { if (ev.key === ' ' && !/^(INPUT|SELECT|BUTTON)$/.test(ev.target.tagName)) { ev.preventDefault(); ui.set('speed', ui.state.speed === '0' ? '1' : '0'); } });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { mounted = ''; mount(); }, 150); });
  mount();
  requestAnimationFrame(tick);
})();
