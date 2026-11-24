'use strict';
(async () => {
  const sheet = document.getElementById('sheet');
  let ready = false;
  const ui = F4X.bar(st => { if (ready) render(st); });
  const data = await (await fetch('folk-data.json')).json();
  const name = id => data.traitNames[id];
  const cultures = data.cultures.map(c => {
    const pref = culturePreference(c);
    return { ...c, pref, phrase: colouringPhrase(pref), pawns: c.pawns.map(p => ({ ...p, look: pawnLookOf(p, pref, data.traitRarity) })) };
  });
  const FRAMES = 12, FRAMES_PER_SECOND = 6;
  let CROP = null, living = [], beat = 0;
  const inView = new IntersectionObserver(seen => { for (const e of seen) e.target.figure.shown = e.isIntersecting; }, { root: sheet, rootMargin: '120px' });

  function cropFor(pawns, face) {
    let x0 = RG.W, y0 = RG.H, x1 = 0, y1 = 0;
    for (const p of pawns) {
      const s = drawLook(p.look, face);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const headroom = pawns.some(p => p.look.marks.emberSkin >= 2) ? 12 : 4;
    return { x: x0 - 4, y: y0 - headroom, w: x1 - x0 + 9, h: y1 - y0 + headroom + 3 };
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

  function figure(p, st, scale) {
    const cv = document.createElement('canvas'), crop = CROP;
    cv.width = crop.w; cv.height = crop.h;
    cv.style.width = crop.w * scale + 'px'; cv.style.height = crop.h * scale + 'px';
    const fig = { look: p.look, face: st.face, crop, ctx: cv.getContext('2d'), frames: new Array(FRAMES), shown: false };
    fig.ctx.putImageData(sprImage(drawLook(p.look, st.face), crop), 0, 0);
    cv.figure = fig;
    living.push(fig);
    inView.observe(cv);
    return cv;
  }

  setInterval(() => {
    if (ui.state.alive !== '1') return;
    const i = ++beat % FRAMES;
    for (const fig of living) {
      if (!fig.shown) continue;
      fig.frames[i] ||= sprImage(drawLook(fig.look, fig.face, { i, n: FRAMES }), fig.crop);
      fig.ctx.putImageData(fig.frames[i], 0, 0);
    }
  }, 1000 / FRAMES_PER_SECOND);

  function card(p, st) {
    const fig = document.createElement('figure');
    fig.append(figure(p, st, +st.zoom));
    const cap = document.createElement('figcaption'), marks = Object.values(p.look.from).map(name).filter(Boolean);
    const colours = `${SKINS[p.look.skin].word}, ${(HAIRS[p.look.hair] || { word: 'greying' }).word}, ${EYES[p.look.eyes].word}${p.look.oddEye ? ' and ' + EYES[p.look.oddEye].word : ''}`;
    cap.innerHTML = `<b>${p.name}</b><span>${p.sex === 'female' ? 'Woman' : 'Man'}, ${p.age} · ${p.height} cm · ${p.weight} kg · ${buildWord(p.look.body.build)}</span>`
      + `<span class="hidden">${p.note ?? colours}</span>`
      + (marks.length ? `<span class="marks">${marks.join(' · ')}</span>` : '');
    fig.append(cap);
    return fig;
  }

  function render(st) {
    inView.disconnect();
    living = [];
    sheet.replaceChildren();
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Cultures and pawns from the game\u2019s own generator (seed 431). Colours, hair, beards and the culture\u2019s colouring line are rolled by this page. Dress is plain medieval wear in each culture\u2019s rolled dyes, standing in for worn gear and held items, which belong to the animation work. A mark\u2019s strength follows its trait\u2019s rarity.';
    sheet.append(note);
    sizeSections(st);
    for (const c of cultures) {
      const sec = document.createElement('section'), h = document.createElement('h2'), d = document.createElement('p');
      h.textContent = `${c.name} · ${c.archetype}`;
      d.className = 'lore';
      d.innerHTML = `${c.description} <em>${c.phrase}</em>`;
      CROP = cropFor(c.pawns, st.face);
      const row = document.createElement('div');
      row.className = st.lineup === '1' ? 'cells lineup' : 'cells';
      for (const p of c.pawns) row.append(st.lineup === '1' ? figure(p, st, +st.zoom) : card(p, st));
      sec.append(h, d, row);
      sheet.append(sec);
      if (c === cultures[0]) premadeSection(st);
    }
    marksSection(st);
  }

  const PLAIN_PREF = { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 }, garb: { undyed: 1 }, legwear: { hide: 1 }, trim: null, headwear: { none: 1 } };
  const PLAIN_LOOK = { style: 'short', beard: 'none', hair: 'brown', hat: 'none', cloak: null, sleeves: 'rolled', apron: false, pouch: false };
  const typicalWeight = cm => Math.round(TYPICAL_WEIGHT.scale * Math.pow(cm, TYPICAL_WEIGHT.power));
  function plainPawn(id, name, fields) {
    const p = { id, name, sex: 'male', age: 30, height: 175, weight: 72, traits: [], ...fields };
    p.look = { ...pawnLookOf(p, PLAIN_PREF, data.traitRarity), ...PLAIN_LOOK };
    return p;
  }

  function cardRow(title, pawns, st) {
    const sec = document.createElement('section'), h = document.createElement('h2'), row = document.createElement('div');
    h.textContent = title;
    row.className = 'cells';
    CROP = cropFor(pawns, st.face);
    for (const p of pawns) row.append(card(p, st));
    sec.append(h, row);
    sheet.append(sec);
  }

  function sizeSections(st) {
    cardRow('One build at nine heights', [90, 110, 130, 150, 175, 200, 230, 260, 290].map(cm => plainPawn('tall-' + cm, cm + ' cm', { height: cm, weight: typicalWeight(cm), note: '' })), st);
    cardRow('One height at seven builds', [.6, .75, .9, 1, 1.15, 1.35, 1.6].map(share => Math.round(typicalWeight(175) * share)).map(kg => plainPawn('heavy-' + kg, kg + ' kg', { weight: kg, note: '' })), st);
    const ends = cultures.flatMap(c => { const byHeight = [...c.pawns].sort((a, b) => a.height - b.height); return [byHeight[0], byHeight[byHeight.length - 1]].map(p => ({ ...p, note: c.archetype })); });
    cardRow('The shortest and the tallest of each folk', ends.sort((a, b) => a.height - b.height), st);
  }

  function marksSection(st) {
    const samples = MARKS.flatMap(m => m.traits.filter(t => data.traitRarity[t]).map(t => plainPawn('mark-' + t, name(t), { traits: [t], note: data.traitRarity[t] })));
    samples.sort((a, b) => MARKS.findIndex(m => m.traits.includes(a.traits[0])) - MARKS.findIndex(m => m.traits.includes(b.traits[0])) || RANK[a.note] - RANK[b.note]);
    samples.push(plainPawn('mark-blind', 'Both eyes lost', { blind: true, note: 'from a wound' }));
    cardRow('Every mark at every rarity it comes in, on one plain body', samples, st);
  }

  function premadeSection(st) {
    const sec = document.createElement('section'), h = document.createElement('h2'), row = document.createElement('div');
    h.textContent = 'The premade pawns, for comparison';
    row.className = 'cells lineup';
    for (const k of Object.keys(PAWNS)) {
      const s = rigPawn(PAWNS[k].o, { face: st.face }), src = s.canvas(1), cv = document.createElement('canvas');
      cv.width = CROP.w; cv.height = CROP.h;
      cv.getContext('2d').drawImage(src, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
      cv.style.width = CROP.w * st.zoom + 'px'; cv.style.height = CROP.h * st.zoom + 'px';
      row.append(cv);
    }
    sec.append(h, row);
    sheet.append(sec);
  }

  ready = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && !new URLSearchParams(location.search).has('alive')) ui.set('alive', '0');
  else render(ui.state);
})();
