import { describe, expect, it, vi } from 'vitest';
import { WEBGPU_SHADERS_FAILED, buildWithFallback, chooseGpu, wgslRule } from '$lib/webgl/gpuChoice';
import { readGpuSwitch } from '$lib/webgl/passes';
import { MissingWgsl, ShaderManager } from '$lib/webgl/shaders';
import { PipelineBuildFailed } from '$lib/gpu/device';
import type { GpuDevice } from '$lib/gpu/device';
import type { FramedPipeline } from '$lib/webgl/frameBindings';

const device = { destroy: vi.fn() } as unknown as GPUDevice;

function gpu(info: Partial<GPUAdapterInfo> & { isFallbackAdapter?: boolean }, starts = true): GPU {
  const adapter = {
    info: { vendor: 'amd', architecture: 'rdna-1', device: '', description: '', ...info },
    requestDevice: () => (starts ? Promise.resolve(device) : Promise.reject(new Error('lost')))
  };
  return { requestAdapter: () => Promise.resolve(adapter) } as unknown as GPU;
}

describe('the ?gpu= switch', () => {
  it('names a backend only for webgpu or webgl2', () => {
    expect(readGpuSwitch('?gpu=webgpu')).toBe('webgpu');
    expect(readGpuSwitch('?gpu=webgl2&skip=gl')).toBe('webgl2');
    expect(readGpuSwitch('?gpu=vulkan')).toBeNull();
    expect(readGpuSwitch('')).toBeNull();
  });
});

describe('choosing the backend', () => {
  it('starts WebGPU on a hardware adapter whose device starts', async () => {
    const choice = await chooseGpu(gpu({}), null);
    expect(choice).toEqual({ backend: 'webgpu', device, adapter: 'amd · rdna-1', forced: false });
  });

  it('remembers that ?gpu=webgpu forced it', async () => {
    expect(await chooseGpu(gpu({}), 'webgpu')).toMatchObject({ backend: 'webgpu', forced: true });
  });

  it('stays on WebGL2 without navigator.gpu, an adapter or a device, and when asked to', async () => {
    const none = { requestAdapter: () => Promise.resolve(null) } as unknown as GPU;
    expect(await chooseGpu(undefined, null)).toMatchObject({ backend: 'webgl2' });
    expect(await chooseGpu(none, null)).toMatchObject({ backend: 'webgl2' });
    expect(await chooseGpu(gpu({}, false), null)).toMatchObject({ backend: 'webgl2' });
    expect(await chooseGpu(gpu({}), 'webgl2')).toMatchObject({ backend: 'webgl2' });
  });

  it('refuses the software fallback adapter even when forced', async () => {
    const swiftshader = gpu({ vendor: 'google', architecture: 'swiftshader', isFallbackAdapter: true });
    expect(await chooseGpu(swiftshader, 'webgpu')).toMatchObject({
      backend: 'webgl2',
      reason: expect.stringContaining('software fallback')
    });
  });
});

describe('the WGSL rule', () => {
  it('requires WGSL on chosen WebGPU, skips the rest on forced WebGPU or ?skip=glsl-only', () => {
    const webgpu = (forced: boolean) => ({ backend: 'webgpu', device, adapter: '', forced }) as const;
    const webgl2 = { backend: 'webgl2', reason: '' } as const;
    expect(wgslRule(webgpu(false), false)).toBe('require');
    expect(wgslRule(webgpu(true), false)).toBe('skip');
    expect(wgslRule(webgl2, false)).toBe('any');
    expect(wgslRule(webgl2, true)).toBe('skip');
  });

  it('throws MissingWgsl for a GLSL-only pipeline under require, and turns it off under skip', () => {
    const createRenderPipeline = vi.fn();
    const gpu = { createRenderPipeline } as unknown as GpuDevice;
    const glslOnly: FramedPipeline = {
      glsl: { vertex: '', fragment: '', attributes: {} },
      layout: [],
      vertex: { buffers: [] },
      primitive: { topology: 'triangle-list' },
      fragment: { targets: [{ format: 'rgba8unorm' }] }
    };
    expect(() => new ShaderManager(gpu, false, 'require').createPipeline('p', glslOnly)).toThrow(
      MissingWgsl
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(new ShaderManager(gpu, false, 'skip').createPipeline('p', glslOnly)).toMatchObject({
      success: false
    });
    expect(createRenderPipeline).not.toHaveBeenCalled();
  });
});

describe('starting the renderer', () => {
  const target = (canFallBack: boolean) => ({ canFallBack, fallBackToWebgl2: vi.fn() });
  const failingOnce = (error: Error) => {
    let calls = 0;
    return vi.fn(async () => {
      if (calls++ === 0) throw error;
      return true;
    });
  };

  it('falls back to WebGL2 and builds again when a WebGPU pipeline fails under the automatic choice', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (const error of [new PipelineBuildFailed('groundBlend', 'no'), new MissingWgsl('tile')]) {
      const build = failingOnce(error);
      const gpu = target(true);
      const forget = vi.fn();
      await expect(buildWithFallback(build, gpu, forget)).resolves.toBe(true);
      expect(build).toHaveBeenCalledTimes(2);
      expect(forget).toHaveBeenCalledTimes(1);
      expect(gpu.fallBackToWebgl2).toHaveBeenCalledWith(error.message);
    }
  });

  it('shows the WebGPU message and builds nothing more when WebGPU was forced', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const build = failingOnce(new PipelineBuildFailed('groundBlend', 'no'));
    const gpu = target(false);
    await expect(buildWithFallback(build, gpu, vi.fn())).rejects.toThrow(WEBGPU_SHADERS_FAILED);
    expect(build).toHaveBeenCalledTimes(1);
    expect(gpu.fallBackToWebgl2).not.toHaveBeenCalled();
  });

  it('never falls back on any other failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const gpu = target(true);
    await expect(
      buildWithFallback(failingOnce(new Error('Shader init failed')), gpu, vi.fn())
    ).rejects.toThrow('Shader init failed');
    expect(gpu.fallBackToWebgl2).not.toHaveBeenCalled();
  });
});
