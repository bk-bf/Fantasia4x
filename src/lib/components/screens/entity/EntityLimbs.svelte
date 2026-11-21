<script lang="ts">
  import type { LimbState } from '$lib/game/core/types';
  import { limbLabel, partLabel } from '$lib/components/util/bodyLabels';
  import { woundById } from '$lib/game/core/defs/wounds';
  import { healthTone } from './entityHealth';

  let { limbs }: { limbs: LimbState[] } = $props();
</script>

<div class="limbs">
  {#each limbs as limb (limb.id)}
    <div class="limb">
      <div class="limb-h">
        <b>{limbLabel(limb.id)}</b>
        <span style:color={limb.isMissing ? 'var(--neg)' : healthTone(limb.health)}>
          {limb.isMissing ? 'missing' : `${Math.round(limb.health)}%`}
          {#if limb.bleedRate && limb.bleedRate > 0}<i class="bleed">▼{limb.bleedRate.toFixed(1)}</i
            >{/if}
        </span>
      </div>
      {#each limb.parts ?? [] as part (part.id)}
        {@const pct = (part.health / part.maxHp) * 100}
        <div
          class="part"
          class:damaged={part.isMissing || part.health < part.maxHp || part.injuries.length > 0}
        >
          <span class="pn">{partLabel(part.id)}</span>
          <span style:color={part.isMissing ? 'var(--neg)' : healthTone(pct)}>
            {part.isMissing ? 'missing' : `${Math.round(part.health)}/${part.maxHp}`}
          </span>
          {#each part.injuries as injury, i (i)}
            {@const name = woundById(injury.type)?.name ?? injury.type}
            <span class="wd" title="{injury.severity} {name}"
              >· {name.toLowerCase()} · {injury.severity}</span
            >
          {/each}
        </div>
      {/each}
    </div>
  {/each}
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
    opacity: 0.55;
  }
  .part.damaged {
    opacity: 1;
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
</style>
