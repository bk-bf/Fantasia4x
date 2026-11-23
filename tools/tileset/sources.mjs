export const BAKE_ART = [
  'gfx.js',
  'mat.js',
  'periodic.js',
  'world.js',
  'ground.js',
  'flora.js',
  'build.js',
  'actors.js'
];

export const REGISTRY_ART = [
  'gfx.js',
  'mat.js',
  'registry/world.js',
  'flora.js',
  'build.js',
  'actors.js',
  'registry/db-core.js',
  'registry/db-mockup.js',
  'registry/db-flora.js',
  'registry/db-creatures.js',
  'registry/db-buildings.js',
  'registry/db-ground.js',
  'registry/db-folk.js',
  'registry/db-items.js',
  'registry/db-hd.js',
  'registry/db-tools.js',
  'registry/db-weapons.js',
  'registry/db-gear.js',
  'registry/db-goods.js',
  'registry/db-armor.js',
  'registry/db-rare.js',
  'registry/db-rot.js',
  'registry/db-stations.js',
  'registry/db-facings.js'
];

export const COLONY_ART = [
  'gfx.js',
  'mat.js',
  'registry/world.js',
  'flora.js',
  'build.js',
  'actors.js',
  'colony.js',
  'scene.js'
];

export const HAND_PORTED = ['periodic.js', 'world.js', 'ground.js'];

export const mockupName = (artPath = '') => artPath.replace(/^registry\//, '');
