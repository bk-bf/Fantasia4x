<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { GameState } from '$lib/game/core/types';
  import {
    getMoodColor,
    getMoodDescription,
    getHealthColor,
    getHealthDescription,
    getPawnTaskSummary
  } from '$lib/components/util/pawnUtils';
  import { pawnService } from '$lib/game/services/PawnService';
  import { effectiveMood } from '$lib/game/core/Social';
  import { sizeFromHeight } from '$lib/game/core/Culture';
  import {
    getBackgroundById,
    describeBackgroundEffects,
    type Background
  } from '$lib/game/core/Backgrounds';
  import HoverTip from '$lib/components/UI/HoverTip.svelte';
  import PawnStance from './PawnStance.svelte';
  import PawnRestPolicy from './PawnRestPolicy.svelte';
  import PawnForceWork from './PawnForceWork.svelte';
  import PawnGrowthPanel from './PawnGrowthPanel.svelte';
  import { DAYS_PER_SEASON } from '$lib/game/services/EnvironmentService';

  export let pawn: Pawn;
  export let gameState: GameState;

  // PAWN-GROWTH: name the pawn's fixed birthday (season + day within it) for the AGE row's tooltip.
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  $: birthdayLabel =
    pawn.birthDayOfYear != null
      ? `born ${SEASONS[Math.floor(pawn.birthDayOfYear / DAYS_PER_SEASON)]} day ${
          (pawn.birthDayOfYear % DAYS_PER_SEASON) + 1
        }`
      : '';

  $: taskSummary = getPawnTaskSummary(pawn, gameState);
  $: moveSpeed = pawnService.getMoveSpeed(pawn);
  // Culture overhaul: surface the pawn's culture + archetype (colonies are mixed now).
  $: culture = gameState.culturePool?.find((r) => r.id === pawn.cultureId);
  $: cultureLabel = pawn.cultureName
    ? `${pawn.cultureName}${culture?.archetype ? ` · ${culture.archetype}` : ''}`
    : 'unknown';
  // BACKGROUNDS: homeland + life story. Home kingdom name (or "no fixed homeland" for the stateless).
  $: homeKingdom = pawn.homeKingdomId
    ? gameState.kingdoms?.find((k) => k.id === pawn.homeKingdomId)
    : undefined;
  $: originLabel = pawn.homeKingdomId
    ? (homeKingdom?.name ?? 'a distant land')
    : 'no fixed homeland';
  $: childhood = getBackgroundById(pawn.childhoodId);
  $: adulthood = getBackgroundById(pawn.adulthoodId);
  // Background hover tooltip (custom HoverTip — native `title` doesn't show reliably in the app shell):
  // the immersive flavour + what the background shaped, following the cursor.
  let bgTip: { x: number; y: number; bg: Background } | null = null;
  function bgEnter(e: MouseEvent, bg: Background | undefined) {
    if (bg) bgTip = { x: e.clientX, y: e.clientY, bg };
  }
  function bgMove(e: MouseEvent) {
    if (bgTip) bgTip = { ...bgTip, x: e.clientX, y: e.clientY };
  }
  function bgLeave() {
    bgTip = null;
  }

  function stateColor(state: string | undefined): string {
    const normalized = (state ?? 'Idle').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    switch (normalized) {
      case 'working':
      case 'moving_to_resource':
      case 'moving_to_deposit':
      case 'moving_to_need':
        return '#4a9';
      case 'hungry':
      case 'eating':
        return '#f44';
      case 'tired':
      case 'sleeping':
        return '#fa0';
      default:
        return 'var(--text-muted)';
    }
  }
</script>

<!-- Pawn Overview -->
<div class="pawn-overview">
  <div class="section-hdr">| STATUS</div>

  <!-- PAWN-GROWTH: pending growth offer(s) surface here for the pick-two. -->
  <PawnGrowthPanel {pawn} />

  <div class="row">
    <span class="lbl">CULTURE</span>
    <span class="val culture-val" title={culture?.lore?.epithet ?? ''}>{cultureLabel}</span>
  </div>
  {#if pawn.childhoodId}
    <div class="row">
      <span class="lbl">ORIGIN</span>
      <span class="val" title={homeKingdom?.lore?.epithet ?? ''}>{originLabel}</span>
    </div>
    <div
      class="row"
      role="note"
      on:mouseenter={(e) => bgEnter(e, childhood)}
      on:mousemove={bgMove}
      on:mouseleave={bgLeave}
    >
      <span class="lbl">CHILDHOOD</span>
      <span class="val bg-val">{childhood?.title ?? '—'}</span>
    </div>
    {#if pawn.adulthoodId}
      <div
        class="row"
        role="note"
        on:mouseenter={(e) => bgEnter(e, adulthood)}
        on:mousemove={bgMove}
        on:mouseleave={bgLeave}
      >
        <span class="lbl">ADULTHOOD</span>
        <span class="val bg-val">{adulthood?.title ?? '—'}</span>
      </div>
    {:else}
      <div class="row">
        <span class="lbl">ADULTHOOD</span>
        <span class="val dim-val">still young</span>
      </div>
    {/if}
  {/if}
  {#if pawn.age != null}
    <div class="row">
      <span class="lbl">AGE</span><span class="val" title={birthdayLabel}>{pawn.age} yrs</span>
    </div>
  {/if}
  {#if pawn.sex}
    <div class="row">
      <span class="lbl">SEX</span><span class="val"
        >{pawn.sex === 'male' ? '♂ Male' : '♀ Female'}</span
      >
    </div>
  {/if}
  <div class="row">
    <span class="lbl">STATE</span>
    <span class="val" style="color: {stateColor(pawn.currentState)}"
      >{taskSummary.currentState}</span
    >
  </div>
  <PawnStance {pawn} />
  <PawnRestPolicy {pawn} />
  <PawnForceWork {pawn} />
  <div class="row">
    <span class="lbl">WORK</span><span class="val">{taskSummary.workAssignment}</span>
  </div>
  <div class="row">
    <span class="lbl">TASK</span><span class="val">{taskSummary.currentTask}</span>
  </div>
  <div class="row">
    <span class="lbl">NEXT</span><span class="val">{taskSummary.nextTask}</span>
  </div>
  <div class="row">
    <span class="lbl">SPEED</span>
    <span class="val" title={moveSpeed.sources.join('  ')}
      >{moveSpeed.tilesPerSecond.toFixed(1)} t/s</span
    >
  </div>
  <div class="row">
    <span class="lbl">HEIGHT</span><span class="val">{pawn.physicalTraits.height}cm</span>
  </div>
  <div class="row">
    <span class="lbl">WEIGHT</span><span class="val">{pawn.physicalTraits.weight}kg</span>
  </div>
  <div class="row">
    <span class="lbl">SIZE</span><span class="val"
      >{sizeFromHeight(pawn.physicalTraits.height)}</span
    >
  </div>
  <!-- SOCIAL-LAYER §7: the EFFECTIVE mood (ambient drift + event moods like grief or a hot meal). -->
  <div class="row">
    <span class="lbl">MOOD</span>
    <span class="val" style="color: {getMoodColor(effectiveMood(pawn, gameState.turn))}"
      >{Math.round(effectiveMood(pawn, gameState.turn))}% — {getMoodDescription(
        effectiveMood(pawn, gameState.turn)
      )}</span
    >
  </div>
  {#if pawn.socialBreak}
    <div class="row">
      <span class="lbl">STATE</span>
      <span class="val" style="color: #ee8844"
        >{pawn.socialBreak.kind === 'crisis'
          ? 'past the breaking point'
          : 'refusing work for a while'}</span
      >
    </div>
  {/if}
  <div class="row">
    <span class="lbl">HEALTH</span>
    <span class="val" style="color: {getHealthColor(pawn.state.health ?? 100)}"
      >{Math.round(pawn.state.health ?? 100)}% — {getHealthDescription(
        pawn.state.health ?? 100
      )}</span
    >
  </div>
</div>

{#if bgTip}
  <HoverTip x={bgTip.x} y={bgTip.y}>
    <div class="bgtip-title">{bgTip.bg.title}</div>
    <div class="bgtip-flavor">{bgTip.bg.description}</div>
    {@const effects = describeBackgroundEffects(bgTip.bg)}
    {#if effects.length > 0}
      <div class="bgtip-shapes">
        <div class="bgtip-shapes-hdr">Shapes</div>
        {#each effects as line}
          <div class="bgtip-effect">· {line}</div>
        {/each}
      </div>
    {/if}
  </HoverTip>
{/if}

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
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
    white-space: nowrap;
    min-width: 80px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    margin-left: auto;
    text-align: right;
  }
  .culture-val {
    color: var(--accent-hi);
    font-weight: bold;
    letter-spacing: 0.03em;
  }
  .dim-val {
    color: var(--text-muted);
    font-style: italic;
  }
  .bg-val {
    cursor: help;
  }
  .bgtip-title {
    color: var(--accent-hi);
    font-weight: bold;
    letter-spacing: 0.04em;
    margin-bottom: 3px;
  }
  .bgtip-flavor {
    color: var(--text-dim);
    font-style: italic;
    line-height: 1.4;
  }
  .bgtip-shapes {
    margin-top: 6px;
    border-top: 1px solid var(--border);
    padding-top: 4px;
  }
  .bgtip-shapes-hdr {
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10px;
    margin-bottom: 2px;
  }
  .bgtip-effect {
    color: var(--text);
    line-height: 1.45;
  }
</style>
