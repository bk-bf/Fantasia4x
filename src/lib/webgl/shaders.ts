/* filepath: src/lib/webgl/shaders.ts */
/**
 * WebGL shader compilation and management system
 * Handles shader loading, compilation, program linking, and uniform/attribute caching
 */

import type { ShaderProgram } from './types.js';

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

	/**
	 * Load shader source from external files (for development)
	 * In production, shaders would be bundled with the app
	 */
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

	/**
	 * Create and compile a shader program from source code
	 */
	createProgram(name: string, vertexSource: string, fragmentSource: string): ShaderCompilationResult {
		const gl = this.gl;

		try {
			// Compile vertex shader
			const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource, `${name}_vertex`);
			if (!vertexShader) {
				return { success: false, error: 'Vertex shader compilation failed' };
			}

			// Compile fragment shader
			const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource, `${name}_fragment`);
			if (!fragmentShader) {
				gl.deleteShader(vertexShader);
				return { success: false, error: 'Fragment shader compilation failed' };
			}

			// Create and link program
			const program = gl.createProgram();
			if (!program) {
				gl.deleteShader(vertexShader);
				gl.deleteShader(fragmentShader);
				return { success: false, error: 'Failed to create shader program' };
			}

			gl.attachShader(program, vertexShader);
			gl.attachShader(program, fragmentShader);
			gl.linkProgram(program);

			// Check linking status
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

			// Validate program
			gl.validateProgram(program);
			if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
				const warning = gl.getProgramInfoLog(program);
				if (this.debug) {
					console.warn(`Shader program validation warning: ${warning}`);
				}
			}

			// Cache uniform and attribute locations
			const shaderProgram = this.cacheLocations(program, name);
			this.programs.set(name, shaderProgram);

			// Clean up individual shaders (they're now linked into the program)
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

	/**
	 * Compile a single shader
	 */
	private compileShader(type: number, source: string, name: string): WebGLShader | null {
		const gl = this.gl;
		const shader = gl.createShader(type);

		if (!shader) {
			console.error(`Failed to create shader: ${name}`);
			return null;
		}

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		// Check compilation status
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(shader);
			const shaderType = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';

			console.error(`❌ ${shaderType} shader compilation failed (${name}):`);
			console.error(error);

			// Enhanced error reporting with line numbers
			this.reportShaderErrors(source, error || '', name);

			gl.deleteShader(shader);
			return null;
		}

		// Cache the shader
		this.shaderCache.set(name, shader);
		return shader;
	}

	/**
	 * Cache uniform and attribute locations for efficient access
	 */
	private cacheLocations(program: WebGLProgram, name: string): ShaderProgram {
		const gl = this.gl;
		const uniforms = new Map<string, WebGLUniformLocation>();
		const attributes = new Map<string, number>();

		// Get number of active uniforms and attributes
		const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

		// Cache all uniform locations
		for (let i = 0; i < numUniforms; i++) {
			const uniformInfo = gl.getActiveUniform(program, i);
			if (uniformInfo) {
				const location = gl.getUniformLocation(program, uniformInfo.name);
				if (location !== null) {
					uniforms.set(uniformInfo.name, location);
				}
			}
		}

		// Cache all attribute locations
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

	/**
	 * Enhanced error reporting with line numbers and context
	 */
	private reportShaderErrors(source: string, error: string, name: string): void {
		const lines = source.split('\n');

		console.group(`🔍 Shader Error Details: ${name}`);

		// Parse error message for line numbers
		const errorLines = error.split('\n');
		const lineRegex = /ERROR: \d+:(\d+):/;

		errorLines.forEach(errorLine => {
			const match = errorLine.match(lineRegex);
			if (match) {
				const lineNum = parseInt(match[1]) - 1; // Convert to 0-based
				if (lineNum >= 0 && lineNum < lines.length) {
					console.error(`Line ${lineNum + 1}: ${lines[lineNum]}`);
				}
			}
			console.error(errorLine);
		});

		console.groupEnd();
	}

	/**
	 * Log program information for debugging
	 */
	private logProgramInfo(shaderProgram: ShaderProgram): void {
		console.group('🔧 Shader Program Info');

		console.log('Uniforms:', Array.from(shaderProgram.uniforms.keys()));
		console.log('Attributes:', Array.from(shaderProgram.attributes.keys()));

		// Log WebGL limits for context
		const gl = this.gl;
		console.log('WebGL Limits:', {
			maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
			maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
			maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
		});

		console.groupEnd();
	}

	/**
	 * Get a cached shader program
	 */
	getProgram(name: string): ShaderProgram | undefined {
		return this.programs.get(name);
	}

	/**
	 * Use a shader program
	 */
	useProgram(name: string): boolean {
		const shaderProgram = this.programs.get(name);
		if (!shaderProgram) {
			console.error(`Shader program "${name}" not found`);
			return false;
		}

		this.gl.useProgram(shaderProgram.program);
		return true;
	}

	/**
	 * Set uniform values with type safety
	 */
	setUniform(programName: string, uniformName: string, value: number | number[] | Float32Array): boolean {
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

		// Handle different uniform types
		if (typeof value === 'number') {
			// Check if this is a sampler uniform (texture unit)
			if (uniformName.includes('u_') && (uniformName.includes('Atlas') || uniformName.includes('Texture') || uniformName.includes('sampler'))) {
				gl.uniform1i(location, value); // Use integer for samplers
			} else {
				gl.uniform1f(location, value); // Use float for other single values
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

	/**
	 * Get attribute location
	 */
	getAttributeLocation(programName: string, attributeName: string): number {
		const program = this.programs.get(programName);
		if (!program) {
			console.error(`Shader program "${programName}" not found`);
			return -1;
		}

		return program.attributes.get(attributeName) ?? -1;
	}

	/**
	 * Hot reload a shader program (for development)
	 */
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

	/**
	 * Clean up resources
	 */
	dispose(): void {
		const gl = this.gl;

		// Delete all programs
		this.programs.forEach(({ program }) => {
			gl.deleteProgram(program);
		});

		// Delete cached shaders
		this.shaderCache.forEach(shader => {
			gl.deleteShader(shader);
		});

		this.programs.clear();
		this.shaderCache.clear();

		if (this.debug) {
			console.log('🧹 ShaderManager disposed');
		}
	}
}

/**
 * Convenience function to create a basic tile renderer shader program
 */
export async function createTileRendererShaders(gl: WebGL2RenderingContext, debug: boolean = false): Promise<ShaderManager | null> {
	console.log('🔄 Creating tile renderer shaders...');
	const shaderManager = new ShaderManager(gl, debug);

	try {
		// Load shader sources from external files
		const shaderSource = await shaderManager.loadShaderSource(
			'/src/lib/webgl/shaders/vertex.glsl',
			'/src/lib/webgl/shaders/fragment.glsl'
		);

		console.log('📋 Vertex shader source length:', shaderSource.vertex.length);
		console.log('📋 Fragment shader source length:', shaderSource.fragment.length);

		const result = shaderManager.createProgram('tileRenderer', shaderSource.vertex, shaderSource.fragment);

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