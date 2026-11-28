<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    muted = false,
    children
  }: { label: string; muted?: boolean; children: Snippet } = $props();
</script>

<div class="kv" class:muted>
  <em>{label}</em>
  <span>{@render children()}</span>
</div>

<style>
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  em {
    flex: none;
    font-style: normal;
  }
  span {
    text-align: right;
  }
  .muted,
  .muted span {
    color: var(--text-muted);
  }
</style>
