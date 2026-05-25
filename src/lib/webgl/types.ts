// src/lib/webgl/types.ts
/**
 * Core WebGL2 type definitions for the tile renderer
 */

export interface RGB {
	r: number;
	g: number;
	b: number;
}

export interface Vec2 {
	x: number;
	y: number;
}

export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface RenderStats {
	fps: number;
	frameTime: number;
	drawCalls: number;
	vertexCount: number;
}
export interface WebGLContextAttributes {
	alpha?: boolean;
	depth?: boolean;
	stencil?: boolean;
	antialias?: boolean;
	premultipliedAlpha?: boolean;
	preserveDrawingBuffer?: boolean;
	powerPreference?: 'default' | 'high-performance' | 'low-power';
	failIfMajorPerformanceCaveat?: boolean;
}

export interface RendererOptions {
	canvas: HTMLCanvasElement;
	contextAttributes?: WebGLContextAttributes;
	debug?: boolean;
}

export interface ShaderProgram {
	program: WebGLProgram;
	uniforms: Map<string, WebGLUniformLocation>;
	attributes: Map<string, number>;
}

// Font Atlas Types
export interface CharacterInfo {
	char: string;
	x: number;
	y: number;
	width: number;
	height: number;
	xAdvance: number;
	xOffset: number;
	yOffset: number;
}

export interface FontAtlas {
	texture: ImageData;
	characters: Map<string, CharacterInfo>;
	fontFamily: string;
	fontSize: number;
	atlasWidth: number;
	atlasHeight: number;
	lineHeight: number;
	baseline: number;
}

export interface FontMetrics {
	width: number;
	height: number;
	baseline: number;
	ascent: number;
	descent: number;
}
