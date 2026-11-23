<script lang="ts">
  import type { ProjectileOverlay } from '$lib/stores/fx/worldEffects';

  let { overlays }: { overlays: ProjectileOverlay[] } = $props();
</script>

{#each overlays as o (o.id)}
  {#if o.progress < 1}
    <div
      class="projectile fx-{o.effect}"
      style="transform: translate({o.left}px, {o.top}px) rotate({o.angle}deg);"
    >
      <span class="proj-trail"></span>
      <span class="proj-head"></span>
    </div>
  {:else}
    <div class="proj-impact-wrap" style="transform: translate({o.left}px, {o.top}px);">
      <div class="proj-impact fx-{o.effect}"></div>
    </div>
  {/if}
{/each}

<style>
  .projectile {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    will-change: transform;
  }
  .proj-trail {
    position: absolute;
    left: 0;
    top: -1px;
    height: 2px;
    width: 16px;
    transform: translateX(-100%);
    border-radius: 1px;
    background: linear-gradient(to right, transparent, var(--proj-color, #d8d4c8));
    opacity: 0.85;
  }
  .proj-head {
    position: absolute;
    left: -1.5px;
    top: -1.5px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--proj-color, #f0ead8);
    box-shadow: 0 0 3px var(--proj-color, #d8d4c8);
  }
  .fx-arrow {
    --proj-color: #d9d4c4;
  }
  .fx-bolt {
    --proj-color: #c8ccd4;
  }
  .fx-stone {
    --proj-color: #b6a98c;
  }
  .fx-spear {
    --proj-color: #cdbf9a;
  }
  .fx-fireball {
    --proj-color: #ff7a2a;
  }
  .fx-frostbolt {
    --proj-color: #8fd6ff;
  }
  .fx-spark {
    --proj-color: #ffe45e;
  }
  .fx-fireball .proj-head,
  .fx-frostbolt .proj-head,
  .fx-spark .proj-head {
    width: 5px;
    height: 5px;
    left: -2.5px;
    top: -2.5px;
    box-shadow: 0 0 6px var(--proj-color);
  }
  .fx-fireball .proj-trail,
  .fx-frostbolt .proj-trail,
  .fx-spark .proj-trail {
    width: 14px;
    height: 3px;
    top: -1.5px;
    opacity: 0.9;
  }
  .fx-stone .proj-trail {
    width: 9px;
    opacity: 0.5;
  }
  .fx-stone .proj-head {
    width: 4px;
    height: 4px;
    left: -2px;
    top: -2px;
  }
  .fx-spear .proj-trail {
    width: 22px;
    height: 3px;
    top: -1.5px;
  }
  .fx-bolt .proj-trail {
    width: 18px;
  }
  .proj-impact-wrap {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .proj-impact {
    position: absolute;
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    pointer-events: none;
    border-radius: 50%;
    background: radial-gradient(circle, var(--proj-color, #d8d4c8) 0%, transparent 70%);
    animation: proj-impact 180ms ease-out forwards;
  }
  @keyframes proj-impact {
    from {
      transform: scale(0.5);
      opacity: 0.9;
    }
    to {
      transform: scale(1.9);
      opacity: 0;
    }
  }
</style>
