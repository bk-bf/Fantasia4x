const RENDER_PASSES = [
  'gl',
  'terrain',
  'snow',
  'resources',
  'buildings',
  'items',
  'creatures',
  'tall-resources',
  'overlay',
  'effects',
  'glsl-only'
] as const;

type RenderPass = (typeof RENDER_PASSES)[number];

function readSkippedPasses(search: string): Set<RenderPass> {
  const named = (new URLSearchParams(search).get('skip') ?? '').split(',');
  return new Set(RENDER_PASSES.filter((p) => named.includes(p)));
}

const SKIPPED: Set<RenderPass> =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? readSkippedPasses(window.location?.search ?? '')
    : new Set();

export const passOn = (pass: RenderPass): boolean => !SKIPPED.has(pass);

export const readValidateFlag = (search: string): boolean =>
  new URLSearchParams(search).get('validate') === '1';

export const GPU_VALIDATE: boolean =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? readValidateFlag(window.location?.search ?? '')
    : false;

export type GpuSwitch = 'webgpu' | 'webgl2' | null;

export function readGpuSwitch(search: string): GpuSwitch {
  const named = new URLSearchParams(search).get('gpu');
  return named === 'webgpu' || named === 'webgl2' ? named : null;
}

export const GPU_SWITCH: GpuSwitch =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? readGpuSwitch(window.location?.search ?? '')
    : null;
