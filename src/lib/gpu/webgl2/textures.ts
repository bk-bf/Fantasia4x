import type { Extent, GpuTexture, TextureDescriptor, TextureFormat } from '../device.js';
import { bytesPerTexel } from '../device.js';
import { textureFormat } from './formats.js';

interface TextureInfo {
  format: TextureFormat;
  width: number;
  height: number;
}

export class Webgl2Textures {
  private readonly info = new WeakMap<WebGLTexture, TextureInfo>();
  private readonly scratch: number;
  private rowLength = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly beforeWrite?: (texture: GpuTexture) => void
  ) {
    this.scratch = (Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)) || 32) - 1;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private onScratch(texture: WebGLTexture, act: () => void): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + this.scratch);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    act();
  }

  bindOn(unit: number, texture: GpuTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture as unknown as WebGLTexture);
  }

  private setRowLength(texels: number): void {
    if (texels === this.rowLength) return;
    this.gl.pixelStorei(this.gl.UNPACK_ROW_LENGTH, texels);
    this.rowLength = texels;
  }

  create(desc: TextureDescriptor): GpuTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    const f = textureFormat(gl, desc.format);
    this.onScratch(texture, () => {
      gl.texStorage2D(gl.TEXTURE_2D, 1, f.internalFormat, desc.width, desc.height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    });
    this.info.set(texture, { format: desc.format, width: desc.width, height: desc.height });
    return texture as unknown as GpuTexture;
  }

  write(
    texture: GpuTexture,
    origin: { x: number; y: number },
    data: ArrayBufferView,
    bytesPerRow: number,
    size: { width: number; height: number }
  ): void {
    const gl = this.gl;
    const tex = texture as unknown as WebGLTexture;
    const info = this.info.get(tex);
    if (!info) throw new Error('writeTexture: not a texture this device created');
    this.beforeWrite?.(texture);
    const f = textureFormat(gl, info.format);
    const rowTexels = bytesPerRow / bytesPerTexel(info.format);
    this.onScratch(tex, () => {
      this.setRowLength(rowTexels === size.width ? 0 : rowTexels);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        origin.x,
        origin.y,
        size.width,
        size.height,
        f.format,
        f.type,
        data
      );
    });
  }

  copyImage(source: TexImageSource, texture: GpuTexture): void {
    const gl = this.gl;
    const tex = texture as unknown as WebGLTexture;
    const info = this.info.get(tex);
    if (!info) throw new Error('copyExternalImageToTexture: not a texture this device created');
    this.beforeWrite?.(texture);
    const f = textureFormat(gl, info.format);
    this.onScratch(tex, () => {
      this.setRowLength(0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, f.format, f.type, source);
    });
  }

  size(texture: GpuTexture): Extent {
    const info = this.info.get(texture as unknown as WebGLTexture);
    if (!info) throw new Error('not a texture this device created');
    return { width: info.width, height: info.height };
  }

  destroy(texture: GpuTexture): void {
    this.gl.deleteTexture(texture as unknown as WebGLTexture);
  }
}
