'use strict';
(async () => {
  let shots = null;
  const ui = F4X.bar(() => shots && render());
  const KEY = 'f4x-screenshot-picks';
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...picks])); } catch {} };
  const picks = load();
  const TIME_ORDER = ['dawn', 'morning', 'noon', 'golden', 'dusk', 'night', 'midnight'];
  const $ = (id) => document.getElementById(id);
  const meta = (s) => [
    s.world.startsWith('regen') ? `seed ${s.seed}` : s.world === 'fixture' ? `dev-save seed ${s.seed}` : `${s.world} seed ${s.seed}`,
    `${s.map[0]}×${s.map[1]}`,
    `${s.time} ${s.timeOfDay}`,
    s.season,
    s.weather !== 'clear' ? s.weather : null,
    `cam ${s.camera.viewX},${s.camera.viewY} @${s.camera.tileWidth}px`,
    s.window ? s.window : null
  ].filter(Boolean).join(' · ');

  function card(s) {
    const f = document.createElement('figure');
    f.dataset.file = s.file;
    const b = document.createElement('button');
    b.className = 'thumb';
    b.type = 'button';
    b.setAttribute('aria-label', s.file);
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = 'thumbs/' + s.file.replace(/\.png$/, '.webp');
    img.alt = '';
    b.append(img);
    b.addEventListener('click', () => open(s));
    const c = document.createElement('figcaption');
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = s.file;
    const m = document.createElement('span');
    m.className = 'meta';
    m.textContent = meta(s);
    const p = document.createElement('button');
    p.className = 'pick';
    p.type = 'button';
    p.textContent = '★';
    p.title = 'Pick';
    p.addEventListener('click', () => toggle(s.file));
    c.append(n, p, m);
    f.append(b, c);
    paint(f);
    return f;
  }

  function paint(f) {
    const on = picks.has(f.dataset.file);
    f.classList.toggle('on', on);
    f.querySelector('.pick').setAttribute('aria-pressed', on);
  }

  function toggle(file) {
    picks.has(file) ? picks.delete(file) : picks.add(file);
    save();
    document.querySelectorAll('figure').forEach((f) => f.dataset.file === file && paint(f));
    if (view.open && current?.file === file) $('vpick').setAttribute('aria-pressed', picks.has(file));
    counter();
    if (ui.state.show === 'picked') render();
  }

  function counter() { $('count').textContent = `${picks.size} picked · ${shots.length}`; }

  function render() {
    const by = ui.state.by, show = ui.state.show;
    const list = shots.filter((s) => show === 'all' || (show === 'hud' ? s.hud : show === 'world' ? !s.hud : picks.has(s.file)));
    const groups = new Map();
    for (const s of list) {
      const k = s[by];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    const keys = [...groups.keys()].sort((a, b) => by === 'time' ? TIME_ORDER.indexOf(a) - TIME_ORDER.indexOf(b) : String(a).localeCompare(String(b)));
    const root = $('groups');
    root.replaceChildren(...keys.map((k) => {
      const sec = document.createElement('section');
      const h = document.createElement('h2');
      h.textContent = k;
      const sm = document.createElement('small');
      sm.textContent = groups.get(k).length;
      h.append(sm);
      const g = document.createElement('div');
      g.className = 'grid';
      g.append(...groups.get(k).map(card));
      sec.append(h, g);
      return sec;
    }));
    counter();
  }

  const view = $('view');
  let current = null;
  function open(s) {
    current = s;
    view.classList.remove('one');
    $('full').src = 'img/' + s.file;
    $('vname').textContent = s.file;
    $('vmeta').textContent = meta(s);
    $('vopen').href = 'img/' + s.file;
    $('vpick').textContent = '★ Pick';
    $('vpick').setAttribute('aria-pressed', picks.has(s.file));
    view.showModal();
  }
  $('full').addEventListener('click', () => view.classList.toggle('one'));
  $('vclose').addEventListener('click', () => view.close());
  $('vpick').addEventListener('click', () => current && toggle(current.file));
  view.addEventListener('click', (e) => { if (e.target === view) view.close(); });
  addEventListener('keydown', (e) => {
    if (!view.open || !current) return;
    const vis = [...document.querySelectorAll('figure')].map((f) => f.dataset.file);
    const i = vis.indexOf(current.file);
    const go = (d) => { const f = vis[(i + d + vis.length) % vis.length]; open(shots.find((s) => s.file === f)); };
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === ' ') { e.preventDefault(); toggle(current.file); }
  });

  $('copy').addEventListener('click', async () => {
    const text = shots.filter((s) => picks.has(s.file)).map((s) => s.file).join('\n');
    try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied'; }
    catch { prompt('Picks', text); }
    setTimeout(() => ($('copy').textContent = 'Copy picks'), 1200);
  });
  $('clear').addEventListener('click', () => { if (!picks.size || !confirm(`Clear ${picks.size} picks?`)) return; picks.clear(); save(); render(); });
  shots = await (await fetch('shots.json')).json();
  render();
})();
