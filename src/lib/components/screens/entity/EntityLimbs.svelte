<script lang="ts">
  import type { LimbState } from '$lib/game/core/types';
  import { hurtLimbs } from '$lib/components/UI/canvas/selectionCard';
  import { healthTone, wholeLimbsLine } from './entityHealth';

  let { limbs }: { limbs: LimbState[] } = $props();

  const hurt = $derived(hurtLimbs(limbs));
  const whole = $derived(wholeLimbsLine(limbs, new Set(hurt.map((l) => l.id))));
</script>

<div class="limbs">
  {#each hurt as limb (limb.id)}
    <div class="limb">
      <div class="limb-h">
        <b>{limb.label}</b>
        <span style:color={limb.missing ? 'var(--neg)' : healthTone(limb.health)}>
          {limb.missing ? 'missing' : `${Math.round(limb.health)}%`}
          {#if limb.bleedRate && limb.bleedRate > 0}<i class="bleed">▼{limb.bleedRate.toFixed(1)}</i
            >{/if}
        </span>
      </div>
      {#each limb.parts as part (part.label)}
        <div class="part">
          <span class="pn">{part.label}</span>
          <span
            style:color={part.missing ? 'var(--neg)' : healthTone((part.health / part.maxHp) * 100)}
          >
            {part.missing ? 'missing' : `${Math.round(part.health)}/${Math.round(part.maxHp)}`}
          </span>
          {#each part.wounds as w (w.text)}
            <span class="wd" class:treated={w.treated}>· {w.text.toLowerCase()}</span>
          {/each}
        </div>
      {/each}
    </div>
  {/each}
  {#if whole}<p class="rest">{whole}</p>{/if}
</div>

<style>
  .limbs {
    flex: 1;
    columns: 2;
    column-gap: 24px;
  }
  .limb {
    break-inside: avoid;
    margin: 0 0 3px;
  }
  .limb-h {
    display: flex;
    justify-content: space-between;
  }
  b {
    font-weight: normal;
    color: var(--text);
  }
  .bleed {
    font-style: normal;
    color: var(--neg);
  }
  .part {
    display: flex;
    gap: 8px;
    padding-left: 10px;
    color: var(--text-dim);
  }
  .pn {
    flex: none;
    width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wd {
    color: var(--accent-hi);
    white-space: nowrap;
  }
  .wd.treated {
    color: var(--text-dim);
  }
  .rest {
    break-inside: avoid;
    margin: 3px 0 0;
    color: var(--text-muted);
  }
</style>
