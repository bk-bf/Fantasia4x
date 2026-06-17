<script lang="ts">
  import type { GameState, Pawn } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/utils/pawnUtils';
  import ConditionChips from './ConditionChips.svelte';

  export let pawn: Pawn;
  export let gameState: GameState;

  $: needs = pawn.needs;
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

  <div class="need-row">
    <span class="lbl">WETNESS</span>
    <span class="block-bar" style="color: {getWetColor(wetnessPct)}">{blockBar(wetnessPct)}</span>
    <span class="val" style="color: {getWetColor(wetnessPct)}">{wetnessPct}/100</span>
    <span class="desc">{wetDesc(wetnessPct)}</span>
  </div>

  {#if pawn.maxBloodVolume}
    {@const maxBV = pawn.maxBloodVolume}
    {@const curBV = pawn.bloodVolume ?? maxBV}
    {@const bloodPct = Math.round((curBV / maxBV) * 100)}
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

  {#if pawn.maxStamina !== undefined}
    {@const maxST = pawn.maxStamina}
    {@const curST = pawn.stamina ?? maxST}
    {@const stPct = Math.round((curST / maxST) * 100)}
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

  <ConditionChips {pawn} />

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
    font-size: 11px;
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
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }
  .val {
    color: var(--text);
    font-size: 11px;
    min-width: 36px;
    text-align: right;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
    white-space: nowrap;
  }

  .block-bar {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
</style>
