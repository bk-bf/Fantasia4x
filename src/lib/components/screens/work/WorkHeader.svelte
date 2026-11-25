<script lang="ts">
  import type { Col } from './workGrid';

  let {
    columns,
    expanded,
    template,
    selectedColumn = $bindable(null),
    ontoggle
  }: {
    columns: Col[];
    expanded: string[];
    template: string;
    selectedColumn?: string | null;
    ontoggle: (catId: string) => void;
  } = $props();
</script>

<div class="head" style:grid-template-columns={template}>
  <span class="who">Worker</span>
  {#each columns as col (col.kind === 'cat' ? col.catId : col.subId)}
    <button
      class="jh"
      class:sub={col.kind === 'sub'}
      class:sel={selectedColumn === col.catId}
      data-title={col.kind === 'cat' ? col.name : col.label}
      onclick={() => (selectedColumn = selectedColumn === col.catId ? null : col.catId)}
      oncontextmenu={(e) => {
        e.preventDefault();
        if (col.kind === 'sub' || col.splittable) ontoggle(col.catId);
      }}
      >{col.abbr}{#if col.kind === 'cat' && col.splittable}<i
          >{expanded.includes(col.catId) ? '▾' : '▸'}</i
        >{/if}</button
    >
  {/each}
  <span class="st">Doing</span>
</div>

<style>
  .head {
    display: grid;
    align-items: center;
    text-align: center;
    height: 20px;
    color: var(--accent-hi);
    letter-spacing: 1.4px;
    cursor: default;
  }
  .who {
    padding-left: 8px;
    text-align: left;
  }
  .st {
    padding-right: 8px;
    text-align: right;
  }
  .jh {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: 16px/20px var(--font-pixel);
    letter-spacing: 1px;
    cursor: pointer;
  }
  .jh.sub {
    color: var(--text-muted);
  }
  .jh.sel {
    color: var(--ember);
    background: color-mix(in srgb, var(--accent-hi) 18%, transparent);
  }
  .jh i {
    font-style: normal;
    font-size: 10px;
    opacity: 0.7;
  }
</style>
