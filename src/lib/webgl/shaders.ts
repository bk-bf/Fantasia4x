import type { ShaderProgram } from './types.js';
import type { GpuDevice, GpuPipeline, GpuShaderModule } from '../gpu/device.js';
import vertexShaderSource from './shaders/vertex.glsl?raw';
import fragmentShaderSource from './shaders/fragment.glsl?raw';
import { withRockSurface } from './painted/rockSurface.js';
import { withTreeParts } from './painted/treeParts.js';

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export interface ShaderCompilationResult {
  success: boolean;
  program?: GpuPipeline;
  error?: string;
  warnings?: string[];
}

export class ShaderManager {
  private gpu: GpuDevice;
  private programs: Map<string, ShaderProgram> = new Map();
  private shaderCache: Map<string, GpuShaderModule> = new Map();
  private debug: boolean;

  constructor(gpu: GpuDevice, debug: boolean = false) {
    this.gpu = gpu;
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
    try {
      const made = this.gpu.createRenderPipeline({
        label: name,
        glsl: { vertex: vertexSource, fragment: fragmentSource },
        debug: this.debug
      });
      for (const { label, module } of made.modules) this.shaderCache.set(label, module);
      if (!made.ok) {
        return { success: false, error: made.error };
      }

      const shaderProgram: ShaderProgram = {
        program: made.pipeline,
        uniforms: made.uniforms,
        attributes: made.attributes
      };
      this.programs.set(name, shaderProgram);

      if (this.debug) {
        console.log(`✅ Shader program "${name}" compiled successfully`);
        this.logProgramInfo(shaderProgram);
      }

      return { success: true, program: made.pipeline };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Shader compilation error for "${name}":`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private logProgramInfo(shaderProgram: ShaderProgram): void {
    console.group('🔧 Shader Program Info');

    console.log('Uniforms:', Array.from(shaderProgram.uniforms.keys()));
    console.log('Attributes:', Array.from(shaderProgram.attributes.keys()));

    console.log('WebGL Limits:', this.gpu.limits());

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

    this.gpu.setPipeline(shaderProgram.program);
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

    const gpu = this.gpu;

    if (typeof value === 'number') {
      if (
        uniformName.includes('u_') &&
        (uniformName.includes('Atlas') ||
          uniformName.includes('Texture') ||
          uniformName.includes('sampler'))
      ) {
        gpu.setI32(location, value);
      } else {
        gpu.setF32(location, value);
      }
    } else if (Array.isArray(value) || value instanceof Float32Array) {
      switch (value.length) {
        case 1:
          gpu.setF32(location, value[0]);
          break;
        case 2:
          gpu.setVec2fv(location, value);
          break;
        case 3:
          gpu.setVec3fv(location, value);
          break;
        case 4:
          gpu.setVec4fv(location, value);
          break;
        case 16:
          gpu.setMat4fv(location, value);
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

  setUniformVec4s(programName: string, uniformName: string, value: Float32Array): boolean {
    const location = this.programs.get(programName)?.uniforms.get(uniformName);
    if (!location) return false;
    this.gpu.setVec4fv(location, value);
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
    const gpu = this.gpu;

    this.programs.forEach(({ program }) => {
      gpu.destroyPipeline(program);
    });

    this.shaderCache.forEach((shader) => {
      gpu.destroyShaderModule(shader);
    });

    this.programs.clear();
    this.shaderCache.clear();

    if (this.debug) {
      console.log('🧹 ShaderManager disposed');
    }
  }
}

const withPaintedPath = (source: string): string =>
  withTreeParts(withRockSurface(source.replace(/^(#version[^\n]*\n)/, '$1#define PAINTED\n')));

export async function createTileRendererShaders(
  gpu: GpuDevice,
  debug: boolean = false,
  painted: boolean = false
): Promise<ShaderManager | null> {
  console.log('🔄 Creating tile renderer shaders...');
  const shaderManager = new ShaderManager(gpu, debug);

  try {
    const shaderSource: ShaderSource = {
      vertex: vertexShaderSource,
      fragment: painted ? withPaintedPath(fragmentShaderSource) : fragmentShaderSource
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
