'use strict';
(() => {
  const $ = id => document.getElementById(id), form = $('fields'), rarity = FOLK_CAST.traitRarity;
  const traitName = t => FOLK_CAST.traitNames[t] || t;
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const typical = cm => TYPICAL_WEIGHT.scale * Math.pow(cm, TYPICAL_WEIGHT.power);
  const TRAIT_ODDS = { negative: 2, common: 6, uncommon: 3, rare: 1.5, epic: .6, mythic: .25, legendary: .25 };
  const markTraits = MARKS.flatMap(m => m.traits.filter(t => rarity[t]).map(t => ({ t, mark: m.id })));
  const hairColours = [...Object.keys(HAIRS), 'grey'];
  const stylesFor = sex => STYLES.filter(s => s.sexes[sex]).map(s => s.id);
  const beardsFor = sex => sex === 'male' ? Object.keys(BEARDS) : ['none'];
  const FIELDS = [
    ['sex', 'Sex', () => ['male', 'female'], v => v === 'female' ? 'Woman' : 'Man'],
    ['age', 'Age', null, null, [16, 80]],
    ['height', 'Height', null, null, [80, 300]],
    ['build', 'Build', null, null, [60, 170]],
    ['skin', 'Skin', () => Object.keys(SKINS), k => cap(SKINS[k].word)],
    ['hair', 'Hair colour', () => hairColours, cap],
    ['style', 'Hair style', st => stylesFor(st.sex), cap],
    ['beard', 'Beard', st => beardsFor(st.sex), cap],
    ['eyes', 'Eyes', () => Object.keys(EYES), k => cap(EYES[k].word)],
    ['oddEye', 'Second eye', () => ['none', ...Object.keys(EYES)], k => k === 'none' ? 'None' : cap(EYES[k].word)],
  ];
  const locked = new Set();
  let st = null, seed = Date.now() % 100000, beat = 0, views = [];

  function rollTraits(r) {
    const out = [], n = r() < .35 ? 0 : r() < .6 ? 1 : r() < .85 ? 2 : 3, used = new Set();
    for (let i = 0; i < n; i++) {
      const pool = markTraits.filter(x => !used.has(x.mark)), total = pool.reduce((a, x) => a + TRAIT_ODDS[rarity[x.t]], 0);
      let u = r() * total;
      const pick = pool.find(x => (u -= TRAIT_ODDS[rarity[x.t]]) <= 0) || pool[pool.length - 1];
      used.add(pick.mark); out.push(pick.t);
    }
    return out;
  }

  function rolled(s) {
    const r = rng(s), id = 'roll-' + s, pref = culturePreference({ id });
    const sex = r() < .5 ? 'male' : 'female', age = 16 + Math.floor(r() * r() * 64);
    const height = Math.round(clamp(175 * Math.exp((r() + r() + r() - 1.5) * .45), 80, 300)), build = Math.round(clamp(100 * Math.exp((r() + r() - 1) * .45), 60, 170));
    const traits = rollTraits(r), blind = r() < .02;
    const look = pawnLookOf({ id, sex, age, height, weight: typical(height) * build / 100, traits, blind }, pref, rarity);
    return { id, pref, sex, age, height, build, traits, blind, skin: look.skin, hair: look.hair, style: look.style, beard: look.beard, eyes: look.eyes, oddEye: look.oddEye || 'none' };
  }

  function lookOf(s) {
    const pawn = { id: s.id, sex: s.sex, age: s.age, height: s.height, weight: typical(s.height) * s.build / 100, traits: s.traits, blind: s.blind };
    const base = pawnLookOf(pawn, s.pref, rarity), forced = STYLES.find(x => x.trait && s.traits.includes(x.trait)), downy = Object.keys(TRAIT_BEARDS).find(k => s.traits.includes(TRAIT_BEARDS[k]));
    return { ...base, skin: s.skin, hair: s.hair, eyes: s.eyes, oddEye: s.oddEye === 'none' || s.oddEye === s.eyes ? null : s.oddEye, style: forced ? forced.id : s.style, beard: downy || s.beard };
  }

  function fit(s) {
    if (!stylesFor(s.sex).includes(s.style)) s.style = stylesFor(s.sex)[0];
    if (!beardsFor(s.sex).includes(s.beard)) s.beard = 'none';
    return s;
  }

  function roll() {
    seed = (seed * 7919 + 104729) % 1000003;
    const fresh = rolled(seed);
    if (!st) st = fresh;
    else for (const k of Object.keys(fresh)) if (!locked.has(k)) st[k] = fresh[k];
    if (!locked.has('traits')) st.pref = fresh.pref;
    fit(st);
    draw();
  }

  function fieldRow(k, label, opts, word, range) {
    let out = null;
    const lab = document.createElement('label'), lock = document.createElement('input');
    lab.textContent = label; lab.htmlFor = 'f-' + k;
    lock.type = 'checkbox'; lock.className = 'lock'; lock.title = 'Keep on roll'; lock.checked = locked.has(k);
    lock.onchange = () => { lock.checked ? locked.add(k) : locked.delete(k); };
    let input;
    if (range) {
      input = document.createElement('input'); input.type = 'range'; input.min = range[0]; input.max = range[1]; input.value = st[k];
      input.oninput = () => { st[k] = +input.value; out.value = readout(k); drawViews(); };
    } else {
      input = document.createElement('select');
      for (const v of opts(st)) input.append(new Option(word(v), v, false, v === st[k]));
      input.onchange = () => { st[k] = input.value; fit(st); draw(); };
    }
    input.id = 'f-' + k;
    const cell = document.createElement('div');
    out = document.createElement('output');
    cell.append(input);
    if (range) { out.value = readout(k); cell.append(out); }
    form.append(lab, cell, lock);
  }

  function readout(k) {
    if (k === 'age') return st.age + ' years';
    if (k === 'height') return st.height + ' cm';
    return Math.round(typical(st.height) * st.build / 100) + ' kg, ' + buildWord(st.build / 100);
  }

  function traitBox() {
    const box = document.createElement('fieldset'), leg = document.createElement('legend'), lock = document.createElement('input');
    lock.type = 'checkbox'; lock.title = 'Keep on roll'; lock.checked = locked.has('traits');
    lock.onchange = () => { lock.checked ? locked.add('traits') : locked.delete('traits'); };
    leg.append('Traits ', lock);
    box.append(leg);
    for (const { t } of [...markTraits, { t: 'blind' }]) {
      const lab = document.createElement('label'), c = document.createElement('input'), on = t === 'blind' ? st.blind : st.traits.includes(t);
      c.type = 'checkbox'; c.checked = on;
      c.onchange = () => { if (t === 'blind') st.blind = c.checked; else st.traits = c.checked ? [...st.traits, t] : st.traits.filter(x => x !== t); drawViews(); };
      const small = document.createElement('small');
      small.textContent = ' ' + (t === 'blind' ? 'from a wound' : rarity[t]);
      lab.append(c, ' ' + (t === 'blind' ? 'Both eyes lost' : traitName(t)), small);
      box.append(lab);
    }
    form.append(box);
  }

  function sprImage(s, crop) {
    const im = new ImageData(crop.w, crop.h);
    for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
      const c = s.ok(crop.x + x, crop.y + y) ? s.c[(crop.y + y) * s.w + crop.x + x] : null;
      if (!c) continue;
      const d = (y * crop.w + x) * 4;
      im.data[d] = c[0]; im.data[d + 1] = c[1]; im.data[d + 2] = c[2]; im.data[d + 3] = 255;
    }
    return im;
  }

  const CROP = { x: RG.CX - 34, y: RG.BASE - 66, w: 68, h: 70 };
  function figure(look, face, zoom, caption) {
    const fig = document.createElement('figure'), cv = document.createElement('canvas');
    cv.width = CROP.w; cv.height = CROP.h; cv.style.width = CROP.w * zoom + 'px'; cv.style.height = CROP.h * zoom + 'px';
    cv.getContext('2d').putImageData(sprImage(FOLK_PARTS.look(look, face), CROP), 0, 0);
    fig.append(cv);
    if (caption) { const fc = document.createElement('figcaption'); fc.textContent = caption; fig.append(fc); }
    return { fig, ctx: cv.getContext('2d'), look, face, frames: [] };
  }

  function drawViews() {
    const look = lookOf(st), zoom = +F4X.ui.state.zoom;
    views = [['f', 'Front'], ['s', 'Side'], ['b', 'Back']].map(([face, name]) => figure(look, face, zoom, name));
    $('views').replaceChildren(...views.map(v => v.fig));
    $('lean').textContent = 'Rolled culture lean: ' + colouringPhrase(st.pref);
    $('pieces').replaceChildren(...piecesOf(look).map(([name, id]) => { const li = document.createElement('li'); li.append(name + ' '); const sp = document.createElement('span'); sp.textContent = id; li.append(sp); return li; }));
  }

  function piecesOf(look) {
    const share = st.build / 100, word = share < .875 ? 'lean' : share < 1.2 ? 'average' : 'heavy', sexWord = st.sex === 'female' ? 'woman' : 'man';
    const out = [[`Body, ${sexWord}, ${word}, ${SKINS[look.skin].word}`, `body_${st.sex}_${word}`]];
    const style = STYLES.find(s => s.id === look.style);
    out.push([`${cap(look.style)} hair, ${look.style === 'bald' ? 'bare skull' : look.hair}`, style.trait ? 'style_' + style.id : `style_${style.id}_${st.sex}`]);
    if (look.beard !== 'none') out.push([`${cap(look.beard)} beard, ${look.hair}`, 'beard_' + look.beard]);
    out.push([cap(EYES[look.eyes].word) + (look.oddEye ? ' and ' + EYES[look.oddEye].word : ''), 'eyes_' + look.eyes]);
    for (const t of Object.values(look.from)) if (!STYLES.some(s => s.trait === t) && !Object.values(TRAIT_BEARDS).includes(t)) out.push([traitName(t) + ', ' + rarity[t], 'mark_' + t.replace(/-/g, '_')]);
    if (st.blind) out.push(['Both eyes lost', 'mark_blind']);
    return out;
  }

  function draw() {
    form.replaceChildren();
    for (const [k, label, opts, word, range] of FIELDS) fieldRow(k, label, opts, word, range);
    traitBox();
    drawViews();
  }

  function batch() {
    const zoom = Math.max(2, +F4X.ui.state.zoom - 2);
    $('rolls').replaceChildren(...Array.from({ length: 12 }, (_, i) => {
      const s = fit(rolled((seed * 31 + i * 977) % 1000003)), v = figure(lookOf(s), 'f', zoom, `${s.sex === 'female' ? 'Woman' : 'Man'}, ${s.height} cm`);
      v.fig.onclick = () => { st = s; draw(); };
      return v.fig;
    }));
  }

  F4X.bar((state, k) => { if (k === 'zoom') { drawViews(); batch(); } });
  $('roll').onclick = roll;
  $('batch').onclick = () => { seed = (seed * 7919 + 1) % 1000003; batch(); };
  roll();
  batch();

  setInterval(() => {
    if (F4X.ui.state.alive !== '1') return;
    const i = ++beat % 12;
    for (const v of views) {
      v.frames[i] ||= sprImage(FOLK_PARTS.look(v.look, v.face, { i, n: 12 }), CROP);
      v.ctx.putImageData(v.frames[i], 0, 0);
    }
  }, 1000 / 6);
})();
