import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { startCompositor } from './session.mjs';

const [BIN, OUT, ...RUNS] = process.argv.slice(2);
if (!BIN || !OUT || RUNS.length === 0) {
  console.error('usage: node tools/gpu/native-bench.mjs <render-native binary> <rows.jsonl> "<run args>"...');
  process.exit(2);
}
const log = (l) => process.stdout.write(`${l}\n`);
const comp = await startCompositor(log);
try {
  for (const run of RUNS) {
    const args = ['run', ...run.split(' ').filter(Boolean)];
    log(`RUN ${args.join(' ')}`);
    const r = spawnSync(BIN, args, {
      env: { ...comp.cleanEnv, WAYLAND_DISPLAY: comp.socket, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR },
      encoding: 'utf8',
      timeout: 300000
    });
    process.stdout.write(r.stderr.split('\n').filter((l) => l.startsWith('INFO') || /error|panick/i.test(l)).slice(0, 20).join('\n') + '\n');
    const row = r.stdout.split('\n').find((l) => l.startsWith('ROW '));
    if (row) {
      appendFileSync(OUT, row.slice(4) + '\n');
      log(row);
    } else log(`NO ROW status ${r.status} ${r.signal ?? ''} ${r.error ?? ''}`);
  }
} finally {
  comp.stop();
}
