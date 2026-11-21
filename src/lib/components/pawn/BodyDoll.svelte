<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { limbLabel } from '$lib/components/util/bodyLabels';
  import { healthPctColor } from '$lib/components/UI/canvas/healthColors';

  let { pawn }: { pawn: Pawn } = $props();

  const AREA: Record<string, string> = {
    head: 'head',
    torso: 'torso',
    left_arm: 'la',
    right_arm: 'ra',
    left_leg: 'll',
    right_leg: 'rl'
  };

  const limbs = $derived((pawn.limbs ?? []).filter((l) => AREA[l.id]));
</script>

<div class="doll" aria-hidden="true">
  {#each limbs as l (l.id)}
    <i
      class={AREA[l.id]}
      class:gone={l.isMissing}
      title="{limbLabel(l.id)} {Math.ceil(l.health)}%"
      style:--hp={healthPctColor(l.health, { missing: l.isMissing })}
    ></i>
  {/each}
</div>

<style>
  .doll {
    position: relative;
    width: 72px;
    height: 132px;
  }
  i {
    position: absolute;
    display: block;
    background: color-mix(in srgb, var(--hp) 70%, var(--bg));
    box-shadow: inset 0 0 0 1px var(--border-hi);
  }
  .head {
    left: 26px;
    top: 0;
    width: 20px;
    height: 22px;
  }
  .torso {
    left: 22px;
    top: 24px;
    width: 28px;
    height: 50px;
  }
  .la {
    left: 10px;
    top: 24px;
    width: 10px;
    height: 48px;
  }
  .ra {
    left: 52px;
    top: 24px;
    width: 10px;
    height: 48px;
  }
  .ll {
    left: 22px;
    top: 76px;
    width: 13px;
    height: 56px;
  }
  .rl {
    left: 37px;
    top: 76px;
    width: 13px;
    height: 56px;
  }
  .gone {
    background: none;
    box-shadow: inset 0 0 0 1px var(--text-muted);
    opacity: 0.5;
  }
</style>
