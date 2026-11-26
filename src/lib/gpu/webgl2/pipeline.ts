import type {
  CompiledModule,
  GpuRenderPipeline,
  GpuShaderModule,
  GpuUniform,
  RenderPipelineDescriptor,
  RenderPipelineResult,
  VertexBufferLayout
} from '../device.js';
import { blendFactor, compareFunction, topology } from './formats.js';

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

export interface Webgl2Uniform {
  program: WebGLProgram;
  location: WebGLUniformLocation;
}

interface LinkedProgram {
  program: WebGLProgram;
  uniforms: Map<string, GpuUniform>;
  users: number;
}

export interface Webgl2Pipeline {
  program: WebGLProgram;
  buffers: VertexBufferLayout[];
  layoutKey: string;
  topology: number;
  blend: readonly [number, number, number, number] | null;
  depth: { func: number; write: boolean } | null;
}

function uniformsOf(gl: WebGL2RenderingContext, program: WebGLProgram): Map<string, GpuUniform> {
  const uniforms = new Map<string, GpuUniform>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const location = gl.getUniformLocation(program, info.name);
    if (location === null) continue;
    const uniform: Webgl2Uniform = { program, location };
    uniforms.set(info.name, uniform as unknown as GpuUniform);
  }
  return uniforms;
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

function pipelineState(
  gl: WebGL2RenderingContext,
  desc: RenderPipelineDescriptor,
  program: WebGLProgram
): Webgl2Pipeline {
  const blend = desc.fragment.targets[0].blend;
  const depth = desc.depthStencil;
  const testsDepth = depth && (depth.depthCompare !== 'always' || depth.depthWriteEnabled);
  return {
    program,
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
      : null
  };
}

export class Webgl2Pipelines {
  private readonly linked = new Map<string, LinkedProgram>();
  private readonly pipelines = new WeakMap<GpuRenderPipeline, Webgl2Pipeline>();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  create(desc: RenderPipelineDescriptor): RenderPipelineResult {
    const modules: CompiledModule[] = [];
    const key = JSON.stringify([desc.glsl.vertex, desc.glsl.fragment, desc.glsl.attributes]);
    let linked = this.linked.get(key);
    if (!linked) {
      const made = link(this.gl, desc, modules);
      if ('error' in made) return { ok: false, error: made.error, modules };
      linked = { program: made.program, uniforms: uniformsOf(this.gl, made.program), users: 0 };
      this.linked.set(key, linked);
    }
    linked.users++;
    const state = pipelineState(this.gl, desc, linked.program);
    const pipeline = state as unknown as GpuRenderPipeline;
    this.pipelines.set(pipeline, state);
    return { ok: true, pipeline, uniforms: linked.uniforms, modules };
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
