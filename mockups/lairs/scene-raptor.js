'use strict';
LAIR_SCENES.raptor = (() => {
  const time = LAIR.clock([[0, 4.5], [6, 6], [46, 9], [58, 11], [64, 18], [68, 20.5], [72, 28.5]]);
  const EYRIE = [15, 14.6], H = 84, POST = [20.2, 17.4], FIELD = [31, 15.6], KILL = [31.2, 15.8], SKY = 96, PERCH = [14.95, 14.66];
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));

  function place(k) {
    const { put, bare, age, cleared, decay, loot } = k;
    bare(15.2, 15.6, 3.2); bare(POST[0], POST[1] + .4, 2); bare(31, 16.2, 4.4); bare(43, 17, 4);
    put(SMALL_PROPS.eyrie(3, H + (age - 2) * 6, decay), EYRIE[0], EYRIE[1]);
    put(SMALL_PROPS.post(5, decay), POST[0], POST[1]);
    loot.add('Small bones', [4, 10, 22][age - 1], item('small_bones', k.heap(age)), EYRIE[0] + 1.1, EYRIE[1] + .6, 'bone');
    loot.add('Chicken feathers', [2, 5, 3][age - 1], item('chicken_feathers', 'map-pile-' + Math.min(3, age)), POST[0] + 1.2, POST[1] + .3, 'hide');
    if (age > 1) loot.add('Feathers', 4, item('feathers', 'map-pile-1'), EYRIE[0] - 1.2, EYRIE[1] + .7, 'hide');
    if (age > 2) loot.add('Rabbit pelt', 3, item('rabbit_pelt', 'map-pile-2'), POST[0] - 1.1, POST[1] + .5, 'hide');
    LAIR.regrow(k, 16, 15.8, 2.6, 1.4, 41, ['fern', 'flowers', 'scrub'], 'birch', [EYRIE, POST]);
    if (!cleared) return;
    const kind = age > 2 ? 'crag_eagle' : 'hawk', dead = frameOf(LAIR.raptor(kind, 0, 0), { anim: 'down', u: .5, t: 0 }, 3, false).s;
    loot.push({ name: age > 2 ? 'Eagle carcass' : 'Hawk carcass', n: age > 1 ? 2 : 1, o: put(dead, EYRIE[0] + 1.6, EYRIE[1] + 1.4) });
  }

  function cast(R, k) {
    const post = { kind: 'pine', at: [11.4, 13.4], seed: 2 };
    if (k.vacant) return { post };
    const { age } = k, big = age > 2, kind = big ? 'crag_eagle' : 'hawk', prey = big ? 'rabbit' : 'fowl', at = H + (age - 2) * 6 + 1, name = big ? 'Crag eagle' : 'Goshawk';
    const hunter = R.add(LAIR.raptor(kind, at, SKY, { prey, kill: prey, post: 9 }), PERCH, name);
    const target = R.add(big ? LAIR.critter('rabbit') : LAIR.critter('fowl'), KILL, big ? 'Cottontail' : 'Junglefowl');
    const ring = [];
    for (let i = 1; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI * 2.1; ring.push([FIELD[0] - .6 + Math.cos(a) * 3.6, FIELD[1] - 1.2 + Math.sin(a) * 1.9]); }
    const top = [KILL[0] - 3.35, KILL[1] - 1.15];
    hunter.state('Roosting').until(5.8, 'roost', { flip: 0 }).state('Waking').act('rouse', 1.2).act('cry', 1.4).state('Hunting').act('lift', .9).go([[22.4, 14]], 70, 'fly')
      .go([...ring, top], 80, 'glide').state('Stooping').go([[KILL[0] - .16, KILL[1]]], 118, 'stoop');
    const struck = hunter.t;
    hunter.state('Striking').act('strike', .7, { flip: 0 }).state('Mantling over the kill').act('mantle', 3).state('Carrying the kill').act('snatch', 1.1)
      .go([[POST[0] + .2, POST[1]]], 54, 'carry').act('landpost', 1, { flip: 1 }).state('Plucking').act('pluck', 7.8).state('Carrying the kill home').act('liftpost', 1).go([PERCH], 54, 'carry').act('settleprey', 1, { flip: 0 });
    const home = hunter.t;
    hunter.state(age > 1 ? 'Feeding the young' : 'Eating').untilT(home + 9, age > 1 ? 'feed' : 'eat').state('On the nest').until(12, 'idle').act('rouse', 1.2).until(16, 'idle').act('cry', 1.4).until(20.2, 'idle').state('Roosting').rest('roost');
    if (big) target.state('Foraging').untilT(struck - 2.6, 'idle', { flip: 0 }).act('up', 2.2).untilT(struck + .25, 'idle');
    else { target.state('Foraging'); while (target.t < struck - 3) target.act('peck', 1.5, { flip: 0 }).act('idle', 1, { flip: 0 }); target.untilT(struck + .25, 'peck'); }
    target.hideUntilT(52).jump(big ? [57.3, 16.4] : [40.4, 16.2]).state('Returning').go(big ? [[44, 16], KILL] : [KILL], big ? 60 : 22, big ? 'hop' : 'walk').state('Foraging').rest(big ? 'idle' : 'peck', { flip: 0 });

    const flock = [[29.8, 16.6], [32.6, 15.1], [33.4, 16.8], [30.4, 14.6]].slice(0, age + 1);
    flock.forEach((s, i) => {
      const far = [s[0] + 6 + i, s[1] + (i & 1 ? 2.4 : -2)], b = R.add(LAIR.critter(big && i & 1 ? 'rabbit' : 'fowl'), s), hop = big && i & 1;
      b.state('Foraging');
      while (b.t < struck - 2) b.act(hop ? 'idle' : 'peck', 1.4 + i * .2, { flip: i & 1 }).act('idle', .8);
      b.untilT(struck + .1 + i * .08, 'idle').state('Fleeing').go([far], hop ? 140 : 70, hop ? 'bolt' : 'flap').state('Hiding').untilT(44 + i * 2, 'idle', { flip: 1 }).state('Returning').go([s], hop ? 40 : 14, hop ? 'hop' : 'walk')
        .state('Foraging').until(20.4, hop ? 'idle' : 'peck').state('Roosting').rest('idle', { flip: i & 1 });
    });
    if (age < 2) return { post };

    const mate = R.add(LAIR.raptor(kind, at, SKY - 10, { prey, kill: prey, post: 9 }), [PERCH[0] + .32, PERCH[1] + .01], big ? 'Crag eagle' : 'Goshawk'), loop = [];
    for (let i = 1; i <= 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI * 2; loop.push([17 + Math.cos(a) * 6.4, 15 + Math.sin(a) * 2.8]); }
    mate.state('Roosting').until(6.4, 'roost', { flip: 1 }).state('Guarding the nest').until(7.6, 'idle', { flip: 1 }).act('cry', 1.4).state('Patrolling').act('lift', .9).go([...loop, [PERCH[0] + .32, PERCH[1] + .01]], 76, 'glide')
      .act('settle', .9, { flip: 1 }).state('Guarding the nest').untilT(home + 1, 'idle', { flip: 1 }).state('Eating').untilT(home + 9, 'eat', { flip: 1 }).state('On the nest').until(14, 'idle').act('cry', 1.4).until(20.4, 'idle').state('Roosting').rest('roost', { flip: 1 });
    [[PERCH[0] - .2, PERCH[1] + .02], [PERCH[0] + .14, PERCH[1] + .03]].slice(0, big ? 1 : 2).forEach((p, i) => {
      R.add(LAIR.raptor('hawk_eyas', at - 1, at), p, 'Eyas').state('Asleep').until(6.2 + i * .3, 'roost', { flip: i }).state('Waiting').untilT(home - 1.5, 'idle', { flip: i }).state('Begging').untilT(home + 9, 'beg', { flip: 0 })
        .state('Full').until(15 + i, 'roost', { flip: i }).state('Waiting').until(20 + i * .2, 'idle', { flip: i }).state('Asleep').rest('roost', { flip: i });
    });
    return { post };
  }

  return {
    name: 'Raptor eyrie', size: [56, 32], seed: 41, home: [15.2, 15.4], cam: [23, 15.2], ring: 6, turf: P.grassLoam, time, place, cast,
    who: ['a goshawk', 'a pair of goshawks and two eyasses', 'a pair of crag eagles and an eyas'],
    ground(x, y, n, n2, age, decay) {
      const fx = x + (n - .5) * 8, fy = y + (n2 - .5) * 5;
      const yard = LAIR.yard(Math.hypot(x - 15.2, (y - 15.4) * 1.5), 2.2 + n2, decay, 'mossy_ground', 'deep_grass') || LAIR.yard(Math.hypot(x - POST[0], (y - POST[1]) * 1.6), 1.2 + n2 * .8, decay, 'dirt', 'tall_grass');
      if (yard) return yard;
      if (fx < 19 || fy < 11) return n2 < .45 ? 'tree' : n2 < .72 ? 'mossy_ground' : 'deep_grass';
      return n2 < .4 ? 'grass' : n2 < .7 ? 'tall_grass' : 'savanna';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'tree') return h < .34 ? ['tree', h2 < .55 ? 'pine' : h2 < .85 ? 'oak' : 'birch'] : h2 < .06 ? ['plant', 'fern'] : null;
      if (gid === 'mossy_ground') return h < .14 ? ['tree', 'pine'] : h2 < .08 ? ['plant', 'fern'] : null;
      if (gid === 'deep_grass') return h < .02 ? ['tree', 'birch'] : h2 < .05 ? ['plant', 'bush'] : null;
      return h < .006 ? ['tree', 'oak'] : h2 < .04 ? ['plant', 'flowers'] : h2 < .06 ? ['plant', 'scrub'] : null;
    },
    parts: [
      { at: [EYRIE[0], EYRIE[1] - 2.6], name: 'Eyrie', note: 'A stick nest in a snag, out of reach. Used again every year.' },
      { at: [POST[0], POST[1] - .6], name: 'Plucking post', note: 'Every kill is stripped here before it goes up to the nest.' },
      { at: [FIELD[0], FIELD[1] - 1], name: 'Hunting ground', note: 'Fowl and rabbits in the open. It watches them from above.' },
      { at: [EYRIE[0] + 1.1, EYRIE[1] + .3], name: 'Castings', note: 'Bones and feathers dropped under the nest.', from: 2 },
    ],
    day: [[4.5, 6, 'Roost', 'rest'], [6, 7.8, 'Hunt', 'hunt'], [7.8, 10.5, 'Feed', 'feed'], [10.5, 20.5, 'Watch', 'wake'], [20.5, 28.5, 'Roost', 'rest']],
    rules: ['The pair roost at the eyrie by night and hunt in the morning.', 'It circles the open ground and drops on what it picks out.', 'The kill is held down where it falls, then carried to the plucking post and stripped.', 'What is left goes up to the nest for the young.', 'One bird stays by the nest while the young are in it.'],
    needs: ['Flying mobs that carry a kill in their talons.', 'A stoop: a dive from height onto one target.', 'A second spot in the lair where kills are prepared before the nest.', 'Sleep by the clock, at the nest.', 'A lair laid down as one stamp: eyrie and plucking post.'],
  };
})();
