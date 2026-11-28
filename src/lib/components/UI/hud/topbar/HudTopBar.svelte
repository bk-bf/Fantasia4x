<script lang="ts">
  import HudRail from './HudRail.svelte';
  import HudFlags from './HudFlags.svelte';

  let {
    mapGen = false,
    debug,
    left,
    right,
    under = $bindable(false)
  }: {
    mapGen?: boolean;
    debug: boolean;
    left: number;
    right: number;
    under?: boolean;
  } = $props();
</script>

<header class="top-bar">
  <HudRail {mapGen} />
  {#if !mapGen}<HudFlags {debug} {left} {right} bind:under />{/if}
</header>

<style>
  .top-bar {
    position: relative;
    height: 24px;
  }
</style>
