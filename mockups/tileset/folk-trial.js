'use strict';
(() => {
  const sheet = document.getElementById('sheet'), VIEWS = [['f', 'Front'], ['s', 'Side'], ['b', 'Back']];
  const PEOPLE = [{ sex: 'man', style: 'short', word: 'Man' }, { sex: 'woman', style: 'long', word: 'Woman' }];
  const typical = cm => TYPICAL_WEIGHT.scale * Math.pow(cm, TYPICAL_WEIGHT.power);

  function canvasOf(w, h, scale, paint) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.style.width = w * scale + 'px'; cv.style.height = h * scale + 'px';
    const ctx = cv.getContext('2d'), im = ctx.createImageData(w, h);
    paint(im.data);
    ctx.putImageData(im, 0, 0);
    return cv;
  }
  function ofSprite(s, scale) {
    let x0 = s.w, y0 = s.h, x1 = 0, y1 = 0;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    return canvasOf(w, h, scale, d => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = s.c[(y0 + y) * s.w + x0 + x]; if (c) d.set([c[0], c[1], c[2], 255], (y * w + x) * 4); } });
  }
  const ofBake = (b, scale) => canvasOf(b.w, b.h, scale, d => d.set(b.rgba));
  const entry = (cat, id, variant) => DBX.of(cat, id).find(e => e.variant === variant) || DBX.of(cat, id)[0];

  function figure(cv, caption) {
    const fig = document.createElement('figure');
    fig.append(cv);
    if (caption) { const fc = document.createElement('figcaption'); fc.textContent = caption; fig.append(fc); }
    return fig;
  }
  function section(title, ...rows) {
    const sec = document.createElement('section'), h = document.createElement('h2');
    h.textContent = title;
    sec.append(h, ...rows);
    sheet.append(sec);
  }
  function row(...cells) {
    const div = document.createElement('div');
    div.className = 'cells';
    div.append(...cells);
    return div;
  }

  const SKIN_KEY = { pale: 'pale', tan: 'tan', dark: 'dark', ashen: 'ashen', green: 'green', sallow: 'olive' };
  function today(person, face, st) {
    const sex = person.sex === 'woman' ? 'female' : 'male';
    const look = pawnLookOf({ id: 'trial-' + sex, sex, age: 30, height: 175, weight: typical(175), traits: [] }, { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 } }, FOLK_CAST.traitRarity);
    return drawLook({ ...look, skin: SKIN_KEY[st.skin], hair: st.hair, eyes: 'dark', oddEye: null, style: person.style, beard: 'none' }, face);
  }
  const placed = (person, face, st) => FOLK_PARTS.figure(person.sex, face, { skin: st.skin, hair: st.hair, eyes: 'dark', style: person.style });

  function render(st) {
    const zoom = +st.zoom;
    sheet.replaceChildren();
    section('Hand-placed pieces', row(...PEOPLE.flatMap(p => VIEWS.map(([face, name]) => figure(ofSprite(placed(p, face, st), zoom), p.word + ', ' + name.toLowerCase())))));
    section('Today, drawn by the rig', row(...PEOPLE.flatMap(p => VIEWS.map(([face, name]) => figure(ofSprite(today(p, face, st), zoom), p.word + ', ' + name.toLowerCase())))));

    const field = document.createElement('div');
    field.className = 'field';
    const grass = DBX.list.find(e => e.cat === 'ground' && /grass/.test(e.dbId)) || DBX.list.find(e => e.cat === 'ground');
    field.append(
      ofBake(DBX.bake(grass), 2),
      ofSprite(placed(PEOPLE[0], 'f', st), 2), ofSprite(placed(PEOPLE[1], 'f', st), 2), ofSprite(placed(PEOPLE[0], 's', st), 2),
      ofSprite(today(PEOPLE[0], 'f', st), 2), ofSprite(today(PEOPLE[1], 'f', st), 2),
      ofBake(DBX.bake(entry('item', 'steel_longsword', 'map-lean')), 2),
      ofBake(DBX.bake(entry('item', 'steel_longsword', '0')), 2),
      ofBake(DBX.bake(entry('item', 'mail_hauberk', '0')), 2),
      ofBake(DBX.bake(entry('item', 'iron_greaves', '0')), 2)
    );
    const note = document.createElement('p');
    note.textContent = 'Left to right at map size: a ground tile, three hand-placed folk, two of today’s folk, a sword on the map, and the sword, mail and greaves icons.';
    section('For scale', field, note);

    const man = FOLK_PARTS.layers('man', 'f', 'short'), woman = FOLK_PARTS.layers('woman', 'f', 'long'), side = FOLK_PARTS.layers('man', 's', 'short');
    const look = { skin: st.skin, hair: st.hair, eyes: 'dark' };
    const pieces = list => row(...list.map(layer => figure(ofSprite(FOLK_PARTS.sprite([layer], look), zoom), layer.name)));
    section('The pieces of the man, front', pieces(man));
    section('The pieces of the woman, front', pieces(woman));
    section('The pieces of the man, side', pieces(side));
  }

  fetch('catalog-data.json').then(r => r.json()).then(data => {
    DBX.fromData(data.objects);
    render(F4X.bar(st => render(st)).state);
  });
})();
