'use strict';
LAIR_SCENES.harpies = (() => {
  const time = LAIR.clock([[0, 4.5], [5, 6], [40, 11], [50, 17], [58, 20], [70, 28.5]]);
  const SPIRES = [[15.6, 14.6, 52], [20.2, 13.4, 42], [11.4, 13.2, 60]], MIDDEN = [16.9, 15.8], GROUND = [13.4, 17.6], WARREN = [31.4, 19.2];
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));

  function place(k) {
    const { put, bare, age, cleared, loot } = k;
    bare(15.8, 15.4, 6); bare(24, 17, 3.4); bare(31.5, 19, 5); bare(41, 20, 4);
    SPIRES.slice(0, age).forEach((s, i) => put(LAIR_PROPS.spire(i + 3, s[2], !i), s[0], s[1]));
    loot.add('Small bones', [8, 20, 46][age - 1], item('small_bones', 'map-pile-' + age), MIDDEN[0], MIDDEN[1]);
    loot.add('Tooth necklace', 1, item('tooth_necklace', 'map-ground'), MIDDEN[0] - 1.1, MIDDEN[1] + .4);
    if (age > 1) { loot.add('Citrine', 2, item('citrine', 'map'), MIDDEN[0] + 1.2, MIDDEN[1] + .5); loot.add('Large bones', 9, item('large_bones', 'map-pile-1'), MIDDEN[0] + 2.4, MIDDEN[1] - .3); }
    if (age > 2) {
      loot.add('Matron’s hoard', 7, LAIR_PROPS.groundNest(4, true), GROUND[0], GROUND[1]);
      loot.add('Bronze torc', 1, item('bronze_torc', 'map-ground'), GROUND[0] + 1.5, GROUND[1] + .3);
      loot.add('Gold bar', 2, item('gold_bar', 'map-pile-1'), GROUND[0] - 1.5, GROUND[1] + .4);
      put(LAIR_PROPS.skeleton(14), 19.4, 17.6);
      loot.add('Leather knapsack', 1, item('leather_knapsack', 'map-ground'), 20.6, 17.8);
    }
    if (!cleared) return;
    const dead = SPIRES.slice(0, age).map(s => [s[0] + 1.4, s[1] + .9]);
    dead.forEach((d, i) => { const o = put(item('harpy_carcass', 'map-pile-1'), d[0], d[1]); if (!i) loot.push({ name: 'Harpy carcass', n: dead.length + (age > 2 ? 1 : 0), o }); });
    if (age > 2) put(item('harpy_carcass', 'map-pile-2'), GROUND[0] + .3, GROUND[1] + 1);
  }

  function cast(R, k) {
    const post = { kind: 'dead', at: [24.4, 16.4], seed: 1 };
    if (k.cleared) return { post };
    const { age } = k, home = s => [s[0], s[1] + .08];
    const hunter = R.add(LAIR.harpy(SPIRES[0][2] + 2, SPIRES[0][2] + 14), home(SPIRES[0]), 'Screamer'), prey = R.add(LAIR.critter('rabbit'), WARREN);
    hunter.state('Roosting').until(5.9, 'roost').state('Waking').act('cry', 1.6).state('Hunting').act('lift', .9).go([[27.4, 17.6]], 84, 'fly');
    const ring = []; for (let i = 1; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI * 2; ring.push([WARREN[0] + .2 + Math.cos(a) * 3.2, WARREN[1] - .2 + Math.sin(a) * 1.8]); }
    hunter.go([...ring, [WARREN[0], WARREN[1] + .02]], 78, 'circle').state('Attacking').act('stoop', .8);
    const taken = hunter.t;
    hunter.state('Carrying the kill home').act('snatch', 1.1).go([home(SPIRES[0])], 74, 'carry').act('settleprey', .9).state('Eating').act('eat', 9).state('On the nest').until(16.5, 'idle')
      .act('cry', 1.6).until(19.6, 'idle').state('Roosting').rest('roost');
    prey.state('Foraging').act('idle', 6, { flip: 0 }).act('up', 2.6).untilT(taken - 3, 'idle').act('up', 2.6).untilT(taken, 'idle').hideUntilT(52).jump([57.3, 20.4]).state('Returning').go([[44, 19.8], WARREN], 60, 'hop').state('Foraging').rest('idle', { flip: 0 });
    R.add(LAIR.critter('rabbit'), [33.2, 20.5]).state('Foraging').act('idle', 8, { flip: 1 }).act('up', 2.6).untilT(taken - .3, 'idle').state('Fleeing').go([[40.6, 21.6]], 130, 'bolt').state('Hiding').untilT(48, 'idle', { flip: 1 })
      .state('Returning').go([[33.2, 20.5]], 40, 'hop').state('Foraging').rest('idle', { flip: 1 });
    if (age > 1) {
      const w = R.add(LAIR.harpy(SPIRES[1][2] + 2, SPIRES[1][2] + 16), home(SPIRES[1]), 'Screamer'), loop = [];
      for (let i = 1; i <= 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI * 2; loop.push([19 + Math.cos(a) * 7.4, 16.6 + Math.sin(a) * 3.4 + 1]); }
      w.state('Roosting').until(6.6, 'roost').state('Watching from the air').act('lift', .9).go([...loop, home(SPIRES[1])], 70, 'circle').act('settle', .9).state('On the nest').until(12.6, 'idle').act('cry', 1.6)
        .state('Watching from the air').act('lift', .9).go([...loop.slice(0, 6), home(SPIRES[1])], 70, 'circle').act('settle', .9).state('On the nest').until(19.8, 'idle').state('Roosting').rest('roost');
    }
    if (age > 2) {
      R.add(LAIR.harpy(SPIRES[2][2] + 2, SPIRES[2][2] + 14), home(SPIRES[2]), 'Screamer').state('Roosting').until(6.2, 'roost').state('On the nest').until(10, 'idle').act('cry', 1.6).until(19.7, 'idle').state('Roosting').rest('roost');
      R.add(LAIR.harpy(0, 14, true), [GROUND[0], GROUND[1] + .1], 'Harpy matron').state('Roosting').until(6, 'roost').state('Guarding the hoard').until(8.4, 'idle').act('cry', 1.6).until(13, 'idle').act('cry', 1.6).until(19.5, 'idle').state('Roosting').rest('roost');
    }
    return { post };
  }

  return {
    name: 'Harpy roost', size: [56, 32], seed: 73, home: [15.8, 15.2], cam: [26, 15.5], ring: 6.4, time, place, cast,
    who: ['one screamer', 'two screamers', 'three screamers and a matron'],
    wall(x, y, n) { return y + (n - .5) * 9 < 7.2; },
    ground(x, y, n, n2) {
      if (y + (n - .5) * 9 < 10.4) return 'rocky';
      if (Math.hypot(x - 15.8, (y - 15.4) * 1.3) < 5 + n2 * 2) return n2 < .45 ? 'rocky' : 'dirt';
      if (y + (n - .5) * 8 < 14) return n2 < .5 ? 'grass' : 'savanna';
      return n2 < .3 ? 'grass' : n2 < .64 ? 'savanna' : 'tall_grass';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'rocky') return h < .03 ? ['tree', h2 < .5 ? 'dead' : 'pine'] : h2 < .05 ? ['rock', 'boulder'] : h2 < .09 ? ['plant', 'scrub'] : null;
      if (gid === 'dirt') return h2 < .05 ? ['plant', 'scrub'] : null;
      return h < .014 ? ['tree', h2 < .5 ? 'birch' : 'dead'] : h2 < .07 ? ['plant', 'scrub'] : h2 < .09 ? ['plant', 'bush'] : h2 < .11 ? ['plant', 'flowers'] : null;
    },
    parts: [
      { at: [SPIRES[0][0], SPIRES[0][1] - 3.4], name: 'Spire nests', note: 'One per harpy, out of reach from the ground.' },
      { at: [MIDDEN[0] + .2, MIDDEN[1] - .4], name: 'Midden', note: 'Bones and whatever the prey carried fall here.' },
      { at: [WARREN[0], WARREN[1] - 1], name: 'Hunting ground', note: 'Small game inside the roost’s range. They watch it from above.' },
      { at: [GROUND[0], GROUND[1] - .9], name: 'Matron’s nest', note: 'On the ground, with everything the roost ever took.', from: 3 },
      { at: [19.4, 17.2], name: 'Remains', note: 'Carried here, not killed here.', from: 3 },
    ],
    day: [[4.5, 6, 'Roost', 'rest'], [6, 8.6, 'Hunt', 'hunt'], [8.6, 10.6, 'Feed', 'feed'], [10.6, 19.6, 'Watch', 'wake'], [19.6, 28.5, 'Roost', 'rest']],
    rules: ['Harpies roost on their spires at night and hunt by day.', 'They take small game inside the roost’s range and carry it to the nest in their claws.', 'Bones fall to the midden. What a victim carried stays at the roost: the hoard is everything it ever killed.', 'They see you from the air long before you reach the rocks.', 'By night they are all on the nests, asleep and out of reach of a spear.'],
    needs: ['Flying mobs that carry what they kill.', 'Prey search bound to the roost’s range.', 'Sleep by the clock, at the nest.', 'A hoard container that takes the gear of whatever the roost kills.', 'A lair laid down as one stamp: spires, midden, nest.'],
  };
})();
