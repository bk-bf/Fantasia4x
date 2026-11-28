import source from '../shaders/rockSurface.glsl?raw';

const MARKER = '#define ROCK_SURFACE_CODE\n';

export const withRockSurface = (shader: string): string => shader.replace(MARKER, `${source}\n`);
