const MAX_SLUG = 48;

const RULE = /^[a-z]+\/(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/;

const LONG_LIVED = new Set(['main', 'dev']);

function slugOf(text) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
  let slug = '';
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > MAX_SLUG) break;
    slug = next;
  }
  return slug;
}

export function branchFor(issue) {
  const { id, title } = issue.data;
  const words = /^\d+$/.test(String(id)) ? title : id;
  return `fix/${slugOf(words)}-${issue.number}`;
}

export function branchProblem(name) {
  if (LONG_LIVED.has(name) || RULE.test(name)) return null;
  return (
    `branch "${name}" is not named <type>/<title>-<issue number> — say what the branch does, ` +
    `then append the issue it belongs to, e.g. fix/stealth-encounter-pacing-42`
  );
}
