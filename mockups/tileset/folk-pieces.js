'use strict';
const FOLK_PIECES = (() => {
  const probe = R('#ff00ff #ee00ee #dd00dd #cc00cc #bb00bb #aa00aa #990099');
  const plainPref = { skin: { tan: 1 }, hair: { brown: 1 }, eyes: { dark: 1 }, garb: { undyed: 1 }, legwear: { hide: 1 }, trim: null, headwear: { none: 1 } };
  const plain = { hat: 'none', cloak: null, sleeves: 'rolled', apron: false, pouch: false, style: 'short', beard: 'none', hair: 'brown', skin: 'tan', eyes: 'dark', garb: 'undyed', legwear: 'hide', trim: null, oddEye: null };
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
  const sizeShare = (a, k) => (a.sizeBias.includes(k) ? .75 / a.sizeBias.length : 0) + .25 / sizeKeys.length;
  const sizeOf = cm => sizeKeys.find(k => cm >= FOLK_CAST.sizes[k][0] && cm <= FOLK_CAST.sizes[k][1]);
  const dressedIn = (field, key) => archetypes.filter(a => [].concat(HOMELAND_DRESS[a.name][field]).includes(key)).map(a => a.name).join(', ');
  const even = table => Object.fromEntries(Object.keys(table).map(k => [k, 1]));
  const traitName = t => FOLK_CAST.traitNames[t] || t;

  const rows = [];
  const add = (group, id, name, make, src) => rows.push({ group, id, name, make, src: src || {} });

  const sexes = ['male', 'female'], sexWord = s => s === 'female' ? 'Woman' : 'Man';
  for (const sex of sexes) for (const [share, word] of [[.75, 'lean'], [1, 'average'], [1.4, 'heavy']]) add('Body', `body_${sex}_${word}`, `${sexWord(sex)}, ${word}`, () => drawLook(lookOf({ sex, weight: Math.round(typical(175) * share) }), 'f'), {
    odds: `175 cm, ${Math.round(typical(175) * share)} kg`, seen: seen(x => x.p.sex === sex && buildWord(x.look.body.build) === buildWord(share)),
    detail: sex === 'female' ? 'narrower shoulders and arms, kirtle to the ankle' : 'tunic to the thigh',
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
    who: archetypes.filter(a => a.sizeBias.includes(sizeOf(cm))).map(a => a.name).join(', '),
    detail: `${sizeOf(cm)}, ${bodyOf({ height: cm, weight: typical(cm), sex: 'male' }).legs + bodyOf({ height: cm, weight: typical(cm), sex: 'male' }).tl + 10} px tall`,
  });

  for (const k of Object.keys(SKINS)) add('Skin tone', 'skin_' + k, cap(SKINS[k].word), () => {
    const a = drawLook(lookOf({ look: { skin: k } }), 'f');
    return isolate(a, withProbe(SKINS, '__probe', { ramp: probe }, () => drawLook(lookOf({ look: { skin: '__probe' } }), 'f')));
  }, { odds: 'even, leaned per culture', seen: seen(x => x.look.skin === k), detail: SKINS[k].word });
  for (const k of [...Object.keys(HAIRS), 'grey']) add('Hair colour', 'hair_' + k, cap(k) + ' hair', () => {
    const fields = { look: { hair: k, style: 'long', beard: 'full' } }, a = drawLook(lookOf(fields), 'f');
    return isolate(a, withProbe(HAIRS, '__probe', { ramp: probe }, () => drawLook(lookOf({ look: { ...fields.look, hair: '__probe' } }), 'f')));
  }, k === 'grey'
    ? { odds: 'greying: 10% from 38, 40% from 46, 80% from 58', seen: seen(x => x.look.hair === k), detail: 'age, over any colour' }
    : { odds: 'even, leaned per culture', seen: seen(x => x.look.hair === k), detail: HAIRS[k].word });
  for (const k of Object.keys(EYES)) add('Eye colour', 'eyes_' + k, cap(EYES[k].word), () => {
    const a = drawLook(lookOf({ look: { eyes: k } }), 'f');
    return isolate(a, withProbe(EYES, '__probe', { col: probe[3] }, () => drawLook(lookOf({ look: { eyes: '__probe' } }), 'f')));
  }, { odds: 'even, leaned per culture', seen: seen(x => x.look.eyes === k || x.look.oddEye === k), detail: EYES[k].word + ', 4% of folk carry a second eye colour' });

  const styleTotal = sex => STYLES.reduce((a, s) => a + (s.sexes[sex] || 0), 0);
  for (const st of STYLES) for (const sex of Object.keys(st.sexes)) add('Hair style', `style_${st.id}_${sex}`, cap(st.id) + ', ' + sexWord(sex).toLowerCase(), () => {
    const look = { style: st.id, hair: 'brown' }, a = drawLook(lookOf({ sex, look }), 'f');
    return st.id === 'bald' ? a : isolate(a, drawLook(lookOf({ sex, look: { ...look, style: 'bald' } }), 'f'));
  }, { odds: pct(st.sexes[sex], styleTotal(sex)) + ' of ' + (sex === 'female' ? 'women' : 'men'), seen: seen(x => x.p.sex === sex && x.look.style === st.id), detail: 'cut short under a hood, coif or tight straw brim' });
  for (const k of Object.keys(BEARDS)) if (k !== 'none') add('Beard', 'beard_' + k, cap(k), () => isolate(drawLook(lookOf({ look: { beard: k } }), 'f'), drawLook(lookOf({}), 'f')), {
    odds: pct(BEARDS[k], sum(BEARDS)) + ' of men', seen: seen(x => x.look.beard === k),
  });
  for (const k of Object.keys(HEADWEAR)) if (k !== 'none') add('Headwear', 'hat_' + k, cap(k), () => isolate(drawLook(lookOf({ look: { hat: k, hood: 'walnut' } }), 'f'), drawLook(lookOf({}), 'f')), {
    odds: pct(HEADWEAR[k], sum(HEADWEAR)) + ', more where a culture favours it, and its homeland leans it', seen: seen(x => x.look.hat === k), who: dressedIn('headwear', k), detail: k === 'straw' ? 'woven straw' : 'dyed from the culture’s cloth',
  });

  const garment = (sex, look) => withProbe(DYES, '__probe', probe, () => isolate(drawLook(lookOf({ sex, look }), 'f'), drawLook(lookOf({ sex, look: { ...look, garb: '__probe' } }), 'f')));
  const plainDiff = (fields, base) => isolate(drawLook(lookOf(fields), 'f'), drawLook(lookOf(base || {}), 'f'));
  add('Garment', 'garment_tunic', 'Tunic', () => garment('male', { garb: 'madder' }), { odds: 'every man', seen: seen(x => x.p.sex === 'male'), detail: 'to the thigh, belted' });
  add('Garment', 'garment_kirtle', 'Kirtle', () => garment('female', { garb: 'madder', style: 'bald' }), { odds: 'every woman', seen: seen(x => x.p.sex === 'female'), detail: 'scooped neck, fitted waist, to the ankle' });
  add('Garment', 'garment_long_sleeves', 'Long sleeves', () => plainDiff({ look: { sleeves: 'long' } }), { odds: '50%, rolled on scaled, furred, plated or feathered skin', seen: seen(x => x.look.sleeves === 'long') });
  add('Garment', 'garment_apron', 'Apron', () => plainDiff({ sex: 'female', look: { apron: true, style: 'bald' } }, { sex: 'female', look: { style: 'bald' } }), { odds: '35% of women', seen: seen(x => x.look.apron), detail: 'undyed linen' });
  add('Garment', 'garment_pouch', 'Belt pouch', () => plainDiff({ look: { pouch: true } }), { odds: '50%', seen: seen(x => x.look.pouch), detail: 'leather' });
  add('Garment', 'garment_cloak', 'Cloak', () => plainDiff({ look: { cloak: 'woad' } }), { odds: '12%', seen: seen(x => x.look.cloak), detail: 'in one of the culture’s dyes' });
  for (const k of Object.keys(DYES)) add('Dye', 'dye_' + k, cap(k), () => garment('male', { garb: k, sleeves: 'long' }), {
    odds: `three dyes picked per culture, a homeland dye ${HOMELAND_PULL}× as likely`, seen: seen(x => x.look.garb === k || x.look.cloak === k), who: dressedIn('garb', k),
  });
  for (const k of Object.keys(HOSE)) add('Hose', 'hose_' + k, cap(k), () => withProbe(HOSE, '__probe', probe, () => isolate(drawLook(lookOf({ look: { legwear: k } }), 'f'), drawLook(lookOf({ look: { legwear: '__probe' } }), 'f'))), {
    odds: 'even, leaned per culture', seen: seen(x => x.look.legwear === k),
  });
  [['weld', DYES.weld], ['madder', DYES.madder], ['woad', DYES.woad], ['linen', P.cloth]].forEach(([k, ramp]) => add('Trim', 'trim_' + k, cap(k) + ' trim', () => plainDiff({ look: { trim: ramp, garb: 'walnut' } }, { look: { garb: 'walnut' } }), {
    odds: `${pct(TRIMS.filter(t => t === ramp).length, TRIMS.length)} of cultures, worn by all its folk`, seen: seen(x => x.look.trim === ramp), detail: 'hem and cuffs',
  }));

  const markBases = [{}, { look: { style: 'bald' } }, { face: 's' }, { face: 's', look: { style: 'bald' } }];
  const markPiece = (fields, traits) => () => {
    for (const b of markBases) {
      const face = b.face || 'f', withMark = drawLook(lookOf({ ...fields, look: b.look }, traits), face), s = isolate(withMark, drawLook(lookOf({ look: b.look }), face));
      if (!blank(s)) return s;
    }
    return drawLook(lookOf(fields, traits), 'f');
  };
  const carriers = t => archetypes.filter(a => a.traits.includes(t)).map(a => a.name).join(', ');
  for (const m of MARKS) for (const t of m.traits) if (FOLK_CAST.traitRarity[t]) add('Mark', 'mark_' + t.replace(/-/g, '_'), traitName(t), markPiece({}, [t]), {
    odds: FOLK_CAST.traitRarity[t], seen: seen(x => x.p.traits.includes(t)), who: carriers(t),
    detail: `drawn as ${m.id.replace(/[A-Z]/g, ch => ' ' + ch.toLowerCase())} at strength ${RANK[FOLK_CAST.traitRarity[t]] || 1} of 5`,
  });
  add('Mark', 'mark_blind', 'Both eyes lost', markPiece({ blind: true }), { odds: 'from a wound', detail: 'blindfold over both eyes' });

  rows.archetypes = archetypes.map(a => {
    const id = a.name.toLowerCase().replace(/[^a-z]+/g, '_'), dress = HOMELAND_DRESS[a.name];
    const sizes = sizeKeys.map(k => ({ k, share: sizeShare(a, k) })).sort((x, y) => y.share - x.share);
    const marked = a.traits.filter(t => MARKS.some(m => m.traits.includes(t)) && FOLK_CAST.traitRarity[t]);
    const makes = [
      ...sizes.map(({ k }) => { const [lo, hi] = FOLK_CAST.sizes[k], cm = Math.round((lo + Math.min(hi, 290)) / 2); return () => drawLook(lookOf({ height: cm, weight: typical(cm) }), 'f'); }),
      ...marked.map(t => markPiece({}, [t])),
      ...dress.garb.map(k => () => garment('male', { garb: k, sleeves: 'long' })),
      () => plainDiff({ look: { hat: dress.headwear, hood: dress.garb[0] } }),
    ];
    return {
      id, makes,
      src: {
        odds: sizes.map(({ k, share }) => `${k} ${pct(share, 1)}`).join(', '),
        detail: `its traits each 3× as likely; dresses in ${listing(dress.garb)}, ${HOMELAND_PULL}× as likely as other dyes; favours the ${dress.headwear}`,
      },
    };
  });
  return rows;
})();
