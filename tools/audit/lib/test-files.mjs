import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { walkFiles } from './extract.mjs';
import { sha } from './ledger.mjs';

export function testFilesByIdentifier(root, dir = 'src/tests') {
  const filesByIdentifier = new Map();
  for (const abs of walkFiles(join(root, dir), ['.ts'])) {
    const text = readFileSync(abs, 'utf8');
    const entry = `${relative(root, abs)}:${sha(text)}`;
    for (const id of new Set(text.match(/[A-Za-z_$][\w$]*/g))) {
      const files = filesByIdentifier.get(id);
      if (files) files.push(entry);
      else filesByIdentifier.set(id, [entry]);
    }
  }
  return filesByIdentifier;
}
