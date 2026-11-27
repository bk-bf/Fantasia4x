export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const RGBA = 4;

export async function decodePng(bytes: Uint8Array): Promise<DecodedImage> {
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  const compressed: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || colour !== 6 || interlace !== 0)
        throw new Error(
          `only 8-bit RGBA PNGs without interlacing are read, not depth ${depth}, colour type ${colour}, interlace ${interlace}`
        );
    } else if (type === 'IDAT') compressed.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error('PNG has no image header');
  return { width, height, data: unfilter(await inflate(compressed), width, height) };
}

async function inflate(parts: Uint8Array[]): Promise<Uint8Array> {
  const stream = new Blob(parts as BlobPart[])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * RGBA;
  if (raw.length < (stride + 1) * height) throw new Error('PNG holds fewer rows than it declares');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const up = row - stride;
    const above = y > 0;
    switch (filter) {
      case 0:
        out.set(raw.subarray(src, src + stride), row);
        break;
      case 1:
        for (let x = 0; x < stride; x++)
          out[row + x] = raw[src + x] + (x >= RGBA ? out[row + x - RGBA] : 0);
        break;
      case 2:
        for (let x = 0; x < stride; x++) out[row + x] = raw[src + x] + (above ? out[up + x] : 0);
        break;
      case 3:
        for (let x = 0; x < stride; x++) {
          const a = x >= RGBA ? out[row + x - RGBA] : 0;
          const b = above ? out[up + x] : 0;
          out[row + x] = raw[src + x] + ((a + b) >> 1);
        }
        break;
      case 4:
        for (let x = 0; x < stride; x++) {
          const a = x >= RGBA ? out[row + x - RGBA] : 0;
          const b = above ? out[up + x] : 0;
          const c = above && x >= RGBA ? out[up + x - RGBA] : 0;
          out[row + x] = raw[src + x] + paeth(a, b, c);
        }
        break;
      default:
        throw new Error(`PNG row ${y} uses unknown filter ${filter}`);
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
