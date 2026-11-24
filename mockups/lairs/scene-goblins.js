'use strict';
LAIR_SCENES.goblins = (() => {
  const time = LAIR.clock([[0, 15], [10, 18], [22, 19.5], [50, 23], [58, 26], [76, 39]]);
  const FIRE = [17.2, 16.5], GATE = [24.6, 16.7], RACK = [20.8, 18.7], STASH = [13.2, 18.3], HUTS = [[13.2, 13.7], [17.8, 12.7], [21.6, 14], [11.4, 17]], MATS = [[14.9, 15.3], [19.3, 14.8], [15.4, 18.7], [20.2, 16.2]];
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));

  function place(k) {
    const { put, bare, age, cleared, decay, loot } = k;
    bare(17, 16.2, 8.4); bare(28.5, 17.6, 3.2); bare(33.5, 19.2, 4.6); bare(43, 17.5, 4);
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2 + .16;
      if (Math.cos(a) > .9 || (age < 2 && i % 2) || (decay > 2 ? i % 7 !== 2 : decay > 1 && i % 4 === 1)) continue;
      put(LAIR_PROPS.stakes(i, 3, decay), 17 + Math.cos(a) * 7.7, 16.3 + Math.sin(a) * 5.5);
    }
    HUTS.slice(0, age + 1).forEach((h, i) => put(LAIR_PROPS.hut(i + 2, decay), h[0], h[1]));
    put(decay ? LAIR_PROPS.firepit(1, decay) : build('campfire'), FIRE[0], FIRE[1]);
    put(LAIR_PROPS.spit(1, decay), FIRE[0] + 1.6, FIRE[1] + .5);
    put(decay > 1 ? LAIR_PROPS.rack(1, decay) : build('drying'), RACK[0], RACK[1]);
    if (age > 1) put(LAIR_PROPS.totem(1, decay), GATE[0] + .3, GATE[1] - 2.2);
    loot.add('Wooden chest', 1, item('wooden_chest', 'map-ground'), STASH[0] + .2, STASH[1] + .5);
    loot.add('Crate', age, build('crate'), STASH[0] - 1, STASH[1], 'wood');
    loot.add('Grain sacks', age + 1, build('sacks'), STASH[0] + 1.3, STASH[1] - .3, 'food');
    if (age > 1) loot.add('Barrel', 1, build('barrel'), STASH[0] - .1, STASH[1] - .7, 'wood');
    loot.add('Dried meat', [6, 14, 24][age - 1], item('dried_meat', k.heap(age)), RACK[0] + 1.2, RACK[1] + .5, 'food');
    if (age > 1) loot.add('Cured wolf hide', age * 2, item('cured_wolf_hide', k.heap(age - 1)), HUTS[1][0] + 1.6, HUTS[1][1] + .6, 'hide');
    if (age > 1) loot.add('Goblin hooked spear', age, item('goblin_hooked_spear', 'map-lean'), HUTS[0][0] + 1.4, HUTS[0][1] + .4, 'wood');
    if (age > 2) { loot.add('Native gold', 5, item('native_gold', 'map-pile-1'), STASH[0] + .9, STASH[1] + 1); put(LAIR_PROPS.skeleton(8, decay), GATE[0] + 1.6, GATE[1] - 1.5); }
    LAIR.regrow(k, 17.2, 16.6, 5.4, 3.2, 53, ['scrub', 'flowers', 'bush'], 'birch', [FIRE, RACK, STASH, [STASH[0] + 1, STASH[1] + .6], GATE, ...HUTS]);
    if (decay > 2) put(LAIR_PROPS.sapling(5, 'birch'), HUTS[1][0] + .1, HUTS[1][1] - .15);
    if (!cleared) return;
    const dead = [[FIRE[0] - 1.4, FIRE[1] + .6], [GATE[0] - .4, GATE[1] + .6], [MATS[0][0], MATS[0][1]], [FIRE[0] + 2.6, FIRE[1] - .8], [MATS[1][0], MATS[1][1]], [STASH[0] + 2.2, STASH[1] - .6]].slice(0, age * 2);
    dead.forEach((d, i) => { const o = put(item('goblin_carcass', 'map-pile-1'), d[0], d[1]); if (!i) loot.push({ name: 'Goblin carcass', n: dead.length, o }); });
  }

  function cast(R, k) {
    const smoke = [FIRE[0], FIRE[1] - .7], post = { kind: 'oak', at: [9.4, 12.2], seed: 2 };
    if (k.vacant) return k.decay ? { post } : { smoke, post };
    const { age } = k, F = { face: 'f' }, T0 = time.sec(19.5);
    R.add(LAIR.pawn('goblin', { tool: 'spear' }), [GATE[0] - .2, GATE[1] + .7], 'Gate sentry').state('On watch').act('look', 22, F).act('guard', 3, { flip: 0 }).act('look', 30, F).act('guard', 3, { flip: 0 }).rest('look', F);
    const prey = R.add(LAIR.quad('boar'), [32.6, 18.9]), bones = R.add(LAIR.prop(LAIR_PROPS.ribs(6)), [32.6, 18.9]);
    const hunters = [[MATS[0], [FIRE[0] - 1.5, FIRE[1] + .5], 0, -.5], [MATS[1], [FIRE[0] + 1.5, FIRE[1] - .6], 1, .5]].map(([mat, seat, flip, dy], i) => {
      const b = R.add(LAIR.pawn('goblin', i ? { tool: 'torch' } : null), mat, 'Goblin raider').state('Sleeping').until(17.4 + i * .1, 'sleep').state('Waking').act('tired', 3.2, F).go([seat], 30, 'walk')
        .state('Eating').untilT(T0 + i * .4, 'eat', { flip }).state('Hunting').go([[GATE[0], GATE[1] + dy * .4], [29.6, 18.4 + dy]], 34, 'walk').go([[31.5, 18.8 + dy]], 11, 'stalk');
      return b;
    });
    const strike = Math.max(hunters[0].t, hunters[1].t) + .3;
    hunters.forEach((b, i) => {
      b.untilT(strike, 'guard', { flip: 0 }).state('Attacking').act(i ? 'guard' : 'attack', .85, { flip: 0 }).act('attack', .85).state('Butchering').act('gather', 2.6)
        .state('Carrying game home').go([[GATE[0], GATE[1] + (i ? .3 : -.2)], [RACK[0] - .9 + i * 1.7, RACK[1] + .2]], 27, 'lug').state('Stocking the rack').act('gather', 1.4, { flip: i })
        .state('Resting').go([[FIRE[0] + (i ? 1.5 : -1.5), FIRE[1] + (i ? -.6 : .5)]], 30, 'walk').act('warm', 3, { flip: i }).state('Returning').go([[MATS[i][0], MATS[i][1]]], 30, 'walk').state('Sleeping').rest('sleep');
    });
    prey.state('Foraging').untilT(strike + .3, 'graze', { flip: 1 }).state('Dead').act('hit', .45).act('hit', .45).act('fall', .9).untilT(strike + 4.3, 'down').hideUntilT(60).jump([57.4, 19.4]).state('Returning').go([[44, 19], [32.6, 18.9]], 96, 'trot').state('Foraging').rest('graze', { flip: 1 });
    bones.hideUntilT(strike + 4.3).untilT(60, 'still').rest();
    for (let i = 0; i < 2; i++) {
      const s = [[34.3, 20.5], [35, 17.9]][i];
      R.add(LAIR.quad('boar'), s).state('Foraging').untilT(strike + .2 + i * .1, i ? 'sniff' : 'graze', { flip: i }).state('Startled').act('alert', .45).state('Fleeing').go([[43 + i, 16.4 + i * 2]], 150, 'run')
        .state('Watching').act('watch', 4, { flip: 1 }).untilT(61, 'graze').state('Returning').go([s], 36, 'walk').state('Foraging').rest(i ? 'sniff' : 'graze', { flip: i });
    }
    R.add(LAIR.pawn('gobboss'), [STASH[0] + 1.8, STASH[1] - .1], 'Goblin boss').state('Counting the stash').until(18, 'sit', { flip: 1 }).state('Eating').go([[FIRE[0] - .3, FIRE[1] + 1.2]], 28, 'walk').untilT(T0 - 1, 'talk', { flip: 0 })
      .untilT(T0 + 6, 'listen').state('Resting').until(23, 'warm', { flip: 0 }).state('Returning').go([[STASH[0] + 1.8, STASH[1] - .1]], 28, 'walk').rest('sit', { flip: 1 });
    if (age > 1) {
      const ring = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2 + 1.2; ring.push([17 + Math.cos(a) * 6, 16.5 + Math.sin(a) * 4]); }
      const walker = R.add(LAIR.pawn('goblin', { tool: 'torch' }), ring[0], 'Night walker').state('Sleeping by day').hideUntil(19.6).state('Walking the ring');
      walker.go(ring.slice(1, 7), 30, 'walk').act('look', 3, F).go(ring.slice(7), 30, 'walk').act('look', 2.4, F).state('Sleeping by day').rest();
      R.add(LAIR.pawn('goblin'), MATS[2], 'Goblin raider').state('Sleeping').until(18.2, 'sleep').state('Waking').act('tired', 3.2, F).go([[FIRE[0] + .4, FIRE[1] + 1.5]], 30, 'walk').state('Eating').until(21.4, 'eat', { flip: 1 })
        .state('Resting').until(24, 'warm', { flip: 1 }).state('Returning').go([MATS[2]], 30, 'walk').state('Sleeping').rest('sleep');
    }
    if (age > 2) R.add(LAIR.pawn('kobold'), [GATE[0] + .5, GATE[1] - 1.2], 'Cave kobold').state('On watch').act('guard', 20, { flip: 0 }).act('look', 8, F).rest('guard', { flip: 0 });
    return { smoke, post };
  }

  return {
    name: 'Goblin warren', size: [56, 32], seed: 53, home: [17, 16.3], cam: [27, 16.5], ring: 8.6, time, place, cast,
    who: ['a boss and three raiders', 'a boss and five raiders', 'a boss, five raiders and a kobold'],
    ground(x, y, n, n2, age, decay) {
      const d = Math.hypot((x - 17) / 7.4, (y - 16.3) / 5.2) + (n - .5) * .35;
      if (d < .82) return n2 > [.34, .34, .6, .88][decay] ? 'dirt' : decay > 2 && n2 > .42 ? 'tall_grass' : 'grass';
      if (d < 1.1) return n2 < .5 ? 'grass' : 'tall_grass';
      if (x + (n - .5) * 9 < 12) return n2 < .5 ? 'tree' : 'deep_grass';
      return n2 < .34 ? 'grass' : n2 < .68 ? 'tall_grass' : 'deep_grass';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'tree') return h < .34 ? ['tree', h2 < .5 ? 'oak' : h2 < .8 ? 'birch' : 'ash'] : h2 < .07 ? ['plant', 'bush'] : h2 < .1 ? ['plant', 'stump'] : null;
      if (gid === 'deep_grass') return h < .06 ? ['tree', h2 < .6 ? 'oak' : 'birch'] : h2 < .06 ? ['plant', 'bush'] : h2 < .09 ? ['plant', 'berry'] : null;
      return h < .014 ? ['tree', 'birch'] : h2 < .03 ? ['plant', 'scrub'] : h2 < .05 ? ['plant', 'stump'] : h2 < .065 ? ['plant', 'flowers'] : null;
    },
    parts: [
      { at: [HUTS[1][0], HUTS[1][1] - 1.2], name: 'Huts', note: 'Hide over bent poles. One more for every few goblins.' },
      { at: [FIRE[0], FIRE[1] - .6], name: 'Fire', note: 'Lit day and night. They eat here at dusk.' },
      { at: [STASH[0], STASH[1] - .9], name: 'Stash', note: 'Filled when the warren is founded. It grows only by what a raid takes.' },
      { at: [GATE[0], GATE[1] - .2], name: 'Stakes and gate', note: 'One way in. A sentry stands at it day and night.' },
      { at: [RACK[0], RACK[1] - 1.1], name: 'Rack', note: 'Game from the night’s hunt hangs here.' },
      { at: [GATE[0] + .3, GATE[1] - 3.6], name: 'Totem', note: 'Tells you whose ground this is.', from: 2 },
    ],
    day: [[15, 17.4, 'Sleep', 'rest'], [17.4, 19.5, 'Eat', 'feed'], [19.5, 24.6, 'Hunt', 'hunt'], [24.6, 27, 'Fire', 'wake'], [27, 39, 'Sleep', 'rest']],
    rules: ['A sentry holds the gate day and night. Everyone else sleeps through the day.', 'They eat at the fire at dusk. After dark a party hunts inside the warren’s range and carries the game home.', 'The stash is filled once, when the warren is founded. It grows only by what its raiders take from a colony.', 'A raid is a party that walks from this gate to your stores and back. Nothing arrives from the map edge.', 'Drop the sentry quietly by day and the sleepers stay asleep.'],
    needs: ['Watch and sleep shifts by the clock.', 'Mobs that carry what they kill or take. Kobolds already carry a steal flag that nothing reads.', 'A stash container whose contents are rolled once.', 'A lair laid down as one stamp: huts, stakes, a gate.'],
  };
})();
