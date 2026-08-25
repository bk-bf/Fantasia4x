import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';
import path from 'path';
import fs from 'fs';

function findGitRoot(dir: string): string {
  const gitPath = path.join(dir, '.git');
  if (fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return dir;
  return findGitRoot(parent);
}

function stripJsoncComments(src: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    if (inStr) {
      if (src[i] === '\\') {
        out += src[i] + src[i + 1];
        i += 2;
      } else if (src[i] === '"') {
        inStr = false;
        out += src[i++];
      } else {
        out += src[i++];
      }
    } else {
      if (src[i] === '"') {
        inStr = true;
        out += src[i++];
      } else if (src[i] === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (src[i] === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
      } else {
        out += src[i++];
      }
    }
  }
  return out;
}

const SHELL_UA_MARKER = 'Fantasia4xShell';

function desktopShellGuardPlugin(): Plugin {
  const allowBrowser = process.env.F4X_ALLOW_BROWSER === 'true';
  const debugMode = process.env.VITE_DEBUG_MODE === 'true';
  const headlessMode = process.env.VITE_HEADLESS === '1';
  const toolsMode = process.env.VITE_TOOLS_MODE === 'true';
  const guard = (
    req: { url?: string; headers: Record<string, string | string[] | undefined> },
    res: {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (body?: string) => void;
    },
    next: () => void
  ) => {
    if (allowBrowser) return next();
    const url = req.url || '';
    if (debugMode && (url.startsWith('/dev/') || url.startsWith('/tilesets/'))) return next();
    if (headlessMode && url.startsWith('/api/sim/')) return next();
    if (
      toolsMode &&
      (url === '/gear-db' ||
        url.startsWith('/gear-db/') ||
        url.startsWith('/gear-db?') ||
        url.startsWith('/dev/') ||
        url.startsWith('/tilesets/') ||
        url.startsWith('/@') ||
        url.startsWith('/node_modules/') ||
        url.startsWith('/.svelte-kit/') ||
        url.startsWith('/src/') ||
        url.startsWith('/audit/') ||
        url.startsWith('/favicon'))
    )
      return next();
    const ua = String(req.headers['user-agent'] || '');
    if (ua.includes(SHELL_UA_MARKER)) return next();
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>Fantasia4x</title>` +
        `<style>html,body{margin:0;height:100%;background:#0d0b07;color:#c9b48a;` +
        `font:16px/1.6 ui-monospace,Menlo,Consolas,monospace;display:flex;align-items:center;` +
        `justify-content:center}main{max-width:34rem;padding:2rem;text-align:center}` +
        `h1{font-size:1.3rem;color:#e0c98a}code{color:#9fce8a}</style></head>` +
        `<body><main><h1>Fantasia4x runs in the desktop app</h1>` +
        `<p>This is a game, not a web page. It will not load in a browser tab.</p>` +
        `<p>Launch it via the desktop shell:<br><code>./launch.sh --electron</code></p>` +
        `<p style="opacity:.6;font-size:.85rem">Need a browser anyway (profiling/debug)? ` +
        `Start the server with <code>./dev.sh --browser</code>.</p></main></body></html>`
    );
  };
  return {
    name: 'f4x-desktop-shell-guard',
    configureServer(server) {
      server.middlewares.use(guard);
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard);
    }
  };
}

function jsoncPlugin(): Plugin {
  return {
    name: 'vite-plugin-jsonc',
    transform(code, id) {
      if (!id.endsWith('.jsonc')) return;
      const json = stripJsoncComments(code);
      return { code: `export default ${json}`, map: null };
    }
  };
}

const APP_VERSION = JSON.parse(
  fs.readFileSync(path.join(findGitRoot(process.cwd()), 'package.json'), 'utf-8')
).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  plugins: [desktopShellGuardPlugin(), jsoncPlugin(), wasm(), sveltekit()],
  worker: {
    format: 'es',
    plugins: () => [jsoncPlugin(), wasm()]
  },
  server: {
    hmr: process.env.F4X_HMR === 'true' ? undefined : false,
    fs: {
      allow: [findGitRoot(process.cwd())]
    }
  }
});
