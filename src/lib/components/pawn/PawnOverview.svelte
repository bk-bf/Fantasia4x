<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { GameState } from '$lib/game/core/types';
  import { getPawnTaskSummary, pawnCultureLabel } from '$lib/components/util/pawnUtils';
  import { sizeFromHeight } from '$lib/game/core/rules/body/size';
  import {
    getBackgroundById,
    describeBackgroundEffects,
    type Background
  } from '$lib/game/core/defs/backgrounds';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import PawnStance from './PawnStance.svelte';
  import PawnRestPolicy from './PawnRestPolicy.svelte';
  import PawnMedicinePolicy from './PawnMedicinePolicy.svelte';
  import PawnAdminister from './PawnAdminister.svelte';
  import PawnForceWork from './PawnForceWork.svelte';
  import PawnGrowthPanel from './PawnGrowthPanel.svelte';
  import {
    DAYS_PER_SEASON,
    SEASON_IDS,
    SEASON_LABELS
  } from '$lib/game/services/EnvironmentService';

  export let pawn: Pawn;
  export let gameState: GameState;

  $: birthdayLabel =
    pawn.birthDayOfYear != null
      ? `born ${
          SEASON_LABELS[
            SEASON_IDS[Math.floor(pawn.birthDayOfYear / DAYS_PER_SEASON) % SEASON_IDS.length]
          ]
        } day ${(pawn.birthDayOfYear % DAYS_PER_SEASON) + 1}`
      : '';

  $: taskSummary = getPawnTaskSummary(pawn, gameState);
  $: culture = gameState.culturePool?.find((r) => r.id === pawn.cultureId);
  $: cultureLabel = pawnCultureLabel(pawn, gameState.culturePool);
  $: homeKingdom = pawn.homeKingdomId
    ? gameState.kingdoms?.find((k) => k.id === pawn.homeKingdomId)
    : undefined;
  $: originLabel = pawn.homeKingdomId
    ? (homeKingdom?.name ?? 'a distant land')
    : 'no fixed homeland';
  $: childhood = getBackgroundById(pawn.childhoodId);
  $: adulthood = getBackgroundById(pawn.adulthoodId);
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
        return 'var(--pos)';
      case 'hungry':
      case 'eating':
        return 'var(--neg)';
      case 'tired':
      case 'sleeping':
        return 'var(--ember)';
      default:
        return 'var(--text-muted)';
    }
  }
</script>

<div class="pawn-overview">
  <PawnGrowthPanel {pawn} />

  <div class="row">
    <span class="lbl">Culture</span>
    <span class="val culture-val" title={culture?.lore?.epithet ?? ''}>{cultureLabel}</span>
  </div>
  {#if pawn.childhoodId}
    <div class="row">
      <span class="lbl">Origin</span>
      <span class="val" title={homeKingdom?.lore?.epithet ?? ''}>{originLabel}</span>
    </div>
    <div
      class="row"
      role="note"
      on:mouseenter={(e) => bgEnter(e, childhood)}
      on:mousemove={bgMove}
      on:mouseleave={bgLeave}
    >
      <span class="lbl">Childhood</span>
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
        <span class="lbl">Adulthood</span>
        <span class="val bg-val">{adulthood?.title ?? '—'}</span>
      </div>
    {:else}
      <div class="row">
        <span class="lbl">Adulthood</span>
        <span class="val dim-val">still young</span>
      </div>
    {/if}
  {/if}
  {#if pawn.age != null}
    <div class="row">
      <span class="lbl">Age</span><span class="val" title={birthdayLabel}>{pawn.age} yrs</span>
    </div>
  {/if}
  {#if pawn.sex}
    <div class="row">
      <span class="lbl">Sex</span><span class="val"
        >{pawn.sex === 'male' ? '♂ Male' : '♀ Female'}</span
      >
    </div>
  {/if}
  <div class="row">
    <span class="lbl">Build</span><span class="val"
      >{sizeFromHeight(pawn.physicalTraits.height)} · {pawn.physicalTraits.height} cm · {pawn
        .physicalTraits.weight} kg</span
    >
  </div>
  <div class="row">
    <span class="lbl">State</span>
    <span class="val" style="color: {stateColor(pawn.currentState)}"
      >{taskSummary.currentState}</span
    >
  </div>
  <PawnStance {pawn} />
  <PawnRestPolicy {pawn} />
  <PawnMedicinePolicy {pawn} />
  <PawnAdminister {pawn} />
  <PawnForceWork {pawn} />
  {#if pawn.socialBreak}
    <div class="row">
      <span class="lbl">State</span>
      <span class="val" style="color: var(--ember)"
        >{pawn.socialBreak.kind === 'crisis'
          ? 'past the breaking point'
          : 'refusing work for a while'}</span
      >
    </div>
  {/if}
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
  .pawn-overview {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    min-height: 18px;
  }
  .lbl {
    color: var(--text);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .val {
    color: var(--text);
    text-align: right;
  }
  .culture-val {
    color: var(--accent-hi);
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
