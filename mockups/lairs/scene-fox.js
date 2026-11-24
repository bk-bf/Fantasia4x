'use strict';
LAIR_SCENES.fox = (() => {
  const time = LAIR.clock([[0, 17], [6, 18.4], [14, 19.4], [38, 20.6], [52, 22], [72, 41]]);
  const EARTH = [15.6, 14.1], HOLES = [[15.2, 14.15], [15.95, 14.15], [16.45, 14.15]], DROP = [17.7, 15.9], CACHE = [21.4, 20.4], WARREN = [33.6, 18.9], SPOILS = [12.4, 16.6];
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));
  const dead = kind => frameOf(SMALL.small(kind), { anim: 'down', u: .5, t: 0 }, 3, false).s;

  function place(k) {
    const { put, bare, age, cleared, decay, loot } = k;
    bare(16, 15.6, 3.6); bare(DROP[0], DROP[1], 1.8); bare(CACHE[0], CACHE[1], 1.2); bare(32.6, 18.6, 3.6); bare(43, 19, 4);
    put(SMALL_PROPS.earth(4, decay), EARTH[0], EARTH[1]);
    loot.add('Small bones', [5, 12, 26][age - 1], item('small_bones', k.heap(age)), DROP[0] + 1.3, DROP[1] - .9, 'bone');
    loot.add('Rabbit pelt', [1, 2, 4][age - 1], item('rabbit_pelt', 'map-pile-' + Math.min(3, age)), DROP[0] - .6, DROP[1] + .9, 'hide');
    if (age > 1) { loot.add('Chicken feathers', 3, item('chicken_feathers', 'map-pile-1'), DROP[0] + 2.1, DROP[1] + .4, 'hide'); loot.add('Disturbed earth', 1, LAIR.sprite('site/buried_hoard/summer-0'), CACHE[0], CACHE[1]); }
    if (age > 2) {
      loot.add('Hide boots', 1, item('hide_boots', 'map-ground'), SPOILS[0], SPOILS[1], 'hide');
      loot.add('Leather knapsack', 1, item('leather_knapsack', 'map-ground'), SPOILS[0] + 1.2, SPOILS[1] + .5, 'hide');
      loot.add('Tooth necklace', 1, item('tooth_necklace', 'map-ground'), SPOILS[0] - .4, SPOILS[1] + 1.1);
    }
    LAIR.regrow(k, 16.2, 16.2, 2.8, 1.5, 23, ['fern', 'flowers', 'bush'], 'birch', [EARTH]);
    if (!cleared) return;
    const n = [1, 2, 2][age - 1];
    loot.push({ name: age > 2 ? 'Silver fox carcass' : 'Fox carcass', n: 1, o: put(dead(age > 2 ? 'silver_fox' : 'fox'), 14.4, 15.9) });
    if (n > 1) loot.push({ name: 'Fox carcass', n: 1, o: put(dead('fox'), 17.4, 16.6) });
  }

  function cast(R, k) {
    const post = { kind: 'oak', at: [13.4, 13.2], seed: 4 };
    if (k.vacant) return { post };
    const { age } = k, charge = 25.5, kill = [32.2, 18.45];
    const vixen = R.add(SMALL.small('fox'), [14.4, 15.5], 'Vixen'), meal = R.add(SMALL.kill('rabbit'), [DROP[0] - .6, DROP[1] + .05]), prey = R.add(LAIR.critter('rabbit'), kill);
    vixen.state('Sleeping').until(18.3, 'sleep', { flip: 0 }).state('Waking').act('shake', 1.1).act('sniff', 1.4)
      .state('Setting out').go([[21, 16.6], [26.5, 17.4]], 52, 'trot').state('Stalking').go([[29.6, 17.9]], 13, 'stalk').state('Watching').untilT(charge, 'crouch', { flip: 0 })
      .state('Attacking').go([[31.6, 18.4]], 170, 'run');
    const caught = vixen.t;
    vixen.act('bite', .7).state('Killing').act('worry_rabbit', 1.8).state('Carrying the kill home').go([[24.4, 17.4], [DROP[0] + .5, DROP[1]]], 46, 'carry_rabbit')
      .state('Calling the kits').act('hold_rabbit', 1.4, { flip: 1 });
    const dropped = vixen.t, eaten = time.sec(21.7);
    vixen.state('Eating').untilT(dropped + 6, 'feed', { flip: 1 }).state('Watching the kits').go([[19.2, 15.2]], 30, 'walk').untilT(eaten + 1, 'sit', { flip: 1 })
      .state('Going to ground').go([HOLES[1]], 30, 'walk').hide(.01).hideUntil(40.2).jump([14.4, 15.5]).state('Sleeping').rest('sleep', { flip: 0 });
    R.add(SMALL.kill('rabbit'), [kill[0] + .1, kill[1] + .02]).hideUntilT(caught + .3).untilT(caught + .7, 'still').hideUntilT(time.period - .05);
    meal.hideUntilT(dropped).untilT(eaten, 'still').hideUntilT(time.period - .05);
    prey.state('Foraging').act('idle', 6, { flip: 1 }).act('up', 2.6).untilT(charge - 1, 'idle', { flip: 1 }).state('Startled').untilT(caught + .3, 'up').hideUntilT(48).jump([57.3, 19.6]).state('Returning').go([[45, 19.4], kill], 64, 'hop').state('Foraging').rest('idle', { flip: 1 });
    [[34.4, 19.6, [42.4, 20.8]], [35.4, 18.2, [44, 17.6]], [33.2, 20.2, [40.6, 22.1]]].slice(0, age + 1).forEach(([x, y, far], i) => {
      R.add(LAIR.critter('rabbit'), [x, y]).state('Foraging').act('idle', 7 + i, { flip: i & 1 }).act('up', 2.6).untilT(charge + .1 + i * .1, 'idle').state('Fleeing').go([far], 140, 'bolt')
        .state('Hiding').untilT(44 + i * 2, 'idle', { flip: 1 }).state('Returning').go([[x, y]], 40, 'hop').state('Foraging').rest('idle', { flip: i & 1 });
    });
    for (let i = 0; i < 3; i++) {
      const s = [[27.6, 12.4], [28.9, 12.9], [26.4, 13.1]][i], b = R.add(LAIR.critter('fowl'), s, 'Junglefowl').state('Foraging');
      for (let n = 0; n < 4; n++) b.act('peck', 3 + i, { flip: (n + i) & 1 }).go([n & 1 ? s : [s[0] + .8, s[1] + .3]], 9, 'walk');
      b.until(20.9 + i * .1, 'peck').state('Roosting').rest('idle', { flip: i & 1 });
    }
    if (age < 2) return { post };

    const sire = age > 2 ? 'silver_fox' : 'fox';
    R.add(SMALL.small(sire), [12.8, 16.2], age > 2 ? 'Silver fox' : 'Dog-fox').state('Sleeping').until(18.8, 'sleep', { flip: 0 }).state('Waking').act('shake', 1.1)
      .state('Mousing').go([[20.2, 19.6], [24.2, 21.4]], 48, 'trot').act('sniff', 1.6).state('Listening').act('crouch', 1.6, { flip: 0 }).state('Pouncing').go([[25.45, 21.4]], 40, 'pounce')
      .state('Killing').act('worry_rat', .9).state('Caching the kill').go([[CACHE[0] + .9, CACHE[1]]], 44, 'carry_rat').act('dig', 2.8, { flip: 1 }).act('sniff', 1.2)
      .state('Mousing').go([[26.4, 22.2]], 32, 'walk').act('crouch', 1.8, { flip: 0 }).state('Pouncing').go([[27.65, 22.2]], 40, 'pounce').act('sniff', 1.4)
      .state('Returning').go([[19.4, 17]], 40, 'trot').state('Eating').untilT(eaten, 'feed', { flip: 1 }).state('Guarding the earth').go([[13.2, 15.8]], 30, 'walk').until(26.5, 'sit', { flip: 0 })
      .state('Sleeping').rest('sleep', { flip: 0 });

    const kits = [[[17.2, 17.2], [18.6, 17.8], [16.2, 15.6], [17.6, 16.35]], [[15.4, 17.6], [16.6, 18.4], [15.6, 15.5], [17, 15.4]], [[18.6, 16.6], [17.4, 18.2], [16.9, 15.6], [18.35, 16.55]], [[16.4, 18.4], [14.6, 17.8], [15, 15.6], [16.6, 16.25]]].slice(0, age + 1);
    kits.forEach(([spot, swap, door, seat], i) => {
      const hole = HOLES[i % 3], b = R.add(SMALL.small('fox_kit'), hole, 'Fox kit').hideUntil(18.6 + i * .12).state('Playing').go([spot], 40, 'walk');
      for (let n = 0; n < 2; n++) b.act('idle', .8 + i * .3, { flip: i & 1 }).go([swap], 80, 'run').act('bite', .7, { to: spot }).go([[swap[0] + .9, swap[1]]], 36, 'pounce').go([spot], 70, 'run').act('sit', .8 + i * .2);
      b.untilT(caught + 2, 'sit', { flip: 0 }).state('Waiting at the earth').go([door], 30, 'walk').untilT(dropped - .3, 'sit', { flip: 0 }).state('Eating').go([seat], 60, 'run')
        .untilT(eaten, 'feed', { flip: seat[0] > DROP[0] - .6 ? 1 : 0 }).state('Going to ground').go([hole], 34, 'walk').hideUntilT(time.period - .05);
    });
    return { post };
  }

  return {
    name: 'Fox earth', size: [56, 32], seed: 23, home: [16.2, 15.6], cam: [23, 16.4], ring: 5.6, time, place, cast,
    who: ['a vixen', 'a vixen, a dog-fox and three kits', 'a vixen, an old silver fox and four kits'],
    ground(x, y, n, n2, age, decay) {
      const fx = x + (n - .5) * 8, fy = y + (n2 - .5) * 6;
      const yard = LAIR.yard(Math.hypot(x - 16.2, (y - 15.7) * 1.6), 2.6 + n2 * 1.2, decay, 'dirt', 'deep_grass') || LAIR.yard(Math.hypot(x - DROP[0], (y - DROP[1]) * 1.6), 1.2 + n2, decay, 'dirt', 'tall_grass');
      if (yard) return yard;
      if (fy < 12.4 || fx < 11.5) return n2 < .5 ? 'tree' : n2 < .74 ? 'mossy_ground' : 'deep_grass';
      if (fy > 19.6 && fx > 20) return n2 < .7 ? 'deep_grass' : 'tall_grass';
      return n2 < .34 ? 'grass' : n2 < .66 ? 'tall_grass' : 'deep_grass';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'tree') return h < .36 ? ['tree', h2 < .45 ? 'oak' : h2 < .8 ? 'birch' : 'pine'] : h2 < .06 ? ['plant', 'fern'] : h2 < .09 ? ['plant', 'bush'] : null;
      if (gid === 'mossy_ground') return h < .2 ? ['tree', 'oak'] : h2 < .08 ? ['plant', 'fern'] : h2 < .12 ? ['plant', 'berry'] : null;
      if (gid === 'deep_grass') return h < .02 ? ['tree', 'birch'] : h2 < .05 ? ['plant', 'bush'] : h2 < .08 ? ['plant', 'flowers'] : null;
      return h < .008 ? ['tree', 'oak'] : h2 < .04 ? ['plant', 'flowers'] : null;
    },
    parts: [
      { at: [EARTH[0], EARTH[1] - 1.2], name: 'Earth', note: 'Three holes into one bank. The kits are born below and rarely stray far.' },
      { at: [DROP[0], DROP[1] - .5], name: 'Feeding ground', note: 'Kills are carried here and the kits eat in the open, by a hole.' },
      { at: [WARREN[0] - 1, WARREN[1] - 1], name: 'Hunting ground', note: 'Rabbits and fowl inside the earth’s range.' },
      { at: [25, 21], name: 'Long grass', note: 'Rats and voles, heard before they are seen.', from: 2 },
      { at: CACHE, name: 'Cache', note: 'A kill buried for leaner nights.', from: 2 },
      { at: [SPOILS[0], SPOILS[1] - .4], name: 'Spoils', note: 'Things carried off from somebody’s camp.', from: 3 },
    ],
    day: [[17, 18.4, 'Rest', 'rest'], [18.4, 19.4, 'Wake', 'wake'], [19.4, 20.6, 'Hunt', 'hunt'], [20.6, 22, 'Feed', 'feed'], [22, 41, 'Sleep', 'rest']],
    rules: ['The foxes sleep through the day and come out at dusk.', 'A fox hunts alone and only small game: rabbits, fowl, rats in the long grass.', 'A kill is carried home in the jaws, and the kits eat at the earth.', 'What is not eaten is buried and dug up later.', 'Cornered at the earth, a fox goes down a hole rather than fight.'],
    needs: ['A mob that carries a small kill in its mouth instead of eating where it falls.', 'Caching: bury food at a spot and come back to it.', 'Young that stay at the lair and are fed there.', 'Prey search bound to the earth’s range.', 'A lair laid down as one stamp: earth, feeding ground, cache.'],
  };
})();
