import type {
  CompiledModule,
  GpuPipeline,
  GpuShaderModule,
  GpuUniform,
  RenderPipelineDescriptor,
  RenderPipelineResult
} from '../device.js';

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

function introspect(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): { uniforms: Map<string, GpuUniform>; attributes: Map<string, number> } {
  const uniforms = new Map<string, GpuUniform>();
  const attributes = new Map<string, number>();

  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

  for (let i = 0; i < numUniforms; i++) {
    const uniformInfo = gl.getActiveUniform(program, i);
    if (uniformInfo) {
      const location = gl.getUniformLocation(program, uniformInfo.name);
      if (location !== null) {
        uniforms.set(uniformInfo.name, location as unknown as GpuUniform);
      }
    }
  }

  for (let i = 0; i < numAttributes; i++) {
    const attributeInfo = gl.getActiveAttrib(program, i);
    if (attributeInfo) {
      const location = gl.getAttribLocation(program, attributeInfo.name);
      if (location !== -1) {
        attributes.set(attributeInfo.name, location);
      }
    }
  }

  return { uniforms, attributes };
}

export function createRenderPipeline(
  gl: WebGL2RenderingContext,
  desc: RenderPipelineDescriptor
): RenderPipelineResult {
  const name = desc.label;
  const modules: CompiledModule[] = [];

  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    desc.glsl.vertex,
    `${name}_vertex`,
    modules
  );
  if (!vertexShader) {
    return { ok: false, error: 'Vertex shader compilation failed', modules };
  }

  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    desc.glsl.fragment,
    `${name}_fragment`,
    modules
  );
  if (!fragmentShader) {
    gl.deleteShader(vertexShader);
    return { ok: false, error: 'Fragment shader compilation failed', modules };
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return { ok: false, error: 'Failed to create shader program', modules };
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  desc.attributeLocations?.forEach((at, attribute) => gl.bindAttribLocation(program, at, attribute));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return { ok: false, error: `Shader program linking failed: ${error}`, modules };
  }

  gl.validateProgram(program);
  if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
    const warning = gl.getProgramInfoLog(program);
    if (desc.debug) {
      console.warn(`Shader program validation warning: ${warning}`);
    }
  }

  const { uniforms, attributes } = introspect(gl, program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return {
    ok: true,
    pipeline: program as unknown as GpuPipeline,
    uniforms,
    attributes,
    modules
  };
}
