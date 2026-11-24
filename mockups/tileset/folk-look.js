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
  brown: { col: P.furBrown[3], word: 'brown-eyed' },
  hazel: { col: P.oak[4], word: 'hazel-eyed' },
  amber: { col: P.gold[4], word: 'amber-eyed' },
  blue: { col: P.blue[4], word: 'blue-eyed' },
  ice: { col: P.frost[5], word: 'pale-eyed' },
  green: { col: P.green[4], word: 'green-eyed' },
  grey: { col: P.furWhite[2], word: 'grey-eyed' },
  violet: { col: P.purple[4], word: 'violet-eyed' },
  red: { col: P.red[4], word: 'red-eyed' },
};
const GARB = {
  undyed: P.cloth, moss: P.green, madder: P.red, woad: P.blue, murex: P.purple,
  hide: P.leather, soot: P.furDark, ochre: P.gold.slice(0, 4), fern: P.oak, rust: P.copper.slice(0, 5),
};
const LEGWEAR = { hide: P.leather, soot: P.furDark, undyed: P.cloth, woad: P.blue, bark: P.furBrown };
const TRIMS = [null, null, P.gold, P.red, P.blue, P.cloth];

const STYLES = [
  { id: 'short', sexes: { male: 4, female: 2 } },
  { id: 'crop', sexes: { male: 3, female: 1 }, o: { bald: 1 } },
  { id: 'long', sexes: { male: 1, female: 4 }, o: { longhair: 1 } },
  { id: 'bun', sexes: { female: 3 }, o: { bun: 1 } },
  { id: 'ponytail', sexes: { male: 2, female: 3 } },
  { id: 'braids', sexes: { male: 1, female: 3 } },
  { id: 'topknot', sexes: { male: 2, female: 1 } },
  { id: 'curls', sexes: { male: 2, female: 2 } },
  { id: 'pigtails', sexes: { female: 2 } },
  { id: 'fringe', sexes: { male: 1, female: 2 } },
  { id: 'mohawk', sexes: { male: 1, female: 1 } },
  { id: 'bald', sexes: { male: 2 }, o: { bald: 1 } },
];
const BEARDS = { none: 5, full: 3, moustache: 2, goatee: 2, stubble: 3, braided: 1 };

const RANK = { negative: 1, common: 1, uncommon: 2, rare: 3, epic: 4, mythic: 5, legendary: 5 };

function weighted(r, weights) {
  const keys = Object.keys(weights), total = keys.reduce((a, k) => a + weights[k], 0);
  let u = r() * total;
  for (const k of keys) { u -= weights[k]; if (u <= 0) return k; }
  return keys[keys.length - 1];
}

function lean(r, table, strong) {
  const keys = Object.keys(table), w = Object.fromEntries(keys.map(k => [k, 1]));
  const first = keys[Math.floor(r() * keys.length)];
  w[first] += strong;
  if (r() < .5) { const second = keys[Math.floor(r() * keys.length)]; w[second] += strong / 2; }
  return w;
}

function culturePreference(culture) {
  const r = rng(seedOf(culture.id + ':colour'));
  const eyes = Object.fromEntries(Object.keys(EYES).map(k => [k, k === 'red' || k === 'violet' ? .15 : 1]));
  const eyeLean = lean(r, eyes, 2 + r() * 6);
  const garbKeys = Object.keys(GARB), garb = {};
  for (let i = 0; i < 3; i++) garb[garbKeys[Math.floor(r() * garbKeys.length)]] = 3 - i;
  return {
    skin: lean(r, SKINS, 2 + r() * 10), hair: lean(r, HAIRS, 2 + r() * 8), eyes: eyeLean,
    garb, legwear: lean(r, LEGWEAR, 3), trim: TRIMS[Math.floor(r() * TRIMS.length)],
  };
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
  { id: 'horns', traits: ['nub-horns', 'gore-horns', 'great-horns'] },
  { id: 'tusks', traits: ['small-tusks', 'tusks', 'great-tusks'] },
  { id: 'beak', traits: ['pecking-beak', 'tearing-beak', 'rending-beak'] },
  { id: 'fangs', traits: ['feeding-fangs', 'jagged-teeth', 'goring-fangs', 'sabre-fangs', 'venomous', 'mild-venom', 'deathly-venom'] },
  { id: 'wings', traits: ['budding-wings', 'wings', 'great-wings'] },
  { id: 'membrane', traits: ['gliding-membrane'] },
  { id: 'tail', traits: ['prehensile-tail'] },
  { id: 'spiderEyes', traits: ['spider-eyes-lesser', 'spider-eyes', 'spider-eyes-greater'] },
  { id: 'claws', traits: ['budding-claws', 'rending-claws', 'burrowing-claws', 'dragon-claws', 'crushing-claws', 'raking-talons', 'hooked-talons', 'raptor-talons', 'ripping-talons'] },
  { id: 'scales', traits: ['pebbled-skin', 'scaled-hide', 'granite-hide', 'dragon-scales'] },
  { id: 'feathers', traits: ['feathered', 'downy-coat'] },
  { id: 'fur', traits: ['thick-fur', 'winter-mane'] },
  { id: 'chitin', traits: ['chitin-plates', 'chitin-plating', 'ironshell', 'shell-ironshell'] },
  { id: 'ironSkin', traits: ['iron-skin'] },
  { id: 'emberSkin', traits: ['tinder-skin', 'emberheart', 'flame-touched'] },
  { id: 'leafSkin', traits: ['photosynthetic'] },
  { id: 'slick', traits: ['moist-skinned', 'slick-hide'] },
  { id: 'webbed', traits: ['webbed-limbs'] },
  { id: 'gills', traits: ['gilled', 'gill-frills'] },
  { id: 'dragonEyes', traits: ['dragon-eyes'] },
  { id: 'beastEyes', traits: ['beast-eyed'] },
  { id: 'murkEyes', traits: ['murk-eyes'] },
  { id: 'oneEye', traits: ['one-eyed'] },
  { id: 'oneArm', traits: ['one-armed'] },
  { id: 'oneLeg', traits: ['one-legged'] },
  { id: 'pox', traits: ['pox-marked'] },
  { id: 'scar', traits: ['head-scar-minor', 'head-scar-serious', 'head-scar-critical'] },
  { id: 'burn', traits: ['head-burn-minor', 'head-burn-serious', 'head-burn-critical'] },
];

function lookMarks(traits, rarity) {
  const marks = {}, from = {};
  for (const m of MARKS) for (const t of traits) {
    if (!m.traits.includes(t)) continue;
    const s = RANK[rarity[t]] || 1;
    if ((marks[m.id] || 0) < s) { marks[m.id] = s; from[m.id] = t; }
  }
  return { marks, from };
}

const TYPICAL_WEIGHT = { scale: Math.exp(-3.568), power: 1.571 };
function buildOf(p) {
  return p.weight / (TYPICAL_WEIGHT.scale * Math.pow(p.height, TYPICAL_WEIGHT.power));
}

function bodyOf(p) {
  const k = Math.pow(p.height / 175, .75), girth = clamp(Math.sqrt(buildOf(p)), .78, 1.3);
  const total = clamp(Math.round(32 * k), 18, 48);
  const hh = clamp(Math.round(total * (.31 + .05 * (1 - k))), 6, 13);
  const rest = total - hh, legs = Math.max(5, Math.round(rest * .46)), tl = rest - legs;
  const hw = clamp(Math.round(6 * k * girth - (p.sex === 'female' ? .4 : 0)), 3, 11);
  const aw = clamp(Math.round(hw / 2), 2, 5), hd = clamp(Math.round(hh / 2), 3, 7);
  return { legs, tl, hw, aw, hh, hd };
}

function greying(r, age, hair) {
  if (hair === 'white') return hair;
  const p = age >= 58 ? .8 : age >= 46 ? .4 : age >= 38 ? .1 : 0;
  return r() < p ? (age >= 58 && r() < .5 ? 'white' : 'grey') : hair;
}

function pawnLookOf(p, pref, rarity) {
  const r = rng(seedOf(p.id + ':look'));
  const skin = weighted(r, pref.skin), eyes = weighted(r, pref.eyes);
  const odd = r() < .04 ? Object.keys(EYES)[Math.floor(r() * Object.keys(EYES).length)] : null;
  const hair = greying(r, p.age, weighted(r, pref.hair));
  const style = weighted(r, Object.fromEntries(STYLES.filter(s => s.sexes[p.sex]).map(s => [s.id, s.sexes[p.sex]])));
  const beard = p.sex === 'male' ? weighted(r, BEARDS) : 'none';
  const garb = weighted(r, pref.garb), legwear = weighted(r, pref.legwear);
  const { marks, from } = lookMarks(p.traits, rarity);
  if (p.blind) { marks.blind = 1; delete marks.oneEye; }
  return { id: p.id, sex: p.sex, body: bodyOf(p), skin, hair, eyes, oddEye: odd !== eyes ? odd : null, style, beard, garb, legwear, trim: pref.trim, marks, from };
}

const HAIR_GREY = { grey: P.furGrey };
const hairRamp = h => (HAIRS[h] || { ramp: HAIR_GREY[h] }).ramp;

const DRAGON = [P.green, P.red, P.blue, P.copper, P.purple];
function skinOf(look) {
  const m = look.marks;
  if (m.ironSkin) return P.iron.slice(1, 6);
  if (m.scales >= 4) return DRAGON[seedOf(look.id) % DRAGON.length].slice(0, 5);
  if (m.chitin >= 4) return P.chitin;
  if (m.emberSkin >= 3) return P.ember.slice(1, 6);
  if (m.leafSkin) return P.oak.slice(1, 6);
  return SKINS[look.skin].ramp;
}

let LOOKS = 0;
function drawLook(look, face, time) {
  const key = 'look' + (++LOOKS), m = look.marks;
  const skin = skinOf(look), eye = m.dragonEyes ? P.gold[4] : m.beastEyes ? P.gold[3] : m.murkEyes ? P.frost[5] : EYES[look.eyes].col;
  FOLK[key] = { ...look.body, skin, eyes: eye, tusks: m.tusks ? 1 : 0, pointears: m.fur >= 3 || m.scales >= 4 ? 1 : 0 };
  const style = STYLES.find(s => s.id === look.style), hair = hairRamp(look.hair);
  const o = { race: key, tunic: GARB[look.garb], pants: LEGWEAR[look.legwear], hair, seed: seedOf(look.id) % 97 + 1, ...(style.o || {}) };
  if (look.trim) o.trim = look.trim;
  if (look.style === 'mohawk') o.mohawk = hair;
  if (look.beard === 'full' || look.beard === 'braided') o.beard = 1;
  const pose = idlePose(look, time);
  const s = rigPawn(o, { face: face || 'f', br: pose.br, blink: pose.blink, look: pose.glance, hair: pose.wave() * 1.2 });
  delete FOLK[key];
  paintLook(s, look, skin, hair, face || 'f', pose);
  return s;
}
