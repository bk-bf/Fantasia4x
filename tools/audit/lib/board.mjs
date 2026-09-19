import { linkOf, parentOf } from './pulls.mjs';
import { passiveLane } from './lanes.mjs';
import { cardsFromRest, restFieldIds, restIdOf, selectFieldsFromRest } from './board-rest.mjs';
import { runGh } from './gh-run.mjs';

const PROJECT_ID = 'PVT_kwHOBlZOB84Bip03';
const STATUS_FIELD_ID = 'PVTSSF_lAHOBlZOB84Bip03zhhhAfI';
const PROJECT_NUMBER = '4';
const OWNER = 'bk-bf';

export const LANES = {
  backlog: 'e11e56ce',
  'blocked on you': '990e2322',
  ready: '14aee711',
  failed: '3cfbabb8',
  'in progress': '9e8caff2',
  manual: 'a25ed474',
  'in check': 'b36e3808',
  'pr ready': 'fee29b9d',
  'needs playtest': '9ba0c45d',
  'on dev': 'faf70e85',
  done: 'ea4793e4',
  rejected: '1a214656'
};

const HIS_LANES = new Set(['blocked on you', 'rejected', 'manual', 'needs playtest']);

const LEFT_ON_MERGE = { manual: new Set(['on dev']), 'needs playtest': new Set(['on dev', 'ready']) };

const ANSWER_MARK = '**Answered**';

const lastCommentIsAnswer = (n) =>
  (JSON.parse(gh(['issue', 'view', String(n), '--json', 'comments'])).comments.at(-1)?.body ?? '')
    .trimStart()
    .startsWith(ANSWER_MARK);

const AGENT_TRIAGED_KINDS = new Set(['drift', 'test gap']);

const agentMayTriage = (item) => (item.labels ?? []).some((l) => AGENT_TRIAGED_KINDS.has(l));

const gh = (args, input = '') => runGh(args, input, '', true);

let cache = null;

export const invalidate = () => {
  cache = null;
};

const REST_BASE = `/users/${OWNER}/projectsV2/${PROJECT_NUMBER}`;

const restPages = (path = '') => JSON.parse(gh(['api', '--paginate', '--slurp', path]));

function restItems() {
  const ids = restFieldIds(restPages(`${REST_BASE}/fields?per_page=100`));
  return cardsFromRest(
    restPages(`${REST_BASE}/items?per_page=100&fields=${ids.join(',')}`),
    `${OWNER}/Fantasia4x`
  );
}

export function boardItems() {
  if (!cache) {
    try {
      cache = JSON.parse(
        gh([
          'project', 'item-list', PROJECT_NUMBER,
          '--owner', OWNER, '--limit', '300', '--format', 'json'
        ])
      ).items;
    } catch {
      process.stderr.write('board: the GraphQL read failed, reading the board over REST\n');
      cache = restItems();
    }
  }
  return cache;
}

export const itemFor = (n) =>
  boardItems().find((i) => String(i.content?.number) === String(n)) ?? null;

export const laneOf = (n) => (itemFor(n)?.status ?? '').toLowerCase();

const followsParent = (n, lane) => {
  const parent = parentOf(n);
  return parent !== null && laneOf(parent) === lane;
};

export const inLane = (lane) =>
  boardItems().filter((i) => (i.status ?? '').toLowerCase() === lane.toLowerCase());

let fieldCache = null;

export function fields() {
  if (!fieldCache) {
    const q =
      '{ user(login:"' + OWNER + '"){ projectV2(number:' + PROJECT_NUMBER + '){ fields(first:40){ ' +
      'nodes{ ... on ProjectV2SingleSelectField { id name options{ id name } } } } } } }';
    try {
      const raw = JSON.parse(gh(['api', 'graphql', '-f', 'query=' + q]));
      fieldCache = raw.data.user.projectV2.fields.nodes.filter((f) => f?.name);
    } catch {
      fieldCache = selectFieldsFromRest(restPages(`${REST_BASE}/fields?per_page=100`));
    }
  }
  return fieldCache;
}

function applySelect(itemId, fieldId, optionId) {
  const q =
    'mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,' +
    'itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{id} } }';
  try {
    gh([
      'api', 'graphql', '-f', 'query=' + q,
      '-f', 'p=' + PROJECT_ID,
      '-f', 'i=' + itemId,
      '-f', 'f=' + fieldId,
      '-f', 'o=' + optionId
    ]);
  } catch {
    const item = restIdOf(restPages(`${REST_BASE}/items?per_page=100`), itemId);
    const field = restIdOf(restPages(`${REST_BASE}/fields?per_page=100`), fieldId);
    if (item === null || field === null)
      throw new Error(`the card write failed, and REST has no card ${itemId} or field ${fieldId}`);
    gh(
      ['api', '-X', 'PATCH', `${REST_BASE}/items/${item}`, '--input', '-'],
      JSON.stringify({ fields: [{ id: field, value: optionId }] })
    );
  }
}

export function setSelect(n, fieldName, optionName) {
  const item = itemFor(n);
  if (!item) throw new Error(`#${n} is not on the board`);
  const field = fields().find((f) => f.name.toLowerCase() === fieldName.toLowerCase());
  if (!field) throw new Error(`no field "${fieldName}" on the board`);
  const option = field.options.find((o) => o.name.toLowerCase() === String(optionName).toLowerCase());
  if (!option)
    throw new Error(
      `"${optionName}" is not an option of ${field.name} — one of: ${field.options.map((o) => o.name).join(', ')}`
    );
  const before = item[field.name.toLowerCase()] ?? null;
  if (before === option.name) return { from: before, to: option.name, moved: false };
  applySelect(item.id, field.id, option.id);
  item[field.name.toLowerCase()] = option.name;
  return { from: before, to: option.name, moved: true };
}

const ISSUE_FREE_LANES = new Set(['backlog', 'rejected']);

const PULL_LANES = new Set(['in progress', 'in check']);

const cardKind = (item) => (item.content?.type === 'PullRequest' ? 'pull request' : 'draft');

export const strayCard = (item) =>
  item.content?.type === 'Issue' || ISSUE_FREE_LANES.has((item.status ?? '').toLowerCase())
    ? null
    : `a ${cardKind(item)} card, not an issue, in ${item.status ?? 'no lane'}: only Backlog and Rejected hold one`;

const openPullLinking = (n) =>
  JSON.parse(gh(['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,body,isDraft'])).find(
    (p) => linkOf(p)?.issue === Number(n)
  ) ?? null;

export function followBranch(branch) {
  const pull =
    JSON.parse(gh(['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number,body,isDraft']))[0] ??
    null;
  const n = pull ? linkOf(pull)?.issue : Number(/-(\d+)$/.exec(branch)?.[1]);
  if (!n) return null;
  const to = passiveLane(laneOf(n), pull);
  return to ? { n, ...moveLane(n, to) } : null;
}

export function moveLane(n, to) {
  const lane = String(to).toLowerCase();
  if (!LANES[lane])
    throw new Error(`unknown lane "${to}" — one of: ${Object.keys(LANES).join(', ')}`);

  const item = itemFor(n);
  if (!item) throw new Error(`#${n} is not on the board`);
  const from = (item.status ?? '').toLowerCase();

  if (item.content?.type !== 'Issue' && !ISSUE_FREE_LANES.has(lane))
    throw new Error(
      `#${n} is a ${cardKind(item)} card, not an issue, so only Backlog and Rejected hold it.\n` +
        'Open an issue with `pnpm issue create` and link the pull request to it with `Fixes #<issue>`.'
    );

  if (lane === 'in check') {
    const pull = openPullLinking(n);
    if (!pull || pull.isDraft)
      throw new Error(
        `#${n} has ${pull ? `only a draft pull request, #${pull.number}` : 'no open pull request'}, so it is not In Check.\n` +
          'In Check holds finished work whose ready pull request is running its checks; `gh pr ready <n>` marks a draft ready.'
      );
  }

  const answered = from === 'blocked on you' && lane === 'ready' && lastCommentIsAnswer(n);
  const workedByHand = from === 'blocked on you' && lane === 'manual';
  const takenUp = from === 'manual' && (lane === 'in progress' || lane === 'in check');
  if (
    HIS_LANES.has(from) &&
    from !== lane &&
    !answered &&
    !workedByHand &&
    !takenUp &&
    !LEFT_ON_MERGE[from]?.has(lane)
  )
    throw new Error(
      `#${n} is in "${item.status}", which is Kirill's lane. He moves it out, not you.\n` +
        `If it is genuinely finished, say so and leave the card where it is.\n` +
        `A Blocked on you card goes to Ready once its latest comment is his answer, starting ${ANSWER_MARK},\n` +
        `or to Manual when he takes it by hand. A Manual card goes to In progress or In Check when an agent takes it up.`
    );

  if (
    (from === 'backlog' || from === '') &&
    lane !== 'backlog' &&
    lane !== 'blocked on you' &&
    !agentMayTriage(item) &&
    !followsParent(n, lane) &&
    !(PULL_LANES.has(lane) && openPullLinking(n))
  )
    throw new Error(
      `#${n} is not a ${[...AGENT_TRIAGED_KINDS].join(' or ')} card, so Kirill decides whether ` +
        `it gets worked.\nComment on it with \`pnpm issue comment ${n} --body-file -\`, naming ` +
        `the open decision or task it overlaps (the Blocked on you cards) or ` +
        `"none", and what in play reaches the code it cites. Then move it to Blocked on you.\n` +
        `A sub-issue may also follow its parent into the lane the parent is in, and a card whose ` +
        `pull request is open goes to In progress or In Check.`
    );

  if (from === lane) return { from, to: lane, moved: false };

  if (lane === 'backlog') {
    const pull = openPullLinking(n);
    if (pull)
      throw new Error(
        `#${n} has an open pull request, #${pull.number}, so it cannot go to Backlog. ` +
          `Work with a pull request is In progress or later.`
      );
  }

  applySelect(item.id, STATUS_FIELD_ID, LANES[lane]);
  invalidate();
  return { from: item.status ?? 'unset', to: lane, moved: true };
}

export function addToBoard(n) {
  const url = `https://github.com/${OWNER}/Fantasia4x/issues/${n}`;
  gh(['project', 'item-add', PROJECT_NUMBER, '--owner', OWNER, '--url', url]);
  invalidate();
  return itemFor(n);
}
