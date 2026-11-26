import source from '../shaders/treeParts.glsl?raw';

const MARKER = '#define TREE_PARTS_CODE\n';

export const withTreeParts = (shader: string): string => shader.replace(MARKER, `${source}\n`);
