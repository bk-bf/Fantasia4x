'use strict';
const seedOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 100003; };

const SKINS = {
  pale: { ramp: P.skinPale, word: 'pale-skinned' },
  tan: { ramp: P.skinTan, word: 'sun-browned' },
  dark: { ramp: P.skinDark, word: 'dark-skinned' },
  ashen: { ramp: P.skinGrey, word: 'ashen' },
  green: { ramp: P.skinOrc, word: 'green-skinned' },
  olive: { ramp: P.skinGob, word: 'sallow' },
};
const HAIRS = {
  brown: { ramp: P.furBrown, word: 'brown of hair' },
  fair: { ramp: P.hay, word: 'fair of hair' },
  black: { ramp: P.furDark, word: 'black of hair' },
  red: { ramp: P.fallOrange, word: 'red of hair' },
  copper: { ramp: P.furRust, word: 'copper of hair' },
  white: { ramp: P.furWhite, word: 'white of hair' },
};
const EYES = {
  dark: { col: P.ink, word: 'dark-eyed' },
  amber: { col: P.gold[4], word: 'amber-eyed' },
  blue: { col: P.blue[4], word: 'blue-eyed' },
  green: { col: P.green[4], word: 'green-eyed' },
  grey: { col: P.furWhite[2], word: 'grey-eyed' },
};

const STYLES = [
  { id: 'short', sexes: ['male', 'female'] },
  { id: 'long', sexes: ['female', 'male'], o: { longhair: 1 } },
  { id: 'bun', sexes: ['female'], o: { bun: 1 } },
  { id: 'mohawk', sexes: ['male', 'female'], o: { mohawk: true } },
  { id: 'bald', sexes: ['male'], o: { bald: 1 } },
];
const BEARD = { sexes: ['male'] };

function weighted(r, weights) {
  const keys = Object.keys(weights), total = keys.reduce((a, k) => a + weights[k], 0);
  let u = r() * total;
  for (const k of keys) { u -= weights[k]; if (u <= 0) return k; }
  return keys[keys.length - 1];
}

function culturePreference(culture) {
  const r = rng(seedOf(culture.id + ':colour'));
  const lean = (table, strong) => {
    const keys = Object.keys(table), w = Object.fromEntries(keys.map(k => [k, 1]));
    const first = keys[Math.floor(r() * keys.length)];
    w[first] += strong;
    if (r() < .5) { const second = keys[Math.floor(r() * keys.length)]; w[second] += strong / 2; }
    return w;
  };
  return { skin: lean(SKINS, 2 + r() * 10), hair: lean(HAIRS, 2 + r() * 8), eyes: lean(EYES, 2 + r() * 6) };
}

function topShare(weights) {
  const keys = Object.keys(weights), total = keys.reduce((a, k) => a + weights[k], 0);
  const top = keys.reduce((a, k) => weights[k] > weights[a] ? k : a, keys[0]);
  return { key: top, share: weights[top] / total };
}

function colouringPhrase(pref) {
  const s = topShare(pref.skin), h = topShare(pref.hair), e = topShare(pref.eyes);
  const all = [[s, SKINS[s.key].word], [h, HAIRS[h.key].word], [e, EYES[e.key].word]].sort((a, b) => b[0].share - a[0].share);
  const strong = all.filter(([x]) => x.share >= .45).map(([, w]) => w);
  const loose = all.filter(([x]) => x.share >= .3 && x.share < .45).map(([, w]) => w);
  const list = ws => ws.length > 1 ? ws.slice(0, -1).join(', ') + ' and ' + ws[ws.length - 1] : ws[0];
  if (strong.length && loose.length) return `Most are ${list(strong)}, and many ${list(loose)}.`;
  if (strong.length) return `Most are ${list(strong)}.`;
  if (loose.length) return `Their colouring runs every way, though many are ${list(loose)}.`;
  return 'No two of them share a colouring.';
}

const MARKS = [
  { id: 'horns', traits: { 'nub-horns': 1, 'gore-horns': 2, 'great-horns': 3 } },
  { id: 'tusks', traits: { 'small-tusks': 1, tusks: 2, 'great-tusks': 3 } },
  { id: 'beak', traits: { 'pecking-beak': 1, 'tearing-beak': 2, 'rending-beak': 3 } },
  { id: 'fangs', traits: { 'feeding-fangs': 1, 'jagged-teeth': 1, 'goring-fangs': 2, 'sabre-fangs': 3, venomous: 1, 'mild-venom': 1, 'deathly-venom': 2 } },
  { id: 'wings', traits: { 'budding-wings': 1, 'gliding-membrane': 1, wings: 2, 'great-wings': 3 } },
  { id: 'tail', traits: { 'prehensile-tail': 1 } },
  { id: 'extraEyes', traits: { 'spider-eyes-lesser': 1, 'spider-eyes': 2, 'spider-eyes-greater': 3 } },
  { id: 'claws', traits: { 'budding-claws': 1, 'rending-claws': 2, 'burrowing-claws': 2, 'dragon-claws': 3, 'crushing-claws': 3, 'raking-talons': 2, 'hooked-talons': 2, 'raptor-talons': 3, 'ripping-talons': 2 } },
  { id: 'scales', traits: { 'scaled-hide': 1, 'pebbled-skin': 1, 'dragon-scales': 2, 'granite-hide': 2 } },
  { id: 'feathers', traits: { feathered: 1, 'downy-coat': 1 } },
  { id: 'fur', traits: { 'thick-fur': 2, 'winter-mane': 3 } },
  { id: 'chitin', traits: { 'chitin-plating': 1, 'chitin-plates': 2, ironshell: 2, 'shell-ironshell': 2 } },
  { id: 'ironSkin', traits: { 'iron-skin': 1 } },
  { id: 'emberSkin', traits: { 'flame-touched': 1, emberheart: 1, 'tinder-skin': 1 } },
  { id: 'leafSkin', traits: { photosynthetic: 1 } },
  { id: 'slick', traits: { 'slick-hide': 1, 'moist-skinned': 1, 'webbed-limbs': 1, gilled: 1, 'gill-frills': 1 } },
  { id: 'oneEye', traits: { 'one-eyed': 1 } },
  { id: 'oneArm', traits: { 'one-armed': 1 } },
  { id: 'oneLeg', traits: { 'one-legged': 1 } },
  { id: 'pox', traits: { 'pox-marked': 1 } },
  { id: 'scar', traits: { 'head-scar-minor': 1, 'head-scar-serious': 2, 'head-scar-critical': 3, scarred: 1, 'head-burn-minor': 1, 'head-burn-critical': 2 } },
];

function lookMarks(traits) {
  const marks = {}, from = {};
  for (const m of MARKS) for (const t of traits) if (m.traits[t] && (marks[m.id] || 0) < m.traits[t]) { marks[m.id] = m.traits[t]; from[m.id] = t; }
  return { marks, from };
}

function bodyOf(p) {
  const k = p.height / 175, bmi = p.weight / Math.pow(p.height / 100, 2);
  const total = clamp(Math.round(32 * k), 16, 56);
  const hh = clamp(Math.round(10 * Math.pow(k, .45)), 7, 13);
  const rest = total - hh, legs = clamp(Math.round(rest * .46), 4, 22), tl = Math.max(6, rest - legs);
  const girth = Math.sqrt(bmi / 23);
  const hw = clamp(Math.round(6 * girth * Math.pow(k, .6) - (p.sex === 'female' ? .6 : 0)), 3, 12);
  const aw = clamp(Math.round(hw / 2), 2, 5), hd = clamp(Math.round(hh / 2), 4, 7);
  return { legs, tl, hw, aw, hh, hd };
}

function pawnLookOf(p, pref) {
  const r = rng(seedOf(p.id + ':look'));
  const skin = weighted(r, pref.skin), hair = weighted(r, pref.hair), eyes = weighted(r, pref.eyes);
  const styles = STYLES.filter(s => s.sexes.includes(p.sex));
  const style = styles[Math.floor(r() * styles.length)];
  const beard = BEARD.sexes.includes(p.sex) && r() < .45;
  const { marks, from } = lookMarks(p.traits);
  return { sex: p.sex, body: bodyOf(p), skin, hair, eyes, style: style.id, beard, marks, from };
}

let LOOKS = 0;
function drawLook(look, face) {
  const key = 'look' + (++LOOKS);
  let skin = SKINS[look.skin].ramp;
  if (look.marks.ironSkin) skin = P.iron.slice(1, 6);
  if (look.marks.emberSkin) skin = P.ember.slice(1, 6);
  if (look.marks.leafSkin) skin = P.green;
  if (look.marks.chitin) skin = P.chitin;
  const b = look.body;
  FOLK[key] = { ...b, skin, eyes: EYES[look.eyes].col, tusks: look.marks.tusks ? 1 : 0, tail: look.marks.tail ? 1 : 0, pointears: look.marks.fur ? 1 : 0 };
  const style = STYLES.find(s => s.id === look.style);
  const o = { race: key, tunic: P.cloth, pants: P.leather, hair: HAIRS[look.hair].ramp, seed: 7, ...(style.o || {}), ...(look.beard ? { beard: 1 } : {}) };
  if (o.mohawk) o.mohawk = HAIRS[look.hair].ramp;
  const s = rigPawn(o, { face: face || 'f' });
  delete FOLK[key];
  paintMarks(s, look, skin);
  return s;
}
