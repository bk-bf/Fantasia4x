import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { $lib: `${root}src/lib` } },
  define: {
    __APP_VERSION__: JSON.stringify('bench'),
    __F4X_BUILD__: JSON.stringify({}),
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_DEBUG_LOG': 'undefined',
    'import.meta.env.VITE_DEBUG_MODE': 'undefined'
  },
  logLevel: 'warn',
  build: {
    outDir: process.env.SIMBENCH_OUT ?? `${root}tools/native-spike/out/simbench`,
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    lib: { entry: 'entry.ts', formats: ['es'], fileName: () => 'simbench.js' }
  }
});
