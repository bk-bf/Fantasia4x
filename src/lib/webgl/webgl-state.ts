/* filepath: src/lib/webgl/webgl-state.ts */
/**
 * WebGL state management utilities
 * Handles context creation, configuration, and state tracking
 */

import { isWebGL2Supported, checkWebGLError } from './utils.js';
import { crashBreadcrumb } from './crashLog.js';

export interface WebGLStateOptions {
  canvas: HTMLCanvasElement;
  contextAttributes?: WebGLContextAttributes;
  debug?: boolean;
}

export class WebGLStateManager {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private debug: boolean;
  private contextLostHandler: (event: Event) => void;
  private contextRestoredHandler: (event: Event) => void;

  constructor(options: WebGLStateOptions) {
    this.canvas = options.canvas;
    this.debug = options.debug ?? false;

    // Set up context loss handlers
    this.contextLostHandler = this.onContextLost.bind(this);
    this.contextRestoredHandler = this.onContextRestored.bind(this);
  }

  /**
   * Initialize WebGL2 context with proper error handling
   */
  async initialize(contextAttributes?: WebGLContextAttributes): Promise<WebGL2RenderingContext> {
    if (this.debug) {
      console.log('🔄 Starting WebGL2 context initialization...');
    }

    // Check WebGL2 support
    if (!isWebGL2Supported()) {
      throw new Error('WebGL2 is not supported in this browser');
    }

    // Default context attributes optimized for 2D tile rendering
    const defaultAttributes: WebGLContextAttributes = {
      alpha: false, // No transparency needed
      depth: false, // No 3D depth testing
      stencil: false, // No stencil buffer needed
      antialias: false, // Pixel-perfect rendering
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    };

    const attributes = { ...defaultAttributes, ...contextAttributes };

    if (this.debug) {
      console.log('📋 Context attributes:', attributes);
    }

    // Create WebGL2 context
    this.gl = this.canvas.getContext('webgl2', attributes);

    if (!this.gl) {
      throw new Error('Failed to create WebGL2 context');
    }

    // Set up context loss recovery
    this.canvas.addEventListener('webglcontextlost', this.contextLostHandler, false);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);

    // Configure initial WebGL state
    this.configureState();

    if (this.debug) {
      console.log('✅ WebGL2 context initialized successfully');
    }

    return this.gl;
  }

  /**
   * Configure WebGL state for optimal 2D tile rendering
   */
  private configureState(): void {
    if (!this.gl) return;

    const gl = this.gl;

    // Set viewport to canvas size
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Enable blending for proper alpha compositing
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Disable depth testing for 2D rendering
    gl.disable(gl.DEPTH_TEST);

    // Set clear color to warm brown
    gl.clearColor(0.173, 0.094, 0.063, 1.0); // #2c1810

    checkWebGLError(gl, 'initial WebGL state configuration');

    if (this.debug) {
      console.log('✅ WebGL state configured');
    }
  }

  /**
   * Update viewport when canvas is resized
   */
  updateViewport(width: number, height: number): void {
    if (!this.gl) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);

    if (this.debug) {
      console.log(`📐 Viewport updated to ${width}x${height}`);
    }
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    if (!this.gl) return;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  /**
   * Handle WebGL context loss
   */
  private onContextLost(event: Event): void {
    event.preventDefault();
    // `statusMessage` (WebGLContextEvent) sometimes carries the driver's reason (e.g. "GPU reset").
    // Write it SYNCHRONOUSLY to .debug/crash.log FIRST — a GPU reset usually kills DevTools too, so a
    // console.warn alone leaves no trace (the whole point of the crash breadcrumb).
    const reason = (event as unknown as { statusMessage?: string }).statusMessage || '(no status)';
    crashBreadcrumb(
      0,
      `WEBGL CONTEXT LOST — ${reason}. This is the hard crash: a draw exceeded the ` +
        `GPU watchdog / OOM'd. Recovery attempted on 'restored'.`
    );
    console.warn('⚠️ WebGL context lost:', reason);
    this.gl = null;
  }

  /**
   * Handle WebGL context restoration
   */
  private async onContextRestored(_event: Event): Promise<void> {
    crashBreadcrumb(
      0,
      'WEBGL CONTEXT RESTORED — reinitialising GL state (NOTE: renderer VBOs/shaders/' +
        'textures in WebGLRendererCore are NOT rebuilt here, so the map may render blank until reload).'
    );
    console.log('🔄 WebGL context restored. Reinitializing...');

    try {
      await this.initialize();
      console.log('✅ WebGL context recovery successful');
    } catch (error) {
      console.error('❌ Failed to recover WebGL context:', error);
    }
  }

  /**
   * Get the current WebGL2 context
   */
  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  /**
   * Check if WebGL context is ready
   */
  isReady(): boolean {
    return this.gl !== null;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Remove event listeners
    this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);

    // Context will be automatically cleaned up by the browser
    this.gl = null;

    if (this.debug) {
      console.log('🗑️ WebGL state manager disposed');
    }
  }
}
