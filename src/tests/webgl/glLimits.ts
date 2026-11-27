export const GL_LIMITS = { MAX_TEXTURE_IMAGE_UNITS: 0x8872 };

export const TEXTURE_UNITS = 16;

export function glLimit(name: string, args: readonly unknown[]): number | undefined {
  return name === 'getParameter' && args[0] === GL_LIMITS.MAX_TEXTURE_IMAGE_UNITS
    ? TEXTURE_UNITS
    : undefined;
}

export function quietGl(): WebGL2RenderingContext {
  return new Proxy(GL_LIMITS, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => glLimit(key, args) ?? (key === 'getUniformBlockIndex' ? 0xffffffff : {});
    }
  }) as unknown as WebGL2RenderingContext;
}
