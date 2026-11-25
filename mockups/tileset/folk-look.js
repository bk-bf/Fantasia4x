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
  { id: 'bald', sexes: { male: 2, female: .4 }, o: { bald: 1 } },
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
  return { skin: lean(r, SKINS, 2 + r() * 10), hair: lean(r, HAIRS, 2 + r() * 8), eyes: eyeLean };
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
  return { legs, tl, hw, aw, hh, hd, build, girth };
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
  const { marks, from } = lookMarks(p.traits, rarity);
  if (p.blind) { marks.blind = 1; delete marks.oneEye; }
  const plumed = STYLES.find(s => s.trait && p.traits.includes(s.trait)), downy = Object.keys(TRAIT_BEARDS).find(k => p.traits.includes(TRAIT_BEARDS[k]));
  if (plumed) style = plumed.id;
  if (downy) beard = downy;
  return {
    id: p.id, sex: p.sex, body: bodyOf(p), skin, hair, eyes, oddEye: odd !== eyes ? odd : null, style, beard, marks, from,
  };
}

const HAIR_GREY = { grey: P.furGrey };
const hairRamp = h => (HAIRS[h] || { ramp: HAIR_GREY[h] }).ramp;

const DRAGON = [P.green, P.red, P.blue, P.copper, P.purple];
function skinTint(look) {
  const m = look.marks;
  if (m.scales >= 4) return { to: DRAGON[seedOf(look.id) % DRAGON.length], share: .6 };
  if (m.chitin >= 4) return { to: P.chitin, share: .45 };
  if (m.ironSkin) return { to: P.iron.slice(2), share: .4 };
  if (m.leafSkin) return { to: P.oak.slice(2), share: .32 };
  return null;
}
const tinted = (ramp, tint) => tint ? ramp.map((c, i) => toward(c, tint.to[Math.round(i * (tint.to.length - 1) / (ramp.length - 1))], tint.share)) : ramp;
const skinOf = look => tinted(SKINS[look.skin].ramp, skinTint(look));

function lookRig(look) {
  const race = 'look:' + look.id, m = look.marks;
  const skin = skinOf(look), eye = m.dragonEyes ? P.gold[4] : m.beastEyes ? P.gold[3] : m.murkEyes ? P.frost[5] : EYES[look.eyes].col;
  FOLK[race] = { ...look.body, skin, eyes: eye, tusks: m.tusks ? 1 : 0, pointears: m.fur >= 3 || m.scales >= 4 ? 1 : 0 };
  const style = STYLES.find(s => s.id === look.style), hair = hairRamp(look.hair);
  const o = { race, bare: 1, hair, seed: seedOf(look.id) % 97 + 1, ...(style.o || {}) };
  if (look.style === 'mohawk') o.mohawk = hair;
  if (look.beard === 'full' || look.beard === 'braided') o.beard = 1;
  if (m.oneArm) o.oneArm = 1;
  if (m.oneLeg) o.oneLeg = 1;
  return { o, skin, hair };
}

const LOOK_STYLE = { pieces: false };

function drawLook(look, face, time, act, gear) {
  const { o, skin, hair } = lookRig(look), idle = idlePose(look, time), pieces = LOOK_STYLE.pieces;
  const styled = s => FOLK_SHAPE.restyle(s, look, skin, hair), finished = s => pieces ? Object.assign(styled(s), { styled }) : s;
  if (act) {
    const pose = { ...idle, br: act.br ? 1 : 0, blink: !!act.blink }, rig = { ...o, ...(gear || {}) };
    if (act.lie) { const s = rigPawnLie(rig, act); paintLookLying(s, look, skin, hair, { ...pose, rest: !!act.rest }); return finished(s); }
    if (pieces) rig.shape = FOLK_SHAPE.shaper(look, skin, act.face || 's');
    const s = rigPawn(rig, act);
    paintLook(s, look, skin, hair, act.face || 's', pose);
    return finished(s);
  }
  if (pieces) o.shape = FOLK_SHAPE.shaper(look, skin, face || 'f');
  const s = rigPawn(o, { face: face || 'f', br: idle.br, blink: idle.blink, look: idle.glance, hair: idle.wave() * 1.2, cape: idle.wave(.2) * 1.5 });
  paintLook(s, look, skin, hair, face || 'f', idle);
  return finished(s);
}
