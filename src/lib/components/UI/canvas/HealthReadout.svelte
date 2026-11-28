<script lang="ts">
  import type { HealthModel } from '$lib/components/UI/hud/entityCard';
  import { healthPctColor } from './healthColors';
  import StatPills from '$lib/components/UI/widget/StatPills.svelte';

  let { health, pills = true }: { health: HealthModel | undefined; pills?: boolean } = $props();

  const damaged = $derived(
    !!health &&
      (health.limbs.length > 0 ||
        (health.pain ?? 0) > 0 ||
        (health.coldExposure ?? 0) > 0 ||
        (health.heatExposure ?? 0) > 0 ||
        (!!health.blood && health.blood.current < health.blood.max))
  );
</script>

{#if health}
  <div class="health-readout">
    {#if pills}<StatPills pills={health.pills ?? []} />{/if}

    {#if !damaged}
      <div class="hp-ok">no damage</div>
    {:else}
      {#each health.limbs as limb (limb.label)}
        <div class="hp-limb">
          <div class="hp-limb-hdr">
            <span class="hp-limb-name">{limb.label}</span>
            {#if limb.missing}
              <span style="color:{healthPctColor(0, { missing: true })}">missing</span>
            {:else}
              <span style="color:{healthPctColor(limb.health)}">{Math.ceil(limb.health)}%</span>
              {#if limb.bleedRate && limb.bleedRate > 0}
                <span class="hp-bleed">▼ {limb.bleedRate.toFixed(1)} blood/s</span>
              {/if}
            {/if}
          </div>
          {#each limb.parts as part (part.label)}
            {@const gone = part.health <= 0 || part.missing}
            <div class="hp-part" class:hp-gone={gone}>
              <span class="hp-part-name">{part.label}</span>
              <span
                class="hp-part-hp"
                style="color:{healthPctColor((part.health / part.maxHp) * 100, {
                  missing: part.missing
                })}">{Math.ceil(part.health)}/{Math.round(part.maxHp)}</span
              >
              {#if part.bleedRate && part.bleedRate > 0}
                <span class="hp-bleed" title="this sub-part's bleed"
                  >▼ {part.bleedRate.toFixed(1)}</span
                >
              {/if}
              {#if !gone}
                {#each part.wounds as w (w.text)}
                  <span class="hp-wound" class:hp-warn={w.warn}
                    >· {w.text}{#if w.treated}<span class="hp-treated" title="tended by a caretaker"
                        >+</span
                      >{/if}</span
                  >
                {/each}
              {:else}
                <span class="hp-wound">· gone</span>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .health-readout {
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  .hp-ok {
    color: var(--pos);
    margin-top: 4px;
  }
  .hp-limb {
    margin-top: 4px;
  }
  .hp-limb-hdr {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .hp-limb-name {
    flex: 1;
    color: var(--text);
  }
  .hp-bleed {
    color: var(--ember);
  }
  .hp-part {
    display: flex;
    gap: 8px;
    padding-left: 10px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .hp-part-name {
    min-width: 76px;
    color: var(--text-dim);
    text-transform: capitalize;
  }
  .hp-wound {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hp-warn {
    color: var(--ember);
  }
  .hp-treated {
    color: var(--pos);
    margin-left: 2px;
  }
  .hp-gone,
  .hp-gone .hp-part-name,
  .hp-gone .hp-part-hp,
  .hp-gone .hp-wound,
  .hp-gone .hp-warn {
    color: var(--text-muted);
    opacity: 0.7;
  }
</style>
