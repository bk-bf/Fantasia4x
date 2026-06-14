<!--
  HealthPanel — pop-up body-health readout for a selected pawn/mob (NT-U1). Mirrors
  BuildingFuelPanel: it floats above the info card and the parent owns the open/close toggle
  (passed as `open`) and the HEALTH button that flips it. Read-only — it just renders the
  HealthModel built in selectionCard.ts (blood + pain for the whole body, then every damaged limb
  with its bleed rate and injured sub-parts' HP + wounds, then conditions).
-->
<script lang="ts">
  import type { HealthModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { healthPctColor, bloodColor, painColor } from './healthColors';

  let { health, open = false }: { health: HealthModel | undefined; open?: boolean } = $props();

  const damaged = $derived(
    !!health &&
      (health.limbs.length > 0 ||
        health.conditions.length > 0 ||
        (health.pain ?? 0) > 0 ||
        (!!health.blood && health.blood.current < health.blood.max))
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="health-panel"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
>
  <div class="health-hdr">◈ HEALTH</div>
  {#if health}
    {#if health.blood}
      <div class="hp-row">
        <span class="hp-k">Blood</span>
        <span style="color:{bloodColor((health.blood.current / health.blood.max) * 100)}"
          >{Math.round(health.blood.current)}/{Math.round(health.blood.max)} ({Math.round(
            (health.blood.current / health.blood.max) * 100
          )}%)</span
        >
      </div>
    {/if}
    {#if (health.pain ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Pain</span>
        <span style="color:{painColor(health.pain ?? 0)}">{Math.round(health.pain ?? 0)}%</span>
      </div>
    {/if}
    {#if health.conditions.length > 0}
      <div class="hp-row hp-warn">
        <span class="hp-k">Status</span>
        <span>{health.conditions.map((c) => c.text).join(', ')}</span>
      </div>
    {/if}

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
              <span style="color:{healthPctColor(limb.health)}">{Math.round(limb.health)}%</span>
              {#if limb.bleedRate && limb.bleedRate > 0}
                <span class="hp-bleed">▼ {limb.bleedRate.toFixed(1)} blood/s</span>
              {/if}
            {/if}
          </div>
          {#each limb.parts as part (part.label)}
            <div class="hp-part">
              <span class="hp-part-name">{part.label}</span>
              <span
                class="hp-part-hp"
                style="color:{healthPctColor((part.health / part.maxHp) * 100)}"
                >{Math.round(part.health)}/{Math.round(part.maxHp)}</span
              >
              {#each part.wounds as w (w.text)}
                <span class="hp-wound" class:hp-warn={w.warn}>· {w.text}</span>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  /* Pop-up framing copied from BuildingFuelPanel so the two HUD pop-ups match. */
  .health-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 300px;
    box-sizing: border-box;
    opacity: 0;
    transform: translateY(6px);
    overflow-y: auto;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #c0a040;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    line-height: 1.5;
    z-index: 20;
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease;
  }
  .health-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 360px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .health-hdr {
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .hp-row {
    display: flex;
    gap: 6px;
  }
  .hp-k {
    color: #7a6030;
    display: inline-block;
    min-width: 42px;
  }
  .hp-ok {
    color: #68a030;
    padding-left: 2px;
  }
  .hp-limb {
    margin-top: 3px;
    border-top: 1px solid rgba(122, 94, 40, 0.4);
    padding-top: 2px;
  }
  .hp-limb-hdr {
    color: #d0a850;
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .hp-limb-name {
    color: #e0b860;
    min-width: 48px;
  }
  .hp-bleed {
    color: #ee8844;
  }
  .hp-part {
    padding-left: 10px;
    color: #a08840;
  }
  .hp-part-name {
    color: #b89850;
    text-transform: capitalize;
  }
  .hp-part-hp {
    color: #8a7036;
    margin-left: 4px;
  }
  .hp-wound {
    margin-left: 4px;
  }
  .hp-warn {
    color: #ee8844;
  }
</style>
