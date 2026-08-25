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

    this.contextLostHandler = this.onContextLost.bind(this);
    this.contextRestoredHandler = this.onContextRestored.bind(this);
  }

  async initialize(contextAttributes?: WebGLContextAttributes): Promise<WebGL2RenderingContext> {
    if (this.debug) {
      console.log('🔄 Starting WebGL2 context initialization...');
    }

    if (!isWebGL2Supported()) {
      throw new Error('WebGL2 is not supported in this browser');
    }

    const defaultAttributes: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    };

    const attributes = { ...defaultAttributes, ...contextAttributes };

    if (this.debug) {
      console.log('📋 Context attributes:', attributes);
    }

    this.gl = this.canvas.getContext('webgl2', attributes);

    if (!this.gl) {
      throw new Error('Failed to create WebGL2 context');
    }

    this.canvas.addEventListener('webglcontextlost', this.contextLostHandler, false);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);

    this.configureState();

    if (this.debug) {
      console.log('✅ WebGL2 context initialized successfully');
    }

    return this.gl;
  }

  private configureState(): void {
    if (!this.gl) return;

    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.disable(gl.DEPTH_TEST);

    gl.clearColor(0.173, 0.094, 0.063, 1.0);

    checkWebGLError(gl, 'initial WebGL state configuration');

    if (this.debug) {
      console.log('✅ WebGL state configured');
    }
  }

  updateViewport(width: number, height: number): void {
    if (!this.gl) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);

    if (this.debug) {
      console.log(`📐 Viewport updated to ${width}x${height}`);
    }
  }

  clear(): void {
    if (!this.gl) return;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private onContextLost(event: Event): void {
    event.preventDefault();
    const reason = (event as unknown as { statusMessage?: string }).statusMessage || '(no status)';
    crashBreadcrumb(
      0,
      `WEBGL CONTEXT LOST — ${reason}. This is the hard crash: a draw exceeded the ` +
        `GPU watchdog / OOM'd. Recovery attempted on 'restored'.`
    );
    console.warn('⚠️ WebGL context lost:', reason);
    this.gl = null;
  }

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

  getContext(): WebGL2RenderingContext | null {
    return this.gl;
  }

  isReady(): boolean {
    return this.gl !== null;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);

    this.gl = null;

    if (this.debug) {
      console.log('🗑️ WebGL state manager disposed');
    }
  }
}
