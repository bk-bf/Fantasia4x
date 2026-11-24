import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const vite = await createServer({
  root: join(here, '..', '..'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error'
});
try {
  const { folkData } = await vite.ssrLoadModule('/mockups/tileset/folk-gen.ts');
  const data = folkData(431);
  writeFileSync(join(here, 'folk-cast.js'), `'use strict';\nconst FOLK_CAST = ${JSON.stringify(data)};\n`);
  console.log(data.cultures.length, 'cultures written to folk-cast.js');
} finally {
  await vite.close();
}
