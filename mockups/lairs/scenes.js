'use strict';
const DEER = 'item/deer_carcass/0';
const SCENES = {
  wolves: {
    name: 'Wolf den', loop: 44, clearedAt: 20, size: [22, 13],
    night: [[0, 0], [14, 0], [22, 0.7], [38, 0.7], [44, 0]],
    parts: [
      { n: 1, at: [8.5, 4.3], name: 'Den mouth', note: 'Pups stay here. A second mouth once the pack is large.' },
      { n: 2, at: [8.6, 6.9], name: 'Resting ground', note: 'Worn earth where the pack sleeps through the day.' },
      { n: 3, at: [13.4, 8], name: 'Kill site', note: 'Prey is dragged home and eaten here.' },
      { n: 4, at: [15.6, 10], name: 'Boneyard', note: 'What is left of every kill. It only grows.', st: 2 },
      { n: 5, at: [17.4, 5.6], name: 'Lookout', note: 'One wolf stays awake.', st: 2 },
      { n: 6, at: [4.2, 10.2], name: 'Remains', note: 'Someone who came too close.', st: 3 }
    ],
    loot: [
      { s: 'item/wolf_carcass/0', name: 'Wolf carcass', n: [2, 4, 6] },
      { s: 'item/large_bones/0', name: 'Bones', n: [0, 7, 16] },
      { s: 'item/leather_knapsack/0', name: 'Leather knapsack', n: [0, 0, 1] },
      { s: 'item/copper_spear/0', name: 'Copper spear', n: [0, 0, 1] }
    ],
    props: [
      { s: 'tree/pine/0', x: 1, y: 2.6 }, { s: 'tree/pine/1', x: 20.4, y: 3 }, { s: 'tree/pine/2', x: 3.4, y: 5.4 },
      { s: 'tree/oak/0', x: 19.2, y: 7.4 }, { s: 'tree/pine/3', x: 13.6, y: 2.4 }, { s: 'tree/oak/1', x: 1.2, y: 11.6 },
      { s: 'tree/frostheart/0', x: 7, y: 3.4 }, { s: 'tree/frostheart/1', x: 9.8, y: 3.2 }, { s: 'tree/frostheart/2', x: 5.2, y: 3.8, st: 2 },
      { s: 'rock/boulder/0', x: 6.4, y: 4.5 }, { s: 'rock/boulder/1', x: 17.4, y: 4.3 }, { s: 'rock/boulder/2', x: 12, y: 4.4, st: 3 },
      { s: 'rock/den/0', x: 8, y: 4.3 }, { s: 'rock/den/1', x: 10.5, y: 4.5, st: 3 },
      { s: 'plant/bush/0', x: 4.6, y: 6.6 }, { s: 'plant/fern/0', x: 12.4, y: 10.6 }, { s: 'plant/bush/1', x: 16.2, y: 2.6 },
      { s: 'plant/fern/1', x: 2.6, y: 8 }, { s: 'plant/bush/2', x: 20.2, y: 9.8 },
      { s: 'item/medium_bones/0', x: 14.8, y: 9.3, flat: 1, st: 2, loot: 1 }, { s: 'item/small_bones/0', x: 15.8, y: 9.9, flat: 1, st: 2 },
      { s: 'item/large_bones/0', x: 16.3, y: 9.2, flat: 1, st: 3, loot: 1 }, { s: 'item/small_bones/0', x: 14.3, y: 10, flat: 1, st: 3, f: -1 },
      { s: 'item/huge_bones/0', x: 15.3, y: 9.6, flat: 1, st: 3, loot: 1 }, { s: 'item/small_bones/0', x: 11.3, y: 7.5, flat: 1, st: 2, f: -1 },
      { s: 'item/large_bones/0', x: 3.7, y: 9.6, flat: 1, st: 3, loot: 1 }, { s: 'item/leather_knapsack/0', x: 4.7, y: 9.4, flat: 1, st: 3, loot: 1 },
      { s: 'item/copper_spear/0', x: 3.3, y: 10, flat: 1, st: 3, loot: 1 },
      { s: DEER, x: 13, y: 7.4, flat: 1, from: 31, to: 41 }, { s: 'item/medium_bones/0', x: 13.1, y: 7.6, flat: 1, from: 41, to: 8 },
      { s: 'item/wolf_carcass/0', x: 7.2, y: 6.3, flat: 1, only: 1, loot: 1 }, { s: 'item/wolf_carcass/0', x: 10.3, y: 6.9, flat: 1, only: 1, loot: 1, f: -1 },
      { s: 'item/wolf_carcass/0', x: 13.2, y: 6, flat: 1, only: 1, loot: 1, st: 2 }, { s: 'item/wolf_carcass/0', x: 16.2, y: 5.4, flat: 1, only: 1, loot: 1, st: 2, f: -1 }
    ],
    actors: [
      { s: ['creature/wolf/0', 'creature/pack_alpha/0', 'creature/pack_alpha/0'], lie: 1, k: [
        [0, 6.5, 6.3, 'sleep'], [6, 6.5, 6.3, 'stand'], [8, 6.5, 6.3, 'stand'], [13, 23.6, 6, 'stand'], [24, 23.6, 8, 'stand', { carry: DEER }],
        [31, 11.8, 7.3, 'eat', { carry: null, f: 1 }], [41, 11.8, 7.3, 'stand'], [43.5, 6.5, 6.3, 'sleep', { f: 1 }]] },
      { s: 'creature/wolf/0', lie: 1, k: [
        [0, 10.1, 6.7, 'sleep', { f: -1 }], [7, 10.1, 6.7, 'stand', { f: -1 }], [8.6, 10.1, 6.7, 'stand'], [13.6, 23.6, 7, 'stand'], [24.8, 23.6, 8.8, 'stand'],
        [31.6, 14.5, 7.4, 'eat', { f: -1 }], [41, 14.5, 7.4, 'stand', { f: -1 }], [43.5, 10.1, 6.7, 'sleep', { f: -1 }]] },
      { s: 'creature/wolf/0', lie: 1, st: 2, k: [
        [0, 8.2, 7.6, 'sleep'], [7.6, 8.2, 7.6, 'stand'], [9.2, 8.2, 7.6, 'stand'], [14.2, 23.6, 8, 'stand'], [25.4, 23.6, 9.4, 'stand'],
        [32.2, 13.1, 8.6, 'eat', { f: 1 }], [41, 13.1, 8.6, 'stand'], [43.6, 8.2, 7.6, 'sleep', { f: 1 }]] },
      { s: 'creature/wolf/0', lie: 1, st: 2, k: [
        [0, 16.2, 5, 'stand', { f: 1 }], [10, 16.2, 5, 'stand'], [13, 18.6, 6.3, 'stand'], [18, 18.6, 6.3, 'stand'], [21, 16.2, 5, 'stand', { f: 1 }],
        [33, 16.2, 5, 'stand'], [35.6, 13.4, 6.3, 'eat', { f: -1 }], [41, 13.4, 6.3, 'stand'], [43.8, 16.2, 5, 'stand', { f: 1 }]] },
      { s: 'creature/wolf_pup/0', lie: 1, st: 2, k: [
        [0, 8.1, 5, 'sleep'], [9, 8.1, 5, 'stand'], [10, 8.1, 5, 'stand'], [11.4, 6.5, 7, 'stand'], [12.8, 9, 7.8, 'stand'], [14.2, 11.2, 6.3, 'stand'],
        [15.6, 8.6, 6.6, 'stand'], [17, 6.4, 6.1, 'stand'], [18.6, 9.6, 7.5, 'stand'], [20, 8.3, 5.6, 'lie'], [31.6, 8.3, 5.6, 'stand'],
        [34, 12.5, 6.6, 'eat', { f: 1 }], [41, 12.5, 6.6, 'stand'], [43, 8.1, 5, 'sleep']] },
      { s: 'creature/wolf_pup/0', lie: 1, st: 2, k: [
        [0, 9.3, 5.15, 'sleep', { f: -1 }], [9.6, 9.3, 5.15, 'stand'], [10.6, 9.3, 5.15, 'stand'], [12, 7.1, 7.2, 'stand'], [13.4, 9.6, 8, 'stand'], [14.8, 11.6, 6.6, 'stand'],
        [16.2, 9.2, 6.9, 'stand'], [17.6, 7, 6.4, 'stand'], [19.2, 10, 7.7, 'stand'], [20.6, 9.2, 5.8, 'lie', { f: -1 }], [32.2, 9.2, 5.8, 'stand'],
        [34.8, 12.2, 8.3, 'eat', { f: 1 }], [41, 12.2, 8.3, 'stand'], [43.2, 9.3, 5.15, 'sleep', { f: -1 }]] },
      { s: 'creature/dire_wolf/0', lie: 1, st: 3, k: [[0, 11.6, 5.9, 'sleep', { f: -1 }], [24, 11.6, 5.9, 'lie', { f: -1 }], [41, 11.6, 5.9, 'sleep', { f: -1 }]] },
      { s: 'creature/wolf/0', lie: 1, st: 3, k: [
        [0, 5.2, 7.8, 'sleep', { f: -1 }], [8, 5.2, 7.8, 'stand', { f: 1 }], [9.6, 5.2, 7.8, 'stand'], [14.6, 23.6, 9, 'stand'], [26, 23.6, 10.4, 'stand'],
        [32.8, 14.4, 8.6, 'eat', { f: -1 }], [41, 14.4, 8.6, 'stand'], [43.8, 5.2, 7.8, 'sleep', { f: -1 }]] }
    ]
  },
  bear: {
    name: 'Bear den', loop: 42, clearedAt: 2, size: [22, 13],
    night: [[0, 0], [42, 0]],
    parts: [
      { n: 1, at: [10.4, 4.2], name: 'Den', note: 'One animal, later a cub. A bigger bear takes it over with age.' },
      { n: 2, at: [15.3, 6.6], name: 'Scratching tree', note: 'Marks the edge of its ground. A warning before the den is in sight.' },
      { n: 3, at: [17.4, 10.2], name: 'Berry patch', note: 'It feeds here every day, so the path is predictable.' },
      { n: 4, at: [6.6, 9.3], name: 'Cache', note: 'A kill buried under brush for later.' },
      { n: 5, at: [13.4, 10.4], name: 'Remains', note: 'A hunter, and what they carried.', st: 3 }
    ],
    loot: [
      { s: 'item/bear_carcass/0', name: 'Bear carcass', n: [1, 1, 1] },
      { s: 'item/boar_carcass/0', name: 'Cached boar', n: [1, 1, 1] },
      { s: 'item/large_bones/0', name: 'Bones', n: [0, 5, 12] },
      { s: 'item/framed_leather_pack/0', name: 'Framed pack', n: [0, 0, 1] },
      { s: 'item/bronze_socketed_spear/0', name: 'Bronze spear', n: [0, 0, 1] },
      { s: 'item/cast_bronze_skullcap/0', name: 'Bronze skullcap', n: [0, 0, 1] }
    ],
    props: [
      { s: 'tree/oak/0', x: 2.6, y: 2.6 }, { s: 'tree/oak/1', x: 18, y: 2.4 }, { s: 'tree/oak/2', x: 20.2, y: 3.8 }, { s: 'tree/oak/3', x: 1.2, y: 6.4 },
      { s: 'tree/pine/0', x: 5, y: 3.2 }, { s: 'tree/pine/1', x: 16.2, y: 3 }, { s: 'tree/pine/2', x: 20.8, y: 8.4 }, { s: 'tree/oak/0', x: 2.2, y: 11.8 },
      { s: 'tree/pine/3', x: 12.6, y: 2.4 }, { s: 'tree/oak/1', x: 9.6, y: 12.2 },
      { s: 'rock/boulder/0', x: 7.5, y: 4.5 }, { s: 'rock/boulder/1', x: 12.3, y: 4.5 }, { s: 'rock/boulder/2', x: 8.8, y: 3.5 }, { s: 'rock/boulder/0', x: 11.2, y: 3.6, f: -1 },
      { s: 'site/predator_den/0', x: 9.6, y: 4.3 },
      { s: 'tree/dead/0', x: 15, y: 5.7, shake: [11, 14.5] },
      { s: 'plant/berry_bush/2', x: 16.8, y: 9.1 }, { s: 'plant/berry_bush/2', x: 18, y: 9.6 }, { s: 'plant/berry_bush/1', x: 17.2, y: 10.4 }, { s: 'plant/berry_bush/0', x: 18.8, y: 8.7 },
      { s: 'item/boar_carcass/0', x: 6.3, y: 8.5, flat: 1, loot: 1 }, { s: 'plant/logs/0', x: 5.4, y: 8.9 }, { s: 'plant/fern/0', x: 6, y: 8.9 }, { s: 'plant/fern/1', x: 6.9, y: 8.6 },
      { s: 'plant/mushroom/0', x: 4.5, y: 11.3 }, { s: 'plant/mushroom/1', x: 5.5, y: 11.7 }, { s: 'plant/fern/2', x: 3.4, y: 9.2 }, { s: 'plant/bush/0', x: 14.2, y: 11.8 },
      { s: 'item/large_bones/0', x: 11.7, y: 6.3, flat: 1, st: 2, loot: 1 }, { s: 'item/medium_bones/0', x: 12.6, y: 5.6, flat: 1, st: 2 },
      { s: 'item/huge_bones/0', x: 8.6, y: 6.5, flat: 1, st: 3, loot: 1 }, { s: 'item/small_bones/0', x: 9.6, y: 7, flat: 1, st: 3 },
      { s: 'item/medium_bones/0', x: 13, y: 9.6, flat: 1, st: 3, loot: 1 }, { s: 'item/framed_leather_pack/0', x: 13.9, y: 9.4, flat: 1, st: 3, loot: 1 },
      { s: 'item/bronze_socketed_spear/0', x: 12.5, y: 10, flat: 1, st: 3, loot: 1 }, { s: 'item/cast_bronze_skullcap/0', x: 13.5, y: 10.1, flat: 1, st: 3, loot: 1 },
      { s: 'item/bear_carcass/0', x: 10, y: 5.7, flat: 1, only: 1, loot: 1 }
    ],
    actors: [
      { s: ['creature/black_bear/0', 'creature/bear/0', 'creature/cave_bear/0'], lie: 1, k: [
        [0, 10, 5.4, 'sleep'], [5, 10, 5.4, 'stand'], [6.5, 10, 5.4, 'stand'], [11, 13.9, 6.4, 'eat', { f: 1 }], [14.5, 13.9, 6.4, 'stand'],
        [19.5, 15.9, 9.3, 'eat', { f: 1 }], [24.5, 15.9, 9.3, 'stand'], [31, 7.6, 8.3, 'eat', { f: -1 }], [35.5, 7.6, 8.3, 'stand'], [40, 10, 5.4, 'sleep', { f: 1 }]] },
      { s: 'creature/bear_cub/0', lie: 1, st: 2, k: [
        [0, 11.5, 5.8, 'sleep', { f: -1 }], [6, 11.5, 5.8, 'stand'], [8, 11.5, 5.8, 'stand'], [12.4, 13.2, 7.2, 'stand', { f: 1 }], [15.6, 13.2, 7.2, 'stand'],
        [20.6, 17.6, 10.6, 'eat', { f: -1 }], [25.4, 17.6, 10.6, 'stand'], [32, 8.4, 9.2, 'stand', { f: -1 }], [36.4, 8.4, 9.2, 'stand'], [41, 11.5, 5.8, 'sleep', { f: -1 }]] }
    ]
  },
  goblins: {
    name: 'Goblin warren', loop: 40, clearedAt: 30, size: [22, 13], glow: [10.5, 6.6],
    night: [[0, 0.6], [40, 0.6]],
    parts: [
      { n: 1, at: [9.6, 3.2], name: 'Burrows', note: 'Where they sleep. One more mound as the band grows.' },
      { n: 2, at: [10.5, 7.2], name: 'Fire', note: 'Burns all night, so the camp shows from far off.' },
      { n: 3, at: [5.6, 6.8], name: 'Stash', note: 'Whatever they carry off ends up here, yours included.' },
      { n: 4, at: [11, 11.4], name: 'Stakes and gate', note: 'One way in.' },
      { n: 5, at: [13.9, 5.4], name: 'Totem', note: 'The chief keeps to it.', st: 2 },
      { n: 6, at: [14.7, 8], name: 'Rack', note: 'Game hung to dry.', st: 2 }
    ],
    loot: [
      { s: 'item/goblin_carcass/0', name: 'Goblin carcass', n: [3, 6, 8] },
      { s: 'item/crate/0', name: 'Crate of stolen goods', n: [1, 2, 4] },
      { s: 'building/sacks', name: 'Grain sacks', n: [0, 1, 1] },
      { s: 'item/wooden_chest/0', name: 'Chief’s chest', n: [0, 0, 1] },
      { s: 'item/goblin_hooked_spear/0', name: 'Hooked spear', n: [1, 2, 3] },
      { s: DEER, name: 'Deer carcass', n: [0, 1, 1] }
    ],
    props: [
      { s: 'tree/bonewood/0', x: 15.6, y: 2.8 }, { s: 'tree/dead/0', x: 18, y: 9.6 }, { s: 'tree/dead/1', x: 19.6, y: 10.8 }, { s: 'tree/dead/2', x: 16.6, y: 11.6 },
      { s: 'tree/oak/0', x: 1.4, y: 9 }, { s: 'tree/pine/0', x: 20, y: 3.4 }, { s: 'tree/oak/2', x: 3, y: 2.4 }, { s: 'plant/scrub/0', x: 19, y: 5.6 }, { s: 'plant/scrub/1', x: 2.4, y: 11.6 },
      { s: 'rock/warren/0', x: 8, y: 3.5 }, { s: 'rock/warren/1', x: 10.8, y: 3.3, st: 2 }, { s: 'rock/warren/2', x: 5.8, y: 3.8, st: 3 },
      { s: 'building/barricade/0', x: 3.6, y: 7.6, st: 2 }, { s: 'building/barricade/0', x: 4.8, y: 9, st: 2 }, { s: 'building/barricade/0', x: 6.2, y: 9.9 },
      { s: 'building/barricade/0', x: 7.6, y: 10.4 }, { s: 'building/barricade/0', x: 9, y: 10.6 }, { s: 'building/barricade/0', x: 12.2, y: 10.6 },
      { s: 'building/barricade/0', x: 13.6, y: 10.2 }, { s: 'building/barricade/0', x: 15, y: 9.4, st: 2 }, { s: 'building/barricade/0', x: 16, y: 8, st: 2 },
      { s: 'building/barricade/0', x: 16.4, y: 6.4, st: 3 }, { s: 'building/barricade/0', x: 3.2, y: 6, st: 3 },
      { s: 'building/sleeping_spot/0', x: 8, y: 7.5, flat: 1 }, { s: 'building/sleeping_spot/0', x: 12, y: 7.6, flat: 1, st: 3 },
      { s: 'building/campfire', x: 10, y: 6, gone: 1 }, { s: 'building/campfire/idle', x: 10, y: 6, only: 1 },
      { s: 'building/crate', x: 5, y: 5.2, loot: 1 }, { s: 'building/barrel', x: 6, y: 5, st: 2, loot: 1 }, { s: 'building/sacks', x: 5.4, y: 6.1, st: 2, loot: 1 },
      { s: 'building/crate', x: 4.2, y: 6, st: 3, loot: 1 }, { s: 'item/wooden_chest/0', x: 6.5, y: 6.1, st: 3, loot: 1 },
      { s: 'building/claw_totem/0', x: 13.4, y: 4.2, st: 2 }, { s: 'building/drying_rack/s', x: 14.2, y: 7, st: 2 },
      { s: 'item/crate/0', x: 6.7, y: 5.3, from: 23, to: 13, loot: 1 }, { s: DEER, x: 13.6, y: 8, flat: 1, from: 25, to: 13, loot: 1, st: 2 },
      { s: 'item/goblin_carcass/0', x: 9, y: 6.6, flat: 1, only: 1, loot: 1 }, { s: 'item/goblin_carcass/0', x: 11.6, y: 7.4, flat: 1, only: 1, loot: 1, f: -1 },
      { s: 'item/goblin_carcass/0', x: 10.6, y: 9.4, flat: 1, only: 1, loot: 1 }, { s: 'item/goblin_hooked_spear/0', x: 9.6, y: 7.4, flat: 1, only: 1, loot: 1 }
    ],
    actors: [
      { s: 'creature/goblin_cutter/0', k: [
        [0, 8.9, 6.2, 'stand', { f: 1 }], [24, 8.9, 6.2, 'stand'], [26.5, 7.5, 5.8, 'stand', { f: -1 }], [31, 7.5, 5.8, 'stand'], [33.5, 8.9, 6.2, 'stand', { f: 1 }]] },
      { s: 'creature/cave_goblin/0', k: [[0, 11.3, 6.3, 'eat', { f: -1 }]] },
      { s: 'creature/goblin_whelp/0', st: 2, k: [
        [0, 9.4, 7.6, 'stand'], [2, 12, 7.2, 'stand'], [4, 11.4, 5.2, 'stand'], [6, 8.6, 5.2, 'stand'], [8, 9.4, 7.6, 'stand'], [16, 9.4, 7.6, 'stand'],
        [18.4, 10.2, 9.4, 'stand'], [22, 8.2, 6.6, 'stand'], [30, 8.2, 6.6, 'stand'], [32, 12.2, 6.8, 'stand'], [36, 12.2, 6.8, 'stand'], [38, 9.4, 7.6, 'stand']] },
      { s: ['creature/goblin_cutter/0', 'creature/goblin_warchief/0', 'creature/goblin_warlord/0'], st: 2, k: [
        [0, 13.2, 5.2, 'stand', { f: -1 }], [16, 13.2, 5.2, 'stand'], [19, 11.6, 8.8, 'stand', { f: -1 }], [26, 11.6, 8.8, 'stand'], [29, 13.2, 5.2, 'stand', { f: -1 }]] },
      { s: 'creature/goblin_slinker/0', k: [
        [0, 12.4, 9.4, 'stand'], [6, 7.4, 9.3, 'stand'], [8, 7.4, 9.3, 'stand'], [14, 12.4, 9.4, 'stand', { f: 1 }], [24, 12.4, 9.4, 'stand'], [30, 7.4, 9.3, 'stand'],
        [33, 7.4, 9.3, 'stand'], [39, 12.4, 9.4, 'stand']] },
      { s: 'creature/goblin_netter/0', k: [
        [0, 10.6, 15, 'stand'], [14, 10.6, 15, 'stand', { carry: 'item/crate/0', how: 'lift' }], [18, 10.6, 10.6, 'stand'], [23, 7, 6.2, 'stand', { carry: null, f: -1 }],
        [25, 7, 6.2, 'stand'], [28, 9.9, 7.4, 'eat', { f: 1 }], [36, 9.9, 7.4, 'stand'], [39.5, 10.6, 15, 'stand']] },
      { s: 'creature/goblin_sneak/0', st: 2, k: [
        [0, 11.4, 15.6, 'stand'], [15, 11.4, 15.6, 'stand', { carry: DEER }], [19.5, 11.2, 10.8, 'stand'], [25, 12.6, 8, 'stand', { carry: null, f: 1 }],
        [27, 12.6, 8, 'stand'], [29.5, 11.6, 7.4, 'eat', { f: -1 }], [36.6, 11.6, 7.4, 'stand'], [39.8, 11.4, 15.6, 'stand']] },
      { s: 'creature/goblin_bloodrager/0', st: 3, rot: 1, k: [[0, 12, 7.5, 'sleep']] },
      { s: 'creature/goblin_cutter/0', st: 3, rot: 1, k: [[0, 8, 7.4, 'sleep']] }
    ]
  },
  fen: {
    name: 'Fen nest', loop: 40, clearedAt: 4, size: [22, 13],
    night: [[0, 0], [40, 0]],
    parts: [
      { n: 1, at: [9.6, 6.4], name: 'Nests', note: 'Eggs in the reeds. More nests as the brood grows.' },
      { n: 2, at: [12.8, 10.2], name: 'Basking bank', note: 'The big one lies still here until something drinks.' },
      { n: 3, at: [16.8, 7.6], name: 'Drinking edge', note: 'Game comes down to the water.' },
      { n: 4, at: [14.9, 3], name: 'Roost snag', note: 'Bloodsuckers hang here and come down to a kill.', st: 2 },
      { n: 5, at: [5.6, 10.4], name: 'Sunk remains', note: 'Half in the mud.', st: 3 }
    ],
    loot: [
      { s: 'item/mire_crocodile_carcass/0', name: 'Bog lurker carcass', n: [1, 1, 1] },
      { s: 'site/swamp_nest/0', name: 'Clutch of eggs', n: [1, 2, 3] },
      { s: 'item/bullywug_carcass/0', name: 'Croaker carcass', n: [1, 1, 2] },
      { s: 'item/large_bones/0', name: 'Bones', n: [0, 3, 8] },
      { s: 'item/iron_buckled_satchel/0', name: 'Buckled satchel', n: [0, 0, 1] },
      { s: 'item/waterskin/0', name: 'Waterskin', n: [0, 0, 1] }
    ],
    props: [
      { s: 'tree/willow/0', x: 3.8, y: 3.4 }, { s: 'tree/willow/1', x: 19.2, y: 4.2 }, { s: 'tree/willow/2', x: 1.4, y: 7.6 }, { s: 'tree/bonewood/0', x: 14.4, y: 3 },
      { s: 'tree/dead/0', x: 20.4, y: 9.4 }, { s: 'tree/dead/1', x: 2.6, y: 11.8 }, { s: 'tree/willow/3', x: 10.6, y: 12.2 },
      { s: 'plant/reeds/0', x: 5, y: 5 }, { s: 'plant/reeds/1', x: 6.2, y: 4.2 }, { s: 'plant/reeds/2', x: 12.6, y: 4.4 }, { s: 'plant/reeds/0', x: 13.4, y: 6.6 },
      { s: 'plant/reeds/1', x: 6.2, y: 8.2 }, { s: 'plant/reeds/2', x: 17, y: 9.8 }, { s: 'plant/reeds/0', x: 18.2, y: 8 }, { s: 'plant/reeds/1', x: 14.4, y: 10.4 },
      { s: 'plant/reeds/2', x: 8.2, y: 4 }, { s: 'plant/reeds/0', x: 10.2, y: 4.4 }, { s: 'plant/reeds/1', x: 4.2, y: 7 },
      { s: 'plant/logs/0', x: 11.2, y: 10.1 }, { s: 'plant/moss/0', x: 16, y: 11.4 }, { s: 'plant/moss/1', x: 3.2, y: 5.6 },
      { s: 'site/swamp_nest/0', x: 9, y: 5.4, loot: 1 }, { s: 'site/swamp_nest/1', x: 11, y: 6.3, st: 2, loot: 1 }, { s: 'site/swamp_nest/2', x: 7.4, y: 6.9, st: 3, loot: 1 },
      { s: 'item/small_bones/0', x: 10.3, y: 7.4, flat: 1, st: 2 }, { s: 'item/large_bones/0', x: 8.8, y: 8.1, flat: 1, st: 3, loot: 1 }, { s: 'item/medium_bones/0', x: 12, y: 7.8, flat: 1, st: 3 },
      { s: 'item/medium_bones/0', x: 5.1, y: 9.7, flat: 1, st: 3, loot: 1 }, { s: 'item/iron_buckled_satchel/0', x: 5.9, y: 9.5, flat: 1, st: 3, loot: 1 },
      { s: 'item/waterskin/0', x: 4.6, y: 10, flat: 1, st: 3, loot: 1 },
      { s: DEER, x: 16.2, y: 7.2, flat: 1, from: 16.1, to: 18.5 }, { s: DEER, x: 10.2, y: 8, flat: 1, from: 25, to: 34 },
      { s: 'item/medium_bones/0', x: 10.3, y: 8.2, flat: 1, from: 34, to: 8 },
      { s: 'item/mire_crocodile_carcass/0', x: 12.4, y: 9.2, flat: 1, only: 1, loot: 1 }, { s: 'item/bullywug_carcass/0', x: 9.8, y: 6.8, flat: 1, only: 1, loot: 1 }
    ],
    actors: [
      { s: ['creature/mire_crocodile/0', 'creature/mire_crocodile/0', 'creature/elder_crocodile/0'], k: [
        [0, 12.2, 9.2, 'stand', { f: 1 }], [15.5, 12.2, 9.2, 'stand'], [16.1, 15, 7.5, 'eat', { f: 1 }], [18.5, 15, 7.5, 'stand', { carry: DEER }],
        [25, 11.4, 8, 'eat', { carry: null, f: -1 }], [34, 11.4, 8, 'stand'], [38, 12.2, 9.2, 'stand', { f: 1 }]] },
      { s: 'creature/deer/0', k: [
        [0, 24, 6.4, 'hide'], [8, 24, 6.4, 'stand'], [13, 16.6, 6.5, 'eat', { f: -1 }], [16.1, 16.6, 6.5, 'hide']] },
      { s: 'creature/croaker', hop: 1, k: [
        [0, 8, 6.2, 'stand', { f: 1 }], [4, 8, 6.2, 'stand'], [5, 10.2, 5.2, 'stand'], [9, 10.2, 5.2, 'stand'], [10, 8.6, 7.6, 'stand'], [14, 8.6, 7.6, 'stand'],
        [15, 8, 6.2, 'stand', { f: 1 }], [26, 8, 6.2, 'stand'], [27.5, 9.4, 7.3, 'eat', { f: 1 }], [34, 9.4, 7.3, 'stand'], [35.5, 8, 6.2, 'stand', { f: 1 }]] },
      { s: 'creature/croaker', hop: 1, st: 3, k: [
        [0, 12.4, 5.6, 'stand', { f: -1 }], [18, 12.4, 5.6, 'stand'], [19, 13.6, 7, 'stand'], [26.6, 13.6, 7, 'stand'], [28.4, 11.4, 7.2, 'eat', { f: -1 }],
        [34, 11.4, 7.2, 'stand'], [36, 12.4, 5.6, 'stand', { f: -1 }]] },
      { s: 'creature/stirge', st: 2, k: [
        [0, 14.1, 4, 'perch', { z: 46 }], [26, 14.1, 4, 'fly', { z: 46 }], [29, 10.6, 7.9, 'eat', { z: 6 }], [33.4, 10.6, 7.9, 'fly', { z: 6 }], [36.4, 14.1, 4, 'perch', { z: 46 }]] },
      { s: 'creature/stirge', st: 2, k: [
        [0, 15.3, 4.2, 'perch', { z: 30, f: -1 }], [27, 15.3, 4.2, 'fly', { z: 30 }], [30.2, 9.8, 8.3, 'eat', { z: 4 }], [33.8, 9.8, 8.3, 'fly', { z: 4 }], [37, 15.3, 4.2, 'perch', { z: 30, f: -1 }]] }
    ]
  },
  harpies: {
    name: 'Harpy roost', loop: 38, clearedAt: 22, size: [22, 13],
    night: [[0, 0], [38, 0]],
    parts: [
      { n: 1, at: [8.7, 3.2], name: 'Spire nests', note: 'They sleep out of reach. Eggs in every one.' },
      { n: 2, at: [9.6, 9.6], name: 'Drop', note: 'They eat on the spire and let the bones fall.' },
      { n: 3, at: [14.9, 9], name: 'Hoard', note: 'Anything that shines gets carried here.' },
      { n: 4, at: [17.9, 2.4], name: 'Perch', note: 'A watcher in the dead tree.', st: 3 },
      { n: 5, at: [13.2, 10.4], name: 'Remains', note: 'Dropped from a height.', st: 3 }
    ],
    loot: [
      { s: 'item/harpy_carcass/0', name: 'Harpy carcass', n: [1, 3, 4] },
      { s: 'site/griffon_aerie/0', name: 'Clutch of eggs', n: [1, 2, 3] },
      { s: 'item/silver_pendant/0', name: 'Silver pendant', n: [1, 1, 1] },
      { s: 'item/gold_torc/0', name: 'Gold torc', n: [0, 1, 1] },
      { s: 'item/ruby_ring/0', name: 'Ruby ring', n: [0, 0, 1] },
      { s: 'item/feathers/0', name: 'Feathers', n: [0, 6, 14] },
      { s: 'item/large_bones/0', name: 'Bones', n: [1, 4, 11] }
    ],
    props: [
      { s: 'tree/dead/0', x: 17.4, y: 4.6 }, { s: 'tree/dead/1', x: 2, y: 3.4 }, { s: 'tree/dead/2', x: 20.2, y: 9.6 }, { s: 'tree/oak/0', x: 19.6, y: 2.4 },
      { s: 'plant/scrub/0', x: 2, y: 9 }, { s: 'plant/scrub/1', x: 4.2, y: 10.8 }, { s: 'plant/scrub/2', x: 19.4, y: 11.4 }, { s: 'plant/scrub/0', x: 5.2, y: 3.4 },
      { s: 'plant/scrub/1', x: 16.6, y: 10.8 }, { s: 'plant/bush/0', x: 1.4, y: 6.4 },
      { s: 'rock/boulder/0', x: 6.4, y: 7.6 }, { s: 'rock/boulder/1', x: 15.9, y: 5.2 }, { s: 'rock/boulder/2', x: 3.2, y: 5 }, { s: 'rock/boulder/0', x: 10, y: 6.4, f: -1 },
      { s: 'rock/cairn/0', x: 17.8, y: 8.6 }, { s: 'rock/cairn/1', x: 5.4, y: 9.2, st: 2 },
      { s: 'site/griffon_aerie/0', x: 8, y: 5, loot: 1 }, { s: 'site/griffon_aerie/1', x: 11.8, y: 4.4, st: 2, loot: 1 }, { s: 'site/griffon_aerie/2', x: 5.6, y: 6.2, st: 3, loot: 1 },
      { s: 'rock/nest/0', x: 14.3, y: 7 },
      { s: 'item/silver_pendant/0', x: 15.2, y: 7.3, flat: 1, loot: 1 }, { s: 'item/gold_torc/0', x: 13.6, y: 7.7, flat: 1, st: 2, loot: 1 },
      { s: 'item/ruby_ring/0', x: 14.9, y: 7.9, flat: 1, st: 3, loot: 1 }, { s: 'item/bronze_arm_ring/0', x: 14.2, y: 8.1, flat: 1, st: 3, loot: 1 },
      { s: 'item/small_bones/0', x: 9.5, y: 8.7, flat: 1 }, { s: 'item/medium_bones/0', x: 10.9, y: 8.9, flat: 1, st: 2, loot: 1 },
      { s: 'item/large_bones/0', x: 9.8, y: 9.4, flat: 1, st: 2, loot: 1 }, { s: 'item/small_bones/0', x: 11.7, y: 8.4, flat: 1, st: 3, f: -1 },
      { s: 'item/huge_bones/0', x: 8.4, y: 9.2, flat: 1, st: 3, loot: 1 }, { s: 'item/feathers/0', x: 11.2, y: 7.7, flat: 1, st: 2, loot: 1 },
      { s: 'item/feathers/0', x: 7.2, y: 8.5, flat: 1, st: 3, loot: 1 },
      { s: 'item/medium_bones/0', x: 12.8, y: 9.8, flat: 1, st: 3, loot: 1 }, { s: 'item/plank_round_shield/0', x: 13.6, y: 9.6, flat: 1, st: 3, loot: 1 },
      { s: 'item/copper_shortsword/0', x: 12.6, y: 10.2, flat: 1, st: 3, loot: 1 },
      { s: 'item/medium_bones/0', x: 8.9, y: 8, flat: 1, from: 17, to: 2, fall: [17, 70, 0.5] },
      { s: 'item/citrine_amulet/0', x: 15.6, y: 7.9, flat: 1, from: 32, to: 18, loot: 1, st: 2 },
      { s: 'item/harpy_carcass/0', x: 9.2, y: 7.6, flat: 1, only: 1, loot: 1 }, { s: 'item/harpy_carcass/0', x: 13.2, y: 6.2, flat: 1, only: 1, loot: 1, st: 2, f: -1 }
    ],
    actors: [
      { s: 'creature/harpy/0', claw: 1, k: [
        [0, -4, 3, 'fly', { z: 70, carry: 'item/rabbit_carcass/0' }], [2, -4, 3, 'fly', { z: 70 }], [8, 8.2, 5, 'eat', { z: 39, f: 1 }],
        [17, 8.2, 5, 'perch', { z: 39, carry: null }], [26, 8.2, 5, 'fly', { z: 39 }], [31, -4, 6, 'fly', { z: 70 }], [38, -4, 3, 'fly', { z: 70 }]] },
      { s: 'creature/harpy/0', claw: 1, st: 2, k: [
        [0, 12, 4.4, 'perch', { z: 39, f: -1 }], [18, 12, 4.4, 'fly', { z: 39 }], [23, 25, 3, 'fly', { z: 70 }], [27, 25, 6.6, 'fly', { z: 70, carry: 'item/citrine_amulet/0' }],
        [32, 16.4, 7.6, 'perch', { z: 2, carry: null, f: -1 }], [34, 16.4, 7.6, 'fly', { z: 2 }], [37.5, 12, 4.4, 'perch', { z: 39, f: -1 }]] },
      { s: 'creature/harpy_matron/0', st: 2, k: [[0, 14.3, 6.7, 'perch', { z: 6, f: 1 }]] },
      { s: 'creature/harpy/0', st: 3, k: [[0, 17.5, 4.2, 'perch', { z: 50, f: -1 }]] }
    ]
  }
};
