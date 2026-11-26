'use strict';
const ECO_DATA = (() => {
  const BIOME = { plains: 0, forest: 1, swamp: 2, mountain: 3 }, DEN = { wolf_den: 'den', predator_den: 'cave', goblin_warren: 'camp', swamp_nest: 'nest', harpy_roost: 'spire', griffon_aerie: 'spire', fox_earth: 'den', raptor_eyrie: 'spire', stoat_holt: 'den' };
  const SHARE = { common: .12, uncommon: .06, rare: .03 }, WANT = { common: 14, uncommon: 6, rare: 2.5 };
  const PROFILE = {
    deer: { rarity: 'common', active: 'crep', migr: .35 },
    rabbit: { rarity: 'common', active: 'crep', burrow: 1 },
    wild_chicken: { rarity: 'common', active: 'day', burrow: 1, breeds: 1 },
    giant_rat: { rarity: 'common', active: 'night', burrow: 1 },
    boar: { rarity: 'common', active: 'night' },
    elk: { rarity: 'uncommon', active: 'crep', migr: .75 },
    mountain_goat: { rarity: 'uncommon', active: 'day', migr: .3, cold: 1, browse: 1 },
    aurochs: { calves: 1, rarity: 'uncommon', active: 'day', migr: .45 },
    hoarfowl: { rarity: 'uncommon', active: 'day', burrow: 1, cold: 1 },
    quillback: { rarity: 'uncommon', active: 'night' },
    giant_olm: { rarity: 'rare', active: 'night', burrow: 1 },
    woolly_mammoth: { calves: 1, rarity: 'rare', active: 'day', migr: .4, cold: 1 },
    wolf: { rank: 3, calf: 4, rarity: 'common', pack: [4, 8], style: 'pursuit', active: 'dusk', life: 10, social: 'pack', scav: 1, litter: [3, 6] },
    jackal: { rank: 2, rarity: 'uncommon', share: .045, style: 'pursuit', active: 'crep', small: 2, scav: 1, life: 8, social: 'pack', litter: [3, 6] },
    worg: { rank: 3, calf: 1, rarity: 'uncommon', style: 'pursuit', active: 'night', life: 14, social: 'pack', scav: 1, litter: [3, 5] },
    gnoll_marauder: { rank: 4, calf: 1, rarity: 'uncommon', style: 'pursuit', active: 'dusk', life: 25, social: 'tribe', scav: 1 },
    sabretooth: { rank: 5, calf: 1, rarity: 'rare', share: .05, range: 140, style: 'pursuit', active: 'night', solo: 2, life: 16, social: 'pair' },
    owlbear: { rank: 6, rarity: 'rare', share: .08, range: 160, style: 'pursuit', active: 'night', solo: 1, life: 25, social: 'solo' },
    hippogriff: { rank: 4, rarity: 'rare', style: 'pursuit', active: 'day', air: 1, solo: 3, life: 30, social: 'pair' },
    bear: { rank: 6, rarity: 'rare', share: .03, range: 120, style: 'forage', active: 'day', solo: 1, sleeps: 1, life: 30, social: 'solo', scav: 1, fish: 1, breed: .16 },
    mire_crocodile: { rank: 6, rarity: 'rare', share: .2, range: 110, style: 'ambush', active: 'sun', waits: 'water', solo: 3, sleeps: 1, life: 50, social: 'solo' },
    thornwood_spider: { rank: 3, rarity: 'common', share: .8, style: 'trap', active: 'night', life: 9, social: 'solo' },
    marsh_viper: { rank: 1, rarity: 'common', share: .22, style: 'pursuit', active: 'sun', small: 1, frogs: 1, sleeps: 1, life: 12, social: 'solo' },
    harpy: { rank: 2, rarity: 'uncommon', share: .02, style: 'pursuit', active: 'day', small: 2, air: 1, grounded: 'storm', life: 25, social: 'flock' },
    stirge: { rank: 1, rarity: 'common', style: 'scavenge', active: 'dusk', air: 1, life: 4, social: 'swarm' },
    goblin: { rank: 2, rarity: 'common', style: 'raid', active: 'night', life: 30, social: 'tribe' },
    orc: { rank: 5, rarity: 'rare', style: 'raid', active: 'dusk', life: 40, social: 'tribe' },
    kobold_skulker: { rank: 1, rarity: 'uncommon', style: 'raid', active: 'night', thief: 1, life: 30, social: 'tribe' },
    bullywug: { rank: 2, rarity: 'common', small: 2, style: 'raid', active: 'night', life: 20, social: 'tribe' },
    fox: { rank: 2, rarity: 'common', share: .18, style: 'pursuit', active: 'crep', small: 1, scav: 1, life: 6, social: 'pair', litter: [3, 6] },
    raptor: { rank: 2, rarity: 'common', share: .3, range: 90, style: 'pursuit', active: 'day', small: 1, air: 1, solo: 2, life: 15, social: 'pair', litter: [2, 4] },
    stoat: { rank: 1, rarity: 'common', style: 'pursuit', active: 'night', small: 1, solo: 1, life: 5, social: 'solo', litter: [4, 8] },
  };

  const DISEASES = {
    warren_plague: { name: 'warren plague', hosts: ['rabbit', 'giant_rat'], incubate: 2, sick: 4, lethal: .8, beta: .9, spark: .025, reach: 50, contact: .7, immune: 2, wasting: .15, season: [1.3, 1.2, .9, .4] },
    murrain: { name: 'murrain', hosts: ['deer', 'elk', 'aurochs', 'mountain_goat', 'boar'], incubate: 10, sick: 20, lethal: .45, beta: .18, spark: .03, reach: 80, contact: .25, immune: 1.5, wasting: .25, season: [.5, 1.6, 1.2, .2], dry: 2 },
    fowl_pox: { name: 'fowl pox', hosts: ['wild_chicken', 'hoarfowl'], incubate: 5, sick: 12, lethal: .35, beta: .25, spark: .02, reach: 45, contact: .35, immune: 2, wasting: .1, season: [1.3, .8, 1.3, .4], wet: 2 },
    mange: { name: 'mange', hosts: ['wolf', 'jackal', 'fox', 'worg'], incubate: 14, sick: 45, lethal: .35, beta: .12, spark: .15, reach: 0, contact: .25, immune: .5, wasting: .2, season: [1, 1, 1, 1.3] },
  };

  function lines(objects) {
    const objs = new Map(objects.map(o => [o.cat + '/' + o.id, o])), by = new Map(), out = {}, left = [];
    for (const o of objects) if (o.cat === 'creature' && o.raw && o.raw.species && o.raw.tier) { if (!by.has(o.raw.species)) by.set(o.raw.species, []); by.get(o.raw.species).push(o); }
    const YOUNG = /\b(pup|cub|kit|kid|chick|fawn|piglet|whelp|yearling|hatchling|spiderling|stirgeling|eyas)\b/i;
    for (const [sp, list] of by) {
      const P = PROFILE[sp];
      if (!P) { left.push(list.find(o => o.raw.tier === 2) || list[0]); continue; }
      list.sort((a, b) => a.raw.tier - b.raw.tier);
      const base = list.find(o => o.raw.tier === 2) || list[0], r = base.raw, bw = r.biomeWeights || { plains: 1 };
      const top = Object.entries(bw).sort((a, b) => b[1] - a[1])[0][0], carcass = objs.get('item/' + r.carcassItemId), mass = (carcass && carcass.raw.weightKg) || 20;
      const src = P.pack || r.pack || [1, 2], pack = [Math.max(1, src[0]), Math.max(1, src[1])], threat = r.threatLevel || 1;
      const temper = ({ passive: .2, neutral: .6, aggressive: 1 }[r.behaviour] || .6) + (r.chargesWhenWounded ? .25 : 0);
      const tiers = list.map(o => ({ tier: o.raw.tier, id: o.id, name: o.name, threat: o.raw.threatLevel || threat, young: YOUNG.test(o.name) }));
      const k = { id: sp, name: base.name, tiers, top: Math.max(...tiers.map(t => t.tier)), biomes: bw, land: BIOME[top], mass, threat, temper, behaviour: r.behaviour, rarity: P.rarity, active: P.active, src: { pack: r.pack, lairRange: r.lairRange, lair: r.lair, diet: r.diet, kg: mass } };
      if (!P.style) Object.assign(k, {
        prey: 1, size: pack, cap: Math.max(6, pack[1] * 3), fec: mass < 5 ? 4.5 : mass < 30 ? 1.2 : mass < 60 ? .6 : .25, breeds: P.breeds || (P.burrow ? 2 : 1), nest: mass < 5 ? 3 : 2, grow: mass < 5 ? 18 : mass < 30 ? 30 : mass < 60 ? 45 : 60, live: mass < 5 ? .5 : mass < 30 ? .45 : .6, speed: mass > 80 ? 35 : mass < 5 ? 40 : 55,
        roam: P.burrow ? 2 : 8, calves: P.calves || 0, migr: P.migr || 0, cold: P.cold || 0, danger: clamp(threat / 60 * (temper >= .6 ? 1 : .35), 0, .5), eats: clamp(Math.pow(mass / 25, .75), .08, 6), want: WANT[P.rarity], burrow: P.burrow || 0, browse: P.browse || 0,
      });
      else {
        const site = objs.get('site/' + r.lair), need = clamp(mass / 25 * 1.6, .25, 4.5);
        Object.assign(k, {
          style: P.style, lair: site ? site.name : 'Lair', den: DEN[r.lair] || 'den', site: BIOME[top], need, size: P.solo ? [1, Math.min(P.solo, pack[1])] : pack, cap: P.solo || pack[1] * 2 + 2,
          range: P.range || (r.lairRange || 50) * 2.5, rank: P.rank || 0, calf: P.calf || 0, speed: P.air ? 110 : P.style === 'ambush' ? 22 : mass > 50 ? 42 : 62, skill: clamp(.28 + threat / 40, .28, .75), litter: P.litter || [1, Math.max(1, pack[1] - 1)],
          breed: P.breed || .65, floor: P.style === 'forage' ? .7 : clamp(need * .55, .3, 1.8), share: P.share || SHARE[P.rarity], small: P.small || 0, scav: P.scav || 0, air: P.air || 0, sleeps: P.sleeps || 0, waits: P.waits || null, grounded: P.grounded || null, thief: P.thief || 0, life: P.life || 10, social: P.social || 'pack', fish: P.fish || 0, frogs: P.frogs || 0,
        });
      }
      out[sp] = k;
    }
    return { lines: out, left: left.map(o => ({ id: o.raw.species, name: o.name, diet: o.raw.diet })) };
  }
  return { lines, PROFILE, BIOME, DISEASES };
})();
if (typeof module !== 'undefined') module.exports = ECO_DATA;
