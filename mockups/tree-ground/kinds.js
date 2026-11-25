'use strict';
(() => {
  const NEEDLE = ['#2e1e12', '#402a18', '#553820', '#6b4a2a', '#825e36'];
  const GREY_SOIL = ['#2a2622', '#3a342e', '#4c443a', '#5e5548', '#726857'];
  const GREY_GRASS = ['#3a3a2c', '#4c4c38', '#626046', '#7a7656', '#928c68'];
  const SCORCH = ['#100c0c', '#1a1312', '#261a17', '#34231d', '#463024'];
  const ASH = ['#5e5a52', '#7a756a', '#959082', '#aea897', '#c6c0ae'];
  const RUST = ['#3c1d12', '#5a2a15', '#7c3c18', '#9e531d', '#bb6d26'];
  const SLAG = ['#1c1d22', '#2a2c33', '#3a3d44', '#4d5158', '#62676c'];
  const MOON = ['#27335e', '#3d4d7e', '#5f72a0', '#8c9cc0', '#bcc8dc', '#e6ecf2'];
  const HEX = ['#1a1220', '#241a2a', '#302436', '#3e3042', '#4e3e50'];
  const RIME = ['#5d8fa0', '#86b4bf', '#b0d2d6', '#d4e8e8', '#f2fafa'];
  const WET = ['#161d1c', '#1f2a26', '#2b3a31', '#3b4d3d', '#506449'];
  const TURF = ['#344d26', '#47632c', '#5f7a34', '#7a923f', '#93a84a'];

  const KINDS = {
    oak: {
      bed: 'litter',
      herb: { ramp: 'oak', amount: 0.7 },
      fleck: { shape: 'leaf', bed: 0.2, out: 0.05, cols: [['litter', 4], ['litter', 3], ['fallOrange', 2]] },
      props: [['cushion', 3, 6, 'foot', 0, 'moss'], ['fern', 2, 5, 0.7, 1.4], ['gtuft', 5, 10, 'rim', 0, 'oak'], ['shroom', 1, 3, 0.5, 1.2], ['twig', 1, 2, 0.6, 1.4]],
      roots: { n: [5, 9], moss: 'moss' },
      autumn: { fall: 'fallOrange', carpet: 0.55 },
      winter: 'buried'
    },
    ash: {
      bed: 'litter',
      herb: { ramp: 'oak', amount: 0.7 },
      fleck: { shape: 'leaf', bed: 0.16, out: 0.04, cols: [['litter', 4], ['soilPoor', 4], ['litter', 3]] },
      props: [['cushion', 2, 5, 'foot', 0, 'moss'], ['fern', 3, 5, 0.7, 1.4], ['gtuft', 4, 9, 'rim', 0, 'oak'], ['twig', 1, 2, 0.6, 1.4]],
      roots: { n: [4, 8], moss: 'moss' },
      autumn: { fall: 'fallYellow', carpet: 0.5 },
      winter: 'buried'
    },
    birch: {
      gain: 0.9,
      bed: 'soilPoor',
      herb: { ramp: 'grassLoam', amount: 0.62 },
      fleck: { shape: 'leaf', bed: 0.2, out: 0.07, cols: [['fallYellow', 3], ['fallYellow', 4], ['birch', 4]] },
      props: [['gtuft', 6, 10, 'rim', 0, 'grassLoam'], ['cushion', 1, 3, 'foot', 0, 'olive'], ['shroom', 1, 2, 0.5, 1.1, 'red']],
      roots: { n: [3, 6] },
      autumn: { fall: 'fallYellow', carpet: 0.6 },
      winter: 'buried'
    },
    apple: {
      gain: 0.95,
      bed: TURF,
      remap: true,
      core: 'litter',
      fleck: { shape: 'leaf', bed: 0.05, out: 0.0, cols: [['grassLoam', 4], ['grassLoam', 3]] },
      props: [['apple', 5, 8, 0.45, 1.5], ['flower', 3, 4, 0.8, 1.5, 'white'], ['gtuft', 3, 6, 'rim', 0, 'grass']],
      roots: { n: [3, 6] },
      autumn: { fall: 'fallRed', carpet: 0.25, props: [['apple', 9, 14, 0.4, 1.6]] },
      winter: 'buried'
    },
    willow: {
      gain: 1.05,
      bed: 'mud',
      tint: { mode: 'wet', reach: 0.24 },
      herb: { ramp: 'mossSwamp', amount: 0.82 },
      fleck: { shape: 'leaf', bed: 0.06, out: 0.02, cols: [['willow', 4], ['willow', 3]] },
      props: [['sedge', 5, 8, 0.6, 1.6, 'mossSwamp'], ['puddle', 1, 2, 0.8, 1.3], ['cushion', 2, 4, 'foot', 0, 'olive'], ['gtuft', 4, 8, 'rim', 0, 'mossSwamp']],
      roots: { n: [4, 7] },
      autumn: { fall: 'fallYellow', carpet: 0.3 },
      winter: 'buried',
      winterProps: [['sedge', 4, 6, 0.6, 1.5, 'savanna'], ['ice', 1, 2, 0.8, 1.3]]
    },
    pine: {
      bed: NEEDLE,
      hard: true,
      fleck: { shape: 'needle', bed: 0.34, out: 0.05, cols: [[NEEDLE, 4], [NEEDLE, 3], ['fallOrange', 3]] },
      props: [['cone', 4, 7, 0.5, 1.4], ['twig', 2, 3, 0.6, 1.4], ['gtuft', 2, 5, 'rim', 0, 'grassDry']],
      roots: { n: [4, 7] },
      winter: 'well'
    },
    yew: {
      bed: 'soilRich',
      hard: true,
      herb: { ramp: 'oak', amount: 0.36, low: 1 },
      fleck: { shape: 'needle', bed: 0.2, out: 0.03, cols: [['pine', 4], ['pine', 3], ['red', 3]] },
      props: [['berry', 3, 5, 0.4, 1.3], ['cushion', 2, 4, 'foot', 0, 'moss'], ['fern', 1, 2, 0.8, 1.4], ['gtuft', 3, 6, 'rim', 0, 'moss']],
      roots: { n: [5, 8], moss: 'moss' },
      winter: 'well'
    },
    dead: {
      gain: 0.8,
      bed: GREY_SOIL,
      tint: { mode: 'remap', ramp: GREY_GRASS, reach: 0.12 },
      herb: { ramp: GREY_GRASS, amount: 0.45 },
      fleck: { shape: 'leaf', bed: 0.07, out: 0.02, cols: [['woodGrey', 4], ['woodGrey', 3]] },
      props: [['branch', 2, 4, 0.6, 1.5, 'woodGrey'], ['twig', 2, 3, 0.5, 1.4], ['gtuft', 3, 6, 'rim', 0, 'savanna'], ['shroom', 1, 2, 0.4, 1]],
      roots: { n: [3, 6] },
      winter: 'buried'
    },
    heartwood: {
      bed: 'preta',
      herb: { ramp: 'heart', amount: 0.66, low: 2 },
      fleck: { shape: 'leaf', bed: 0.1, out: 0.03, cols: [['heart', 4], ['heart', 3]] },
      props: [['cushion', 3, 7, 'foot', 0, 'heart'], ['flower', 4, 9, 0.6, 1.5, 'heart'], ['fern', 2, 4, 0.8, 1.5, 'heartFern'], ['gtuft', 3, 7, 'rim', 0, 'moss']],
      roots: { n: [5, 10], vein: ['heart', 5] },
      winter: 'well'
    },
    frostheart: {
      bed: RIME,
      hard: true,
      crack: { col: ['frost', 3] },
      tint: { mode: 'rime', reach: 0.13 },
      fleck: { shape: 'glint', bed: 0.06, out: 0.02, cols: [['snow', 4]] },
      props: [['crystal', 4, 9, 0.5, 1.5, 'frost']],
      roots: { n: [4, 8], cap: ['snow', 4] },
      winter: 'ice'
    },
    moonwood: {
      bed: 'soilRich',
      herb: { ramp: MOON, amount: 0.7, low: 1 },
      fleck: { shape: 'glint', bed: 0.04, out: 0.02, cols: [[MOON, 5]] },
      props: [['cushion', 3, 7, 'foot', 0, 'moon'], ['flower', 4, 9, 0.6, 1.6, 'moon'], ['shroom', 2, 4, 0.5, 1.3, 'moon'], ['gtuft', 2, 5, 'rim', 0, 'moss']],
      roots: { n: [4, 8], vein: [MOON, 4] },
      winter: 'buried',
      glow: '#cfe0f6',
      glowNoise: true
    },
    ironwood: {
      bed: SLAG,
      hard: true,
      moss: { ramp: RUST, amount: 0.55, base: 1, stain: true },
      fleck: { shape: 'glint', bed: 0.03, out: 0.0, cols: [['iron', 5]] },
      props: [['stone', 4, 9, 0.5, 1.5, 'iron'], ['shard', 2, 4, 0.6, 1.4, 'iron']],
      roots: { n: [6, 10], straight: true },
      winter: 'well',
      stain: RUST
    },
    emberwood: {
      gain: 1.05,
      bed: SCORCH,
      hard: true,
      crack: { col: ['ember', 4], hot: ['fire', 3] },
      tint: { mode: 'remap', ramp: 'grassDry', reach: 0.16 },
      fleck: { shape: 'leaf', bed: 0.1, out: 0.03, cols: [[ASH, 2], [ASH, 3]] },
      props: [['coal', 4, 9, 0.5, 1.4], ['branch', 1, 3, 0.6, 1.4, 'furDark'], ['gtuft', 4, 8, 'rim', 0, 'savanna']],
      roots: { n: [4, 8], vein: ['ember', 4] },
      winter: 'melt'
    },
    soulwood: {
      bed: GREY_SOIL,
      tint: { mode: 'wet', reach: 0.14 },
      herb: { ramp: 'soul', amount: 0.7, low: 1 },
      fleck: { shape: 'glint', bed: 0.04, out: 0.02, cols: [['soul', 5]] },
      props: [['cushion', 3, 7, 'foot', 0, 'soul'], ['bell', 4, 9, 0.6, 1.6, 'soul'], ['sedge', 3, 5, 0.7, 1.5, 'soulSedge']],
      roots: { n: [4, 8], vein: ['soul', 4] },
      winter: 'buried',
      glow: '#c4ece2',
      glowNoise: true
    },
    witchwood: {
      bed: HEX,
      tint: { mode: 'hex', reach: 0.14 },
      herb: { ramp: 'witch', amount: 0.4, low: 1 },
      fleck: { shape: 'leaf', bed: 0.05, out: 0.0, cols: [['witch', 4], ['witch', 3]] },
      props: [['shroom', 2, 4, 0.4, 0.8, 'witch'], ['cushion', 2, 4, 'foot', 0, 'witch']],
      ring: { type: 'shroom', n: [8, 15], r: [1.25, 1.2], palette: 'witch' },
      roots: { n: [5, 9] },
      winter: 'well'
    },
    bonewood: {
      bed: ASH,
      hard: true,
      crack: { col: [ASH, 0] },
      tint: { mode: 'remap', ramp: GREY_GRASS, reach: 0.2 },
      fleck: { shape: 'leaf', bed: 0.03, out: 0.0, cols: [['bone', 5]] },
      props: [['bone', 4, 9, 0.5, 1.5], ['skull', 0, 1, 0.9, 1.2], ['gtuft', 2, 4, 'rim', 0, 'savanna']],
      roots: { n: [4, 8] },
      winter: 'buried',
      stain: ASH
    }
  };

  const GROUND = {
    g: { gain: 1, grassy: true },
    o: { gain: 0.86, grassy: true },
    s: { gain: 1, grassy: false },
    m: { gain: 0.92, grassy: false },
    c: { gain: 0.86, grassy: false },
    a: { gain: 0.76, grassy: false, dry: true },
    r: { gain: 0.72, grassy: false, dry: true },
    b: { gain: 0.6, grassy: false, wet: true },
    w: { gain: 0, grassy: false },
    x: { gain: 0, grassy: false }
  };

  window.TGK = { KINDS, GROUND };
})();
