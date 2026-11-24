'use strict';
(async () => {
  const sheet = document.getElementById('sheet');
  const data = await (await fetch('folk-data.json')).json();
  const name = id => data.traitNames[id];
  const cultures = data.cultures.map(c => {
    const pref = culturePreference(c);
    return { ...c, pref, phrase: colouringPhrase(pref), pawns: c.pawns.map(p => ({ ...p, look: pawnLookOf(p, pref) })) };
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
      + `<span class="hidden">${SKINS[p.look.skin].word}, ${HAIRS[p.look.hair].word}, ${EYES[p.look.eyes].word}</span>`
      + (marks.length ? `<span class="marks">${marks.join(' · ')}</span>` : '');
    fig.append(cap);
    return fig;
  }

  function render(st) {
    sheet.replaceChildren();
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Cultures and pawns from the game’s own generator (seed 431). Colours, hair style and the culture’s colouring line are rolled by this page. Worn gear and held items are left off: they belong to the animation work.';
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
    }
    marksSection(st);
  }

  function marksSection(st) {
    const sec = document.createElement('section'), h = document.createElement('h2'), row = document.createElement('div');
    h.textContent = 'Every mark, strongest form, on one plain body';
    row.className = 'cells';
    const plain = { id: 'mark', sex: 'male', age: 30, height: 175, weight: 72, traits: [] };
    const samples = MARKS.map(m => {
      const top = Object.keys(m.traits).reduce((a, k) => m.traits[k] > m.traits[a] ? k : a);
      return { ...plain, id: 'mark-' + m.id, name: name(top), traits: [top] };
    });
    const pref = { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 } };
    for (const p of samples) p.look = pawnLookOf(p, pref);
    CROP = cropFor(samples, st.face);
    for (const p of samples) row.append(card(p, st));
    sec.append(h, row);
    sheet.append(sec);
  }

  const ui = F4X.bar(st => render(st));
  render(ui.state);
})();
