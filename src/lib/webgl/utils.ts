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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export class PerformanceTimer {
  private startTime: number = 0;
  private lastFrameTime: number = 0;
  private smoothedFps: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  end(): number {
    return performance.now() - this.startTime;
  }

  updateFPS(): number {
    const now = performance.now();

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = now;
      return this.smoothedFps;
    }

    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (dt <= 0 || dt > 2000) {
      return this.smoothedFps;
    }

    const instantaneous = 1000 / dt;
    const alpha = 0.1;
    this.smoothedFps =
      this.smoothedFps === 0
        ? instantaneous
        : this.smoothedFps * (1 - alpha) + instantaneous * alpha;

    return this.smoothedFps;
  }
}
