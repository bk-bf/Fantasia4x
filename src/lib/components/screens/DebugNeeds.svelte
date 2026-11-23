<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import type { DisableableNeed } from '$lib/game/core/types';
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';

  const NEEDS: Array<{ key: DisableableNeed; label: string }> = [
    { key: 'hunger', label: 'Hunger' },
    { key: 'fatigue', label: 'Fatigue' },
    { key: 'thirst', label: 'Thirst' },
    { key: 'hygiene', label: 'Hygiene' },
    { key: 'wetness', label: 'Wetness' },
    { key: 'relaxation', label: 'Relaxation' },
    { key: 'comfort', label: 'Comfort' },
    { key: 'mobHunger', label: 'Creature hunger' }
  ];

  const needsOff = $derived($gameState._needsDisabled ?? {});
</script>

<h5>Needs frozen</h5>
<div class="two">
  {#each NEEDS as n (n.key)}
    <CheckBox
      checked={!!needsOff[n.key]}
      onchange={() =>
        gameState.command({
          type: 'devToggleNeed',
          payload: { need: n.key, off: !needsOff[n.key] },
          save: true
        })}>{n.label}</CheckBox
    >
  {/each}
</div>

<style>
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 10px;
  }
</style>
