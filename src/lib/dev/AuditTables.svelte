<!-- AuditTables.svelte — DEV TOOL. Renders the headless balance-audit results as readable tables.

     The audits are real HeadlessSession runs (ADR-033): buildScenario, real pawns, real ticks, one live
     session per process. They are NOT synthetic damage formulas. What they were missing is a way to
     LOOK at the output — a wall of console text in a 40-minute log is not inspectable, so every claim
     had to be relayed second-hand.

     Data comes from `static/audit/*.json`, written by the audits and pulled off the remote runner with
     `./audit.sh --fetch`. Nothing here computes balance; it only displays what the sim measured. -->
<script lang="ts">
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

  /** Position of a style in one armour class's ranking, 1-based; 0 when absent. */
  const posIn = (cls: string, style: string) =>
    (meta[cls]?.ranked.findIndex((r) => r.style === style) ?? -1) + 1;

  // How far each style climbs or falls when the target puts plate on — the single number that says
  // whether the armour split the design wants actually exists.
  let movement = $derived.by(() => {
    if (!meta.none || !meta.heavy) return [];
    return meta.none.ranked
      .map((r) => ({ style: r.style, bare: posIn('none', r.style), plate: posIn('heavy', r.style) }))
      .filter((m) => m.bare && m.plate)
      .map((m) => ({ ...m, delta: m.bare - m.plate }))
      .sort((a, b) => b.delta - a.delta);
  });

  const metaClasses = $derived(ARMOUR_ORDER.filter((c) => meta[c]));
  const fitClasses = $derived(ARMOUR_ORDER.filter((c) => pawnFit[c]));
</script>

<div class="audit">
  {#if !audit || (!metaClasses.length && !fitClasses.length)}
    <p class="note err">
      No audit results yet. Run <code>./audit.sh --all</code> then <code>./audit.sh --fetch</code>.
    </p>
  {:else}
    <p class="note">
      Real headless runs (<code>HeadlessSession</code>, real pawns over real ticks). Pulled from the
      remote runner{generated ? ` · ${new Date(generated).toLocaleString()}` : ''}. Refresh with
      <code>./audit.sh --fetch</code>.
    </p>

    {#if movement.length}
      <h3>Does armour flip the meta?</h3>
      <p class="sub">
        Where each style ranks when the target is bare, against when it wears plate. A positive move
        means the style climbs as the enemy armours up.
      </p>
      <table>
        <thead>
          <tr><th>style</th><th>vs bare</th><th>vs plate</th><th>move</th></tr>
        </thead>
        <tbody>
          {#each movement as m (m.style)}
            <tr>
              <td class="name">{m.style}</td>
              <td class="num">#{m.bare}</td>
              <td class="num">#{m.plate}</td>
              <td class="num" class:up={m.delta > 0} class:down={m.delta < 0}
                >{m.delta > 0 ? '+' : ''}{m.delta}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#each metaClasses as cls (cls)}
      <h3>Target wearing {cls} — fights won</h3>
      <p class="sub">Attacker always naked, {meta[cls].fights} fights per style.</p>
      <table>
        <thead>
          <tr><th>#</th><th>style</th><th>won</th><th>damage per landed hit</th></tr>
        </thead>
        <tbody>
          {#each meta[cls].ranked as r, i (r.style)}
            <tr>
              <td class="num dim">{i + 1}</td>
              <td class="name">{r.style}</td>
              <td class="num">{r.wins} <span class="dim">of {meta[cls].fights}</span></td>
              <td class="num">{r.perHit.toFixed(1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/each}

    {#each fitClasses as cls (cls)}
      <h3>Weapon × pawn fit — target in {cls} armour</h3>
      <p class="sub">
        The same weapon in hands built for it, average hands, and poor hands. The big number is
        <strong>combat value wrecked per 1000 ticks</strong> — each landed blow scores the fraction of
        the location it accounted for, times how much that location is worth to a fighter (the organs it
        holds and how hard it bleeds, plus the sight, grip and movement it gates). Kills are shown only
        as a secondary figure: a fight is decided by degrading what the other body can still do, and
        most end in collapse long before anyone dies.
        <strong>Armour at hit</strong> is how much armour was actually present where its blows landed —
        low means its penetration is being spent on lightly-armoured limbs rather than the breastplate.
      </p>
      <table>
        <thead>
          <tr>
            <th>weapon</th>
            <th>suited</th>
            <th>average</th>
            <th>poor</th>
            <th>armour at hit</th>
          </tr>
        </thead>
        <tbody>
          {#each pawnFit[cls].rows as r (r.weapon)}
            <tr>
              <td class="name">{r.weapon}</td>
              {#each r.fits as f (f.fit)}
                <td class="num">
                  <strong>{f.effectPer1k.toFixed(1)}</strong>
                  <span class="dim">· {f.wins}/{pawnFit[cls].fights} kills · {f.perHit.toFixed(0)} dmg</span>
                </td>
              {/each}
              <td class="num">{r.armourAtHit.toFixed(1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
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
    max-width: 60rem;
  }
  table {
    border-collapse: collapse;
    font-size: 0.8rem;
    min-width: 34rem;
  }
  th {
    text-align: left;
    font-weight: 600;
    opacity: 0.7;
    padding: 0.2rem 0.9rem 0.2rem 0;
    border-bottom: 1px solid currentColor;
  }
  td {
    padding: 0.16rem 0.9rem 0.16rem 0;
    border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }
  .name {
    white-space: nowrap;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .dim {
    opacity: 0.5;
  }
  .up {
    color: #7ec98a;
  }
  .down {
    color: #d08040;
  }
</style>
