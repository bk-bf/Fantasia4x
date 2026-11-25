<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Item, ZonePriority } from '$lib/game/core/types';
  import ItemFilterChecklist from './ItemFilterChecklist.svelte';
  import { PRIORITY_OPTIONS } from './storePriority';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import SegmentedRow from '../widget/SegmentedRow.svelte';
  import Pane from '../widget/Pane.svelte';

  let {
    priority,
    onpriority,
    stock,
    note,
    heading,
    items,
    allowed,
    onChange,
    ondefaults,
    onall,
    onnone,
    children
  }: {
    priority?: ZonePriority;
    onpriority?: (p: ZonePriority) => void;
    stock?: Record<string, number>;
    note?: string;
    heading: string;
    items: Item[];
    allowed: Set<string>;
    onChange: (ids: string[]) => void;
    ondefaults?: () => void;
    onall: () => void;
    onnone: () => void;
    children?: Snippet;
  } = $props();
</script>

<Pane fill>
  {#if priority && onpriority}
    <SegmentedRow
      label="Fill first"
      options={PRIORITY_OPTIONS}
      value={priority}
      onSelect={onpriority}
    />
  {/if}
  {#if note}<p class="sub">{note}</p>{/if}
  {@render children?.()}
  <h5>{heading}</h5>
  <ItemFilterChecklist {items} {allowed} {onChange} {stock} icons fill />
  <div class="minis">
    {#if ondefaults}<ChromeButton onclick={ondefaults}>Defaults</ChromeButton>{/if}
    <ChromeButton onclick={onall}>All</ChromeButton>
    <ChromeButton onclick={onnone}>None</ChromeButton>
  </div>
</Pane>
