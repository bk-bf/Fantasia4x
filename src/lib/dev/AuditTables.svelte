<!-- AuditTables.svelte — DEV TOOL. The headless balance-audit results, as sortable tables.

     The audits are real HeadlessSession runs (ADR-033): buildScenario, real pawns, real ticks, one live
     session per process. What they were missing is a way to LOOK at the output — a wall of console text
     in a 40-minute log is not inspectable, so every claim had to be relayed second-hand.

     Data is read off disk by `gear-db/+page.server.ts`, so the numbers are in the HTML at first paint.
     Written by the audits, pulled off the remote runner with `./audit.sh --fetch`. Nothing here computes
     balance; it only displays what the sim measured. -->
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
    /** Only the pawn-fit sweeps score effectiveness so far; the armour sweeps still rank by wins. */
    effectPer1k?: number;
  }
  interface AuditData {
    generated: string;
    meta: Record<string, { fights: number; ranked: MetaRow[] }>;
    pawnFit: Record<string, { fights: number; rows: PawnFitRow[] }>;
  }

  // Read off disk by `+page.server.ts`, so the numbers are already in the HTML — no client fetch to
  // fail during SSR, and a screenshot shows the real table rather than a spinner.
  let { audit }: { audit: AuditData | null } = $props();

  const ARMOUR_ORDER = ['none', 'light', 'medium', 'heavy'];
  const meta = $derived(audit?.meta ?? {});
  const pawnFit = $derived(audit?.pawnFit ?? {});
  const generated = $derived(audit?.generated ?? '');
  const metaClasses = $derived(ARMOUR_ORDER.filter((c) => meta[c]));
  const fitClasses = $derived(ARMOUR_ORDER.filter((c) => pawnFit[c]));

  const posIn = (cls: string, style: string) =>
    (meta[cls]?.ranked.findIndex((r) => r.style === style) ?? -1) + 1;

  interface MoveRow {
    style: string;
    bare: number;
    plate: number;
    delta: number;
  }
  // How far each style climbs or falls when the target puts plate on — the single number that says
  // whether the armour split the design wants actually exists.
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

  const metaCols = (fights: number): Column<MetaRow>[] => [
    { key: 'style', label: 'style', get: (r) => r.style },
    {
      key: 'wins',
      label: 'fights won',
      numeric: true,
      get: (r) => r.wins,
      disp: (r) => `${r.wins} / ${fights}`
    },
    {
      key: 'perHit',
      label: 'damage per landed hit',
      numeric: true,
      get: (r) => r.perHit,
      disp: (r) => r.perHit.toFixed(1)
    }
  ];

  const fitOf = (r: PawnFitRow, f: string) => r.fits.find((x) => x.fit === f);
  const eff = (r: PawnFitRow, f: string) => fitOf(r, f)?.effectPer1k ?? 0;
  const ratio = (r: PawnFitRow) => (eff(r, 'poor') > 0 ? eff(r, 'suited') / eff(r, 'poor') : 0);

  const fitCols = (fights: number): Column<PawnFitRow>[] => [
    { key: 'weapon', label: 'weapon', get: (r) => r.weapon },
    {
      key: 'suited',
      label: 'suited',
      numeric: true,
      get: (r) => eff(r, 'suited'),
      disp: (r) => eff(r, 'suited').toFixed(1),
      title: 'Combat value wrecked per 1000 ticks, in hands built for this weapon'
    },
    {
      key: 'average',
      label: 'average',
      numeric: true,
      get: (r) => eff(r, 'average'),
      disp: (r) => eff(r, 'average').toFixed(1)
    },
    {
      key: 'poor',
      label: 'poor',
      numeric: true,
      get: (r) => eff(r, 'poor'),
      disp: (r) => eff(r, 'poor').toFixed(1)
    },
    {
      key: 'ratio',
      label: 'suited ÷ poor',
      numeric: true,
      get: ratio,
      disp: (r) => (ratio(r) > 0 ? `${ratio(r).toFixed(1)}×` : '—'),
      // At or below 1 the right pawn does NOTHING for this weapon — no build payoff at all.
      cls: (r) => (ratio(r) >= 3 ? 'up' : ratio(r) > 0 && ratio(r) <= 1.5 ? 'down' : 'dim'),
      title: 'How much the right pawn is worth. At or below 1 the weapon has no build payoff.'
    },
    {
      key: 'armour',
      label: 'armour at hit',
      numeric: true,
      get: (r) => r.armourAtHit,
      disp: (r) => r.armourAtHit.toFixed(1),
      title:
        'Armour actually present where its blows landed. Low means its penetration is being spent on lightly-armoured limbs rather than the breastplate.'
    },
    {
      key: 'kills',
      label: 'kills (suited)',
      numeric: true,
      get: (r) => fitOf(r, 'suited')?.wins ?? 0,
      disp: (r) => `${fitOf(r, 'suited')?.wins ?? 0} / ${fights}`,
      title: 'Secondary only — a fight is decided long before anyone dies.'
    }
  ];
</script>

<div class="audit">
  {#if !audit || (!metaClasses.length && !fitClasses.length)}
    <p class="note err">
      No audit results yet. Run <code>./audit.sh --all</code> then <code>./audit.sh --fetch</code>.
    </p>
  {:else}
    <p class="note">
      Real headless runs (<code>HeadlessSession</code>, real pawns over real ticks){generated
        ? ` · ${new Date(generated).toLocaleString()}`
        : ''}. Click any heading to sort. Refresh with <code>./audit.sh --fetch</code>.
    </p>

    {#each fitClasses as cls (cls)}
      <h3>Weapon × pawn fit — target in {cls} armour</h3>
      <p class="sub">
        The same weapon in hands built for it, average hands, and poor hands. Numbers are
        <strong>combat value wrecked per 1000 ticks</strong>: each landed blow scores the fraction of
        the location it accounted for, times what that location is worth to a fighter — the organs it
        holds and how hard it bleeds, plus the sight, grip and movement it gates. Kills are secondary,
        because a fight is decided by degrading what the other body can still do, and most end in
        collapse long before anyone dies.
      </p>
      <SortableTable
        columns={fitCols(pawnFit[cls].fights)}
        rows={pawnFit[cls].rows}
        initialSort="suited"
        initialDir={-1}
      />
    {/each}

    {#if movement.length}
      <h3>Does armour flip the meta?</h3>
      <p class="sub">
        Where each style ranks against a bare target, against where it ranks against plate. A positive
        move means the style climbs as the enemy armours up.
      </p>
      <SortableTable columns={moveCols} rows={movement} initialSort="delta" initialDir={-1} />
    {/if}

    {#each metaClasses as cls (cls)}
      <h3>Target wearing {cls} — fights won</h3>
      <p class="sub">Attacker always naked, {meta[cls].fights} fights per style.</p>
      <SortableTable
        columns={metaCols(meta[cls].fights)}
        rows={meta[cls].ranked}
        initialSort="wins"
        initialDir={-1}
      />
    {/each}
  {/if}
</div>

<style>
  .audit {
    padding: 0.5rem 0 2rem;
  }
  .note {
    font-size: 0.8rem;
    opacity: 0.75;
    margin: 0.2rem 0 1rem;
  }
  .note.err {
    color: #d08040;
    opacity: 1;
  }
  h3 {
    margin: 1.6rem 0 0.2rem;
    font-size: 0.95rem;
    letter-spacing: 0.03em;
  }
  .sub {
    font-size: 0.75rem;
    opacity: 0.65;
    margin: 0 0 0.5rem;
    max-width: 62rem;
  }
</style>
