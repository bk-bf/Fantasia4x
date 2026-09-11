import { execFileSync } from 'node:child_process';

const PROJECT_ID = 'PVT_kwHOBlZOB84Bip03';
const STATUS_FIELD_ID = 'PVTSSF_lAHOBlZOB84Bip03zhhhAfI';
const PROJECT_NUMBER = '4';
const OWNER = 'bk-bf';

export const LANES = {
  backlog: 'e11e56ce',
  'blocked on you': '990e2322',
  ready: '14aee711',
  'in progress': '9e8caff2',
  'in review': '365210d5',
  'needs approval': '9e01e59a',
  'needs playtest': 'e7ebab1b',
  approved: '9437891f',
  'on dev': 'faf70e85',
  done: 'ea4793e4',
  rejected: '1a214656'
};

const HIS_LANES = new Set(['blocked on you', 'needs approval', 'needs playtest', 'rejected']);

const ONLY_HE_FILLS = new Set(['approved']);

const AGENT_TRIAGED_KINDS = new Set(['drift', 'test gap']);

const agentMayTriage = (item) => (item.labels ?? []).some((l) => AGENT_TRIAGED_KINDS.has(l));

const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });

let cache = null;

export const invalidate = () => {
  cache = null;
};

export function boardItems() {
  if (!cache) {
    cache = JSON.parse(
      gh([
        'project', 'item-list', PROJECT_NUMBER,
        '--owner', OWNER, '--limit', '300', '--format', 'json'
      ])
    ).items;
  }
  return cache;
}

export const itemFor = (n) =>
  boardItems().find((i) => String(i.content?.number) === String(n)) ?? null;

export const laneOf = (n) => (itemFor(n)?.status ?? '').toLowerCase();

export const inLane = (lane) =>
  boardItems().filter((i) => (i.status ?? '').toLowerCase() === lane.toLowerCase());

let fieldCache = null;

export function fields() {
  if (!fieldCache) {
    const q =
      '{ user(login:"' + OWNER + '"){ projectV2(number:' + PROJECT_NUMBER + '){ fields(first:40){ ' +
      'nodes{ ... on ProjectV2SingleSelectField { id name options{ id name } } } } } } }';
    const raw = JSON.parse(gh(['api', 'graphql', '-f', 'query=' + q]));
    fieldCache = raw.data.user.projectV2.fields.nodes.filter((f) => f?.name);
  }
  return fieldCache;
}

function applySelect(itemId, fieldId, optionId) {
  const q =
    'mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,' +
    'itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{id} } }';
  gh([
    'api', 'graphql', '-f', 'query=' + q,
    '-f', 'p=' + PROJECT_ID,
    '-f', 'i=' + itemId,
    '-f', 'f=' + fieldId,
    '-f', 'o=' + optionId
  ]);
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
  invalidate();
  return { from: before, to: option.name, moved: true };
}

export function moveLane(n, to) {
  const lane = String(to).toLowerCase();
  if (!LANES[lane])
    throw new Error(`unknown lane "${to}" — one of: ${Object.keys(LANES).join(', ')}`);

  const item = itemFor(n);
  if (!item) throw new Error(`#${n} is not on the board`);
  const from = (item.status ?? '').toLowerCase();

  if (HIS_LANES.has(from) && from !== lane)
    throw new Error(
      `#${n} is in "${item.status}", which is Kirill's lane. He moves it out, not you.\n` +
        `If it is genuinely finished, say so and leave the card where it is.`
    );

  if (ONLY_HE_FILLS.has(lane) && from !== lane)
    throw new Error(
      `#${n} cannot be moved to "${to}" by an agent. A card in it is merged to dev, and Kirill ` +
        `putting it there is the approval.`
    );

  if (
    (from === 'backlog' || from === '') &&
    lane !== 'backlog' &&
    lane !== 'blocked on you' &&
    !agentMayTriage(item)
  )
    throw new Error(
      `#${n} is not a ${[...AGENT_TRIAGED_KINDS].join(' or ')} card, so Kirill decides whether ` +
        `it gets worked.\nComment on it with \`pnpm issue comment ${n} --body-file -\`, naming ` +
        `the open decision or task it overlaps (the Blocked on you cards, docs/tasks/open) or ` +
        `"none", and what in play reaches the code it cites. Then move it to Blocked on you.`
    );

  if (from === lane) return { from, to: lane, moved: false };

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
