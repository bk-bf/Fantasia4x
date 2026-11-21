'use strict';
{
  const preta = soilTex(P.preta, 71), greyGrass = grassTex(R('#3a3a2c #4c4c38 #626046 #7a7656 #928c68'), 73), greySoil = soilTex(R('#2a2622 #3a342e #4c443a #5e5548 #726857'), 75), leafy = grassTex(P.oak, 77);
  const mineral = plates(P.rockWarm, 9, 81, 1), crystal = plates(P.cave, 12, 85, 1), TEAL = R('#1c5a56 #2c8478 #4cb09c #7cd6c2 #c0f4e6');
  GROUND.push(
    { id: 'terra_preta', f: cover(preta, GT.lush, .46), dec: [['tuft', 3, P.grass], ['clover', .9], ['flower', .3]] },
    { id: 'bush', f: cover(GT.rich, leafy, .82), dec: [['clover', 3.4], ['tuft', 3.4, P.oak], ['leaf', 1.4], ['twig', .5]] },
    { id: 'scrubland', f: cover(GT.poor, GT.dry, .32), dec: [['tuft', 2.2, P.grassDry], ['twig', 1.6], ['pebble', 1.4, P.rockWarm], ['crack', .6, P.soilPoor]] },
    { id: 'wildflowers', f: cover(GT.soil, GT.loam, .72), dec: [['flower', 7], ['tuft', 2.6, P.grassLoam], ['clover', 1]] },
    { id: 'tree_stump', f: cover(GT.litter, GT.lush, .28), dec: [['pebble', 2.4, P.plank], ['twig', 2.6], ['leaf', 4], ['tuft', .6, P.grass]] },
    { id: 'fallen_logs', f: cover(GT.litter, GT.moss, .36), dec: [['twig', 3.2], ['leaf', 5], ['shroomlet', .5], ['pebble', .9, P.wood]] },
    { id: 'dead_trees', f: cover(greySoil, greyGrass, .24), dec: [['twig', 2.8], ['crack', 1, P.soilPoor], ['pebble', .7, P.rockWarm], ['tuft', .7, P.grassDry]] },
    { id: 'mushroom_patch', f: cover(GT.rich, GT.moss, .44), dec: [['shroomlet', 2.6], ['leaf', 3], ['twig', .8], ['tuft', .8, P.moss]] },
    { id: 'quicksand', f: (x, y) => { const wet = pfbm(x, y, .03, 91, 3), fine = pn(x, y, .22, .6, 93); let k = wet > .58 ? 1 : wet > .5 ? 2 : 3; if (fine > .8) k += 1; else if (fine < .16) k -= 1; if (wet > .56 && wet < .585) k = 0; if (hash(x, y, 97) > .985) k = 4; return P.quick[clamp(k, 0, 4)]; }, dec: [['bubble', .5]] },
    { id: 'mineral_deposit', f: (x, y) => { const c = mineral(x, y), v = pn(x, y, .09, .09, 83); if (v > .64 && hash(x, y, 87) > .78) return (hash(x >> 2, y >> 2, 89) > .5 ? P.copper : P.gold)[2 + (hash(x, y, 90) > .5 ? 1 : 0)]; return c; }, dec: [['stone', 2, P.rock], ['pebble', 3.2, P.rock], ['pebble', 1, P.copper]] },
    { id: 'crystal_formation', f: (x, y) => { const c = crystal(x, y), v = pn(x, y, .07, .07, 99); if (v > .66) { const id = pvor(x, y, 3.4, 101); if (VEDGE > 1 && id > .55) return TEAL[clamp(1 + Math.floor(id * 4) + (VDX + VDY < 0 ? 1 : -1), 0, 4)]; } return c; }, dec: [['pebble', 1.4, P.rock], ['stone', .3, P.rock]] },
    { id: 'soil_poor', f: GT.poor, dec: [['pebble', .5, P.rockWarm]] },
    { id: 'soil_loam', f: GT.soil, dec: [['pebble', .5, P.rockWarm]] },
    { id: 'soil_rich', f: GT.rich, dec: [['pebble', .5, P.rockWarm]] },
    { id: 'soil_preta', f: preta, dec: [['pebble', .5, P.rockWarm]] }
  );
}
