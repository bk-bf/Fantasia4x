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
  'registry/db-rot.js',
  'registry/db-stations.js'
];

export const HAND_PORTED = ['periodic.js', 'world.js', 'ground.js'];

export const mockupName = (artPath = '') => artPath.replace(/^registry\//, '');
