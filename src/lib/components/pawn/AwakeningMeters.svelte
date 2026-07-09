<script lang="ts">
  // LINEAGES §4 — a pawn's active awakening meters, shown ONLY while a meter is being fed (value > 0),
  // and hidden again when it lapses back to empty (like the drying meter). Fills → the pawn will turn to
  // that lineage at its next growth event.
  import type { Pawn } from '$lib/game/core/types';
  import { awakeningLabel, lineageDef } from '$lib/game/core/Lineages';

  export let pawn: Pawn;

  // Only meters with real progress surface; a full one reads "READY".
  $: active = (pawn.lineagePaths ?? []).filter((p) => p.value > 0);

  function blockBar(pct: number, width = 16): string {
    const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
  }
  function color(pct: number): string {
    return pct >= 100 ? 'var(--pos)' : pct >= 60 ? '#b060d0' : '#8a5aa8';
  }
</script>

{#if active.length}
  <div class="section-hdr">| AWAKENING</div>
  {#each active as path}
    {@const pct = Math.round((path.value / path.target) * 100)}
    {@const name = lineageDef(path.lineage)?.name ?? path.lineage}
    <div class="need-row">
      <span class="lbl">{name}</span>
      <span class="block-bar" style="color: {color(pct)}">{blockBar(pct)}</span>
      <span class="val" style="color: {color(pct)}">{pct >= 100 ? 'READY' : pct + '%'}</span>
      <span class="desc">{awakeningLabel(path.condition) ?? ''}</span>
    </div>
  {/each}
{/if}

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
  }
  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
    min-height: 26px;
  }
  .need-row:hover {
    background: var(--bg-hover);
  }
  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 12px;
    width: 70px;
    flex-shrink: 0;
  }
  .val {
    font-size: 12px;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .desc {
    color: var(--text-muted);
    font-size: 12px;
    font-style: italic;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .block-bar {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
</style>
