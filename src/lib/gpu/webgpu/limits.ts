import { ShaderStage, type BindGroupLayoutEntry, type GpuLimits } from '../device.js';

export type BindingLimits = Pick<
  GpuLimits,
  | 'maxBindGroups'
  | 'maxBindingsPerBindGroup'
  | 'maxSampledTexturesPerShaderStage'
  | 'maxUniformBuffersPerShaderStage'
>;

export function bindingError(binding: number, limits: BindingLimits): string | null {
  return binding >= limits.maxBindingsPerBindGroup
    ? `binding ${binding} is past this device's ${limits.maxBindingsPerBindGroup} bindings per group`
    : null;
}

const STAGES = [
  ['vertex', ShaderStage.VERTEX],
  ['fragment', ShaderStage.FRAGMENT]
] as const;

export function pipelineLayoutError(
  groups: readonly (readonly BindGroupLayoutEntry[])[],
  limits: BindingLimits
): string | null {
  if (groups.length > limits.maxBindGroups)
    return `${groups.length} bind groups are past this device's ${limits.maxBindGroups}`;
  for (const [stage, bit] of STAGES) {
    const seen = groups.flat().filter((e) => (e.visibility & bit) !== 0);
    const textures = seen.filter((e) => 'texture' in e).length;
    if (textures > limits.maxSampledTexturesPerShaderStage)
      return `${textures} sampled textures in the ${stage} stage are past this device's ${limits.maxSampledTexturesPerShaderStage}`;
    const uniforms = seen.filter((e) => 'buffer' in e).length;
    if (uniforms > limits.maxUniformBuffersPerShaderStage)
      return `${uniforms} uniform buffers in the ${stage} stage are past this device's ${limits.maxUniformBuffersPerShaderStage}`;
  }
  return null;
}
