import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import wasm from 'vite-plugin-wasm';
import path from 'path';
import fs from 'fs';

// Walks up from dir until it finds a .git DIRECTORY (worktrees have a .git FILE — skip those).
function findGitRoot(dir: string): string {
  const gitPath = path.join(dir, '.git');
  if (fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return dir;
  return findGitRoot(parent);
}

/** Minimal JSONC comment stripper — handles // and block comments, string-aware. */
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

// Marker stamped into the User-Agent by the desktop shells (Electron main.js, Tauri tauri.conf.json).
// Fantasia4x is a GAME, not a website: the dev/preview server must refuse to hand the playable app to
// a plain browser tab (a stray Zen session-restore, a bookmark…). Only the desktop shell — which sends
// this marker — gets through. Browser access is still possible on purpose via F4X_ALLOW_BROWSER=true
// (dev.sh sets it for --profiler / --browser, since Firefox profiling needs a real browser).
const SHELL_UA_MARKER = 'Fantasia4xShell';

function desktopShellGuardPlugin(): Plugin {
  const allowBrowser = process.env.F4X_ALLOW_BROWSER === 'true';
  // Dev tooling under /dev/ (spritesheet-viewer, …) is only reachable when the server is started in
  // debug mode — i.e. `./dev.sh --debug`, the way the Electron spike is run for debugging. Without it,
  // those paths stay behind the desktop-shell guard like everything else.
  const debugMode = process.env.VITE_DEBUG_MODE === 'true';
  const guard = (
    req: { url?: string; headers: Record<string, string | string[] | undefined> },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string) => void },
    next: () => void
  ) => {
    if (allowBrowser) return next();
    // In debug mode only: standalone dev tools under /dev/ (spritesheet-viewer, …) open in a plain
    // browser — they aren't the game, so let them through, along with the static tileset BMPs they load
    // (/tilesets/). Those are just images; the playable app (root document + bundle) stays guarded.
    const url = req.url || '';
    if (debugMode && (url.startsWith('/dev/') || url.startsWith('/tilesets/'))) return next();
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

export default defineConfig({
  plugins: [desktopShellGuardPlugin(), jsoncPlugin(), wasm(), sveltekit()],
  // The sim worker (ADR-021) is a module worker that dynamic-imports the WASM spatial core, which
  // needs code-splitting — unsupported by Vite's default IIFE worker format. ES format + the wasm
  // and jsonc plugins (the worker's import graph pulls .jsonc databases) make it bundle correctly.
  worker: {
    format: 'es',
    plugins: () => [jsoncPlugin(), wasm()]
  },
  server: {
    // HMR is OFF by default so an agent editing the tree never reloads a live playtest
    // (dev.sh/launch.sh only set F4X_HMR=true when --hmr is passed). `false` disables both
    // hot updates and full-page reloads; `undefined` restores Vite's default behaviour.
    hmr: process.env.F4X_HMR === 'true' ? undefined : false,
    fs: {
      allow: [findGitRoot(process.cwd())]
    }
  }
});
