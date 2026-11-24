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
const DYES = {
  undyed: P.cloth,
  oatmeal: R('#3a3832 #55524a #736f64 #918c7e #aca696 #c4bfae'),
  russet: R('#2e160e #4a2414 #6a361c #8a4c28 #a66436 #be7e4a'),
  madder: R('#34100e #521a16 #742822 #94382e #ae4e3e #c46a54'),
  woad: R('#141c2c #1e2c44 #2c405e #3e5878 #567290 #728ea6'),
  weld: R('#3a2c0c #5a4614 #7c621e #9c7e2c #b8983e #ceb058'),
  moss: R('#141e10 #20301a #304626 #445e34 #5a7644 #748e58'),
  walnut: R('#1c120c #2e1e14 #44301e #5c422a #745638 #8c6c48'),
  charcoal: R('#141416 #202124 #303236 #44464a #5a5c60 #727478'),
  lichen: R('#1e1426 #30203a #463052 #5e446a #765a80 #8e7496'),
};
const HOSE = { hide: P.leather, walnut: DYES.walnut, charcoal: DYES.charcoal, oatmeal: DYES.oatmeal, russet: DYES.russet, moss: DYES.moss };
const TRIMS = [null, null, null, DYES.weld, DYES.madder, DYES.woad, P.cloth];
const HEADWEAR = { none: 6, hood: 1.5, coif: 1, straw: 1 };
const HOMELAND_DRESS = {
  'Mountain-born': { garb: ['walnut', 'charcoal', 'russet'], headwear: 'hood' },
  'Forest-kin': { garb: ['moss', 'walnut', 'weld'], headwear: 'hood' },
  'Deep-dwellers': { garb: ['charcoal', 'lichen', 'undyed'], headwear: 'coif' },
  'Sky-touched': { garb: ['woad', 'undyed', 'weld'], headwear: 'coif' },
  'Marsh-folk': { garb: ['moss', 'oatmeal', 'lichen'], headwear: 'straw' },
  'Tundra-clans': { garb: ['undyed', 'charcoal', 'woad'], headwear: 'hood' },
  'Ember-kin': { garb: ['madder', 'weld', 'russet'], headwear: 'coif' },
  'River-people': { garb: ['woad', 'oatmeal', 'moss'], headwear: 'straw' },
  'Wastrel-nomads': { garb: ['oatmeal', 'russet', 'weld'], headwear: 'hood' },
  'Verdant': { garb: ['moss', 'weld', 'madder'], headwear: 'straw' },
};
const HOMELAND_PULL = 3;

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
  { id: 'plumed', sexes: {}, o: { bald: 1 }, trait: 'feathered' },
];
const BEARDS = { none: 5, full: 3, moustache: 2, goatee: 2, stubble: 3, braided: 1 };
const TRAIT_BEARDS = { downy: 'downy-coat' };

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
  const dress = HOMELAND_DRESS[culture.archetype] || { garb: [], headwear: null };
  const garbKeys = Object.keys(DYES).filter(k => k !== 'lichen' || dress.garb.includes(k) || r() < .3), garb = {};
  const garbPool = Object.fromEntries(garbKeys.map(k => [k, dress.garb.includes(k) ? HOMELAND_PULL : 1]));
  for (let i = 0; i < 3; i++) garb[weighted(r, garbPool)] = 3 - i;
  const headwear = { ...HEADWEAR }, worn = weighted(r, Object.fromEntries(['hood', 'coif', 'straw'].map(k => [k, k === dress.headwear ? HOMELAND_PULL : 1])));
  if (r() < .6) headwear[worn] += 3;
  return {
    skin: lean(r, SKINS, 2 + r() * 10), hair: lean(r, HAIRS, 2 + r() * 8), eyes: eyeLean,
    garb, legwear: lean(r, HOSE, 3), trim: TRIMS[Math.floor(r() * TRIMS.length)], headwear,
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

const PHYSIQUES = [[.75, 'gaunt'], [.9, 'lean'], [1.15, 'average'], [1.35, 'stocky'], [Infinity, 'heavy']];
const buildWord = build => PHYSIQUES.find(([upTo]) => build < upTo)[1];

function bodyOf(p) {
  const tall = p.height / 175, k = tall >= 1 ? tall : Math.pow(tall, .75), build = buildOf(p), girth = clamp(Math.pow(build, .7), .68, 1.55);
  const total = clamp(Math.round(32 * k), 21, 58), hh = 10, hd = 5;
  const rest = total - hh, legs = Math.max(5, Math.round(rest * .46)), tl = rest - legs;
  const frame = p.sex === 'female' ? { shoulders: .86, arms: .8 } : { shoulders: 1, arms: 1 };
  const hw = clamp(Math.round(6 * k * girth * frame.shoulders), 3, 12);
  const aw = clamp(Math.round(3 * Math.sqrt(k) * Math.pow(girth, .8) * frame.arms), 2, 5);
  return { legs, tl, hw, aw, hh, hd, build };
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
  let style = weighted(r, Object.fromEntries(STYLES.filter(s => s.sexes[p.sex]).map(s => [s.id, s.sexes[p.sex]])));
  let beard = p.sex === 'male' ? weighted(r, BEARDS) : 'none';
  const garb = weighted(r, pref.garb), legwear = weighted(r, pref.legwear);
  const { marks, from } = lookMarks(p.traits, rarity);
  if (p.blind) { marks.blind = 1; delete marks.oneEye; }
  const hat = weighted(r, pref.headwear || { none: 1 }), hood = weighted(r, pref.garb), cloak = r() < .12 ? weighted(r, pref.garb) : null;
  const marked = marks.scales || marks.fur || marks.chitin || marks.ironSkin || marks.emberSkin || marks.leafSkin || marks.slick || marks.feathers >= 3;
  const sleeves = marked || r() < .5 ? 'rolled' : 'long', apron = p.sex === 'female' && r() < .35, pouch = r() < .5;
  const plumed = STYLES.find(s => s.trait && p.traits.includes(s.trait)), downy = Object.keys(TRAIT_BEARDS).find(k => p.traits.includes(TRAIT_BEARDS[k]));
  if (plumed) style = plumed.id;
  if (downy) beard = downy;
  const capped = hat === 'hood' || hat === 'coif', underBrim = hat === 'straw' && ['topknot', 'bun', 'mohawk', 'curls', 'crop', 'bald', 'plumed'].includes(style);
  return {
    id: p.id, sex: p.sex, body: bodyOf(p), skin, hair, eyes, oddEye: odd !== eyes ? odd : null, style: capped || underBrim ? 'short' : style, beard,
    garb, legwear, trim: pref.trim, hat, hood, cloak, sleeves, apron, pouch, marks, from,
  };
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

function lookRig(look) {
  const race = 'look:' + look.id, m = look.marks;
  const skin = skinOf(look), eye = m.dragonEyes ? P.gold[4] : m.beastEyes ? P.gold[3] : m.murkEyes ? P.frost[5] : EYES[look.eyes].col;
  FOLK[race] = { ...look.body, skin, eyes: eye, tusks: m.tusks ? 1 : 0, pointears: m.fur >= 3 || m.scales >= 4 ? 1 : 0 };
  const style = STYLES.find(s => s.id === look.style), hair = hairRamp(look.hair);
  const o = { race, tunic: DYES[look.garb], pants: HOSE[look.legwear], hair, seed: seedOf(look.id) % 97 + 1, ...(style.o || {}) };
  if (look.trim) o.trim = look.trim;
  if (look.hat === 'hood' || look.hat === 'coif') { o.hat = 'hood'; o.hood = look.hat === 'coif' ? P.cloth : DYES[look.hood]; }
  if (look.hat === 'straw') o.hat = 'straw';
  if (look.cloak) o.cape = DYES[look.cloak];
  if (look.style === 'mohawk') o.mohawk = hair;
  if (look.beard === 'full' || look.beard === 'braided') o.beard = 1;
  if (look.sleeves === 'long') o.sleeves = 'long';
  if (m.oneArm) o.oneArm = 1;
  if (m.oneLeg) o.oneLeg = 1;
  return { o, skin, hair };
}

function drawLook(look, face, time, act, gear) {
  const { o, skin, hair } = lookRig(look), idle = idlePose(look, time);
  if (act) {
    const pose = { ...idle, br: act.br ? 1 : 0, blink: !!act.blink }, rig = { ...o, ...(gear || {}) };
    if (act.lie) { const s = rigPawnLie(rig, act); paintLookLying(s, look, skin, hair, { ...pose, rest: !!act.rest }); return s; }
    const s = rigPawn(rig, act);
    paintLook(s, look, skin, hair, act.face || 's', pose);
    return s;
  }
  const s = rigPawn(o, { face: face || 'f', br: idle.br, blink: idle.blink, look: idle.glance, hair: idle.wave() * 1.2, cape: idle.wave(.2) * 1.5 });
  paintLook(s, look, skin, hair, face || 'f', idle);
  return s;
}
