import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const load = async () => {
  const dir = 'static/audit';
  if (!existsSync(dir)) return { audit: null };
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
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
    const creatures: {
      weapon: string;
      armour: string;
      creature: string;
      tier: number;
      naturalArmor: number;
      effectPer1k: number;
      landed: number;
      swings: number;
      perHit: number;
      kills: number;
      fights: number;
    }[] = [];
    let generated = '';
    if (existsSync(join(dir, 'index.json'))) {
      try {
        generated = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).generated ?? '';
      } catch {}
    }
    for (const f of files) {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        continue;
      }
      if (d.kind === 'creatures') {
        creatures.push(...((d.rows ?? []) as unknown as typeof creatures));
        continue;
      }
      if (f.startsWith('weapon-meta-'))
        meta[String(d.CLASS ?? d.armour)] = d as unknown as (typeof meta)[string];
      else if (d.kind === 'pawnFit')
        pawnFit[String(d.armour)] = d as unknown as (typeof pawnFit)[string];
    }
    return { audit: { generated, meta, pawnFit, creatures } };
  } catch {
    return { audit: null };
  }
};
