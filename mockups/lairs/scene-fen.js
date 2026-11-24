'use strict';
LAIR_SCENES.fen = (() => {
  const time = LAIR.clock([[0, 11], [10, 16], [24, 17.5], [34, 18.5], [59.5, 21.5], [64, 24], [72, 35]]);
  const NEST = [14.8, 16.2], BANK = [17.3, 18.4], LARDER = [17.4, 20.6], EDGE = [30.6, 16.9], SNAG = [12.2, 13.4], REACH = 1.35;
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));
  const pool = (x, y, n) => Math.hypot((x - 24) / 7.6, (y - 16) / 5) + (n - .5) * .5;

  function place(k) {
    const { put, bare, age, cleared, decay, loot, season } = k;
    bare(15.6, 17.4, 4.4); bare(LARDER[0], LARDER[1], 2.2); bare(33.5, 17, 3.4); bare(42, 16.4, 4.6);
    [[NEST[0], NEST[1]], [NEST[0] - 1.9, NEST[1] + 1.5], [NEST[0] + .4, NEST[1] - 1.7]].slice(0, age).forEach((p, i) => {
      const o = put(LAIR_PROPS.eggs(i + 1, decay === 1 ? 1 + ((i + age) % 2) : 3 + ((i + age) % 3), decay), p[0], p[1]);
      if (!i && decay < 2) loot.push({ name: 'Lurker eggs', n: LAIR.left([4, 9, 15][age - 1], 'food', decay), o });
    });
    for (const [x, y, s] of [[13.2, 18.6, 1], [19, 20.2, 2], [31.6, 15.2, 3], [32, 18.8, 4], [20.4, 12.2, 5], [28.4, 20.8, 6], [16.4, 13.6, 7]]) put(plant('reeds', s, season), x, y);
    loot.add('Large bones', [3, 10, 24][age - 1], item('large_bones', k.heap(age)), LARDER[0] + 1.4, LARDER[1] + .5, 'bone');
    if (age > 2) {
      put(LAIR_PROPS.skeleton(11, decay), 12.6, 20.4);
      loot.add('Iron nasal helm', 1, item('iron_nasal_helm', 'map-ground'), 11.6, 19.9);
      loot.add('Iron winged spear', 1, item('iron_winged_spear', 'map-lie'), 13.6, 21);
    }
    if (k.vacant) put(LAIR_PROPS.ribs(9, decay), LARDER[0], LARDER[1]);
    LAIR.regrow(k, 15.4, 17.6, 3.2, 2.2, 61, ['reeds', 'fern', 'reeds'], 'willow', [NEST, [NEST[0] - 1.9, NEST[1] + 1.5], LARDER]);
    if (!cleared) return;
    const dead = [[BANK[0], BANK[1]], [NEST[0] + 1.5, NEST[1] + .9]].slice(0, age > 1 ? 2 : 1);
    dead.forEach((d, i) => { const o = put(item('mire_crocodile_carcass', 'map-pile-1'), d[0], d[1]); if (!i) loot.push({ name: 'Bog lurker carcass', n: dead.length, o }); });
  }

  function cast(R, k) {
    const post = { kind: 'bonewood', at: SNAG, seed: 2 };
    if (k.vacant) return { post };
    const { age } = k, spot = [EDGE[0] + REACH + .5, EDGE[1] + .04];
    const croc = R.add(LAIR.quad('lurker'), BANK, 'Bog lurker'), prey = R.add(LAIR.quad('deer'), [41.4, 15.6]), ribs = R.add(LAIR.prop(LAIR_PROPS.ribs(9)), LARDER);
    croc.state('Basking').until(15.6, 'bask', { flip: 0 }).state('Going to the water').go([[18.9, 17.7]], 22, 'walk').go([EDGE], 32, 'wade').state('Lying in wait');
    const waiting = croc.t;
    prey.state('Grazing').untilT(waiting - 4, 'graze', { flip: 1 }).state('Going to drink').go([[36, 16.6], spot], 26, 'walk').state('Drinking').act('graze', 4.2, { flip: 1 });
    const strike = prey.t;
    croc.untilT(strike, 'lurk', { flip: 0 }).state('Attacking').act('bite', .7).act('bite', .7);
    prey.state('Dead').act('hit', .45).act('fall', .9);
    croc.state('Hauling the kill').drag([[19.2, 17.8]], 40, prey, REACH + .5, 'tow').drag([[LARDER[0] - REACH - .5, LARDER[1]]], 34, prey, REACH + .5);
    const home = croc.t, eaten = home + 8;
    croc.state('Eating').untilT(eaten, 'feed').state('Returning').go([BANK], 20, 'walk').state('Sleeping').until(31.5, 'sleep', { flip: 0 }).state('Basking').rest('bask', { flip: 0 });
    prey.untilT(eaten, 'down').hideUntilT(eaten + 2).jump([57.4, 15]).state('Returning').go([[41.4, 15.6]], 60, 'trot').state('Grazing').rest('graze', { flip: 1 });
    ribs.untilT(home, 'still').hideUntilT(eaten).rest('still');
    R.add(LAIR.quad('deer'), [42.8, 17.3]).state('Grazing').untilT(waiting - 3.4, 'graze', { flip: 0 }).state('Going to drink').go([[37, 18.2], [33.4, 18.3]], 26, 'walk').state('Drinking').untilT(strike + .1, 'graze', { flip: 1 })
      .state('Startled').act('alert', .45).state('Fleeing').go([[44, 18.4]], 180, 'run').state('Watching').act('watch', 5, { flip: 1 }).untilT(60, 'idle').state('Grazing').go([[42.8, 17.3]], 24, 'walk').rest('graze', { flip: 0 });
    if (age > 1) {
      const guard = [NEST[0] + 1.7, NEST[1] + .9];
      R.add(LAIR.quad('lurker'), guard, 'Bog lurker').state('Guarding the nest').untilT(home + .5, 'rest', { flip: 1 }).state('Eating').go([[LARDER[0] + 1.6, LARDER[1] + .6]], 34, 'walk').untilT(eaten, 'feed', { flip: 1 })
        .state('Returning').go([guard], 20, 'walk').state('Guarding the nest').rest('rest', { flip: 1 });
      for (let i = 0; i < 2; i++) {
        const perch = [SNAG[0] + (i ? 1.1 : -.9), SNAG[1] + .5 + i * .3], over = [LARDER[0] + (i ? .9 : -.4), LARDER[1] - .2 + i * .4];
        R.add(LAIR.critter('stirge'), perch, 'Fen stirge').state('Roosting').untilT(home + 1 + i * .6, 'idle', { flip: i }).state('Scavenging').go([over], 110, 'walk').act('attack', .9).act('idle', 1.2).act('attack', .9).untilT(eaten, 'idle')
          .state('Returning').go([perch], 50, 'walk').state('Roosting').rest('idle', { flip: i });
      }
    }
    if (age > 2) for (let i = 0; i < 2; i++) {
      const a = [[20.6, 21.4], [26.4, 21.6]][i], b = [a[0] + 2.2, a[1] + .3];
      R.add(LAIR.critter('croaker'), a, 'Bog croaker').state('Croaking').act('idle', 9 + i * 5, { flip: 0 }).go([b], 30, 'walk').act('idle', 14).act('attack', .8).act('idle', 12).go([a], 30, 'walk').rest('idle', { flip: 0 });
    }
    return { post };
  }

  return {
    name: 'Fen nest', size: [56, 32], seed: 61, home: [15.6, 17.4], cam: [27, 16.5], ring: 5.2, turf: P.grassLoam, time, place, cast,
    who: ['a bog lurker', 'a pair of bog lurkers and two stirges', 'a pair of bog lurkers, stirges and croakers'],
    ground(x, y, n, n2, age, decay) {
      const d = pool(x, y, n), yard = LAIR.yard(Math.hypot(x - 16, (y - 18) * 1.3), 3.4 + n2, decay, 'mud', 'moss');
      if (d < .62) return 'water';
      if (d < 1) return 'shallow_water';
      if (yard) return yard;
      if (x > 30.5 && d < 1.3) return n2 < .5 ? 'mud' : 'riverbank';
      if (x + (n - .5) * 8 > 36) return n2 < .4 ? 'grass' : n2 < .7 ? 'tall_grass' : 'deep_grass';
      return n2 < .34 ? 'bog' : n2 < .5 ? 'mud' : 'moss';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'bog') return h < .05 ? ['tree', h2 < .6 ? 'willow' : 'dead'] : h2 < .14 ? ['plant', 'reeds'] : null;
      if (gid === 'moss' || gid === 'mud') return h < .09 ? ['tree', h2 < .5 ? 'willow' : h2 < .8 ? 'dead' : 'birch'] : h2 < .1 ? ['plant', 'reeds'] : h2 < .13 ? ['plant', 'fern'] : h2 < .15 ? ['plant', 'bloodroot'] : null;
      return h < .03 ? ['tree', h2 < .6 ? 'birch' : 'oak'] : h2 < .04 ? ['plant', 'bush'] : h2 < .07 ? ['plant', 'flowers'] : null;
    },
    parts: [
      { at: [NEST[0], NEST[1] - .9], name: 'Nests', note: 'Mud and reed mounds. One lurker never leaves them.' },
      { at: [BANK[0] + .4, BANK[1] - .6], name: 'Basking bank', note: 'Where it lies through the day.' },
      { at: [EDGE[0] + 1.6, EDGE[1] - 1], name: 'Drinking edge', note: 'Where the herd comes to the water. It waits here from dusk.' },
      { at: [LARDER[0], LARDER[1] - .5], name: 'Larder', note: 'Kills are towed back across the pool and eaten here.' },
      { at: [SNAG[0], SNAG[1] - 2.4], name: 'Snag', note: 'Stirges roost here and come down to a fresh kill.', from: 2 },
      { at: [12.6, 20], name: 'Remains', note: 'Someone who filled a waterskin at the wrong bank.', from: 3 },
    ],
    day: [[11, 15.6, 'Bask', 'rest'], [15.6, 17.4, 'Cross', 'wake'], [17.4, 18.6, 'Wait', 'hunt'], [18.6, 21.5, 'Feed', 'feed'], [21.5, 31.5, 'Sleep', 'rest'], [31.5, 35, 'Bask', 'rest']],
    rules: ['The lurker basks on its bank by day and enters the water before dusk.', 'It does not chase. It waits at the bank where the herd drinks and takes what comes within reach.', 'The kill is towed back across the pool to the larder by the nests.', 'One lurker always stays with the eggs.', 'Stirges on the snag come down to any fresh kill, yours included.'],
    needs: ['Ambush hunting: wait at a spot instead of chasing.', 'A herd that walks to water to drink, at set hours.', 'A mob that can drag a corpse, through water too.', 'A lair laid down as one stamp around a pool.'],
  };
})();
