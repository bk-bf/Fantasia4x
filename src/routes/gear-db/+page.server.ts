import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Balance-audit results, read straight off disk at render time.
 *
 * Deliberately a SERVER load rather than a client `fetch`. Three things fall out of it: the numbers are
 * in the HTML at first paint (so a screenshot or a plain `curl` shows the real table, not a spinner),
 * there is no relative-URL fetch to blow up during SSR, and `static/audit/` needs no exemption in the
 * dev-server browser guard.
 *
 * The files are written by the audits and pulled off the remote runner with `./audit.sh --fetch`. This
 * only reads them — nothing here computes balance.
 */
export const load = async () => {
  const dir = 'static/audit';
  if (!existsSync(dir)) return { audit: null };
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    // Shapes mirror what the audits write; the component declares them properly. `unknown` here would
    // just move the cast to the callsite.
    const meta: Record<
      string,
      { fights: number; ranked: { style: string; wins: number; perHit: number }[] }
    > = {};
    const pawnFit: Record<
      string,
      {
        fights: number;
        rows: {
          weapon: string;
          armourAtHit: number;
          fits: {
            fit: string;
            wins: number;
            landed: number;
            swings: number;
            perHit: number;
            effectPer1k: number;
          }[];
        }[];
      }
    > = {};
    let generated = '';
    if (existsSync(join(dir, 'index.json'))) {
      try {
        generated = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).generated ?? '';
      } catch {
        /* an unreadable index is not worth failing the page over */
      }
    }
    for (const f of files) {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        continue; // a half-written file from a run still in flight
      }
      if (f.startsWith('weapon-meta-'))
        meta[String(d.CLASS ?? d.armour)] = d as unknown as (typeof meta)[string];
      else if (d.kind === 'pawnFit')
        pawnFit[String(d.armour)] = d as unknown as (typeof pawnFit)[string];
    }
    return { audit: { generated, meta, pawnFit } };
  } catch {
    return { audit: null };
  }
};
