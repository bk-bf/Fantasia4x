<!--
  DebugLogControls — header bar for DebugLogScreen: category/severity/text filters,
  autoscroll toggle, clear, and a shown/total counter. Pure view; all filter state is
  bound back to the parent.
-->
<script lang="ts">
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
  <span class="title">DEBUG LOG</span>
  <select class="sel" bind:value={filterTag} aria-label="Category filter">
    <option value="ALL">cat:ALL</option>
    {#each knownTags as t (t)}<option value={t}>{t}</option>{/each}
  </select>
  <select class="sel" bind:value={filterSeverity} aria-label="Severity filter">
    {#each severities as s}<option value={s}>{s === 'ALL' ? 'sev:ALL' : s}</option>{/each}
  </select>
  <input class="search" type="text" placeholder="search…" bind:value={search} />
  <button class="btn" class:on={autoscroll} onclick={() => (autoscroll = !autoscroll)}>
    {autoscroll ? 'scroll■' : 'scroll□'}
  </button>
  <button class="btn" class:on={wrap} onclick={() => (wrap = !wrap)}>
    {wrap ? 'wrap■' : 'wrap□'}
  </button>
  <button class="btn" onclick={onclear}>clear</button>
  <span class="count">{shown}/{total}</span>
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 0.4em;
    flex-wrap: wrap;
    padding: 4px 6px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }
  .title {
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.1em;
    margin-right: auto;
  }
  .sel,
  .search,
  .btn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: inherit;
    font-size: 11px;
    padding: 2px 5px;
    cursor: pointer;
    outline: none;
  }
  .sel:focus,
  .search:focus {
    border-color: var(--border-hi);
  }
  .search {
    width: 9em;
    cursor: text;
  }
  .btn:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .btn.on {
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .count {
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
</style>
