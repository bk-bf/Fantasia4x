<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import KvRow from './KvRow.svelte';
  import type { ItemInfoView } from '$lib/components/util/itemInfo';

  let {
    info: h,
    x,
    y,
    pinned
  }: { info: ItemInfoView; x: number; y: number; pinned: boolean } = $props();
</script>

<HoverTip {x} {y} {pinned}>
  <h5>{h.name}</h5>
  {#if h.description}<p>{h.description}</p>{/if}
  {#if h.freshness}<KvRow label="Keeps">~{h.freshness}</KvRow>{/if}
  {#if h.condition != null}<KvRow label="Condition">{h.condition}</KvRow>{/if}
  {#if h.farming}
    <div class="tip-sep">Farming · {h.farming.crop}</div>
    {#each h.farming.rows as r (r.label)}
      <KvRow label={r.label}>{r.val}</KvRow>
    {/each}
  {/if}
  {#if h.craftedInto.length > 0}
    <div class="tip-sep">Crafts into</div>
    <p>{h.craftedInto.join(' · ')}</p>
  {/if}
  {#if h.buildsInto.length > 0}
    <div class="tip-sep">Builds</div>
    <p>{h.buildsInto.join(' · ')}</p>
  {/if}
  {#if h.craftedInto.length === 0 && h.buildsInto.length === 0}
    <p>Not used in any recipe.</p>
  {/if}
</HoverTip>
