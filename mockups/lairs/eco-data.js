'use strict';
const ECO_DATA = (() => {
  const BIOME = { plains: 0, forest: 1, swamp: 2, mountain: 3 }, DEN = { wolf_den: 'den', predator_den: 'cave', goblin_warren: 'camp', swamp_nest: 'nest', harpy_roost: 'spire', griffon_aerie: 'spire' };
  const SHARE = { common: .12, uncommon: .06, rare: .03 }, WANT = { common: 14, uncommon: 6, rare: 2.5 };
  const PROFILE = {
    deer: { rarity: 'common', active: 'crep' },
    rabbit: { rarity: 'common', active: 'crep', burrow: 1 },
    wild_chicken: { rarity: 'common', active: 'day', burrow: 1 },
    giant_rat: { rarity: 'common', active: 'night', burrow: 1 },
    boar: { rarity: 'common', active: 'night' },
    elk: { rarity: 'uncommon', active: 'crep' },
    mountain_goat: { rarity: 'uncommon', active: 'day' },
    aurochs: { rarity: 'uncommon', active: 'day' },
    hoarfowl: { rarity: 'uncommon', active: 'day', burrow: 1 },
    quillback: { rarity: 'uncommon', active: 'night' },
    giant_olm: { rarity: 'rare', active: 'night', burrow: 1 },
    woolly_mammoth: { rarity: 'rare', active: 'day' },
    wolf: { rarity: 'common', style: 'pursuit', active: 'dusk' },
    jackal: { rarity: 'uncommon', style: 'pursuit', active: 'crep', small: 2, scav: 1 },
    worg: { rarity: 'rare', style: 'pursuit', active: 'night' },
    gnoll_marauder: { rarity: 'uncommon', style: 'pursuit', active: 'dusk' },
    sabretooth: { rarity: 'rare', style: 'pursuit', active: 'night', solo: 2 },
    owlbear: { rarity: 'rare', style: 'pursuit', active: 'night', solo: 1 },
    hippogriff: { rarity: 'rare', style: 'pursuit', active: 'day', air: 1, solo: 3 },
    bear: { rarity: 'common', style: 'forage', active: 'day', solo: 1, sleeps: 1 },
    mire_crocodile: { rarity: 'uncommon', style: 'ambush', active: 'sun', waits: 'water', solo: 3, sleeps: 1 },
    thornwood_spider: { rarity: 'common', style: 'ambush', active: 'night', waits: 'trail' },
    marsh_viper: { rarity: 'common', style: 'pursuit', active: 'sun', small: 1, sleeps: 1 },
    harpy: { rarity: 'uncommon', style: 'pursuit', active: 'day', small: 1, air: 1, grounded: 'storm' },
    stirge: { rarity: 'common', style: 'scavenge', active: 'dusk', air: 1 },
    goblin: { rarity: 'common', style: 'raid', active: 'night' },
    orc: { rarity: 'uncommon', style: 'raid', active: 'dusk' },
    kobold_skulker: { rarity: 'uncommon', style: 'raid', active: 'night', thief: 1 },
    bullywug: { rarity: 'common', style: 'raid', active: 'night' },
  };

  function lines(objects) {
    const objs = new Map(objects.map(o => [o.cat + '/' + o.id, o])), by = new Map(), out = {}, left = [];
    for (const o of objects) if (o.cat === 'creature' && o.raw && o.raw.species && o.raw.tier) { if (!by.has(o.raw.species)) by.set(o.raw.species, []); by.get(o.raw.species).push(o); }
    for (const [sp, list] of by) {
      const P = PROFILE[sp];
      if (!P) { left.push(list.find(o => o.raw.tier === 2) || list[0]); continue; }
      list.sort((a, b) => a.raw.tier - b.raw.tier);
      const base = list.find(o => o.raw.tier === 2) || list[0], r = base.raw, bw = r.biomeWeights || { plains: 1 };
      const top = Object.entries(bw).sort((a, b) => b[1] - a[1])[0][0], carcass = objs.get('item/' + r.carcassItemId), mass = (carcass && carcass.raw.weightKg) || 20;
      const pack = [Math.max(1, (r.pack || [1, 2])[0]), Math.max(1, (r.pack || [1, 2])[1])], threat = r.threatLevel || 1;
      const temper = ({ passive: .2, neutral: .6, aggressive: 1 }[r.behaviour] || .6) + (r.chargesWhenWounded ? .25 : 0);
      const tiers = list.map(o => ({ tier: o.raw.tier, id: o.id, name: o.name, threat: o.raw.threatLevel || threat }));
      const k = { id: sp, name: base.name, tiers, top: Math.max(...tiers.map(t => t.tier)), biomes: bw, land: BIOME[top], mass, threat, temper, behaviour: r.behaviour, rarity: P.rarity, active: P.active, src: { pack: r.pack, lairRange: r.lairRange, lair: r.lair, diet: r.diet, kg: mass } };
      if (!P.style) Object.assign(k, {
        prey: 1, size: pack, cap: Math.max(6, pack[1] * 3), fec: mass < 5 ? 1.5 : mass < 30 ? .55 : mass < 60 ? .35 : .15, speed: mass > 80 ? 35 : mass < 5 ? 40 : 55,
        roam: P.burrow ? 2 : 8, danger: clamp(threat / 60 * (temper >= .6 ? 1 : .35), 0, .5), eats: clamp(Math.pow(mass / 25, .75), .08, 6), want: WANT[P.rarity], burrow: P.burrow || 0,
      });
      else {
        const site = objs.get('site/' + r.lair), need = clamp(mass / 25 * 1.6, .25, 4.5);
        Object.assign(k, {
          style: P.style, lair: site ? site.name : 'Lair', den: DEN[r.lair] || 'den', site: BIOME[top], need, size: P.solo ? [1, Math.min(P.solo, pack[1])] : pack, cap: P.solo || pack[1] * 2 + 2,
          range: (r.lairRange || 50) * 2.5, speed: P.air ? 110 : P.style === 'ambush' ? 22 : mass > 50 ? 42 : 62, skill: clamp(.28 + threat / 40, .28, .75), litter: [1, Math.max(1, pack[1] - 1)],
          breed: .65, floor: clamp(need * .55, .3, 1.8), share: SHARE[P.rarity], small: P.small || 0, scav: P.scav || 0, air: P.air || 0, sleeps: P.sleeps || 0, waits: P.waits || null, grounded: P.grounded || null, thief: P.thief || 0,
        });
      }
      out[sp] = k;
    }
    return { lines: out, left: left.map(o => ({ id: o.raw.species, name: o.name, diet: o.raw.diet })) };
  }
  return { lines, PROFILE, BIOME };
})();
if (typeof module !== 'undefined') module.exports = ECO_DATA;
