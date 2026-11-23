<script lang="ts">
  import type { Snippet } from 'svelte';
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';

  let {
    checked,
    partial = false,
    indent = false,
    group = false,
    onchange,
    lead,
    children
  }: {
    checked: boolean;
    partial?: boolean;
    indent?: boolean;
    group?: boolean;
    onchange: () => void;
    lead?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="ifr" class:indent class:group>
  {@render lead?.()}
  <CheckBox {checked} {partial} {onchange}>{@render children()}</CheckBox>
</div>

<style>
  .ifr {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .indent {
    padding-left: 18px;
  }
  .ifr > :global(.chk) {
    flex: 1;
    min-width: 0;
  }
  .group :global(.chk span) {
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .ifr :global(.chk span b) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: normal;
  }
  .ifr :global(.chk span em) {
    margin-left: auto;
    font-style: normal;
    color: var(--text-dim);
    letter-spacing: 0.6px;
  }
</style>
