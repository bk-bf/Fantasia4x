import type { ShaderProgram } from './types.js';
import vertexShaderSource from './shaders/vertex.glsl?raw';
import fragmentShaderSource from './shaders/fragment.glsl?raw';

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export interface ShaderCompilationResult {
  success: boolean;
  program?: WebGLProgram;
  error?: string;
  warnings?: string[];
}

export class ShaderManager {
  private gl: WebGL2RenderingContext;
  private programs: Map<string, ShaderProgram> = new Map();
  private shaderCache: Map<string, WebGLShader> = new Map();
  private debug: boolean;

  constructor(gl: WebGL2RenderingContext, debug: boolean = false) {
    this.gl = gl;
    this.debug = debug;
  }

  async loadShaderSource(vertexPath: string, fragmentPath: string): Promise<ShaderSource> {
    try {
      const [vertexResponse, fragmentResponse] = await Promise.all([
        fetch(vertexPath),
        fetch(fragmentPath)
      ]);

      if (!vertexResponse.ok || !fragmentResponse.ok) {
        throw new Error('Failed to load shader files');
      }

      const vertex = await vertexResponse.text();
      const fragment = await fragmentResponse.text();

      return { vertex, fragment };
    } catch (error) {
      console.error('Error loading shader source:', error);
      throw error;
    }
  }

  createProgram(
    name: string,
    vertexSource: string,
    fragmentSource: string
  ): ShaderCompilationResult {
    const gl = this.gl;

    try {
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource, `${name}_vertex`);
      if (!vertexShader) {
        return { success: false, error: 'Vertex shader compilation failed' };
      }

      const fragmentShader = this.compileShader(
        gl.FRAGMENT_SHADER,
        fragmentSource,
        `${name}_fragment`
      );
      if (!fragmentShader) {
        gl.deleteShader(vertexShader);
        return { success: false, error: 'Fragment shader compilation failed' };
      }

      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return { success: false, error: 'Failed to create shader program' };
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return {
          success: false,
          error: `Shader program linking failed: ${error}`
        };
      }

      gl.validateProgram(program);
      if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        const warning = gl.getProgramInfoLog(program);
        if (this.debug) {
          console.warn(`Shader program validation warning: ${warning}`);
        }
      }

      const shaderProgram = this.cacheLocations(program, name);
      this.programs.set(name, shaderProgram);

      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (this.debug) {
        console.log(`✅ Shader program "${name}" compiled successfully`);
        this.logProgramInfo(shaderProgram);
      }

      return { success: true, program };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Shader compilation error for "${name}":`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private compileShader(type: number, source: string, name: string): WebGLShader | null {
    const gl = this.gl;
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

      this.reportShaderErrors(source, error || '', name);

      gl.deleteShader(shader);
      return null;
    }

    this.shaderCache.set(name, shader);
    return shader;
  }

  private cacheLocations(program: WebGLProgram, name: string): ShaderProgram {
    const gl = this.gl;
    const uniforms = new Map<string, WebGLUniformLocation>();
    const attributes = new Map<string, number>();

    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

    for (let i = 0; i < numUniforms; i++) {
      const uniformInfo = gl.getActiveUniform(program, i);
      if (uniformInfo) {
        const location = gl.getUniformLocation(program, uniformInfo.name);
        if (location !== null) {
          uniforms.set(uniformInfo.name, location);
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

    return {
      program,
      uniforms,
      attributes
    };
  }

  private reportShaderErrors(source: string, error: string, name: string): void {
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

  private logProgramInfo(shaderProgram: ShaderProgram): void {
    console.group('🔧 Shader Program Info');

    console.log('Uniforms:', Array.from(shaderProgram.uniforms.keys()));
    console.log('Attributes:', Array.from(shaderProgram.attributes.keys()));

    const gl = this.gl;
    console.log('WebGL Limits:', {
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    });

    console.groupEnd();
  }

  getProgram(name: string): ShaderProgram | undefined {
    return this.programs.get(name);
  }

  useProgram(name: string): boolean {
    const shaderProgram = this.programs.get(name);
    if (!shaderProgram) {
      console.error(`Shader program "${name}" not found`);
      return false;
    }

    this.gl.useProgram(shaderProgram.program);
    return true;
  }

  setUniform(
    programName: string,
    uniformName: string,
    value: number | number[] | Float32Array
  ): boolean {
    const program = this.programs.get(programName);
    if (!program) {
      console.error(`Shader program "${programName}" not found`);
      return false;
    }

    const location = program.uniforms.get(uniformName);
    if (!location) {
      if (this.debug) {
        console.warn(`Uniform "${uniformName}" not found in program "${programName}"`);
      }
      return false;
    }

    const gl = this.gl;

    if (typeof value === 'number') {
      if (
        uniformName.includes('u_') &&
        (uniformName.includes('Atlas') ||
          uniformName.includes('Texture') ||
          uniformName.includes('sampler'))
      ) {
        gl.uniform1i(location, value);
      } else {
        gl.uniform1f(location, value);
      }
    } else if (Array.isArray(value) || value instanceof Float32Array) {
      switch (value.length) {
        case 1:
          gl.uniform1f(location, value[0]);
          break;
        case 2:
          gl.uniform2fv(location, value);
          break;
        case 3:
          gl.uniform3fv(location, value);
          break;
        case 4:
          gl.uniform4fv(location, value);
          break;
        case 16:
          gl.uniformMatrix4fv(location, false, value);
          break;
        default:
          console.error(`Unsupported uniform array length: ${value.length}`);
          return false;
      }
    } else {
      console.error(`Unsupported uniform value type: ${typeof value}`);
      return false;
    }

    return true;
  }

  getAttributeLocation(programName: string, attributeName: string): number {
    const program = this.programs.get(programName);
    if (!program) {
      console.error(`Shader program "${programName}" not found`);
      return -1;
    }

    return program.attributes.get(attributeName) ?? -1;
  }

  async reloadProgram(name: string, vertexPath?: string, fragmentPath?: string): Promise<boolean> {
    if (!vertexPath || !fragmentPath) {
      console.error('Shader paths required for hot reload');
      return false;
    }

    try {
      const { vertex, fragment } = await this.loadShaderSource(vertexPath, fragmentPath);
      const result = this.createProgram(name, vertex, fragment);

      if (result.success) {
        console.log(`🔄 Hot reloaded shader program: ${name}`);
        return true;
      } else {
        console.error(`❌ Hot reload failed for ${name}:`, result.error);
        return false;
      }
    } catch (error) {
      console.error(`❌ Hot reload error for ${name}:`, error);
      return false;
    }
  }

  dispose(): void {
    const gl = this.gl;

    this.programs.forEach(({ program }) => {
      gl.deleteProgram(program);
    });

    this.shaderCache.forEach((shader) => {
      gl.deleteShader(shader);
    });

    this.programs.clear();
    this.shaderCache.clear();

    if (this.debug) {
      console.log('🧹 ShaderManager disposed');
    }
  }
}

export async function createTileRendererShaders(
  gl: WebGL2RenderingContext,
  debug: boolean = false
): Promise<ShaderManager | null> {
  console.log('🔄 Creating tile renderer shaders...');
  const shaderManager = new ShaderManager(gl, debug);

  try {
    const shaderSource: ShaderSource = {
      vertex: vertexShaderSource,
      fragment: fragmentShaderSource
    };

    console.log('📋 Vertex shader source length:', shaderSource.vertex.length);
    console.log('📋 Fragment shader source length:', shaderSource.fragment.length);

    const result = shaderManager.createProgram(
      'tileRenderer',
      shaderSource.vertex,
      shaderSource.fragment
    );

    if (result.success) {
      console.log('✅ Tile renderer shaders created successfully');
      return shaderManager;
    } else {
      console.error('❌ Failed to create tile renderer shaders:', result.error);
      if (result.warnings) {
        console.warn('⚠️ Shader warnings:', result.warnings);
      }
      return null;
    }
  } catch (error) {
    console.error('❌ Failed to load shader files:', error);
    return null;
  }
}
