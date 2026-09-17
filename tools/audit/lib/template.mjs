import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './links.mjs';

const PULL_TEMPLATE = 'pull_request_template.md';
const OPTIONAL_PULL_SECTIONS = new Set(['play it']);
const SIGN_OFFS = [
  { pattern: /^##\s+then\s*$/im, what: 'the "## Then" section' },
  { pattern: /generated with \[?claude code/i, what: 'the "Generated with Claude Code" line' },
  { pattern: /written unattended by/i, what: 'the "Written unattended by" line' }
];

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

export const checkSignOff = (text = '') =>
  SIGN_OFFS.filter(({ pattern }) => pattern.test(text)).map(
    ({ what }) => `remove ${what}: nothing written to GitHub carries instructions to its reader or a sign-off`
  );
