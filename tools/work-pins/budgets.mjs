import { appendFileSync, readFileSync } from 'node:fs';

const BUDGETS_FILE = 'tools/work-pins/budgets.json';
const ACCEPTED = process.env.PERF_CHANGE_ACCEPTED === 'true';

export const readBudgets = () =>
  JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));

export const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const round = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100);

function judge(budget, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'missing';
  if ('ceiling' in budget) return value > budget.ceiling ? 'over its ceiling' : 'within';
  return value < budget.floor ? 'under its floor' : 'within';
}

const limitOf = (b) => ('ceiling' in b ? `ceiling ${b.ceiling}` : `floor ${b.floor}`);

export function failureLine(r) {
  const where = `${r.scenario}, phase ${r.phase}: ${r.measure}`;
  if (r.verdict === 'missing') return `${where} was not measured`;
  return `${where} is ${round(r.value)} ${r.unit}, ${r.verdict} of ${'ceiling' in r ? r.ceiling : r.floor} ${r.unit}`;
}

function summary(text) {
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

export function checkBudgets(title, measured) {
  const budgets = readBudgets();
  const rows = Object.entries(measured).map(([key, { value, runs }]) => {
    const budget = budgets[key];
    if (!budget) throw new Error(`no budget named ${key} in ${BUDGETS_FILE}`);
    return { key, ...budget, value, runs, verdict: judge(budget, value) };
  });
  const failed = rows.filter((r) => r.verdict !== 'within');
  const missing = failed.some((r) => r.verdict === 'missing');
  const allowed = ACCEPTED && !missing;
  const heading = failed.length
    ? `## Absolute budgets, ${title}: ${failed.length} past the limit${allowed ? ', allowed by the "perf change accepted" label' : ''}`
    : `## Absolute budgets, ${title}: every measure within its limit`;
  const table = [
    '| scenario | phase | measure | runs | median | limit | unit |',
    '|---|---|---|---|---:|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.scenario} | ${r.phase} | ${r.measure} | ${(r.runs ?? []).map(round).join(', ')} | ${typeof r.value === 'number' ? round(r.value) : '-'} | ${limitOf(r)} | ${r.unit} |`
    )
  ];
  summary(
    [
      heading,
      '',
      ...failed.map((r) => `- ${failureLine(r)}`),
      ...(failed.length ? [''] : []),
      ...table,
      '',
      `Limits are in \`${BUDGETS_FILE}\`.`,
      ''
    ].join('\n')
  );
  if (process.env.GITHUB_ACTIONS)
    for (const r of failed)
      process.stdout.write(`::error title=Absolute budget::${failureLine(r)}\n`);
  return failed.length === 0 || allowed;
}
