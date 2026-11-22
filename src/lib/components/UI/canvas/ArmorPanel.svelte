<script lang="ts">
  import type { ArmorModel } from '$lib/components/UI/hud/SelectedEntityCard.svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import MeterRow from '../widget/MeterRow.svelte';
  import ScrollArea from '../widget/ScrollArea.svelte';
  import Well from '../widget/Well.svelte';

  let { armor, open = false }: { armor: ArmorModel | undefined; open?: boolean } = $props();

  const scale = $derived(
    Math.max(30, ...(armor?.limbs ?? []).flatMap((l) => l.parts.map((p) => p.armor)))
  );
</script>

{#if open && armor}
  <div
    class="armor-panel"
    role="presentation"
    onmousedown={(e) => e.stopPropagation()}
    onmouseup={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    {@attach chrome('card')}
  >
    <Well title="Hide">
      <ScrollArea class="armor-list">
        {#each armor.limbs as limb (limb.label)}
          <h5>{limb.label}</h5>
          {#each limb.parts as part (part.label)}
            <MeterRow
              wide
              label={part.label}
              value={part.armor / scale}
              ramp={part.weak ? 'ember' : 'water'}>{part.armor}</MeterRow
            >
          {/each}
        {/each}
      </ScrollArea>
    </Well>
  </div>
{/if}

<style>
  .armor-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 344px;
    box-sizing: border-box;
    padding: 9px 10px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    z-index: 20;
  }
  .armor-panel :global(.armor-list) {
    max-height: 320px;
  }
</style>
