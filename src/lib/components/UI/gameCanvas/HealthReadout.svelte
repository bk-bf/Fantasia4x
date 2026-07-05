<!--
  HealthReadout — the shared body-health readout: a row of compact stat pills (blood, pain, cold/heat
  exposure + tolerance, combat-readiness — each with a hover breakdown), then every damaged limb with
  its bleed rate and injured sub-parts' HP + wounds. Pure presentation off a `HealthModel` (built by
  selectionCard.buildHealthModel).

  Used by BOTH the floating in-game info-card popup (HealthPanel — which wraps this in its pop-up
  chrome) and the Pawns-tab BODY section (PawnHealth), so the two read identically.
-->
<script lang="ts">
  import type { HealthModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { healthPctColor } from './healthColors';
  import StatPills from '$lib/components/UI/StatPills.svelte';

  let { health }: { health: HealthModel | undefined } = $props();

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
    <StatPills pills={health.pills ?? []} />

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
            <div class="hp-part" class:hp-gone={part.health <= 0 || part.missing}>
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
              {#each part.wounds as w (w.text)}
                <span class="hp-wound" class:hp-warn={w.warn}
                  >· {w.text}{#if w.treated}<span class="hp-treated" title="tended by a caretaker"
                      >+</span
                    >{/if}</span
                >
              {/each}
              {#if part.missing && part.wounds.length === 0}
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
  /* The readout carries the warm dark-panel palette so it reads identically in the floating popup and
     the Pawns-tab BODY section. */
  .health-readout {
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.5;
    color: #c0a040;
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
  /* A tended wound: a small green `+` after the wound text — at a glance, "a caretaker has treated this". */
  .hp-treated {
    color: #68a030;
    font-weight: bold;
    margin-left: 2px;
  }
  /* A destroyed sub-part (0 HP) is gone — grey the whole row so it reads as lost, not active. */
  .hp-gone,
  .hp-gone .hp-part-name,
  .hp-gone .hp-part-hp,
  .hp-gone .hp-wound,
  .hp-gone .hp-warn {
    color: var(--text-dim);
    opacity: 0.55;
  }
</style>
