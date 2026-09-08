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
  'needs playtest': 'e7ebab1b',
  done: 'ea4793e4'
};

const HIS_LANES = new Set(['blocked on you', 'needs playtest']);

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

  if (from === lane) return { from, to: lane, moved: false };

  const q =
    'mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,' +
    'itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{id} } }';
  gh([
    'api', 'graphql', '-f', 'query=' + q,
    '-f', 'p=' + PROJECT_ID,
    '-f', 'i=' + item.id,
    '-f', 'f=' + STATUS_FIELD_ID,
    '-f', 'o=' + LANES[lane]
  ]);
  invalidate();
  return { from: item.status ?? 'unset', to: lane, moved: true };
}
