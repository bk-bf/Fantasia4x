<script lang="ts">
  import type { GameState, Pawn } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/components/util/pawnUtils';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import ConditionChips from './ConditionChips.svelte';
  import AwakeningMeters from './AwakeningMeters.svelte';

  export let pawn: Pawn;
  export let gameState: GameState;

  $: needs = pawn.needs;
  $: conditionViews = getActiveConditionViews(pawn);
  // All needs are flat 0–100.
  $: hungerPct = Math.round(needs.hunger);
  $: fatiguePct = Math.round(needs.fatigue);
  $: thirstPct = Math.round(needs.thirst ?? 0);
  $: hygienePct = Math.round(needs.hygiene ?? 0);
  $: wetnessPct = Math.round(needs.wetness ?? 0);
  function getWetColor(pct: number): string {
    if (pct < 25) return '#7a8a90'; // dry — muted
    if (pct < 50) return '#4fa3d1'; // damp
    if (pct < 90) return '#2980c0'; // wet
    return '#c86030'; // soaked — chill risk
  }
  function wetDesc(pct: number): string {
    return pct < 25 ? 'dry' : pct < 50 ? 'damp' : pct < 90 ? 'wet' : 'soaked';
  }
  function blockBar(value: number, width = 16): string {
    const filled = Math.max(0, Math.min(width, Math.round((value / 100) * width)));
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
  }
  function getBloodColor(pct: number): string {
    if (pct >= 70) return 'var(--pos)';
    if (pct >= 40) return '#c8a030';
    if (pct >= 20) return '#c86030';
    return 'var(--neg)';
  }
  function getStaminaColor(pct: number): string {
    if (pct >= 60) return '#38b8c8';
    if (pct >= 30) return '#c8a030';
    return '#c86030';
  }
  // Fun is INVERTED (100 = entertained). Only shown once it drops low (autohide); green→amber→red.
  const FUN_SHOW_BELOW = 12;
  function getFunColor(pct: number): string {
    if (pct >= 50) return 'var(--pos)';
    if (pct >= 20) return '#c8a030';
    return '#c86030';
  }
  function funDesc(pct: number): string {
    return pct < 5 ? 'starved for company' : pct < 12 ? 'restless' : 'content';
  }
</script>

<div class="needs-section">
  <div class="section-hdr">| NEEDS</div>

  <div class="need-row">
    <span class="lbl">HUNGER</span>
    <span class="block-bar" style="color: {getNeedColor(hungerPct)}">{blockBar(hungerPct)}</span>
    <span class="val" style="color: {getNeedColor(hungerPct)}">{Math.round(needs.hunger)}/100</span>
    <span class="desc">{getNeedDescription('hunger', needs.hunger)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">REST</span>
    <span class="block-bar" style="color: {getNeedColor(fatiguePct)}">{blockBar(fatiguePct)}</span>
    <span class="val" style="color: {getNeedColor(fatiguePct)}"
      >{Math.round(needs.fatigue)}/100</span
    >
    <span class="desc">{getNeedDescription('fatigue', needs.fatigue)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">THIRST</span>
    <span class="block-bar" style="color: {getNeedColor(thirstPct)}">{blockBar(thirstPct)}</span>
    <span class="val" style="color: {getNeedColor(thirstPct)}">{thirstPct}/100</span>
    <span class="desc">{getNeedDescription('thirst', thirstPct)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">HYGIENE</span>
    <span class="block-bar" style="color: {getNeedColor(hygienePct)}">{blockBar(hygienePct)}</span>
    <span class="val" style="color: {getNeedColor(hygienePct)}">{hygienePct}/100</span>
    <span class="desc">{getNeedDescription('hygiene', hygienePct)}</span>
  </div>

  {#if wetnessPct > 0}
    <div class="need-row">
      <span class="lbl">WETNESS</span>
      <span class="block-bar" style="color: {getWetColor(wetnessPct)}">{blockBar(wetnessPct)}</span>
      <span class="val" style="color: {getWetColor(wetnessPct)}">{wetnessPct}/100</span>
      <span class="desc">{wetDesc(wetnessPct)}</span>
    </div>
  {/if}

  {#if (needs.fun ?? 100) < FUN_SHOW_BELOW}
    {@const funPct = Math.round(needs.fun ?? 100)}
    <div class="need-row">
      <span class="lbl">FUN</span>
      <span class="block-bar" style="color: {getFunColor(funPct)}">{blockBar(funPct)}</span>
      <span class="val" style="color: {getFunColor(funPct)}">{funPct}/100</span>
      <span class="desc">{funDesc(funPct)}</span>
    </div>
  {/if}

  {#if needs.bloodHunger !== undefined}
    {@const bhPct = Math.round(needs.bloodHunger)}
    <div class="need-row">
      <span class="lbl">BLOODLUST</span>
      <span class="block-bar" style="color: {getNeedColor(bhPct)}">{blockBar(bhPct)}</span>
      <span class="val" style="color: {getNeedColor(bhPct)}">{bhPct}/100</span>
      <span class="desc"
        >{bhPct < 40 ? 'sated' : bhPct < 70 ? 'stirring' : bhPct < 100 ? 'ravenous' : 'frenzied'}</span
      >
    </div>
  {/if}

  {#if pawn.maxBloodVolume}
    {@const maxBV = pawn.maxBloodVolume}
    {@const curBV = pawn.bloodVolume ?? maxBV}
    {@const bloodPct = Math.round((curBV / maxBV) * 100)}
    {#if bloodPct < 100}
      <div class="need-row">
        <span class="lbl">BLOOD</span>
        <span class="block-bar" style="color: {getBloodColor(bloodPct)}">{blockBar(bloodPct)}</span>
        <span class="val" style="color: {getBloodColor(bloodPct)}">{Math.round(curBV)}/{maxBV}</span>
        <span class="desc"
          >{bloodPct >= 90
            ? 'healthy'
            : bloodPct >= 60
              ? 'low'
              : bloodPct >= 30
                ? 'critical'
                : 'near death'}</span
        >
      </div>
    {/if}
  {/if}

  {#if pawn.maxStamina !== undefined}
    {@const maxST = pawn.maxStamina}
    {@const curST = pawn.stamina ?? maxST}
    {@const stPct = Math.round((curST / maxST) * 100)}
    {#if stPct < 100}
      <div class="need-row">
        <span class="lbl">STAMINA</span>
        <span class="block-bar" style="color: {getStaminaColor(stPct)}">{blockBar(stPct)}</span>
        <span class="val" style="color: {getStaminaColor(stPct)}">{Math.round(curST)}/{maxST}</span>
        <span class="desc"
          >{stPct >= 80
            ? 'fresh'
            : stPct >= 50
              ? 'tired'
              : stPct >= 20
                ? 'winded'
                : 'exhausted'}</span
        >
      </div>
    {/if}
  {/if}

  <ConditionChips views={conditionViews} />

  <AwakeningMeters {pawn} />

  <!-- TODO: draft-control mode will re-enable direct REST/EAT/WORK/IDLE commands later.
  <div class="btn-row">
    <button class="act-btn">REST</button>
    <button class="act-btn">EAT</button>
    <button class="act-btn">WORK</button>
    <button class="act-btn">IDLE</button>
  </div>
  -->
</div>

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
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
    font-size: 12px;
    width: 70px;
    flex-shrink: 0;
  }
  .val {
    color: var(--text);
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
  }

  .block-bar {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
</style>
