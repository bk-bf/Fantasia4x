'use strict';
LAIR_SCENES.bear = (() => {
  const time = LAIR.clock([[0, 5.5], [3, 6.5], [11, 8], [18, 10], [24, 11.5], [29, 13], [46, 16], [52, 17], [60, 19.5], [66, 21], [72, 29.5]]);
  const BED = [15.3, 15.1], BERRIES = [[21.6, 11.6], [23, 12.4], [24.3, 11.3], [22.6, 10.6], [25.2, 12.6]], POST = [27.2, 14.8], CACHE = [19.8, 19.4];
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));

  function place(k) {
    const { put, bare, age, cleared, loot, season } = k;
    bare(15.5, 15, 4.2); bare(23, 12, 3); bare(POST[0], POST[1] + .6, 2.4); bare(CACHE[0], CACHE[1], 2.6); bare(26, 18.6, 3.4); bare(32.5, 20, 4.6); bare(41, 19, 4);
    put(LAIR_PROPS.overhang(4), 15.2, 13.9);
    put(LAIR_PROPS.bed(7, P.litter, P.soilRich, age > 2 ? 86 : 74), BED[0], BED[1] - .68);
    BERRIES.forEach((b, i) => put(plant('berry', i, season), b[0], b[1]));
    loot.add('Large bones', [4, 11, 26][age - 1], item('large_bones', 'map-pile-' + age), CACHE[0] + 1.6, CACHE[1] + .5);
    if (age > 1) loot.add('Disturbed earth', 1, LAIR.sprite('site/buried_hoard/summer-0'), 11.6, 16.8);
    if (age > 2) {
      put(LAIR_PROPS.skeleton(5), 18.6, 13.2);
      loot.add('Framed leather pack', 1, item('framed_leather_pack', 'map-ground'), 19.8, 13.4);
      loot.add('Bronze socketed spear', 1, item('bronze_socketed_spear', 'map-lie'), 17.6, 13.8);
      loot.add('Spangenhelm', 1, item('spangenhelm', 'map-ground'), 18.1, 12.7);
    }
    if (!cleared) return;
    loot.add('Boar carcass, half eaten', 1, item('boar_carcass', 'map-pile-1'), CACHE[0], CACHE[1]);
    loot.add(age > 2 ? 'Cave bear carcass' : 'Bear carcass', 1, item(age > 2 ? 'cave_bear_carcass' : 'bear_carcass', 'map-pile-2'), BED[0] + .2, BED[1]);
  }

  function cast(R, k) {
    const { age, season } = k, post = { kind: 'pine', at: POST, seed: 3, spr: LAIR_PROPS.clawed(tree('pine', 3, season)) };
    if (k.cleared) return { post };
    const big = age > 2, reach = big ? 1.5 : 1.3, kill = [30.4, 20.2];
    const bear = R.add(LAIR.quad(big ? 'cavebear' : 'bear'), BED, big ? 'Cave bear' : 'Brown bear'), prey = R.add(LAIR.quad('boar'), [kill[0] + reach - 1.2, kill[1] + .04]), brush = R.add(LAIR.prop(LAIR_PROPS.brush(3)), CACHE);
    prey.keeps = true;
    bear.state('Sleeping').act('sleep', 3, { flip: 0 }).state('Waking').act('shake', 1.1).state('Foraging').go([[22.4, 12.9]], 36, 'walk').untilT(18, 'graze', { flip: 0 })
      .state('Marking its range').go([[POST[0] - 1.25, POST[1] + .25]], 31, 'walk');
    const rubbed = bear.t, hits = [0, 1, 2].map(n => rubbed + (n + .5) * 1.6);
    bear.act('rub', 4.8, { flip: 0 }).state('Hunting').go([[28.2, 19.9]], 34, 'walk').act('sniff', 1.4, { flip: 0 });
    const charge = bear.t;
    bear.state('Attacking').go([kill], 150, 'run');
    const caught = bear.t;
    prey.state('Foraging').untilT(charge - .2, 'graze', { flip: 0 }).state('Startled').act('alert', .45).state('Fleeing').go([[kill[0] + reach, kill[1] + .04]], 38 / Math.max(.1, caught - prey.t), 'run')
      .untilT(caught + .3, 'idle').state('Dead').act('hit', .45).act('fall', .9);
    bear.act('bite', .7).act('bite', .7).state('Eating').act('feed', 1.2).state('Hauling the kill').drag([[25, 19.9], [CACHE[0] - reach, CACHE[1]]], 48, prey, reach);
    const home = bear.t;
    bear.state('Eating').act('feed', 6).state('Covering the cache').act('graze', 2);
    const covered = bear.t;
    bear.state('Returning').go([BED], 30, 'walk').state('Sleeping').rest('sleep', { flip: 0 });
    brush.untilT(home, 'still').hideUntilT(covered).rest('still');
    for (let i = 0; i < 2; i++) {
      const s = [[33, 21.5], [33.9, 19.3]][i], far = [41 + i * 1.4, 18.4 + i * 1.6];
      R.add(LAIR.quad('boar'), s).state('Foraging').untilT(charge + i * .1, i ? 'sniff' : 'graze', { flip: i }).state('Startled').act('alert', .45).state('Fleeing').go([far], 150, 'run')
        .state('Watching').act('watch', 4, { flip: 1 }).untilT(60, 'graze').state('Returning').go([s], 34, 'walk').state('Foraging').rest(i ? 'sniff' : 'graze', { flip: i });
    }
    prey.untilT(covered, 'down').hideUntilT(61).jump([57.4, 20.6]).state('Returning').go([[42, 20.4], [kill[0] + reach - 1.2, kill[1] + .04]], 96, 'trot').state('Foraging').rest('graze', { flip: 0 });
    if (age > 1) {
      const side = [1.5, .7], near = p => [p[0] + side[0], p[1] + side[1]];
      R.add(LAIR.quad('bearcub'), near(BED), 'Bear cub').state('Sleeping').act('sleep', 3.6, { flip: 0 }).state('Following').act('shake', 1.1).go([near([22.4, 12.9])], 37, 'walk').untilT(18.6, 'graze', { flip: 1 })
        .go([[POST[0] - 2.4, POST[1] + 1.2]], 31, 'walk').state('Waiting').untilT(home + .4, 'sit', { flip: 0 }).state('Following').go([[CACHE[0] + .9, CACHE[1] + .9]], 70, 'trot')
        .state('Eating').untilT(covered, 'feed', { flip: 1 }).state('Following').go([near(BED)], 31, 'walk').state('Sleeping').rest('sleep', { flip: 0 });
    }
    return { post, hits };
  }

  return {
    name: 'Bear den', size: [56, 32], seed: 47, home: [15.4, 15.2], cam: [26, 16], ring: 5, time, place, cast,
    who: ['a brown bear', 'a sow and her cub', 'a cave bear and her cub'],
    ground(x, y, n, n2) {
      if (Math.hypot(x - 15.4, (y - 15.6) * 1.5) < 2.2 + n2) return 'dirt';
      if (Math.hypot(x - CACHE[0], (y - CACHE[1]) * 1.5) < 1.2 + n2) return 'dirt';
      const open = Math.hypot((x - 30) / 13, (y - 18.5) / 6) + (n - .5) * .7;
      if (open < .8) return n2 < .4 ? 'tall_grass' : 'deep_grass';
      return n2 < .42 ? 'tree' : n2 < .68 ? 'mossy_ground' : 'deep_grass';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'tree') return h < .36 ? ['tree', h2 < .45 ? 'pine' : h2 < .8 ? 'oak' : 'ash'] : h2 < .06 ? ['plant', 'fern'] : h2 < .1 ? ['plant', 'logs'] : h2 < .13 ? ['plant', 'mushroom'] : null;
      if (gid === 'mossy_ground') return h < .26 ? ['tree', h2 < .6 ? 'pine' : 'yew'] : h2 < .1 ? ['plant', 'fern'] : h2 < .14 ? ['plant', 'bush'] : null;
      return h < .03 ? ['tree', 'oak'] : h2 < .05 ? ['plant', 'bush'] : h2 < .08 ? ['plant', 'flowers'] : h2 < .1 ? ['plant', 'stump'] : null;
    },
    parts: [
      { at: [15.2, 12.6], name: 'Den', note: 'A hollow under the rock. The bear sleeps here every night.' },
      { at: [23, 11.4], name: 'Berry thicket', note: 'Where it forages each morning.' },
      { at: [POST[0], POST[1] - 1.2], name: 'Clawed tree', note: 'Marks the edge of its ground. You see it before you see the bear.' },
      { at: CACHE, name: 'Cache', note: 'A kill is dragged here, eaten over days and covered with brush.' },
      { at: [11.6, 16.6], name: 'Disturbed earth', note: 'Something buried before the bear came.', from: 2 },
      { at: [18.6, 12.8], name: 'Remains', note: 'Someone who came too close to the cub.', from: 3 },
    ],
    day: [[5.5, 6.5, 'Sleep', 'rest'], [6.5, 10, 'Forage', 'work'], [10, 13, 'Mark', 'wake'], [13, 17, 'Hunt', 'hunt'], [17, 19.8, 'Feed', 'feed'], [19.8, 29.5, 'Sleep', 'rest']],
    rules: ['One bear holds one den and sleeps there every night.', 'By day it walks a round inside its range: the berry thicket, the clawed tree, whatever it meets.', 'A kill is dragged to the cache, fed on and covered. It comes back to it for days.', 'A lone bear leaves you alone outside the home ground. A sow with a cub does not.'],
    needs: ['Forage and prey targets bound to the den’s range.', 'Sleep at the den, by night. Today it sleeps wherever fatigue catches it.', 'A mob that can drag a corpse, and a corpse that lasts as a food store.', 'A lair laid down as several tiles in one stamp, with marker trees at its edge.'],
  };
})();
