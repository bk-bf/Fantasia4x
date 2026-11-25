<script lang="ts">
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import SearchBar from '$lib/components/UI/widget/SearchBar.svelte';
  import DebugField from './DebugField.svelte';

  let {
    filterTag = $bindable(),
    filterSeverity = $bindable(),
    search = $bindable(),
    autoscroll = $bindable(),
    wrap = $bindable(),
    severities,
    knownTags,
    shown,
    total,
    onclear
  }: {
    filterTag: string;
    filterSeverity: string;
    search: string;
    autoscroll: boolean;
    wrap: boolean;
    severities: readonly string[];
    knownTags: string[];
    shown: number;
    total: number;
    onclear: () => void;
  } = $props();
</script>

<div class="header">
  <DebugField>
    <select bind:value={filterTag} aria-label="Category filter">
      <option value="ALL">All kinds</option>
      {#each knownTags as t (t)}<option value={t}>{t}</option>{/each}
    </select>
  </DebugField>
  <DebugField>
    <select bind:value={filterSeverity} aria-label="Severity filter">
      {#each severities as s (s)}<option value={s}>{s === 'ALL' ? 'All levels' : s}</option>{/each}
    </select>
  </DebugField>
  <SearchBar variant="well" bind:value={search} />
  <ChromeButton on={autoscroll} onclick={() => (autoscroll = !autoscroll)}>Follow</ChromeButton>
  <ChromeButton on={wrap} onclick={() => (wrap = !wrap)}>Wrap</ChromeButton>
  <ChromeButton onclick={onclear}>Clear</ChromeButton>
  <span class="count">{shown} of {total}</span>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    flex-shrink: 0;
    padding: 0 0 6px;
  }
  .header > :global(.field) {
    width: 150px;
  }
  .count {
    margin-left: auto;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
  }
</style>
