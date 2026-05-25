<script lang="ts">
  import GameCanvas from '$lib/components/UI/GameCanvas.svelte';
</script>

<div class="map-wrap">
  <GameCanvas />
</div>

<style>
  .map-wrap {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #09070380;
  }
</style>
