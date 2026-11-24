'use strict';
LAIR_SCENES.wolves = (() => {
  const time = LAIR.clock([[0, 14.5], [8, 16.5], [46, 21], [56, 30], [72, 38.5]]);
  const BEDS = [[14.4, 16.9], [17.7, 17.4], [19.3, 15.9], [12.8, 15.6], [16, 18.7]], LARDER = [23, 18.6], WATCH = [21.3, 14.5], REACH = 1.2;
  const item = (id, ...v) => LAIR.sprite(...v.map(x => 'item/' + id + '/' + x));

  function place(k) {
    const { put, bare, age, cleared, loot } = k;
    bare(16.5, 16.5, 5.4); bare(23, 18.6, 2.8); bare(28, 17.2, 3.2); bare(36, 16.5, 8.5); bare(47, 15.5, 5);
    put(LAIR_PROPS.den(3, age > 2 ? [30, 62] : [46]), 15.6, 14.2);
    BEDS.slice(0, [2, 4, 5][age - 1]).forEach((b, i) => put(LAIR_PROPS.bed(i + 1, P.thatch, P.soilRich, age > 2 && !i ? 76 : 66), b[0], b[1] - .6));
    put(rock('boulder', 2, k.season), 20.2, 13.9);
    loot.add('Large bones', [6, 14, 30][age - 1], item('large_bones', 'map-pile-' + age), LARDER[0] + 1.5, LARDER[1] + .7);
    if (age > 1) loot.add('Small bones', [0, 9, 22][age - 1], item('small_bones', 'map-pile-' + (age - 1)), LARDER[0] - .9, LARDER[1] + 1.2);
    if (age > 1) loot.add('Disturbed earth', 1, LAIR.sprite('site/buried_hoard/summer-0'), 11.3, 13.4);
    if (age > 2) {
      put(LAIR_PROPS.skeleton(2), 11.7, 19.4);
      loot.add('Leather knapsack', 1, item('leather_knapsack', 'map-ground'), 12.8, 19.6);
      loot.add('Copper spear', 1, item('copper_spear', 'map-lie'), 10.6, 19.9);
      loot.add('Bronze skullcap', 1, item('cast_bronze_skullcap', 'map-ground'), 11.1, 18.8);
    }
    if (!cleared) return;
    put(LAIR_PROPS.ribs(4), LARDER[0], LARDER[1]);
    const n = [2, 4, 5][age - 1];
    BEDS.slice(0, n).forEach((b, i) => { const o = put(item(age > 2 && !i ? 'dire_wolf_carcass' : 'wolf_carcass', 'map-pile-1'), b[0] + .1, b[1]); if (i < 2) loot.push({ name: i ? 'Wolf carcass' : age > 2 ? 'Dire wolf carcass' : 'Wolf carcass', n: i ? n - 1 : 1, o }); });
  }

  function cast(R, k) {
    if (k.cleared) return {};
    const { age } = k, pack = age > 1, T0 = time.sec(17.25);
    const prey = R.add(LAIR.quad('deer'), [33.2, 16.6]);
    prey.keeps = true;
    const ribs = R.add(LAIR.prop(LAIR_PROPS.ribs(4)), LARDER);
    const hunter = (kind, bed, yard, lane, name) => R.add(LAIR.quad(kind), bed, name).state('Sleeping').until(16 + lane * .03, 'sleep', { flip: 0 })
      .state('Waking').act('shake', 1.1).go([yard], 24, 'walk');
    const alpha = hunter(age > 2 ? 'direwolf' : 'wolf', BEDS[0], [16.6, 16.3], 0, age > 2 ? 'Dire wolf' : 'Grey wolf').state('Rallying').act('howl', 3.2, { flip: 0 });
    const out = (b, dy) => b.untilT(T0, 'idle', { flip: 0 }).state('Hunting').go([[22.5, 16.6 + dy], [28.6, 16.9 + dy]], 56, 'trot').go([[31.2, 16.8 + dy]], 15, 'stalk');
    out(alpha, 0);
    const charge = alpha.t + .9;
    alpha.untilT(charge, 'sniff').state('Attacking').go([[34.1, 16.7]], 165, 'run');
    const caught = alpha.t;
    alpha.act('bite', .7).act('bite', .7).state('Eating').act('feed', 1).state('Hauling the kill');
    prey.state('Grazing').untilT(charge - .5, 'graze', { flip: 0 }).state('Startled').act('alert', .45).state('Fleeing');
    prey.go([[34.1 + REACH, 16.74]], 70 / (caught - prey.t), 'run').untilT(caught + .3, 'idle').state('Dead').act('hit', .45).act('fall', .9);
    alpha.drag([[28, 17.7], [LARDER[0] - REACH, LARDER[1]]], 40, prey, REACH);
    const home = alpha.t, eaten = time.sec(21);
    alpha.state('Eating').untilT(eaten, 'feed').state('Returning').go([BEDS[0]], 30, 'walk').state('Sleeping').rest('sleep', { flip: 0 });
    prey.untilT(eaten, 'down').hideUntil(30.2).jump([57.5, 15.4]).state('Grazing').go([[44, 16.2], [33.2, 16.6]], 54, 'trot').rest('graze', { flip: 0 });
    ribs.untilT(home, 'still').hideUntilT(eaten).rest('still');

    const mates = [[BEDS[1], [18, 17.1], .9, [24.4, 19], 1]];
    if (pack) mates.push([BEDS[2], [18.4, 15.7], -.9, [22.8, 17.7], 0]);
    mates.forEach(([bed, yard, dy, seat, flip], i) => {
      const b = out(hunter('wolf', bed, yard, i + 1, 'Grey wolf'), dy);
      b.untilT(charge + .15, 'sniff').state('Attacking').go([[34.4, 16.7 + dy * 1.3]], 165, 'run').act('bite', .7).untilT(caught + 1.7, 'idle')
        .state('Returning').go([[28, 17.2 + dy], seat], 60, 'trot').untilT(home, 'sit', { flip }).state('Eating').untilT(eaten, 'feed', { flip })
        .state('Returning').go([bed], 30, 'walk').state('Sleeping').rest('sleep', { flip: 0 });
    });
    for (let i = 0; i < 4; i++) {
      const s = [[37, 14.4], [38.9, 17.7], [36.4, 19], [39.8, 15.6]][i], far = [47 + (i & 1) * 1.6, 13.6 + i * 1.3];
      R.add(LAIR.quad(i === 2 ? 'fawn' : 'deer'), s).state('Grazing').untilT(charge - .3 + i * .08, 'graze', { flip: i & 1 }).state('Startled').act('alert', .45)
        .state('Fleeing').go([far], 180, 'run').state('Watching').act('watch', 5, { flip: 1 }).untilT(time.sec(24), 'idle').state('Grazing').until(30.5 + i * .3, 'graze')
        .go([s], 30, 'walk').rest('graze', { flip: i & 1 });
    }
    if (!pack) return { post: { kind: 'pine', at: [13.2, 13.7], seed: 5 } };

    R.add(LAIR.quad('wolf'), WATCH, 'Lookout').state('On watch').untilT(home + 1, 'sit', { flip: 0 }).state('Eating').go([[23.6, 19.7]], 44, 'trot').untilT(eaten, 'feed', { flip: 1 })
      .state('Returning').go([BEDS[3]], 30, 'walk').state('Sleeping').until(32.3, 'sleep', { flip: 0 }).state('Waking').act('shake', 1.1).go([WATCH], 30, 'walk').state('On watch').rest('sit', { flip: 0 });
    if (age > 2) R.add(LAIR.quad('wolf'), BEDS[4], 'Grey wolf').state('Sleeping').until(17.3, 'sleep', { flip: 1 }).state('Guarding the den').act('shake', 1.1).go([[15.4, 15.4]], 24, 'walk').untilT(home + .5, 'sit', { flip: 0 })
      .state('Eating').go([[22.2, 19.8]], 80, 'trot').untilT(eaten, 'feed', { flip: 0 }).state('Returning').go([BEDS[4]], 30, 'walk').state('Sleeping').rest('sleep', { flip: 1 });
    const pups = [[[15.5, 17.8], [17.2, 18.1], [16.2, 15.3], [22.3, 19.7], [18.6, 17.9]], [[17.3, 18.3], [15.3, 17.6], [17.1, 15.5], [24.6, 19.9], [17.2, 18.3]]];
    if (age > 2) pups.push([[14.2, 18.4], [16.4, 17.3], [15.1, 15.4], [23.4, 20.2], [13.6, 16.6]]);
    pups.forEach(([spot, swap, door, seat, bed], i) => {
      const b = R.add(LAIR.quad('wolfpup'), spot, 'Wolf pup').state('Playing');
      for (let n = 0; n < 2; n++) b.act('idle', .6 + i * .3, { flip: i & 1 }).go([swap], 80, 'run').act('bite', .7, { to: spot }).act('sit', 1 + i * .2).go([spot], 70, 'run').act('bite', .7, { to: swap });
      b.until(17.2, 'sit', { flip: 0 }).state('Waiting at the den').go([door], 30, 'walk').untilT(home - .6, 'sit', { flip: 0 }).state('Eating').go([[19, 17.6], seat], 70, 'trot')
        .untilT(eaten, 'feed', { flip: i & 1 }).state('Returning').go([bed], 34, 'walk').state('Sleeping').until(36, 'sleep', { flip: i & 1 }).state('Playing').go([spot], 34, 'walk').rest('sit', { flip: i & 1 });
    });
    return { post: { kind: 'pine', at: [13.2, 13.7], seed: 5 } };
  }

  return {
    name: 'Wolf den', size: [56, 32], seed: 31, home: [16.4, 16.6], cam: [27, 16], ring: 6.5, time, place, cast,
    who: ['a pair', 'four wolves and two pups', 'a dire wolf, four wolves and three pups'],
    ground(x, y, n, n2) {
      const fx = x + (n - .5) * 10;
      if (Math.hypot(x - 16.4, (y - 16.9) * 1.5) < 2.9 + n2 * 1.4) return 'dirt';
      if (Math.hypot(x - 23, (y - 18.7) * 1.5) < 1.5 + n2 * 1.2) return 'dirt';
      if (fx < 19.5) return n2 < .46 ? 'tree' : n2 < .7 ? 'mossy_ground' : 'deep_grass';
      if (fx < 25) return n2 < .5 ? 'deep_grass' : 'tall_grass';
      return n2 < .3 ? 'grass' : n2 < .62 ? 'tall_grass' : 'deep_grass';
    },
    flora(x, y, gid, h, h2) {
      if (gid === 'tree') return h < .36 ? ['tree', h2 < .5 ? 'pine' : h2 < .8 ? 'oak' : 'birch'] : h2 < .05 ? ['plant', 'fern'] : h2 < .09 ? ['plant', 'mushroom'] : h2 < .12 ? ['plant', 'logs'] : null;
      if (gid === 'mossy_ground') return h < .24 ? ['tree', 'pine'] : h2 < .08 ? ['plant', 'fern'] : h2 < .12 ? ['plant', 'bush'] : null;
      if (gid === 'deep_grass') return h < .035 ? ['tree', 'oak'] : h2 < .05 ? ['plant', 'bush'] : h2 < .08 ? ['plant', 'flowers'] : null;
      return h < .012 ? ['tree', 'birch'] : h2 < .03 ? ['plant', 'flowers'] : h2 < .045 ? ['plant', 'bush'] : null;
    },
    parts: [
      { at: [15.6, 13.6], name: 'Den', note: 'Dug under the roots. Pups are born here and hide here.' },
      { at: [16.2, 17.2], name: 'Beds', note: 'One trampled hollow per wolf. Each sleeps on its own.' },
      { at: LARDER, name: 'Larder', note: 'Every kill is dragged here and eaten here. The bones stay.' },
      { at: [20.4, 13.4], name: 'Lookout', note: 'One wolf keeps watch while the rest sleep.', from: 2 },
      { at: [11.3, 13.2], name: 'Disturbed earth', note: 'Something buried before the wolves came.', from: 2 },
      { at: [11.7, 19], name: 'Remains', note: 'Someone who walked in. Their gear is still on them.', from: 3 },
    ],
    day: [[14.5, 16, 'Rest', 'rest'], [16, 17.25, 'Rally', 'wake'], [17.25, 19.6, 'Hunt', 'hunt'], [19.6, 21, 'Feed', 'feed'], [21, 38.5, 'Sleep', 'rest']],
    rules: ['Each wolf sleeps on its own bed at the den, from late night through the afternoon.', 'At dusk the pack hunts, and only prey that grazes inside the den’s range.', 'The kill is dragged to the larder and eaten there. Bones pile up with every kill.', 'A lookout and the pups never leave, so the den is never empty.', 'Step onto the home ground and the pack wakes and defends it.'],
    needs: ['Prey search bound to the den’s range. Today a wolf looks 150 tiles from wherever it stands.', 'Sleep tied to the clock and to a bed tile. Today it is a fatigue timer that fires anywhere.', 'A mob that can drag a corpse. Today a kill is eaten where it falls and leaves nothing.', 'A herd with a pasture it returns to. Today prey flees and never comes back.', 'A lair laid down as several tiles in one stamp.'],
  };
})();
