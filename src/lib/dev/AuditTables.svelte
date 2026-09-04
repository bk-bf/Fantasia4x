<script lang="ts">
  import SortableTable from './SortableTable.svelte';
  import type { Column } from './sortableTable';

  interface FitCell {
    fit: string;
    wins: number;
    landed: number;
    swings: number;
    perHit: number;
    effectPer1k: number;
  }
  interface PawnFitRow {
    weapon: string;
    armourAtHit: number;
    fits: FitCell[];
  }
  interface MetaRow {
    style: string;
    wins: number;
    perHit: number;
  }
  interface CreatureRow {
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
  }
  interface AuditData {
    generated: string;
    meta: Record<string, { fights: number; ranked: MetaRow[] }>;
    pawnFit: Record<string, { fights: number; rows: PawnFitRow[] }>;
    creatures?: CreatureRow[];
  }

  let { audit }: { audit: AuditData | null } = $props();

  const ARMOUR_ORDER = ['none', 'light', 'medium', 'heavy'];
  const meta = $derived(audit?.meta ?? {});
  const pawnFit = $derived(audit?.pawnFit ?? {});
  const generated = $derived(audit?.generated ?? '');
  const metaClasses = $derived(ARMOUR_ORDER.filter((c) => meta[c]));
  const fitClasses = $derived(ARMOUR_ORDER.filter((c) => pawnFit[c]));

  type Tab = 'creatures' | 'byCreature' | 'fit' | 'styles' | 'move';
  let tab = $state<Tab>('creatures');

  const creatures = $derived(audit?.creatures ?? []);

  interface WeaponAgg {
    weapon: string;
    effect: number;
    landed: number;
    killRate: number;
    softHide: number;
    thickHide: number;
    naked: number;
    light: number;
    medium: number;
    heavy: number;
    armourCost: number;
  }
  const THICK_HIDE = 26;
  const weaponAgg = $derived.by<WeaponAgg[]>(() => {
    if (!creatures.length) return [];
    const acc: Record<string, { e: number; n: number; landed: number; k: number; f: number }> = {};
    const byArm: Record<string, { e: number; n: number }> = {};
    const byHide: Record<string, { e: number; n: number }> = {};
    for (const r of creatures) {
      (acc[r.weapon] ??= { e: 0, n: 0, landed: 0, k: 0, f: 0 });
      const a = acc[r.weapon];
      a.e += r.effectPer1k;
      a.n++;
      a.landed += r.landed;
      a.k += r.kills;
      a.f += r.fights;
      const k = `${r.weapon}|${r.armour}`;
      (byArm[k] ??= { e: 0, n: 0 });
      byArm[k].e += r.effectPer1k;
      byArm[k].n++;
      const h = `${r.weapon}|${r.naturalArmor >= THICK_HIDE ? 'thick' : 'soft'}`;
      (byHide[h] ??= { e: 0, n: 0 });
      byHide[h].e += r.effectPer1k;
      byHide[h].n++;
    }
    const avg = (m: Record<string, { e: number; n: number }>, k: string) => {
      const x = m[k];
      return x && x.n ? x.e / x.n : 0;
    };
    return Object.entries(acc).map(([weapon, a]) => ({
      weapon,
      effect: a.e / a.n,
      landed: a.landed,
      killRate: a.f ? a.k / a.f : 0,
      softHide: avg(byHide, `${weapon}|soft`),
      thickHide: avg(byHide, `${weapon}|thick`),
      naked: avg(byArm, `${weapon}|none`),
      light: avg(byArm, `${weapon}|light`),
      medium: avg(byArm, `${weapon}|medium`),
      heavy: avg(byArm, `${weapon}|heavy`),
      armourCost: avg(byArm, `${weapon}|heavy`) - avg(byArm, `${weapon}|none`)
    }));
  });

  const num = (v: number) => v.toFixed(2);
  const weaponCols: Column<WeaponAgg>[] = [
    { key: 'weapon', label: 'weapon', get: (r) => r.weapon },
    {
      key: 'effect',
      label: 'overall',
      numeric: true,
      get: (r) => r.effect,
      disp: (r) => num(r.effect),
      title: 'Mean combat value wrecked per 1000 ticks, across every creature and armour class'
    },
    {
      key: 'softHide',
      label: 'soft creatures',
      numeric: true,
      get: (r) => r.softHide,
      disp: (r) => num(r.softHide),
      title: `Against creatures with natural armour under ${THICK_HIDE}`
    },
    {
      key: 'thickHide',
      label: 'armoured creatures',
      numeric: true,
      get: (r) => r.thickHide,
      disp: (r) => num(r.thickHide),
      title: `Against creatures with natural armour of ${THICK_HIDE} or more — owlbears, great beasts, warbosses`
    },
    { key: 'naked', label: 'naked', numeric: true, get: (r) => r.naked, disp: (r) => num(r.naked) },
    { key: 'light', label: 'light', numeric: true, get: (r) => r.light, disp: (r) => num(r.light) },
    { key: 'medium', label: 'medium', numeric: true, get: (r) => r.medium, disp: (r) => num(r.medium) },
    { key: 'heavy', label: 'plate', numeric: true, get: (r) => r.heavy, disp: (r) => num(r.heavy) },
    {
      key: 'armourCost',
      label: 'naked → plate',
      numeric: true,
      get: (r) => r.armourCost,
      disp: (r) => (r.armourCost >= 0 ? `+${num(r.armourCost)}` : num(r.armourCost)),
      cls: (r) => (r.armourCost > 0 ? 'up' : r.armourCost < -1 ? 'down' : 'dim'),
      title: 'What the pawn’s OWN armour does to this weapon. Negative = wearing it makes the pawn worse.'
    },
    {
      key: 'killRate',
      label: 'kill rate',
      numeric: true,
      get: (r) => r.killRate,
      disp: (r) => `${(r.killRate * 100).toFixed(0)}%`,
      title: 'Secondary — a fight is decided long before anything dies.'
    },
    {
      key: 'landed',
      label: 'hits landed',
      numeric: true,
      get: (r) => r.landed,
      cls: (r) => (r.landed < 200 ? 'down' : 'dim'),
      title: 'Total landed hits behind this row. Small numbers are noise.'
    }
  ];

  const ARM_ORDER = ['none', 'light', 'medium', 'heavy'];
  const matchupCols: Column<CreatureRow>[] = [
    { key: 'weapon', label: 'weapon', get: (r) => r.weapon },
    { key: 'creature', label: 'creature', get: (r) => r.creature },
    { key: 'tier', label: 'tier', numeric: true, get: (r) => r.tier },
    {
      key: 'hide',
      label: 'natural armour',
      numeric: true,
      get: (r) => r.naturalArmor,
      title: 'The creature’s own hide — its armour, not worn.'
    },
    {
      key: 'armour',
      label: 'pawn wearing',
      get: (r) => ARM_ORDER.indexOf(r.armour),
      disp: (r) => r.armour
    },
    {
      key: 'effect',
      label: 'effect',
      numeric: true,
      get: (r) => r.effectPer1k,
      disp: (r) => num(r.effectPer1k),
      title: 'Combat value wrecked per 1000 ticks'
    },
    { key: 'perHit', label: 'dmg / hit', numeric: true, get: (r) => r.perHit, disp: (r) => r.perHit.toFixed(1) },
    {
      key: 'landed',
      label: 'hits',
      numeric: true,
      get: (r) => r.landed,
      cls: (r) => (r.landed < 10 ? 'down' : 'dim')
    },
    {
      key: 'kills',
      label: 'kills',
      numeric: true,
      get: (r) => r.kills,
      disp: (r) => `${r.kills} / ${r.fights}`
    }
  ];

  interface FlatFit {
    weapon: string;
    armour: string;
    armourAtHit: number;
    suited: number;
    average: number;
    poor: number;
    ratio: number;
    kills: number;
    fights: number;
    landed: number;
  }
  const flatFit = $derived.by<FlatFit[]>(() => {
    const out: FlatFit[] = [];
    for (const cls of fitClasses) {
      const src = pawnFit[cls];
      for (const r of src.rows) {
        const of = (f: string) => r.fits.find((x) => x.fit === f);
        const s = of('suited')?.effectPer1k ?? 0;
        const p = of('poor')?.effectPer1k ?? 0;
        out.push({
          weapon: r.weapon,
          armour: cls,
          armourAtHit: r.armourAtHit,
          suited: s,
          average: of('average')?.effectPer1k ?? 0,
          poor: p,
          ratio: p > 0 ? s / p : 0,
          kills: of('suited')?.wins ?? 0,
          fights: src.fights,
          landed: of('suited')?.landed ?? 0
        });
      }
    }
    return out;
  });

  const fitCols: Column<FlatFit>[] = [
    { key: 'weapon', label: 'weapon', get: (r) => r.weapon },
    {
      key: 'armour',
      label: 'target armour',
      get: (r) => ARMOUR_ORDER.indexOf(r.armour),
      disp: (r) => r.armour
    },
    {
      key: 'suited',
      label: 'suited',
      numeric: true,
      get: (r) => r.suited,
      disp: (r) => r.suited.toFixed(1),
      title: 'Combat value wrecked per 1000 ticks, in hands built for this weapon'
    },
    {
      key: 'average',
      label: 'average',
      numeric: true,
      get: (r) => r.average,
      disp: (r) => r.average.toFixed(1)
    },
    {
      key: 'poor',
      label: 'poor',
      numeric: true,
      get: (r) => r.poor,
      disp: (r) => r.poor.toFixed(1)
    },
    {
      key: 'ratio',
      label: 'suited ÷ poor',
      numeric: true,
      get: (r) => r.ratio,
      disp: (r) => (r.ratio > 0 ? `${r.ratio.toFixed(1)}×` : '—'),
      cls: (r) => (r.ratio >= 3 ? 'up' : r.ratio > 0 && r.ratio <= 1.5 ? 'down' : 'dim'),
      title:
        'How much the right pawn is worth. At or below 1 the weapon has no build payoff at all.'
    },
    {
      key: 'armourAtHit',
      label: 'armour at hit',
      numeric: true,
      get: (r) => r.armourAtHit,
      disp: (r) => r.armourAtHit.toFixed(1),
      title:
        'Armour actually present where its blows landed. Low means its penetration is spent on lightly-armoured limbs rather than the breastplate.'
    },
    {
      key: 'landed',
      label: 'hits landed',
      numeric: true,
      get: (r) => r.landed,
      cls: (r) => (r.landed < 10 ? 'down' : 'dim'),
      title: 'Landed hits behind the suited figure. Under about 10 and the row is noise.'
    },
    {
      key: 'kills',
      label: 'kills',
      numeric: true,
      get: (r) => r.kills,
      disp: (r) => `${r.kills} / ${r.fights}`,
      title: 'Secondary only — a fight is decided long before anyone dies.'
    }
  ];

  interface FlatMeta {
    style: string;
    armour: string;
    wins: number;
    fights: number;
    perHit: number;
  }
  const flatMeta = $derived.by<FlatMeta[]>(() => {
    const out: FlatMeta[] = [];
    for (const cls of metaClasses)
      for (const r of meta[cls].ranked)
        out.push({
          style: r.style,
          armour: cls,
          wins: r.wins,
          fights: meta[cls].fights,
          perHit: r.perHit
        });
    return out;
  });

  const metaCols: Column<FlatMeta>[] = [
    { key: 'style', label: 'style', get: (r) => r.style },
    {
      key: 'armour',
      label: 'target armour',
      get: (r) => ARMOUR_ORDER.indexOf(r.armour),
      disp: (r) => r.armour
    },
    {
      key: 'wins',
      label: 'fights won',
      numeric: true,
      get: (r) => r.wins,
      disp: (r) => `${r.wins} / ${r.fights}`
    },
    {
      key: 'perHit',
      label: 'damage per landed hit',
      numeric: true,
      get: (r) => r.perHit,
      disp: (r) => r.perHit.toFixed(1)
    }
  ];

  interface MoveRow {
    style: string;
    bare: number;
    plate: number;
    delta: number;
  }
  const posIn = (cls: string, style: string) =>
    (meta[cls]?.ranked.findIndex((r) => r.style === style) ?? -1) + 1;
  const movement = $derived.by<MoveRow[]>(() => {
    if (!meta.none || !meta.heavy) return [];
    return meta.none.ranked
      .map((r) => ({
        style: r.style,
        bare: posIn('none', r.style),
        plate: posIn('heavy', r.style)
      }))
      .filter((m) => m.bare && m.plate)
      .map((m) => ({ ...m, delta: m.bare - m.plate }));
  });
  const moveCols: Column<MoveRow>[] = [
    { key: 'style', label: 'style', get: (r) => r.style },
    { key: 'bare', label: 'vs bare', numeric: true, get: (r) => r.bare, disp: (r) => `#${r.bare}` },
    {
      key: 'plate',
      label: 'vs plate',
      numeric: true,
      get: (r) => r.plate,
      disp: (r) => `#${r.plate}`
    },
    {
      key: 'delta',
      label: 'move',
      numeric: true,
      get: (r) => r.delta,
      disp: (r) => (r.delta > 0 ? `+${r.delta}` : String(r.delta)),
      cls: (r) => (r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'dim'),
      title: 'Places climbed when the target armours up. Positive means better against armour.'
    }
  ];

  const TABS: { key: Tab; label: string }[] = [
    { key: 'creatures', label: 'Weapon summary' },
    { key: 'byCreature', label: 'Every matchup' },
    { key: 'fit', label: 'Weapon × pawn fit' },
    { key: 'styles', label: 'Style vs armour' },
    { key: 'move', label: 'Armour flip' }
  ];
</script>

<div class="audit">
  {#if !audit || (!metaClasses.length && !fitClasses.length)}
    <p class="note err">
      No audit results yet. Run <code>./audit.sh --all</code> then <code>./audit.sh --fetch</code>.
    </p>
  {:else}
    <div class="tabs sub">
      {#each TABS as t (t.key)}
        <button class="tab" class:active={tab === t.key} onclick={() => (tab = t.key)}
          >{t.label}</button
        >
      {/each}
    </div>
    <p class="note">
      Real headless runs (<code>HeadlessSession</code>, real pawns over real ticks){generated
        ? ` · ${new Date(generated).toLocaleString()}`
        : ''}. Click any heading to sort. Refresh with <code>./audit.sh --fetch</code>.
    </p>

    {#if tab === 'creatures'}
      {#if !creatures.length}
        <p class="note err">No creature results yet — run <code>./audit.sh --creatures</code>.</p>
      {:else}
        <p class="sub">
          Every weapon against the real hostile creatures from <code>creatures.json</code>, in hands
          built for it, across all four armour classes. <strong>Overall</strong> is the mean combat
          value wrecked per 1000 ticks. The four armour columns show the same weapon with the PAWN
          naked, in light, medium and plate — <strong>naked → plate</strong> is what wearing armour
          does to its output.
        </p>
        <SortableTable columns={weaponCols} rows={weaponAgg} initialSort="effect" initialDir={-1} />
      {/if}
    {:else if tab === 'byCreature'}
      {#if !creatures.length}
        <p class="note err">No creature results yet — run <code>./audit.sh --creatures</code>.</p>
      {:else}
        <p class="sub">
          The full grid: {creatures.length.toLocaleString()} matchups. Sort by creature to see what beats
          it, by weapon to see what it is good against, or by tier to read the difficulty curve.
        </p>
        <SortableTable columns={matchupCols} rows={creatures} initialSort="effect" initialDir={-1} />
      {/if}
    {:else if tab === 'fit'}
      <p class="sub">
        The same weapon in hands built for it, average hands, and poor hands, against each armour
        class. Numbers are <strong>combat value wrecked per 1000 ticks</strong>: each landed blow
        scores the fraction of the location it accounted for, times what that location is worth to a
        fighter — the organs it holds and how hard it bleeds, plus the sight, grip and movement it
        gates. Kills are secondary, because a fight is decided by degrading what the other body can
        still do, and most end in collapse long before anyone dies. Watch the
        <strong>hits landed</strong> column: under about ten, the row is noise.
      </p>
      <SortableTable columns={fitCols} rows={flatFit} initialSort="suited" initialDir={-1} />
    {:else if tab === 'styles'}
      <p class="sub">Attacker always naked; only the target's armour changes.</p>
      <SortableTable columns={metaCols} rows={flatMeta} initialSort="wins" initialDir={-1} />
    {:else}
      <p class="sub">
        Where each style ranks against a bare target, against where it ranks against plate. A
        positive move means the style climbs as the enemy armours up.
      </p>
      <SortableTable columns={moveCols} rows={movement} initialSort="delta" initialDir={-1} />
    {/if}
  {/if}
</div>

<style>
  .audit {
    padding: 0.5rem 0 2rem;
  }
  .tabs.sub {
    display: flex;
    gap: 6px;
    margin: 0 0 0.6rem;
    flex-wrap: wrap;
  }
  .tab {
    background: #1a1710;
    border: 1px solid #362f22;
    color: #9a9279;
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
  }
  .tab:hover {
    color: #c9b48a;
  }
  .tab.active {
    background: #d8ab52;
    border-color: #d8ab52;
    color: #14110b;
  }
  .note {
    font-size: 0.8rem;
    opacity: 0.75;
    margin: 0.2rem 0 0.6rem;
  }
  .note.err {
    color: #d08040;
    opacity: 1;
  }
  .sub {
    font-size: 0.75rem;
    opacity: 0.65;
    margin: 0 0 0.6rem;
    max-width: 62rem;
  }
</style>
