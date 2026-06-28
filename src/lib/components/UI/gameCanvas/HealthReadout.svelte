<!--
  HealthReadout — the shared body-health readout: blood (+ bleed-out ETA), cold/heat exposure, pain,
  combat-readiness stats, then every damaged limb with its bleed rate and injured sub-parts' HP +
  wounds. Pure presentation off a `HealthModel` (built by selectionCard.buildHealthModel).

  Used by BOTH the floating in-game info-card popup (HealthPanel — which wraps this in its pop-up
  chrome) and the Pawns-tab BODY section (PawnHealth), so the two read identically.
-->
<script lang="ts">
  import type { HealthModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { healthPctColor, bloodColor, painColor } from './healthColors';
  import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';

  let { health }: { health: HealthModel | undefined } = $props();

  // bleedRate is blood/REAL-second; 1 in-game day = TURNS_PER_DAY real seconds → 24 in-game hours.
  // So in-game hours to bleed out = (blood ÷ bleedRate) × 24 / TURNS_PER_DAY.
  const HOURS_PER_BLOODSEC = 24 / TURNS_PER_DAY;
  function bleedOutLabel(blood: number, bleedRate: number): string {
    const h = (blood / bleedRate) * HOURS_PER_BLOODSEC;
    return h >= 10 ? `(~${Math.round(h)}h to 0)` : `(~${h.toFixed(1)}h to 0)`;
  }

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
    {#if health.blood}
      <div class="hp-row">
        <span class="hp-k">Blood</span>
        <span style="color:{bloodColor((health.blood.current / health.blood.max) * 100)}"
          >{Math.round(health.blood.current)}/{Math.round(health.blood.max)} ({Math.round(
            (health.blood.current / health.blood.max) * 100
          )}%)</span
        >
        {#if health.bleedRate}
          <span
            class="hp-bleed-eta"
            title="estimated in-game time until blood reaches 0 at the current bleed rate"
            >▼ {health.bleedRate.toFixed(1)}/s · {bleedOutLabel(
              health.blood.current,
              health.bleedRate
            )}</span
          >
        {/if}
      </div>
    {/if}
    {#if (health.coldExposure ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Cold</span>
        <span style="color:#4fc3f7">{Math.round(health.coldExposure ?? 0)}%</span>
      </div>
    {/if}
    {#if (health.heatExposure ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Heat</span>
        <span style="color:#fb8c00">{Math.round(health.heatExposure ?? 0)}%</span>
      </div>
    {/if}
    {#if health.tempTolerance}
      <div
        class="hp-row"
        title="The cold-exposure meter starts rising below this temperature (comfort band widened by cold resistance from constitution + worn gear)."
      >
        <span class="hp-k">Cold tol</span>
        <span style="color:#4fc3f7">≤ {Math.round(health.tempTolerance.coldOnset)}°C</span>
        <span class="tol-sub"
          >comfort {Math.round(health.tempTolerance.comfortMin)}° · +{Math.round(
            health.tempTolerance.coldDeg
          )}° res</span
        >
      </div>
      <div
        class="hp-row"
        title="The heat-exposure meter starts rising above this temperature (comfort band widened by heat resistance from constitution + worn gear)."
      >
        <span class="hp-k">Heat tol</span>
        <span style="color:#fb8c00">≥ {Math.round(health.tempTolerance.heatOnset)}°C</span>
        <span class="tol-sub"
          >comfort {Math.round(health.tempTolerance.comfortMax)}° · +{Math.round(
            health.tempTolerance.heatDeg
          )}° res</span
        >
      </div>
    {/if}
    {#if (health.pain ?? 0) > 0}
      <div class="hp-row">
        <span class="hp-k">Pain</span>
        <span style="color:{painColor(health.pain ?? 0)}">{Math.round(health.pain ?? 0)}%</span>
      </div>
    {/if}
    {#if health.combat && health.combat.length > 0}
      <div class="hp-combat">
        {#each health.combat as c (c.label)}
          <span class="hp-combat-item" title={c.title}>
            <span class="hp-k-inline">{c.label}</span>
            <span class="hp-combat-v">{c.value}</span>
          </span>
        {/each}
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
    font-size: 9px;
    line-height: 1.5;
    color: #c0a040;
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
  /* Combat readiness sits with blood/pain in the summary block, set off by a faint rule.
     Hit / Dodge / Crit share one row. */
  .hp-combat {
    margin-top: 3px;
    padding-top: 2px;
    border-top: 1px solid rgba(122, 94, 40, 0.4);
    display: flex;
    flex-wrap: wrap; /* wrap the readiness stats within the column instead of bleeding past its edge */
    gap: 2px 14px;
  }
  .hp-combat-item {
    display: inline-flex;
    gap: 5px;
    align-items: baseline;
  }
  .hp-k-inline {
    color: #7a6030;
  }
  .hp-combat-v {
    color: #d0a850;
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
  .hp-bleed-eta {
    color: #ee5544;
    white-space: nowrap;
  }
  /* Muted breakdown beside a cold/heat tolerance: the comfort base + resistance degrees. */
  .tol-sub {
    color: var(--text-dim);
    opacity: 0.7;
    font-size: 0.85em;
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
