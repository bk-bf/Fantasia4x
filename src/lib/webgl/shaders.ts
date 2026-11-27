import type { ShaderProgram } from './types.js';
import {
  shaderLanguages,
  type GpuDevice,
  type GpuRenderPipeline,
  type GpuShaderModule
} from '../gpu/device.js';
import { framed, type FramedPipeline } from './frameBindings.js';
import { TileShading } from './tileShading.js';
import vertexShaderSource from './shaders/vertex.glsl?raw';
import fragmentShaderSource from './shaders/fragment.glsl?raw';
import { withRockSurface } from './painted/rockSurface.js';
import { withTreeParts } from './painted/treeParts.js';

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export type WgslRule = 'any' | 'skip' | 'require';

export class MissingWgsl extends Error {
  constructor(readonly pipeline: string) {
    super(`${pipeline} has no WGSL yet`);
  }
}

export interface ShaderCompilationResult {
  success: boolean;
  pipeline?: GpuRenderPipeline;
  error?: string;
  warnings?: string[];
}

export class ShaderManager {
  private gpu: GpuDevice;
  private programs: Map<string, ShaderProgram> = new Map();
  private shaderCache: Map<string, GpuShaderModule> = new Map();
  private debug: boolean;

  constructor(
    gpu: GpuDevice,
    debug: boolean = false,
    readonly wgsl: WgslRule = 'any'
  ) {
    this.gpu = gpu;
    this.debug = debug;
  }

  createPipeline(name: string, desc: FramedPipeline): ShaderCompilationResult {
    if (this.wgsl !== 'any' && !shaderLanguages(desc).includes('wgsl')) {
      if (this.wgsl === 'require') throw new MissingWgsl(name);
      console.warn(`[gpu] ${name} is off: it has no WGSL yet`);
      return { success: false, error: `${name} has no WGSL yet` };
    }
    try {
      const made = this.gpu.createRenderPipeline({
        ...framed(this.gpu, desc),
        label: name,
        debug: this.debug
      });
      for (const { label, module } of made.modules) this.shaderCache.set(label, module);
      if (!made.ok) {
        return { success: false, error: made.error };
      }

      const shaderProgram: ShaderProgram = { pipeline: made.pipeline };
      this.programs.set(name, shaderProgram);

      if (this.debug) {
        console.log(`✅ Shader program "${name}" compiled successfully`);
        this.logProgramInfo();
      }

      return { success: true, pipeline: made.pipeline };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Shader compilation error for "${name}":`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private logProgramInfo(): void {
    console.group('🔧 Shader Program Info');

    console.log('WebGL Limits:', this.gpu.limits());

    console.groupEnd();
  }

  getProgram(name: string): ShaderProgram | undefined {
    return this.programs.get(name);
  }

  pipeline(name: string): GpuRenderPipeline | null {
    const shaderProgram = this.programs.get(name);
    if (!shaderProgram) {
      console.error(`Shader program "${name}" not found`);
      return null;
    }
    return shaderProgram.pipeline;
  }

  dispose(): void {
    const gpu = this.gpu;

    this.programs.forEach(({ pipeline }) => {
      gpu.destroyRenderPipeline(pipeline);
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

export interface TileShaders {
  shaders: ShaderManager;
  tile: TileShading | null;
}

const withPaintedDefine = (source: string): string =>
  source.replace(/^(#version[^\n]*\n)/, '$1#define PAINTED\n');

export const tileFragmentSource = (painted: boolean): string =>
  withTreeParts(
    withRockSurface(painted ? withPaintedDefine(fragmentShaderSource) : fragmentShaderSource)
  );

export async function createTileRendererShaders(
  gpu: GpuDevice,
  debug: boolean = false,
  painted: boolean = false,
  rowDepth: boolean = painted,
  wgsl: WgslRule = 'any'
): Promise<TileShaders | null> {
  console.log('🔄 Creating tile renderer shaders...');
  const shaderManager = new ShaderManager(gpu, debug, wgsl);

  try {
    const shaderSource: ShaderSource = {
      vertex: vertexShaderSource,
      fragment: tileFragmentSource(painted)
    };

    console.log('📋 Vertex shader source length:', shaderSource.vertex.length);
    console.log('📋 Fragment shader source length:', shaderSource.fragment.length);

    const tile = TileShading.create(
      gpu,
      shaderManager,
      shaderSource,
      gpu.canvas.format,
      rowDepth ? (gpu.canvas.depthFormat ?? 'depth24plus') : null
    );

    if (tile instanceof TileShading) {
      console.log('✅ Tile renderer shaders created successfully');
      return { shaders: shaderManager, tile };
    }
    if (wgsl === 'skip') return { shaders: shaderManager, tile: null };
    console.error('❌ Failed to create tile renderer shaders:', tile.error);
    return null;
  } catch (error) {
    if (error instanceof MissingWgsl) throw error;
    console.error('❌ Failed to load shader files:', error);
    return null;
  }
}
