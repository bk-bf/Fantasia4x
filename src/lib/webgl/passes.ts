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
  'effects'
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
