<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/utils/pawnUtils';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';

  export let pawn: Pawn;

  $: needs = gameEngine.getPawnNeeds(pawn.id);
  $: activities = gameEngine.getPawnActivities(pawn.id);
  $: needStatus = gameEngine.getPawnNeedStatus(pawn.id);

  function isDoingActivity(activityName: string): boolean {
    return activities.some((activity) =>
      activity.toLowerCase().includes(activityName.toLowerCase())
    );
  }
</script>

<div class="needs-section">
  <div class="section-hdr">| NEEDS</div>

  <div class="need-row">
    <span class="lbl">HUNGER</span>
    <div class="bar">
      <div
        class="fill"
        style="width: {needs.hunger}%; background: {getNeedColor(needs.hunger)}"
      ></div>
    </div>
    <span class="val" style="color: {getNeedColor(needs.hunger)}">{Math.round(needs.hunger)}%</span>
    <span class="desc">{getNeedDescription('hunger', needs.hunger)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">REST</span>
    <div class="bar">
      <div
        class="fill"
        style="width: {needs.fatigue}%; background: {getNeedColor(needs.fatigue)}"
      ></div>
    </div>
    <span class="val" style="color: {getNeedColor(needs.fatigue)}"
      >{Math.round(needs.fatigue)}%</span
    >
    <span class="desc">{getNeedDescription('fatigue', needs.fatigue)}</span>
  </div>

  <div class="section-hdr sub">| ACTIVITIES</div>

  {#each activities as activity}
    <div class="row"><span class="lbl">ACTIVE</span><span class="val full">{activity}</span></div>
  {/each}
  {#if activities.length === 0}
    <div class="row"><span class="lbl">STATE</span><span class="val muted">idle</span></div>
  {/if}
  {#if needStatus.critical.length > 0}
    <div class="row">
      <span class="lbl neg">CRITICAL</span><span class="val neg"
        >{needStatus.critical.join(', ')}</span
      >
    </div>
  {/if}
  {#if needStatus.warning.length > 0}
    <div class="row">
      <span class="lbl warn">WARNING</span><span class="val warn"
        >{needStatus.warning.join(', ')}</span
      >
    </div>
  {/if}

  <div class="section-hdr sub">| FORCE</div>
  <div class="btn-row">
    <button
      class="act-btn"
      on:click={() => gameEngine.forcePawnActivity(pawn.id, 'sleeping')}
      disabled={isDoingActivity('sleeping') || isDoingActivity('resting')}>REST</button
    >
    <button
      class="act-btn"
      on:click={() => gameEngine.forcePawnActivity(pawn.id, 'eating')}
      disabled={isDoingActivity('eating')}>EAT</button
    >
    <button
      class="act-btn"
      on:click={() => gameEngine.forcePawnActivity(pawn.id, 'working')}
      disabled={isDoingActivity('working')}>WORK</button
    >
    <button
      class="act-btn"
      on:click={() => gameEngine.forcePawnActivity(pawn.id, 'idle')}
      disabled={activities.length === 0}>IDLE</button
    >
  </div>
</div>

<style>
  .needs-section {
    border-bottom: 1px solid var(--border);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
    border-top: none;
  }

  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }
  .need-row:hover {
    background: var(--bg-hover);
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }
  .lbl.neg {
    color: var(--neg);
  }
  .lbl.warn {
    color: var(--accent-hi);
  }

  .val {
    color: var(--text);
    font-size: 11px;
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }
  .val.full {
    width: auto;
    margin-left: auto;
    text-align: left;
  }
  .val.muted {
    color: var(--text-muted);
    font-style: italic;
  }
  .val.neg {
    color: var(--neg);
    margin-left: auto;
  }
  .val.warn {
    color: var(--accent-hi);
    margin-left: auto;
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
  }

  .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-active);
  }
  .fill {
    height: 100%;
  }

  .btn-row {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
  }

  .act-btn {
    padding: 3px 10px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .act-btn:hover:not(:disabled) {
    color: var(--accent-hi);
    background: var(--bg-active);
  }
  .act-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
