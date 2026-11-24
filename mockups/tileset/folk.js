'use strict';
(async () => {
  const sheet = document.getElementById('sheet');
  const data = await (await fetch('folk-data.json')).json();
  const name = id => data.traitNames[id];
  const cultures = data.cultures.map(c => {
    const pref = culturePreference(c);
    return { ...c, pref, phrase: colouringPhrase(pref), pawns: c.pawns.map(p => ({ ...p, look: pawnLookOf(p, pref, data.traitRarity) })) };
  });
  let CROP = null;
  function cropFor(pawns, face) {
    let x0 = RG.W, y0 = RG.H, x1 = 0, y1 = 0;
    for (const p of pawns) {
      const s = drawLook(p.look, face);
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 5, h: y1 - y0 + 5 };
  }

  function figure(p, st, scale) {
    const s = drawLook(p.look, st.face), src = s.canvas(1), cv = document.createElement('canvas');
    cv.width = CROP.w; cv.height = CROP.h;
    cv.getContext('2d').drawImage(src, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
    cv.style.width = CROP.w * scale + 'px'; cv.style.height = CROP.h * scale + 'px';
    return cv;
  }

  function card(p, st) {
    const fig = document.createElement('figure');
    fig.append(figure(p, st, +st.zoom));
    const cap = document.createElement('figcaption'), marks = Object.values(p.look.from).map(name).filter(Boolean);
    cap.innerHTML = `<b>${p.name}</b><span>${p.sex === 'female' ? 'Woman' : 'Man'}, ${p.age} · ${p.height} cm · ${p.weight} kg</span>`
      + `<span class="hidden">${SKINS[p.look.skin].word}, ${(HAIRS[p.look.hair] || { word: 'greying' }).word}, ${EYES[p.look.eyes].word}${p.look.oddEye ? ' and ' + EYES[p.look.oddEye].word : ''}</span>`
      + (marks.length ? `<span class="marks">${marks.join(' · ')}</span>` : '');
    fig.append(cap);
    return fig;
  }

  function render(st) {
    sheet.replaceChildren();
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Cultures and pawns from the game\u2019s own generator (seed 431). Colours, hair, beards and the culture\u2019s colouring line are rolled by this page. Clothes are plain garb in each culture\u2019s rolled colours, standing in for worn gear and held items, which belong to the animation work. A mark\u2019s strength follows its trait\u2019s rarity.';
    sheet.append(note);
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

  function marksSection(st) {
    const sec = document.createElement('section'), h = document.createElement('h2'), row = document.createElement('div');
    h.textContent = 'Every mark at every rarity it comes in, on one plain body';
    row.className = 'cells';
    const plain = { sex: 'male', age: 30, height: 175, weight: 72 };
    const samples = MARKS.flatMap(m => m.traits.filter(t => data.traitRarity[t]).map(t => ({ ...plain, id: 'mark-' + t, name: name(t), traits: [t], rarity: data.traitRarity[t] })));
    samples.sort((a, b) => MARKS.findIndex(m => m.traits.includes(a.traits[0])) - MARKS.findIndex(m => m.traits.includes(b.traits[0])) || RANK[a.rarity] - RANK[b.rarity]);
    samples.push({ ...plain, id: 'mark-blind', name: 'Both eyes lost', traits: [], blind: true, rarity: 'from a wound' });
    const pref = { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 }, garb: { undyed: 1 }, legwear: { hide: 1 }, trim: null };
    for (const p of samples) p.look = { ...pawnLookOf(p, pref, data.traitRarity), style: 'short', beard: 'none', hair: 'brown' };
    CROP = cropFor(samples, st.face);
    for (const p of samples) { const f = card(p, st); f.querySelector('figcaption .hidden').textContent = p.rarity; row.append(f); }
    sec.append(h, row);
    sheet.append(sec);
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

  const ui = F4X.bar(st => render(st));
  render(ui.state);
})();
