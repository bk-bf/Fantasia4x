<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { getPawnTaskSummary } from '$lib/components/util/pawnUtils';
  import { stateColor, stateLabel, needBar } from '$lib/utils/workUtils';
  import type { Pawn } from '$lib/game/core/types';
  import PawnAttributes from '$lib/components/pawn/PawnAttributes.svelte';

  interface Props {
    pawn: Pawn;
    /** Work category whose related stats should be soft-highlighted in the attributes grid. */
    highlightCategory?: string | null;
  }
  let { pawn, highlightCategory = null }: Props = $props();

  let taskSummary = $derived(getPawnTaskSummary(pawn, $gameState));
</script>

<div class="section-hdr">| {pawn.name.toUpperCase()} — PAWN DETAIL</div>
<div class="detail-row">
  <span class="lbl">ACTIVITY</span>
  <span style="color:{stateColor(pawn)}">{stateLabel(pawn)}</span>
</div>
<div class="detail-row">
  <span class="lbl">TASK</span>
  <span class="sval">{taskSummary?.currentTask ?? 'idle'}</span>
</div>
<div class="detail-row">
  <span class="lbl">NEXT</span>
  <span class="sval">{taskSummary?.nextTask ?? 'no work'}</span>
</div>
<div class="need-row">
  <span class="lbl">HUNGER</span>
  <span class="bar-ascii">{needBar(pawn.needs.hunger)}</span>
  <span class="val" class:neg={pawn.needs.hunger > 70}>{Math.round(pawn.needs.hunger)}%</span>
</div>
<div class="need-row">
  <span class="lbl">FATIGUE</span>
  <span class="bar-ascii">{needBar(pawn.needs.fatigue)}</span>
  <span class="val" class:neg={pawn.needs.fatigue > 70}>{Math.round(pawn.needs.fatigue)}%</span>
</div>
<div class="need-row">
  <span class="lbl">THIRST</span>
  <span class="bar-ascii">{needBar(pawn.needs.thirst ?? 0)}</span>
  <span class="val" class:neg={(pawn.needs.thirst ?? 0) > 70}
    >{Math.round(pawn.needs.thirst ?? 0)}%</span
  >
</div>
<div class="need-row">
  <span class="lbl">HYGIENE</span>
  <span class="bar-ascii">{needBar(pawn.needs.hygiene ?? 0)}</span>
  <span class="val" class:neg={(pawn.needs.hygiene ?? 0) > 70}
    >{Math.round(pawn.needs.hygiene ?? 0)}%</span
  >
</div>
<div class="section-hdr sub">| ATTRIBUTES</div>
<PawnAttributes {pawn} {highlightCategory} />

<style>
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
  }
  .detail-row {
    display: flex;
    padding: 2px 8px;
    gap: 8px;
    align-items: baseline;
    font-size: 11px;
    font-family: var(--font-mono);
  }
  .need-row {
    display: flex;
    align-items: center;
    padding: 2px 8px;
    gap: 6px;
    font-family: var(--font-mono);
  }
  .lbl {
    color: var(--text-dim);
    font-size: 11px;
    width: 60px;
    flex-shrink: 0;
  }
  .bar-ascii {
    font-size: 11px;
    color: var(--accent);
    letter-spacing: -1px;
  }
  .val {
    font-size: 11px;
  }
  .val.neg {
    color: #f44;
  }
  .sval {
    color: var(--text);
  }
</style>
