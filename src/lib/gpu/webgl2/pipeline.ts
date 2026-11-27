import type {
  BindingSlot,
  CompiledModule,
  GpuBindGroupLayout,
  GpuRenderPipeline,
  GpuShaderModule,
  RenderPipelineDescriptor,
  RenderPipelineResult,
  StencilFaceState,
  VertexBufferLayout
} from '../device.js';
import { blendFactor, compareFunction, stencilOperation, topology } from './formats.js';

function reportShaderErrors(source: string, error: string, name: string): void {
  const lines = source.split('\n');

  console.group(`🔍 Shader Error Details: ${name}`);

  const errorLines = error.split('\n');
  const lineRegex = /ERROR: \d+:(\d+):/;

  errorLines.forEach((errorLine) => {
    const match = errorLine.match(lineRegex);
    if (match) {
      const lineNum = parseInt(match[1]) - 1;
      if (lineNum >= 0 && lineNum < lines.length) {
        console.error(`Line ${lineNum + 1}: ${lines[lineNum]}`);
      }
    }
    console.error(errorLine);
  });

  console.groupEnd();
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  name: string,
  modules: CompiledModule[]
): WebGLShader | null {
  const shader = gl.createShader(type);

  if (!shader) {
    console.error(`Failed to create shader: ${name}`);
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    const shaderType = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';

    console.error(`❌ ${shaderType} shader compilation failed (${name}):`);
    console.error(error);

    reportShaderErrors(source, error || '', name);

    gl.deleteShader(shader);
    return null;
  }

  modules.push({ label: name, module: shader as unknown as GpuShaderModule });
  return shader;
}

export const FIRST_BOUND_UNIT = 0;
const INVALID_INDEX = 0xffffffff;

export interface LinkedProgram {
  program: WebGLProgram;
  blocks: { slot: BindingSlot; point: number }[];
  textures: { slot: BindingSlot; sampler?: BindingSlot; unit: number }[];
  users: number;
}

export interface Webgl2Pipeline {
  program: WebGLProgram;
  linked: LinkedProgram;
  layout: GpuBindGroupLayout[];
  buffers: VertexBufferLayout[];
  layoutKey: string;
  topology: number;
  blend: readonly [number, number, number, number] | null;
  depth: { func: number; write: boolean } | null;
  stencil: { front: GlStencilFace; back: GlStencilFace } | null;
}

export interface GlStencilFace {
  func: number;
  passOp: number;
}

const NO_STENCIL: StencilFaceState = { compare: 'always', passOp: 'keep' };

function stencilFace(gl: WebGL2RenderingContext, face: StencilFaceState): GlStencilFace {
  return { func: compareFunction(gl, face.compare), passOp: stencilOperation(gl, face.passOp) };
}

function stencilState(
  gl: WebGL2RenderingContext,
  depth: RenderPipelineDescriptor['depthStencil']
): Webgl2Pipeline['stencil'] {
  if (!depth?.stencilFront && !depth?.stencilBack) return null;
  if (depth.format !== 'depth24plus-stencil8')
    throw new Error(`a stencil state needs a depth24plus-stencil8 target, not ${depth.format}`);
  return {
    front: stencilFace(gl, depth.stencilFront ?? NO_STENCIL),
    back: stencilFace(gl, depth.stencilBack ?? NO_STENCIL)
  };
}

function link(
  gl: WebGL2RenderingContext,
  desc: RenderPipelineDescriptor,
  modules: CompiledModule[]
): { program: WebGLProgram } | { error: string } {
  const name = desc.label;
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    desc.glsl.vertex,
    `${name}_vertex`,
    modules
  );
  if (!vertexShader) return { error: 'Vertex shader compilation failed' };
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    desc.glsl.fragment,
    `${name}_fragment`,
    modules
  );
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    return { error: 'Fragment shader compilation failed' };
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return { error: 'Failed to create shader program' };
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  for (const [attribute, location] of Object.entries(desc.glsl.attributes))
    gl.bindAttribLocation(program, location, attribute);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return { error: `Shader program linking failed: ${error}` };
  }
  gl.validateProgram(program);
  if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS) && desc.debug)
    console.warn(`Shader program validation warning: ${gl.getProgramInfoLog(program)}`);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return { program };
}

export function uniformPoint([group, binding]: BindingSlot): number {
  if (binding >= 8)
    throw new Error(`uniform block binding ${binding} is past the 8 a group may use`);
  return group * 8 + binding;
}

function bindings(
  gl: WebGL2RenderingContext,
  desc: RenderPipelineDescriptor,
  program: WebGLProgram,
  use: (program: WebGLProgram) => void,
  checkOffsets: boolean
): Pick<LinkedProgram, 'blocks' | 'textures'> | { error: string } {
  const blocks: LinkedProgram['blocks'] = [];
  for (const [name, block] of Object.entries(desc.glsl.blocks ?? {})) {
    const index = gl.getUniformBlockIndex(program, name);
    if (index === INVALID_INDEX) continue;
    const point = uniformPoint(block.slot);
    gl.uniformBlockBinding(program, index, point);
    blocks.push({ slot: block.slot, point });
    if (!checkOffsets) continue;
    const members = Object.keys(block.offsets);
    const indices = gl.getUniformIndices(program, members) ?? [];
    const active = members.filter((_, i) => indices[i] !== INVALID_INDEX);
    const at = gl.getActiveUniforms(
      program,
      indices.filter((i) => i !== INVALID_INDEX),
      gl.UNIFORM_OFFSET
    ) as number[];
    for (let i = 0; i < active.length; i++)
      if (at[i] !== block.offsets[active[i]])
        return {
          error: `${desc.label}: ${name}.${active[i]} sits at ${at[i]}, the layout says ${block.offsets[active[i]]}`
        };
  }
  const textures: LinkedProgram['textures'] = [];
  const named = Object.entries(desc.glsl.textures ?? {}).sort(
    ([, a], [, b]) => a.texture[0] - b.texture[0] || a.texture[1] - b.texture[1]
  );
  if (named.length > 0) use(program);
  named.forEach(([name, t], i) => {
    const unit = FIRST_BOUND_UNIT + i;
    const location = gl.getUniformLocation(program, name);
    if (location === null) return;
    gl.uniform1i(location, unit);
    textures.push({ slot: t.texture, sampler: t.sampler, unit });
  });
  return { blocks, textures };
}

function pipelineState(
  gl: WebGL2RenderingContext,
  desc: RenderPipelineDescriptor,
  linked: LinkedProgram
): Webgl2Pipeline {
  const program = linked.program;
  const blend = desc.fragment.targets[0].blend;
  const depth = desc.depthStencil;
  const testsDepth = depth && (depth.depthCompare !== 'always' || depth.depthWriteEnabled);
  return {
    program,
    linked,
    layout: desc.layout,
    buffers: desc.vertex.buffers,
    layoutKey: JSON.stringify(desc.vertex.buffers),
    topology: topology(gl, desc.primitive.topology),
    blend: blend
      ? [
          blendFactor(gl, blend.color.srcFactor),
          blendFactor(gl, blend.color.dstFactor),
          blendFactor(gl, blend.alpha.srcFactor),
          blendFactor(gl, blend.alpha.dstFactor)
        ]
      : null,
    depth: testsDepth
      ? { func: compareFunction(gl, depth.depthCompare), write: depth.depthWriteEnabled }
      : null,
    stencil: stencilState(gl, depth)
  };
}

export class Webgl2Pipelines {
  private readonly linked = new Map<string, LinkedProgram>();
  private readonly pipelines = new WeakMap<GpuRenderPipeline, Webgl2Pipeline>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly use: (program: WebGLProgram) => void,
    private readonly checkOffsets: boolean
  ) {}

  create(desc: RenderPipelineDescriptor): RenderPipelineResult {
    const modules: CompiledModule[] = [];
    const key = JSON.stringify(desc.glsl);
    let linked = this.linked.get(key);
    if (!linked) {
      const made = link(this.gl, desc, modules);
      if ('error' in made) return { ok: false, error: made.error, modules };
      const bound = bindings(this.gl, desc, made.program, this.use, this.checkOffsets);
      if ('error' in bound) {
        this.gl.deleteProgram(made.program);
        return { ok: false, error: bound.error, modules };
      }
      linked = {
        program: made.program,
        ...bound,
        users: 0
      };
      this.linked.set(key, linked);
    }
    linked.users++;
    const state = pipelineState(this.gl, desc, linked);
    const pipeline = state as unknown as GpuRenderPipeline;
    this.pipelines.set(pipeline, state);
    return { ok: true, pipeline, modules };
  }

  get(pipeline: GpuRenderPipeline): Webgl2Pipeline {
    const state = this.pipelines.get(pipeline);
    if (!state) throw new Error('not a pipeline this device created');
    return state;
  }

  destroy(pipeline: GpuRenderPipeline): void {
    const state = this.pipelines.get(pipeline);
    if (!state) return;
    this.pipelines.delete(pipeline);
    for (const [key, linked] of this.linked) {
      if (linked.program !== state.program || --linked.users > 0) continue;
      this.gl.deleteProgram(linked.program);
      this.linked.delete(key);
    }
  }
}
