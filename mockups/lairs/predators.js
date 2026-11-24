'use strict';
(() => {
  const sheet = document.getElementById('sheet'), TILE = P.grass[3];
  const QUAD = ['idle', 'walk', 'trot', 'run', 'stalk', 'pounce', 'bite', 'worry_rabbit', 'carry_rabbit', 'tote_fowl', 'feed', 'dig', 'sit', 'sleep', 'fall', 'down'];
  const STOAT = ['idle', 'walk', 'bound', 'stand', 'dance', 'bite', 'drag_rabbit', 'carry_rat', 'hold_fowl', 'feed', 'sleep', 'fall'];
  const BIRD = ['idle', 'roost', 'cry', 'rouse', 'lift', 'fly', 'glide', 'stoop', 'strike', 'mantle', 'snatch', 'carry', 'settleprey', 'eat', 'feed'];
  const LINES = {
    fox: { title: 'Fox', note: 'Fox earth · mouth carry', ids: SMALL.LINES.fox.map(l => l[0]), base: 'fox', anims: QUAD, actor: id => SMALL.small(id) },
    raptor: { title: 'Hawk', note: 'Raptor eyrie · talon carry', ids: Object.keys(LAIR.RAPTOR.LOOK), base: 'hawk', anims: BIRD, actor: id => LAIR.raptor(id, 0, 44, { prey: 'rabbit', kill: 'fowl' }), young: ['beg', 'idle', 'roost'] },
    stoat: { title: 'Stoat', note: 'Stoat holt · mouth carry and drag', ids: SMALL.LINES.stoat.map(l => l[0]), base: 'stoat', anims: STOAT, actor: id => SMALL.small(id) },
  };
  const meta = new Map(SMALL_PREDATORS.objects.filter(o => o.cat === 'creature').map(o => [o.id, o]));

  function paint(list, z) {
    const crops = list.map(s => { const b = bounds(s); return { s, b, w: b[2] - b[0] + 5, h: b[3] - b[1] + 5 }; }), H = Math.max(...crops.map(c => c.h)), W = crops.reduce((a, c) => a + c.w + 2, 0);
    const cv = document.createElement('canvas'); cv.width = W * z; cv.height = H * z;
    const g = cv.getContext('2d'), img = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { img.data.set([TILE[0], TILE[1], TILE[2], 255], i * 4); }
    let ox = 0;
    for (const c of crops) {
      for (let y = 0; y < c.h - 4; y++) for (let x = 0; x < c.w - 4; x++) { const v = c.s.c[(c.b[1] + y) * c.s.w + c.b[0] + x]; if (!v) continue; const i = ((H - c.h + 2 + y) * W + ox + 2 + x) * 4; img.data.set([v[0], v[1], v[2], 255], i); }
      ox += c.w + 2;
    }
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, W * z, H * z);
    return cv;
  }
  const framesOf = (A, anim) => { const def = animOf(A, anim), n = def.n || 6; return Array.from({ length: n }, (_, i) => frameOf(A, { anim, u: (i + .5) / n, t: 0, flip: false }, 3, false).s); };

  function render() {
    const s = F4X.ui.state, z = +s.zoom, L = LINES[s.line];
    sheet.innerHTML = '';
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${L.title}</h2><p>${L.note}</p><h3>Tiers</h3><div class="tiers"></div><h3>Motions</h3><table class="strips"></table>`;
    const tiers = sec.querySelector('.tiers'), strips = sec.querySelector('.strips');
    for (const id of L.ids) {
      const A = L.actor(id), m = meta.get(id), f = document.createElement('figure');
      f.appendChild(paint([frameOf(A, { anim: 'idle', u: .1, t: 0 }, 3, false).s], z));
      f.insertAdjacentHTML('beforeend', `<figcaption>${m.name}<em>tier ${m.raw.tier}</em></figcaption>`);
      tiers.appendChild(f);
    }
    const rows = [[L.base, L.anims], ...(L.young ? [[L.ids[0], L.young]] : [])];
    for (const [id, anims] of rows) for (const anim of anims) {
      const A = L.actor(id), tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
      th.textContent = (id !== L.base ? meta.get(id).name + ' · ' : '') + animOf(A, anim).label;
      td.appendChild(paint(framesOf(A, anim), z));
      tr.append(th, td); strips.appendChild(tr);
    }
    sheet.appendChild(sec);
  }

  fetch('../fantasia4x-tileset/catalog-data.json').then(r => r.json()).then(data => { DBX.fromData(data.objects); F4X.bar(render); render(); });
})();
