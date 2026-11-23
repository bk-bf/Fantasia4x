<script lang="ts">
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';
  import {
    getMapGenerator,
    setMapGenerator,
    type MapGenerator
  } from '$lib/game/world/mapGenerator';

  let { onchange }: { onchange: () => void } = $props();

  let value = $state<MapGenerator>(getMapGenerator());

  const OPTIONS: { id: MapGenerator; label: string; title: string }[] = [
    { id: 'classic', label: 'Old', title: 'the land as it has always been laid' },
    { id: 'landforms', label: 'New', title: 'mountain ranges, lakes and rivers' }
  ];

  function pick(next: MapGenerator) {
    value = next;
    setMapGenerator(next);
    onchange();
  }
</script>

<SegmentedRow label="Lay of the land" options={OPTIONS} {value} onSelect={pick} />
