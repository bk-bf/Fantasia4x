<!-- ConditionTooltip.svelte — the shared condition hover panel (name + severity, life-threatening warn,
     description, FROM sources, EFFECT modifiers). Extracted from ConditionChips so the health-tab
     condition chips AND the trait card's "＋ <condition>" pill render the IDENTICAL tooltip from a
     ConditionView. Presentation only — the caller supplies the positioned box (HoverTip). -->
<script lang="ts">
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  let { view }: { view: ConditionView } = $props();
</script>

<div class="tip-name" style="color: {view.color}">
  {view.name.toUpperCase()}
  {#if view.severityPct != null}
    <span class="tip-sev">· {view.severityPct}%{view.stageLabel ? ` ${view.stageLabel}` : ''}</span>
  {/if}
</div>
{#if view.lifeThreatening}
  <div class="tip-warn">⚠ life-threatening</div>
{/if}
<div class="tip-desc">{view.description}</div>
{#if view.sources.length > 0}
  <div class="tip-hdr">FROM</div>
  {#each view.sources as s}
    <div class="tip-row">• {s}</div>
  {/each}
{/if}
{#if view.effects.length > 0}
  <div class="tip-hdr">EFFECT</div>
  <div class="tip-row">{view.effects.join('  ·  ')}</div>
{/if}

<style>
  .tip-name {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tip-sev {
    color: var(--text-muted);
    font-weight: normal;
  }
  .tip-warn {
    color: var(--neg, #ff5252);
    font-size: 11px;
    margin-top: 1px;
  }
  .tip-desc {
    color: var(--text-muted);
    font-style: italic;
    margin: 3px 0;
  }
  .tip-hdr {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    color: var(--text);
    font-size: 11px;
  }
</style>
