<!-- AuditTables.svelte — DEV TOOL. The headless balance-audit results, as sortable tables.

     The audits are real HeadlessSession runs (ADR-033): buildScenario, real pawns, real ticks, one live
     session per process. What they were missing is a way to LOOK at the output — a wall of console text
     in a 40-minute log is not inspectable, so every claim had to be relayed second-hand.

     Data is read off disk by `gear-db/+page.server.ts`, so the numbers are in the HTML at first paint.
     Written by the audits, pulled off the remote runner with `./audit.sh --fetch`. Nothing here computes
     balance; it only displays what the sim measured.

     ONE table per question, with the armour class as a COLUMN rather than three near-identical tables
     stacked down the page — the whole point is comparing a weapon across armour classes, and that is
     unreadable when the rows are in different tables. Sub-tabs switch between questions. -->
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
  interface AuditData {
    generated: string;
    meta: Record<string, { fights: number; ranked: MetaRow[] }>;
    pawnFit: Record<string, { fights: number; rows: PawnFitRow[] }>;
  }

  let { audit }: { audit: AuditData | null } = $props();

  const ARMOUR_ORDER = ['none', 'light', 'medium', 'heavy'];
  const meta = $derived(audit?.meta ?? {});
  const pawnFit = $derived(audit?.pawnFit ?? {});
  const generated = $derived(audit?.generated ?? '');
  const metaClasses = $derived(ARMOUR_ORDER.filter((c) => meta[c]));
  const fitClasses = $derived(ARMOUR_ORDER.filter((c) => pawnFit[c]));

  type Tab = 'fit' | 'styles' | 'move';
  let tab = $state<Tab>('fit');

  // ── one flat row per weapon × armour class ────────────────────────────────
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
          // Landed hits behind the suited number — the honesty column. A handful of hits means the
          // row is noise, however confident the decimals look.
          landed: of('suited')?.landed ?? 0
        });
      }
    }
    return out;
  });

  const fitCols: Column<FlatFit>[] = [
    { key: 'weapon', label: 'weapon', get: (r) => r.weapon },
    { key: 'armour', label: 'target armour', get: (r) => ARMOUR_ORDER.indexOf(r.armour), disp: (r) => r.armour },
    {
      key: 'suited',
      label: 'suited',
      numeric: true,
      get: (r) => r.suited,
      disp: (r) => r.suited.toFixed(1),
      title: 'Combat value wrecked per 1000 ticks, in hands built for this weapon'
    },
    { key: 'average', label: 'average', numeric: true, get: (r) => r.average, disp: (r) => r.average.toFixed(1) },
    { key: 'poor', label: 'poor', numeric: true, get: (r) => r.poor, disp: (r) => r.poor.toFixed(1) },
    {
      key: 'ratio',
      label: 'suited ÷ poor',
      numeric: true,
      get: (r) => r.ratio,
      disp: (r) => (r.ratio > 0 ? `${r.ratio.toFixed(1)}×` : '—'),
      cls: (r) => (r.ratio >= 3 ? 'up' : r.ratio > 0 && r.ratio <= 1.5 ? 'down' : 'dim'),
      title: 'How much the right pawn is worth. At or below 1 the weapon has no build payoff at all.'
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

  // ── one flat row per style × armour class ─────────────────────────────────
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
        out.push({ style: r.style, armour: cls, wins: r.wins, fights: meta[cls].fights, perHit: r.perHit });
    return out;
  });

  const metaCols: Column<FlatMeta>[] = [
    { key: 'style', label: 'style', get: (r) => r.style },
    { key: 'armour', label: 'target armour', get: (r) => ARMOUR_ORDER.indexOf(r.armour), disp: (r) => r.armour },
    {
      key: 'wins',
      label: 'fights won',
      numeric: true,
      get: (r) => r.wins,
      disp: (r) => `${r.wins} / ${r.fights}`
    },
    { key: 'perHit', label: 'damage per landed hit', numeric: true, get: (r) => r.perHit, disp: (r) => r.perHit.toFixed(1) }
  ];

  // ── how each style moves when the target armours up ───────────────────────
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
      .map((r) => ({ style: r.style, bare: posIn('none', r.style), plate: posIn('heavy', r.style) }))
      .filter((m) => m.bare && m.plate)
      .map((m) => ({ ...m, delta: m.bare - m.plate }));
  });
  const moveCols: Column<MoveRow>[] = [
    { key: 'style', label: 'style', get: (r) => r.style },
    { key: 'bare', label: 'vs bare', numeric: true, get: (r) => r.bare, disp: (r) => `#${r.bare}` },
    { key: 'plate', label: 'vs plate', numeric: true, get: (r) => r.plate, disp: (r) => `#${r.plate}` },
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
        <button class="tab" class:active={tab === t.key} onclick={() => (tab = t.key)}>{t.label}</button>
      {/each}
    </div>
    <p class="note">
      Real headless runs (<code>HeadlessSession</code>, real pawns over real ticks){generated
        ? ` · ${new Date(generated).toLocaleString()}`
        : ''}. Click any heading to sort. Refresh with <code>./audit.sh --fetch</code>.
    </p>

    {#if tab === 'fit'}
      <p class="sub">
        The same weapon in hands built for it, average hands, and poor hands, against each armour class.
        Numbers are <strong>combat value wrecked per 1000 ticks</strong>: each landed blow scores the
        fraction of the location it accounted for, times what that location is worth to a fighter — the
        organs it holds and how hard it bleeds, plus the sight, grip and movement it gates. Kills are
        secondary, because a fight is decided by degrading what the other body can still do, and most end
        in collapse long before anyone dies. Watch the <strong>hits landed</strong> column: under about
        ten, the row is noise.
      </p>
      <SortableTable columns={fitCols} rows={flatFit} initialSort="suited" initialDir={-1} />
    {:else if tab === 'styles'}
      <p class="sub">Attacker always naked; only the target's armour changes.</p>
      <SortableTable columns={metaCols} rows={flatMeta} initialSort="wins" initialDir={-1} />
    {:else}
      <p class="sub">
        Where each style ranks against a bare target, against where it ranks against plate. A positive
        move means the style climbs as the enemy armours up.
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
