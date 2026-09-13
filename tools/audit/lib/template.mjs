import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './links.mjs';

const PULL_TEMPLATE = 'pull_request_template.md';
const OPTIONAL_PULL_SECTIONS = new Set(['play it']);

export const headingsOf = (md = '') =>
  [...String(md).matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase());

export function requiredSections(pathInGithub = '') {
  try {
    return headingsOf(readFileSync(join(ROOT, '.github', pathInGithub), 'utf8'));
  } catch {
    return [];
  }
}

export function checkPullTemplate(body = '') {
  const headings = new Set(headingsOf(body));
  const missing = requiredSections(PULL_TEMPLATE).filter(
    (s) => !OPTIONAL_PULL_SECTIONS.has(s) && !headings.has(s)
  );
  return missing.length
    ? [
        `.github/${PULL_TEMPLATE} asks for a section this body does not have: ` +
          missing.map((m) => `"${m}"`).join(', ')
      ]
    : [];
}
