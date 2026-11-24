'use strict';
const FOLK_PIECES = (() => {
  const probe = R('#ff00ff #ee00ee #dd00dd #cc00cc #bb00bb #aa00aa #990099');
  const plainPref = { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 } };
  const plain = { style: 'short', beard: 'none', hair: 'brown', skin: 'tan', eyes: 'dark', oddEye: null };
  const typical = cm => Math.round(TYPICAL_WEIGHT.scale * Math.pow(cm, TYPICAL_WEIGHT.power));
  const lookOf = (fields, traits) => {
    const pawn = { id: 'piece', sex: 'male', age: 30, height: 175, weight: typical(175), traits: traits || [], ...fields };
    const look = { ...pawnLookOf(pawn, plainPref, FOLK_CAST.traitRarity), ...plain };
    if (pawn.sex === 'female') look.style = 'long';
    return { ...look, ...(fields.look || {}) };
  };
  const same = (a, b) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
  const isolate = (a, b) => {
    const s = new Spr(a.w, a.h, a.ax, a.ay);
    for (let i = 0; i < a.c.length; i++) if (a.c[i] && !same(a.c[i], b.c[i])) { s.c[i] = a.c[i]; s.e[i] = a.e[i]; }
    s.sh = a.sh;
    return s;
  };
  const blank = s => !s.c.some(Boolean);
  const withProbe = (table, key, value, draw) => { table[key] = value; try { return draw(); } finally { delete table[key]; } };
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const pct = (w, total) => Math.round(100 * w / total) + '%';
  const sum = m => Object.values(m).reduce((a, v) => a + v, 0);
  const listing = ws => ws.length > 1 ? ws.slice(0, -1).join(', ') + ' and ' + ws[ws.length - 1] : ws[0] || '';

  const cultures = FOLK_CAST.cultures.map(c => ({ c, pref: culturePreference(c) }));
  const cast = cultures.flatMap(({ c, pref }) => c.pawns.map((p, i) => ({ c, p, i, look: pawnLookOf(p, pref, FOLK_CAST.traitRarity) })));
  const seen = test => { const n = cast.filter(test).length; return n ? `${n} of ${cast.length}` : 'none'; };
  const archetypes = FOLK_CAST.archetypes, sizeKeys = Object.keys(FOLK_CAST.sizes);
  const sizeOf = cm => sizeKeys.find(k => cm >= FOLK_CAST.sizes[k][0] && cm <= FOLK_CAST.sizes[k][1]);
  const even = table => Object.fromEntries(Object.keys(table).map(k => [k, 1]));
  const traitName = t => FOLK_CAST.traitNames[t] || t;

  const carriers = t => archetypes.filter(a => a.traits.includes(t)).map(a => a.name).join(', ');
  const rows = [];
  const add = (group, id, name, make, src) => rows.push({ group, id, name, make, src: src || {} });

  const sexes = ['male', 'female'], sexWord = s => s === 'female' ? 'Woman' : 'Man';
  const skinKeys = Object.keys(SKINS);
  for (const sex of sexes) for (const [share, word] of [[.75, 'lean'], [1, 'average'], [1.4, 'heavy']]) add('Body', `body_${sex}_${word}`, `${sexWord(sex)}, ${word}`,
    skinKeys.map(skin => () => drawLook(lookOf({ sex, weight: Math.round(typical(175) * share), look: { skin } }), 'f')), {
      odds: `175 cm, ${Math.round(typical(175) * share)} kg`, seen: seen(x => x.p.sex === sex && buildWord(x.look.body.build) === buildWord(share)),
      detail: `bare, in every skin tone: ${listing(skinKeys.map(k => SKINS[k].word))}; a culture leans its tone`,
    });
  [.6, .75, .9, 1, 1.15, 1.35, 1.6].forEach((share, i) => {
    const kg = Math.round(typical(175) * share), word = buildWord(share), upTo = PHYSIQUES.find(([u]) => share < u)[0];
    add('Build', `build_${kg}kg`, `${kg} kg, ${word}`, () => drawLook(lookOf({ weight: kg }), 'f'), {
      odds: `${pct(share, 1)} of typical weight`, seen: seen(x => buildWord(x.look.body.build) === word),
      detail: `${word} up to ${upTo === Infinity ? 'any weight' : pct(upTo, 1) + ' of typical'}`,
    });
  });
  for (const cm of [90, 110, 130, 150, 175, 200, 230, 260, 290]) add('Height', 'height_' + cm, cm + ' cm', () => drawLook(lookOf({ height: cm, weight: typical(cm) }), 'f'), {
    odds: `${typical(cm)} kg typical`, seen: seen(x => Math.abs(x.p.height - cm) <= 10),
    detail: `${sizeOf(cm)}, ${bodyOf({ height: cm, weight: typical(cm), sex: 'male' }).legs + bodyOf({ height: cm, weight: typical(cm), sex: 'male' }).tl + 10} px tall`,
  });

  for (const k of Object.keys(EYES)) add('Eye colour', 'eyes_' + k, cap(EYES[k].word), () => {
    const a = drawLook(lookOf({ look: { eyes: k } }), 'f');
    return isolate(a, withProbe(EYES, '__probe', { col: probe[3] }, () => drawLook(lookOf({ look: { eyes: '__probe' } }), 'f')));
  }, { odds: 'even, leaned per culture', seen: seen(x => x.look.eyes === k || x.look.oddEye === k), detail: EYES[k].word + ', 4% of folk carry a second eye colour' });

  const hairColours = [...Object.keys(HAIRS), 'grey'];
  const colourNote = `in every hair colour: ${listing(hairColours)}; a culture leans its colour, and age greys it (10% from 38, 40% from 46, 80% from 58)`;
  const inColours = draw => hairColours.map(hair => () => draw(hair));
  const styleTotal = sex => STYLES.reduce((a, s) => a + (s.sexes[sex] || 0), 0);
  const styleSprite = (sex, style) => hair => isolate(drawLook(lookOf({ sex, look: { style, hair } }), 'f'), drawLook(lookOf({ sex, look: { style: 'bald', hair } }), 'f'));
  for (const st of STYLES) for (const sex of Object.keys(st.sexes)) add('Hair style', `style_${st.id}_${sex}`, cap(st.id) + ', ' + sexWord(sex).toLowerCase(),
    st.id === 'bald' ? () => drawLook(lookOf({ sex, look: { style: 'bald' } }), 'f') : inColours(styleSprite(sex, st.id)),
    { odds: pct(st.sexes[sex], styleTotal(sex)) + ' of ' + (sex === 'female' ? 'women' : 'men'), seen: seen(x => x.p.sex === sex && x.look.style === st.id), detail: st.id === 'bald' ? '' : colourNote + '; cut short under a hood, coif or tight straw brim' });
  for (const st of STYLES) if (st.trait) add('Hair style', `style_${st.id}`, cap(st.id), inColours(styleSprite('male', st.id)), {
    odds: 'every folk with ' + traitName(st.trait), seen: seen(x => x.look.style === st.id), who: carriers(st.trait), detail: colourNote,
  });
  const beardSprite = k => hair => isolate(drawLook(lookOf({ look: { beard: k, hair } }), 'f'), drawLook(lookOf({ look: { hair } }), 'f'));
  for (const k of Object.keys(BEARDS)) if (k !== 'none') add('Beard', 'beard_' + k, cap(k), inColours(beardSprite(k)), {
    odds: pct(BEARDS[k], sum(BEARDS)) + ' of men', seen: seen(x => x.look.beard === k), detail: colourNote,
  });
  for (const k of Object.keys(TRAIT_BEARDS)) add('Beard', 'beard_' + k, cap(k), inColours(beardSprite(k)), {
    odds: 'every folk with ' + traitName(TRAIT_BEARDS[k]) + ', women too', seen: seen(x => x.look.beard === k), who: carriers(TRAIT_BEARDS[k]), detail: colourNote,
  });
  const markBases = [{}, { look: { style: 'bald' } }, { face: 's' }, { face: 's', look: { style: 'bald' } }];
  const markPiece = (fields, traits) => () => {
    for (const b of markBases) {
      const face = b.face || 'f', withMark = drawLook(lookOf({ ...fields, look: b.look }, traits), face), s = isolate(withMark, drawLook(lookOf({ look: b.look }), face));
      if (!blank(s)) return s;
    }
    return drawLook(lookOf(fields, traits), 'f');
  };
  const folded = new Set([...STYLES.map(st => st.trait), ...Object.values(TRAIT_BEARDS)].filter(Boolean));
  for (const m of MARKS) for (const t of m.traits) if (FOLK_CAST.traitRarity[t] && !folded.has(t)) add('Mark', 'mark_' + t.replace(/-/g, '_'), traitName(t), markPiece({}, [t]), {
    odds: FOLK_CAST.traitRarity[t], seen: seen(x => x.p.traits.includes(t)), who: carriers(t),
    detail: `drawn as ${m.id.replace(/[A-Z]/g, ch => ' ' + ch.toLowerCase())} at strength ${RANK[FOLK_CAST.traitRarity[t]] || 1} of 5`,
  });
  add('Mark', 'mark_blind', 'Both eyes lost', markPiece({ blind: true }), { odds: 'from a wound', detail: 'blindfold over both eyes' });

  rows.archetypes = archetypes.map(a => ({
    id: a.name.toLowerCase().replace(/[^a-z]+/g, '_'),
    src: {
      odds: `size leans ${listing(a.sizeBias)} 3 times in 4, otherwise any size`,
      detail: 'its traits each 3× as likely to be drawn; nothing of its own is drawn',
    },
  }));
  return rows;
})();
