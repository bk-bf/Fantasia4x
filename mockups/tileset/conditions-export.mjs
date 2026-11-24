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
  const { conditionIconSheet, sheetFile } = await vite.ssrLoadModule(
    '/src/lib/components/UI/canvas/worldFx/iconSheet.ts'
  );
  const sheet = conditionIconSheet();
  writeFileSync(join(here, 'conditions-data.js'), sheetFile(sheet));
  console.log(
    sheet.rows.length,
    'rows and',
    Object.keys(sheet.icons).length,
    'icons written to conditions-data.js'
  );
} finally {
  await vite.close();
}
