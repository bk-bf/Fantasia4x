import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
export const ORIGIN = 'http://overlay.local';
export async function mountDir(page, dir) {
  await page.route(ORIGIN + '/**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = join(dir, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      await route.fulfill({ status: 200, body, contentType: TYPES[extname(file)] || 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: 'missing ' + path });
    }
  });
}
