<script lang="ts">
  import { picture } from '$lib/pixelArt/picture';
  import { iconArt } from '$lib/pixelArt/fx/icons';
  import { conditionIcon } from '$lib/components/UI/canvas/worldFx/conditionIcons';

  let { id }: { id: string } = $props();

  const look = $derived(conditionIcon(id));
  const art = $derived(look ? iconArt(look.id, look.mark) : null);
</script>

{#if art}
  <i class="condition-icon" aria-hidden="true" {@attach picture(art)}></i>
{/if}

<style>
  .condition-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    vertical-align: middle;
  }
  .condition-icon :global(img) {
    filter: url(#ambient-tint-data);
  }
  :global(:root[data-theme='vellum']) .condition-icon :global(img) {
    filter: url(#ambient-tint-lit);
  }
</style>
