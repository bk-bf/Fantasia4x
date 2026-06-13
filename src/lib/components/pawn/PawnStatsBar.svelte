<!-- PawnStatsBar.svelte — pawn name + core attribute row; spans the full status panel width -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';

  export let pawn: Pawn;
</script>

<div class="stats-bar">
  <div class="section-hdr">| {pawn.name.toUpperCase()}</div>
  <div class="stats-grid">
    <div class="stat-cell"><span class="stat-lbl">STR</span><span class="stat-val">{pawn.stats.strength}</span></div>
    <div class="stat-cell"><span class="stat-lbl">DEX</span><span class="stat-val">{pawn.stats.dexterity}</span></div>
    <div class="stat-cell"><span class="stat-lbl">CON</span><span class="stat-val">{pawn.stats.constitution}</span></div>
    <div class="stat-cell"><span class="stat-lbl">INT</span><span class="stat-val">{pawn.stats.intelligence}</span></div>
    <div class="stat-cell"><span class="stat-lbl">PER</span><span class="stat-val">{pawn.stats.perception}</span></div>
    <div class="stat-cell"><span class="stat-lbl">CHA</span><span class="stat-val">{pawn.stats.charisma}</span></div>
  </div>
</div>

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }

  .stat-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 2px 0;
  }

  .stat-lbl {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .stat-val {
    color: var(--accent-hi);
    font-size: 12px;
    font-weight: 600;
  }
</style>
