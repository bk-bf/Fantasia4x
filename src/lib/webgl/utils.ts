// src/lib/webgl/utils.ts
/**
 * WebGL utility functions for error handling and context management
 */

/**
 * Check if WebGL2 is supported in the current browser
 */
export function isWebGL2Supported(): boolean {
	try {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl2');
		return gl !== null;
	} catch (e) {
		return false;
	}
}

/**
 * Get detailed WebGL support information for debugging
 */
export function getWebGLInfo(gl: WebGL2RenderingContext): Record<string, string> {
	return {
		vendor: gl.getParameter(gl.VENDOR) || 'Unknown',
		renderer: gl.getParameter(gl.RENDERER) || 'Unknown',
		version: gl.getParameter(gl.VERSION) || 'Unknown',
		shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || 'Unknown',
		maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)?.toString() || 'Unknown',
		maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS)?.toString() || 'Unknown'
	};
}

/**
 * Create orthographic projection matrix for 2D rendering
 */
export function createOrthographicMatrix(
	left: number,
	right: number,
	bottom: number,
	top: number,
	near: number = -1,
	far: number = 1
): Float32Array {
	const matrix = new Float32Array(16);

	const width = right - left;
	const height = top - bottom;
	const depth = far - near;

	matrix[0] = 2 / width;
	matrix[1] = 0;
	matrix[2] = 0;
	matrix[3] = 0;

	matrix[4] = 0;
	matrix[5] = 2 / height;
	matrix[6] = 0;
	matrix[7] = 0;

	matrix[8] = 0;
	matrix[9] = 0;
	matrix[10] = -2 / depth;
	matrix[11] = 0;

	matrix[12] = -(right + left) / width;
	matrix[13] = -(top + bottom) / height;
	matrix[14] = -(far + near) / depth;
	matrix[15] = 1;

	return matrix;
}

/**
 * Check for WebGL errors and log them with context
 */
export function checkWebGLError(gl: WebGL2RenderingContext, operation: string): boolean {
	const error = gl.getError();
	if (error !== gl.NO_ERROR) {
		const errorName = getWebGLErrorName(gl, error);
		console.error(`WebGL Error during ${operation}: ${errorName} (${error})`);
		return true;
	}
	return false;
}

/**
 * Convert WebGL error code to human-readable name
 */
function getWebGLErrorName(gl: WebGL2RenderingContext, error: number): string {
	switch (error) {
		case gl.NO_ERROR: return 'NO_ERROR';
		case gl.INVALID_ENUM: return 'INVALID_ENUM';
		case gl.INVALID_VALUE: return 'INVALID_VALUE';
		case gl.INVALID_OPERATION: return 'INVALID_OPERATION';
		case gl.INVALID_FRAMEBUFFER_OPERATION: return 'INVALID_FRAMEBUFFER_OPERATION';
		case gl.OUT_OF_MEMORY: return 'OUT_OF_MEMORY';
		case gl.CONTEXT_LOST_WEBGL: return 'CONTEXT_LOST_WEBGL';
		default: return `UNKNOWN_ERROR_${error}`;
	}
}

/**
 * Format bytes into human-readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Performance timer for measuring render operations
 */
export class PerformanceTimer {
	private startTime: number = 0;
	private frameCount: number = 0;
	private lastFpsUpdate: number = 0;
	private currentFps: number = 0;

	start(): void {
		this.startTime = performance.now();
	}

	end(): number {
		return performance.now() - this.startTime;
	}

	updateFPS(): number {
		this.frameCount++;
		const now = performance.now();

		if (now - this.lastFpsUpdate >= 1000) {
			this.currentFps = this.frameCount;
			this.frameCount = 0;
			this.lastFpsUpdate = now;
		}

		return this.currentFps;
	}
}