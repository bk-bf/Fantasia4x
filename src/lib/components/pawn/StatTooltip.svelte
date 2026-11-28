<script lang="ts">
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import type { StatView } from '$lib/components/util/statView';
  let { view }: { view: StatView } = $props();
</script>

<h5>{view.name} · {view.value}{view.unit}</h5>
<p>{view.description}</p>
<KvRow label="Usual">{view.base}{view.unit}</KvRow>
{#each view.vars as vv (vv.name)}
  <KvRow label={vv.name}>{vv.value}</KvRow>
{/each}
{#each view.traitMods as m, i (m.name + i)}
  <KvRow label={m.name}>{m.text}</KvRow>
{/each}
