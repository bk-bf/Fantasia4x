'use strict';
LAIR_SCENES.stoat = (() => {
  const time = LAIR.clock([[0, 6], [6, 7.6], [44, 10.4], [56, 12.5], [72, 30]]);
  const HOLT = [15.6, 14.3], HOLES = [[14.9, 14.4], [15.6, 14.45], [16.2, 14.4]], DROP = [17.6, 15.9], DANCE = [24.6, 17.3], KILL = [26.4, 17.45], ROOST = [21.6, 12.6];
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));
  const dead = kind => frameOf(SMALL.small(kind), { anim: 'down', u: .5, t: 0 }, 3, false).s;

  function place(k) {
    const { put, bare, age, cleared, decay, loot } = k;
    bare(16, 15.4, 3.2); bare(DROP[0], DROP[1], 1.6); bare(26, 17.6, 3.4);
    put(SMALL_PROPS.holt(6, decay), HOLT[0], HOLT[1]);
    loot.add('Small bones', [6, 14, 30][age - 1], item('small_bones', k.heap(age)), DROP[0] + 1.2, DROP[1] - .7, 'bone');
    loot.add('Rabbit pelt', [1, 2, 3][age - 1], item('rabbit_pelt', 'map-pile-' + Math.min(3, age)), DROP[0] - .4, DROP[1] + .9, 'hide');
    if (age > 1) loot.add('Rat pelt', 2, item('rat_pelt', 'map-pile-1'), 13.6, 15.6, 'hide');
    if (age > 2) loot.add('Chicken feathers', 3, item('chicken_feathers', 'map-pile-2'), DROP[0] + 2.2, DROP[1] + .5, 'hide');
    LAIR.regrow(k, 16, 15.6, 2.6, 1.3, 67, ['scrub', 'flowers', 'fern'], 'birch', [HOLT, DROP]);
    if (!cleared) return;
    loot.push({ name: age > 2 ? 'Marten carcass' : 'Stoat carcass', n: age > 1 ? 2 : 1, o: put(dead(age > 2 ? 'pine_marten' : 'stoat'), 14.6, 15.8) });
  }

  function cast(R, k) {
    const post = { kind: 'birch', at: [12.4, 13.2], seed: 3 };
    if (k.vacant) return { post };
    const { age } = k, jill = R.add(SMALL.small('stoat'), HOLES[1], age > 1 ? 'Jill' : 'Stoat');
    const prey = R.add(LAIR.critter('rabbit'), KILL, 'Cottontail'), meal = R.add(SMALL.kill('rabbit'), [DROP[0] - .55, DROP[1] + .05]);
    jill.state('In the holt').hideUntil(7.1).state('Looking out').act('stand', 2.4, { flip: 0 }).state('Hunting').go([[21.2, 16.4]], 70, 'bound').act('stand', 2.4, { flip: 0 })
      .go([DANCE], 56, 'bound');
    const danced = jill.t;
    jill.state('Dancing').act('dance', 7.2, { flip: 0 }).state('Attacking').go([[KILL[0] - .5, KILL[1]]], 150, 'bound');
    const caught = jill.t;
    jill.act('bite', .7).act('bite', .7).state('Killing').act('worry_rabbit', 1.2);
    const dragged = jill.t;
    jill.state('Dragging the kill home').go([[21, 16.6], [DROP[0] + .45, DROP[1]]], 24, 'drag_rabbit').state('Calling the kits').act('hold_rabbit', 1, { flip: 1 });
    const home = jill.t, eaten = time.sec(12.2);
    jill.state('Eating').untilT(home + 7, 'feed', { flip: 1 }).state('On watch').go([[18.6, 15.1]], 30, 'walk').act('stand', 2.4, { flip: 0 }).untilT(eaten + 1, 'sit', { flip: 1 })
      .state('In the holt').go([HOLES[1]], 30, 'walk').hideUntilT(time.period - .05);
    R.add(SMALL.kill('rabbit'), [KILL[0] + .1, KILL[1] + .02]).hideUntilT(caught + .5).untilT(dragged, 'still').hideUntilT(time.period - .05);
    meal.hideUntilT(home + 1).untilT(eaten, 'still').hideUntilT(time.period - .05);
    prey.state('Foraging').untilT(danced - 1, 'idle', { flip: 1 }).state('Watching the dance').untilT(caught, 'up', { flip: 1 }).state('Caught').untilT(caught + .5, 'idle', { flip: 1 }).hideUntilT(58)
      .jump([40, 18.4]).state('Returning').go([KILL], 50, 'hop').state('Foraging').rest('idle', { flip: 1 });
    [[27.6, 18.4, [36, 20.4]], [28.4, 16.6, [37, 15.2]], [27.2, 16.2, [34.8, 13.8]], [29.2, 17.8, [38.4, 18.6]]].slice(0, age + 1).forEach(([x, y, far], i) => {
      R.add(LAIR.critter('rabbit'), [x, y]).state('Foraging').untilT(danced + .6 + i * .3, 'idle', { flip: 1 }).state('Watching the dance').untilT(caught + .05 * i, 'up', { flip: 1 }).state('Fleeing').go([far], 140, 'bolt')
        .state('Hiding').untilT(50 + i * 2, 'idle', { flip: 0 }).state('Returning').go([[x, y]], 40, 'hop').state('Foraging').rest('idle', { flip: 1 });
    });
    if (age < 2) return { post };

    const kits = [[[17.4, 17], [16.2, 17.6]], [[18.6, 16.6], [17.4, 15.2]], [[16.4, 16.4], [18.8, 15.4]], [[17.8, 17.4], [16.8, 14.9]]].slice(0, age + 1);
    kits.forEach(([seat, play], i) => {
      R.add(SMALL.small('stoat_kit'), HOLES[i % 3], 'Stoat kit').hideUntilT(home + .4 + i * .3).state('Eating').go([seat], 50, 'bound').untilT(home + 8 + i * .5, 'feed', { flip: seat[0] > DROP[0] - .55 ? 1 : 0 })
        .state('Playing').go([play], 70, 'bound').act('bite', .7, { to: seat }).go([seat], 70, 'bound').act('dance', 1.8).go([play], 60, 'bound').act('bite', .7, { to: seat }).untilT(eaten, 'sit', { flip: i & 1 })
        .state('In the holt').go([HOLES[i % 3]], 40, 'bound').hideUntilT(time.period - .05);
    });
    if (age < 3) return { post };

    const fowl = R.add(LAIR.critter('fowl'), ROOST, 'Junglefowl'), marten = R.add(SMALL.small('pine_marten'), [13.4, 15.4], 'Pine marten'), strike = time.sec(9.4);
    marten.state('Sleeping').until(8.4, 'sleep', { flip: 0 }).state('Waking').act('shake', 1.1).state('Hunting').go([[18.4, 13.6]], 40, 'walk').go([[ROOST[0] - 1.6, ROOST[1] + .1]], 14, 'stalk')
      .untilT(strike, 'crouch', { flip: 0 }).state('Attacking').go([[ROOST[0] - .55, ROOST[1]]], 150, 'run');
    const took = marten.t;
    marten.act('bite', .7).state('Carrying the kill home').go([[17, 14.9], [13.4, 15.4]], 44, 'carry_fowl').state('Eating').untilT(time.sec(11.6), 'feed', { flip: 1 })
      .state('Sleeping').rest('sleep', { flip: 0 });
    fowl.state('Foraging');
    while (fowl.t < strike - 3) fowl.act('peck', 1.6, { flip: 1 }).act('idle', 1);
    fowl.untilT(took + .2, 'peck', { flip: 1 }).hideUntilT(60).jump([ROOST[0] + 6, ROOST[1]]).state('Returning').go([ROOST], 20, 'walk').state('Foraging').rest('peck', { flip: 1 });
    return { post };
  }

  return {
    name: 'Stoat holt', size: [56, 32], seed: 67, home: [16, 15.2], cam: [22.4, 15.8], ring: 4.4, turf: P.grassLoam, time, place, cast,
    who: ['a stoat', 'a jill and three kits', 'a pine marten, a jill and four kits'],
    ground(x, y, n, n2, age, decay) {
      const fx = x + (n - .5) * 8, fy = y + (n2 - .5) * 6;
      const yard = LAIR.yard(Math.hypot(x - 16, (y - 15.3) * 1.5), 2.4 + n2, decay, 'dirt', 'tall_grass') || LAIR.yard(Math.hypot(x - DROP[0], (y - DROP[1]) * 1.6), 1.1 + n2 * .8, decay, 'dirt', 'tall_grass');
      if (yard) return yard;
      if (fy < 11.6 || fx < 10.5) return n2 < .5 ? 'tree' : 'mossy_ground';
      if (fx < 21 && n2 < .3) return 'mossy_ground';
      return n2 < .42 ? 'grass' : n2 < .74 ? 'tall_grass' : 'deep_grass';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'tree') return h < .34 ? ['tree', h2 < .5 ? 'birch' : h2 < .8 ? 'oak' : 'pine'] : h2 < .06 ? ['plant', 'fern'] : null;
      if (gid === 'mossy_ground') return h < .1 ? ['tree', 'birch'] : h2 < .07 ? ['rock', 'boulder'] : h2 < .1 ? ['plant', 'fern'] : h2 < .12 ? ['plant', 'scrub'] : null;
      return h < .006 ? ['tree', 'oak'] : h2 < .04 ? ['plant', 'flowers'] : h2 < .06 ? ['plant', 'bush'] : null;
    },
    parts: [
      { at: [HOLT[0], HOLT[1] - 1.4], name: 'Holt', note: 'Gaps between old stones, too narrow for anything larger.' },
      { at: [DROP[0], DROP[1] - .5], name: 'Feeding ground', note: 'A kill larger than the hunter is dragged here.' },
      { at: [KILL[0], KILL[1] - 1], name: 'Warren', note: 'Rabbits inside the holt’s range.' },
      { at: [21.8, 12.2], name: 'Fowl run', note: 'Junglefowl at the wood’s edge.', from: 3 },
    ],
    day: [[6, 7.1, 'Rest', 'rest'], [7.1, 8.8, 'Hunt', 'hunt'], [8.8, 10.4, 'Feed', 'feed'], [10.4, 12.5, 'Watch', 'wake'], [12.5, 30, 'Rest', 'rest']],
    rules: ['The stoats keep to the holt and hunt in short bursts by day.', 'It takes rabbits larger than itself, and drags the kill home.', 'Near the warren it leaps and twists until the rabbits stop to stare, then strikes at the neck.', 'The young are fed at the holt and play in the open.', 'Too small to fight a person. It is gone into the stones at a footstep.'],
    needs: ['A mob that drags prey heavier than itself.', 'A hunt with a lure: prey that stops and watches instead of fleeing.', 'Young that stay at the lair and are fed there.', 'A lair laid down as one stamp: holt and feeding ground.'],
  };
})();
