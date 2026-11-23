<script lang="ts">
  import { filterClipboard } from '$lib/stores/filterClipboard.js';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import SearchBar from '$lib/components/UI/widget/SearchBar.svelte';

  let {
    query = $bindable(''),
    anyExpanded,
    toggleCollapseAll,
    copyFilter,
    pasteFilter
  }: {
    query?: string;
    anyExpanded: boolean;
    toggleCollapseAll: () => void;
    copyFilter: () => void;
    pasteFilter: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ifc-toolbar" onkeydown={(e) => e.stopPropagation()}>
  <SearchBar bind:value={query} variant="well" />
  <ChromeButton
    mini
    glyph={anyExpanded ? 'left' : 'right'}
    title={anyExpanded ? 'Close every group' : 'Open every group'}
    label={anyExpanded ? 'Close every group' : 'Open every group'}
    onclick={toggleCollapseAll}
  />
  <ChromeButton title="Copy this list" onclick={copyFilter}>Copy</ChromeButton>
  <ChromeButton
    title="Paste a copied list"
    disabled={$filterClipboard === null}
    onclick={pasteFilter}>Paste</ChromeButton
  >
</div>

<style>
  .ifc-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-bottom: 3px;
  }
  .ifc-toolbar :global(.search-bar.well) {
    flex: 1;
    width: auto;
    min-width: 0;
  }
</style>
