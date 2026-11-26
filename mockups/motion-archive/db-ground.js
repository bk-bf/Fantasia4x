'use strict';
(() => {
  const X = DBX;
  const add = def => { GROUND.push(def); G[def.id] = GROUND.length - 1; return def.id; };
  const preta = soilTex(P.preta, 71), greyGrass = grassTex(R('#3a3a2c #4c4c38 #626046 #7a7656 #928c68'), 73), greySoil = soilTex(R('#2a2622 #3a342e #4c443a #5e5548 #726857'), 75), leafy = grassTex(P.oak, 77);
  const mineral = plates(P.rockWarm, 9, 81, 1), crystal = plates(P.cave, 12, 85, 1), TEAL = R('#1c5a56 #2c8478 #4cb09c #7cd6c2 #c0f4e6');
  const NEW = [
    { id: 'terra_preta', name: 'Terra Preta', lvl: 5, f: cover(preta, GT.lush, .46, GT.loam), dec: [['tuft', 3, P.grass], ['clover', .9], ['flower', .3]] },
    { id: 'bush', name: 'Bush', lvl: 5, f: cover(GT.rich, leafy, .82), dec: [['clover', 3.4], ['tuft', 3.4, P.oak], ['leaf', 1.4], ['twig', .5]] },
    { id: 'scrubland', name: 'Scrubland', lvl: 5, f: cover(GT.poor, GT.dry, .32), dec: [['tuft', 2.2, P.grassDry], ['twig', 1.6], ['pebble', 1.4, P.rockWarm], ['crack', .6, P.soilPoor]] },
    { id: 'wildflowers', name: 'Wildflowers', lvl: 5, f: cover(GT.soil, GT.loam, .72, GT.dry), dec: [['flower', 7], ['tuft', 2.6, P.grassLoam], ['clover', 1]] },
    { id: 'tree_stump', name: 'Tree Stump', lvl: 5, f: cover(GT.litter, GT.lush, .28, GT.dry), dec: [['pebble', 2.4, P.plank], ['twig', 2.6], ['leaf', 4], ['tuft', .6, P.grass]] },
    { id: 'fallen_logs', name: 'Fallen Logs', lvl: 5, f: cover(GT.litter, GT.moss, .36), dec: [['twig', 3.2], ['leaf', 5], ['shroomlet', .5], ['pebble', .9, P.wood]] },
    { id: 'dead_trees', name: 'Dead Trees', lvl: 5, f: cover(greySoil, greyGrass, .24), dec: [['twig', 2.8], ['crack', 1, P.soilPoor], ['pebble', .7, P.rockWarm], ['tuft', .7, P.grassDry]] },
    { id: 'mushroom_patch', name: 'Mushroom Patch', lvl: 5, f: cover(GT.rich, GT.moss, .44), dec: [['shroomlet', 2.6], ['leaf', 3], ['twig', .8], ['tuft', .8, P.moss]] },
    { id: 'quicksand', name: 'Quicksand', lvl: 2, f: (x, y) => { const wet = fbm(x * .03, y * .03, 91, 3), fine = noise(x * .22, y * .6, 93); let k = wet > .58 ? 1 : wet > .5 ? 2 : 3; if (fine > .8) k += 1; else if (fine < .16) k -= 1; if (wet > .56 && wet < .585) k = 0; if (hash(x, y, 97) > .985) k = 4; return P.quick[clamp(k, 0, 4)]; }, dec: [['bubble', .5]] },
    { id: 'mineral_deposit', name: 'Mineral Deposit', lvl: 5, f: (x, y) => { const c = mineral(x, y), v = noise(x * .09, y * .09, 83); if (v > .64 && hash(x, y, 87) > .78) return (hash(x >> 2, y >> 2, 89) > .5 ? P.copper : P.gold)[2 + (hash(x, y, 90) > .5 ? 1 : 0)]; return c; }, dec: [['stone', 2, P.rock], ['pebble', 3.2, P.rock], ['pebble', 1, P.copper]] },
    { id: 'crystal_formation', name: 'Crystal Formation', lvl: 4, f: (x, y) => { const c = crystal(x, y), v = noise(x * .07, y * .07, 99); if (v > .66) { const id = vor(x, y, 3.4, 101); if (VEDGE > 1 && id > .55) return TEAL[clamp(1 + Math.floor(id * 4) + (VDX + VDY < 0 ? 1 : -1), 0, 4)]; } return c; }, dec: [['pebble', 1.4, P.rock], ['stone', .3, P.rock]] },
  ];
  for (const g of NEW) X.groundTile('ground', add(g), g.id);
  const SOIL = [['_soil_poor', 'Bare poor soil', GT.poor, 'lay_poor_soil'], ['_soil_loam', 'Bare loam', GT.soil, 'lay_loam'], ['_soil_rich', 'Bare rich soil', GT.rich, 'lay_rich_soil'], ['_soil_preta', 'Bare terra preta', preta, 'lay_terra_preta']];
  for (const [id, name, f, lay] of SOIL) {
    add({ id, name, lvl: 5, f, dec: [['pebble', .5, P.rockWarm]] });
    X.groundTile('ground', id, id, { extra: name });
    X.groundTile('building', lay, id);
  }
})();
