<script lang="ts">
  import './lairEffects.css';
  import type { ParticleOverlay } from '$lib/stores/fx/worldEffects';

  let { overlays, fxScale, amb }: { overlays: ParticleOverlay[]; fxScale: number; amb: number } =
    $props();
</script>

<div class="lair-effects">
  {#each overlays as overlay (overlay.id)}
    {@const xf = `transform: translate(${overlay.left}px, ${overlay.top}px) translateX(-50%) scale(${fxScale}); filter: brightness(${amb});`}
    {#if overlay.effect === 'smoke'}
      <div class="lair-fx lair-smoke" style={xf}>
        <span class="puff p1">▒</span>
        <span class="puff p2">░</span>
        <span class="puff p3">▒</span>
        <span class="puff p4">░</span>
        <span class="puff p5">▒</span>
        <span class="puff p6">░</span>
      </div>
    {:else if overlay.effect === 'bloodmist'}
      <div class="lair-fx lair-bloodmist" style={xf}>
        <span class="fog blood-a"></span>
        <span class="fog blood-b"></span>
      </div>
    {:else if overlay.effect === 'miasma'}
      <div class="lair-fx lair-miasma" style={xf}>
        <span class="fog miasma-a"></span>
        <span class="fog miasma-b"></span>
      </div>
    {:else if overlay.effect === 'flies'}
      <div class="lair-fx lair-flies" style={xf}>
        <span class="fly f1">·</span>
        <span class="fly f2">·</span>
        <span class="fly f3">·</span>
        <span class="fly f4">·</span>
        <span class="fly f5">·</span>
        <span class="fly f6">·</span>
      </div>
    {:else if overlay.effect === 'feathers'}
      <div class="lair-fx lair-feathers" style={xf}>
        <span class="feather fe1">'</span>
        <span class="feather fe2">`</span>
        <span class="feather fe3">'</span>
        <span class="feather fe4">,</span>
        <span class="feather fe5">`</span>
      </div>
    {/if}
  {/each}
</div>
