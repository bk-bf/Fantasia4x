<script lang="ts">
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import type { ConditionView } from '$lib/components/util/conditionInfo';
  let { view }: { view: ConditionView } = $props();

  const split = (line: string): [string, string] => {
    const m = line.match(/^(.*?)\s([+−-]\d.*)$/);
    return m ? [m[1], m[2]] : [line, ''];
  };
</script>

<h5>
  {view.name}{#if view.severityPct != null}&nbsp;· {view.severityPct}%{/if}
</h5>
<p>{view.description}</p>
{#if view.stageLabel}
  <KvRow label="Stage">{view.stageLabel}</KvRow>
{/if}
{#if view.lifeThreatening}
  <KvRow label="Danger"><span class="grave">to life</span></KvRow>
{/if}
{#if view.sources.length > 0}
  <KvRow label="From">{view.sources.join(', ')}</KvRow>
{/if}
{#if view.trigger}
  <KvRow label="When">{view.trigger}</KvRow>
{/if}
{#each view.effects as line (line)}
  {@const [k, v] = split(line)}
  <KvRow label={k}>{v}</KvRow>
{/each}

<style>
  .grave {
    color: var(--neg);
  }
</style>
