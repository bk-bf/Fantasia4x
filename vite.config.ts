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
  plugins: [jsoncPlugin(), wasm(), sveltekit()],
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
