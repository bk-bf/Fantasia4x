export const GL_LIMITS = { MAX_TEXTURE_IMAGE_UNITS: 0x8872 };

export const TEXTURE_UNITS = 16;

export function glLimit(name: string, args: readonly unknown[]): number | undefined {
  return name === 'getParameter' && args[0] === GL_LIMITS.MAX_TEXTURE_IMAGE_UNITS
    ? TEXTURE_UNITS
    : undefined;
}
