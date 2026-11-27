import { createWebgl2Device } from '../gpu/webgl2/context.js';
import type { GpuDevice, RenderPassDescriptor } from '../gpu/device.js';
import { Webgl2Device } from '../gpu/webgl2/device.js';
import { crashBreadcrumb } from './crashLog.js';
import { WORK_PINS } from '../workPins/flag.js';
import { countGl } from '../workPins/page.js';

const CANVAS_CLEAR = [0.173, 0.094, 0.063, 1.0] as const;

export interface WebGLStateOptions {
  canvas: HTMLCanvasElement;
  contextAttributes?: WebGLContextAttributes;
  debug?: boolean;
}

export class WebGLStateManager {
  private canvas: HTMLCanvasElement;
  private device: GpuDevice | null = null;
  private debug: boolean;
  private contextLostHandler: (event: Event) => void;
  private contextRestoredHandler: (event: Event) => void;

  constructor(options: WebGLStateOptions) {
    this.canvas = options.canvas;
    this.debug = options.debug ?? false;

    this.contextLostHandler = this.onContextLost.bind(this);
    this.contextRestoredHandler = this.onContextRestored.bind(this);
  }

  async initialize(contextAttributes?: WebGLContextAttributes): Promise<GpuDevice> {
    if (this.debug) {
      console.log('🔄 Starting WebGL2 context initialization...');
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

    const device = createWebgl2Device(this.canvas, attributes);

    if (!device) {
      throw new Error('WebGL2 is not supported in this browser');
    }
    if (WORK_PINS) countGl(Webgl2Device.rawContextForInstrumentation(device));
    this.device = device;

    this.canvas.addEventListener('webglcontextlost', this.contextLostHandler, false);
    this.canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler, false);

    this.configureState();

    if (this.debug) {
      console.log('✅ WebGL2 context initialized successfully');
    }

    return device;
  }

  private configureState(): void {
    if (!this.device) return;

    const gpu = this.device;

    gpu.checkError('initial WebGL state configuration');

    if (this.debug) {
      console.log('✅ WebGL state configured');
    }
  }

  updateViewport(width: number, height: number): void {
    if (!this.device) return;

    this.device.canvas.resize(width, height);

    if (this.debug) {
      console.log(`📐 Viewport updated to ${width}x${height}`);
    }
  }

  canvasPass(gpu: GpuDevice): RenderPassDescriptor {
    const depth = gpu.canvas.getDepthTexture();
    return {
      label: 'canvas',
      colorAttachments: [
        {
          view: gpu.canvas.getCurrentTexture(),
          loadOp: 'clear',
          clearValue: CANVAS_CLEAR,
          storeOp: 'store'
        }
      ],
      ...(depth
        ? {
            depthStencilAttachment: {
              view: depth,
              depthLoadOp: 'clear',
              depthClearValue: 1,
              depthStoreOp: 'discard',
              ...(gpu.canvas.depthFormat === 'depth24plus-stencil8'
                ? { stencilLoadOp: 'clear', stencilClearValue: 0, stencilStoreOp: 'discard' }
                : {})
            }
          }
        : {})
    };
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
    this.device = null;
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

  getDevice(): GpuDevice | null {
    return this.device;
  }

  isReady(): boolean {
    return this.device !== null;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);

    this.device = null;

    if (this.debug) {
      console.log('🗑️ WebGL state manager disposed');
    }
  }
}
