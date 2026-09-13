import { appendFileSync, readFileSync } from 'node:fs';

const API = 'https://console.vast.ai/api';
const LABEL = 'f4x-gpu-probe';
const WAIT_MS = 15 * 60_000;
const POLL_MS = 10_000;
const OFFER_QUERY = {
  limit: 20,
  type: 'ondemand',
  verified: { eq: true },
  rentable: { eq: true },
  rented: { eq: false },
  num_gpus: { eq: 1 },
  cpu_cores_effective: { gte: 8 },
  reliability: { gte: 0.98 },
  inet_down: { gte: 200 },
  dph_total: { lte: 0.25 },
  order: [['dph_total', 'asc']]
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body) {
  if (!process.env.VAST_API_KEY) throw new Error('VAST_API_KEY is not set');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VAST_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

function output(key, value) {
  process.stdout.write(`${key}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function cheapestOffer() {
  const found = await call('POST', '/v0/bundles/', OFFER_QUERY);
  const offers = found.offers ?? [];
  if (!offers.length)
    throw new Error(`no offer matches; the answer had ${Object.keys(found).join(', ') || 'no keys'}`);
  return offers[0];
}

async function waitRunning(id) {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    const { instances: i } = await call('GET', `/v0/instances/${id}/`);
    process.stdout.write(`instance ${id}: ${i?.actual_status ?? 'no status'} ${i?.status_msg ?? ''}\n`);
    if (i?.actual_status === 'running' && i.ssh_host && i.ssh_port) return i;
    await sleep(POLL_MS);
  }
  throw new Error(`instance ${id} was not running after ${WAIT_MS / 60_000} minutes`);
}

async function up() {
  const image = process.env.VAST_IMAGE;
  if (!image) throw new Error('VAST_IMAGE is not set');
  const pub = readFileSync(process.env.VAST_SSH_PUB, 'utf8').trim();
  const offer = await cheapestOffer();
  process.stdout.write(
    `offer ${offer.id}: ${offer.gpu_name}, $${offer.dph_total}/h, ${offer.cpu_cores_effective} CPUs, ` +
      `driver ${offer.driver_version}, ${offer.geolocation}\n`
  );
  const { new_contract: id } = await call('PUT', `/v0/asks/${offer.id}/`, {
    image,
    disk: 16,
    label: LABEL,
    runtype: 'ssh',
    env: '-e NVIDIA_DRIVER_CAPABILITIES=all',
    cancel_unavail: true
  });
  if (!id) throw new Error(`renting offer ${offer.id} returned no instance id`);
  output('id', id);
  const instance = await waitRunning(id);
  await call('POST', `/v0/instances/${id}/ssh/`, { ssh_key: pub });
  output('host', instance.ssh_host);
  output('port', instance.ssh_port);
}

async function labelled() {
  const { instances = [] } = await call('GET', '/v0/instances/?owner=me');
  return instances.filter((i) => i.label === LABEL).map((i) => i.id);
}

async function down(known) {
  const ids = new Set(known ? [Number(known)] : []);
  let failed = false;
  try {
    for (const id of await labelled()) ids.add(id);
  } catch (e) {
    process.stderr.write(`listing instances failed: ${e.message}\n`);
    failed = true;
  }
  for (const id of ids) {
    try {
      await call('DELETE', `/v0/instances/${id}/`);
      process.stdout.write(`destroyed instance ${id}\n`);
    } catch (e) {
      process.stderr.write(`destroying instance ${id} failed: ${e.message}\n`);
      failed = true;
    }
  }
  if (!ids.size) process.stdout.write(`no instance labelled ${LABEL}\n`);
  if (failed) process.exitCode = 1;
}

const [command, arg] = process.argv.slice(2);
if (command === 'up') await up();
else if (command === 'down') await down(arg);
else throw new Error('usage: node tools/gpu/vast.mjs up | down [instance id]');
