'use strict';
(() => {
  const q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const screen = $('screen'), sheet = $('sheet'), pinBtn = $('pin'), clock = $('clock'), cost = $('cost'), follow = $('follow');
  const extra = { anim: q.get('anim') || 'walk-side', follow: q.get('follow') || '', pin: q.has('t'), cx: q.get('cx'), cy: q.get('cy') };
  let T = q.has('t') ? +q.get('t') / 1000 : 0, last = performance.now(), ms = 0, mounted = '', ui = null;

  const state = () => ({ ...ui.state, ...extra });
  function mount() {
    const s = state();
    document.body.classList.toggle('scene', s.view === 'scene');
    screen.hidden = s.view !== 'scene'; sheet.hidden = s.view !== 'sheet';
    follow.closest('.mrow').hidden = s.view !== 'scene';
    for (const k of ['time', 'season']) document.querySelector(`#mock .grp[data-k="${k}"]`).hidden = s.view !== 'scene';
    document.querySelector('#mock .grp[data-k="frames"]').hidden = s.view !== 'sheet';
    const key = s.view === 'scene' ? 'scene' + s.season : 'sheet' + s.zoom;
    if (key === mounted) return;
    mounted = key;
    if (s.view === 'sheet') SHEET.mount(sheet, s, id => { extra.anim = id; F4X.write({ anim: id, frames: 1 }); ui.set('frames', '1'); scrollTo({ top: 0 }); });
    else SCENE.mount(screen, s, list => { follow.innerHTML = '<option value="">nobody</option>' + list.map(([id, name]) => `<option value="${id}">${name}</option>`).join(''); follow.value = extra.follow; });
  }
  function tick(now) {
    const dt = clamp((now - last) / 1000, 0, .1), s = state();
    last = now;
    if (!extra.pin) T += dt * +s.speed;
    const t0 = performance.now(), n = s.view === 'sheet' ? SHEET.frame(s, T) : SCENE.frame(s, T, extra);
    ms = ms ? ms * .9 + (performance.now() - t0) * .1 : performance.now() - t0;
    clock.textContent = (T * 1000 | 0) + ' ms';
    cost.textContent = n ? `${n} drawn · ${ms.toFixed(1)} ms a frame here · ` : '';
    requestAnimationFrame(tick);
  }
  ui = F4X.bar(() => mount());
  pinBtn.addEventListener('click', () => { extra.pin = !extra.pin; pinBtn.classList.toggle('on', extra.pin); pinBtn.textContent = extra.pin ? 'Unpin' : 'Pin this instant'; F4X.write({ t: extra.pin ? Math.round(T * 1000) : null }); });
  pinBtn.classList.toggle('on', extra.pin); if (extra.pin) pinBtn.textContent = 'Unpin';
  follow.addEventListener('change', () => { extra.follow = follow.value; extra.cx = extra.cy = null; F4X.write({ follow: follow.value, cx: null, cy: null }); });
  addEventListener('keydown', ev => { if (ev.key === ' ' && !/^(INPUT|SELECT|BUTTON)$/.test(ev.target.tagName)) { ev.preventDefault(); ui.set('speed', ui.state.speed === '0' ? '1' : '0'); } });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.state.view === 'sheet') { mounted = ''; mount(); } }, 150); });
  window.MOTION = { extra, write: F4X.write };
  mount();
  requestAnimationFrame(tick);
})();
