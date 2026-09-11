import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PRIVATE = new Set(
  JSON.parse(readFileSync(new URL('../private-words.json', import.meta.url), 'utf8'))
);

const mask = (w) => `${w[0]}${'*'.repeat(w.length - 1)}`;

export function checkPrivate(text) {
  const hits = new Set();
  for (const w of String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (PRIVATE.has(createHash('sha256').update(w).digest('hex'))) hits.add(mask(w));
  }
  return [...hits].map(
    (w) => `contains the private word "${w}" — this repository is public, so reword it`
  );
}
