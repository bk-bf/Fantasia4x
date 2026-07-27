<!-- PawnAptitudes.svelte — the SECOND combat axis (COMBAT-BALANCE tasks 8–9).
     The core stats say how hard this body can hit; these say how well it fights. They are rolled per
     pawn, independently of the stat block, which is why two pawns with the same physique are not the
     same fighter — and that is invisible unless it is shown. Rendered above the stat table on the
     Attributes tab. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { APTITUDE_IDS, APTITUDE_MIN, APTITUDE_MAX } from '$lib/game/core/aptitudes';

  export let pawn: Pawn;

  /** Short player-facing label per aptitude — never the stat id (AGENTS: no raw ids in the UI). */
  const LABEL: Record<string, string> = {
    hit_chance: 'accuracy',
    attack_speed: 'cadence',
    hit_precision: 'precision',
    armor_damage: 'leverage',
    dodge: 'evasion',
    aim_accuracy: 'marksmanship'
  };
  const BLURB: Record<string, string> = {
    hit_chance: 'How reliably a swing finds its mark.',
    attack_speed: 'How quickly blows follow one another.',
    hit_precision: 'How often a blow finds something that ends a fight.',
    armor_damage: 'How much force is put through a foe’s armour.',
    dodge: 'How readily a blow is slipped.',
    aim_accuracy: 'How true a shot flies.'
  };

  // A roll is a multiplier around 1.0. Show it as a signed percentage — "+9%" reads; "1.09" doesn't.
  $: rows = APTITUDE_IDS.map((id) => {
    const v = pawn.aptitudes?.[id] ?? 1;
    const pct = Math.round((v - 1) * 100);
    return {
      id,
      label: LABEL[id] ?? id,
      title: `${LABEL[id] ?? id} ×${v.toFixed(2)} — ${BLURB[id] ?? ''}`,
      pct,
      // Position in the roll band, for the little bar. Clamped: traits can push past the band.
      frac: Math.max(0, Math.min(1, (v - APTITUDE_MIN) / (APTITUDE_MAX - APTITUDE_MIN))),
      tone: pct > 2 ? 'good' : pct < -2 ? 'bad' : 'mid'
    };
  });
  $: unrolled = !pawn.aptitudes;
</script>

<div class="apt">
  <div class="hdr">
    APTITUDES <span class="sub">how well it fights — rolled, not earned</span>
  </div>
  {#if unrolled}
    <p class="none">No aptitudes rolled for this pawn — every one reads as average.</p>
  {:else}
    <div class="grid">
      {#each rows as r (r.id)}
        <div class="cell" title={r.title}>
          <span class="nm">{r.label}</span>
          <span class="bar"><i style="left: {r.frac * 100}%"></i></span>
          <span class="vl {r.tone}">{r.pct > 0 ? '+' : ''}{r.pct}%</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .apt {
    font-family: var(--font-mono);
    font-size: 11px;
    margin-bottom: 6px;
  }
  .hdr {
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
  }
  .sub {
    color: var(--text-dim);
    letter-spacing: 0;
    text-transform: none;
    font-size: 10px;
    margin-left: 6px;
  }
  .none {
    color: var(--text-dim);
    padding: 3px 6px;
    margin: 0;
  }
  /* Wider than the stat table's 150px: these labels are words, not abbreviations, and
     "marksmanship" was clipping. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 0 8px;
  }
  .cell {
    display: grid;
    grid-template-columns: 1fr 40px 42px;
    align-items: center;
    gap: 6px;
    padding: 1px 6px;
    border-bottom: 1px dotted var(--border, #222);
    cursor: help;
  }
  .cell:hover {
    background: var(--bg-hover, #151c26);
  }
  .nm {
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Where this roll sits in the band — a tick, not a fill: there is no "more is progress" here. */
  .bar {
    position: relative;
    height: 3px;
    background: var(--border, #222);
    border-radius: 2px;
  }
  .bar i {
    position: absolute;
    top: -2px;
    width: 3px;
    height: 7px;
    margin-left: -1px;
    background: var(--text-dim);
    border-radius: 1px;
  }
  .vl {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .vl.good {
    color: #83bb6f;
  }
  .vl.bad {
    color: #d76f5d;
  }
  .vl.mid {
    color: var(--text-dim);
  }
</style>
