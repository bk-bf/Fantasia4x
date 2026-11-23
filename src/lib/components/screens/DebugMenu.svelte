<script lang="ts">
  import Well from '$lib/components/UI/widget/Well.svelte';
  import AudioNowPlaying from '$lib/components/UI/audio/AudioNowPlaying.svelte';
  import DebugSpawn from './DebugSpawn.svelte';
  import DebugGodmode from './DebugGodmode.svelte';
  import DebugWorld from './DebugWorld.svelte';
  import DebugScenario from './DebugScenario.svelte';
  import DebugEvents from './DebugEvents.svelte';
  import DebugNeeds from './DebugNeeds.svelte';
</script>

<div class="dbg">
  <Well title="Spawn" scroll>
    <DebugSpawn />
    <DebugGodmode />
  </Well>
  <Well title="World" scroll>
    <DebugWorld />
    <DebugScenario />
  </Well>
  <Well title="Events and brushes" scroll>
    <DebugEvents />
    <DebugNeeds />
    <AudioNowPlaying />
  </Well>
</div>

<style>
  .dbg {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .dbg :global(.well-scroll) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dbg :global(.well-scroll > *) {
    flex: none;
  }
  .dbg :global(.minis) {
    display: flex;
    gap: 4px;
    min-width: 0;
  }
  .dbg :global(.minis > *) {
    flex: 1;
    min-width: 0;
  }
  .dbg :global(.minis > .field) {
    flex: 2;
  }
</style>
